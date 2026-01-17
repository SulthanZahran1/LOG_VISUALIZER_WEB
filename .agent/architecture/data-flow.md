# Data Flow Architecture

How data flows through the application from file upload to visualization.

## File Upload & Parsing Flow

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant API as Backend API
    participant FS as FileStorage
    participant P as Parser
    participant SM as SessionManager

    U->>FE: Drop/paste file
    FE->>FE: Read file content
    
    alt File > 5MB
        loop For each 5MB chunk
            FE->>API: POST /files/upload/chunk
            API->>FS: SaveChunk()
        end
        FE->>API: POST /files/upload/complete
        API->>FS: CompleteChunkedUpload()
    else File <= 5MB
        FE->>API: POST /files/upload
        API->>FS: SaveFile()
    end
    
    API-->>FE: FileInfo{id, name, size}
    
    FE->>API: POST /parse {fileId}
    API->>SM: CreateSession()
    API->>FS: GetFile()
    API->>P: DetectAndParse()
    P->>P: Identify format
    P->>SM: StoreEntries()
    API-->>FE: sessionId
```

## Log Entry Retrieval

```mermaid
flowchart LR
    subgraph Request
        R1[Page Request]
        R2[Time Chunk Request]
        R3[Signal List Request]
    end
    
    subgraph Session["Session Manager"]
        E[(Entries)]
        S[(Signals)]
    end
    
    subgraph Response
        Paginated[Paginated Entries]
        Chunked[Time-windowed Entries]
        Signals[Signal Names]
    end
    
    R1 -->|offset, limit| E
    R2 -->|startMs, endMs| E
    R3 --> S
    
    E --> Paginated
    E --> Chunked
    S --> Signals
```

## Visualization Data Flow

```mermaid
flowchart TB
    subgraph Backend
        Session[(Session<br/>Entries)]
    end
    
    subgraph Frontend
        subgraph Stores
            logStore[(logStore<br/>entries, filters)]
            waveStore[(waveformStore<br/>viewport, signals)]
            mapStore[(mapStore<br/>layout, carriers)]
        end
        
        subgraph Views
            LogTable[Log Table<br/>Virtual scroll]
            WaveCanvas[Waveform Canvas<br/>Time-based render]
            MapCanvas[Map Canvas<br/>SVG render]
        end
    end
    
    Session -->|/entries| logStore
    Session -->|/chunk| waveStore
    Session -->|/carrier-log| mapStore
    
    logStore --> LogTable
    waveStore --> WaveCanvas
    mapStore --> MapCanvas
```

## Map Playback Flow

```mermaid
sequenceDiagram
    participant LT as LogTable/Waveform
    participant MS as mapStore
    participant MC as MapCanvas
    participant MOC as MapObjectComponent

    LT->>MS: setPlaybackTime(time)
    MS->>MS: Update playbackTime.value
    
    loop For each object
        MC->>MOC: Re-render (reactive signal)
        MOC->>MS: getSignalValueAtTime(key, time)
        MS->>MS: Binary search in signalHistory
        MS-->>MOC: signal value
        MOC->>MOC: Evaluate rules (getUnitColor)
        MOC->>MOC: Update SVG fill/text
    end
```

## State Synchronization

```mermaid
flowchart LR
    subgraph Shared["Shared State"]
        Time[currentTime]
        Cursor[cursorPosition]
        Selection[selectedSignal]
    end
    
    subgraph Views
        LT[Log Table]
        WF[Waveform]
        MV[Map Viewer]
    end
    
    Time --> LT
    Time --> WF
    Time --> MV
    
    Cursor --> LT
    Cursor --> WF
    
    Selection --> WF
    Selection --> MV
```
