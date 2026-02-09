package api

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/plc-visualizer/backend/internal/session"
	"github.com/plc-visualizer/backend/internal/storage"
	"github.com/plc-visualizer/backend/internal/upload"
	"github.com/stretchr/testify/assert"
)

func TestMapHandlers(t *testing.T) {
	e := echo.New()

	// Setup storage
	tmpDir := t.TempDir()
	store, _ := storage.NewLocalStore(tmpDir)
	sessionMgr := session.NewManager()
	uploadMgr := upload.NewManager(tmpDir, store)
	h := NewHandler(store, sessionMgr, uploadMgr, "")

	// 1. Initially no map
	req := httptest.NewRequest(http.MethodGet, "/api/map/layout", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	if assert.NoError(t, h.HandleGetMapLayout(c)) {
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Contains(t, rec.Body.String(), `"objects":{}`)
	}

	// 2. Upload map
	xmlData := `<?xml version="1.0" ?><ConveyorMap><Object name="O1" type="T"><Size>1,1</Size><Location>0,0</Location></Object></ConveyorMap>`
	uploadBody, _ := json.Marshal(map[string]string{
		"name": "test_map.xml",
		"data": base64.StdEncoding.EncodeToString([]byte(xmlData)),
	})

	req = httptest.NewRequest(http.MethodPost, "/api/map/upload", bytes.NewBuffer(uploadBody))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec = httptest.NewRecorder()
	c = e.NewContext(req, rec)
	if assert.NoError(t, h.HandleUploadMapLayout(c)) {
		assert.Equal(t, http.StatusCreated, rec.Code)
	}

	// 3. Get map layout
	req = httptest.NewRequest(http.MethodGet, "/api/map/layout", nil)
	rec = httptest.NewRecorder()
	c = e.NewContext(req, rec)
	if assert.NoError(t, h.HandleGetMapLayout(c)) {
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Contains(t, rec.Body.String(), `"name":"O1"`)
	}
}

func TestChunkedUpload(t *testing.T) {
	e := echo.New()
	tmpDir := t.TempDir()
	store, _ := storage.NewLocalStore(tmpDir)
	sessionMgr := session.NewManager()
	uploadMgr := upload.NewManager(tmpDir, store)
	h := NewHandler(store, sessionMgr, uploadMgr, "")

	uploadID := "test-upload-v1"
	chunk1 := []byte("chunk one ")
	chunk2 := []byte("chunk two")

	// 1. Upload chunk 1
	chunkBody1, _ := json.Marshal(map[string]interface{}{
		"uploadId":    uploadID,
		"chunkIndex":  0,
		"data":        base64.StdEncoding.EncodeToString(chunk1),
		"totalChunks": 2,
		"compressed":  false,
	})

	req1 := httptest.NewRequest(http.MethodPost, "/api/files/upload/chunk", bytes.NewBuffer(chunkBody1))
	req1.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec1 := httptest.NewRecorder()
	c1 := e.NewContext(req1, rec1)
	if assert.NoError(t, h.HandleUploadChunk(c1)) {
		assert.Equal(t, http.StatusAccepted, rec1.Code)
	}

	// 2. Upload chunk 2
	chunkBody2, _ := json.Marshal(map[string]interface{}{
		"uploadId":    uploadID,
		"chunkIndex":  1,
		"data":        base64.StdEncoding.EncodeToString(chunk2),
		"totalChunks": 2,
		"compressed":  false,
	})

	req2 := httptest.NewRequest(http.MethodPost, "/api/files/upload/chunk", bytes.NewBuffer(chunkBody2))
	req2.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec2 := httptest.NewRecorder()
	c2 := e.NewContext(req2, rec2)
	if assert.NoError(t, h.HandleUploadChunk(c2)) {
		assert.Equal(t, http.StatusAccepted, rec2.Code)
	}

	// 3. Complete upload - now async, returns job ID
	completeReq := bytes.NewBufferString(`{"uploadId":"test-upload-v1","name":"combined.txt","totalChunks":2}`)
	req3 := httptest.NewRequest(http.MethodPost, "/api/files/upload/complete", completeReq)
	req3.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec3 := httptest.NewRecorder()
	c3 := e.NewContext(req3, rec3)
	if assert.NoError(t, h.HandleCompleteUpload(c3)) {
		// Should return 202 Accepted with job ID
		assert.Equal(t, http.StatusAccepted, rec3.Code)
		assert.Contains(t, rec3.Body.String(), `"jobId"`)
		assert.Contains(t, rec3.Body.String(), `"status":"processing"`)
	}
}

func TestRecentFilesFiltering(t *testing.T) {
	e := echo.New()
	tmpDir := t.TempDir()
	store, _ := storage.NewLocalStore(tmpDir)
	sessionMgr := session.NewManager()
	uploadMgr := upload.NewManager(tmpDir, store)
	h := NewHandler(store, sessionMgr, uploadMgr, "")

	// Upload files with different extensions using the store directly
	// to avoid mocking the multipart file creation repeatedly
	files := []struct {
		name string
	}{
		{"test.log"},
		{"layout.xml"},
		{"rules.yaml"},
		{"config.yml"},
		{"another.log"},
	}

	for _, f := range files {
		data := bytes.NewBufferString("dummy content")
		_, err := store.Save(f.name, data)
		assert.NoError(t, err)
		// Small sleep to ensure order if needed, but store.List usually orders by time
		time.Sleep(10 * time.Millisecond)
	}

	// Call HandleRecentFiles
	req := httptest.NewRequest(http.MethodGet, "/api/files/recent", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	if assert.NoError(t, h.HandleRecentFiles(c)) {
		assert.Equal(t, http.StatusOK, rec.Code)

		body := rec.Body.String()
		// Should contain logs
		assert.Contains(t, body, "test.log")
		assert.Contains(t, body, "another.log")

		// Should NOT contain maps/rules
		assert.NotContains(t, body, "layout.xml")
		assert.NotContains(t, body, "rules.yaml")
		assert.NotContains(t, body, "config.yml")
	}
}

func TestSetActiveMap(t *testing.T) {
	e := echo.New()
	tmpDir := t.TempDir()
	store, _ := storage.NewLocalStore(tmpDir)
	sessionMgr := session.NewManager()
	uploadMgr := upload.NewManager(tmpDir, store)
	h := NewHandler(store, sessionMgr, uploadMgr, "")

	// 1. Upload a map
	data := bytes.NewBufferString(`<?xml version="1.0" ?><ConveyorMap><Object name="O1" type="T"><Size>1,1</Size><Location>0,0</Location></Object></ConveyorMap>`)
	info, err := store.Save("map1.xml", data)
	assert.NoError(t, err)

	// 2. Set active map
	reqBody := bytes.NewBufferString(fmt.Sprintf(`{"id":"%s"}`, info.ID))
	req := httptest.NewRequest(http.MethodPost, "/api/map/active", reqBody)
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	if assert.NoError(t, h.HandleSetActiveMap(c)) {
		assert.Equal(t, http.StatusOK, rec.Code)
	}

	// 3. Verify active map via GetMapLayout (mocking currentMapID behavior)
	// Since HandleGetMapLayout uses h.currentMapID which we just set
	reqGet := httptest.NewRequest(http.MethodGet, "/api/map/layout", nil)
	recGet := httptest.NewRecorder()
	cGet := e.NewContext(reqGet, recGet)
	if assert.NoError(t, h.HandleGetMapLayout(cGet)) {
		assert.Equal(t, http.StatusOK, recGet.Code)
		assert.Contains(t, recGet.Body.String(), info.ID)
	}
}
