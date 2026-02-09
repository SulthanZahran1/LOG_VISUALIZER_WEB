# Log Table E2E Testing Guide

This document describes the comprehensive E2E test suite for the Log Table view, specifically targeting filtering functionality for both small and large files.

## Test File Structure

```
e2e/
├── log-table-filtering.spec.ts    # Main test suite
├── generate-large-fixture.ts      # Large file generator
├── fixtures/
│   ├── sample.log                 # Small file for client-side tests
│   └── large_test.log             # Large file for server-side tests (>100k entries)
└── LOG_TABLE_TESTING.md           # This documentation
```

## Running the Tests

### Prerequisites

1. Start the development server:
```bash
cd web_version/backend && go run cmd/server/main.go
cd web_version/frontend && npm run dev
```

2. Generate large test file (if not exists):
```bash
cd web_version/frontend/e2e
npx tsx generate-large-fixture.ts 150000
```

### Run All Log Table Tests

```bash
cd web_version/frontend
npm run test:e2e -- log-table-filtering.spec.ts
```

### Run Specific Test Groups

```bash
# Client-side filtering only
npm run test:e2e -- log-table-filtering.spec.ts --grep "Client-side"

# Server-side filtering only
npm run test:e2e -- log-table-filtering.spec.ts --grep "Server-side"

# Edge cases
npm run test:e2e -- log-table-filtering.spec.ts --grep "Edge Cases"

# Performance tests
npm run test:e2e -- log-table-filtering.spec.ts --grep "Performance"
```

### Debug Mode

```bash
npm run test:e2e -- log-table-filtering.spec.ts --debug
```

## Test Suite Overview

### 1. Client-side Filtering (Small Files < 100k entries)

Tests the client-side filtering logic used for smaller files.

| Test | Description |
|------|-------------|
| `should filter by text search` | Basic text filtering across device, signal, and value |
| `should filter with case sensitive search` | Case-sensitive search toggle |
| `should filter with regex search` | Regular expression search patterns |
| `should handle invalid regex gracefully` | Error handling for malformed regex |
| `should filter by category` | Category selection from popover |
| `should sort columns in both directions` | Column header sorting (asc/desc) |
| `should show empty state when no results match` | Empty state UI |
| `should clear filters and show all results` | Reset to unfiltered view |
| `should highlight search matches in rows` | Visual highlight of search terms |

### 2. Server-side Filtering (Large Files > 100k entries)

Tests the server-side DuckDB-backed filtering for large files.

| Test | Description |
|------|-------------|
| `should switch to server-side mode for large files` | Automatic mode switching at 100k threshold |
| `should apply server-side search filtering` | API calls with search parameters |
| `should handle rapid filter changes without race conditions` | Debouncing and request cancellation |
| `should maintain scroll position when filters change` | Scroll reset on filter change |
| `should paginate correctly with server-side filtering` | Pagination with filtered results |
| `should handle empty results in server-side mode` | Empty state with server filtering |

### 3. Combined Filters

Tests interaction between multiple filter types.

| Test | Description |
|------|-------------|
| `should apply search and category filter together` | Multiple simultaneous filters |
| `should maintain filter state across view switches` | Persistence when switching views |

### 4. Edge Cases

Tests edge cases and boundary conditions.

| Test | Description |
|------|-------------|
| `should handle special characters in search` | SQL/regex special characters (`%`, `_`, `[`, `]`, etc.) |
| `should handle very long search queries` | Query length limits |
| `should handle unicode characters in search` | International character support |
| `should handle category filter search` | Searching within category list |
| `should handle keyboard shortcuts while filtering` | Keyboard interaction during filtering |

### 5. Performance

Tests performance characteristics.

| Test | Description |
|------|-------------|
| `should debounce rapid search input` | Debouncing prevents excessive API calls |
| `should handle smooth scrolling with virtual list` | Virtual scrolling with filtered data |

### 6. Selection and Filtering

Tests row selection interaction with filtering.

| Test | Description |
|------|-------------|
| `should clear selection when filter changes` | Selection management on filter change |
| `should allow multi-select with Ctrl/Cmd` | Multiple row selection |
| `should copy selected rows to clipboard` | Copy functionality |

### 7. Sorting

Tests sorting functionality.

| Test | Description |
|------|-------------|
| `should sort by all sortable columns` | All column sorting |
| `should maintain sort order when filtering` | Sort persistence with filters |

## Known Issues and Debugging

### Issue: Filtering appears "haywire" for large files

**Symptoms:**
- Inconsistent results when scrolling
- Total count doesn't match visible rows
- Filter changes don't reflect immediately

**Debugging Steps:**

1. Check server-side mode detection:
```typescript
// In browser console
window.logStore?.currentSession.value?.entryCount
// Should be > 100000 for server-side mode
```

2. Verify API requests:
```typescript
// Monitor network tab for /api/parse/{sessionId}/entries?search=...
// Check that search parameter is included
```

3. Check DuckStore query performance:
```bash
# Backend logs should show query timing
# [API] QueryEntries: session=xxx done in 123ms
```

### Common Test Failures

| Failure | Cause | Solution |
|---------|-------|----------|
| `fixture not found` | Missing large_test.log | Run generator script |
| `timeout waiting for .log-table-header` | Backend not started | Start backend server |
| `expected X entries, got Y` | Race condition in filtering | Increase wait times |
| `server-side tests skipped` | large_test.log missing | Generate fixture file |

## Architecture Overview

### Client-side Filtering Flow

```
User Input → searchQuery signal → debounce(100ms) → filteredEntries computed
                                                    ↓
                           Local filtering on logEntries.value
                           (filter by: search, category, type, changed)
```

### Server-side Filtering Flow

```
User Input → searchQuery signal → debounce(100ms) → fetchEntries()
                                                    ↓
                           API call to /api/parse/{id}/entries
                           with filters: search, category, sort, etc.
                                                    ↓
                           DuckDB query in backend
                           (QueryEntries with WHERE clause)
                                                    ↓
                           Response with paginated results
```

### Key Files

| File | Purpose |
|------|---------|
| `logStore.ts` | Filter state management, client/server mode detection |
| `LogTable.tsx` | Virtual scrolling, pagination, filter UI |
| `duckstore.go` | Server-side filtering with DuckDB |
| `session/manager.go` | Query delegation to DuckStore |

## Adding New Tests

1. **Identify the test group** (Client-side, Server-side, Edge Cases, etc.)

2. **Use helper functions** for common operations:
```typescript
await performSearch(page, 'query', { regex: true })
await selectCategories(page, ['Info', 'Warning'])
await scrollToPosition(page, 5000)
```

3. **Handle missing fixtures gracefully**:
```typescript
if (!fs.existsSync(fixturePath)) {
    test.skip('Large test file not available')
    return
}
```

4. **Add appropriate timeouts** for server-side operations:
```typescript
await expect(element).toBeVisible({ timeout: 30000 })
```

## CI/CD Integration

For CI environments, you can:

1. Generate fixture once and cache it:
```yaml
- name: Generate large test fixture
  run: npx tsx e2e/generate-large-fixture.ts 50000  # Smaller for CI
  
- name: Run E2E tests
  run: npm run test:e2e -- log-table-filtering.spec.ts
```

2. Skip large file tests in CI:
```typescript
test('server-side test', async ({ page }) => {
    if (process.env.CI) {
        test.skip('Skipped in CI')
        return
    }
    // ... test code
})
```

## Troubleshooting

### Backend Connection Issues

```bash
# Verify backend is running
curl http://localhost:8080/api/health
# Expected: {"status":"ok"}
```

### DuckDB Query Performance

Check backend logs for slow queries:
```
[API] QueryEntries: session=xxx done in 1234ms (returning 100/50000 entries)
```

If consistently >1000ms:
1. Check if indexes are created: `idx_ts`, `idx_device`, `idx_signal`, `idx_signal_ts`
2. Verify DuckDB pragma settings: `memory_limit`, `threads`
3. Consider reducing PAGE_SIZE in LogTable.tsx

### Frontend State Issues

Check browser console for:
```
[LogStore] useServerSide: true/false
[LogStore] filteredEntries length: X
```

## Future Improvements

1. **Add visual regression tests** for filter UI states
2. **Test with even larger files** (1M+ entries)
3. **Add concurrent user tests** for session handling
4. **Test filter persistence** across browser sessions
5. **Add performance benchmarks** with timing assertions
