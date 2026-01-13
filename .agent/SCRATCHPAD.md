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

1. Log Table (Phase 1)
2. Waveform/Timing Diagram (Phase 2)
3. Signal Filtering (Phase 2)
4. Multi-View/Split Panes (Phase 3)
5. Map Viewer + Carrier Tracking (Phase 4)
6. **Playback Feature** (Phase 4.5) ← NEW
7. Bookmarks + Time Sync (Phase 5)
8. **Multi-File Merge** (Phase 5.5) ← NEW
9. Signal Validation + YAML Editor (Phase 6)

---

## Notes

- Reference desktop implementation: `../plc_to_wavedrom/`
- Desktop CONTEXT.md has detailed architecture: `../plc_to_wavedrom/CONTEXT.md`
- Max file size: 1GB
- Chrome-only, no mobile
- Industrial dark theme

---

## Current Blockers

None.

---

## Ideas / Future Considerations

- Consider WebGL if Canvas performance insufficient for large signal counts
- May need chunked rendering for waveform at extreme zoom levels
- Use IndexedDB for session persistence (localStorage has 5MB limit)
