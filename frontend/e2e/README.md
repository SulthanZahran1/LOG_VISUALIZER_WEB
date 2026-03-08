# Frontend E2E Tests

Last updated: 2026-03-08

Playwright tests live in `frontend/e2e/`.

## Run

Assuming backend and frontend are already running:
```bash
cd frontend
npm run test:e2e
```

UI mode:
```bash
cd frontend
npm run test:e2e:ui
```

Docker-assisted flow:
```bash
cd frontend
npm run test:e2e:docker
```

Manual Docker control:
```bash
cd frontend
npm run test:e2e:docker:up
npm run test:e2e
npm run test:e2e:docker:down
```

## Key Files

- `playwright.config.ts`
- `e2e/global-setup.ts`
- `e2e/global-setup-simple.ts`
- `e2e/test-helpers.ts`
- `e2e/*.spec.ts`

## Related Docs

- [../FRONTEND.md](../FRONTEND.md)
- [../../TESTING_CHECKLIST.md](../../TESTING_CHECKLIST.md)
- [./LOG_TABLE_TESTING.md](./LOG_TABLE_TESTING.md)
- [./fixtures/README.md](./fixtures/README.md)
