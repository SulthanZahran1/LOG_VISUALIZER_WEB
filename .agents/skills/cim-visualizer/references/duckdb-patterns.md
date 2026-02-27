# DuckDB Patterns (Backend)

Primary implementation: `backend/internal/parser/duckstore.go`

## Common Query Patterns

Time range:
```sql
SELECT *
FROM entries
WHERE timestamp BETWEEN $1 AND $2
ORDER BY timestamp
```

Time tree bucketing:
```sql
SELECT
  strftime(to_timestamp(timestamp / 1000)::TIMESTAMP, '%Y-%m-%d') AS date,
  EXTRACT(HOUR FROM to_timestamp(timestamp / 1000)::TIMESTAMP) AS hour,
  EXTRACT(MINUTE FROM to_timestamp(timestamp / 1000)::TIMESTAMP) AS minute,
  MIN(timestamp) AS ts
FROM entries
GROUP BY date, hour, minute
ORDER BY date, hour, minute
```

Regex search:
```sql
... WHERE device_id ~ $1 OR signal_name ~ $1 OR value::VARCHAR ~ $1
```

## Guardrails

- Cast `to_timestamp(... )` to `::TIMESTAMP` for `strftime`/`EXTRACT` compatibility.
- Use pagination/windowing for large result sets.
- Ensure session DuckStore exists before query execution.
