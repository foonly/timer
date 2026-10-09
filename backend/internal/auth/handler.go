package auth

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"github.com/username/timer/backend/internal/models"
)

// sessionDuration is intentionally long ("long-lasting login"): a session is
// only invalidated by explicit logout or by going unused for this long, via
// the sliding refresh in SessionMiddleware.
const sessionDuration = 90 * 24 * time.Hour

type Handler struct {
	DB *pgxpool.Pool
}

func NewHandler(db *pgxpool.Pool) *Handler {
	return &Handler{DB: db}
}

type credentialsRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type sessionResponse struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expiresAt"`
}

func (h *Handler) Signup(w http.ResponseWriter, r *http.Request) {
	var req credentialsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	req.Email = strings.TrimSpace(req.Email)
	if msg := validateSignup(req); msg != "" {
		http.Error(w, msg, http.StatusBadRequest)
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		log.Printf("signup: hashing password: %v", err)
		http.Error(w, "Server error", http.StatusInternalServerError)
		return
	}

	var userID uuid.UUID
	err = h.DB.QueryRow(r.Context(),
		// lower() in SQL rather than strings.ToLower, so it can't disagree with the
		// users_email_normalized CHECK constraint's own lower() on non-ASCII characters.
		"INSERT INTO users (email, password_hash) VALUES (lower($1), $2) RETURNING id",
		req.Email, string(hash)).Scan(&userID)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == uniqueViolation {
			http.Error(w, "Email already exists", http.StatusConflict)
			return
		}
		log.Printf("signup: inserting user: %v", err)
		http.Error(w, "Server error", http.StatusInternalServerError)
		return
	}

	h.createSession(w, r, userID, http.StatusCreated)
}

// uniqueViolation is Postgres' SQLSTATE for a unique constraint violation.
const uniqueViolation = "23505"

const (
	minPasswordLength = 8
	// bcrypt only uses the first 72 bytes of a password and GenerateFromPassword rejects anything
	// longer, so cap it up front with a clear message instead of a 500.
	maxPasswordBytes = 72
	// The longest an address can be in practice (RFC 5321 path limit).
	maxEmailLength = 254
)

// validateSignup returns a user-facing reason the signup request is invalid, or "" if it's fine.
// Only applied at signup, so existing accounts with older, shorter passwords can still log in.
func validateSignup(req credentialsRequest) string {
	switch {
	case req.Email == "" || req.Password == "":
		return "Email and password are required"
	case len(req.Email) > maxEmailLength || !strings.Contains(req.Email, "@"):
		return "Please enter a valid email address"
	case utf8.RuneCountInString(req.Password) < minPasswordLength:
		return fmt.Sprintf("Password must be at least %d characters", minPasswordLength)
	case len(req.Password) > maxPasswordBytes:
		return fmt.Sprintf("Password must be at most %d bytes", maxPasswordBytes)
	}
	return ""
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req credentialsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	var userID uuid.UUID
	var hash string
	err := h.DB.QueryRow(r.Context(),
		"SELECT id, password_hash FROM users WHERE email = lower($1)", strings.TrimSpace(req.Email)).
		Scan(&userID, &hash)
	if errors.Is(err, pgx.ErrNoRows) {
		// Same generic message as a bad password, to avoid leaking whether an email is registered.
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}
	if err != nil {
		log.Printf("login: looking up user: %v", err)
		http.Error(w, "Server error", http.StatusInternalServerError)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)); err != nil {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	h.createSession(w, r, userID, http.StatusOK)
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	if token := bearerToken(r); token != "" {
		_, _ = h.DB.Exec(r.Context(), "DELETE FROM sessions WHERE token_hash = $1", hashToken(token))
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(userIDKey).(uuid.UUID)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var user models.User
	err := h.DB.QueryRow(r.Context(), "SELECT id, email, created_at FROM users WHERE id = $1", userID).
		Scan(&user.ID, &user.Email, &user.CreatedAt)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(user)
}

func (h *Handler) createSession(w http.ResponseWriter, r *http.Request, userID uuid.UUID, status int) {
	token := generateToken()
	expiresAt := time.Now().Add(sessionDuration)

	_, err := h.DB.Exec(r.Context(),
		"INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
		hashToken(token), userID, expiresAt)
	if err != nil {
		http.Error(w, "Failed to create session", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(sessionResponse{Token: token, ExpiresAt: expiresAt})
}

// generateToken must use crypto/rand, not math/rand - this is a bearer
// credential, not a display id.
func generateToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic("crypto/rand unavailable: " + err.Error())
	}
	return hex.EncodeToString(b)
}
