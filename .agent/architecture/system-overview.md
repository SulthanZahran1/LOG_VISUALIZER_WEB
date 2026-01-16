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
    subgraph Views
        Home[HomeView]
        Log[LogTableView]
        Wave[WaveformView]
        Map[MapViewer]
    end
    
    subgraph Stores["Signal Stores"]
        logStore[(logStore)]
        waveStore[(waveformStore)]
        mapStore[(mapStore)]
    end
    
    subgraph Components
        FileUpload
        LogTable
        WaveCanvas[WaveformCanvas]
        MapCanvas
        Toolbars
    end
    
    Home --> FileUpload
    Log --> LogTable
    Wave --> WaveCanvas
    Map --> MapCanvas
    
    LogTable --> logStore
    WaveCanvas --> waveStore
    MapCanvas --> mapStore
    
    logStore -->|signals| waveStore
    logStore -->|signals| mapStore
```

## Backend Architecture

```mermaid
flowchart TB
    subgraph API["API Layer (Echo v4)"]
        FileH[File Handlers]
        ParseH[Parse Handlers]
        MapH[Map Handlers]
    end
    
    subgraph Core["Core Services"]
        SM[Session Manager]
        PS[Parser Service]
        FS[File Storage]
    end
    
    subgraph Parsers["Log Parsers"]
        PLC[PLCDebugParser]
        MCS[MCSLogParser]
        CSV[CSVSignalParser]
        TAB[PLCTabParser]
    end
    
    FileH --> FS
    ParseH --> SM
    ParseH --> PS
    MapH --> SM
    
    PS --> Parsers
    SM -->|sessions| FS
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
