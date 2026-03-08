# Frontend Documentation

Last updated: 2026-03-08

## Stack

- Preact 10
- TypeScript
- `@preact/signals`
- Vite
- Vitest + Playwright

Entry points:
- `src/main.tsx`
- `src/app.tsx`

## Directory Map

```text
frontend/src/
├── api/                # API client + upload/ws helpers
├── components/
│   ├── file/
│   ├── log/
│   ├── waveform/
│   ├── map/
│   ├── settings/
│   └── transition/
├── stores/
│   ├── log/
│   ├── waveform/
│   ├── map/
│   ├── transitionStore.ts
│   ├── selectionStore.ts
│   ├── bookmarkStore.ts
│   ├── colorCodingStore.ts
│   ├── logStore.ts
│   ├── waveformStore.ts
│   └── mapStore.ts
├── views/
├── models/
├── utils/
└── workers/
```

## API Layer

Primary typed wrappers live in `src/api/client.ts`.

Related files:
- `src/api/upload.ts`: HTTP upload optimization and chunking
- `src/api/websocketUpload.ts`: WebSocket upload client and protocol helpers

## Store Model

Core store architecture is modular for:
- `stores/log/*`
- `stores/waveform/*`
- `stores/map/*`

Each core module follows the split:
- `state.ts`
- `actions.ts`
- `effects.ts`
- `types.ts`
- `index.ts`

Standalone stores remain for transitions, selection, bookmarks, and color coding. Legacy top-level files (`logStore.ts`, `waveformStore.ts`, `mapStore.ts`) still preserve older import paths.

## View Surface

The app composes these user-facing views:
- Home
- Log Table
- Timing Diagram
- Map Viewer
- Transitions
- Transfer Heatmap

## Testing

```bash
cd frontend
npm run typecheck
npm run lint
npm run test
npm run test:e2e
```

## Related Docs

- [../README.md](../README.md)
- [../API.md](../API.md)
- [../TESTING_CHECKLIST.md](../TESTING_CHECKLIST.md)
- [./e2e/README.md](./e2e/README.md)
- [./e2e/fixtures/README.md](./e2e/fixtures/README.md)
