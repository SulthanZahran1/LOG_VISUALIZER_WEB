# Log Parser Architecture

How log files are parsed and processed in the backend.

## Parser Registry

```mermaid
flowchart TB
    subgraph Input
        File[Log File]
    end
    
    subgraph Registry["Parser Registry"]
        Detect{Detect Format}
        PLC[PLCDebugParser]
        TAB[PLCTabParser]
        MCS[MCSLogParser]
        CSV[CSVSignalParser]
    end
    
    subgraph Output
        Entries[LogEntry[]]
    end
    
    File --> Detect
    Detect -->|Bracket format| PLC
    Detect -->|Tab-delimited| TAB
    Detect -->|AMHS/MCS format| MCS
    Detect -->|CSV format| CSV
    
    PLC --> Entries
    TAB --> Entries
    MCS --> Entries
    CSV --> Entries
```

## Format Detection

The registry reads the first few lines and matches patterns:

| Format | Detection Pattern | Example |
|--------|-------------------|---------|
| PLC Debug | `[timestamp] [device] [signal] [value]` | `[2024-01-15 10:30:00.123] [AGV01] [Status] [Running]` |
| PLC Tab | Tab-separated with header | `Timestamp\tDevice\tSignal\tValue` |
| MCS/AMHS | Contains `CarrierID` or `CurrentLocation` | MCS-specific headers |
| CSV | Comma-separated with header | `timestamp,device,signal,value` |

## Parser Interface

```go
type Parser interface {
    // Name returns the unique name of the parser
    Name() string
    
    // CanParse returns true if this parser can handle the given file
    CanParse(filePath string) (bool, error)
    
    // Parse parses the entire file and returns the result
    Parse(filePath string) (*models.ParsedLog, []*models.ParseError, error)
}
```

## LogEntry Model

```mermaid
classDiagram
    class LogEntry {
        +int64 TimestampMs
        +string DeviceID
        +string SignalName
        +any Value
        +string ValueType
        +int LineNumber
        +string RawLine
    }
    
    class ParsedLog {
        +[]LogEntry Entries
        +int64 StartTime
        +int64 EndTime
        +[]string Devices
        +[]string Signals
        +map Stats
    }
    
    ParsedLog "1" --> "*" LogEntry
```

## MCS Parser: Multi-Entry Lines

MCS logs can have multiple signals per line:

```mermaid
flowchart LR
    subgraph Input
        Line["2024-01-15 10:30:00 AGV01 Status=Running Location=Bay1"]
    end
    
    subgraph MCSParser
        Split[Split by regex]
        E1[Entry: Status=Running]
        E2[Entry: Location=Bay1]
    end
    
    subgraph Output
        Entries["LogEntry[], same timestamp"]
    end
    
    Line --> Split
    Split --> E1
    Split --> E2
    E1 --> Entries
    E2 --> Entries
```

## Backend File Structure

```
backend/internal/parser/
├── parser.go          # Parser interface, utilities
├── registry.go        # Format detection, parser selection
├── plc_debug.go       # PLCDebugParser
├── plc_tab.go         # PLCTabParser
├── mcs.go             # MCSLogParser
├── csv.go             # CSVSignalParser
└── *_test.go          # Unit tests for each
```
