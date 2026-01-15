package api

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/plc-visualizer/backend/internal/session"
	"github.com/plc-visualizer/backend/internal/storage"
	"github.com/stretchr/testify/assert"
)

func TestMapHandlers(t *testing.T) {
	e := echo.New()

	// Setup storage
	tmpDir := t.TempDir()
	store, _ := storage.NewLocalStore(tmpDir)
	sessionMgr := session.NewManager()
	h := NewHandler(store, sessionMgr)

	// 1. Initially no map
	req := httptest.NewRequest(http.MethodGet, "/api/map/layout", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	if assert.NoError(t, h.HandleGetMapLayout(c)) {
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Contains(t, rec.Body.String(), `"objects":{}`)
	}

	// 2. Upload map
	body := new(bytes.Buffer)
	writer := multipart.NewWriter(body)
	part, _ := writer.CreateFormFile("file", "test_map.xml")
	part.Write([]byte(`<?xml version="1.0" ?><ConveyorMap><Object name="O1" type="T"><Size>1,1</Size><Location>0,0</Location></Object></ConveyorMap>`))
	writer.Close()

	req = httptest.NewRequest(http.MethodPost, "/api/map/upload", body)
	req.Header.Set(echo.HeaderContentType, writer.FormDataContentType())
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
	h := NewHandler(store, sessionMgr)

	uploadID := "test-upload-v1"
	chunk1 := []byte("chunk one ")
	chunk2 := []byte("chunk two")

	// 1. Upload chunk 1
	body1 := new(bytes.Buffer)
	writer1 := multipart.NewWriter(body1)
	part1, _ := writer1.CreateFormFile("file", "blob")
	part1.Write(chunk1)
	writer1.Close()

	req1 := httptest.NewRequest(http.MethodPost, "/api/files/upload/chunk", body1)
	req1.Header.Set(echo.HeaderContentType, writer1.FormDataContentType())
	req1.Form = make(map[string][]string)
	req1.Form.Set("uploadId", uploadID)
	req1.Form.Set("chunkIndex", "0")
	rec1 := httptest.NewRecorder()
	c1 := e.NewContext(req1, rec1)
	if assert.NoError(t, h.HandleUploadChunk(c1)) {
		assert.Equal(t, http.StatusAccepted, rec1.Code)
	}

	// 2. Upload chunk 2
	body2 := new(bytes.Buffer)
	writer2 := multipart.NewWriter(body2)
	part2, _ := writer2.CreateFormFile("file", "blob")
	part2.Write(chunk2)
	writer2.Close()

	req2 := httptest.NewRequest(http.MethodPost, "/api/files/upload/chunk", body2)
	req2.Header.Set(echo.HeaderContentType, writer2.FormDataContentType())
	req2.Form = make(map[string][]string)
	req2.Form.Set("uploadId", uploadID)
	req2.Form.Set("chunkIndex", "1")
	rec2 := httptest.NewRecorder()
	c2 := e.NewContext(req2, rec2)
	if assert.NoError(t, h.HandleUploadChunk(c2)) {
		assert.Equal(t, http.StatusAccepted, rec2.Code)
	}

	// 3. Complete upload
	completeReq := bytes.NewBufferString(`{"uploadId":"test-upload-v1","name":"combined.txt","totalChunks":2}`)
	req3 := httptest.NewRequest(http.MethodPost, "/api/files/upload/complete", completeReq)
	req3.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec3 := httptest.NewRecorder()
	c3 := e.NewContext(req3, rec3)
	if assert.NoError(t, h.HandleCompleteUpload(c3)) {
		assert.Equal(t, http.StatusCreated, rec3.Code)
		assert.Contains(t, rec3.Body.String(), `"name":"combined.txt"`)
		assert.Contains(t, rec3.Body.String(), `"size":19`) // 10 + 9
	}
}
