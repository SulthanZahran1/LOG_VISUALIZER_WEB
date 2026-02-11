# Debugging Guide

## Backend Debugging

### Enable Verbose Logging

```go
// In your handler or store
import "log"

func (h *Handler) HandleSomething(c echo.Context) error {
    id := c.Param("id")
    log.Printf("[HandleSomething] Called with id=%s", id)
    
    state, ok := h.session.Get(id)
    log.Printf("[HandleSomething] Session found=%v", ok)
    
    // ...
}
```

### DuckDB Query Debugging

```go
func (ds *DuckStore) debugQuery(query string, args ...interface{}) {
    log.Printf("[DuckStore] Query: %s", query)
    log.Printf("[DuckStore] Args: %v", args)
    
    start := time.Now()
    rows, err := ds.db.Query(query, args...)
    log.Printf("[DuckStore] Query took %v", time.Since(start))
    
    if err != nil {
        log.Printf("[DuckStore] Error: %v", err)
    }
}
```

### Request/Response Logging Middleware

```go
// Add to cmd/server/main.go
e.Use(middleware.LoggerWithConfig(middleware.LoggerConfig{
    Format: "${time_rfc3339} | ${method} ${uri} | ${status} | ${latency_human}\n",
}))
```

### WebSocket Message Logging

```go
// In websocket handler
log.Printf("[WS] Received: %s", messageType)
log.Printf("[WS] Sending: %+v", response)
```

## Frontend Debugging

### Store State Inspection

```typescript
// Add to browser console for debugging
import { currentSession, filteredEntries, useServerSide } from './stores/logStore';

// Check current state
console.log('Session:', currentSession.value);
console.log('Entries count:', filteredEntries.value.length);
console.log('Server side:', useServerSide.value);

// Subscribe to changes
import { effect } from '@preact/signals';
effect(() => {
    console.log('Entries changed:', filteredEntries.value.length);
});
```

### API Call Tracing

```typescript
// In api/client.ts, wrap fetch
async function request<T>(url: string, options?: RequestInit): Promise<T> {
    console.log(`[API] ${options?.method || 'GET'} ${url}`);
    const start = performance.now();
    
    const response = await fetch(url, options);
    
    console.log(`[API] ${url} took ${(performance.now() - start).toFixed(2)}ms`);
    
    if (!response.ok) {
        console.error(`[API] Error: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
}
```

### Component Render Debugging

```typescript
import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';

function MyComponent() {
    const entries = useSignal(filteredEntries);
    
    useEffect(() => {
        console.log('[MyComponent] Render, entries:', entries.value.length);
    });
    
    return <div>...</div>;
}
```

## Common Issues

### Issue: Log table shows no data

**Checklist:**
1. Is `currentSession.value` set?
2. Check browser Network tab for `/api/parse/{id}/entries` calls
3. Verify `filteredEntries.value` vs `entries.value`
4. Check for JavaScript errors in console

**Debug commands:**
```javascript
// In browser console
JSON.stringify(window.__PREACT_SIGNALS__.find(s => s._value?.id))
```

### Issue: Time tree query fails

**Checklist:**
1. Verify `to_timestamp()` casts to `::TIMESTAMP`
2. Check DuckDB version compatibility
3. Verify session has entries (not empty)
4. Check query parameters are correct types

**Debug:**
```go
// Add to GetTimeTree
log.Printf("[GetTimeTree] Session=%s, Params=%+v", sessionId, params)
```

### Issue: Waveform not rendering

**Checklist:**
1. Is canvas element present? `document.querySelector('canvas')`
2. Check `waveformStore.signals.value` has data
3. Verify viewport time range (`waveformStore.viewport.value`)
4. Check for canvas context errors

### Issue: Map not loading

**Checklist:**
1. Is map layout loaded? `mapStore.layout.value`
2. Check `/api/map/layout` API response
3. Verify SVG container dimensions
4. Check for XML parsing errors

## Performance Profiling

### Backend

```go
import "runtime/pprof"

// CPU profile
f, _ := os.Create("cpu.prof")
pprof.StartCPUProfile(f)
defer pprof.StopCPUProfile()

// Memory profile
f, _ := os.Create("mem.prof")
pprof.WriteHeapProfile(f)
f.Close()
```

### Frontend

```typescript
// Measure render time
const start = performance.now();
// ... render ...
requestAnimationFrame(() => {
    console.log('Render time:', performance.now() - start);
});

// Profile signal updates
import { effect } from '@preact/signals';
let updateCount = 0;
effect(() => {
    // Access signal
    filteredEntries.value;
    console.log('Signal updates:', ++updateCount);
});
```

## Log File Analysis

### Parse Log Files for Errors

```bash
# Backend logs
grep -E "ERROR|error:|Error:" backend.logs | tail -20

# Frontend errors
grep -E "Error:|error:" frontend/npm-debug.log 2>/dev/null
```

### Check Recent API Calls

```bash
# From backend logs
grep "/api/" backend.logs | tail -20
```
