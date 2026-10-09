package main

import (
	"context"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// The auth routes reject oversized bodies before touching the database, so no Postgres is needed.
func TestAuthRoutesLimitBodySize(t *testing.T) {
	router := newRouter(nil)
	post := func(body string) int {
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(body))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec.Code
	}

	huge := `{"email":"` + strings.Repeat("a", maxAuthBodyBytes) + `"}`
	if code := post(huge); code != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversized body: status %d, want 413", code)
	}
	if code := post("not json"); code != http.StatusBadRequest {
		t.Fatalf("small invalid body: status %d, want 400", code)
	}
}

// Cancelling the context (what SIGTERM does) must let an in-flight request finish rather than
// cutting it off, then stop accepting new connections.
func TestServeShutsDownGracefully(t *testing.T) {
	entered := make(chan struct{})
	release := make(chan struct{})
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(entered)
		<-release
		_, _ = io.WriteString(w, "done")
	})

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	url := "http://" + ln.Addr().String()
	ctx, cancel := context.WithCancel(context.Background())
	served := make(chan error, 1)
	go func() { served <- serve(ctx, newServer(handler), ln) }()

	type result struct {
		body string
		err  error
	}
	resCh := make(chan result, 1)
	go func() {
		res, err := http.Get(url)
		if err != nil {
			resCh <- result{err: err}
			return
		}
		defer res.Body.Close()
		body, err := io.ReadAll(res.Body)
		resCh <- result{string(body), err}
	}()

	<-entered
	cancel()
	// Shutdown has begun but must wait for the in-flight request.
	select {
	case err := <-served:
		t.Fatalf("serve returned (%v) while a request was still in flight", err)
	case <-time.After(200 * time.Millisecond):
	}
	close(release)

	if res := <-resCh; res.err != nil || res.body != "done" {
		t.Fatalf("in-flight request: body %q, err %v", res.body, res.err)
	}
	select {
	case err := <-served:
		if err != nil {
			t.Fatalf("serve: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("serve didn't return after the in-flight request finished")
	}
	if _, err := http.Get(url); err == nil {
		t.Fatal("server still accepting connections after shutdown")
	}
}
