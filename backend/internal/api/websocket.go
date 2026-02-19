package api

import (
	"compress/gzip"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
	"github.com/plc-visualizer/backend/internal/models"
	"github.com/plc-visualizer/backend/internal/parser"
	"github.com/plc-visualizer/backend/internal/session"
	"github.com/plc-visualizer/backend/internal/storage"
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
	Type     string           `json:"type"`
	UploadID string           `json:"uploadId,omitempty"`
	FileInfo *models.FileInfo `json:"fileInfo,omitempty"`
	Result   interface{}      `json:"result,omitempty"` // For map/rules responses
}

// WebSocket error response
type WSErrorResponse struct {
	Type    string `json:"type"`
	Message string `json:"message"`
	Code    string `json:"code,omitempty"`
}

// UploadSession tracks an in-progress upload over WebSocket
// Uses disk storage to minimize memory usage for large files
type UploadSession struct {
	ID             string
	FileName       string
	TotalChunks    int
	ReceivedChunks map[int]bool
	TempDir        string // Directory for chunk files
	OriginalSize   int64
	Encoding       string
	CreatedAt      time.Time
}

// WebSocketHandler manages WebSocket connections for file uploads
type WebSocketHandler struct {
	store          storage.Store
	sessionMgr     *session.Manager
	mapHandler     MapHandler
	carrierHandler CarrierHandler
	upgrader       websocket.Upgrader
	sessions       map[string]*UploadSession
	sessionsMu     sync.RWMutex
}

// NewWebSocketHandler creates a new WebSocket upload handler using the new handler structure
func NewWebSocketHandler(deps *Dependencies, handlers *Handlers) *WebSocketHandler {
	return &WebSocketHandler{
		store:          deps.Store,
		sessionMgr:     deps.SessionMgr,
		mapHandler:     handlers.Map,
		carrierHandler: handlers.Carrier,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				// Allow connections from dev server
				return true
			},
			ReadBufferSize:  64 * 1024, // 64KB read buffer
			WriteBufferSize: 64 * 1024, // 64KB write buffer
		},
		sessions: make(map[string]*UploadSession),
	}
}

// Legacy compatibility: Create WebSocket handler from old Handler struct
// TODO: Remove this once migration is complete
func NewWebSocketHandlerFromOld(h *Handler) *WebSocketHandler {
	return &WebSocketHandler{
		store:      h.store,
		sessionMgr: h.session,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
			ReadBufferSize:  64 * 1024,
			WriteBufferSize: 64 * 1024,
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

	// Create temp directory for chunks (disk storage to minimize memory)
	tempDir := filepath.Join("./data/uploads", ".ws_temp", sessionID)
	if err := os.MkdirAll(tempDir, 0755); err != nil {
		wsh.sendError(ws, "Failed to create temp directory: "+err.Error(), "INTERNAL_ERROR")
		return
	}

	session := &UploadSession{
		ID:             sessionID,
		FileName:       payload.FileName,
		TotalChunks:    payload.TotalChunks,
		ReceivedChunks: make(map[int]bool),
		TempDir:        tempDir,
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

	fmt.Printf("[WebSocket] Upload initialized: %s (%d chunks, %d bytes, temp: %s)\n",
		sessionID, payload.TotalChunks, payload.TotalSize, tempDir)
}

// handleUploadChunk receives and stores a chunk to disk
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

	// Write chunk to disk (not memory) to handle large files
	chunkPath := filepath.Join(session.TempDir, fmt.Sprintf("chunk_%d", payload.ChunkIndex))
	if err := os.WriteFile(chunkPath, chunkData, 0644); err != nil {
		wsh.sendError(ws, "Failed to write chunk: "+err.Error(), "WRITE_ERROR")
		return
	}

	// Mark as received
	session.ReceivedChunks[payload.ChunkIndex] = true

	// Calculate progress
	received := len(session.ReceivedChunks)
	progress := float64(received) / float64(session.TotalChunks) * 100

	// Send progress update
	wsh.sendMessage(ws, WSMessage{
		Type:      MsgTypeProgress,
		ID:        payload.UploadID,
		Timestamp: time.Now().UnixMilli(),
		Payload: mustJSON(WSProgressResponse{
			Type:     MsgTypeProgress,
			UploadID: payload.UploadID,
			Progress: progress,
			Stage:    "uploading",
			Message:  fmt.Sprintf("Received chunk %d/%d", received, session.TotalChunks),
		}),
	})
}

// handleUploadComplete assembles chunks from disk and processes the file
// Uses streaming to minimize memory usage for large files
// Sends granular progress updates during assembly, decompression, and saving
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

	// Send initial processing status
	wsh.sendProcessingProgress(ws, payload.UploadID, 0, "assembling", "Starting assembly...")

	// Create assembled file path
	assembledPath := filepath.Join(session.TempDir, "assembled")

	// Stream concatenate chunks to disk (low memory usage)
	assembledFile, err := os.Create(assembledPath)
	if err != nil {
		wsh.sendError(ws, "Failed to create assembled file: "+err.Error(), "WRITE_ERROR")
		return
	}

	// Progress reporting interval (report every ~10% or every 50 chunks, whichever is smaller)
	reportInterval := session.TotalChunks / 10
	if reportInterval < 1 {
		reportInterval = 1
	}
	if reportInterval > 50 {
		reportInterval = 50
	}

	for i := 0; i < session.TotalChunks; i++ {
		chunkPath := filepath.Join(session.TempDir, fmt.Sprintf("chunk_%d", i))
		chunkData, err := os.ReadFile(chunkPath)
		if err != nil {
			assembledFile.Close()
			wsh.sendError(ws, fmt.Sprintf("Failed to read chunk %d: %v", i, err), "READ_ERROR")
			return
		}
		if _, err := assembledFile.Write(chunkData); err != nil {
			assembledFile.Close()
			wsh.sendError(ws, fmt.Sprintf("Failed to write chunk %d: %v", i, err), "WRITE_ERROR")
			return
		}

		// Send progress update at intervals
		if (i+1)%reportInterval == 0 || i == session.TotalChunks-1 {
			progress := float64(i+1) / float64(session.TotalChunks) * 100
			wsh.sendProcessingProgress(ws, payload.UploadID, progress, "assembling",
				fmt.Sprintf("Assembling chunk %d/%d...", i+1, session.TotalChunks))
		}
	}
	assembledFile.Close()

	var finalPath string

	// Decompress if needed (streaming)
	if payload.Encoding == "gzip" || session.Encoding == "gzip" {
		wsh.sendProcessingProgress(ws, payload.UploadID, 0, "decompressing", "Starting decompression...")

		decompressedPath := filepath.Join(session.TempDir, "decompressed")
		if err := wsh.streamDecompressGzipWithProgress(ws, payload.UploadID, assembledPath, decompressedPath); err != nil {
			fmt.Printf("[WebSocket] Decompression failed, using as-is: %v\n", err)
			finalPath = assembledPath
		} else {
			finalPath = decompressedPath
		}
	} else {
		finalPath = assembledPath
	}

	// Send saving progress
	wsh.sendProcessingProgress(ws, payload.UploadID, 0, "saving", "Saving to storage...")

	// Save file using storage manager (streaming copy)
	info, err := wsh.saveFileToStorage(payload.FileName, finalPath)
	if err != nil {
		wsh.sendError(ws, "Failed to save file: "+err.Error(), "SAVE_ERROR")
		return
	}

	// Clean up temp directory
	os.RemoveAll(session.TempDir)

	// Clean up session
	wsh.sessionsMu.Lock()
	delete(wsh.sessions, payload.UploadID)
	wsh.sessionsMu.Unlock()

	// Send completion
	wsh.sendMessage(ws, WSMessage{
		Type:      MsgTypeComplete,
		ID:        payload.UploadID,
		Timestamp: time.Now().UnixMilli(),
		Payload: mustJSON(WSCompleteResponse{
			Type:     MsgTypeComplete,
			UploadID: payload.UploadID,
			FileInfo: info,
		}),
	})

	fmt.Printf("[WebSocket] Upload complete: %s (%d bytes)\n", info.ID, info.Size)
}

// sendProcessingProgress sends a processing progress update to the client
func (wsh *WebSocketHandler) sendProcessingProgress(ws *websocket.Conn, uploadID string, progress float64, stage, message string) {
	wsh.sendMessage(ws, WSMessage{
		Type:      MsgTypeProcessing,
		ID:        uploadID,
		Timestamp: time.Now().UnixMilli(),
		Payload: mustJSON(WSProgressResponse{
			Type:     MsgTypeProcessing,
			UploadID: uploadID,
			Progress: progress,
			Stage:    stage,
			Message:  message,
		}),
	})
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
	info, err := wsh.store.SaveBytes(payload.Name, decoded)
	if err != nil {
		wsh.sendError(ws, "Failed to save map file: "+err.Error(), "SAVE_ERROR")
		return
	}

	// Set as active map via map handler
	if h, ok := wsh.mapHandler.(*MapHandlerImpl); ok {
		h.SetCurrentMap(info.ID)
	}

	// Send completion
	wsh.sendMessage(ws, WSMessage{
		Type:      MsgTypeComplete,
		Timestamp: time.Now().UnixMilli(),
		Payload: mustJSON(WSCompleteResponse{
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
	info, err := wsh.store.SaveBytes(payload.Name, decoded)
	if err != nil {
		wsh.sendError(ws, "Failed to save rules file: "+err.Error(), "SAVE_ERROR")
		return
	}

	// Set as active rules via map handler
	if h, ok := wsh.mapHandler.(*MapHandlerImpl); ok {
		h.SetCurrentRules(info.ID, rules)
	}

	// Send completion with rules info
	wsh.sendMessage(ws, WSMessage{
		Type:      MsgTypeComplete,
		Timestamp: time.Now().UnixMilli(),
		Payload: mustJSON(WSCompleteResponse{
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
	info, err := wsh.store.SaveBytes(payload.Name, decoded)
	if err != nil {
		wsh.sendError(ws, "Failed to save carrier log: "+err.Error(), "SAVE_ERROR")
		return
	}

	// Get file path
	path, err := wsh.store.GetFilePath(info.ID)
	if err != nil {
		wsh.sendError(ws, "Failed to get file path: "+err.Error(), "FILE_ERROR")
		return
	}

	// Send processing status
	wsh.sendMessage(ws, WSMessage{
		Type:      MsgTypeProcessing,
		Timestamp: time.Now().UnixMilli(),
		Payload: mustJSON(WSProgressResponse{
			Type:     MsgTypeProcessing,
			Progress: 50,
			Stage:    "parsing",
			Message:  "Parsing carrier log...",
		}),
	})

	// Start parsing session
	sess, err := wsh.sessionMgr.StartSession(info.ID, path)
	if err != nil {
		wsh.sendError(ws, "Failed to start parsing: "+err.Error(), "PARSE_ERROR")
		return
	}

	// Wait briefly for parsing (carrier logs are small)
	for i := 0; i < 50; i++ {
		currentSess, ok := wsh.sessionMgr.GetSession(sess.ID)
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

	// Set carrier session via carrier handler
	if h, ok := wsh.carrierHandler.(*CarrierHandlerImpl); ok {
		h.SetCarrierSessionID(sess.ID)
	}

	// Send completion
	wsh.sendMessage(ws, WSMessage{
		Type:      MsgTypeComplete,
		Timestamp: time.Now().UnixMilli(),
		Payload: mustJSON(WSCompleteResponse{
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
		Payload: mustJSON(WSErrorResponse{
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

// streamDecompressGzip decompresses src file to dst file using streaming
func (wsh *WebSocketHandler) streamDecompressGzip(srcPath, dstPath string) error {
	srcFile, err := os.Open(srcPath)
	if err != nil {
		return err
	}
	defer srcFile.Close()

	reader, err := gzip.NewReader(srcFile)
	if err != nil {
		return err
	}
	defer reader.Close()

	dstFile, err := os.Create(dstPath)
	if err != nil {
		return err
	}
	defer dstFile.Close()

	buf := make([]byte, 256*1024) // 256KB buffer for efficient streaming
	_, err = io.CopyBuffer(dstFile, reader, buf)
	return err
}

// streamDecompressGzipWithProgress decompresses with WebSocket progress updates
func (wsh *WebSocketHandler) streamDecompressGzipWithProgress(ws *websocket.Conn, uploadID, srcPath, dstPath string) error {
	srcFile, err := os.Open(srcPath)
	if err != nil {
		return err
	}
	defer srcFile.Close()

	// Get source size for progress calculation
	srcInfo, err := srcFile.Stat()
	if err != nil {
		return err
	}
	srcSize := srcInfo.Size()

	reader, err := gzip.NewReader(srcFile)
	if err != nil {
		return err
	}
	defer reader.Close()

	dstFile, err := os.Create(dstPath)
	if err != nil {
		return err
	}
	defer dstFile.Close()

	buf := make([]byte, 256*1024) // 256KB buffer
	var written int64
	var lastProgress float64 = -1

	for {
		n, err := reader.Read(buf)
		if n > 0 {
			if _, werr := dstFile.Write(buf[:n]); werr != nil {
				return werr
			}
			written += int64(n)

			// Report progress based on compressed bytes read (approximation)
			// Since gzip compression ratio varies, we use a smoothed progress
			progress := float64(written) / float64(srcSize*3) * 100 // Assume ~3:1 ratio
			if progress > 99 {
				progress = 99
			}

			// Send progress update every 5% change
			if progress-lastProgress >= 5 {
				wsh.sendProcessingProgress(ws, uploadID, progress, "decompressing",
					fmt.Sprintf("Decompressing... %d MB processed", written/1024/1024))
				lastProgress = progress
			}
		}
		if err != nil {
			if err.Error() == "EOF" {
				break
			}
			return err
		}
	}

	// Send final progress
	wsh.sendProcessingProgress(ws, uploadID, 100, "decompressing", "Decompression complete")
	return nil
}

// saveFileToStorage saves a file from disk to the storage manager
func (wsh *WebSocketHandler) saveFileToStorage(filename, srcPath string) (*models.FileInfo, error) {
	// Open source file
	srcFile, err := os.Open(srcPath)
	if err != nil {
		return nil, err
	}
	defer srcFile.Close()

	// Use storage manager's Save method which handles everything
	return wsh.store.Save(filename, srcFile)
}

func generateFileID() string {
	return fmt.Sprintf("%d-%d", time.Now().UnixMilli(), time.Now().Nanosecond())
}
