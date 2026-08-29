package sync

import (
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
)

// Event type constants. The server treats payload as an opaque JSONB blob
// (see the schema) - it never reduces the tag/timer tree itself - so this
// validation is deliberately structural (right fields present, uuids parse),
// not semantic (e.g. it never checks whether a referenced tag exists).
const (
	EventTagAdded     = "tag_added"
	EventTagUpdated   = "tag_updated"
	EventTagRemoved   = "tag_removed"
	EventTimerStarted = "timer_started"
	EventTimerStopped = "timer_stopped"
	// EventTimerUpdated is reserved for a future retroactive-edit feature.
	// Nothing emits it yet, but accepting the type now avoids a breaking
	// change to this enum later.
	EventTimerUpdated = "timer_updated"
)

var validEventTypes = map[string]bool{
	EventTagAdded:     true,
	EventTagUpdated:   true,
	EventTagRemoved:   true,
	EventTimerStarted: true,
	EventTimerStopped: true,
	EventTimerUpdated: true,
}

// incomingEvent is the wire shape of one entry in a push request.
type incomingEvent struct {
	ID        uuid.UUID       `json:"id"`
	Type      string          `json:"type"`
	EntityID  uuid.UUID       `json:"entityId"`
	DeviceID  string          `json:"deviceId"`
	Timestamp int64           `json:"timestamp"`
	Payload   json.RawMessage `json:"payload"`
}

func (e incomingEvent) validate() error {
	if e.ID == uuid.Nil {
		return fmt.Errorf("event id is required")
	}
	if !validEventTypes[e.Type] {
		return fmt.Errorf("unknown event type %q", e.Type)
	}
	if e.EntityID == uuid.Nil {
		return fmt.Errorf("entityId is required")
	}
	if e.DeviceID == "" {
		return fmt.Errorf("deviceId is required")
	}
	if e.Timestamp <= 0 {
		return fmt.Errorf("timestamp is required")
	}
	if len(e.Payload) == 0 {
		return fmt.Errorf("payload is required")
	}

	switch e.Type {
	case EventTagAdded, EventTagUpdated:
		var p struct {
			UUID uuid.UUID `json:"uuid"`
			Name string    `json:"name"`
		}
		if err := json.Unmarshal(e.Payload, &p); err != nil {
			return fmt.Errorf("invalid payload for %s: %w", e.Type, err)
		}
		if p.UUID == uuid.Nil {
			return fmt.Errorf("payload.uuid is required for %s", e.Type)
		}
	case EventTagRemoved:
		if err := requireUUIDField(e.Payload, "uuid"); err != nil {
			return fmt.Errorf("invalid payload for %s: %w", e.Type, err)
		}
	case EventTimerStarted:
		var p struct {
			UUID    uuid.UUID `json:"uuid"`
			TagUUID uuid.UUID `json:"tagUuid"`
		}
		if err := json.Unmarshal(e.Payload, &p); err != nil {
			return fmt.Errorf("invalid payload for %s: %w", e.Type, err)
		}
		if p.UUID == uuid.Nil || p.TagUUID == uuid.Nil {
			return fmt.Errorf("payload.uuid and payload.tagUuid are required for %s", e.Type)
		}
	case EventTimerStopped, EventTimerUpdated:
		if err := requireUUIDField(e.Payload, "uuid"); err != nil {
			return fmt.Errorf("invalid payload for %s: %w", e.Type, err)
		}
	}

	return nil
}

func requireUUIDField(payload json.RawMessage, field string) error {
	var p map[string]json.RawMessage
	if err := json.Unmarshal(payload, &p); err != nil {
		return err
	}
	raw, ok := p[field]
	if !ok {
		return fmt.Errorf("%s is required", field)
	}
	var id uuid.UUID
	if err := json.Unmarshal(raw, &id); err != nil || id == uuid.Nil {
		return fmt.Errorf("%s must be a valid uuid", field)
	}
	return nil
}
