# E2E Test Fixtures

This directory contains sample log files for end-to-end testing. Each file corresponds to a specific log parser format.

## Available Fixtures

| File | Parser | Format Description | Entries |
|------|--------|-------------------|---------|
| `sample-plc.log` | PLCDebugParser | `YYYY-MM-DD HH:MM:SS.fff [Level] [path] [cat:signal] (dtype) : value` | ~500 |
| `sample-mcs.log` | MCSLogParser | `YYYY-MM-DD HH:MM:SS.mmm [ACTION=ID, CarrierID] [Key=Value], ...` | ~50 |
| `sample-csv.csv` | CSVSignalParser | `Timestamp,DeviceID,Signal,Value` | ~50 |
| `sample-tab.log` | PLCTabParser | `timestamp [] path\tsignal\tdirection\tvalue\t...` | ~50 |

## Automatic Preload

Fixtures are **automatically loaded** during E2E test setup via `global-setup.ts`:

1. Before tests run, each fixture file is uploaded to the backend
2. Files are parsed and sessions are created
3. Session IDs are stored in environment variables:
   - `TEST_SESSION_PLC_DEBUG`
   - `TEST_SESSION_MCS_LOG`
   - `TEST_SESSION_CSV_SIGNAL`
   - `TEST_SESSION_PLC_TAB`

### Requirements

- Backend must be running on `http://localhost:8089`
- Start backend: `cd backend && go run cmd/server/main.go`

### Using Preloaded Sessions in Tests

```typescript
import { test, expect } from '@playwright/test'
import { gotoWithSession, hasPreloadedSession } from './test-helpers'

test.describe('My Tests', () => {
    test.beforeEach(async ({ page }) => {
        // Check if preloaded session is available
        if (!hasPreloadedSession('plc')) {
            test.skip(true, 'No preloaded PLC session available')
            return
        }
        
        // Navigate with preloaded session
        const success = await gotoWithSession(page, 'timing-diagram', 'plc')
        if (!success) {
            test.skip(true, 'Failed to load session')
            return
        }
    })
    
    test('my test', async ({ page }) => {
        // Test with guaranteed loaded data
        await expect(page.locator('.waveform-canvas')).toBeVisible()
    })
})
```

### Manual Fixture Usage (if preload fails)

If automatic preload fails (e.g., backend not running), tests skip gracefully. You can also manually upload in tests:

```typescript
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Manual upload via API
const fixturePath = path.join(__dirname, 'fixtures', 'sample-plc.log')
```

## Parser Format Details

### PLC Debug Format
Bracket-delimited logs with structured signal information:
```
2025-09-22 13:00:00.000 [Info] [SYSTEM/LINE1/DEV-101] [INPUT:Temperature] (Integer) : 41
```

### MCS Format
AMHS/MCS carrier tracking logs:
```
2025-09-22 13:00:00.000 [ADD=CARR-001, LOT-ABC123] [Source=ST01-01], [Destination=ST05-03], [Priority=5]
```

### CSV Format
Comma-separated signal values:
```csv
2025-09-22 13:00:00.000,DEV-101,Temperature,41
```

### Tab Format
Tab-delimited PLC logs:
```
2025-09-22 13:00:00.000 [] SYSTEM/LINE1/DEV-101\tTemperature\tINPUT\t41\tINFO\t0\tOK\t2025-09-22 13:00:00.000
```

## Adding New Fixtures

When adding new parser formats:
1. Create a sample file with at least 50 entries
2. Update this README with the format details
3. Add the fixture to the table above
4. Add to `FIXTURES` array in `global-setup.ts`
