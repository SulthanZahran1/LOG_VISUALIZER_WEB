// cross_contamination_test.go - Tests for cross-parser contamination, merged sessions, and registry integrity
package parser

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/plc-visualizer/backend/internal/models"
)

// Short SECS sample (first 2 messages from testSECSLogData) for merged session tests
const shortSECSData = `@2026/06/29 06:24:27.255^INFO^SECS_II^SEND
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
`

// PLC sample data for cross-contamination tests
const plcSampleData = `2024-01-15 10:30:45.123 [INFO] [/PLC/Device1] [CATEGORY:Signal1] (bool) : TRUE
2024-01-15 10:30:46.234 [DEBUG] [/PLC/Device2] [CAT:Signal2] (int) : 42
2024-01-15 10:30:47.345 [INFO] [/PLC/Device1] [CATEGORY:Signal1] (bool) : FALSE
`

// MCS sample data for cross-contamination tests
const mcsSampleData = `2024-01-15 10:30:45.123 [ADD=CARRIER001, CMD001] [Priority=1] [TransferState=WAITING] [IsBoost=false]
2024-01-15 10:30:46.234 [UPDATE=CARRIER001] [TransferState=ACTIVE] [WaitCount=5]
2024-01-15 10:30:47.345 [REMOVE=CARRIER001] [ResultCode=SUCCESS]
`

// Short PLC data for merged session tests (2 entries)
const shortPLCSample = `2024-01-15 10:30:45.123 [INFO] [/PLC/Device1] [CATEGORY:Signal1] (bool) : TRUE
2024-01-15 10:30:46.234 [DEBUG] [/PLC/Device2] [CAT:Signal2] (int) : 42
`

// Short MCS data for merged session tests (2 entries)
const shortMCSSample = `2024-01-15 10:30:45.123 [ADD=CARRIER001, CMD001] [Priority=1] [TransferState=WAITING] [IsBoost=false]
2024-01-15 10:30:46.234 [UPDATE=CARRIER001] [TransferState=ACTIVE] [WaitCount=5]
`

// ============ Cross-Contamination: Own-Format Recognition ============

func TestSECSCanParseOwnFormat(t *testing.T) {
	parser := NewSECSLogParser()
	// Use the full testSECSLogData from secs_log_test.go (same package)
	filePath := createTestFile(t, testSECSLogData)
	canParse, err := parser.CanParse(filePath)

	if err != nil {
		t.Fatalf("SECS CanParse failed: %v", err)
	}
	if !canParse {
		t.Error("SECS parser CanParse should return true for SECS format file")
	}
}

func TestPLCCanParseOwnFormat(t *testing.T) {
	parser := NewPLCDebugParser()
	filePath := createTestFile(t, plcSampleData)
	canParse, err := parser.CanParse(filePath)

	if err != nil {
		t.Fatalf("PLC CanParse failed: %v", err)
	}
	if !canParse {
		t.Error("PLC parser CanParse should return true for PLC debug format file")
	}
}

func TestMCSCCanParseOwnFormat(t *testing.T) {
	parser := NewMCSLogParser()
	filePath := createTestFile(t, mcsSampleData)
	canParse, err := parser.CanParse(filePath)

	if err != nil {
		t.Fatalf("MCS CanParse failed: %v", err)
	}
	if !canParse {
		t.Error("MCS parser CanParse should return true for MCS format file")
	}
}

// ============ Cross-Contamination: False Positives ============

func TestSECSDoesNotFalsePositiveOnPLC(t *testing.T) {
	parser := NewSECSLogParser()
	filePath := createTestFile(t, plcSampleData)
	canParse, err := parser.CanParse(filePath)

	if err != nil {
		t.Fatalf("SECS CanParse on PLC data failed: %v", err)
	}
	if canParse {
		t.Error("SECS parser CanParse should return false for PLC debug format file (no @ header)")
	}
}

func TestSECSDoesNotFalsePositiveOnMCS(t *testing.T) {
	parser := NewSECSLogParser()
	filePath := createTestFile(t, mcsSampleData)
	canParse, err := parser.CanParse(filePath)

	if err != nil {
		t.Fatalf("SECS CanParse on MCS data failed: %v", err)
	}
	if canParse {
		t.Error("SECS parser CanParse should return false for MCS format file (no @ header)")
	}
}

func TestPLCDoesNotFalsePositiveOnSECS(t *testing.T) {
	parser := NewPLCDebugParser()
	filePath := createTestFile(t, testSECSLogData)
	canParse, err := parser.CanParse(filePath)

	if err != nil {
		t.Fatalf("PLC CanParse on SECS data failed: %v", err)
	}
	if canParse {
		t.Error("PLC parser CanParse should return false for SECS format file")
	}
}

func TestPLCDoesNotFalsePositiveOnMCS(t *testing.T) {
	parser := NewPLCDebugParser()
	filePath := createTestFile(t, mcsSampleData)
	canParse, err := parser.CanParse(filePath)

	if err != nil {
		t.Fatalf("PLC CanParse on MCS data failed: %v", err)
	}
	if canParse {
		t.Error("PLC parser CanParse should return false for MCS format file")
	}
}

func TestMCSDoesNotFalsePositiveOnSECS(t *testing.T) {
	parser := NewMCSLogParser()
	filePath := createTestFile(t, testSECSLogData)
	canParse, err := parser.CanParse(filePath)

	if err != nil {
		t.Fatalf("MCS CanParse on SECS data failed: %v", err)
	}
	if canParse {
		t.Error("MCS parser CanParse should return false for SECS format file")
	}
}

func TestMCSDoesNotFalsePositiveOnPLC(t *testing.T) {
	parser := NewMCSLogParser()
	filePath := createTestFile(t, plcSampleData)
	canParse, err := parser.CanParse(filePath)

	if err != nil {
		t.Fatalf("MCS CanParse on PLC data failed: %v", err)
	}
	if canParse {
		t.Error("MCS parser CanParse should return false for PLC debug format file")
	}
}

// ============ Registry FindParser Tests ============

func TestRegistryFindParserSECS(t *testing.T) {
	registry := NewRegistry()
	filePath := createTestFile(t, testSECSLogData)

	parser, err := registry.FindParser(filePath)
	if err != nil {
		t.Fatalf("Registry.FindParser failed for SECS file: %v", err)
	}
	if parser.Name() != "secs_log" {
		t.Errorf("Expected 'secs_log' parser, got '%s'", parser.Name())
	}
}

func TestRegistryFindParserPLC(t *testing.T) {
	registry := NewRegistry()
	filePath := createTestFile(t, plcSampleData)

	parser, err := registry.FindParser(filePath)
	if err != nil {
		t.Fatalf("Registry.FindParser failed for PLC file: %v", err)
	}
	if parser.Name() != "plc_debug" {
		t.Errorf("Expected 'plc_debug' parser, got '%s'", parser.Name())
	}
}

func TestRegistryFindParserMCS(t *testing.T) {
	registry := NewRegistry()
	filePath := createTestFile(t, mcsSampleData)

	parser, err := registry.FindParser(filePath)
	if err != nil {
		t.Fatalf("Registry.FindParser failed for MCS file: %v", err)
	}
	if parser.Name() != "mcs_log" {
		t.Errorf("Expected 'mcs_log' parser, got '%s'", parser.Name())
	}
}

// ============ Merged Session Tests ============

func TestMergedSessionSECSAndPLC(t *testing.T) {
	secsParser := NewSECSLogParser()
	plcParser := NewPLCDebugParser()

	// Parse SECS file
	secsFile := createTestFile(t, testSECSLogData)
	secsLog, _, err := secsParser.Parse(secsFile)
	if err != nil {
		t.Fatalf("Failed to parse SECS file: %v", err)
	}
	if len(secsLog.Entries) == 0 {
		t.Error("SECS parse produced no entries")
	}

	// Parse PLC file
	plcFile := createTestFile(t, shortPLCSample)
	plcLog, _, err := plcParser.Parse(plcFile)
	if err != nil {
		t.Fatalf("Failed to parse PLC file: %v", err)
	}
	if len(plcLog.Entries) == 0 {
		t.Error("PLC parse produced no entries")
	}

	// Merge
	merged := MergeLogs([]*models.ParsedLog{secsLog, plcLog}, []string{"secs_file", "plc_file"}, DefaultMergeConfig())
	if merged == nil {
		t.Fatal("MergeLogs returned nil")
	}

	// Verify merged result has entries from both sources
	secsSourceCount := 0
	plcSourceCount := 0
	for _, entry := range merged.Entries {
		if entry.SourceID == "secs_file" {
			secsSourceCount++
		} else if entry.SourceID == "plc_file" {
			plcSourceCount++
		}
	}

	if secsSourceCount == 0 {
		t.Error("Merged result should contain SECS entries")
	}
	if plcSourceCount == 0 {
		t.Error("Merged result should contain PLC entries")
	}
	if len(merged.Entries) == 0 {
		t.Error("Merged result should have entries")
	}

	t.Logf("SECS entries: %d, PLC entries: %d, Merged total: %d", secsSourceCount, plcSourceCount, len(merged.Entries))
}

func TestMergedSessionSECSAndMCS(t *testing.T) {
	secsParser := NewSECSLogParser()
	mcsParser := NewMCSLogParser()

	// Parse SECS file
	secsFile := createTestFile(t, testSECSLogData)
	secsLog, _, err := secsParser.Parse(secsFile)
	if err != nil {
		t.Fatalf("Failed to parse SECS file: %v", err)
	}
	if len(secsLog.Entries) == 0 {
		t.Error("SECS parse produced no entries")
	}

	// Parse MCS file
	mcsFile := createTestFile(t, shortMCSSample)
	mcsLog, _, err := mcsParser.Parse(mcsFile)
	if err != nil {
		t.Fatalf("Failed to parse MCS file: %v", err)
	}
	if len(mcsLog.Entries) == 0 {
		t.Error("MCS parse produced no entries")
	}

	// Merge
	merged := MergeLogs([]*models.ParsedLog{secsLog, mcsLog}, []string{"secs_file", "mcs_file"}, DefaultMergeConfig())
	if merged == nil {
		t.Fatal("MergeLogs returned nil")
	}

	secsSourceCount := 0
	mcsSourceCount := 0
	for _, entry := range merged.Entries {
		if entry.SourceID == "secs_file" {
			secsSourceCount++
		} else if entry.SourceID == "mcs_file" {
			mcsSourceCount++
		}
	}

	if secsSourceCount == 0 {
		t.Error("Merged result should contain SECS entries")
	}
	if mcsSourceCount == 0 {
		t.Error("Merged result should contain MCS entries")
	}
	if len(merged.Entries) == 0 {
		t.Error("Merged result should have entries")
	}

	t.Logf("SECS entries: %d, MCS entries: %d, Merged total: %d", secsSourceCount, mcsSourceCount, len(merged.Entries))
}

func TestMergedSessionSECSAndPLCAndMCS(t *testing.T) {
	secsParser := NewSECSLogParser()
	plcParser := NewPLCDebugParser()
	mcsParser := NewMCSLogParser()

	// Parse SECS file
	secsFile := createTestFile(t, testSECSLogData)
	secsLog, _, err := secsParser.Parse(secsFile)
	if err != nil {
		t.Fatalf("Failed to parse SECS file: %v", err)
	}
	if len(secsLog.Entries) == 0 {
		t.Error("SECS parse produced no entries")
	}

	// Parse PLC file
	plcFile := createTestFile(t, shortPLCSample)
	plcLog, _, err := plcParser.Parse(plcFile)
	if err != nil {
		t.Fatalf("Failed to parse PLC file: %v", err)
	}
	if len(plcLog.Entries) == 0 {
		t.Error("PLC parse produced no entries")
	}

	// Parse MCS file
	mcsFile := createTestFile(t, shortMCSSample)
	mcsLog, _, err := mcsParser.Parse(mcsFile)
	if err != nil {
		t.Fatalf("Failed to parse MCS file: %v", err)
	}
	if len(mcsLog.Entries) == 0 {
		t.Error("MCS parse produced no entries")
	}

	// Merge all three
	merged := MergeLogs(
		[]*models.ParsedLog{secsLog, plcLog, mcsLog},
		[]string{"secs_file", "plc_file", "mcs_file"},
		DefaultMergeConfig(),
	)
	if merged == nil {
		t.Fatal("MergeLogs returned nil")
	}

	// Verify merged result has entries from all three sources
	sourceCounts := make(map[string]int)
	for _, entry := range merged.Entries {
		sourceCounts[entry.SourceID]++
	}

	if sourceCounts["secs_file"] == 0 {
		t.Error("Merged result should contain SECS entries")
	}
	if sourceCounts["plc_file"] == 0 {
		t.Error("Merged result should contain PLC entries")
	}
	if sourceCounts["mcs_file"] == 0 {
		t.Error("Merged result should contain MCS entries")
	}
	if len(merged.Entries) == 0 {
		t.Error("Merged result should have entries")
	}

	// Verify entries are sorted by timestamp
	for i := 1; i < len(merged.Entries); i++ {
		if merged.Entries[i].Timestamp.Before(merged.Entries[i-1].Timestamp) {
			t.Errorf("Entry %d (time=%v) is before entry %d (time=%v) — entries should be sorted",
				i, merged.Entries[i].Timestamp, i-1, merged.Entries[i-1].Timestamp)
			break
		}
	}

	t.Logf("Merged total: %d entries (SECS=%d, PLC=%d, MCS=%d)",
		len(merged.Entries), sourceCounts["secs_file"], sourceCounts["plc_file"], sourceCounts["mcs_file"])
}

// ============ Sample Log Files ============

// TestCreateSampleFiles creates sample log files at /tmp/
func TestCreateSampleFiles(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping sample file creation in short mode")
	}

	samples := map[string]string{
		"/tmp/test_secs_only.log": testSECSLogData,
		"/tmp/test_plc_only.log":  plcSampleData,
		"/tmp/test_mcs_only.log":  mcsSampleData,
	}

	for path, content := range samples {
		// Ensure parent dir exists
		dir := filepath.Dir(path)
		if err := os.MkdirAll(dir, 0755); err != nil {
			t.Fatalf("Failed to create directory %s: %v", dir, err)
		}
		if err := os.WriteFile(path, []byte(content), 0644); err != nil {
			t.Fatalf("Failed to write %s: %v", path, err)
		}
		t.Logf("Created sample file: %s", path)
	}
}
