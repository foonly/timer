package auth

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type fakeClock struct{ t time.Time }

func (c *fakeClock) now() time.Time { return c.t }

func newTestLimiter(max int, window time.Duration) (*attemptLimiter, *fakeClock) {
	clock := &fakeClock{t: time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)}
	l := newAttemptLimiter(max, window)
	l.now = clock.now
	return l, clock
}

func TestAttemptLimiterSlidingWindow(t *testing.T) {
	l, clock := newTestLimiter(3, time.Minute)

	for i := range 3 {
		if wait := l.retryAfter("k"); wait != 0 {
			t.Fatalf("attempt %d blocked (wait %v)", i+1, wait)
		}
		l.record("k")
		clock.t = clock.t.Add(10 * time.Second)
	}
	// Attempts at 0s, 10s, 20s; now 30s. The oldest leaves the window at 60s.
	if wait := l.retryAfter("k"); wait != 30*time.Second {
		t.Fatalf("retryAfter = %v, want 30s", wait)
	}
	if wait := l.retryAfter("other"); wait != 0 {
		t.Fatalf("unrelated key blocked (wait %v)", wait)
	}

	clock.t = clock.t.Add(30 * time.Second)
	if wait := l.retryAfter("k"); wait != 0 {
		t.Fatalf("still blocked once the oldest attempt left the window (wait %v)", wait)
	}
}

func TestAttemptLimiterForgetsIdleKeys(t *testing.T) {
	l, clock := newTestLimiter(3, time.Minute)
	l.record("idle")
	clock.t = clock.t.Add(2 * time.Minute)
	for range 1000 {
		l.record("busy")
	}
	if _, ok := l.attempts["idle"]; ok {
		t.Fatal("idle key was never swept")
	}
}

func TestClientIP(t *testing.T) {
	cases := []struct {
		name, remoteAddr, realIP, want string
	}{
		{"direct client", "203.0.113.5:4000", "", "203.0.113.5"},
		{"direct client can't spoof X-Real-IP", "203.0.113.5:4000", "198.51.100.1", "203.0.113.5"},
		{"via local proxy", "127.0.0.1:4000", "198.51.100.1", "198.51.100.1"},
		{"via local proxy over IPv6", "[::1]:4000", "2001:db8::1", "2001:db8::1"},
		{"local proxy without header", "127.0.0.1:4000", "", "127.0.0.1"},
		{"local proxy with garbage header", "127.0.0.1:4000", "not-an-ip", "127.0.0.1"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/", nil)
			req.RemoteAddr = c.remoteAddr
			if c.realIP != "" {
				req.Header.Set("X-Real-IP", c.realIP)
			}
			if got := clientIP(req); got != c.want {
				t.Fatalf("clientIP = %q, want %q", got, c.want)
			}
		})
	}
}

// The per-IP limit is checked before anything touches the database, so this needs no Postgres.
func TestLoginAndSignupShareThePerIPLimit(t *testing.T) {
	h := NewHandler(nil)
	attempt := func(f http.HandlerFunc, ip string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader("not json"))
		req.RemoteAddr = "127.0.0.1:4000"
		req.Header.Set("X-Real-IP", ip)
		rec := httptest.NewRecorder()
		f(rec, req)
		return rec
	}

	for i := range maxAttemptsPerIP {
		f := h.Login
		if i%2 == 0 {
			f = h.Signup
		}
		if rec := attempt(f, "198.51.100.1"); rec.Code != http.StatusBadRequest {
			t.Fatalf("attempt %d: status %d, want 400 (not yet limited)", i+1, rec.Code)
		}
	}
	rec := attempt(h.Login, "198.51.100.1")
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("status %d, want 429", rec.Code)
	}
	if rec.Header().Get("Retry-After") == "" {
		t.Fatal("429 without Retry-After")
	}
	if rec := attempt(h.Signup, "198.51.100.2"); rec.Code != http.StatusBadRequest {
		t.Fatalf("another client: status %d, want 400", rec.Code)
	}
}
