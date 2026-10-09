package httpx

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDecodeJSON(t *testing.T) {
	cases := []struct {
		name, body string
		limit      int64
		wantOK     bool
		wantCode   int
	}{
		{"valid", `{"a":1}`, 1 << 10, true, http.StatusOK},
		{"invalid", `{"a":`, 1 << 10, false, http.StatusBadRequest},
		{"over the limit", `{"a":"` + strings.Repeat("x", 100) + `"}`, 10, false, http.StatusRequestEntityTooLarge},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(c.body))
			req.Body = http.MaxBytesReader(rec, req.Body, c.limit)
			var v map[string]any
			if ok := DecodeJSON(rec, req, &v); ok != c.wantOK {
				t.Fatalf("ok = %v, want %v", ok, c.wantOK)
			}
			if rec.Code != c.wantCode {
				t.Fatalf("status %d, want %d", rec.Code, c.wantCode)
			}
		})
	}
}
