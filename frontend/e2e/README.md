# Frontend E2E Tests

Playwright tests live in `frontend/e2e/`.

## Run

Assuming backend is already running:
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

Manual docker control:
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

## Fixtures

See [fixtures/README.md](./fixtures/README.md).
