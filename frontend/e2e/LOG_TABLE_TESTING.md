# Log Table E2E Focus

Primary test file: `e2e/log-table-filtering.spec.ts`

## Purpose

Covers log table filtering/sorting behavior in both:
- client-side mode (smaller datasets)
- server-side mode (large datasets)

## Run

```bash
cd frontend
npm run test:e2e -- log-table-filtering.spec.ts
```

Filter by group:
```bash
npm run test:e2e -- log-table-filtering.spec.ts --grep "Client-side"
npm run test:e2e -- log-table-filtering.spec.ts --grep "Server-side"
```

## Troubleshooting

- If backend is unavailable, tests will timeout waiting for app data.
- If large-file scenarios fail, verify required fixture file exists and is loadable.
- Inspect backend logs for `/api/parse/:sessionId/entries` request behavior.
