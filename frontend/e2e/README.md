# E2E Testing with Playwright

This directory contains end-to-end tests using Playwright.

## Quick Start

### Option 1: Using Docker (Recommended)

The easiest way to run E2E tests is with Docker, which automatically starts the backend:

```bash
# Run the bash script (builds, tests, cleans up, and logs everything)
cd frontend && npm run test:e2e:docker

# Or run the script directly
cd frontend/e2e && ./run-e2e-docker.sh
```

This script will:
1. Check Docker is running
2. Start the backend container
3. Wait for it to be healthy
4. Run E2E tests
5. Save logs to `test-results/e2e-docker-*.log`
6. Clean up containers

### Option 2: Manual Docker Control

If you want to manage Docker manually:

```bash
# Start backend
cd frontend && npm run test:e2e:docker:up

# Run tests (in another terminal)
cd frontend && npm run test:e2e

# Stop backend
cd frontend && npm run test:e2e:docker:down
```

### Option 3: Manual Backend

If you prefer to run the backend manually without Docker:

```bash
# Terminal 1: Start backend
cd backend && go run cmd/server/main.go

# Terminal 2: Run E2E tests
cd frontend && npm run test:e2e
```

## Test Fixtures

See [fixtures/README.md](./fixtures/README.md) for details on sample log files.

Fixtures are automatically loaded during test setup via `global-setup-simple.ts`.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run test:e2e` | Run E2E tests (expects backend running) |
| `npm run test:e2e:ui` | Run E2E tests with UI mode |
| `npm run test:e2e:docker` | Run with Docker (one command) |
| `npm run test:e2e:docker:up` | Start Docker backend only |
| `npm run test:e2e:docker:down` | Stop Docker backend |
| `./e2e/run-e2e-docker.sh` | Direct script execution |

## Logs

When using `npm run test:e2e:docker`, logs are saved to:
```
test-results/e2e-docker-YYYYMMDD-HHMMSS.log
```

## Architecture

```
e2e/
├── docker-compose.e2e.yml  # Docker setup for backend
├── run-e2e-docker.sh       # Bash script to run tests with Docker
├── docker-setup.ts         # Docker lifecycle management (TS)
├── global-setup.ts         # Setup with Docker auto-start (TS)
├── global-setup-simple.ts  # Setup expecting existing backend (TS)
├── test-helpers.ts         # Helper functions for tests
├── fixtures/               # Sample log files
│   ├── sample-plc.log
│   ├── sample-mcs.log
│   ├── sample-csv.csv
│   └── sample-tab.log
└── *.spec.ts              # Test files
```

## Writing Tests

Use the test helpers for automatic session handling:

```typescript
import { test, expect } from '@playwright/test'
import { gotoWithSession, hasPreloadedSession } from './test-helpers'

test.describe('My Feature', () => {
    test.beforeEach(async ({ page }) => {
        if (!hasPreloadedSession('plc')) {
            test.skip(true, 'No preloaded session')
            return
        }
        
        await gotoWithSession(page, 'timing-diagram', 'plc')
    })
    
    test('works with preloaded data', async ({ page }) => {
        await expect(page.locator('.waveform-canvas')).toBeVisible()
    })
})
```

## Troubleshooting

### Docker build fails with "COPY data/defaults"

Make sure the `backend/data/defaults` directory exists:
```bash
mkdir -p backend/data/defaults
```

### Backend not healthy

Check the logs:
```bash
cd frontend/e2e && docker compose -f docker-compose.e2e.yml logs
```

### Tests timeout waiting for backend

Increase the wait time in `run-e2e-docker.sh` or check if port 8089 is already in use:
```bash
lsof -i :8089
```
