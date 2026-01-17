# System Overview

High-level architecture of the PLC Log Visualizer web application.

## Component Architecture

```mermaid
flowchart TB
    subgraph Browser["Browser (Chrome)"]
        subgraph Frontend["Frontend (Preact + Vite)"]
            App[App Shell]
            Views[Views]
            Stores[Signal Stores]
            API[API Client]
        end
    end
    
    subgraph Server["Backend (Go + Echo)"]
        Handlers[API Handlers]
        Parsers[Log Parsers]
        Storage[File Storage]
        Sessions[Session Manager]
    end
    
    subgraph Files["File System"]
        Uploads[uploads/]
        Config[config/]
    end
    
    App --> Views
    Views --> Stores
    Stores --> API
    API -->|REST| Handlers
    Handlers --> Sessions
    Handlers --> Parsers
    Handlers --> Storage
    Storage --> Uploads
    Parsers --> Config
```

## Frontend Architecture

```mermaid
flowchart LR
    subgraph Views["views/"]
        Home[HomeView]
        Map[MapViewer]
    end
    
    subgraph Components["components/"]
        subgraph log
            LogTable
        end
        subgraph waveform
            WaveformView
            WaveformCanvas
            SignalSidebar
        end
        subgraph map
            MapCanvas
            MapFileSelector
            MapMediaControls
            MapDetailPanel
        end
        subgraph file
            FileUpload
        end
    end
    
    subgraph Stores["stores/"]
        logStore[(logStore)]
        waveStore[(waveformStore)]
        mapStore[(mapStore)]
    end
    
    Home --> FileUpload
    WaveformView --> WaveformCanvas
    WaveformView --> SignalSidebar
    Map --> MapCanvas
    Map --> MapMediaControls
    Map --> MapDetailPanel
    
    LogTable --> logStore
    WaveformCanvas --> waveStore
    MapCanvas --> mapStore
    
    logStore -.->|session| waveStore
    logStore -.->|session| mapStore
```

## Backend Architecture

```mermaid
flowchart TB
    subgraph API["internal/api/"]
        H[handlers.go]
    end
    
    subgraph Session["internal/session/"]
        SM[manager.go]
    end
    
    subgraph Storage["internal/storage/"]
        FS[store.go]
    end
    
    subgraph Parsers["internal/parser/"]
        Reg[registry.go]
        PLC[plc_debug.go]
        MCS[mcs.go]
        CSV[csv.go]
        TAB[plc_tab.go]
    end
    
    H --> SM
    H --> FS
    H --> Reg
    Reg --> PLC
    Reg --> MCS
    Reg --> CSV
    Reg --> TAB
    SM --> FS
```

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | Preact | UI framework (lightweight React) |
| State | @preact/signals | Reactive state management |
| Build | Vite | Fast dev server & bundler |
| Backend | Go 1.21+ | High-performance server |
| HTTP | Echo v4 | Web framework |
| Storage | Local filesystem | File uploads & sessions |
| Testing | Vitest + Playwright | Unit & E2E tests |
