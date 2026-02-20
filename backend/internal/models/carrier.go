package models

import "time"

// CarrierEntry represents a carrier position entry for tracking.
type CarrierEntry struct {
	CarrierID   string    `json:"carrierId"`
	Location    string    `json:"location"`
	Timestamp   time.Time `json:"timestamp"`
	TimestampMs int64     `json:"timestampMs"`
}
