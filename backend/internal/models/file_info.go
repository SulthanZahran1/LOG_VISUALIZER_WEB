package models

import "time"

// FileInfo represents metadata about an uploaded file.
type FileInfo struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	Size       int64     `json:"size"`
	UploadedAt time.Time `json:"uploadedAt"`
	Status     string    `json:"status"` // "uploaded", "parsing", "parsed", "error"
}
