# SCRATCHPAD.md — Current Thinking

> Use this for notes, questions, blockers, and temporary thinking.
> Clear or archive sections as they're resolved.

---

## Resolved Questions

| Question | Decision | Priority |
|----------|----------|----------|
| Playback feature for Map Viewer? | ✅ Yes | After Phase 4 (Map Viewer) |
| Export (waveform PNG, table CSV)? | ❌ Not now | Future consideration |
| WebSocket vs polling? | Polling | Simpler, sufficient for single-user |
| Session persistence across refresh? | ✅ Yes | Phase 1 (use IndexedDB) |
| Multi-file merge? | ✅ Yes | After Playback feature |

---

## Updated Phase Order

1. Log Table (Phase 1) - Complete ✅
2. Waveform/Timing Diagram + Filtering (Phase 2) - In Progress 🚧
3. Map Viewer + Carrier Tracking (Phase 3) - Next ⏭️
4. Playback Feature (Phase 3.5)
5. Bookmarks + Time Sync (Phase 4)
6. Multi-File Merge (Phase 4.5)
7. Signal Validation + YAML Editor (Phase 5)

---

## Notes

- Reference desktop implementation: `../plc_to_wavedrom/`
- Desktop CONTEXT.md has detailed architecture: `../plc_to_wavedrom/CONTEXT.md`
- Max file size: 1GB
- Chrome-only, no mobile
- Industrial dark theme
- **Tabbed view management implemented (replacing split panes).**
- **Waveform Canvas interactive (panning, keyboard nav, jump to time).**
- **"Show Changed" filter dynamically updates sidebar based on viewport activity.**

---

## Current Blockers

None.

---

## Notes

- File upload and manager are implemented and verified.
- Fixed 204 No Content handling in API client.
- Fixed signal update race condition in app.tsx.
- **Log parsers (PLC, MCS, CSV) ported and verified with unit tests.**

---

## Ideas / Future Considerations

- Consider WebGL if Canvas performance insufficient for large signal counts
- May need chunked rendering for waveform at extreme zoom levels
- Use IndexedDB for session persistence (localStorage has 5MB limit)
