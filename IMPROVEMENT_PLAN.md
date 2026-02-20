# Post-Refactoring Improvement Plan

> **Branch**: `improve/post-refactoring-cleanup`  
> **Created**: 2026-02-20  
> **Status**: Ready for development

---

## Executive Summary

The 4-week refactoring sprint is complete and merged. This document outlines improvement opportunities identified during the final review phase. Each option is broken down by effort, impact, and dependencies.

---

## 📊 Current State Snapshot

### What's Working ✅
| Metric | Value |
|--------|-------|
| ESLint Errors | 0 (was 46) |
| TypeScript Errors | 0 |
| Frontend Unit Tests | 142/142 passing |
| Backend Handler Tests | 28/28 passing |
| Build Time | ~10s (17% faster) |
| Bundle Size | 1.7MB (6% smaller) |

### What's Left to Improve ⚠️
| Area | Issues | Priority |
|------|--------|----------|
| ESLint Warnings | 69 (mostly `any` types) | Medium |
| Backend Coverage | ~23% (parsers/storage untested) | High |
| Component Tests | 0% for UI components | Medium |
| Console Statements | ~26 debug logs in production | Low |
| Failing Tests | 2 integration tests | High |

---

## 🎯 Improvement Options

### Option A: Quick Wins (2-4 hours)
**Goal**: Clean codebase, fix failing tests, prepare for deeper work

#### A1. Fix Failing Backend Tests (30 min)
```
backend/internal/api/handlers_test.go
  ❌ TestSetActiveMap - active map persistence issue
  ❌ TestChunkedUpload - temp directory/WAL file issue
```

**Approach**:
- Fix `TestSetActiveMap`: Ensure map handler properly persists active map ID
- Fix `TestChunkedUpload`: Use `t.TempDir()` correctly for chunk storage

**Dependencies**: None  
**Risk**: Low

---

#### A2. Clean Console Statements (1 hour)
**Files with console.log**:
```
frontend/src/api/websocketUpload.ts     (4 logs)
frontend/src/api/upload.ts              (2 logs)
frontend/src/stores/log/effects.ts      (2 logs)
frontend/src/stores/log/actions.ts      (3 logs)
frontend/src/stores/map/utils.ts        (4 logs)
frontend/src/stores/map/actions.ts      (1 log)
```

**Approach**:
- Replace with proper logger utility (create `utils/logger.ts`)
- Use `console.warn/error` where appropriate (allowed by ESLint)
- Remove debug logs entirely
- Add `/* istanbul ignore next */` for intentional logs

**Example logger**:
```typescript
// utils/logger.ts
export const logger = {
  debug: (...args: unknown[]) => {
    if (import.meta.env.DEV) console.log(...args);
  },
  info: console.info,
  warn: console.warn,
  error: console.error,
};
```

**Dependencies**: None  
**Risk**: Very Low

---

#### A3. Fix Low-Hanging ESLint Warnings (2 hours)
**Easiest `any` types to fix** (~15 of 30):

| File | Line | Context | Replacement |
|------|------|---------|-------------|
| `stores/map/utils.ts` | 116 | signal value | `unknown` or specific type |
| `stores/map/utils.ts` | 134 | cache object | `Map<string, SignalData>` |
| `stores/map/utils.ts` | 213 | filter callback | `SignalValue` type |
| `api/logEncoder.ts` | 165 | worker response | `WorkerResponse` type |
| `workers/logEncoder.worker.ts` | 153 | error handling | `Error` type |

**Approach**:
1. Add proper interfaces for data structures
2. Use `unknown` instead of `any` where possible
3. Add type guards for runtime checks

**Dependencies**: None  
**Risk**: Low

---

### Option B: Type Safety Hardening (4-6 hours)
**Goal**: Eliminate all `any` types, add strict TypeScript rules

#### B1. Replace All `any` Types (3 hours)
**Remaining `any` types by file**:

```
components/settings/ColorCodingSettings.tsx   (4 any)
stores/map/utils.ts                           (4 any)
api/logEncoder.ts                            (3 any)
stores/waveform/actions.ts                   (1 any)
workers/logEncoder.worker.ts                 (1 any)
stores/map/types.ts                          (1 any)
```

**Approach**:
1. Define missing interfaces:
   - `SignalValue` union type (boolean | number | string)
   - `ColorRule` interface
   - `WorkerMessage` / `WorkerResponse` types
   - `MapObject` with proper unitId typing

2. Update functions to use strict types:
```typescript
// Before
function getUnitColor(values: any[]): any

// After  
function getUnitColor(values: SignalValue[]): ColorResult
```

**Dependencies**: None  
**Risk**: Medium (requires testing)

---

#### B2. Enable Strict ESLint Rules (1 hour)
**Add to `eslint.config.js`**:
```javascript
'@typescript-eslint/explicit-function-return-type': 'warn',
'@typescript-eslint/no-unsafe-assignment': 'error',
'@typescript-eslint/no-unsafe-member-access': 'error',
'@typescript-eslint/prefer-nullish-coalescing': 'warn',
'@typescript-eslint/prefer-optional-chain': 'warn',
```

**Dependencies**: Option B1 complete  
**Risk**: Medium (may reveal hidden issues)

---

#### B3. Add Runtime Type Validation (2 hours)
**Use io-ts or zod for API response validation**:

```typescript
// api/validation.ts
import { z } from 'zod';

export const LogEntrySchema = z.object({
  deviceId: z.string(),
  signalName: z.string(),
  timestamp: z.number(),
  value: z.union([z.boolean(), z.number(), z.string()]),
  signalType: z.enum(['boolean', 'integer', 'string']),
});

export type LogEntry = z.infer<typeof LogEntrySchema>;
```

**Dependencies**: Add zod dependency  
**Risk**: Low

---

### Option C: Backend Test Coverage (6-10 hours)
**Goal**: Achieve 50%+ backend coverage, focus on critical paths

#### C1. DuckDB Store Tests (3 hours)
**File**: `backend/internal/parser/duckstore.go` (1,335 lines)

**Critical paths to test**:
- [ ] `NewDuckStore()` - database initialization
- [ ] `InsertEntries()` - batch insert with transaction
- [ ] `QueryEntries()` - time range queries
- [ ] `GetSignals()` - signal extraction
- [ ] `CreateTimeIndex()` - index creation
- [ ] `Close()` - cleanup and temp file removal
- [ ] Error handling for disk full, corrupt DB

**Test structure**:
```go
// duckstore_test.go
func TestDuckStore_InsertAndQuery(t *testing.T) {
    store, err := NewDuckStore("")
    require.NoError(t, err)
    defer store.Close()
    
    entries := []models.LogEntry{
        {DeviceID: "D1", SignalName: "S1", Timestamp: time.Now(), Value: true},
        // ... more entries
    }
    
    err = store.InsertEntries(entries)
    require.NoError(t, err)
    
    results, err := store.QueryEntries(startTime, endTime)
    require.NoError(t, err)
    assert.Len(t, results, 2)
}
```

**Dependencies**: None  
**Risk**: Low  
**Impact**: Critical (1GB+ file handling)

---

#### C2. Parser Tests (3 hours)
**Files**:
- `backend/internal/parser/plc_debug.go`
- `backend/internal/parser/mcs.go`
- `backend/internal/parser/csv.go`

**Test cases per parser**:
- [ ] Valid file parsing
- [ ] Malformed input handling
- [ ] Large file streaming
- [ ] Timestamp parsing variants
- [ ] Signal type detection
- [ ] Category extraction

**Example**:
```go
func TestPLCDebugParser_ParseLine(t *testing.T) {
    tests := []struct {
        name     string
        input    string
        expected *models.LogEntry
        wantErr  bool
    }{
        {
            name:  "valid boolean",
            input: "2024-01-15 10:30:45.123 [PLC-01] Signal1 = TRUE",
            expected: &models.LogEntry{
                DeviceID:   "PLC-01",
                SignalName: "Signal1",
                Value:      true,
                SignalType: models.BooleanSignal,
            },
        },
        // ... more cases
    }
}
```

**Dependencies**: None  
**Risk**: Low

---

#### C3. Storage Layer Tests (2 hours)
**File**: `backend/internal/storage/store.go`

**Test cases**:
- [ ] `Save()` - file persistence
- [ ] `Get()` - file retrieval
- [ ] `Delete()` - file removal
- [ ] `List()` - filtering and sorting
- [ ] `Chunked upload` - assembly and cleanup
- [ ] Concurrent access (race conditions)

**Dependencies**: None  
**Risk**: Low

---

#### C4. Session Manager Tests (2 hours)
**File**: `backend/internal/session/manager.go`

**Test cases**:
- [ ] `CreateSession()` - initialization
- [ ] `GetSession()` - retrieval and TTL
- [ ] `TouchSession()` - activity tracking
- [ ] `Cleanup()` - expired session removal
- [ ] `StartMultiSession()` - merge handling
- [ ] DuckDB persistence integration

**Dependencies**: Option C1 (DuckDB tests)  
**Risk**: Medium

---

### Option D: Frontend Component Tests (8-12 hours)
**Goal**: Add tests for critical UI components

#### D1. WaveformCanvas Tests (4 hours)
**File**: `frontend/src/components/waveform/WaveformCanvas.tsx` (966 lines)

**Challenges**: Canvas API mocking

**Test approach**:
```typescript
// Mock canvas API
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  strokeRect: vi.fn(),
  // ... other methods
}));

describe('WaveformCanvas', () => {
  it('renders canvas element', () => {
    render(<WaveformCanvas />);
    expect(screen.getByTestId('waveform-canvas')).toBeInTheDocument();
  });
  
  it('calls draw functions on viewport change', () => {
    const drawSpy = vi.spyOn(canvasAPI, 'fillRect');
    render(<WaveformCanvas />);
    
    // Trigger viewport change
    act(() => {
      viewport.value = { startTime: 0, endTime: 1000 };
    });
    
    expect(drawSpy).toHaveBeenCalled();
  });
});
```

**Test cases**:
- [ ] Canvas rendering with signals
- [ ] Zoom/pan interactions
- [ ] Time selection (Shift+drag)
- [ ] Cursor snapping to transitions
- [ ] Virtual scrolling (signal rows)

**Dependencies**: None  
**Risk**: High (canvas mocking complexity)

---

#### D2. SignalSidebar Tests (3 hours)
**File**: `frontend/src/components/waveform/SignalSidebar.tsx` (736 lines)

**Test cases**:
- [ ] Signal list rendering
- [ ] Search/filter functionality
- [ ] Device group expansion
- [ ] Signal selection/deselection
- [ ] Regex search mode
- [ ] Filter presets save/load

**Dependencies**: None  
**Risk**: Medium

---

#### D3. MapCanvas Tests (3 hours)
**File**: `frontend/src/components/map/MapCanvas.tsx` (170 lines)

**Test cases**:
- [ ] SVG rendering of map objects
- [ ] Unit selection/highlighting
- [ ] Carrier count badges
- [ ] Pan and zoom controls
- [ ] Color updates on playback

**Dependencies**: None  
**Risk**: Medium

---

#### D4. Integration Tests (2 hours)
**Cross-component interactions**:
- [ ] LogTable → Waveform (signal selection)
- [ ] Waveform → Map (time sync)
- [ ] Bookmarks across all views
- [ ] Multi-file merge flow

**Dependencies**: Options D1-D3  
**Risk**: Medium

---

### Option E: E2E Test Infrastructure (4-6 hours)
**Goal**: Fix 52 failing E2E tests

#### E1. Test Environment Setup (2 hours)
**Current issue**: Tests need running backend

**Solution**:
```typescript
// playwright.config.ts
export default defineConfig({
  webServer: {
    command: 'cd ../backend && go run cmd/server/main.go',
    url: 'http://localhost:8089/health',
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
  },
});
```

**Dependencies**: None  
**Risk**: Low

---

#### E2. Mock External Services (2 hours)
**For tests that don't need full backend**:
- Use MSW (Mock Service Worker) to intercept API calls
- Create fixture files for sample logs
- Mock WebSocket connections

**Dependencies**: Add MSW dependency  
**Risk**: Low

---

#### E3. Stabilize Flaky Tests (2 hours)
**Common issues**:
- Race conditions in async operations
- Timing issues with animations
- File upload timeouts

**Solutions**:
- Add `data-testid` attributes
- Use `waitFor` for async assertions
- Increase timeout for file operations

**Dependencies**: Option E1  
**Risk**: Medium

---

## 📋 Recommended Sequence

### Phase 1: Foundation (Week 1)
1. **Option A**: Quick Wins
   - Fix 2 failing tests
   - Clean console statements
   - Fix 15 easy `any` types

**Result**: Clean codebase, all tests passing

---

### Phase 2: Backend Stability (Week 2)
2. **Option C**: Backend Coverage
   - DuckDB store tests (critical for 1GB+ files)
   - Parser tests
   - Storage layer tests

**Result**: 50%+ backend coverage, confidence in large file handling

---

### Phase 3: Frontend Quality (Week 3)
3. **Option B**: Type Safety
   - Replace remaining `any` types
   - Enable strict ESLint rules
   - Add runtime validation

**Result**: Type-safe codebase, catches bugs at compile time

---

### Phase 4: UI Confidence (Week 4)
4. **Option D**: Component Tests
   - WaveformCanvas (highest risk)
   - SignalSidebar
   - MapCanvas

5. **Option E**: E2E Tests
   - Fix test infrastructure
   - Stabilize flaky tests

**Result**: 70%+ overall coverage, confident releases

---

## 🛠️ Quick Start

### If you have 2 hours:
```bash
# Do Option A only
git checkout improve/post-refactoring-cleanup
# Fix 2 failing tests
# Clean console logs
# Fix 15 any types
```

### If you have 1 week:
```bash
# Do Phase 1 + Phase 2
# Focus on backend coverage
# DuckDB tests are highest priority
```

### If you have 1 month:
```bash
# Do all phases
# Full test coverage
# Production-ready
```

---

## 📈 Success Metrics

| Phase | Target | Measurement |
|-------|--------|-------------|
| Phase 1 | 0 failing tests | `go test ./... && npm run test:all` |
| Phase 2 | 50% backend coverage | `go test -cover ./...` |
| Phase 3 | 0 `any` types | `grep -r "any" src/ --include="*.ts"` |
| Phase 4 | 70% overall coverage | `npm run test:coverage` |

---

## 🚧 Blockers & Risks

| Risk | Mitigation |
|------|------------|
| Canvas testing complexity | Use `jest-canvas-mock` or mock manually |
| DuckDB test flakiness | Use in-memory DB, proper cleanup |
| Time investment | Can stop after any phase |
| Breaking changes | All changes are additive (tests only) |

---

## 📚 References

- [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md)
- [REFACTORING_VERIFICATION.md](./REFACTORING_VERIFICATION.md)
- [.agent/architecture/TESTING_INFRASTRUCTURE.md](./.agent/architecture/TESTING_INFRASTRUCTURE.md)

---

*Document version: 1.0*  
*Last updated: 2026-02-20*
