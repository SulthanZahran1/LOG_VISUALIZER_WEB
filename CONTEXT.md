# CONTEXT.md — Session Bootstrap

Last updated: 2026-07-02

## First 5 Steps

1. Confirm baseline health with `cd frontend && npm run test:all`, or at minimum run typecheck, lint, and unit tests.
2. Check active work notes in `.agent/TODO.md` and `.agent/USER_SPEC.md`.
3. Read only the closest docs you need: [README.md](./README.md), [API.md](./API.md), [backend/README.md](./backend/README.md), [frontend/FRONTEND.md](./frontend/FRONTEND.md).
4. Make the focused change.
5. Update the closest doc and [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md) if behavior or verification flow changed.

## Current Snapshot

- Backend: Echo API with modular handlers under `backend/internal/api`, upload/session managers, and DuckDB-backed query paths for large parse sessions.
- Frontend: Preact + Signals with modular `stores/log`, `stores/waveform`, and `stores/map`, plus standalone auxiliary stores such as `transitionStore.ts`.
- Active views: Home, Log Table, Timing Diagram, Map Viewer, Transitions, Transfer Heatmap, SECS-II Message Detail.
- Upload protocols: HTTP upload/chunking plus WebSocket upload at `/api/ws/uploads`.

## Glossary

### SECS-II
SEMI Equipment Communication Standard (SECS-II), SEMI E5. Semiconductor equipment communication protocol. Messages are structured as stream/function pairs (e.g. S6F11), with data encoded as typed L-list trees (List, U1/U2/U4, A, B, etc.).

### SECS Message (Log Entry)
A single SECS-II communication event in the log format. Structured as:
- Header line: `@timestamp^level^category^direction`
- Transaction time line: `TransactionTime : ... SxFy [W] ... [SystemByte = N]`
- SML body: nested `<Type,Count Value [Label]>` tree terminated by `>.`

### SML (SECS Message Language)
Human-readable text representation of SECS-II messages. The log uses a non-standard variant with comma-separated counts (`<L,3>`) and inline `[Label]` annotations, rather than standard bracket notation (`<L[3]>`).

### L-List
The fundamental SECS-II composite data type. A list (`L`) containing an ordered set of child items (other lists or leaf types). Analogous to a JSON array.

### SystemByte
4-byte transaction identifier in the HSMS header. The same SystemByte value appears in a SEND message and its corresponding RECV reply, enabling transaction pairing for timing analysis. In the log format, expressed as `[SystemByte = 93052]`.

### SxFy
Stream/Function notation — the message type identifier. `S6F11` = Stream 6, Function 11. Odd functions are primary/request (SEND), even functions are secondary/reply (RECV). The W-bit indicates a reply is expected.

### CEID (Collection Event ID)
Numeric identifier for a specific equipment event that triggered a report. Found in S6F11 Event Report messages.

### Transaction
A matched SEND→RECV pair linked by shared SystemByte value. The time delta between the pair (response latency) is a key metric for the waveform view.

### SECS Waveform
Two-lane waveform view: one **SECS** signal row with internal **SEND** (top) and **RECV** (bottom) lanes. Both lanes use uniform amber markers; marker clicks are lane-aware and open the SECS Message Detail dialog with the full SML body tree.

## Test Order

1. Type check
2. Lint
3. Unit tests
4. E2E tests

Frontend:
```bash
cd frontend
npm run typecheck
npm run lint
npm run test
npm run test:e2e
```

Backend:
```bash
cd backend
go test ./...
```

## Related Docs

- [README.md](./README.md)
- [API.md](./API.md)
- [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md)
- [backend/README.md](./backend/README.md)
- [backend/UPLOAD_HANDLING.md](./backend/UPLOAD_HANDLING.md)
- [backend/STORAGE.md](./backend/STORAGE.md)
- [frontend/FRONTEND.md](./frontend/FRONTEND.md)
- [frontend/e2e/README.md](./frontend/e2e/README.md)
