package api

import (
	"compress/gzip"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
	"github.com/plc-visualizer/backend/internal/models"
	"github.com/plc-visualizer/backend/internal/parser"
)

// WebSocket message types for upload protocol
const (
	// Client -> Server messages
	MsgTypeUploadInit     = "upload:init"
	MsgTypeUploadChunk    = "upload:chunk"
	MsgTypeUploadComplete = "upload:complete"
	MsgTypeMapUpload      = "map:upload"
	MsgTypeRulesUpload    = "rules:upload"
	MsgTypeCarrierUpload  = "carrier:upload"
	MsgTypePing           = "ping"

	// Server -> Client messages
	MsgTypeAck        = "ack"
	MsgTypeProgress   = "progress"
	MsgTypeComplete   = "complete"
	MsgTypeError      = "error"
	MsgTypeProcessing = "processing"
	MsgTypePong       = "pong"
)

// WebSocket message structure
type WSMessage struct {
	Type      string          `json:"type"`
	ID        string          `json:"id,omitempty"`
	Payload   json.RawMessage `json:"payload,omitempty"`
	Timestamp int64           `json:"timestamp"`
}

// Upload init payload
type UploadInitPayload struct {
	FileName    string `json:"fileName"`
	TotalChunks int    `json:"totalChunks"`
	TotalSize   int64  `json:"totalSize"`
	Encoding    string `json:"encoding,omitempty"` // "gzip", "none"
}

// Upload chunk payload
type UploadChunkPayload struct {
	UploadID   string `json:"uploadId"`
	ChunkIndex int    `json:"chunkIndex"`
	Data       string `json:"data"` // Base64 encoded chunk
	IsLast     bool   `json:"isLast,omitempty"`
}

// Upload complete payload
type UploadCompletePayload struct {
	UploadID       string `json:"uploadId"`
	FileName       string `json:"fileName"`
	TotalChunks    int    `json:"totalChunks"`
	OriginalSize   int64  `json:"originalSize"`
	CompressedSize int64  `json:"compressedSize,omitempty"`
	Encoding       string `json:"encoding,omitempty"`
}

// Map/rules upload payload (single message for smaller files)
type FileUploadPayload struct {
	Name string `json:"name"`
	Data string `json:"data"` // Base64 encoded file
}

// WebSocket progress response
type WSProgressResponse struct {
	Type     string  `json:"type"`
	UploadID string  `json:"uploadId,omitempty"`
	Progress float64 `json:"progress"`
	Stage    string  `json:"stage,omitempty"`
	Message  string  `json:"message,omitempty"`
}

// WebSocket completion response
type WSCompleteResponse struct {
	Type     string          `json:"type"`
	UploadID string          `json:"uploadId,omitempty"`
	FileInfo *models.FileInfo `json:"fileInfo,omitempty"`
	Result   interface{}     `json:"result,omitempty"` // For map/rules responses
}

// WebSocket error response
type WSErrorResponse struct {
	Type    string `json:"type"`
	Message string `json:"message"`
	Code    string `json:"code,omitempty"`
}

// UploadSession tracks an in-progress upload over WebSocket
type UploadSession struct {
	ID             string
	FileName       string
	TotalChunks    int
	ReceivedChunks map[int]bool
	Chunks         [][]byte
	OriginalSize   int64
	Encoding       string
	CreatedAt      time.Time
}

// WebSocketHandler manages WebSocket connections for file uploads
type WebSocketHandler struct {
	handler       *Handler
	upgrader      websocket.Upgrader
	sessions      map[string]*UploadSession
	sessionsMu    sync.RWMutex
}

// NewWebSocketHandler creates a new WebSocket upload handler
func NewWebSocketHandler(h *Handler) *WebSocketHandler {
	return &WebSocketHandler{
		handler: h,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				// Allow connections from dev server
				return true
			},
			ReadBufferSize:  64 * 1024,  // 64KB read buffer
			WriteBufferSize: 64 * 1024,  // 64KB write buffer
		},
		sessions: make(map[string]*UploadSession),
	}
}

// HandleWebSocket upgrades HTTP connection to WebSocket and handles upload protocol
func (wsh *WebSocketHandler) HandleWebSocket(c echo.Context) error {
	ws, err := wsh.upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		return err
	}
	defer ws.Close()

	fmt.Println("[WebSocket] Client connected for upload")

	// Send welcome message
	wsh.sendMessage(ws, WSMessage{
		Type:      "connected",
		Timestamp: time.Now().UnixMilli(),
	})

	// Main message loop
	for {
		var msg WSMessage
		err := ws.ReadJSON(&msg)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				fmt.Printf("[WebSocket] Connection error: %v\n", err)
			}
			break
		}

		// Handle message based on type
		switch msg.Type {
		case MsgTypePing:
			// Respond with pong to keep connection alive
			wsh.sendMessage(ws, WSMessage{Type: MsgTypePong, Timestamp: time.Now().UnixMilli()})
		case MsgTypeUploadInit:
			wsh.handleUploadInit(ws, msg)
		case MsgTypeUploadChunk:
			wsh.handleUploadChunk(ws, msg)
		case MsgTypeUploadComplete:
			wsh.handleUploadComplete(ws, msg)
		case MsgTypeMapUpload:
			wsh.handleMapUpload(ws, msg)
		case MsgTypeRulesUpload:
			wsh.handleRulesUpload(ws, msg)
		case MsgTypeCarrierUpload:
			wsh.handleCarrierUpload(ws, msg)
		default:
			wsh.sendError(ws, "Unknown message type: "+msg.Type, "INVALID_TYPE")
		}
	}

	fmt.Println("[WebSocket] Client disconnected")
	return nil
}

// handleUploadInit initializes a new chunked upload session
func (wsh *WebSocketHandler) handleUploadInit(ws *websocket.Conn, msg WSMessage) {
	var payload UploadInitPayload
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		wsh.sendError(ws, "Invalid init payload: "+err.Error(), "INVALID_PAYLOAD")
		return
	}

	sessionID := generateUploadID()
	session := &UploadSession{
		ID:             sessionID,
		FileName:       payload.FileName,
		TotalChunks:    payload.TotalChunks,
		ReceivedChunks: make(map[int]bool),
		Chunks:         make([][]byte, payload.TotalChunks),
		OriginalSize:   payload.TotalSize,
		Encoding:       payload.Encoding,
		CreatedAt:      time.Now(),
	}

	wsh.sessionsMu.Lock()
	wsh.sessions[sessionID] = session
	wsh.sessionsMu.Unlock()

	// Send acknowledgment
	wsh.sendMessage(ws, WSMessage{
		Type:      MsgTypeAck,
		ID:        sessionID,
		Timestamp: time.Now().UnixMilli(),
	})

	fmt.Printf("[WebSocket] Upload initialized: %s (%d chunks, %d bytes)\n", 
		sessionID, payload.TotalChunks, payload.TotalSize)
}

// handleUploadChunk receives and stores a chunk
func (wsh *WebSocketHandler) handleUploadChunk(ws *websocket.Conn, msg WSMessage) {
	var payload UploadChunkPayload
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		wsh.sendError(ws, "Invalid chunk payload: "+err.Error(), "INVALID_PAYLOAD")
		return
	}

	wsh.sessionsMu.Lock()
	session, exists := wsh.sessions[payload.UploadID]
	wsh.sessionsMu.Unlock()

	if !exists {
		wsh.sendError(ws, "Upload session not found: "+payload.UploadID, "SESSION_NOT_FOUND")
		return
	}

	// Decode base64 chunk
	chunkData, err := base64.StdEncoding.DecodeString(payload.Data)
	if err != nil {
		wsh.sendError(ws, "Invalid base64 data: "+err.Error(), "INVALID_DATA")
		return
	}

	// Store chunk
	session.ReceivedChunks[payload.ChunkIndex] = true
	session.Chunks[payload.ChunkIndex] = chunkData

	// Calculate progress
	received := len(session.ReceivedChunks)
	progress := float64(received) / float64(session.TotalChunks) * 100

	// Send progress update
	wsh.sendMessage(ws, WSMessage{
		Type:      MsgTypeProgress,
		ID:        payload.UploadID,
		Timestamp: time.Now().UnixMilli(),
		Payload:   mustJSON(WSProgressResponse{
			Type:     MsgTypeProgress,
			UploadID: payload.UploadID,
			Progress: progress,
			Stage:    "uploading",
			Message:  fmt.Sprintf("Received chunk %d/%d", received, session.TotalChunks),
		}),
	})
}

// handleUploadComplete assembles chunks and processes the file
func (wsh *WebSocketHandler) handleUploadComplete(ws *websocket.Conn, msg WSMessage) {
	var payload UploadCompletePayload
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		wsh.sendError(ws, "Invalid complete payload: "+err.Error(), "INVALID_PAYLOAD")
		return
	}

	wsh.sessionsMu.Lock()
	session, exists := wsh.sessions[payload.UploadID]
	wsh.sessionsMu.Unlock()

	if !exists {
		wsh.sendError(ws, "Upload session not found: "+payload.UploadID, "SESSION_NOT_FOUND")
		return
	}

	// Verify all chunks received
	if len(session.ReceivedChunks) != session.TotalChunks {
		wsh.sendError(ws, fmt.Sprintf("Missing chunks: got %d, expected %d", 
			len(session.ReceivedChunks), session.TotalChunks), "INCOMPLETE_UPLOAD")
		return
	}

	// Send processing status
	wsh.sendMessage(ws, WSMessage{
		Type:      MsgTypeProcessing,
		ID:        payload.UploadID,
		Timestamp: time.Now().UnixMilli(),
		Payload:   mustJSON(WSProgressResponse{
			Type:     MsgTypeProcessing,
			UploadID: payload.UploadID,
			Progress: 50,
			Stage:    "assembling",
			Message:  "Assembling file chunks...",
		}),
	})

	// Concatenate all chunks
	totalSize := 0
	for _, chunk := range session.Chunks {
		totalSize += len(chunk)
	}
	
	assembledData := make([]byte, 0, totalSize)
	for _, chunk := range session.Chunks {
		assembledData = append(assembledData, chunk...)
	}

	// Decompress if needed
	if payload.Encoding == "gzip" || session.Encoding == "gzip" {
		wsh.sendMessage(ws, WSMessage{
			Type:      MsgTypeProcessing,
			ID:        payload.UploadID,
			Timestamp: time.Now().UnixMilli(),
			Payload:   mustJSON(WSProgressResponse{
				Type:     MsgTypeProcessing,
				UploadID: payload.UploadID,
				Progress: 75,
				Stage:    "decompressing",
				Message:  "Decompressing file...",
			}),
		})

		decompressed, err := decompressGzip(assembledData)
		if err != nil {
			fmt.Printf("[WebSocket] Decompression failed, using as-is: %v\n", err)
			// Continue with assembled data
		} else {
			assembledData = decompressed
		}
	}

	// Save file
	info, err := wsh.handler.store.SaveBytes(payload.FileName, assembledData)
	if err != nil {
		wsh.sendError(ws, "Failed to save file: "+err.Error(), "SAVE_ERROR")
		return
	}

	// Clean up session
	wsh.sessionsMu.Lock()
	delete(wsh.sessions, payload.UploadID)
	wsh.sessionsMu.Unlock()

	// Send completion
	wsh.sendMessage(ws, WSMessage{
		Type:      MsgTypeComplete,
		ID:        payload.UploadID,
		Timestamp: time.Now().UnixMilli(),
		Payload:   mustJSON(WSCompleteResponse{
			Type:     MsgTypeComplete,
			UploadID: payload.UploadID,
			FileInfo: info,
		}),
	})

	fmt.Printf("[WebSocket] Upload complete: %s (%d bytes)\n", info.ID, info.Size)
}

// handleMapUpload handles single-message map XML upload
func (wsh *WebSocketHandler) handleMapUpload(ws *websocket.Conn, msg WSMessage) {
	var payload FileUploadPayload
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		wsh.sendError(ws, "Invalid map upload payload: "+err.Error(), "INVALID_PAYLOAD")
		return
	}

	// Decode base64
	decoded, err := base64.StdEncoding.DecodeString(payload.Data)
	if err != nil {
		wsh.sendError(ws, "Invalid base64 data: "+err.Error(), "INVALID_DATA")
		return
	}

	// Save file
	info, err := wsh.handler.store.SaveBytes(payload.Name, decoded)
	if err != nil {
		wsh.sendError(ws, "Failed to save map file: "+err.Error(), "SAVE_ERROR")
		return
	}

	// Set as active map
	wsh.handler.currentMapID = info.ID

	// Send completion
	wsh.sendMessage(ws, WSMessage{
		Type:      MsgTypeComplete,
		Timestamp: time.Now().UnixMilli(),
		Payload:   mustJSON(WSCompleteResponse{
			Type:     MsgTypeComplete,
			FileInfo: info,
			Result: map[string]string{
				"id":   info.ID,
				"name": info.Name,
			},
		}),
	})

	fmt.Printf("[WebSocket] Map uploaded: %s\n", info.ID)
}

// handleRulesUpload handles single-message rules YAML upload
func (wsh *WebSocketHandler) handleRulesUpload(ws *websocket.Conn, msg WSMessage) {
	var payload FileUploadPayload
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		wsh.sendError(ws, "Invalid rules upload payload: "+err.Error(), "INVALID_PAYLOAD")
		return
	}

	// Decode base64
	decoded, err := base64.StdEncoding.DecodeString(payload.Data)
	if err != nil {
		wsh.sendError(ws, "Invalid base64 data: "+err.Error(), "INVALID_DATA")
		return
	}

	// Parse YAML to validate
	rules, err := parser.ParseMapRulesFromBytes(decoded)
	if err != nil {
		wsh.sendError(ws, "Invalid YAML format: "+err.Error(), "INVALID_YAML")
		return
	}

	// Save file
	info, err := wsh.handler.store.SaveBytes(payload.Name, decoded)
	if err != nil {
		wsh.sendError(ws, "Failed to save rules file: "+err.Error(), "SAVE_ERROR")
		return
	}

	// Set as active rules
	wsh.handler.currentRulesID = info.ID
	wsh.handler.currentRules = rules

	// Send completion with rules info
	wsh.sendMessage(ws, WSMessage{
		Type:      MsgTypeComplete,
		Timestamp: time.Now().UnixMilli(),
		Payload:   mustJSON(WSCompleteResponse{
			Type:     MsgTypeComplete,
			FileInfo: info,
			Result: models.RulesInfo{
				ID:          info.ID,
				Name:        info.Name,
				UploadedAt:  info.UploadedAt.Format(time.RFC3339),
				RulesCount:  len(rules.Rules),
				DeviceCount: len(rules.DeviceToUnit),
			},
		}),
	})

	fmt.Printf("[WebSocket] Rules uploaded: %s\n", info.ID)
}

// handleCarrierUpload handles single-message carrier log upload
func (wsh *WebSocketHandler) handleCarrierUpload(ws *websocket.Conn, msg WSMessage) {
	var payload FileUploadPayload
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		wsh.sendError(ws, "Invalid carrier upload payload: "+err.Error(), "INVALID_PAYLOAD")
		return
	}

	// Decode base64
	decoded, err := base64.StdEncoding.DecodeString(payload.Data)
	if err != nil {
		wsh.sendError(ws, "Invalid base64 data: "+err.Error(), "INVALID_DATA")
		return
	}

	// Save file
	info, err := wsh.handler.store.SaveBytes(payload.Name, decoded)
	if err != nil {
		wsh.sendError(ws, "Failed to save carrier log: "+err.Error(), "SAVE_ERROR")
		return
	}

	// Get file path
	path, err := wsh.handler.store.GetFilePath(info.ID)
	if err != nil {
		wsh.sendError(ws, "Failed to get file path: "+err.Error(), "FILE_ERROR")
		return
	}

	// Send processing status
	wsh.sendMessage(ws, WSMessage{
		Type:      MsgTypeProcessing,
		Timestamp: time.Now().UnixMilli(),
		Payload:   mustJSON(WSProgressResponse{
			Type:     MsgTypeProcessing,
			Progress: 50,
			Stage:    "parsing",
			Message:  "Parsing carrier log...",
		}),
	})

	// Start parsing session
	sess, err := wsh.handler.session.StartSession(info.ID, path)
	if err != nil {
		wsh.sendError(ws, "Failed to start parsing: "+err.Error(), "PARSE_ERROR")
		return
	}

	// Wait briefly for parsing (carrier logs are small)
	for i := 0; i < 50; i++ {
		currentSess, ok := wsh.handler.session.GetSession(sess.ID)
		if !ok {
			break
		}
		if currentSess.Status == "complete" || currentSess.Status == "error" {
			if currentSess.ParserName != "mcs_log" {
				wsh.sendError(ws, "Invalid carrier log format. Please upload an MCS/AMHS format log.", "INVALID_FORMAT")
				return
			}
			break
		}
		time.Sleep(100 * time.Millisecond)
	}

	wsh.handler.carrierSessionID = sess.ID

	// Send completion
	wsh.sendMessage(ws, WSMessage{
		Type:      MsgTypeComplete,
		Timestamp: time.Now().UnixMilli(),
		Payload:   mustJSON(WSCompleteResponse{
			Type: MsgTypeComplete,
			Result: map[string]interface{}{
				"sessionId": sess.ID,
				"fileId":    info.ID,
				"fileName":  info.Name,
			},
		}),
	})

	fmt.Printf("[WebSocket] Carrier log uploaded: %s\n", info.ID)
}

// Helper methods

func (wsh *WebSocketHandler) sendMessage(ws *websocket.Conn, msg WSMessage) {
	if err := ws.WriteJSON(msg); err != nil {
		fmt.Printf("[WebSocket] Failed to send message: %v\n", err)
	}
}

func (wsh *WebSocketHandler) sendError(ws *websocket.Conn, message, code string) {
	wsh.sendMessage(ws, WSMessage{
		Type:      MsgTypeError,
		Timestamp: time.Now().UnixMilli(),
		Payload:   mustJSON(WSErrorResponse{
			Type:    MsgTypeError,
			Message: message,
			Code:    code,
		}),
	})
}

func generateUploadID() string {
	return fmt.Sprintf("%d-%d", time.Now().UnixMilli(), time.Now().Nanosecond())
}

func mustJSON(v interface{}) json.RawMessage {
	data, err := json.Marshal(v)
	if err != nil {
		return []byte("{}")
	}
	return data
}

func decompressGzip(data []byte) ([]byte, error) {
	reader, err := gzip.NewReader(NewBytesReader(data))
	if err != nil {
		return nil, err
	}
	defer reader.Close()

	var result []byte
	buf := make([]byte, 64*1024) // 64KB buffer
	for {
		n, err := reader.Read(buf)
		if n > 0 {
			result = append(result, buf[:n]...)
		}
		if err != nil {
			if err.Error() == "EOF" {
				break
			}
			return nil, err
		}
	}
	return result, nil
}

// BytesReader wraps byte slice for gzip reader
type BytesReader struct {
	data []byte
	pos  int
}

func NewBytesReader(data []byte) *BytesReader {
	return &BytesReader{data: data}
}

func (r *BytesReader) Read(p []byte) (int, error) {
	if r.pos >= len(r.data) {
		return 0, fmt.Errorf("EOF")
	}
	n := copy(p, r.data[r.pos:])
	r.pos += n
	return n, nil
}
