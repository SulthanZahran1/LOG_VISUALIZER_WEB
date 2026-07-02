package parser

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/plc-visualizer/backend/internal/models"
)

// SECSNode represents a single SECS-II data item (recursive tree).
type SECSNode struct {
	Type  string      `json:"type"`            // "L", "U1", "U2", "U4", "U8", "I1", "I2", "I4", "I8", "A", "B", "F4", "F8", "BOOLEAN"
	Count int         `json:"count"`           // element count
	Value string      `json:"value,omitempty"` // for leaf items
	Name  string      `json:"name,omitempty"`  // field annotation e.g. "CEID", "DataID"
	Items []*SECSNode `json:"items,omitempty"` // for List type
}

// SECSMessage represents a fully parsed SECS-II log message.
type SECSMessage struct {
	Timestamp       time.Time `json:"timestamp"`
	Level           string    `json:"level"`
	Category        string    `json:"category"`
	Direction       string    `json:"direction"`     // "SEND" or "RECV"
	Stream          int       `json:"stream"`         // 6
	Function        int       `json:"function"`       // 11
	StreamFunction  string    `json:"streamFunction"` // "S6F11"
	WaitBit         bool      `json:"waitBit"`        // true
	SystemByte      int64     `json:"systemByte"`     // 93052
	CEID            int       `json:"ceid,omitempty"` // 301 (when present)
	MessageDesc     string    `json:"messageDesc"`    // "Event Report - CEID 301. Port InServiceChanged"
	Body            *SECSNode `json:"body"`           // parsed SML tree
}

// secsParseState tracks the state-machine position.
type secsParseState int

const (
	secsLooking secsParseState = iota // scanning for @header line
	secsHeader                        // reading TransactionTime line
	secsBody                          // buffering SML lines until >.
)

// SECSLogParser handles SECS-II log files with SML-like body format.
// Format:
//
//	@2026/06/29 06:24:27.255^INFO^SECS_II^SEND
//	TransactionTime : 2026/06/29 06:24:27.255 S6F11 W, S6F11 - Event Report - CEID 301. Port InServiceChanged [SystemByte = 93052]
//	 <L,3 [L0]
//	   <U2,1 0 [DataID]>
//	   ...
//	 >.
type SECSLogParser struct {
	headerRegex   *regexp.Regexp
	headerLineRx  *regexp.Regexp // matches @2026/06/29 06:24:27.255^INFO^SECS_II^SEND
	txTimeRx      *regexp.Regexp // matches TransactionTime line
}

func NewSECSLogParser() *SECSLogParser {
	return &SECSLogParser{
		headerLineRx: regexp.MustCompile(`^@(\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\^([^^]+)\^([^^]+)\^([^^]+)\s*$`),
		txTimeRx:      regexp.MustCompile(`TransactionTime\s*:\s*\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\s+(S\d+F\d+)\s*(?:W,\s*)?.*?\s+-\s+(.*?)(?:\s+\[SystemByte\s*=\s*(\d+)\])?\s*$`),
	}
}

func (p *SECSLogParser) Name() string {
	return "secs_log"
}

func (p *SECSLogParser) CanParse(filePath string) (bool, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return false, err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	checked := 0
	matched := 0
	for scanner.Scan() && checked < 20 {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		checked++
		if p.headerLineRx.MatchString(line) {
			matched++
		}
	}

	return matched > 0, nil
}

func (p *SECSLogParser) Parse(filePath string) (*models.ParsedLog, []*models.ParseError, error) {
	return p.ParseWithProgress(filePath, nil)
}

func (p *SECSLogParser) ParseWithProgress(filePath string, onProgress ProgressCallback) (*models.ParsedLog, []*models.ParseError, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, nil, err
	}
	defer file.Close()

	fileInfo, _ := file.Stat()
	if fileInfo != nil {
		_ = fileInfo.Size()
	}

	parsed := models.NewParsedLog()
	errors := make([]*models.ParseError, 0)
	intern := GetGlobalIntern()

	scanner := bufio.NewScanner(file)
	lineNum := 0
	var bytesRead int64

	for scanner.Scan() {
		lineNum++
		line := scanner.Text()
		bytesRead += int64(len(line)) + 1

		// Try to parse as SECS message
		msg, parseErr := p.parseMessageLines(line, scanner, &lineNum, &bytesRead)
		if parseErr != nil {
			errors = append(errors, parseErr)
			continue
		}
		if msg == nil {
			// Not a SECS header line — skip (could be trailing non-SECS data)
			continue
		}

		// Build LogEntry from SECSMessage
		// Single signal name 'SECS' — frontend splits into SEND/RECV lanes via Category field
		signalName := intern.Intern("SECS")
		deviceID := intern.Intern("SECS")
		intern.Intern(deviceID)

		// JSON-encode the SECS message for storage
		valBytes, _ := json.Marshal(msg)
		val := string(valBytes)

		entry := models.LogEntry{
			DeviceID:   deviceID,
			SignalName: signalName,
			Timestamp:  msg.Timestamp,
			Value:      val,
			SignalType: models.SignalTypeString,
			Category:   msg.Direction,
		}
		parsed.Entries = append(parsed.Entries, entry)
		parsed.Signals[deviceID+"::"+signalName] = struct{}{}
		parsed.Devices[deviceID] = struct{}{}
	}

	if len(parsed.Entries) > 0 {
		parsed.TimeRange = &models.TimeRange{
			Start: parsed.Entries[0].Timestamp,
			End:   parsed.Entries[len(parsed.Entries)-1].Timestamp,
		}
	}

	return parsed, errors, scanner.Err()
}

func (p *SECSLogParser) ParseToDuckStore(filePath string, store *DuckStore, onProgress ProgressCallback) ([]*models.ParseError, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	fileInfo, _ := file.Stat()
	totalBytes := int64(0)
	if fileInfo != nil {
		totalBytes = fileInfo.Size()
	}

	errors := make([]*models.ParseError, 0)
	intern := GetGlobalIntern()

	scanner := bufio.NewScanner(file)
	lineNum := 0
	var bytesRead int64

	for scanner.Scan() {
		lineNum++
		line := scanner.Text()
		bytesRead += int64(len(line)) + 1

		msg, parseErr := p.parseMessageLines(line, scanner, &lineNum, &bytesRead)
		if parseErr != nil {
			errors = append(errors, parseErr)
			continue
		}
		if msg == nil {
			continue
		}

		signalName := intern.Intern("SECS")
		deviceID := intern.Intern("SECS")

		valBytes, _ := json.Marshal(msg)
		val := string(valBytes)

		entry := models.LogEntry{
			DeviceID:   deviceID,
			SignalName: signalName,
			Timestamp:  msg.Timestamp,
			Value:      val,
			SignalType: models.SignalTypeString,
			Category:   msg.Direction,
		}
		store.AddEntry(&entry)

		if onProgress != nil && lineNum%10000 == 0 {
			onProgress(lineNum, bytesRead, totalBytes)
		}
	}

	if onProgress != nil {
		onProgress(lineNum, bytesRead, totalBytes)
	}

	return errors, scanner.Err()
}

// parseMessageLines implements the state machine: LOOKING → HEADER → BODY.
// It takes the first line already scanned, and may read more lines from the scanner.
func (p *SECSLogParser) parseMessageLines(firstLine string, scanner *bufio.Scanner, lineNum *int, bytesRead *int64) (*SECSMessage, *models.ParseError) {
	line := strings.TrimSpace(firstLine)

	// State 1: LOOKING — expect @header line
	headerMatch := p.headerLineRx.FindStringSubmatch(line)
	if headerMatch == nil {
		return nil, nil // skip non-matching lines silently
	}

	tsStr := headerMatch[1] // "2026/06/29 06:24:27.255"
	level := headerMatch[2]
	category := headerMatch[3]
	direction := headerMatch[4]

	// Parse timestamp: "2026/06/29 06:24:27.255" → normalize to "2026-06-29 06:24:27.255"
	tsNorm := strings.Replace(tsStr, "/", "-", -1)
	ts, err := FastTimestamp(tsNorm)
	if err != nil {
		// Fallback: try standard Go parse
		ts, err = time.Parse("2006/01/02 15:04:05.999999999", tsStr)
		if err != nil {
			return nil, &models.ParseError{
				Line:    *lineNum,
				Content: firstLine,
				Reason:  "invalid SECS timestamp: " + err.Error(),
			}
		}
	}

	// State 2: HEADER — read TransactionTime line
	if !scanner.Scan() {
		return nil, &models.ParseError{
			Line:    *lineNum,
			Content: firstLine,
			Reason:  "unexpected EOF after SECS header",
		}
	}
	*lineNum++
	txLine := scanner.Text()
	*bytesRead += int64(len(txLine)) + 1

	txMatch := p.txTimeRx.FindStringSubmatch(strings.TrimSpace(txLine))
	if txMatch == nil {
		return nil, &models.ParseError{
			Line:    *lineNum,
			Content: txLine,
			Reason:  "malformed TransactionTime line",
		}
	}

	sfCode := txMatch[1]    // "S6F11"
	msgDesc := strings.TrimSpace(txMatch[2]) // "Event Report - CEID 301. Port InServiceChanged"
	sysByteStr := ""
	if len(txMatch) > 3 {
		sysByteStr = txMatch[3]
	}

	// Parse stream/function from "S6F11"
	sf := parseStreamFunction(sfCode)
	if sf == nil {
		return nil, &models.ParseError{
			Line:    *lineNum,
			Content: txLine,
			Reason:  "invalid stream/function code: " + sfCode,
		}
	}

	var systemByte int64
	if sysByteStr != "" {
		systemByte, _ = strconv.ParseInt(sysByteStr, 10, 64)
	}

	// Extract CEID from description if present
	ceid := 0
	if ceidMatch := regexp.MustCompile(`CEID\s+(\d+)`).FindStringSubmatch(msgDesc); len(ceidMatch) > 1 {
		ceid, _ = strconv.Atoi(ceidMatch[1])
	}

	// State 3: BODY — buffer SML lines until >.
	var bodyLines []string
	for scanner.Scan() {
		*lineNum++
		bodyLine := scanner.Text()
		*bytesRead += int64(len(bodyLine)) + 1

		trimmed := strings.TrimSpace(bodyLine)
		bodyLines = append(bodyLines, trimmed)

		// Check for terminator: line ending with >.
		if strings.HasSuffix(trimmed, ">.") {
			break
		}
	}

	if len(bodyLines) == 0 {
		return nil, &models.ParseError{
			Line:    *lineNum,
			Content: txLine,
			Reason:  "unexpected EOF: no SECS message body found",
		}
	}

	// Parse the SML body using recursive descent
	body, parseErr := parseSECSBody(bodyLines)
	if parseErr != nil {
		return nil, &models.ParseError{
			Line:    *lineNum,
			Content: strings.Join(bodyLines, "\n"),
			Reason:  "SML body parse error: " + parseErr.Error(),
		}
	}

	// Detect W-bit from the txLine
	waitBit := strings.Contains(txLine, " W,")

	return &SECSMessage{
		Timestamp:      ts,
		Level:          level,
		Category:       category,
		Direction:      direction,
		Stream:         sf.stream,
		Function:       sf.fn,
		StreamFunction: sfCode,
		WaitBit:        waitBit,
		SystemByte:     systemByte,
		CEID:           ceid,
		MessageDesc:    msgDesc,
		Body:           body,
	}, nil
}

// streamFunc holds parsed stream and function codes.
type streamFunc struct {
	stream int
	fn     int
}

// parseStreamFunction parses "S6F11" into stream=6, function=11.
func parseStreamFunction(sf string) *streamFunc {
	if len(sf) < 3 || sf[0] != 'S' {
		return nil
	}
	// Find the F separator
	fIdx := strings.IndexByte(sf, 'F')
	if fIdx < 1 {
		return nil
	}
	streamStr := sf[1:fIdx]
	fnStr := sf[fIdx+1:]

	stream, err1 := strconv.Atoi(streamStr)
	fn, err2 := strconv.Atoi(fnStr)
	if err1 != nil || err2 != nil {
		return nil
	}
	if stream < 0 || stream > 127 || fn < 0 || fn > 255 {
		return nil
	}
	return &streamFunc{stream: stream, fn: fn}
}

// ──────────────────────────────────────────────────────────────
// Recursive Descent SML Body Parser
// ──────────────────────────────────────────────────────────────

// parseSECSBody parses a sequence of SML lines into a SECSNode tree.
// Lines are trimmed. The first line should be something like "<L,3 [L0]".
func parseSECSBody(lines []string) (*SECSNode, error) {
	if len(lines) == 0 {
		return nil, fmt.Errorf("empty body")
	}

	node, _, err := parseSMLNode(lines, 0)
	if err != nil {
		return nil, err
	}
	return node, nil
}

// parseSMLNode parses one node starting at line index idx.
// Returns the node, the next line index to read, and any error.
func parseSMLNode(lines []string, idx int) (*SECSNode, int, error) {
	if idx >= len(lines) {
		return nil, idx, fmt.Errorf("unexpected end of SML body")
	}

	line := strings.TrimSpace(lines[idx])
	if line == "" {
		// Skip blank lines
		return parseSMLNode(lines, idx+1)
	}

	// Check for closing bracket ">" or ">."
	if strings.HasPrefix(line, ">") {
		// Strip the ">" from the front — this closes the parent, skip it here.
		// If line is just ">" or ">.", we shouldn't be called for this.
		return nil, idx, fmt.Errorf("unexpected closing bracket at line %d: %s", idx, line)
	}

	// Must start with "<"
	if !strings.HasPrefix(line, "<") {
		return nil, idx, fmt.Errorf("expected '<' at line %d, got: %s", idx, line)
	}

	// Extract content inside <...>
	inner := line[1:]
	// Remove trailing ">" or ">." if self-closing on one line
	selfClosing := strings.HasSuffix(inner, ">")
	if strings.HasSuffix(inner, ">.") {
		selfClosing = true
		inner = inner[:len(inner)-2]
	} else if selfClosing {
		inner = inner[:len(inner)-1]
	}

	// Parse: Type,Count Value [Name]
	// Find comma after type
	commaIdx := strings.IndexByte(inner, ',')
	if commaIdx < 0 {
		return nil, idx, fmt.Errorf("expected comma after type at line %d: %s", idx, line)
	}

	typeStr := strings.TrimSpace(inner[:commaIdx]) // e.g. "L", "U2", "A"
	rest := strings.TrimSpace(inner[commaIdx+1:])

	// Find first space to split count from value/name
	var count int
	var afterCount string
	if spaceIdx := strings.IndexByte(rest, ' '); spaceIdx >= 0 {
		countStr := rest[:spaceIdx]
		c, err := strconv.Atoi(countStr)
		if err != nil {
			return nil, idx, fmt.Errorf("invalid count '%s' at line %d: %s", countStr, idx, line)
		}
		count = c
		afterCount = strings.TrimSpace(rest[spaceIdx+1:])
	} else {
		c, err := strconv.Atoi(rest)
		if err != nil {
			return nil, idx, fmt.Errorf("invalid count '%s' at line %d: %s", rest, idx, line)
		}
		count = c
		afterCount = ""
	}

	if typeStr == "L" || typeStr == "LIST" {
		// List node — children follow on subsequent lines
		node := &SECSNode{
			Type:  "L",
			Count: count,
		}

		// Extract optional [Name] from afterCount
		if strings.HasPrefix(afterCount, "[") {
			if endB := strings.IndexByte(afterCount, ']'); endB >= 0 {
				node.Name = afterCount[1:endB]
			}
		}

		if selfClosing {
			// Self-closing empty list: <L,0>
			return node, idx + 1, nil
		}

		// Recursively parse count children
		nextIdx := idx + 1
		for i := 0; i < count; i++ {
			if nextIdx >= len(lines) {
				return nil, nextIdx, fmt.Errorf("unexpected end of SML body while parsing list child %d/%d", i, count)
			}
			childLine := strings.TrimSpace(lines[nextIdx])

			// Skip blank lines
			if childLine == "" {
				nextIdx++
				i--
				continue
			}

			// Check for closing bracket — should not happen before all children parsed
			if strings.HasPrefix(childLine, ">") {
				return nil, nextIdx, fmt.Errorf("unexpected closing bracket before parsing all %d list children (got %d): %s", count, i, childLine)
			}

			child, newIdx, err := parseSMLNode(lines, nextIdx)
			if err != nil {
				return nil, newIdx, fmt.Errorf("child %d/%d: %w", i+1, count, err)
			}
			node.Items = append(node.Items, child)
			nextIdx = newIdx
		}

		// After parsing all children, expect ">" or ">." to close this list
		if nextIdx >= len(lines) {
			return nil, nextIdx, fmt.Errorf("unexpected end of SML body after list children")
		}

		closeLine := strings.TrimSpace(lines[nextIdx])
		if !strings.HasPrefix(closeLine, ">") {
			return nil, nextIdx, fmt.Errorf("expected '>' to close list, got: %s", closeLine)
		}

		// If this is the terminator (">.") AND we're at the outermost level,
		// the remaining dot is consumed here
		return node, nextIdx + 1, nil
	}

	// Leaf node — everything on one line
	node := &SECSNode{
		Type:  typeStr,
		Count: count,
	}

	// Parse value and optional [Name]
	// afterCount could be: "0 [DataID]" or "B1ECNV21201-302 [Port ID]" or "0" or "0 [CEID]"
	if strings.HasPrefix(afterCount, "[") {
		// No value, just name: "[L0]"
		if endB := strings.IndexByte(afterCount, ']'); endB >= 0 {
			node.Name = afterCount[1:endB]
		}
	} else {
		// Has value, possibly with name
		if bracketIdx := strings.Index(afterCount, " ["); bracketIdx >= 0 {
			node.Value = strings.TrimSpace(afterCount[:bracketIdx])
			namePart := afterCount[bracketIdx+2:]
			if endB := strings.IndexByte(namePart, ']'); endB >= 0 {
				node.Name = namePart[:endB]
			}
		} else if bracketIdx := strings.Index(afterCount, "["); bracketIdx >= 0 {
			node.Value = strings.TrimSpace(afterCount[:bracketIdx])
			namePart := afterCount[bracketIdx+1:]
			if endB := strings.IndexByte(namePart, ']'); endB >= 0 {
				node.Name = namePart[:endB]
			}
		} else {
			node.Value = afterCount
		}
	}

	nextIdx := idx + 1

	// If this was the terminator (">."), the function properly consumed it.
	// No special action needed here since the close is handled by the parent.

	return node, nextIdx, nil
}

// Must implement models interface satisfaction
var _ Parser = (*SECSLogParser)(nil)
