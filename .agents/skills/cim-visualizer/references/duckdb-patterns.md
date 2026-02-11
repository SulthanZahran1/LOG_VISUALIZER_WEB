# DuckDB Patterns Reference

## Type Casting Reference

### Timestamp Functions

| Function | Input Type | Output Type | Notes |
|----------|-----------|-------------|-------|
| `to_timestamp(seconds)` | BIGINT | TIMESTAMP WITH TIME ZONE | Divide milliseconds by 1000 |
| `to_timestamp(ms/1000)::TIMESTAMP` | BIGINT | TIMESTAMP | **Use this for strftime/EXTRACT** |
| `strftime(ts, format)` | TIMESTAMP | VARCHAR | Format timestamp as string |
| `EXTRACT(part FROM ts)` | TIMESTAMP | BIGINT | Extract hour/minute/etc |

### Common Query Patterns

**Time range filtering:**
```sql
SELECT * FROM entries 
WHERE timestamp BETWEEN $1 AND $2
ORDER BY timestamp
```

**Grouped time tree (Jump to Time):**
```sql
SELECT
    strftime(to_timestamp(timestamp / 1000)::TIMESTAMP, '%Y-%m-%d') AS date,
    EXTRACT(HOUR FROM to_timestamp(timestamp / 1000)::TIMESTAMP) AS hour,
    EXTRACT(MINUTE FROM to_timestamp(timestamp / 1000)::TIMESTAMP) AS minute,
    MIN(timestamp) AS ts
FROM entries
WHERE device_id LIKE '%' || $1 || '%'
GROUP BY date, hour, minute
ORDER BY date, hour, minute
```

**Search with regex:**
```sql
SELECT * FROM entries 
WHERE device_id ~ $1 OR signal_name ~ $1 OR value::VARCHAR ~ $1
```

**Category filter:**
```sql
SELECT * FROM entries 
WHERE category = ANY($1::VARCHAR[])
```

**Signal aggregation for waveform:**
```sql
SELECT 
    timestamp,
    value,
    LAG(value) OVER (ORDER BY timestamp) as prev_value
FROM entries 
WHERE signal_name = $1 AND device_id = $2
ORDER BY timestamp
```

## Common Errors

### Binder Error: No function matches

**Cause:** Type mismatch in function arguments

**Solutions:**
- Cast `to_timestamp()` result to `::TIMESTAMP`
- Ensure string literals use correct quotes
- Check that array types match (`::VARCHAR[]`)

### Out of Memory

**Cause:** Large result sets or concurrent queries

**Solutions:**
- Use `LIMIT` and `OFFSET` for pagination
- Add `querySem` semaphore for concurrency control
- Stream results instead of loading all into memory

### Table not found

**Cause:** Session database not initialized

**Solution:**
```go
if state.DuckStore == nil {
    return c.JSON(http.StatusServiceUnavailable, ...)
}
```
