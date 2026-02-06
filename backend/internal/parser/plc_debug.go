package parser

import (
	"bufio"
	"fmt"
	"os"
	"regexp"
	"runtime"
	"strings"
	"time"

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
	isFirstLine := true
	for scanner.Scan() && checked < 10 {
		line := scanner.Text()

		// Strip UTF-8 BOM from first line if present
		if isFirstLine {
			if len(line) >= 3 && line[0] == 0xEF && line[1] == 0xBB && line[2] == 0xBF {
				line = line[3:]
			}
			isFirstLine = false
		}

		line = strings.TrimSpace(line)
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
func (p *PLCDebugParser) ParseToDuckStore(filePath string, store *DuckStore, onProgress ProgressCallback) ([]*models.ParseError, error) {
	fmt.Printf("[Parse] Opening file: %s\n", filePath)
	file, err := os.Open(filePath)
	if err != nil {
		fmt.Printf("[Parse] ERROR opening file: %v\n", err)
		return nil, err
	}
	defer file.Close()

	// Get file size for progress calculation
	fileInfo, err := file.Stat()
	if err != nil {
		fmt.Printf("[Parse] ERROR getting file info: %v\n", err)
		return nil, err
	}
	totalBytes := fileInfo.Size()
	fmt.Printf("[Parse] File size: %d bytes (%.1f MB)\n", totalBytes, float64(totalBytes)/1024/1024)

	errors := make([]*models.ParseError, 0, 100)
	fmt.Printf("[Parse] Getting global string intern...\n")
	intern := GetGlobalIntern()
	fmt.Printf("[Parse] String intern ready\n")

	scanner := bufio.NewScanner(file)
	const maxScannerBuffer = 4 * 1024 * 1024 // 4MB - increased just in case
	scanner.Buffer(make([]byte, 0, maxScannerBuffer), maxScannerBuffer)

	// Print memory stats before starting
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)
	fmt.Printf("[Parse] Scanner initialized with %d byte buffer\n", maxScannerBuffer)
	fmt.Printf("[Parse] Memory before loop: Alloc=%.1fMB, Sys=%.1fMB, HeapInuse=%.1fMB\n",
		float64(memStats.Alloc)/1024/1024,
		float64(memStats.Sys)/1024/1024,
		float64(memStats.HeapInuse)/1024/1024)
	os.Stdout.Sync() // Force flush

	lineNum := 0
	var bytesRead int64
	lastProgressUpdate := int64(0)
	successCount := 0
	parseErrorCount := 0
	emptyLineCount := 0
	lastLogLines := 0
	loopStartTime := time.Now()

	// Log first scan attempt
	fmt.Printf("[Parse] Attempting first scanner.Scan()...\n")
	os.Stdout.Sync() // Force flush before potentially slow operation

	for scanner.Scan() {
		lineNum++

		// Verbose logging for first few lines
		if lineNum <= 5 {
			elapsed := time.Since(loopStartTime)
			fmt.Printf("[Parse] Line %d: scanner.Scan() returned after %v, reading text...\n", lineNum, elapsed)
			os.Stdout.Sync()
		}

		line := scanner.Text()
		bytesRead += int64(len(line)) + 1

		// Strip UTF-8 BOM from first line if present
		if lineNum == 1 && len(line) >= 3 && line[0] == 0xEF && line[1] == 0xBB && line[2] == 0xBF {
			line = line[3:]
			fmt.Printf("[Parse] Stripped UTF-8 BOM from first line\n")
		}

		if lineNum <= 5 {
			linePreview := line
			if len(linePreview) > 100 {
				linePreview = linePreview[:100] + "..."
			}
			fmt.Printf("[Parse] Line %d: len=%d, preview=%q\n", lineNum, len(line), linePreview)
			os.Stdout.Sync()
		}

		if len(line) == 0 {
			emptyLineCount++
			continue
		}

		if lineNum <= 5 {
			fmt.Printf("[Parse] Line %d: calling parseLine...\n", lineNum)
			os.Stdout.Sync()
		}

		entry, parseErr := p.parseLine(line, lineNum, intern)

		if lineNum <= 5 {
			fmt.Printf("[Parse] Line %d: parseLine returned, parseErr=%v\n", lineNum, parseErr != nil)
			os.Stdout.Sync()
		}

		if parseErr != nil {
			parseErrorCount++
			errors = append(errors, parseErr)
			// Log first 5 parse errors with details
			if parseErrorCount <= 5 {
				linePreview := line
				if len(linePreview) > 200 {
					linePreview = linePreview[:200] + "..."
				}
				fmt.Printf("[Parse] Parse error #%d at line %d: %s (line: %q)\n", parseErrorCount, lineNum, parseErr.Reason, linePreview)
				os.Stdout.Sync()
			}
			continue
		}

		if lineNum <= 5 {
			fmt.Printf("[Parse] Line %d: calling store.AddEntry...\n", lineNum)
			os.Stdout.Sync()
		}

		store.AddEntry(entry)
		successCount++

		if lineNum <= 5 {
			fmt.Printf("[Parse] Line %d: AddEntry complete\n", lineNum)
			os.Stdout.Sync()
		}

		// Log first 10 successful entries
		if successCount <= 10 {
			fmt.Printf("[Parse] Entry %d (line %d): %s::%s = %v\n", successCount, lineNum, entry.DeviceID, entry.SignalName, entry.Value)
			os.Stdout.Sync()
		}

		// Check for DuckStore errors periodically
		if successCount%10000 == 0 {
			if err := store.LastError(); err != nil {
				fmt.Printf("[Parse] DuckDB write error at line %d: %v\n", lineNum, err)
				return nil, fmt.Errorf("DuckDB write error at line %d: %w", lineNum, err)
			}
		}

		// Log progress every 100K lines (in addition to progress callback)
		if lineNum-lastLogLines >= 100000 {
			lastLogLines = lineNum
			elapsed := time.Since(loopStartTime)
			pct := float64(bytesRead) / float64(totalBytes) * 100

			// Get memory stats
			runtime.ReadMemStats(&memStats)
			fmt.Printf("[Parse] Progress: %d lines (%.1f%%), %d entries, %d errors, %d empty, elapsed=%v, mem=%.1fMB\n",
				lineNum, pct, successCount, parseErrorCount, emptyLineCount, elapsed, float64(memStats.Alloc)/1024/1024)
			os.Stdout.Sync()
		}

		// Report progress every ~1% of file
		if onProgress != nil && bytesRead-lastProgressUpdate > totalBytes/100 {
			lastProgressUpdate = bytesRead
			onProgress(lineNum, bytesRead, totalBytes)
		}
	}

	totalElapsed := time.Since(loopStartTime)
	fmt.Printf("[Parse] Scanner loop finished after %v. Checking for scanner error...\n", totalElapsed)
	os.Stdout.Sync()

	if err := scanner.Err(); err != nil {
		fmt.Printf("[Parse] Scanner error: %v\n", err)
		return nil, err
	}

	// Final memory stats
	runtime.ReadMemStats(&memStats)
	linesPerSec := float64(lineNum) / totalElapsed.Seconds()
	fmt.Printf("[Parse] Complete: %d lines, %d entries, %d errors, %d empty\n", lineNum, successCount, parseErrorCount, emptyLineCount)
	fmt.Printf("[Parse] Performance: %.0f lines/sec, final mem=%.1fMB\n", linesPerSec, float64(memStats.Alloc)/1024/1024)
	os.Stdout.Sync()

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
	inBracket3 := false // track if we're currently inside the 3rd bracket

	for i := 0; i < n; i++ {
		switch line[i] {
		case '[':
			if bracketCount < 3 {
				brackets[bracketCount*2] = i
				if bracketCount == 2 {
					inBracket3 = true // entering 3rd bracket
				}
			}
		case ']':
			if bracketCount < 3 {
				brackets[bracketCount*2+1] = i
				if inBracket3 {
					inBracket3 = false // leaving 3rd bracket
				}
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
			if inBracket3 && colonInBracket3 == -1 {
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
