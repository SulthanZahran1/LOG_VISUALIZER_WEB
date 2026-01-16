# SCRATCHPAD.md — Current Thinking

> Use this for notes, questions, blockers, and temporary thinking.
> Clear or archive sections as they're resolved.

---

## Current Work Focus

| Item | Status |
|------|--------|
| **Active Feature** | Carrier Tracking |
| **Current Task** | Mapping `CurrentLocation` signals to map units |
| **Blocking Issues** | None |
| **Next Up** | Unit info panel, carrier display |

---

## Known Issues

| Issue | Severity | Notes |
|-------|----------|-------|
| None currently | - | - |

---

## Open Questions

| Question | Decision | Priority |
|----------|----------|----------|
| Playback feature for Map Viewer? | ✅ Yes | Phase 3.5 |
| Export (waveform PNG, table CSV)? | ❌ Not now | Future |
| WebSocket vs polling? | Polling | Simpler for single-user |
| Session persistence across refresh? | ✅ Yes | Using IndexedDB |
| Multi-file merge? | ✅ Yes | Phase 4.5 |

---

## Phase Order

1. Log Table (Phase 1) — ✅ Complete
2. Waveform/Timing Diagram (Phase 2) — ✅ Complete
3. Map Viewer + Carrier Tracking (Phase 3) — 🚧 In Progress
4. Playback Feature (Phase 3.5)
5. Bookmarks + Time Sync (Phase 4)
6. Multi-File Merge (Phase 4.5)
7. Signal Validation + YAML Editor (Phase 5)

---

## Technical Notes

- Reference desktop implementation: `../plc_to_wavedrom/`
- Max file size: 1GB (chunked uploads)
- Theme: Industrial dark
- Tabbed view management (replaced split panes)
- SVG-based Map Viewer with pan/zoom

---

## Ideas / Future Considerations

- Consider WebGL if Canvas performance insufficient for large signal counts
- May need chunked rendering for waveform at extreme zoom levels
- Use IndexedDB for session persistence (localStorage has 5MB limit)
