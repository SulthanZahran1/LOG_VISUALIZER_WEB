# Log Table E2E Focus

Last updated: 2026-03-08

Primary test file: `e2e/log-table-filtering.spec.ts`

## Purpose

Covers log-table filtering and sorting behavior in:
- client-side mode for smaller datasets
- server-side mode for large datasets

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

- If backend is unavailable, tests will time out waiting for app data.
- If large-file scenarios fail, verify the required fixture exists and is readable.
- Inspect backend logs for `/api/parse/:sessionId/entries` behavior.

## Related Docs

- [./README.md](./README.md)
- [./fixtures/README.md](./fixtures/README.md)
- [../../API.md](../../API.md)
