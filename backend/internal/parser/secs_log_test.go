package parser

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// Test SECS-II sample data with SEND and RECV messages
const testSECSLogData = `@2026/06/29 06:24:27.255^INFO^SECS_II^SEND
TransactionTime : 2026/06/29 06:24:27.255 S6F11 W, S6F11 - Event Report - CEID 301. Port InServiceChanged [SystemByte = 93052]
 <L,3 [L0]
   <U2,1 0 [DataID]>
   <U2,1 301 [CEID]>
   <L,1 [Ln]
     <L,2 [Ln]
       <U2,1 20 [ReportID]>
       <L,1 [Ln]
         <L,2 [Ln]
           <A,15 B1ECNV21201-302 [Port ID]>
           <U2,1 3 [Port In Service State]>
         >
       >
     >
   >
 >.
@2026/06/29 06:24:27.255^INFO^SECS_II^RECV
TransactionTime : 2026/06/29 06:24:27.255 S6F12  S6F12 - Event Report Acknowledge (ERA) [SystemByte = 93052]
 <B,1 0 [ACKC6]>.
@2026/06/29 06:24:42.439^INFO^SECS_II^SEND
TransactionTime : 2026/06/29 06:24:42.439 S6F11 W, S6F11 - Event Report - CEID 643. Carrier ID Read Report [SystemByte = 93053]
 <L,3 [L0]
   <U2,1 0 [DataID]>
   <U2,1 643 [CEID]>
   <L,1 [L1]
     <L,2 [L2]
       <U2,1 38 [ReportID]>
       <L,2 [L3]
         <A,15 B1ECNV21201-302 [Location ID]>
         <L,1 [IDReadInfoList]
           <L,4 [IDReadInfo]
             <U2,1 1 [StackNo]>
             <A,53 RCAAL0009A/ZDPCDN87L26042406D/750/CN009685/2613200001 [CarrierId]>
             <U2,1 0 [IDReadStatus]>
             <A,2 FB [ScanType]>
           >
         >
       >
     >
   >
 >.
@2026/06/29 06:24:42.705^INFO^SECS_II^RECV
TransactionTime : 2026/06/29 06:24:42.705 S2F50  S2F50 - Enhanced Remote Command Acknowledge (ERCA) [SystemByte = 38593]
 <L,2 [L0]
   <B,1 4 [HCACK]>
   <L,0 [L2]>
 >.
`

// Test SECS-II SEND message with S2F49 (Enhanced Remote Command)
const testSECSLogS2 = `@2026/06/29 06:24:42.705^INFO^SECS_II^RECV
TransactionTime : 2026/06/29 06:24:42.705 S2F49 W, S2F49 - Enhanced Remote Command (ERC) [SystemByte = 38593]
 <L,4 []
   <U4,1 0 [DATAID]>
   <A,0  [OBJSPEC]>
   <A,8 TRANSFER [RCMD]>
   <L,4 [CPList]
     <L,2 []
       <A,11 COMMANDINFO [CPNAME]>
       <L,2 [CEPVAL]
         <L,2 []
           <A,9 COMMANDID [CPNAME]>
           <A,4 4903 [CPVAL]>
         >
         <L,2 []
           <A,8 PRIORITY [CPNAME]>
           <U2,1 50 [CPVAL]>
         >
       >
     >
     <L,2 []
       <A,12 TRANSFERINFO [CPNAME]>
       <L,3 [CEPVAL]
         <L,2 []
           <A,9 CARRIERID [CPNAME]>
           <A,53 RCAAL0009A/ZDPCDN87L26042406D/750/CN009685/2613200001 [CPVAL]>
         >
         <L,2 []
           <A,6 SOURCE [CPNAME]>
           <A,15 B1ECNV21201-302 [CPVAL]>
         >
         <L,2 [L333]
           <A,4 DEST [CPNAME]>
           <A,15 B1ECNV21201-402 [CPNAME]>
         >
       >
     >
     <L,2 []
       <A,16 CARRIERATTRIBUTE [CPNAME]>
       <L,2 [CEPVAL]
         <L,2 []
           <A,11 EMPTYSTATUS [CPNAME]>
           <U2,1 2 [CPVAL]>
         >
         <L,2 []
           <A,12 MATERIALCODE [CPNAME]>
           <A,0  [CPVAL]>
         >
       >
     >
     <L,2 []
       <A,16 CHILDCARRIERINFO [CPNAME]>
       <L,0 [CEPVAL]>
     >
   >
 >.
`

func TestSECSLogParser_Name(t *testing.T) {
	p := NewSECSLogParser()
	if p.Name() != "secs_log" {
		t.Errorf("expected 'secs_log', got '%s'", p.Name())
	}
}

func TestSECSLogParser_CanParse(t *testing.T) {
	p := NewSECSLogParser()

	// Create temp file with SECS data
	f, err := os.CreateTemp("", "secs_*.log")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(f.Name())

	if _, err := f.WriteString(testSECSLogData); err != nil {
		t.Fatal(err)
	}
	f.Close()

	can, err := p.CanParse(f.Name())
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("CanParse result for SECS data: %v", can)
	if !can {
		t.Error("expected CanParse to return true for SECS log data")
	}

	// Should reject non-SECS data
	f2, err := os.CreateTemp("", "non_secs_*.log")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(f2.Name())

	if _, err := f2.WriteString("2025-09-25 06:02:11.086 [INFO] [PLC-1@D19] [cat:signal] (bool) : true\n"); err != nil {
		t.Fatal(err)
	}
	f2.Close()

	can, err = p.CanParse(f2.Name())
	if err != nil {
		t.Fatal(err)
	}
	if can {
		t.Error("expected CanParse to return false for non-SECS data")
	}
}

func TestSECSLogParser_Parse(t *testing.T) {
	p := NewSECSLogParser()

	f, err := os.CreateTemp("", "secs_parse_*.log")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(f.Name())

	if _, err := f.WriteString(testSECSLogData); err != nil {
		t.Fatal(err)
	}
	f.Close()

	parsed, errs, err := p.Parse(f.Name())
	if err != nil {
		t.Fatal(err)
	}
	if len(errs) > 0 {
		t.Fatalf("unexpected parse errors: %v", errs)
	}

	// Should have 4 entries from the test data
	if len(parsed.Entries) != 4 {
		t.Errorf("expected 4 entries, got %d", len(parsed.Entries))
		for i, e := range parsed.Entries {
			t.Logf("  entry %d: deviceId=%s signalName=%s category=%s", i, e.DeviceID, e.SignalName, e.Category)
		}
	}

	// Check entry structure
	if len(parsed.Entries) > 0 {
		e := parsed.Entries[0]
		if e.DeviceID != "SECS" {
			t.Errorf("expected DeviceID='SECS', got '%s'", e.DeviceID)
		}
		if e.SignalName != "SECS" {
			t.Errorf("expected SignalName='SECS', got '%s'", e.SignalName)
		}
		if e.Category != "SEND" {
			t.Errorf("expected Category='SEND', got '%s'", e.Category)
		}
		if e.SignalType != "string" {
			t.Errorf("expected SignalType='string', got '%s'", e.SignalType)
		}
		if e.Timestamp.IsZero() {
			t.Error("expected non-zero timestamp")
		}
	}

	// Check first RECV entry
	if len(parsed.Entries) > 1 {
		e := parsed.Entries[1]
		if e.SignalName != "SECS" {
			t.Errorf("expected SignalName='SECS', got '%s'", e.SignalName)
		}
		if e.Category != "RECV" {
			t.Errorf("expected Category='RECV', got '%s'", e.Category)
		}
	}

	// Check that signals map has SECS::SECS (single signal name for both directions)
	expectedSignals := []string{"SECS::SECS"}
	for _, s := range expectedSignals {
		if _, ok := parsed.Signals[s]; !ok {
			t.Errorf("expected signal '%s' in parsed.Signals", s)
		}
	}
}

func TestSECSLogParser_ParseS2Message(t *testing.T) {
	p := NewSECSLogParser()

	f, err := os.CreateTemp("", "secs_s2_*.log")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(f.Name())

	if _, err := f.WriteString(testSECSLogS2); err != nil {
		t.Fatal(err)
	}
	f.Close()

	parsed, errs, err := p.Parse(f.Name())
	if err != nil {
		t.Fatal(err)
	}
	if len(errs) > 0 {
		t.Fatalf("unexpected parse errors: %v", errs)
	}

	if len(parsed.Entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(parsed.Entries))
	}

	e := parsed.Entries[0]
	if e.SignalName != "SECS" {
		t.Errorf("expected SignalName='SECS', got '%s'", e.SignalName)
	}
	if e.Category != "RECV" {
		t.Errorf("expected Category='RECV', got '%s'", e.Category)
	}
}

func TestSECSLogParser_ParseToDuckStore(t *testing.T) {
	p := NewSECSLogParser()

	f, err := os.CreateTemp("", "secs_duck_*.log")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(f.Name())

	if _, err := f.WriteString(testSECSLogData); err != nil {
		t.Fatal(err)
	}
	f.Close()

	// Use temp file for DuckDB
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.duckdb")
	store, err := NewDuckStoreAtPath(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	errs, err := p.ParseToDuckStore(f.Name(), store, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(errs) > 0 {
		t.Fatalf("unexpected parse errors: %v", errs)
	}

	store.Finalize()

	// Verify entries by counting via query
	if store.entryCount != 4 {
		t.Errorf("expected 4 entries in DuckStore, got %d", store.entryCount)
	}
}

func TestStreamFunctionParsing(t *testing.T) {
	tests := []struct {
		input  string
		stream int
		fn     int
		valid  bool
	}{
		{"S6F11", 6, 11, true},
		{"S2F49", 2, 49, true},
		{"S1F1", 1, 1, true},
		{"S127F255", 127, 255, true},
		{"S0F1", 0, 1, true},
		{"S1F0", 1, 0, true},
		{"", 0, 0, false},
		{"S", 0, 0, false},
		{"F11", 0, 0, false},
		{"6F11", 0, 0, false},
	}

	for _, tc := range tests {
		sf := parseStreamFunction(tc.input)
		if tc.valid {
			if sf == nil {
				t.Errorf("expected valid for %s", tc.input)
				continue
			}
			if sf.stream != tc.stream {
				t.Errorf("expected stream=%d for %s, got %d", tc.stream, tc.input, sf.stream)
			}
			if sf.fn != tc.fn {
				t.Errorf("expected function=%d for %s, got %d", tc.fn, tc.input, sf.fn)
			}
		} else {
			if sf != nil {
				t.Errorf("expected nil for %s, got stream=%d fn=%d", tc.input, sf.stream, sf.fn)
			}
		}
	}
}

func TestSECSNodeJSONSerialization(t *testing.T) {
	// Verify that SECSNode serializes to JSON properly via the LogEntry value
	p := NewSECSLogParser()

	f, err := os.CreateTemp("", "secs_json_*.log")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(f.Name())

	if _, err := f.WriteString(testSECSLogData); err != nil {
		t.Fatal(err)
	}
	f.Close()

	parsed, errs, err := p.Parse(f.Name())
	if err != nil {
		t.Fatal(err)
	}
	if len(errs) > 0 {
		t.Fatalf("parse errors: %v", errs)
	}
	if len(parsed.Entries) == 0 {
		t.Fatal("no entries parsed")
	}

	// The value should be a valid JSON string
	valStr, ok := parsed.Entries[0].Value.(string)
	if !ok {
		t.Fatalf("expected value to be string, got %T", parsed.Entries[0].Value)
	}

	// Basic JSON validation — should contain expected fields
	if len(valStr) < 10 {
		t.Fatalf("value too short: %s", valStr)
	}

	// Should contain key SECS fields
	for _, field := range []string{"streamFunction", "systemByte", "direction", "body"} {
		if !contains(valStr, field) {
			t.Errorf("expected JSON to contain '%s', value=%s", field, valStr)
		}
	}
}

// Test the SML parser directly with a simple case
func TestParseSECSBody(t *testing.T) {
	// Simple message body
	bodyLines := []string{
		"<L,2 [L0]",
		"  <U2,1 0 [DataID]>",
		"  <A,5 Hello [Name]>",
		">.",
	}

	node, err := parseSECSBody(bodyLines)
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}

	if node.Type != "L" {
		t.Errorf("expected Type='L', got '%s'", node.Type)
	}
	if node.Count != 2 {
		t.Errorf("expected Count=2, got %d", node.Count)
	}
	if node.Name != "L0" {
		t.Errorf("expected Name='L0', got '%s'", node.Name)
	}
	if len(node.Items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(node.Items))
	}

	child0 := node.Items[0]
	if child0.Type != "U2" {
		t.Errorf("expected child[0] Type='U2', got '%s'", child0.Type)
	}
	if child0.Value != "0" {
		t.Errorf("expected child[0] Value='0', got '%s'", child0.Value)
	}
	if child0.Name != "DataID" {
		t.Errorf("expected child[0] Name='DataID', got '%s'", child0.Name)
	}

	child1 := node.Items[1]
	if child1.Type != "A" {
		t.Errorf("expected child[1] Type='A', got '%s'", child1.Type)
	}
	if child1.Value != "Hello" {
		t.Errorf("expected child[1] Value='Hello', got '%s'", child1.Value)
	}
	if child1.Name != "Name" {
		t.Errorf("expected child[1] Name='Name', got '%s'", child1.Name)
	}
}

func TestEmptyList(t *testing.T) {
	// Test L,0 (empty list)
	bodyLines := []string{
		"<L,1 [L0]",
		"  <L,0 [Empty]>",
		">.",
	}

	node, err := parseSECSBody(bodyLines)
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}

	if len(node.Items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(node.Items))
	}

	emptyList := node.Items[0]
	if emptyList.Type != "L" {
		t.Errorf("expected empty list Type='L', got '%s'", emptyList.Type)
	}
	if emptyList.Count != 0 {
		t.Errorf("expected empty list Count=0, got %d", emptyList.Count)
	}
	if len(emptyList.Items) != 0 {
		t.Errorf("expected empty list to have 0 items, got %d", len(emptyList.Items))
	}
}

func TestTimeRange(t *testing.T) {
	p := NewSECSLogParser()

	f, err := os.CreateTemp("", "secs_tr_*.log")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(f.Name())

	if _, err := f.WriteString(testSECSLogData); err != nil {
		t.Fatal(err)
	}
	f.Close()

	parsed, errs, err := p.Parse(f.Name())
	if err != nil {
		t.Fatal(err)
	}
	if len(errs) > 0 {
		t.Fatalf("parse errors: %v", errs)
	}

	if parsed.TimeRange == nil {
		t.Fatal("expected non-nil TimeRange")
	}

	expectedStart := time.Date(2026, 6, 29, 6, 24, 27, 255000000, time.UTC)
	if !parsed.TimeRange.Start.Equal(expectedStart) {
		t.Errorf("expected start=%v, got %v", expectedStart, parsed.TimeRange.Start)
	}

	expectedEnd := time.Date(2026, 6, 29, 6, 24, 42, 705000000, time.UTC)
	if !parsed.TimeRange.End.Equal(expectedEnd) {
		t.Errorf("expected end=%v, got %v", expectedEnd, parsed.TimeRange.End)
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && searchString(s, substr)
}

func searchString(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
