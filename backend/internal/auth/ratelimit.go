package auth

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// attemptLimiter allows at most max attempts per key within any sliding window. It's in-memory,
// which fits the single-instance deployment; counts reset on restart.
type attemptLimiter struct {
	mu       sync.Mutex
	max      int
	window   time.Duration
	now      func() time.Time
	attempts map[string][]time.Time
	records  int
}

func newAttemptLimiter(max int, window time.Duration) *attemptLimiter {
	return &attemptLimiter{max: max, window: window, now: time.Now, attempts: map[string][]time.Time{}}
}

// retryAfter reports how long until key may make another attempt, or 0 if it may now. It doesn't
// record anything - call record for attempts that should count.
func (l *attemptLimiter) retryAfter(key string) time.Duration {
	l.mu.Lock()
	defer l.mu.Unlock()
	times := l.prune(key)
	if len(times) < l.max {
		return 0
	}
	return times[0].Add(l.window).Sub(l.now())
}

func (l *attemptLimiter) record(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.attempts[key] = append(l.prune(key), l.now())

	// Keys that never come back would otherwise stay in the map forever.
	l.records++
	if l.records%1000 == 0 {
		for k := range l.attempts {
			l.prune(k)
		}
	}
}

// prune drops key's attempts that have left the window (deleting the key once none remain) and
// returns what's left. Callers must hold l.mu.
func (l *attemptLimiter) prune(key string) []time.Time {
	cutoff := l.now().Add(-l.window)
	times := l.attempts[key]
	i := 0
	for i < len(times) && !times[i].After(cutoff) {
		i++
	}
	times = times[i:]
	if len(times) == 0 {
		delete(l.attempts, key)
		return nil
	}
	l.attempts[key] = times
	return times
}

// clientIP is the address to rate-limit a request by. Behind nginx every request arrives from
// loopback, so the real client is in X-Real-IP (see nginx.conf) - but that header is only trusted
// when the connection itself is from loopback, since anyone reaching the server directly could
// set it to anything.
func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if ip := net.ParseIP(host); ip != nil && ip.IsLoopback() {
		if real := net.ParseIP(strings.TrimSpace(r.Header.Get("X-Real-IP"))); real != nil {
			return real.String()
		}
	}
	return host
}
