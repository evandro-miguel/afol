# Tasks: public-readiness-hardening

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | orchestrator | Maintain workstream, assign agents, integrate patches, run final evidence, and resolve conflicts. |
| T-02 | done | builder-locks | Workbench concurrency: session lock, locked JSONL append, start/evidence/done/log/close/event coverage. |
| T-03 | done | builder-update | Mutation journal and transactional update apply: update audit metadata, locked journal, staging, rollback tests. |
| T-04 | done | builder-ux | Provider archive under `.afol/data/migrations` and explicit validate project/bench routing. |
| T-05 | done | builder-release | Dist smoke update flows and pinned/provisioned required security scanners in CI. |
| T-06 | done | verifier | Audit changed symbols, gates, evidence quality, docs drift, and remaining release blockers. |
