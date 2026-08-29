package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID           uuid.UUID `json:"id"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"createdAt"`
}

type Session struct {
	Token      string    `json:"token"`
	UserID     uuid.UUID `json:"userId"`
	CreatedAt  time.Time `json:"createdAt"`
	LastUsedAt time.Time `json:"lastUsedAt"`
	ExpiresAt  time.Time `json:"expiresAt"`
}

// Event is a single immutable entry in a user's sync event log. Seq is assigned
// by the database (BIGSERIAL) and is the only valid pull cursor - id is a
// client-generated UUID used purely for idempotent push retries.
type Event struct {
	ID         uuid.UUID       `json:"id"`
	UserID     uuid.UUID       `json:"-"`
	Seq        int64           `json:"seq"`
	Type       string          `json:"type"`
	EntityID   uuid.UUID       `json:"entityId"`
	Payload    json.RawMessage `json:"payload"`
	DeviceID   string          `json:"deviceId"`
	CreatedAt  time.Time       `json:"timestamp"`
	ReceivedAt time.Time       `json:"receivedAt"`
}
