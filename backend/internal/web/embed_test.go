package web

import (
	"io/fs"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/labstack/echo/v4"
)

func TestGetFileSystemContainsIndex(t *testing.T) {
	staticFS, err := GetFileSystem()
	if err != nil {
		t.Fatalf("GetFileSystem() error = %v", err)
	}

	b, err := fs.ReadFile(staticFS, "index.html")
	if err != nil {
		t.Fatalf("expected embedded index.html, got error: %v", err)
	}
	if len(b) == 0 {
		t.Fatalf("embedded index.html should not be empty")
	}
}

func TestHasEmbeddedFiles(t *testing.T) {
	if !HasEmbeddedFiles() {
		t.Fatalf("expected HasEmbeddedFiles() to be true for embedded dist assets")
	}
}

func TestGetEmbeddedFile(t *testing.T) {
	f, err := GetEmbeddedFile("index.html")
	if err != nil {
		t.Fatalf("expected embedded index.html file, got error: %v", err)
	}
	_ = f.Close()

	if _, err := GetEmbeddedFile("does-not-exist.txt"); err == nil {
		t.Fatalf("expected error when requesting non-existent embedded file")
	}
}

func TestServeIndexHTML(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	indexFS := fstest.MapFS{
		"index.html": &fstest.MapFile{Data: []byte("<!doctype html><title>ok</title>")},
	}
	if err := serveIndexHTML(c, indexFS); err != nil {
		t.Fatalf("serveIndexHTML() unexpected error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "<title>ok</title>") {
		t.Fatalf("unexpected body: %q", rec.Body.String())
	}
}

func TestServeIndexHTMLMissingFile(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	err := serveIndexHTML(c, fstest.MapFS{})
	if err == nil {
		t.Fatalf("expected 404 HTTP error when index.html is missing")
	}

	httpErr, ok := err.(*echo.HTTPError)
	if !ok {
		t.Fatalf("expected *echo.HTTPError, got %T", err)
	}
	if httpErr.Code != http.StatusNotFound {
		t.Fatalf("expected 404 code, got %d", httpErr.Code)
	}
}

func TestRegisterStaticRoutesServesStaticFile(t *testing.T) {
	e := echo.New()
	if err := RegisterStaticRoutes(e); err != nil {
		t.Fatalf("RegisterStaticRoutes() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/vite.svg", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "<svg") {
		t.Fatalf("expected SVG payload, got: %q", rec.Body.String())
	}
}

func TestRegisterStaticRoutesFallsBackToIndexForSPARoute(t *testing.T) {
	e := echo.New()
	if err := RegisterStaticRoutes(e); err != nil {
		t.Fatalf("RegisterStaticRoutes() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/logs/session/abc-123", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}
	if !strings.Contains(strings.ToLower(rec.Body.String()), "<!doctype html>") {
		t.Fatalf("expected index html fallback body")
	}
}

func TestRegisterStaticRoutesDoesNotOverrideExistingAPIRoute(t *testing.T) {
	e := echo.New()
	e.GET("/api/health", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	})
	if err := RegisterStaticRoutes(e); err != nil {
		t.Fatalf("RegisterStaticRoutes() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"status":"ok"`) {
		t.Fatalf("expected API response body, got %q", rec.Body.String())
	}
}
