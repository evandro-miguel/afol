---
doc_type: telemetry_feature
status: active
created_at: "2026-04-04T16:00:00Z"
updated_at: "2026-04-04T16:00:00Z"
---

# Telemetry Rotation Policy

## Purpose

Prevent `events.jsonl` from growing indefinitely while preserving enough history for meaningful heat scoring and usage analysis.

## Policy

| Rule | Value | Rationale |
|------|-------|-----------|
| **Max file size** | 10 MB | Keeps file manageable for parsing and backup |
| **Max age** | 90 days | Balances trend analysis with storage |
| **Rotation trigger** | Size OR age, whichever comes first | Ensures neither dimension grows unchecked |
| **Rotation action** | Compress current file to `events.jsonl.YYYYMMDD.gz`, start fresh | Preserves history without blocking writes |
| **Retention** | Keep last 3 compressed files | Provides ~6 months of history at typical usage rates |
| **Cleanup** | Delete compressed files older than 180 days | Prevents indefinite archive growth |

## Manual Rotation

```bash
# Rotate manually (compress and start fresh)
mv .agents/data/telemetry/events.jsonl .agents/data/telemetry/events.jsonl.$(date +%Y%m%d)
gzip .agents/data/telemetry/events.jsonl.$(date +%Y%m%d)
touch .agents/data/telemetry/events.jsonl
```

## Automated Rotation (Future)

When scaffolding supports it, rotation should be triggered by:
- `make doctor` checking file size/age
- `agents-telemetry.py` checking before each write batch
- A cron-like hook in the wrapper script

## Impact on Heat Scoring

- Heat scoring uses recent events (daily/weekly/monthly windows).
- Rotated files are not queried by default heat commands.
- Historical analysis can decompress archived files on demand.

---
*Template: `docs/templates/standard.md`*
