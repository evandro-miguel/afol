---
doc_type: adr
id: ADR-008
title: AFOL Evolution Autonomy and Evidence Boundary
status: accepted
created_at: '2026-07-16T00:00:00-03:00'
updated_at: '2026-07-16T00:00:00-03:00'
decision_type: governance
owners:
- F-30 governance owner
supersedes: ""
superseded_by: ""
affected_specs:
- .afol/adm/specs/260716_2155_afol-evolution-system_spec_01.md
affected_rules: []
affected_skills: []
affected_commands:
- afol evolve
- afol evolve suggest
- afol evolve import
- afol evolve apply
- afol evolve reject
---

# ADR-008: AFOL Evolution Autonomy and Evidence Boundary

## Context

F-30 introduces a project-local evolution lane that can observe AFOL work,
user decisions, metrics, and explicitly imported harness sessions. Evolution
must reduce repeated friction without becoming an uncontrolled self-modifying
agent. Imported transcripts are data from an untrusted boundary: they can
contain secrets, prompt injection, obsolete instructions, or content from a
different project. Derived indexes and suggestion receipts are operational
state, not canonical knowledge.

The decision applies to the first release and to every later slice unless a
superseding ADR narrows or replaces it. It deliberately keeps the memory and
library adoption loop reviewable and project-local; it does not authorize a
daemon, silent provider ingestion, global preference promotion, or automatic
changes to code, rules, skills, configuration, specs, ADRs, roadmap, or
`AGENTS.md`.

## Decision

Adopt an evidence-first, local-first, fail-closed evolution pipeline:

```text
observe -> normalize/redact -> relate -> analyze -> propose -> criticize
-> user/policy approval -> apply through AFOL lifecycle -> evaluate/canary
-> stabilize or rollback
```

The observer and analyst never approve their own output. `afol evolve` is
strictly read-only analysis/preview. `afol evolve suggest --first-session` is
also read-only while building the preview, but its fenced receipt claim and a
later explicit decision may append their canonical journal events; they do not
mutate canonical knowledge. Every candidate, proposal, import, link, decision,
mutation, evaluation, and rollback must carry stable identifiers and source
references sufficient to reconstruct the decision without trusting model prose.

### Scope and precedence

- State is project-local by default. A preference, lesson, memory entry, or
  proposal may not cross project boundaries without explicit approval.
- Structural authority wins over inferred preference: current user
  instruction, security/integrity policy, spec, ADR, rule, and platform
  restriction all override preference evidence.
- External evidence is never an explicit user preference. It may support an
  observation or proposal, but only an explicit project-user decision can
  create, reinforce, reject, forget, or promote a preference.
- Caller labels are not authentication. Journal authority is assigned only by
  the trusted local dispatcher: an explicit user authority requires a locally
  verified project-user origin, and approved policy authority requires the
  system policy gate. Local/remote agents and external harnesses remain
  observer authority and cannot impersonate either decision source.
- Canonical knowledge remains in existing AFOL surfaces. Evolution DB rows,
  indexes, clusters, receipts, caches, and projections are derived and must
  be rebuildable without deleting canonical knowledge.

Calendar dates and production days are different contracts. A receipt is
deduplicated by the immutable project-local calendar date in the configured
IANA timezone. A production day is created only by a qualifying durable result
and receives a monotonic ordinal; preference freshness and evaluation windows
use that ordinal, never elapsed calendar time. A calendar date with no
qualifying result does not advance the production ordinal.

### P0 controls (release blockers)

The following controls are mandatory. A missing, ambiguous, or failed control
blocks the operation and leaves it at proposal/preview state.

1. **Untrusted external boundary.** Imported content is inert data. It is
   never executed, treated as policy, copied directly into a rule or skill,
   or used to approve its own promotion. Prompt-injection strings remain
   quoted evidence and cannot alter the command, tool, or authorization
   path.
2. **Redaction before persistence.** Redaction runs before writing normalized
   records, SQLite pages, WAL, journals, checkpoints, temporary files,
   exports, error messages, or logs. A redaction failure is fail-closed;
   plaintext is not retained for diagnostics. Raw bytes exist only in bounded
   process memory. Uncertain redaction produces metadata-only quarantine with
   the policy version and counts, never the original text. Secret values are
   never printed or included in evidence reports. Hashes may be retained for
   deduplication only when they do not disclose the secret.
3. **Explicit, read-only import.** Import starts only from an explicit
   operator command and a preview/confirmation boundary. The source is
   opened read-only from a configured or invocation-approved allowlist;
   regular files only, with no symlink traversal, directory substitution,
   FIFO, socket, block/character device, or network fetch. Path resolution
   must reject traversal and escape before opening. Size, record, field, and
   nesting limits are enforced before allocation. The importer verifies
   realpath and file identity before and after streaming so a symlink, inode,
   junction, or reparse-point swap cannot redirect the read.
4. **Receipt fencing and ABA protection.** Daily suggestion receipts are
   keyed by stable project UUID and the local calendar date calculated from the
   project-configured IANA timezone, not UTC, production ordinal, or elapsed
   time. Historical dates are stored and never recalculated from a later
   timezone. A claim has an
   expiry, unpredictable claim token, and monotonically increasing generation
   allocated in the same `BEGIN IMMEDIATE` transaction as the unique
   `(project_id, local_date)` receipt. Acknowledgement is conditional on
   receipt id, claim token, generation, and current status. An expired or stale
   writer cannot overwrite a newer receipt, even if the row or file was deleted
   and recreated (ABA). Production-day event dedupe and ordinal allocation use
   the same transactional rule. Clock/time-zone changes fail closed or require
   an explicit reconciliation.
5. **Immutable evidence journal.** `.afol/data/events/evolution/**` is the
   append-only canonical authority for import acceptance/digests, links,
   observations, proposals, receipt claims/decisions, production-day ordinal
   allocation, approvals, mutations, evaluations, rollbacks, and tombstones.
   Each event has stable sequence/id, action, actor, caller/trust/authority
   context, origin and subject, command, previous-event digest, canonical
   payload, payload/event digests, and source refs. Approval and rollback
   events also bind the exact proposal digest. Receipt claims/shown events may
   use observer authority; receipt decisions and manual link confirmations
   require explicit project-user authority. Existing entries are not rewritten;
   journal-backed derived projections retain the originating
   `journal_event_id`; derived projections
   may be rebuilt only from this journal and must retain its sequence and
   digests. Undo records a compensating event, not silent deletion.
6. **Conservative project linking.** An `auto_verified` link requires both the
   local project UUID and a commit verified in the current repository. A
   `manual_confirmed` link requires a canonical decision reference. A
   `pending` link is ineligible for ranking and learning. Remote, path,
   branch, working directory, task id, semantic similarity, and time overlap
   are supporting signals only and can never authorize an automatic link by
   themselves. Ambiguous or cross-project links remain excluded from ranking
   and learning until explicit confirmation. Displayed paths/remotes remove
   userinfo and tokens. A link never imports a preference by implication.
7. **Windows path and device boundary.** On Windows, reject UNC paths,
   alternate data streams (`name:stream`), reparse-point/symlink escapes,
   device names and device namespaces, reserved DOS names, and path forms
   whose normalized identity differs from the allowlisted root. The same
   no-follow and regular-file checks apply on Linux; tests must cover both
   separator and case-folding rules without granting a broader root.
8. **Retention and tombstones.** Raw external material is opt-in and
   retention-bound. Purge creates a tombstone containing import id, content
   digest, reason, actor/policy, and time; it does not silently erase the
   audit trail or permit reappearance through a stale index/cache. Derived
   rows and receipts are garbage-collected only after references and journal
   ordering are checked. Canonical lessons, memory, library claims, and
   decisions require explicit approval before archival or deletion.

### P1 controls (required before broad rollout)

- **Approval separation:** critical surfaces always require explicit user
  approval and the standard workbench lifecycle. Slice 0-6 have no auto-apply.
  Slice 7 introduces the first-release `canary` mode only for bounded low-risk
  lessons/operational memory and generated documentation, and only when path,
  file/line limits, append-only rules, evidence refs, validation, undo, and
  mutation-journal checks all pass. `none` remains selectable;
  `lessons_memory_only` cannot become the default until canary evidence and an
  explicit policy/configuration approval exist.
- **Evaluation before success:** every applied proposal records a comparable
  baseline, target metrics, minimum sample, production-day window, and
  canary state. It cannot be declared successful when quality, integrity,
  regressions, rework, or user intervention worsens; insufficient data
  remains `needs_more_data`.
- **Preference lifecycle:** explicit, inferred, and structural evidence are
  distinct. Production-day freshness (7-day soft decay, 20-day dormant
  boundary) affects only guidance weight; it never deletes provenance.
  Rejection and contradiction reduce confidence immediately. External
  transcripts can only provide inferred/supporting evidence and never create
  an explicit preference.
- **Low-noise queue:** at most one normal suggestion per project and local
  day, shared by all harnesses through the fenced receipt. Skip preserves the
  pending item; reject records a reason and suppresses replay until materially
  new evidence. Security and integrity events are separate alerts.
- **Canonical/derived separation:** the evolution DB has explicit migrations
  with checksums and `PRAGMA user_version`. Canonical state includes approved
  configuration plus the append-only audit events for user confirmation,
  rejection, snooze, preference decisions, approval, rollback, and retention
  tombstones under `.afol/data/events/evolution/**`. Evolution DB rows,
  clusters, scores, receipts, caches, and
  projections are derived. Rebuilds regenerate them from canonical AFOL
  sources/journal; they do not mutate canonical docs or silently repair
  governance. Database, WAL, journal, and import directories are private by
  default.
- **No automatic governance mutation:** rules, skills, config, specs, ADRs,
  roadmap, `AGENTS.md`, code, global preferences, and canonical deletion are
  proposal-only. External import is command-explicit; no daemon reads chats.

## Import threat model

| Threat | Required mitigation | Residual disposition |
| --- | --- | --- |
| Prompt injection or embedded commands | Treat transcript as untrusted data; quote, redact, size-limit, and keep outside policy/tool instructions | Proposal review and user approval |
| Secrets in messages, paths, errors, WAL, or exports | Redact before every persistence/logging boundary; fail closed on redaction failure | Do not retain plaintext; report only path/key metadata |
| Symlink/reparse/UNC/ADS/device escape | Canonicalize before open, no-follow, regular-file and root-identity checks; reject unsafe Windows forms | Import fails closed |
| Cross-project contamination | Require local project UUID plus a commit verified in the current repository; ambiguous links stay unlinked | Explicit user confirmation |
| Duplicate/replayed import | Manifest content digest, adapter version, idempotency key, and immutable journal | Reuse prior normalized result |
| Partial/crashed import | Temp transaction, checkpoint cursor, atomic commit, and resumable journal sequence | Incomplete derived cache is disposable |
| Receipt race, expiry, or ABA | Local-date key, TTL, owner/fence token, monotonic generation, and compare-and-swap acknowledgement | Stale writer loses without mutation |
| Malicious or oversized input | Streaming parser and bounded bytes/records/fields/nesting; reject unknown format | No partial policy/state promotion |
| Retention or cache resurrection | Tombstones, digest checks, ordered GC, and index rebuild | Canonical knowledge remains governed |

## Consequences

Positive consequences include auditable suggestions, deterministic replay,
safe cross-harness deduplication, and a clear boundary between project
learning and global governance. The cost is additional journal/schema work,
explicit user decisions, conservative linking, and slower promotion of useful
but weakly evidenced material. These costs are accepted because an incorrect
or silently promoted rule/skill is more damaging than a delayed suggestion.

## Acceptance tests

The decision is accepted only when the following checks are automated or have
durable command output linked from the governing F-30 workbench report:

- `afol evolve` performs no mutation or journal append, no LLM call, and
  returns a stable JSON envelope with source refs. `afol evolve suggest
  --first-session` performs no knowledge mutation or LLM call; an explicit
  claim/decision may append exactly one canonical receipt event with source
  refs and digests.
- A second harness cannot show a duplicate suggestion for the same project
  and local date; an expired claim cannot overwrite a newer fence generation.
- `afol evolve`, import, link, apply, reject, and GC operations are exposed
  through the canonical command registry/help and reject unsupported modes or
  unknown arguments.
- Import tests prove explicit invocation, read-only open, no symlink/reparse/
  UNC/ADS/device escape, bounded streaming, idempotent reimport, resumability,
  and fail-closed unknown format behavior on Linux and Windows path fixtures.
- Secret fixtures are absent from normalized output, SQLite/WAL/test logs,
  errors, temporary exports, and reports after redaction; a forced redaction
  failure leaves no persisted plaintext.
- A hostile transcript is stored only as inert/redacted evidence and cannot
  execute a command, change policy, create an explicit preference, or approve
  a proposal.
- Ambiguous and cross-project links remain unlinked; high-confidence links
  include deterministic evidence and never create preferences by implication.
- Journal entries have stable sequence/digests, append-only verification,
  compensating undo records, and rebuildable derived indexes. Purge creates a
  tombstone and stale caches cannot resurrect the record.
- Rules, skills, configuration, specs, ADRs, roadmap, `AGENTS.md`, code,
  global preferences, and canonical deletion remain unchanged after preview,
  reject, and failed validation. A bounded low-risk canary rolls back on a
  validation failure.
- Preference tests cover explicit/inferred/structural precedence, production
  day 7 decay, day 20 dormant behavior, rejection/contradiction, reactivation,
  and project isolation.
- Evaluation tests reject speed-only improvements that increase regressions,
  rework, integrity errors, or user intervention, and keep proposals in
  `needs_more_data` until the minimum comparable sample exists.

Required verification commands for each implementation slice are the
narrowest relevant focused tests plus:

```text
afol local-state rebuild --json
afol validate project --check-drift --json
bun run manifest:check
bun run typecheck
bun test
bun run validate:release
```

## Status

accepted
