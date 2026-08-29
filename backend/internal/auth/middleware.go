package auth

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// userIDKey is a plain string (not a typed key) to match the context-key
// convention already used elsewhere in this author's Go backends.
const userIDKey = "user_id"

// sessionRefreshThrottle bounds how often an active session's expiry is
// extended, so a busy device doesn't trigger a sessions UPDATE on every request.
const sessionRefreshThrottle = 1 * time.Hour

func bearerToken(r *http.Request) string {
	const prefix = "Bearer "
	header := r.Header.Get("Authorization")
	if strings.HasPrefix(header, prefix) {
		return strings.TrimPrefix(header, prefix)
	}
	return ""
}

// SessionMiddleware is "soft" auth: it attaches user_id to the request context
// when a valid bearer token is present, and does nothing otherwise, so public
// and authenticated routes can share one middleware stack. RequireAuth below
// is what actually rejects unauthenticated requests.
func SessionMiddleware(db *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := bearerToken(r)
			if token == "" {
				next.ServeHTTP(w, r)
				return
			}

			var userID uuid.UUID
			var expiresAt, lastUsedAt time.Time
			err := db.QueryRow(r.Context(),
				"SELECT user_id, expires_at, last_used_at FROM sessions WHERE token = $1",
				token).Scan(&userID, &expiresAt, &lastUsedAt)
			if err != nil {
				next.ServeHTTP(w, r)
				return
			}

			now := time.Now()
			if now.After(expiresAt) {
				_, _ = db.Exec(r.Context(), "DELETE FROM sessions WHERE token = $1", token)
				next.ServeHTTP(w, r)
				return
			}

			// Sliding expiry, throttled: only touch the row if it hasn't been
			// refreshed recently, to keep this off the hot path.
			if now.Sub(lastUsedAt) > sessionRefreshThrottle {
				newExpiresAt := now.Add(sessionDuration)
				_, _ = db.Exec(r.Context(),
					"UPDATE sessions SET last_used_at = $1, expires_at = $2 WHERE token = $3",
					now, newExpiresAt, token)
			}

			ctx := context.WithValue(r.Context(), userIDKey, userID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireAuth is "hard" auth: it 401s any request that SessionMiddleware
// didn't attach a user_id to.
func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Context().Value(userIDKey) == nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}
