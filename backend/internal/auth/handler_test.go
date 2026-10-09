package auth

import (
	"context"
	"encoding/json"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/username/timer/backend/internal/db"
	"github.com/username/timer/backend/migrations"
)

func TestValidateSignup(t *testing.T) {
	cases := []struct {
		name, email, password string
		wantErr               bool
	}{
		{"valid", "a@example.com", "password", false},
		{"missing email", "", "password", true},
		{"missing password", "a@example.com", "", true},
		{"no @", "example.com", "password", true},
		{"email too long", strings.Repeat("a", 250) + "@x.com", "password", true},
		{"password too short", "a@example.com", "short", true},
		{"8 multi-byte runes is long enough", "a@example.com", "ääääääää", false},
		{"72 bytes is allowed", "a@example.com", strings.Repeat("a", 72), false},
		{"73 bytes is too long", "a@example.com", strings.Repeat("a", 73), true},
		{"multi-byte runes count as bytes for the max", "a@example.com", strings.Repeat("ä", 37), true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := validateSignup(credentialsRequest{Email: c.email, Password: c.password})
			if (got != "") != c.wantErr {
				t.Fatalf("validateSignup = %q, wantErr %v", got, c.wantErr)
			}
		})
	}
}

// Integration tests against a real Postgres - set TEST_DATABASE_URL to a disposable database (see
// internal/sync/handler_test.go). Each test gets its own fresh, fully migrated schema.
func setupHandler(t *testing.T) (*Handler, *pgxpool.Pool) {
	t.Helper()
	pool := setupSchema(t)
	if err := db.RunMigrations(context.Background(), pool, migrations.FS); err != nil {
		t.Fatal(err)
	}
	return NewHandler(pool), pool
}

// setupSchema returns a pool on a fresh, empty schema (no migrations applied).
func setupSchema(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()

	schema := "auth_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	admin, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(admin.Close)
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = admin.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE") })

	config, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	config.ConnConfig.RuntimeParams["search_path"] = schema
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func signup(h *Handler, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/api/auth/signup", strings.NewReader(body))
	rec := httptest.NewRecorder()
	h.Signup(rec, req)
	return rec
}

func TestSignupDuplicateEmailIsConflict(t *testing.T) {
	h, _ := setupHandler(t)
	body := `{"email":"a@example.com","password":"password"}`
	if rec := signup(h, body); rec.Code != http.StatusCreated {
		t.Fatalf("first signup: status %d: %s", rec.Code, rec.Body)
	}
	if rec := signup(h, body); rec.Code != http.StatusConflict {
		t.Fatalf("duplicate signup: status %d, want 409", rec.Code)
	}
}

// Any other database failure must surface as a server error, not be misreported as a duplicate.
func TestSignupOtherDatabaseErrorIsServerError(t *testing.T) {
	h, pool := setupHandler(t)
	if _, err := pool.Exec(context.Background(),
		"ALTER TABLE users ADD CONSTRAINT reject_all CHECK (false) NOT VALID"); err != nil {
		t.Fatal(err)
	}
	if rec := signup(h, `{"email":"a@example.com","password":"password"}`); rec.Code != http.StatusInternalServerError {
		t.Fatalf("status %d, want 500: %s", rec.Code, rec.Body)
	}
}

func TestSignupRejectsInvalidInput(t *testing.T) {
	h, _ := setupHandler(t)
	rec := signup(h, `{"email":"a@example.com","password":"short"}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status %d, want 400", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "at least 8 characters") {
		t.Fatalf("body = %q, want the reason", rec.Body)
	}
}

func login(h *Handler, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(body))
	rec := httptest.NewRecorder()
	h.Login(rec, req)
	return rec
}

func TestEmailsAreCaseInsensitive(t *testing.T) {
	h, pool := setupHandler(t)
	if rec := signup(h, `{"email":"  Niklas@Example.COM ","password":"password"}`); rec.Code != http.StatusCreated {
		t.Fatalf("signup: status %d: %s", rec.Code, rec.Body)
	}

	var stored string
	if err := pool.QueryRow(context.Background(), "SELECT email FROM users").Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored != "niklas@example.com" {
		t.Fatalf("stored email = %q, want lowercased and trimmed", stored)
	}

	if rec := login(h, `{"email":"NIKLAS@example.com ","password":"password"}`); rec.Code != http.StatusOK {
		t.Fatalf("login with different case: status %d: %s", rec.Code, rec.Body)
	}
	if rec := signup(h, `{"email":"niklas@EXAMPLE.com","password":"password"}`); rec.Code != http.StatusConflict {
		t.Fatalf("case-variant signup: status %d, want 409", rec.Code)
	}
}

func TestLoginErrors(t *testing.T) {
	h, pool := setupHandler(t)
	if rec := signup(h, `{"email":"a@example.com","password":"password"}`); rec.Code != http.StatusCreated {
		t.Fatalf("signup: status %d: %s", rec.Code, rec.Body)
	}

	if rec := login(h, `{"email":"a@example.com","password":"wrong-password"}`); rec.Code != http.StatusUnauthorized {
		t.Fatalf("wrong password: status %d, want 401", rec.Code)
	}
	if rec := login(h, `{"email":"nobody@example.com","password":"password"}`); rec.Code != http.StatusUnauthorized {
		t.Fatalf("unknown email: status %d, want 401", rec.Code)
	}

	// A database failure must not be reported as bad credentials.
	if _, err := pool.Exec(context.Background(), "ALTER TABLE users RENAME TO users_gone"); err != nil {
		t.Fatal(err)
	}
	if rec := login(h, `{"email":"a@example.com","password":"password"}`); rec.Code != http.StatusInternalServerError {
		t.Fatalf("database error: status %d, want 500: %s", rec.Code, rec.Body)
	}
}

// authenticatedUser runs a request carrying `token` through SessionMiddleware and returns the
// user it resolved to, if any.
func authenticatedUser(pool *pgxpool.Pool, token string) (uuid.UUID, bool) {
	var userID uuid.UUID
	var ok bool
	handler := SessionMiddleware(pool)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID, ok = r.Context().Value(userIDKey).(uuid.UUID)
	}))
	req := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	handler.ServeHTTP(httptest.NewRecorder(), req)
	return userID, ok
}

func TestSessionTokensAreStoredHashed(t *testing.T) {
	h, pool := setupHandler(t)
	ctx := context.Background()
	rec := signup(h, `{"email":"a@example.com","password":"password"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("signup: status %d: %s", rec.Code, rec.Body)
	}
	var session sessionResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &session); err != nil {
		t.Fatal(err)
	}

	var stored string
	if err := pool.QueryRow(ctx, "SELECT token_hash FROM sessions").Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored == session.Token || strings.Contains(stored, session.Token) {
		t.Fatal("raw token stored in the database")
	}
	if stored != hashToken(session.Token) {
		t.Fatalf("stored %q, want hashToken(token)", stored)
	}

	if _, ok := authenticatedUser(pool, session.Token); !ok {
		t.Fatal("token did not authenticate")
	}
	// Presenting the stored hash itself must not work - that's the point of hashing.
	if _, ok := authenticatedUser(pool, stored); ok {
		t.Fatal("the stored hash authenticated as a token")
	}

	req := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	req.Header.Set("Authorization", "Bearer "+session.Token)
	h.Logout(httptest.NewRecorder(), req)
	if _, ok := authenticatedUser(pool, session.Token); ok {
		t.Fatal("token still authenticates after logout")
	}
}

// A session created before migration 000003 (raw token stored) must keep working after it - this
// also checks that the migration's SQL hashing matches hashToken byte for byte.
func TestExistingSessionsSurviveTokenHashingMigration(t *testing.T) {
	pool := setupSchema(t)
	ctx := context.Background()

	before := fstest.MapFS{}
	for _, name := range []string{"000001_init.up.sql", "000002_normalize_emails.up.sql"} {
		data, err := fs.ReadFile(migrations.FS, name)
		if err != nil {
			t.Fatal(err)
		}
		before[name] = &fstest.MapFile{Data: data}
	}
	if err := db.RunMigrations(ctx, pool, before); err != nil {
		t.Fatal(err)
	}
	var userID uuid.UUID
	if err := pool.QueryRow(ctx,
		"INSERT INTO users (email, password_hash) VALUES ('a@example.com', 'x') RETURNING id",
	).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	token := generateToken()
	if _, err := pool.Exec(ctx,
		"INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, now() + interval '1 day')",
		token, userID); err != nil {
		t.Fatal(err)
	}

	if err := db.RunMigrations(ctx, pool, migrations.FS); err != nil {
		t.Fatal(err)
	}
	got, ok := authenticatedUser(pool, token)
	if !ok || got != userID {
		t.Fatalf("pre-migration token resolved to (%v, %v), want (%v, true)", got, ok, userID)
	}
}

func TestLoginFailuresArePerEmailLimited(t *testing.T) {
	h, _ := setupHandler(t)
	if rec := signup(h, `{"email":"a@example.com","password":"password"}`); rec.Code != http.StatusCreated {
		t.Fatalf("signup: status %d: %s", rec.Code, rec.Body)
	}

	for i := range maxFailuresPerEmail {
		// Case variants count against the same account.
		email := "a@example.com"
		if i%2 == 1 {
			email = "A@Example.com"
		}
		if rec := login(h, `{"email":"`+email+`","password":"wrong-password"}`); rec.Code != http.StatusUnauthorized {
			t.Fatalf("failure %d: status %d, want 401", i+1, rec.Code)
		}
	}
	// Locked out now - even with the right password.
	if rec := login(h, `{"email":"a@example.com","password":"password"}`); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("status %d, want 429", rec.Code)
	}
	// Other accounts are unaffected.
	if rec := signup(h, `{"email":"b@example.com","password":"password"}`); rec.Code != http.StatusCreated {
		t.Fatalf("signup b: status %d", rec.Code)
	}
	if rec := login(h, `{"email":"b@example.com","password":"password"}`); rec.Code != http.StatusOK {
		t.Fatalf("login b: status %d, want 200", rec.Code)
	}
}

// Unknown emails hit the same limit as wrong passwords, so the response doesn't reveal which
// emails are registered.
func TestUnknownEmailFailuresAreLimitedToo(t *testing.T) {
	h, _ := setupHandler(t)
	for range maxFailuresPerEmail {
		login(h, `{"email":"nobody@example.com","password":"password"}`)
	}
	if rec := login(h, `{"email":"nobody@example.com","password":"password"}`); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("status %d, want 429", rec.Code)
	}
}
