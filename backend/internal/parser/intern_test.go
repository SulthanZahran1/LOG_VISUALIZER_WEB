package parser

import (
	"testing"
)

func TestStringIntern(t *testing.T) {
	si := NewStringIntern()

	// Test basic interning
	s1 := si.Intern("hello")
	s2 := si.Intern("hello")
	if s1 != s2 {
		t.Error("Expected same pointer for interned strings")
	}

	// Test different strings
	s3 := si.Intern("world")
	if s1 == s3 {
		t.Error("Expected different pointers for different strings")
	}

	// Test pool size
	if si.Len() != 2 {
		t.Errorf("Expected pool size 2, got %d", si.Len())
	}

	// Test clear
	si.Clear()
	if si.Len() != 0 {
		t.Errorf("Expected pool size 0 after clear, got %d", si.Len())
	}
}

func TestStringInternBytes(t *testing.T) {
	si := NewStringIntern()

	b := []byte("test-bytes")
	s1 := si.InternBytes(b)
	s2 := si.Intern("test-bytes")

	if s1 != s2 {
		t.Error("Expected InternBytes to return same string as Intern")
	}
}

func TestGlobalIntern(t *testing.T) {
	// Reset global pool
	ResetGlobalIntern()

	s1 := GetGlobalIntern().Intern("global-test")
	s2 := GetGlobalIntern().Intern("global-test")

	if s1 != s2 {
		t.Error("Expected global intern to deduplicate")
	}
}

// Benchmark interning performance
func BenchmarkStringIntern(b *testing.B) {
	si := NewStringIntern()
	testStrings := []string{
		"B1ACNV13301-102",
		"B1ACNV13301-103",
		"B1ACNV13301-104",
		"I_MOVE_IN",
		"I_MOVE_OUT",
		"O_BUFFER_STATUS",
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		si.Intern(testStrings[i%len(testStrings)])
	}
}

// Benchmark interning with duplicates (typical log scenario)
func BenchmarkStringInternDuplicates(b *testing.B) {
	si := NewStringIntern()
	// Pre-populate with common device IDs
	for i := 0; i < 100; i++ {
		si.Intern("DEVICE-" + string(rune('A'+i%26)))
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		// 90% of lookups are for existing strings (typical log pattern)
		si.Intern("DEVICE-A")
	}
}
