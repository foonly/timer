// Package httpx holds small HTTP helpers shared by the feature packages.
package httpx

import (
	"encoding/json"
	"errors"
	"net/http"
)

// DecodeJSON decodes r's body into v. On failure it writes the error response - 413 if the body
// exceeded the route's size limit (see main.go), 400 otherwise - and returns false.
func DecodeJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	err := json.NewDecoder(r.Body).Decode(v)
	if err == nil {
		return true
	}
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		http.Error(w, "Request body too large", http.StatusRequestEntityTooLarge)
		return false
	}
	http.Error(w, err.Error(), http.StatusBadRequest)
	return false
}
