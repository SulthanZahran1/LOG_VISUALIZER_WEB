# Memory Issue Handoff - 1.7GB File Parsing Crash

**Status:** Workaround in place (4GB Docker memory limit)  
**Root Cause:** Not fixed - requires architecture change  
**Priority:** High for large file support

---

## Problem Summary

When parsing large log files (~1.7GB, ~12 million entries), the backend crashes at ~84-87% progress with "Bad Gateway" error. This is a **memory exhaustion** issue.

### Memory Breakdown (at 11M entries)

| Component | Memory Usage |
|-----------|--------------|
| Compact storage (timestamps, deviceIDs, signalNames, values slices) | ~1.3 GB |
| **ToParsedLog() creates []LogEntry copy** | **~1.3 GB** |
| String interner (unique strings) | ~1.0 GB |
| Go runtime overhead | ~0.5 GB |
| **Total** | **~4.1 GB** |

### Crash Point

```
[Parse xxxx] Progress: 84.5% (11000000 lines) - Memory: 1306.3 MB (alloc) / 2388.4 MB (sys)
[Parse xxxx] Progress: 87.9% (11500000 lines) - Memory: 640.9 MB (alloc) / 1214.8 MB (sys)
... backend crashes and restarts ...
```

The crash happens in `ToParsedLog()` when converting compact storage to full `[]LogEntry` slice.

---

## Current Workaround

**File:** `docker-compose.yml`
```yaml
backend:
  mem_limit: 4g  # Increased from default to accommodate peak memory
```

This allows parsing to complete but is not scalable for larger files.

---

## Root Cause Location

**File:** `backend/internal/parser/compact_storage.go`
**Function:** `ToParsedLog()`

```go
func (cs *CompactLogStore) ToParsedLog() *models.ParsedLog {
    entries := make([]models.LogEntry, 0, cs.entryCount)  // ← DUPLICATES memory!
    
    for i := 0; i < cs.entryCount; i++ {
        entries = append(entries, cs.GetEntry(i))  // ← Copies each entry
    }
    
    return &models.ParsedLog{
        Entries: entries,  // ← This []LogEntry is ~1.3GB for 11M entries
        ...
    }
}
```

The string interning prevents string duplication, but `ToParsedLog()` still creates a full copy of all entries as structs.

---

## Proper Fix Required

### Option 1: On-Demand Entry Conversion (Recommended)

Keep compact storage in `SessionState` and convert entries **only when requested** (pagination):

1. **Modify `SessionState`**:
   ```go
   type SessionState struct {
       Session      *models.ParseSession
       CompactStore *parser.CompactLogStore  // Keep this instead of Result
       Signals      map[string]struct{}
       Devices      map[string]struct{}
       TimeRange    *models.TimeRange
   }
   ```

2. **Modify `GetEntries()`** to convert on-demand:
   ```go
   func (m *Manager) GetEntries(id string, page, pageSize int) ([]models.LogEntry, int, bool) {
       // Convert only the requested page, not all entries
       start := (page - 1) * pageSize
       end := min(start + pageSize, state.CompactStore.Len())
       
       entries := make([]models.LogEntry, 0, end-start)
       for i := start; i < end; i++ {
           entries = append(entries, state.CompactStore.GetEntry(i))
       }
       return entries, state.CompactStore.Len(), true
   }
   ```

3. **Update all parsers** to return metadata only (not call `ToParsedLog()`)

4. **Update `GetChunk()`, `GetSignals()`** to use compact storage methods

### Option 2: File-Based Storage

Store parsed data in a temporary file/SQLite instead of RAM. Much more work but allows unlimited file size.

### Option 3: Streaming Parser

Parse file in chunks, don't keep all entries in memory. Requires significant API changes.

---

## Files to Modify

| File | Changes Needed |
|------|----------------|
| `backend/internal/session/manager.go` | Change `SessionState` to hold `CompactLogStore`, update `GetEntries()`, `GetChunk()`, `GetSignals()` |
| `backend/internal/parser/compact_storage.go` | Already has `GetEntry()`, `Len()`, `GetSignals()`, `GetDevices()` - verify they work correctly |
| `backend/internal/parser/plc_debug.go` | Return metadata only, don't call `ToParsedLog()` |
| `backend/internal/parser/csv.go` | Same as above |
| `backend/internal/parser/mcs.go` | Same as above |
| `backend/internal/parser/plc_tab.go` | Same as above |
| `backend/internal/parser/binary_format.go` | Same as above |

---

## Testing

Test with the 1.7GB file: `VARIABLE_TRACE_0130.log`

Expected memory usage after fix: ~2GB max (instead of 4GB+)

---

## Related Commits

- `6d10bff` - Removed duplicate string storage (saved ~50% memory)
- `6f74b6d` - Increased Docker memory to 4GB (workaround)
- `f704cde` - Reverted architecture changes (too complex)

---

## Questions?

Check `backend.logs` for memory usage patterns. The fix is straightforward but touches many files due to API changes.
