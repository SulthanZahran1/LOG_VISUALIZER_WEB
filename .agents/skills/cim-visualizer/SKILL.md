---
name: cim-visualizer
description: |
  CIM Visualizer is a web-based PLC log analysis tool for semiconductor manufacturing equipment (AMHS).
  Use this skill when working with:
  - Go backend development (Echo framework, DuckDB storage)
  - Preact frontend development (signals-based state management)
  - Log parsing and analysis (PLC debug logs, MCS/AMHS logs, CSV)
  - Map visualization (SVG factory floor layouts with carrier tracking)
  - Waveform/timing diagram visualization
  - Log table with virtual scrolling and filtering
  - Multi-file merge and deduplication
  
  Key technologies: Go 1.21+, Echo v4, DuckDB, Preact 10.x, @preact/signals, Vite, Vitest, Playwright.
---

# CIM Visualizer Development Guide

## Architecture Overview

```
┌─────────────────┐     REST/WebSocket     ┌─────────────────┐
│  Preact Frontend│ ◄────────────────────► │   Go Backend    │
│  - Signals      │                        │   - Echo        │
│  - Canvas       │                        │   - DuckDB      │
│  - Virtual scroll│                       │   - Parsers     │
└─────────────────┘                        └─────────────────┘
```

## Project Structure

```
/web_version
├── backend/
│   ├── internal/
│   │   ├── models/       # Domain types (LogEntry, FileInfo, etc.)
│   │   ├── parser/       # Log parsers (PLC, MCS, CSV, DuckStore)
│   │   ├── storage/      # File upload management
│   │   ├── session/      # Parse session lifecycle
│   │   └── api/          # HTTP handlers & WebSocket
│   └── cmd/server/       # Entry point
├── frontend/
│   └── src/
│       ├── api/          # API client functions
│       ├── stores/       # Signal-based state stores
│       ├── components/   # UI components
│       │   ├── log/      # LogTable, filtering
│       │   ├── waveform/ # Canvas, sidebar, toolbar
│       │   ├── map/      # MapCanvas, carrier controls
│       │   └── transition/ # Transition analysis
│       └── views/        # HomeView, MapViewer
└── e2e/                  # Playwright tests
```

## Backend Patterns (Go)

### Adding a New API Endpoint

1. **Add handler** in `backend/internal/api/handlers.go`:
```go
func (h *Handler) HandleNewFeature(c echo.Context) error {
    id := c.Param("id")
    
    // Get session
    state, ok := h.session.Get(id)
    if !ok {
        return c.JSON(http.StatusNotFound, map[string]string{"error": "session not found"})
    }
    
    // Process...
    return c.JSON(http.StatusOK, result)
}
```

2. **Register route** in `backend/cmd/server/main.go`:
```go
e.GET("/api/parse/:id/new-feature", handler.HandleNewFeature)
```

### DuckDB Query Patterns

**Always cast `to_timestamp()` to `TIMESTAMP`:**
```go
// CORRECT - cast to TIMESTAMP
query := `
    SELECT 
        strftime(to_timestamp(timestamp / 1000)::TIMESTAMP, '%Y-%m-%d') AS date,
        EXTRACT(HOUR FROM to_timestamp(timestamp / 1000)::TIMESTAMP) AS hour
    FROM entries
    WHERE timestamp BETWEEN ? AND ?
`

// WRONG - to_timestamp returns TIMESTAMP WITH TIME ZONE
query := `
    SELECT strftime(to_timestamp(timestamp / 1000), '%Y-%m-%d')  -- ERROR!
`
```

### Session State Access

```go
// Thread-safe access via manager
state, ok := h.session.Get(id)
if !ok {
    return c.JSON(http.StatusNotFound, ...)
}

// Access DuckStore for queries
entries, err := state.DuckStore.GetEntries(ctx, params)
```

## Frontend Patterns (Preact + Signals)

### State Management with Signals

**Use `@preact/signals` for global state:**
```typescript
// stores/myStore.ts
import { signal, computed } from '@preact/signals';

export const entries = signal<LogEntry[]>([]);
export const filterText = signal('');

// Computed values auto-update
export const filteredEntries = computed(() => {
    if (!filterText.value) return entries.value;
    return entries.value.filter(e => 
        e.deviceId.includes(filterText.value)
    );
});

// Actions
export function setFilter(text: string) {
    filterText.value = text;
}
```

**Access in components:**
```typescript
import { useSignal } from '@preact/signals';
import { entries, filteredEntries } from '../stores/myStore';

function MyComponent() {
    // Reactive read - component re-renders when signal changes
    const all = useSignal(entries);
    const filtered = useSignal(filteredEntries);
    
    return <div>{filtered.value.length} entries</div>;
}
```

### Component Structure

```typescript
// components/MyComponent.tsx
import { useSignal } from '@preact/signals';
import { useState, useEffect } from 'preact/hooks';
import './MyComponent.css'; // Component-scoped styles

interface Props {
    sessionId: string;
    onClose: () => void;
}

export function MyComponent({ sessionId, onClose }: Props) {
    // Local state for UI
    const [loading, setLoading] = useState(false);
    
    // Global state via signals
    const entries = useSignal(logStore.entries);
    
    useEffect(() => {
        loadData();
    }, [sessionId]);
    
    return <div className="my-component">...</div>;
}
```

### Log Table Integration

**Key patterns for log table features:**
```typescript
// Access current session
const sessionId = currentSession.value?.id;

// Check server-side mode (large files)
const isServerSide = useServerSide.value;

// Time-based navigation
function jumpToTime(timestamp: number) {
    jumpToTime(timestamp); // From logStore
}

// Access filtered entries
const entries = filteredEntries.value;
```

## Common Tasks

### Adding a New Log Parser

1. Create `backend/internal/parser/myformat.go`:
```go
package parser

type MyFormatParser struct{}

func (p *MyFormatParser) Parse(reader io.Reader) ([]models.LogEntry, error) {
    // Implementation
}

func (p *MyFormatParser) CanParse(content []byte) bool {
    // Detection logic
}
```

2. Register in `backend/internal/parser/registry.go`:
```go
func init() {
    Register("myformat", &MyFormatParser{})
}
```

### Adding a Store Test

```typescript
// stores/myStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { entries, filterEntries } from './myStore';

describe('myStore', () => {
    beforeEach(() => {
        entries.value = [];
    });
    
    it('should filter entries', () => {
        entries.value = [
            { deviceId: 'DEV-001', ... },
            { deviceId: 'DEV-002', ... }
        ];
        const result = filterEntries('DEV-001');
        expect(result).toHaveLength(1);
    });
});
```

### Debugging DuckDB Issues

Enable query logging:
```go
// In duckstore.go, add to query execution
fmt.Printf("[DuckStore] Query: %s\n", query)
fmt.Printf("[DuckStore] Args: %v\n", args)
```

Common errors:
- `TIMESTAMP WITH TIME ZONE` vs `TIMESTAMP` - Always cast with `::TIMESTAMP`
- `Binder Error: No function matches` - Check type compatibility
- Memory issues - Use `querySem` for concurrency control

## Testing

### Run Tests
```bash
cd frontend
npm run typecheck    # TypeScript (fast)
npm run lint         # ESLint
npm run test         # Unit tests (Vitest)
npm run test:e2e     # E2E tests (Playwright)
```

### E2E Test Pattern
```typescript
// e2e/my-feature.spec.ts
test('should work', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.status-dot.connected')).toBeVisible();
    
    // Upload file via API
    const uploadRes = await page.request.post('http://localhost:8089/api/files/upload', {
        data: { name: 'test.log', data: base64Content }
    });
    
    // Navigate to session
    await page.goto(`/?session=${sessionId}`);
    
    // Test UI interactions
    await page.locator('.my-button').click();
    await expect(page.locator('.my-result')).toBeVisible();
});
```

## Build & Deploy

```bash
# Development
make dev              # Run both frontend and backend

# Production build
make build            # Build all
docker-compose up     # Deploy with Docker

# Individual builds
cd backend && go build -o ../dist/server cmd/server/main.go
cd frontend && npm run build
```

## Key Files Reference

| Purpose | File |
|---------|------|
| API client | `frontend/src/api/client.ts` |
| Log store | `frontend/src/stores/logStore.ts` |
| Waveform store | `frontend/src/stores/waveformStore.ts` |
| DuckStore | `backend/internal/parser/duckstore.go` |
| Session manager | `backend/internal/session/manager.go` |
| Handlers | `backend/internal/api/handlers.go` |
| Types | `frontend/src/models/types.ts` |
| LogEntry (Go) | `backend/internal/models/log_entry.go` |

## Error Handling Patterns

**Backend:**
```go
if err != nil {
    log.Printf("[Handler] Error: %v", err)
    return c.JSON(http.StatusInternalServerError, map[string]string{
        "error": err.Error(),
    })
}
```

**Frontend:**
```typescript
try {
    const result = await apiCall();
} catch (err) {
    console.error('[Component] API error:', err);
    errorMessage.value = err instanceof Error ? err.message : 'Unknown error';
}
```

## Performance Considerations

- **Large files (>100MB)**: Use server-side filtering (`useServerSide`)
- **Canvas rendering**: Use `requestAnimationFrame` for animations
- **Virtual scrolling**: Log table uses fixed row heights + buffer
- **DuckDB**: Use `querySem` to limit concurrent queries
- **Memory**: Call `CompactStorage()` periodically for long-running sessions

## Additional Resources

- **DuckDB Patterns**: See [references/duckdb-patterns.md](references/duckdb-patterns.md) for query patterns and common errors
- **State Management**: See [references/state-management.md](references/state-management.md) for signals patterns and store architecture
- **Debugging Guide**: See [references/debugging.md](references/debugging.md) for debugging techniques and common issues

## Utility Scripts

- **Project Health Check**: `scripts/check-project.sh` - Validates build, tests, dependencies
- **Log Analyzer**: `scripts/analyze-log.py <logfile>` - Quick analysis of PLC log files
