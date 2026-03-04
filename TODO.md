# TODO

## Log Table Deconstruction

- Extract the inline header block from `frontend/src/components/log/LogTable.tsx` into a modernized `LogTableHeader` that preserves the current draggable, resizable, sortable, and per-column filter behavior.
- Move the context menu and jump-to-time popover out of `frontend/src/components/log/LogTable.tsx` into dedicated components so the main view is mostly orchestration and state wiring.
- Review the remaining `LogTable.tsx` local helpers and inline state (`ColumnFilterPopoverContainer`, parser-specific column config, session type branching) and split stable pieces into reusable modules without changing behavior.
- Once the decomposition stabilizes, update `frontend/src/components/log/index.ts` to reflect that the extracted components are now part of the live `LogTable` path instead of “not yet integrated”.
