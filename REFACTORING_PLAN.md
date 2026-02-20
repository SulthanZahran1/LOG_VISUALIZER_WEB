# 🏗️ CIM Visualizer — Comprehensive Refactoring Plan

> **Goal**: Improve code readability, maintainability, and achieve 70%+ test coverage  
> **Estimated Effort**: 3-4 weeks  
> **Priority**: High (technical debt accumulation)

---

## 📊 Current State Analysis

### Critical Metrics
| Metric | Current | Target | Gap |
|--------|---------|--------|-----|
| **Files >500 lines** | 18 | 0 | 18 |
| **Functions >50 lines** | 40+ | <10 | 30+ |
| **Go test coverage** | ~10% | 70% | 60% |
| **Frontend test coverage** | ~15% | 70% | 55% |
| **Untested Go files** | 22 | 0 | 22 |
| **Untested components** | 28 | 0 | 28 |
| **Test files total** | 36 | 100+ | 64+ |

### Most Problematic Files

#### 🔴 Tier 1: Critical (Immediate Action)
| File | Lines | Functions | Issues |
|------|-------|-----------|--------|
| `mapStore.ts` | 897 | 73 | Massive store, 73 functions! |
| `handlers.go` | 1,335 | 41 | God object, mixed concerns |
| `LogTable.tsx` | 1,160 | 11 | Mixed UI + logic, 223-line function |
| `duckstore.go` | 1,335 | 33 | Complex DB operations, no tests |
| `FileUpload.tsx` | 1,019 | 2 | Large JSX, mixed upload modes |

#### 🟡 Tier 2: High Priority
| File | Lines | Issues |
|------|-------|--------|
| `WaveformCanvas.tsx` | 966 | Canvas logic mixed with rendering |
| `manager.go` | 912 | Session management too complex |
| `websocket.go` | 787 | WebSocket handlers mixed |
| `websocketUpload.ts` | 743 | Upload logic not modular |
| `SignalSidebar.tsx` | 736 | UI + signal filtering mixed |
| `logStore.ts` | 712 | State + side effects mixed |
| `app.tsx` | 707 | Too many responsibilities |

---

## 🎯 Refactoring Strategy

### Core Principles

1. **Single Responsibility**: Each file/module has one reason to change
2. **Test-Driven**: Write tests BEFORE refactoring
3. **Incremental**: Small, reviewable PRs (max 500 lines changed)
4. **No Regression**: Feature parity maintained throughout
5. **Documentation**: Update docs with each change

### Pattern: Extract, Test, Migrate

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Identify  │────▶│    Test     │────▶│   Extract   │
│   Target    │     │   (Before)  │     │   Module    │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Update    │◀────│    Test     │◀────│    Refactor │
│    Docs     │     │   (After)   │     │   (Clean)   │
└─────────────┘     └─────────────┘     └─────────────┘
```

---

## 📋 Phase 1: Backend Refactoring (Week 1)

### 1.1 Break Down `handlers.go` (1,335 lines → ~200 lines each)

**Current State**: Single file with 41 handler methods

**Target Structure**:
```
backend/internal/api/
├── handlers.go              # ~150 lines - Main handler struct + constructor
├── handlers_upload.go       # ~200 lines - File upload handlers
├── handlers_parse.go        # ~250 lines - Parse session handlers
├── handlers_map.go          # ~200 lines - Map configuration handlers
├── handlers_carrier.go      # ~150 lines - Carrier tracking handlers
├── handlers_websocket.go    # ~100 lines - WebSocket setup
└── handlers_test.go         # Comprehensive tests for all handlers
```

**Migration Steps**:
1. Create `handlers_upload.go` - Extract upload-related handlers
2. Create `handlers_parse.go` - Extract parse/session handlers
3. Create `handlers_map.go` - Extract map-related handlers
4. Create `handlers_carrier.go` - Extract carrier tracking
5. Create comprehensive tests for each
6. Remove old handlers from main file

**Testing Strategy**:
```go
// handlers_upload_test.go
func TestHandleUploadFile(t *testing.T) {
    tests := []struct {
        name       string
        req        uploadRequest
        wantStatus int
        wantErr    bool
    }{
        {"valid file", validReq, 200, false},
        {"empty name", emptyNameReq, 400, true},
        {"invalid base64", badBase64Req, 400, true},
        {"large file", largeFileReq, 413, true},
    }
    // Test each case
}
```

### 1.2 Decompose `duckstore.go` (1,335 lines)

**Current State**: Database operations + query building + schema management

**Target Structure**:
```
backend/internal/parser/
├── duckstore/
│   ├── store.go             # Core store struct and interface
│   ├── schema.go            # Table creation, schema management
│   ├── queries.go           # SQL query builders
│   ├── entries.go           # Entry CRUD operations
│   ├── signals.go           # Signal extraction operations
│   ├── batch.go             # Batch insert operations
│   ├── timeindex.go         # Time indexing operations
│   ├── store_test.go        # Integration tests
│   └── mocks/
│       └── store_mock.go    # Mock for testing
```

**Key Refactorings**:
- Extract `DuckStore` interface for testability
- Separate SQL query building from execution
- Create batch insert abstraction
- Add context support for cancellation

### 1.3 Refactor `manager.go` (912 lines)

**Target Structure**:
```
backend/internal/session/
├── manager.go               # ~200 lines - Core manager
├── lifecycle.go             # Session create/destroy
├── access.go                # TouchSession, keepalive
├── cleanup.go               # Background cleanup logic
├── storage.go               # Session storage abstraction
└── manager_test.go          # Unit tests with mocks
```

**Interface Extraction**:
```go
// session/storage.go
type SessionStore interface {
    Create(id string, config SessionConfig) (*Session, error)
    Get(id string) (*Session, error)
    Touch(id string) error
    Delete(id string) error
    List() ([]*Session, error)
    Cleanup(before time.Time) error
}
```

---

## 📋 Phase 2: Frontend Component Decomposition (Week 1-2)

### 2.1 `LogTable.tsx` (1,160 lines → ~150 lines)

**Current Issues**:
- 223-line main component function
- Mixed: Virtual scroll, filtering, selection, category filter popover
- Inline styles, complex useEffect chains

**Target Structure**:
```
frontend/src/components/log/
├── LogTable.tsx                 # ~150 lines - Main container
├── LogTable.css                 # (existing)
├── hooks/
│   ├── useVirtualScroll.ts      # Virtual scrolling logic
│   ├── useRowSelection.ts       # Multi-select logic
│   ├── useColumnResize.ts       # Column resizing
│   └── useKeyboardNavigation.ts # Keyboard shortcuts
├── components/
│   ├── LogTableHeader.tsx       # Table header with filters
│   ├── LogTableRow.tsx          # Single row renderer
│   ├── LogTableCell.tsx         # Cell with color coding
│   ├── CategoryFilterPopover.tsx # Extracted popover
│   ├── SearchHighlight.tsx      # Highlight matched text
│   └── SelectionToolbar.tsx     # Copy/selection toolbar
├── utils/
│   ├── rowCalculator.ts         # Virtual row calculations
│   └── filterEngine.ts          # Filtering logic
└── __tests__/
    ├── LogTable.test.tsx
    ├── useVirtualScroll.test.ts
    └── filterEngine.test.ts
```

**Hook Extraction Example**:
```typescript
// hooks/useVirtualScroll.ts
export interface VirtualScrollConfig {
    rowHeight: number;
    buffer: number;
    totalItems: number;
    containerHeight: number;
}

export interface VirtualScrollState {
    startIndex: number;
    endIndex: number;
    offsetY: number;
    scrollHeight: number;
}

export function useVirtualScroll(config: VirtualScrollConfig): {
    state: VirtualScrollState;
    onScroll: (scrollTop: number) => void;
} {
    // Implementation
}
```

### 2.2 `FileUpload.tsx` (1,019 lines)

**Current Issues**:
- Single/dual mode upload logic mixed
- Large JSX blocks
- Progress tracking inline

**Target Structure**:
```
frontend/src/components/file/
├── FileUpload.tsx               # ~100 lines - Container
├── FileUpload.css               # (existing)
├── modes/
│   ├── SingleUpload.tsx         # Single file upload UI
│   ├── MultiUpload.tsx          # Multi-file queue UI
│   └── UploadModeToggle.tsx     # Mode switcher
├── components/
│   ├── UploadDropZone.tsx       # Drag-drop area
│   ├── UploadProgress.tsx       # Progress indicator
│   ├── UploadQueue.tsx          # Multi-file queue
│   └── UploadError.tsx          # Error display
├── hooks/
│   ├── useUpload.ts             # Upload state management
│   ├── useChunkedUpload.ts      # Chunked upload logic
│   ├── useMultiUpload.ts        # Queue management
│   └── useDragDrop.ts           # Drag-drop handlers
└── __tests__/
    ├── useUpload.test.ts
    ├── useChunkedUpload.test.ts
    └── FileUpload.test.tsx
```

### 2.3 `WaveformCanvas.tsx` (966 lines)

**Target Structure**:
```
frontend/src/components/waveform/
├── WaveformCanvas.tsx           # ~120 lines
├── components/
│   ├── CanvasRenderer.tsx       # Canvas drawing
│   ├── TimeAxis.tsx             # Time axis overlay
│   ├── SignalRow.tsx            # Single signal row
│   ├── SignalValueLabel.tsx     # Value labels
│   ├── CursorOverlay.tsx        # Time cursor
│   └── SelectionOverlay.tsx     # Time range selection
├── hooks/
│   ├── useCanvasDrawing.ts      # Canvas drawing lifecycle
│   ├── useViewport.ts           # Viewport state
│   ├── useSignalRenderer.ts     # Signal rendering logic
│   ├── useTimeNavigation.ts     # Pan/zoom/time selection
│   └── useVirtualSignals.ts     # Signal virtualization
├── renderers/
│   ├── booleanRenderer.ts       # Boolean signal drawing
│   ├── stateRenderer.ts         # State signal drawing
│   └── valueRenderer.ts         # Value label drawing
└── __tests__/
    ├── renderers.test.ts
    └── hooks.test.ts
```

---

## 📋 Phase 3: Store Refactoring (Week 2)

### 3.1 `mapStore.ts` (897 lines, 73 functions!)

**Critical Issue**: This is the most bloated file in the codebase

**Target Structure**:
```
frontend/src/stores/map/
├── index.ts                     # Public exports
├── store.ts                     # Main store (~100 lines)
├── types.ts                     # Store types
├── signals/
│   ├── layoutSignals.ts         # Layout loading state
│   ├── playbackSignals.ts       # Playback state
│   ├── carrierSignals.ts        # Carrier tracking
│   └── selectionSignals.ts      # Unit selection
├── actions/
│   ├── layoutActions.ts         # Load layout, rules
│   ├── playbackActions.ts       # Play, pause, seek
│   ├── carrierActions.ts        # Track carriers
│   └── unitActions.ts           # Unit selection, info
├── selectors/
│   ├── unitSelectors.ts         # Computed unit data
│   ├── carrierSelectors.ts      # Computed carrier data
│   └── playbackSelectors.ts     # Computed playback state
├── utils/
│   ├── carrierTracker.ts        # Carrier movement logic
│   ├── unitFinder.ts            # Unit lookup utilities
│   └── timeMapper.ts            # Time-to-frame mapping
└── __tests__/
    ├── store.test.ts
    ├── actions.test.ts
    └── selectors.test.ts
```

### 3.2 `logStore.ts` (712 lines)

**Target Structure**:
```
frontend/src/stores/log/
├── index.ts
├── store.ts                     # Core signals
├── types.ts
├── signals/
│   ├── entriesSignals.ts
│   ├── filterSignals.ts
│   ├── sortSignals.ts
│   ├── paginationSignals.ts
│   └── selectionSignals.ts
├── actions/
│   ├── entryActions.ts
│   ├── filterActions.ts
│   ├── sortActions.ts
│   └── fetchActions.ts
├── selectors/
│   ├── filteredEntries.ts       # Memoized filtering
│   ├── sortedEntries.ts         # Memoized sorting
│   └── visibleEntries.ts        # Pagination + filter
└── __tests__/
    └── selectors.test.ts
```

### 3.3 `waveformStore.ts` (509 lines)

**Target Structure**:
```
frontend/src/stores/waveform/
├── index.ts
├── store.ts
├── signals/
│   ├── signalListSignals.ts
│   ├── viewportSignals.ts
│   ├── zoomSignals.ts
│   └── selectionSignals.ts
└── __tests__/
    └── store.test.ts
```

---

## 📋 Phase 4: Test Infrastructure Expansion (Week 3)

### 4.1 Go Test Coverage Plan

**Target**: 70%+ coverage for all packages

```
backend/internal/
├── api/
│   ├── handlers_upload_test.go      # 15 test cases
│   ├── handlers_parse_test.go       # 20 test cases
│   ├── handlers_map_test.go         # 12 test cases
│   └── handlers_carrier_test.go     # 10 test cases
├── parser/
│   ├── duckstore/
│   │   ├── store_test.go            # Integration tests
│   │   └── queries_test.go          # SQL builder tests
│   ├── plc_debug_test.go            # Parser tests (expand)
│   ├── mcs_test.go                  # New tests
│   └── csv_test.go                  # New tests
├── session/
│   ├── manager_test.go              # Unit tests
│   ├── lifecycle_test.go
│   └── cleanup_test.go
├── storage/
│   └── store_test.go                # File operations
└── upload/
    └── manager_test.go              # Upload handling
```

**Test Utilities**:
```go
// backend/internal/testutil/
├── fixtures/
│   ├── sample_log.txt
│   ├── sample_map.xml
│   └── sample_rules.yaml
├── helpers/
│   ├── mock_storage.go
│   ├── mock_session.go
│   └── http_test.go
└── assertions/
    └── custom_assertions.go
```

### 4.2 Frontend Test Coverage Plan

**Target**: 70%+ coverage

```
frontend/src/
├── components/
│   ├── log/__tests__/
│   │   ├── LogTable.test.tsx
│   │   ├── LogTableRow.test.tsx
│   │   ├── CategoryFilterPopover.test.tsx
│   │   └── hooks/useVirtualScroll.test.ts
│   ├── file/__tests__/
│   │   ├── FileUpload.test.tsx
│   │   └── hooks/useUpload.test.ts
│   ├── waveform/__tests__/
│   │   ├── WaveformCanvas.test.tsx
│   │   └── renderers/booleanRenderer.test.ts
│   └── map/__tests__/
│       └── MapViewer.test.tsx
├── stores/
│   ├── log/__tests__/
│   │   └── selectors.test.ts
│   ├── map/__tests__/
│   │   ├── actions.test.ts
│   │   └── selectors.test.ts
│   └── waveform/__tests__/
├── api/__tests__/
│   ├── client.test.ts
│   └── websocketUpload.test.ts
└── utils/__tests__/
    ├── TimeAxisUtils.test.ts
    └── filterEngine.test.ts
```

**Testing Patterns**:
```typescript
// Example: Component test pattern
import { render, screen, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LogTable } from '../LogTable';
import { logStore } from '../../stores/log';

describe('LogTable', () => {
  beforeEach(() => {
    // Reset store state
    logStore.reset();
  });

  it('renders virtual scroll container', () => {
    render(<LogTable />);
    expect(screen.getByTestId('log-table-container')).toBeInTheDocument();
  });

  it('handles row selection', () => {
    render(<LogTable />);
    const row = screen.getByTestId('log-row-0');
    fireEvent.click(row);
    expect(logStore.selectedRows.value.has('0')).toBe(true);
  });

  it('applies category filter', async () => {
    render(<LogTable />);
    const filterButton = screen.getByLabelText('Filter categories');
    fireEvent.click(filterButton);
    
    const category = screen.getByText('System');
    fireEvent.click(category);
    
    expect(logStore.categoryFilter.value.has('System')).toBe(true);
  });
});
```

---

## 📋 Phase 5: Documentation & Validation (Week 4)

### 5.1 Code Documentation

- [ ] JSDoc for all exported functions
- [ ] Go doc comments for all public APIs
- [ ] Architecture Decision Records (ADRs) for major changes
- [ ] README updates for each package

### 5.2 Validation Checklist

- [ ] All tests pass (`npm run test:all`, `go test ./...`)
- [ ] No functionality regressions
- [ ] Performance benchmarks maintained
- [ ] Code coverage reports generated
- [ ] Linting passes
- [ ] Type checking passes

---

## 🗓️ Implementation Schedule

### Week 1: Backend Foundation
| Day | Task | Files | Tests |
|-----|------|-------|-------|
| 1 | Extract handlers_upload.go | 1 new | 5 cases |
| 2 | Extract handlers_parse.go | 1 new | 8 cases |
| 3 | Extract handlers_map.go + carrier.go | 2 new | 10 cases |
| 4 | DuckStore decomposition | 6 new | 12 cases |
| 5 | Session manager refactor | 4 new | 8 cases |

### Week 2: Frontend Components
| Day | Task | Files | Tests |
|-----|------|-------|-------|
| 1 | LogTable hooks extraction | 4 new | 6 cases |
| 2 | LogTable component split | 6 new | 8 cases |
| 3 | FileUpload decomposition | 5 new | 6 cases |
| 4 | WaveformCanvas hooks | 5 new | 6 cases |
| 5 | Store normalization (map, log) | 10 new | 10 cases |

### Week 3: Testing & Polish
| Day | Task |
|-----|------|
| 1 | Go API handler tests |
| 2 | Parser tests expansion |
| 3 | Frontend component tests |
| 4 | Store and utility tests |
| 5 | E2E test expansion |

### Week 4: Documentation & Review
| Day | Task |
|-----|------|
| 1 | Code documentation |
| 2 | Architecture docs update |
| 3 | Performance validation |
| 4 | Final review & bug fixes |
| 5 | Merge & deploy |

---

## 🛠️ Tools & Configuration

### Go Testing
```bash
# Coverage report
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out -o coverage.html

# Race detection
go test -race ./...

# Benchmarks
go test -bench=. ./...
```

### Frontend Testing
```bash
# Coverage with thresholds
npm run test:coverage

# Watch mode for TDD
npm run test:watch

# E2E tests
npm run test:e2e

# Full validation
npm run test:all
```

### Coverage Thresholds (package.json)
```json
{
  "coverageThreshold": {
    "global": {
      "branches": 70,
      "functions": 70,
      "lines": 70,
      "statements": 70
    }
  }
}
```

---

## ⚠️ Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking changes | Feature flags + gradual rollout |
| Test flakiness | Deterministic test data + retries |
| Performance regression | Benchmarks before/after |
| Merge conflicts | Small PRs + frequent rebasing |
| Knowledge silos | Pair programming + documentation |

---

## 📈 Success Metrics

| Metric | Before | After |
|--------|--------|-------|
| Files >500 lines | 18 | 0 |
| Avg file size | 341 lines | <200 lines |
| Functions >50 lines | 40+ | <10 |
| Go test coverage | ~10% | 70%+ |
| Frontend coverage | ~15% | 70%+ |
| Test files | 36 | 100+ |
| Build time | baseline | <+10% |
| Bundle size | baseline | <+5% |

---

## 🚀 Quick Start Checklist

Ready to start? Here's your first sprint:

```bash
# 1. Create feature branch
git checkout -b refactor/backend-handlers

# 2. Set up test infrastructure
mkdir -p backend/internal/testutil/fixtures
mkdir -p backend/internal/testutil/helpers

# 3. Write first test (before refactoring!)
touch backend/internal/api/handlers_upload_test.go

# 4. Extract first handler group
touch backend/internal/api/handlers_upload.go

# 5. Run tests continuously
cd backend && go test ./... -watch

# 6. Commit incrementally
git add . && git commit -m "refactor(api): extract upload handlers with tests"
```

---

## 📚 References

- [Go Code Review Comments](https://github.com/golang/go/wiki/CodeReviewComments)
- [React Testing Patterns](https://testing-library.com/docs/)
- [Refactoring Guru](https://refactoring.guru/)
- [Test-Driven Development](https://www.agilealliance.org/glossary/tdd/)

---

*This plan is a living document. Update it as you discover new refactoring opportunities or constraints.*
