# Map Viewer: Dual Log System

The Map Viewer supports two separate log files for different visualization modes.

## Overview

```mermaid
flowchart TD
    subgraph "Log Files"
        A[Main PLC Log<br/>Device signals]
        B[Carrier Log<br/>MCS format]
    end
    
    subgraph "Backend"
        C[PLC Parser]
        D[MCS Parser]
        E[Session Manager]
    end
    
    subgraph "Frontend (mapStore)"
        F[mapLayout]
        G[mapRules]
        H[carrierLogEntries]
        I["Toggle: Tracking ON/OFF"]
    end
    
    subgraph "Visualization"
        J[MapCanvas]
    end
    
    A --> C --> E
    B --> D --> E
    E --> F
    E --> G
    E --> H
    
    F --> J
    G --> I
    H --> I
    I -->|OFF| K[YAML Rules Coloring]
    I -->|ON| L[Carrier Positions]
    K --> J
    L --> J
```

## Configuration Files

| File Type | Format | Purpose | API Endpoint |
|-----------|--------|---------|--------------|
| Layout | XML | Unit positions, sizes, types | `POST /api/map/upload` |
| Rules | YAML | Device-to-unit mappings, color rules | `POST /api/map/rules` |
| Carrier Log | MCS Log | `CurrentLocation` signals | `POST /api/map/carrier-log` |

## Toggle Behavior

| Tracking State | Data Source | Visualization | Unit Colors |
|----------------|-------------|---------------|-------------|
| **OFF** | Main log + YAML rules | Signal-based coloring | From YAML rules |
| **ON** | Carrier log (MCS) | Carrier positions | By carrier count |

## Carrier Count Color Coding

```mermaid
flowchart LR
    subgraph "Carrier Count"
        C0["0 carriers"]
        C1["1 carrier"]
        C2["2 carriers"]
        C3["3 carriers"]
        C4["4+ carriers"]
    end
    
    subgraph "Unit Color"
        D[Default gray]
        G[Green #90EE90]
        Y[Yellow #FFD700]
        O[Orange #FFA500]
        R[Red gradient]
    end
    
    C0 --> D
    C1 --> G
    C2 --> Y
    C3 --> O
    C4 --> R
```

## Data Flow for Carrier Tracking

```mermaid
sequenceDiagram
    participant U as User
    participant UI as MapViewer
    participant Store as mapStore
    participant API as Backend

    U->>UI: Upload carrier log
    UI->>API: POST /api/map/carrier-log
    API-->>Store: carrierLogInfo
    
    U->>UI: Toggle Tracking ON
    UI->>Store: toggleCarrierTracking()
    Store->>API: GET /api/map/carrier-log/entries
    API-->>Store: carrierLogEntries
    
    Store->>Store: computeCarrierPositions()
    Store->>UI: Update unit colors/labels
```

## MapStore State

```typescript
// Key signals in mapStore.ts
mapLayout: Signal<MapLayout | null>          // XML layout data
mapRules: Signal<MapRules | null>            // YAML rules data  
carrierLogInfo: Signal<CarrierLogInfo | null>  // Carrier log file info
carrierLogEntries: Signal<CarrierEntry[]>    // Parsed carrier entries
carrierTrackingEnabled: Signal<boolean>      // Toggle state
carrierLocations: Signal<Map<string, string>> // carrierId → unitId

// Computed
unitCarrierCounts: Computed<Map<string, number>>  // unitId → count
mapObjectsArray: Computed<MapObject[]>            // Array of map objects
```
