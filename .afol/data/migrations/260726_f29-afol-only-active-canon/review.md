# Retention review: AFOL-only active canon

## Scope

- Archived source: `.agents/config.json`
- Active replacement: `.afol/config.json`
- Classification: legacy fallback provenance
- Archive status: byte-for-byte verified against the source before active-path
  removal

## Retention

- Review at: `2026-08-02T17:44:04Z`
- Deletion approved: no
- Default action at review: retain unless the user explicitly approves the
  exact archive path for removal after checksum and dependency review

## Verification

The archive manifest records the source and destination paths, size, source
timestamp, SHA-256, reason, replacement, and migration status. It contains no
configuration values.
