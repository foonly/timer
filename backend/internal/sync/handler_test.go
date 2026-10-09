package sync

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// These are integration tests against a real Postgres: set TEST_DATABASE_URL to a disposable
// database (its users/sessions/events tables are dropped and recreated), e.g.
//
//	docker run --rm -d -p 55432:5432 -e POSTGRES_PASSWORD=test postgres:16-alpine
//	TEST_DATABASE_URL=postgres://postgres:test@localhost:55432/postgres?sslmode=disable go test ./...
func setupDB(t *testing.T) (*pgxpool.Pool, uuid.UUID) {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	schema, err := os.ReadFile("../../migrations/000001_init.up.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "DROP TABLE IF EXISTS events, sessions, users CASCADE"); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, string(schema)); err != nil {
		t.Fatal(err)
	}

	var userID uuid.UUID
	if err := pool.QueryRow(ctx,
		"INSERT INTO users (email, password_hash) VALUES ('a@example.com', 'x') RETURNING id",
	).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	return pool, userID
}

func tagRemovedEvent() incomingEvent {
	tag := uuid.New()
	return incomingEvent{
		ID:        uuid.New(),
		Type:      EventTagRemoved,
		EntityID:  tag,
		DeviceID:  "test",
		Timestamp: time.Now().UnixMilli(),
		Payload:   json.RawMessage(fmt.Sprintf(`{"uuid":%q}`, tag)),
	}
}

func push(h *Handler, userID uuid.UUID, events ...incomingEvent) *httptest.ResponseRecorder {
	body, _ := json.Marshal(pushRequest{Events: events})
	req := httptest.NewRequest(http.MethodPost, "/api/sync/push", bytes.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), userIDKey, userID))
	rec := httptest.NewRecorder()
	h.Push(rec, req)
	return rec
}

func pull(t *testing.T, h *Handler, userID uuid.UUID, since int64) pullResponse {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/sync/pull?since=%d", since), nil)
	req = req.WithContext(context.WithValue(req.Context(), userIDKey, userID))
	rec := httptest.NewRecorder()
	h.Pull(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("pull: status %d: %s", rec.Code, rec.Body)
	}
	var res pullResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	return res
}

func TestPushThenPullIsOrderedAndIdempotent(t *testing.T) {
	pool, userID := setupDB(t)
	h := NewHandler(pool)

	a, b := tagRemovedEvent(), tagRemovedEvent()
	if rec := push(h, userID, a, b); rec.Code != http.StatusOK {
		t.Fatalf("push: status %d: %s", rec.Code, rec.Body)
	}
	// A retried push of the same events must not create duplicates.
	rec := push(h, userID, a, b)
	var res pushResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &res)
	if res.Accepted != 0 {
		t.Fatalf("re-push accepted %d events, want 0", res.Accepted)
	}

	got := pull(t, h, userID, 0)
	if len(got.Events) != 2 || got.Events[0].ID != a.ID || got.Events[1].ID != b.ID {
		t.Fatalf("pull returned %+v, want [a, b]", got.Events)
	}
	if got.Events[0].Seq >= got.Events[1].Seq {
		t.Fatalf("seqs not ascending: %d, %d", got.Events[0].Seq, got.Events[1].Seq)
	}
}

// A push must not be assigned seqs while another push for the same user is still uncommitted -
// otherwise the two can become visible out of seq order and a pull in between skips one forever.
// Simulates the in-flight push by holding the user's push lock in an open transaction.
func TestPushWaitsForInFlightPushOfSameUser(t *testing.T) {
	pool, userID := setupDB(t)
	h := NewHandler(pool)
	ctx := context.Background()

	inFlight, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer inFlight.Rollback(ctx)
	if _, err := inFlight.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", pushLockKey(userID)); err != nil {
		t.Fatal(err)
	}

	done := make(chan *httptest.ResponseRecorder, 1)
	go func() { done <- push(h, userID, tagRemovedEvent()) }()

	select {
	case rec := <-done:
		t.Fatalf("push completed (status %d) while another push for the user was in flight", rec.Code)
	case <-time.After(300 * time.Millisecond):
	}

	// Meanwhile nothing from the blocked push may be visible yet.
	if got := pull(t, h, userID, 0); len(got.Events) != 0 {
		t.Fatalf("pull saw %d events from a push that should still be blocked", len(got.Events))
	}

	if err := inFlight.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	select {
	case rec := <-done:
		if rec.Code != http.StatusOK {
			t.Fatalf("push: status %d: %s", rec.Code, rec.Body)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("push still blocked after the in-flight push committed")
	}
}

func TestPushDoesNotWaitForOtherUsers(t *testing.T) {
	pool, userID := setupDB(t)
	h := NewHandler(pool)
	ctx := context.Background()

	var otherID uuid.UUID
	if err := pool.QueryRow(ctx,
		"INSERT INTO users (email, password_hash) VALUES ('b@example.com', 'x') RETURNING id",
	).Scan(&otherID); err != nil {
		t.Fatal(err)
	}

	inFlight, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer inFlight.Rollback(ctx)
	if _, err := inFlight.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", pushLockKey(otherID)); err != nil {
		t.Fatal(err)
	}

	done := make(chan *httptest.ResponseRecorder, 1)
	go func() { done <- push(h, userID, tagRemovedEvent()) }()
	select {
	case rec := <-done:
		if rec.Code != http.StatusOK {
			t.Fatalf("push: status %d: %s", rec.Code, rec.Body)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("push blocked on another user's in-flight push")
	}
}
