package sync

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	maxPushBatch     = 500
	defaultPullLimit = 500
	maxPullLimit     = 2000
)

// userIDKey mirrors the auth package's context key - see the note there on
// why it's a plain string rather than a typed key.
const userIDKey = "user_id"

type Handler struct {
	DB *pgxpool.Pool
}

func NewHandler(db *pgxpool.Pool) *Handler {
	return &Handler{DB: db}
}

func userIDFromContext(r *http.Request) (uuid.UUID, bool) {
	id, ok := r.Context().Value(userIDKey).(uuid.UUID)
	return id, ok
}

type pushRequest struct {
	Events []incomingEvent `json:"events"`
}

type pushResponse struct {
	Accepted int `json:"accepted"`
}

// Push stores a batch of events, keyed by their client-generated id so a
// retried push (e.g. after a dropped response) can't create duplicates.
// user_id always comes from the authenticated session, never from the body.
func (h *Handler) Push(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req pushRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if len(req.Events) > maxPushBatch {
		http.Error(w, fmt.Sprintf("batch too large: max %d events per push", maxPushBatch), http.StatusRequestEntityTooLarge)
		return
	}

	for _, e := range req.Events {
		if err := e.validate(); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	}

	batch := &pgx.Batch{}
	for _, e := range req.Events {
		batch.Queue(
			`INSERT INTO events (id, user_id, type, entity_id, payload, device_id, created_at)
			 VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7::double precision / 1000))
			 ON CONFLICT (id) DO NOTHING`,
			e.ID, userID, e.Type, e.EntityID, []byte(e.Payload), e.DeviceID, e.Timestamp,
		)
	}

	br := h.DB.SendBatch(r.Context(), batch)
	defer br.Close()

	accepted := 0
	for range req.Events {
		tag, err := br.Exec()
		if err != nil {
			http.Error(w, "Failed to store events", http.StatusInternalServerError)
			return
		}
		accepted += int(tag.RowsAffected())
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(pushResponse{Accepted: accepted})
}

type outgoingEvent struct {
	ID        uuid.UUID       `json:"id"`
	Type      string          `json:"type"`
	EntityID  uuid.UUID       `json:"entityId"`
	DeviceID  string          `json:"deviceId"`
	Timestamp int64           `json:"timestamp"`
	Payload   json.RawMessage `json:"payload"`
	Seq       int64           `json:"seq"`
}

type pullResponse struct {
	Events  []outgoingEvent `json:"events"`
	Cursor  int64           `json:"cursor"`
	HasMore bool            `json:"hasMore"`
}

// Pull returns events after the given seq cursor, ascending, capped at limit.
// It deliberately does NOT filter out the requesting device's own events
// (device_id is informational only) - the client is expected to apply events
// idempotently by entity id, which it already needs for the general
// multi-device merge case, so re-seeing its own events here is a harmless no-op.
func (h *Handler) Pull(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	since, err := parseInt64Query(r, "since", 0)
	if err != nil {
		http.Error(w, "invalid since parameter", http.StatusBadRequest)
		return
	}
	limit, err := parseInt64Query(r, "limit", defaultPullLimit)
	if err != nil {
		http.Error(w, "invalid limit parameter", http.StatusBadRequest)
		return
	}
	if limit <= 0 || limit > maxPullLimit {
		limit = defaultPullLimit
	}

	// Fetch one extra row so hasMore can be reported without a second query.
	rows, err := h.DB.Query(r.Context(),
		`SELECT id, type, entity_id, payload, device_id,
		        (extract(epoch FROM created_at) * 1000)::bigint, seq
		 FROM events
		 WHERE user_id = $1 AND seq > $2
		 ORDER BY seq ASC
		 LIMIT $3`,
		userID, since, limit+1)
	if err != nil {
		http.Error(w, "Failed to fetch events", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	events := make([]outgoingEvent, 0, limit)
	for rows.Next() {
		var e outgoingEvent
		if err := rows.Scan(&e.ID, &e.Type, &e.EntityID, &e.Payload, &e.DeviceID, &e.Timestamp, &e.Seq); err != nil {
			http.Error(w, "Failed to read events", http.StatusInternalServerError)
			return
		}
		events = append(events, e)
	}
	if err := rows.Err(); err != nil {
		http.Error(w, "Failed to read events", http.StatusInternalServerError)
		return
	}

	hasMore := false
	if int64(len(events)) > limit {
		events = events[:limit]
		hasMore = true
	}

	cursor := since
	if len(events) > 0 {
		cursor = events[len(events)-1].Seq
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(pullResponse{Events: events, Cursor: cursor, HasMore: hasMore})
}

func parseInt64Query(r *http.Request, key string, def int64) (int64, error) {
	v := r.URL.Query().Get(key)
	if v == "" {
		return def, nil
	}
	return strconv.ParseInt(v, 10, 64)
}
