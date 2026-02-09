// Package web provides embedded frontend static files for air-gapped deployment.
package web

import (
	"embed"
	"io"
	"io/fs"
	"net/http"
	"path"
	"strings"

	"github.com/labstack/echo/v4"
)

//go:embed dist/*
var staticFiles embed.FS

// GetFileSystem returns the embedded filesystem with the dist folder as root.
func GetFileSystem() (fs.FS, error) {
	return fs.Sub(staticFiles, "dist")
}

// RegisterStaticRoutes registers the frontend static file routes with Echo.
// The API routes should be registered before calling this function.
func RegisterStaticRoutes(e *echo.Echo) error {
	staticFS, err := GetFileSystem()
	if err != nil {
		return err
	}

	// Create a file server from the embedded filesystem
	fileServer := http.FileServer(http.FS(staticFS))

	// Serve static files for all non-API routes
	e.GET("/*", func(c echo.Context) error {
		requestPath := c.Request().URL.Path
		
		// Clean the path
		requestPath = path.Clean(requestPath)
		if requestPath == "." {
			requestPath = "/"
		}
		
		// Try to open the file directly first
		file, err := staticFS.Open(strings.TrimPrefix(requestPath, "/"))
		if err != nil {
			// File not found - this is likely a frontend route (SPA)
			// Serve index.html and let the frontend router handle it
			return serveIndexHTML(c, staticFS)
		}
		defer file.Close()
		
		// Check if it's a directory
		stat, err := file.Stat()
		if err != nil {
			return serveIndexHTML(c, staticFS)
		}
		
		if stat.IsDir() {
			// Try to serve index.html from the directory
			indexPath := path.Join(requestPath, "index.html")
			indexFile, err := staticFS.Open(strings.TrimPrefix(indexPath, "/"))
			if err != nil {
				// No index.html, serve the main index.html (SPA fallback)
				return serveIndexHTML(c, staticFS)
			}
			indexFile.Close()
			// Serve the directory's index.html through the file server
			fileServer.ServeHTTP(c.Response(), c.Request())
			return nil
		}
		
		// It's a file, serve it directly
		fileServer.ServeHTTP(c.Response(), c.Request())
		return nil
	})

	return nil
}

// serveIndexHTML serves the main index.html for SPA routing
func serveIndexHTML(c echo.Context, staticFS fs.FS) error {
	indexFile, err := staticFS.Open("index.html")
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "index.html not found")
	}
	defer indexFile.Close()
	
	content, err := io.ReadAll(indexFile)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to read index.html")
	}
	
	return c.HTMLBlob(http.StatusOK, content)
}

// HasEmbeddedFiles returns true if the frontend has been built and embedded.
func HasEmbeddedFiles() bool {
	entries, err := staticFiles.ReadDir("dist")
	if err != nil {
		return false
	}
	// Check if index.html exists
	for _, entry := range entries {
		if entry.Name() == "index.html" {
			return true
		}
	}
	return false
}

// GetEmbeddedFile returns a specific file from the embedded filesystem.
// Used for testing or direct file access.
func GetEmbeddedFile(name string) (fs.File, error) {
	staticFS, err := GetFileSystem()
	if err != nil {
		return nil, err
	}
	return staticFS.Open(name)
}
