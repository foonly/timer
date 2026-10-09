package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

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
	if err := db.RunMigrations(ctx, pool, migrations.FS); err != nil {
		t.Fatal(err)
	}
	return NewHandler(pool), pool
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
