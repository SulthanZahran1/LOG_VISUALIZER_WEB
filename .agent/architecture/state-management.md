# State Management (Preact Signals)

How state is managed across the frontend using Preact Signals.

## Store Architecture

```mermaid
flowchart TB
    subgraph Stores["Signal Stores"]
        logStore[("logStore<br/>Session, entries, filters")]
        waveStore[("waveformStore<br/>Viewport, signals, cursor")]
        mapStore[("mapStore<br/>Layout, carriers, zoom")]
    end
    
    subgraph Computed["Computed Values"]
        C1[filteredEntries]
        C2[visibleSignals]
        C3[carrierPositions]
    end
    
    subgraph Components
        LogTable
        WaveformCanvas
        MapCanvas
        Toolbars
    end
    
    logStore --> C1 --> LogTable
    waveStore --> C2 --> WaveformCanvas
    mapStore --> C3 --> MapCanvas
    
    logStore -.->|shared session| waveStore
    logStore -.->|shared session| mapStore
```

## logStore Signals

```mermaid
flowchart LR
    subgraph Core
        session[currentSession]
        entries[logEntries]
        total[totalEntries]
        loading[isLoadingLog]
    end
    
    subgraph Filters
        search[searchQuery]
        regex[searchRegex]
        caseSens[searchCaseSensitive]
        changed[showChangedOnly]
        typeFilter[signalTypeFilter]
    end
    
    subgraph Views
        openViews[openViews]
        activeTab[activeTab]
    end
    
    subgraph Sorting
        sortCol[sortColumn]
        sortDir[sortDirection]
    end
    
    subgraph Computed
        filtered[filteredEntries]
        isParsing[isParsing]
    end
    
    entries --> filtered
    search --> filtered
    regex --> filtered
    caseSens --> filtered
    changed --> filtered
    typeFilter --> filtered
    session --> isParsing
```

## waveformStore Signals

```mermaid
flowchart TB
    subgraph Viewport
        zoom[zoomLevel]
        offset[scrollOffset]
        viewRange[viewRange]
    end
    
    subgraph Signals
        selected[selectedSignals]
        available[availableSignals]
        focused[focusedSignal]
    end
    
    subgraph Cursor
        hover[hoverTime]
        selection[timeSelection]
    end
    
    subgraph Filters
        search[filterSearch]
        presets[filterPresets]
        changed[showChangedInView]
    end
```

## mapStore Signals

```mermaid
flowchart TB
    subgraph Layout
        layout[mapLayout]
        rules[mapRules]
    end
    
    subgraph Viewport
        zoom[zoomLevel]
        offset[panOffset]
        selection[selectedUnit]
    end
    
    subgraph Carriers
        enabled[trackingEnabled]
        info[carrierLogInfo]
        entries[carrierLogEntries]
        positions[carrierPositions <computed>]
    end
    
    subgraph Playback
        playTime[playbackTime]
        isPlay[isPlaying]
        speed[playbackSpeed]
        history[signalHistory]
    end
```

## Signal Reactivity

```mermaid
sequenceDiagram
    participant U as User
    participant C as Component
    participant S as Signal
    participant E as Effect

    U->>C: Interaction (click, type)
    C->>S: Update signal.value
    S->>E: Notify subscribers
    E->>C: Re-render affected components
```

## Key Patterns

### 1. Computed Values
```typescript
// Automatically updates when dependencies change
const filteredEntries = computed(() => {
    return entries.value.filter(e => 
        matchesSearch(e, searchQuery.value)
    );
});
```

### 2. Effects for Side Effects
```typescript
// Runs when viewport changes
effect(() => {
    const range = viewRange.value;
    fetchChunk(range.start, range.end);
});
```

### 3. Batched Updates
```typescript
// Multiple updates trigger single re-render
batch(() => {
    zoomLevel.value = newZoom;
    scrollOffset.value = newOffset;
});
```
