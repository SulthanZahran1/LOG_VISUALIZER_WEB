// Package parser provides string interning for log parsing optimization.
// String interning dramatically reduces memory usage for log files where
// the same device IDs and signal names appear millions of times.
package parser

import (
	"sync"
)

// StringIntern provides thread-safe string interning.
// Interning ensures that equal strings share the same memory address,
// reducing memory usage significantly for repetitive data like log files.
type StringIntern struct {
	mu   sync.RWMutex
	pool map[string]string
}

// NewStringIntern creates a new string interner.
func NewStringIntern() *StringIntern {
	return &StringIntern{
		pool: make(map[string]string, 10000),
	}
}

// MaxInternPoolSize limits the intern pool to prevent unbounded memory growth.
// For very large files with many unique strings, we stop interning after this limit.
const MaxInternPoolSize = 500000

// Intern returns the canonical version of the string.
// If the string already exists in the pool, returns the pooled version.
// Otherwise, stores and returns the provided string.
// If the pool has reached MaxInternPoolSize, returns the string without storing.
func (si *StringIntern) Intern(s string) string {
	// Fast path: read lock
	si.mu.RLock()
	if pooled, ok := si.pool[s]; ok {
		si.mu.RUnlock()
		return pooled
	}
	// Check size limit under read lock first (fast path)
	if len(si.pool) >= MaxInternPoolSize {
		si.mu.RUnlock()
		return s
	}
	si.mu.RUnlock()

	// Slow path: write lock
	si.mu.Lock()
	// Double-check after acquiring write lock
	if pooled, ok := si.pool[s]; ok {
		si.mu.Unlock()
		return pooled
	}
	// Check size limit again under write lock
	if len(si.pool) >= MaxInternPoolSize {
		si.mu.Unlock()
		return s
	}
	// Store the string as the canonical version
	si.pool[s] = s
	si.mu.Unlock()
	return s
}

// InternBytes interns a byte slice by converting it to a string.
// This avoids an allocation if the string already exists.
func (si *StringIntern) InternBytes(b []byte) string {
	// Fast path: check without allocation
	si.mu.RLock()
	for k := range si.pool {
		if string(b) == k {
			si.mu.RUnlock()
			return k
		}
	}
	si.mu.RUnlock()

	// Slow path: convert and store
	s := string(b)
	return si.Intern(s)
}

// Len returns the number of unique strings in the pool.
func (si *StringIntern) Len() int {
	si.mu.RLock()
	defer si.mu.RUnlock()
	return len(si.pool)
}

// Clear removes all interned strings.
func (si *StringIntern) Clear() {
	si.mu.Lock()
	defer si.mu.Unlock()
	si.pool = make(map[string]string, 10000)
}

// Global intern pool for parsers to share.
// Using a global pool allows deduplication across multiple files in multi-file sessions.
var globalIntern = NewStringIntern()

// GetGlobalIntern returns the global string interner.
func GetGlobalIntern() *StringIntern {
	return globalIntern
}

// ResetGlobalIntern clears the global intern pool.
// Call this between major operations to free memory.
func ResetGlobalIntern() {
	globalIntern.Clear()
}
