# State Management Reference (Current)

CIM Visualizer uses `@preact/signals` with modular store folders.

## Store Layout

```text
frontend/src/stores/
├── log/
│   ├── state.ts
│   ├── actions.ts
│   ├── effects.ts
│   ├── types.ts
│   └── index.ts
├── waveform/
├── map/
├── logStore.ts      # legacy re-export entrypoint
├── waveformStore.ts # legacy re-export entrypoint
└── mapStore.ts      # legacy re-export entrypoint
```

## Module Pattern

- `state.ts`: signals + computed values
- `actions.ts`: operations and async flows
- `effects.ts`: subscriptions/persistence/sync side effects
- `types.ts`: shared interfaces/types
- `index.ts`: stable public API

## Practical Rules

- New code should import from modular paths (`stores/log`, `stores/waveform`, `stores/map`).
- Preserve compatibility of legacy re-export files unless removal is explicitly requested.
- Keep cross-store coupling explicit and minimal; prefer pure helpers in `utils` folders.

## Testing

- Unit-test action/state logic in module-level test files.
- Reset signal state between tests.
- Mock API layer from `frontend/src/api/client.ts` when testing async actions.
