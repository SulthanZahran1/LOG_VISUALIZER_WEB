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
