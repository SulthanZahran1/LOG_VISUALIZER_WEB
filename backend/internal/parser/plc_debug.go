package parser

import (
	"bufio"
	"fmt"
	"os"
	"regexp"
	"strings"
	"sync"

	"github.com/plc-visualizer/backend/internal/models"
)

// PLCDebugParser handles bracket-delimited logs.
// Format: "YYYY-MM-DD HH:MM:SS.fff [Level] [path] [cat:signal] (dtype) : value"
type PLCDebugParser struct {
	lineRegex *regexp.Regexp
}

func NewPLCDebugParser() *PLCDebugParser {
	return &PLCDebugParser{
		lineRegex: regexp.MustCompile(`^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([^:\]]+):([^\]]+)\]\s+\(([^)]+)\)\s*:\s*(.*)\s*$`),
	}
}

func (p *PLCDebugParser) Name() string {
	return "plc_debug"
}

func (p *PLCDebugParser) CanParse(filePath string) (bool, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return false, err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	checked := 0
	matched := 0
	for scanner.Scan() && checked < 10 {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		checked++
		if p.lineRegex.MatchString(line) {
			matched++
		}
	}

	return checked > 0 && float64(matched)/float64(checked) >= 0.6, nil
}

func (p *PLCDebugParser) Parse(filePath string) (*models.ParsedLog, []*models.ParseError, error) {
	return p.ParseWithProgress(filePath, nil)
}

func (p *PLCDebugParser) ParseWithProgress(filePath string, onProgress ProgressCallback) (*models.ParsedLog, []*models.ParseError, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, nil, err
	}
	defer file.Close()

	// Get file size for progress calculation
	fileInfo, err := file.Stat()
	if err != nil {
		return nil, nil, err
	}
	totalBytes := fileInfo.Size()

	// Use compact columnar storage (6-7x memory reduction vs []LogEntry)
	store := NewCompactLogStore()
	errors := make([]*models.ParseError, 0, 100)

	// String interning for device IDs and signal names
	intern := GetGlobalIntern()

	scanner := bufio.NewScanner(file)
	// Increase buffer size for large log files (1MB instead of default 64KB)
	const maxScannerBuffer = 1024 * 1024 // 1MB
	scanner.Buffer(make([]byte, 0, maxScannerBuffer), maxScannerBuffer)
	lineNum := 0
	var bytesRead int64
	lastProgressUpdate := 0

	for scanner.Scan() {
		lineNum++
		line := scanner.Text()
		bytesRead += int64(len(line)) + 1 // +1 for newline

		if strings.TrimSpace(line) == "" {
			continue
		}

		entry, parseErr := p.parseLine(line, lineNum, intern)
		if parseErr != nil {
			errors = append(errors, parseErr)
			continue
		}

		// Add to compact storage instead of slice
		store.AddEntry(entry)

		// Report progress every 100K lines or 1% of file
		if onProgress != nil && lineNum%100000 == 0 && lineNum != lastProgressUpdate {
			lastProgressUpdate = lineNum
			onProgress(lineNum, bytesRead, totalBytes)
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, nil, err
	}

	// Final progress update
	if onProgress != nil {
		onProgress(lineNum, bytesRead, totalBytes)
	}

	// Convert compact storage to ParsedLog for API compatibility
	parsed := store.ToParsedLog()

	return parsed, errors, nil
}

// ParseToDuckStore parses directly into a DuckStore for memory-efficient large file handling.
// Uses parallel parsing with worker goroutines for speed.
func (p *PLCDebugParser) ParseToDuckStore(filePath string, store *DuckStore, onProgress ProgressCallback) ([]*models.ParseError, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	// Get file size for progress calculation
	fileInfo, err := file.Stat()
	if err != nil {
		return nil, err
	}
	totalBytes := fileInfo.Size()

	// Use multiple workers for parallel parsing
	numWorkers := 4
	type lineWork struct {
		lineNum int
		line    string
	}
	type parseResult struct {
		lineNum int
		entry   *models.LogEntry
		err     *models.ParseError
	}

	lineChan := make(chan lineWork, 10000)
	resultChan := make(chan parseResult, 10000)

	// Start worker goroutines
	var wg sync.WaitGroup
	for i := 0; i < numWorkers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			intern := GetGlobalIntern()
			for work := range lineChan {
				entry, parseErr := p.parseLine(work.line, work.lineNum, intern)
				resultChan <- parseResult{lineNum: work.lineNum, entry: entry, err: parseErr}
			}
		}()
	}

	// Close result channel when workers are done
	go func() {
		wg.Wait()
		close(resultChan)
	}()

	// Start result collector goroutine
	var errors []*models.ParseError
	var errMu sync.Mutex
	var collectWg sync.WaitGroup
	collectWg.Add(1)
	go func() {
		defer collectWg.Done()
		for result := range resultChan {
			if result.err != nil {
				errMu.Lock()
				errors = append(errors, result.err)
				errMu.Unlock()
			} else if result.entry != nil {
				store.AddEntry(result.entry)
			}
		}
	}()

	// Read file and send lines to workers
	scanner := bufio.NewScanner(file)
	const maxScannerBuffer = 1024 * 1024 // 1MB
	scanner.Buffer(make([]byte, 0, maxScannerBuffer), maxScannerBuffer)
	lineNum := 0
	var bytesRead int64
	lastProgressUpdate := int64(0)

	for scanner.Scan() {
		lineNum++
		line := scanner.Text()
		bytesRead += int64(len(line)) + 1

		if len(line) == 0 || line[0] == ' ' && len(strings.TrimSpace(line)) == 0 {
			continue
		}

		lineChan <- lineWork{lineNum: lineNum, line: line}

		// Report progress every ~1% of file
		if onProgress != nil && bytesRead-lastProgressUpdate > totalBytes/100 {
			lastProgressUpdate = bytesRead
			onProgress(lineNum, bytesRead, totalBytes)
		}
	}
	close(lineChan)

	if err := scanner.Err(); err != nil {
		return nil, err
	}

	// Wait for all results to be collected
	collectWg.Wait()

	// Check for DuckStore errors
	if err := store.LastError(); err != nil {
		return nil, fmt.Errorf("DuckDB write error: %w", err)
	}

	// Finalize: flush remaining batch and create indexes
	if err := store.Finalize(); err != nil {
		return nil, fmt.Errorf("DuckDB finalization error: %w", err)
	}

	// Final progress update
	if onProgress != nil {
		onProgress(lineNum, bytesRead, totalBytes)
	}

	return errors, nil
}

func (p *PLCDebugParser) parseLine(line string, lineNum int, intern *StringIntern) (*models.LogEntry, *models.ParseError) {
	// Try fast path first (bracket splitting)
	entry := p.fastParseLine(line, intern)
	if entry != nil {
		return entry, nil
	}

	// Fallback to regex
	m := p.lineRegex.FindStringSubmatch(line)
	if m == nil {
		return nil, &models.ParseError{
			Line:    lineNum,
			Content: line,
			Reason:  "line does not match PLC debug format",
		}
	}

	tsStr := m[1]
	// level := m[2]
	path := m[3]
	category := strings.TrimSpace(m[4])
	signal := m[5]
	dtypeToken := strings.ToLower(m[6])
	valueStr := m[7]

	ts, err := FastTimestamp(tsStr)
	if err != nil {
		return nil, &models.ParseError{Line: lineNum, Content: line, Reason: "invalid timestamp"}
	}

	deviceID := ExtractDeviceID(path)
	if deviceID == "" {
		return nil, &models.ParseError{Line: lineNum, Content: line, Reason: "device ID not found in path"}
	}

	// Intern device ID and signal name to reduce memory usage
	deviceID = intern.Intern(deviceID)
	signal = intern.Intern(signal)
	category = intern.Intern(category)

	stype := models.SignalType(dtypeToken)
	if stype != models.SignalTypeBoolean && stype != models.SignalTypeInteger && stype != models.SignalTypeString {
		// Infer if not standard
		stype = InferType(valueStr)
	}

	value := ParseValue(valueStr, stype)

	return &models.LogEntry{
		DeviceID:   deviceID,
		SignalName: signal,
		Timestamp:  ts,
		Value:      value,
		SignalType: stype,
		Category:   category,
	}, nil
}

func (p *PLCDebugParser) fastParseLine(line string, intern *StringIntern) *models.LogEntry {
	// Format: "YYYY-MM-DD HH:MM:SS.fff [Level] [path] [cat:signal] (dtype) : value"
	// Single-pass parsing: track positions as we go, no rescanning
	n := len(line)
	if n < 40 { // minimum possible line length
		return nil
	}

	// Find brackets and parens in a single pass
	var brackets [6]int // [open1, close1, open2, close2, open3, close3]
	var parenOpen, parenClose, colonAfterParen int
	bracketCount := 0
	colonInBracket3 := -1

	for i := 0; i < n; i++ {
		switch line[i] {
		case '[':
			if bracketCount < 3 {
				brackets[bracketCount*2] = i
			}
		case ']':
			if bracketCount < 3 {
				brackets[bracketCount*2+1] = i
				bracketCount++
			}
		case '(':
			if bracketCount == 3 && parenOpen == 0 {
				parenOpen = i
			}
		case ')':
			if parenOpen > 0 && parenClose == 0 {
				parenClose = i
			}
		case ':':
			if bracketCount == 2 && brackets[4] > 0 && colonInBracket3 == -1 && i > brackets[4] && i < brackets[5] {
				colonInBracket3 = i
			}
			if parenClose > 0 && colonAfterParen == 0 && i > parenClose {
				colonAfterParen = i
			}
		}
	}

	// Validate we found all required parts
	if bracketCount < 3 || parenOpen == 0 || parenClose == 0 || colonAfterParen == 0 || colonInBracket3 == -1 {
		return nil
	}

	// Extract fields without re-scanning
	tsStr := strings.TrimSpace(line[:brackets[0]])
	path := line[brackets[2]+1 : brackets[3]]
	category := strings.TrimSpace(line[brackets[4]+1 : colonInBracket3])
	signal := strings.TrimSpace(line[colonInBracket3+1 : brackets[5]])
	dtypeToken := strings.ToLower(strings.TrimSpace(line[parenOpen+1 : parenClose]))
	valueStr := strings.TrimSpace(line[colonAfterParen+1:])

	ts, err := FastTimestamp(tsStr)
	if err != nil {
		return nil
	}

	deviceID := ExtractDeviceID(path)
	if deviceID == "" {
		return nil
	}

	// Intern strings to reduce memory usage
	deviceID = intern.Intern(deviceID)
	signal = intern.Intern(signal)
	category = intern.Intern(category)

	stype := models.SignalType(dtypeToken)
	if stype != models.SignalTypeBoolean && stype != models.SignalTypeInteger && stype != models.SignalTypeString {
		stype = InferType(valueStr)
	}

	value := ParseValue(valueStr, stype)

	return &models.LogEntry{
		DeviceID:   deviceID,
		SignalName: signal,
		Timestamp:  ts,
		Value:      value,
		SignalType: stype,
		Category:   category,
	}
}
