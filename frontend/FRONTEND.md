# Frontend Documentation

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
│   ├── logStore.ts      # legacy re-export entrypoint
│   ├── waveformStore.ts # legacy re-export entrypoint
│   └── mapStore.ts      # legacy re-export entrypoint
├── views/
├── models/
├── utils/
└── workers/
```

## API Layer

Primary client wrappers live in `src/api/client.ts`.

Related files:
- `src/api/upload.ts`: HTTP upload optimization/chunking
- `src/api/websocketUpload.ts`: WS upload client and protocol helpers

## Store Model

Current store architecture is modular:
- `stores/log/*`
- `stores/waveform/*`
- `stores/map/*`

Each module follows the split:
- `state.ts` signals/computed
- `actions.ts` behavior
- `effects.ts` side effects
- `types.ts` contracts
- `index.ts` public exports

Legacy top-level files (`logStore.ts`, `waveformStore.ts`, `mapStore.ts`) remain for backward compatibility.

## Testing

```bash
cd frontend
npm run typecheck
npm run lint
npm run test
npm run test:e2e
```

E2E docs:
- [e2e/README.md](./e2e/README.md)
- [e2e/fixtures/README.md](./e2e/fixtures/README.md)

## Implementation Notes

- Large parse sessions use server-side pagination/filtering paths.
- Waveform view uses chunk + boundary fetch endpoints for continuity.
- Map view integrates map layout, rules, signal-derived state, and carrier log playback.
