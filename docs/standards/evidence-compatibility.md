# Legacy Evidence Compatibility

`afol verify-tasks --strict` is the raw audit and never reads compatibility
admissions. It reports missing, failed, and invalid evidence exactly as stored.

`afol validate project` may classify a historical `missing_evidence` or
`failed_evidence` issue as admitted debt only through
`.afol/adm/source/evidence-compatibility-baseline-v1.json`.

Each v1 admission must name one session/task and issue type, be before the
versioned cutoff, match the current State Board and evidence-ledger SHA-256
hashes, and carry a non-empty approval. The task board must contain no open
tasks. Invalid evidence, post-cutoff work, open work, unlisted issues, and any
hash change remain blocking. Failed evidence is never covered by a missing-
evidence admission; it needs its own entry.

The baseline records compatibility debt. It does not add, rewrite, or claim
historical verification evidence.

## Operator admit path

Agents and operators admit closed pre-cutoff debt with:

```bash
# preview (default)
afol evidence admit --session <id> --all-missing --reason "<text>"
afol evidence admit --session <id> --task-id T-01 --reason "<text>" --json

# write
afol evidence admit --session <id> --all-missing --reason "<text>" --confirm
```

Rules:

- Session must be closed with no open tasks and `session_id < cutoff`
  (default cutoff `260712_0000` when creating the baseline file).
- Only issues already reported by strict verify
  (`missing_evidence` / `failed_evidence`) can be admitted.
  `invalid_evidence` cannot be admitted.
- `--all-missing` admits only `missing_evidence` unless `--issue-type` is set
  (e.g. `--issue-type failed_evidence --all-missing` for failed only).
- Default is dry-run; `--confirm` locks, reloads, merges, and atomically writes
  hash-bound rows into the baseline. Same session+task+issue_type replaces
  hashes/approval (idempotent). A present but invalid baseline file hard-fails
  (never treated as empty create).
- Create-time `--cutoff-session-id` must be `<= 260712_0000` (no raised
  cutoffs). If the baseline already exists, a differing
  `--cutoff-session-id` or `--baseline-id` errors (no silent ignore).
- Does not reopen sessions, mutate task files, or append evidence ledgers.
- Optional filters: `--issue-type`, `--baseline-id`, `--cutoff-session-id`
  (create only), `--issue <url>` (appended into approval), `--approval`
  (alias for reason).
