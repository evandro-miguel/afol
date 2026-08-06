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
