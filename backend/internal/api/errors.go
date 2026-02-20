// errors.go - Structured error handling for API responses
package api

import (
	"fmt"
	"net/http"

	"github.com/labstack/echo/v4"
)

// APIError represents a structured API error response
type APIError struct {
	Status  int    `json:"-"`
	Code    string `json:"code"`
	Message string `json:"message"`
	Details string `json:"details,omitempty"`
}

// Error implements the error interface
func (e *APIError) Error() string {
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

// Error constructors for consistent error handling

// NewBadRequestError creates a 400 Bad Request error
func NewBadRequestError(message string, cause error) *APIError {
	err := &APIError{
		Status:  http.StatusBadRequest,
		Code:    "BAD_REQUEST",
		Message: message,
	}
	if cause != nil {
		err.Details = cause.Error()
	}
	return err
}

// NewValidationError creates a 400 validation error for a specific field
func NewValidationError(field string) *APIError {
	return &APIError{
		Status:  http.StatusBadRequest,
		Code:    "VALIDATION_ERROR",
		Message: fmt.Sprintf("validation failed for field: %s", field),
	}
}

// NewNotFoundError creates a 404 Not Found error
func NewNotFoundError(resource string, id string) *APIError {
	return &APIError{
		Status:  http.StatusNotFound,
		Code:    "NOT_FOUND",
		Message: fmt.Sprintf("%s not found: %s", resource, id),
	}
}

// NewConflictError creates a 409 Conflict error
func NewConflictError(message string) *APIError {
	return &APIError{
		Status:  http.StatusConflict,
		Code:    "CONFLICT",
		Message: message,
	}
}

// NewInternalError creates a 500 Internal Server Error
func NewInternalError(message string, cause error) *APIError {
	err := &APIError{
		Status:  http.StatusInternalServerError,
		Code:    "INTERNAL_ERROR",
		Message: message,
	}
	if cause != nil {
		err.Details = cause.Error()
	}
	return err
}

// NewServiceUnavailableError creates a 503 Service Unavailable error
func NewServiceUnavailableError(message string) *APIError {
	return &APIError{
		Status:  http.StatusServiceUnavailable,
		Code:    "SERVICE_UNAVAILABLE",
		Message: message,
	}
}

// ErrorHandler middleware for Echo
// Usage: e.HTTPErrorHandler = api.ErrorHandler
func ErrorHandler(err error, c echo.Context) {
	if c.Response().Committed {
		return
	}

	var apiErr *APIError

	switch e := err.(type) {
	case *APIError:
		apiErr = e
	case *echo.HTTPError:
		apiErr = &APIError{
			Status:  e.Code,
			Code:    "HTTP_ERROR",
			Message: fmt.Sprintf("%v", e.Message),
		}
	default:
		apiErr = &APIError{
			Status:  http.StatusInternalServerError,
			Code:    "UNKNOWN_ERROR",
			Message: "An unexpected error occurred",
		}
		// In development, include error details
		if isDevelopment() {
			apiErr.Details = err.Error()
		}
	}

	// Send JSON response
	if !c.Response().Committed {
		c.JSON(apiErr.Status, apiErr)
	}
}

// isDevelopment returns true if running in development mode
// This is a placeholder - implement based on your config
func isDevelopment() bool {
	// Check environment variable or config
	return true // Default to showing details for now
}

// RespondWithError is a helper to respond with an APIError
func RespondWithError(c echo.Context, err *APIError) error {
	return c.JSON(err.Status, err)
}
