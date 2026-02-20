# Testing Infrastructure Setup Guide

> **Goal**: Achieve 70%+ test coverage with maintainable test patterns  
> **Scope**: Both Go backend and Preact frontend

---

## Current State

### Go Tests
- **Existing**: 8 test files, ~983 lines
- **Coverage**: ~10%
- **Untested files**: 22

### Frontend Tests
- **Existing**: 28 unit + 11 E2E
- **Coverage**: ~15%
- **Untested components**: 28

---

## Go Testing Infrastructure

### 1. Test Utilities Package

```go
// backend/internal/testutil/testutil.go
package testutil

import (
    "testing"
    "time"

    "github.com/plc-visualizer/backend/internal/models"
)

// Fixture helpers
func CreateTestLogEntry(t *testing.T, overrides ...func(*models.LogEntry)) models.LogEntry {
    t.Helper()
    
    entry := models.LogEntry{
        DeviceID:   "TEST-DEVICE",
        SignalName: "TestSignal",
        Timestamp:  time.Now(),
        Value:      true,
        SignalType: models.BooleanSignal,
        Category:   "Test",
    }
    
    for _, override := range overrides {
        override(&entry)
    }
    
    return entry
}

func CreateTestSession(t *testing.T) *models.Session {
    t.Helper()
    
    return &models.Session{
        ID:        "test-session-" + t.Name(),
        CreatedAt: time.Now(),
        Status:    models.StatusPending,
    }
}
```

### 2. Table-Driven Test Pattern

```go
// backend/internal/api/handlers_test.go
package api

import (
    "testing"

    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
)

// Standard table-driven test structure
func TestHandler_Method(t *testing.T) {
    type args struct {
        // Input parameters
    }
    
    type want struct {
        statusCode int
        response   interface{}
        err        bool
        errCode    string
    }
    
    tests := []struct {
        name    string
        setup   func() *testContext  // Test setup
        args    args
        want    want
    }{
        {
            name: "success case",
            setup: func() *testContext {
                return &testContext{
                    store: NewMockStorage(),
                }
            },
            args: args{
                // ...
            },
            want: want{
                statusCode: 200,
                err:        false,
            },
        },
        {
            name: "error case - not found",
            setup: func() *testContext {
                return &testContext{
                    store: NewMockStorage(),
                }
            },
            args: args{
                // ...
            },
            want: want{
                statusCode: 404,
                err:        true,
                errCode:    "NOT_FOUND",
            },
        },
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            ctx := tt.setup()
            handler := NewHandler(ctx.store, /* ... */)
            
            // Execute
            err := handler.Method(/* ... */)
            
            // Assert
            if tt.want.err {
                require.Error(t, err)
                apiErr, ok := err.(*APIError)
                require.True(t, ok)
                assert.Equal(t, tt.want.errCode, apiErr.Code)
            } else {
                require.NoError(t, err)
            }
        })
    }
}
```

### 3. Integration Test Setup

```go
// backend/internal/testutil/integration.go
package testutil

import (
    "database/sql"
    "io/ioutil"
    "os"
    "testing"

    _ "github.com/marcboeker/go-duckdb"
)

// IntegrationTest provides setup for integration tests
type IntegrationTest struct {
    DB     *sql.DB
    TempDir string
}

func NewIntegrationTest(t *testing.T) *IntegrationTest {
    t.Helper()
    
    // Create temp directory
    tempDir, err := ioutil.TempDir("", "test-*")
    if err != nil {
        t.Fatal(err)
    }
    
    // Create DuckDB connection
    db, err := sql.Open("duckdb", "")
    if err != nil {
        os.RemoveAll(tempDir)
        t.Fatal(err)
    }
    
    return &IntegrationTest{
        DB:      db,
        TempDir: tempDir,
    }
}

func (it *IntegrationTest) Cleanup(t *testing.T) {
    t.Helper()
    
    if it.DB != nil {
        it.DB.Close()
    }
    if it.TempDir != "" {
        os.RemoveAll(it.TempDir)
    }
}
```

### 4. Makefile Targets

```makefile
# backend/Makefile
.PHONY: test test-coverage test-race test-integration

test:
	go test -v ./...

test-coverage:
	go test -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report: coverage.html"

test-race:
	go test -race ./...

test-integration:
	go test -tags=integration ./...

# Fail if coverage below threshold
test-coverage-threshold:
	@coverage=$$(go test -coverprofile=coverage.out ./... 2>&1 | grep -o 'coverage: [0-9.]*%' | head -1 | grep -o '[0-9.]*'); \
	if [ $$(echo "$$coverage < 70" | bc -l) -eq 1 ]; then \
		echo "Coverage $$coverage% below threshold 70%"; \
		exit 1; \
	fi; \
	echo "Coverage $$coverage% meets threshold"
```

---

## Frontend Testing Infrastructure

### 1. Test Setup Utilities

```typescript
// frontend/src/test/setup.tsx
import { h } from 'preact';
import { render as testingLibraryRender } from '@testing-library/preact';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Create test query client
export function createTestQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
                gcTime: Infinity,
            },
        },
    });
}

// Custom render with providers
export function render(ui: preact.VNode, options = {}) {
    const queryClient = createTestQueryClient();
    
    return testingLibraryRender(
        h(QueryClientProvider, { client: queryClient }, ui),
        options
    );
}

// Re-export testing library
export * from '@testing-library/preact';
```

### 2. Store Mocking

```typescript
// frontend/src/test/mocks/stores.ts
import { signal, computed } from '@preact/signals';
import type { LogEntry } from '../../models/types';

export function createMockLogStore(overrides = {}) {
    const entries = signal<LogEntry[]>([]);
    const isLoading = signal(false);
    const selectedRows = signal<Set<number>>(new Set());
    
    const filteredEntries = computed(() => entries.value);
    
    return {
        entries,
        isLoading,
        selectedRows,
        filteredEntries,
        // Actions
        fetchEntries: vi.fn(),
        selectRow: vi.fn(),
        toggleRow: vi.fn(),
        clearSelection: vi.fn(),
        ...overrides,
    };
}

export function createMockWaveformStore(overrides = {}) {
    const signals = signal([]);
    const viewport = signal({ startTime: 0, endTime: 1000 });
    const zoom = signal(1);
    
    return {
        signals,
        viewport,
        zoom,
        setViewport: vi.fn(),
        zoomIn: vi.fn(),
        zoomOut: vi.fn(),
        ...overrides,
    };
}
```

### 3. Component Test Pattern

```typescript
// frontend/src/components/log/__tests__/LogTable.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/preact';
import { LogTable } from '../LogTable';
import { render } from '../../../test/setup';
import * as logStoreModule from '../../../stores/logStore';

// Mock the store
vi.mock('../../../stores/logStore', () => ({
    filteredEntries: { value: [] },
    isLoadingLog: { value: false },
    useServerSide: { value: false },
    totalEntries: { value: 0 },
    fetchEntries: vi.fn(),
}));

describe('LogTable', () => {
    const mockEntries = [
        {
            deviceId: 'D1',
            signalName: 'Signal1',
            timestamp: Date.now(),
            value: true,
            signalType: 'boolean',
            category: 'System',
        },
        {
            deviceId: 'D2',
            signalName: 'Signal2',
            timestamp: Date.now() + 1000,
            value: 42,
            signalType: 'integer',
            category: 'User',
        },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders empty state when no entries', () => {
        render(<LogTable />);
        expect(screen.getByText(/no entries/i)).toBeInTheDocument();
    });

    it('renders entries in table', () => {
        // Override mock for this test
        vi.mocked(logStoreModule.filteredEntries).value = mockEntries;
        
        render(<LogTable />);
        
        expect(screen.getByText('D1')).toBeInTheDocument();
        expect(screen.getByText('Signal1')).toBeInTheDocument();
        expect(screen.getByText('D2')).toBeInTheDocument();
    });

    it('handles row selection', async () => {
        vi.mocked(logStoreModule.filteredEntries).value = mockEntries;
        
        render(<LogTable />);
        
        const firstRow = screen.getByTestId('log-row-0');
        fireEvent.click(firstRow);
        
        await waitFor(() => {
            expect(firstRow).toHaveClass('selected');
        });
    });

    it('supports multi-select with ctrl+click', async () => {
        vi.mocked(logStoreModule.filteredEntries).value = mockEntries;
        
        render(<LogTable />);
        
        const row1 = screen.getByTestId('log-row-0');
        const row2 = screen.getByTestId('log-row-1');
        
        fireEvent.click(row1);
        fireEvent.click(row2, { ctrlKey: true });
        
        await waitFor(() => {
            expect(row1).toHaveClass('selected');
            expect(row2).toHaveClass('selected');
        });
    });

    it('shows loading state', () => {
        vi.mocked(logStoreModule.isLoadingLog).value = true;
        
        render(<LogTable />);
        
        expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });
});
```

### 4. Hook Test Pattern

```typescript
// frontend/src/components/log/hooks/__tests__/useVirtualScroll.test.ts
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/preact';
import { useVirtualScroll } from '../useVirtualScroll';

describe('useVirtualScroll', () => {
    const defaultConfig = {
        rowHeight: 28,
        buffer: 5,
        totalItems: 1000,
        containerHeight: 300,
    };

    it('calculates initial state correctly', () => {
        const { result } = renderHook(() => useVirtualScroll(defaultConfig));
        
        expect(result.current.state.startIndex).toBe(0);
        expect(result.current.state.endIndex).toBe(21);
        expect(result.current.state.offsetY).toBe(0);
    });

    it('updates on scroll', () => {
        const { result } = renderHook(() => useVirtualScroll(defaultConfig));
        
        act(() => {
            result.current.actions.onScroll(1000);
        });
        
        expect(result.current.state.scrollTop).toBe(1000);
        expect(result.current.state.startIndex).toBeGreaterThan(0);
    });

    it('scrolls to index', () => {
        const { result } = renderHook(() => useVirtualScroll(defaultConfig));
        
        act(() => {
            result.current.actions.scrollToIndex(100);
        });
        
        // Verify scroll position calculation
        expect(result.current.state.scrollTop).toBeGreaterThan(0);
    });
});
```

### 5. E2E Test Pattern

```typescript
// frontend/e2e/logTable.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Log Table', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('displays log entries after file upload', async ({ page }) => {
        // Upload a test file
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles('./e2e/fixtures/sample_log.txt');
        
        // Wait for upload and parse
        await page.waitForSelector('[data-testid="log-table-container"]');
        
        // Verify entries are displayed
        const rows = page.locator('[data-testid^="log-row-"]');
        await expect(rows).toHaveCount(10);
    });

    test('supports filtering', async ({ page }) => {
        // Upload and navigate to log table
        // ...
        
        // Search for specific device
        await page.fill('[data-testid="search-input"]', 'PLC-01');
        await page.press('[data-testid="search-input"]', 'Enter');
        
        // Verify filtered results
        const rows = page.locator('[data-testid^="log-row-"]');
        await expect(rows).toHaveCount(3);
    });

    test('maintains selection across pagination', async ({ page }) => {
        // Select a row
        const row = page.locator('[data-testid="log-row-0"]');
        await row.click();
        
        // Scroll down (trigger pagination)
        await page.evaluate(() => window.scrollBy(0, 1000));
        await page.waitForTimeout(100);
        
        // Scroll back up
        await page.evaluate(() => window.scrollBy(0, -1000));
        
        // Verify selection is maintained
        await expect(row).toHaveClass(/selected/);
    });
});
```

---

## Coverage Configuration

### Go Coverage

```bash
#!/bin/bash
# backend/scripts/check-coverage.sh

THRESHOLD=70

echo "Running tests with coverage..."
go test -coverprofile=coverage.out ./internal/... 2>&1 | tee coverage.txt

# Extract coverage percentage
COVERAGE=$(grep "coverage:" coverage.txt | tail -1 | grep -o '[0-9.]*%' | sed 's/%//')

echo "Coverage: $COVERAGE%"

if (( $(echo "$COVERAGE < $THRESHOLD" | bc -l) )); then
    echo "❌ Coverage $COVERAGE% is below threshold $THRESHOLD%"
    exit 1
else
    echo "✅ Coverage $COVERAGE% meets threshold $THRESHOLD%"
fi

# Generate HTML report
go tool cover -html=coverage.out -o coverage.html
echo "Report: coverage.html"
```

### Frontend Coverage (vitest.config.ts)

```typescript
// frontend/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './src/test/setup.ts',
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                'src/test/',
                '**/*.d.ts',
                '**/*.config.*',
            ],
            thresholds: {
                global: {
                    branches: 70,
                    functions: 70,
                    lines: 70,
                    statements: 70,
                },
            },
        },
    },
});
```

---

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Test

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

jobs:
  test-go:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-go@v4
        with:
          go-version: '1.21'
      
      - name: Run tests
        run: cd backend && go test -v -race ./...
      
      - name: Check coverage
        run: cd backend && go test -coverprofile=coverage.out ./... && go tool cover -func=coverage.out
      
      - name: Coverage threshold
        run: |
          COVERAGE=$(cd backend && go tool cover -func=coverage.out | grep total | awk '{print $3}' | sed 's/%//')
          if (( $(echo "$COVERAGE < 70" | bc -l) )); then
            echo "Coverage $COVERAGE% below threshold 70%"
            exit 1
          fi

  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json
      
      - name: Install dependencies
        run: cd frontend && npm ci
      
      - name: Run tests
        run: cd frontend && npm run test
      
      - name: Check coverage
        run: cd frontend && npm run test:coverage
      
      - name: Type check
        run: cd frontend && npm run typecheck
      
      - name: Build
        run: cd frontend && npm run build
```

---

## Quick Reference

### Running Tests

```bash
# Go
make test                    # Run all tests
make test-coverage          # With coverage report
make test-race              # Race detection

# Frontend
npm run test                # Unit tests
npm run test:watch          # Watch mode
npm run test:coverage       # Coverage report
npm run test:e2e            # E2E tests
npm run test:all            # Everything
```

### Writing New Tests

```bash
# 1. Create test file alongside source
touch src/components/X.tsx
touch src/components/X.test.tsx

# 2. Follow AAA pattern (Arrange, Act, Assert)

# 3. Use descriptive test names
// Good: "displays error message when API fails"
// Bad: "test error"

# 4. One assertion per test (ideally)

# 5. Mock external dependencies
```

---

## Common Testing Patterns

| Scenario | Pattern |
|----------|---------|
| Store mocking | vi.mock() + signal overrides |
| API mocking | MSW (Mock Service Worker) |
| Async operations | waitFor() or findBy* queries |
| User events | userEvent from @testing-library |
| Snapshots | Use sparingly for complex UIs |
| Integration | Use real stores, mock API |
| E2E | Full stack, real data |
