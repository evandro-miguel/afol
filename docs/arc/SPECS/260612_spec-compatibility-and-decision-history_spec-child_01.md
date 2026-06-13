---
doc_type: spec
id: 260612_spec-compatibility-and-decision-history_spec-child_01
theme: spec-compatibility-and-decision-history
status: draft
owners:
- orchestrator
created_at: '2026-06-12T12:12:33-03:00'
updated_at: '2026-06-12T14:48:23-03:00'
roadmap_feature: F-18
spec_role: child
parent_spec: 260612_afol-administration-project-structure-onion-architecture_spec_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  parent: docs/arc/SPECS/260612_afol-administration-project-structure-onion-architecture_spec_01.md
  related: docs/arc/SPECS/260612_agent-operational-state-context-library_spec_01.md
  adr: docs/arc/DECISIONS/ADR-004-afol-administration-and-project-structure.md
scope:
  repo_areas:
  - .afol/wb
  - .afol/adm
  - docs/arc/DECISIONS
  - cli/commands
  packages:
  - agentic-cli
risk_level: high
---

# SPEC CHILD: spec-compatibility-and-decision-history

## 1) Feature Intent

- Outcome: AFOL can prevent closure when required spec compatibility checks are
  missing or conflicted, and it can preserve strategic decision history through
  ADR, changelog, and archive commands.
- Why now: Evidence proves commands ran, but evidence alone does not prove the
  implementation still matches the active spec or roadmap decision.
- Roadmap feature: `F-18`
- Role of this spec: child delivery contract for closure gates and decision
  history.
- ADR-004 note: once `.afol/adm/**` migration lands, spec and ADR checks should
  use `.afol/adm` as the authority. Until then, `docs/arc/**` remains canonical.

## 2) Problem

Agents can mark work done after passing tests while leaving a behavior/spec
conflict unresolved. Strategic decisions can also be overwritten or abandoned
without a traceable decision trail.

## 3) Users and User Journey

Primary users:

- implementers checking task compatibility,
- reviewers blocking conflicted closure,
- maintainers superseding or abandoning old decisions.

User journey:

1. A task reaches implementation or tested state.
2. `afol spec check -S <session> -T <task> --json` records compatibility state
   in materialized AFOL state and can export JSON for agents/scripts.
3. `afol done -S <session> -T <task> --require-spec-check` requires passed
   evidence and compatible spec status.
4. If conflict remains, `afol done` fails and reports the conflict.
5. An operator updates the spec, creates an ADR, or records an explicit waiver.
6. `afol close` fails while unresolved required conflicts remain.
7. Strategic changes are recorded through ADR/changelog/archive commands.

Failure or friction points:

- No relevant spec -> check records `not_applicable` or requires explicit
  command mode depending on task metadata.
- Conflict found -> task stays open unless resolved or waived.
- Waiver without reason -> command fails.
- Archived decision without trace -> command fails or records incomplete state.
- Failed `done -x` or close gate -> AFOL records a command-error event before
  returning non-zero, so the failed execution path is diagnosable even if later
  evidence supersedes it.

## 4) Experience and Behavior

Expected behavior:

- Spec check state is materialized under `.afol/state/afol.db`; JSON output is
  a command/export format, not a required session source file.
- Required done gates when spec check is enabled:
  - passed evidence exists,
  - no unresolved failed evidence,
  - task is not pending/problem,
  - spec check is compatible, not applicable, or explicitly waived.
- Failed done/close/spec commands write command-error records with failure
  class, command, exit code when known, session/task, gate that rejected the
  operation, and a bounded diagnostic excerpt.
- Waiver requires a reason and should reference an ADR or spec update for major
  conflicts.
- Current transitional decision history paths:
  - `docs/arc/DECISIONS/`
- Target decision history paths after adm migration:
  - `.afol/adm/decisions/`
  - `.afol/adm/changelog.md`
  - `.afol/adm/archive/`

Boundaries:

- Spec checks do not claim full AI semantic proof.
- Human review remains required for large architecture or strategy decisions.
- ADRs do not replace task progress logs.
- Changelog is not a session transcript.

## 5) Scope

In scope:

- `afol spec check -S <session> -T <task> --json`.
- `afol spec conflict -S <session> -T <task> --json`.
- `afol spec waive -S <session> -T <task> --reason "<reason>" --adr <adr-id>`.
- `afol done -S <session> -T <task> --require-spec-check`.
- `afol close -S <session>` blocking unresolved required spec conflicts.
- Command-error logging for failed `done`, `done -x`, `close`, `spec check`,
  `spec conflict`, and `spec waive` operations.
- `afol adr new <topic>`.
- `afol adr accept <id>`.
- `afol adr supersede <old-id> --by <new-id>`.
- `afol adr abandon <id> --reason "<reason>"`.
- `afol adr archive <id> --reason "<reason>"`.
- `afol changelog add --type decision|behavior|breaking|fix --message
  "<message>"`.

Out of scope:

- Automatic proof of all semantic compatibility.
- Blocking trivial tasks without a governing spec by default.
- Replacing human design review.
- Using ADRs as task progress logs.

## 6) Child Spec Strategy

- Child specs required: no.
- This child is already a bounded delivery slice under F-18.

## 7) Constraints and Assumptions

Assumptions:

- Task metadata can identify a governing spec or parent feature.
- Existing evidence gates stay mandatory for done/close.

Constraints:

- Compatibility: existing `done` behavior remains available when no
  `--require-spec-check` policy is active.
- Operational: conflict and waiver records must be audit-friendly JSON.
- Security/privacy: conflicts should cite specs and files, not secret content.

## 8) Acceptance

- `afol spec check` records a compatible, conflict, waived, or not-applicable
  status for a task.
- `afol done --require-spec-check` fails if the check is missing or conflicted.
- `afol done --require-spec-check` passes only with passed evidence and an
  acceptable spec-check status.
- Waiver requires reason and records ADR/spec reference when provided.
- `afol close` fails when unresolved required conflicts remain.
- Failed done/close/spec operations append a structured command-error record
  before exit, without converting the failure into passed evidence.
- ADR status can move through proposed, accepted, superseded, abandoned, and
  archived states without deleting history.
- Changelog records behavior/decision changes without becoming a session log.

## 9) Risks and Tradeoffs

- Risk: compatibility check creates false certainty -> Mitigation: store
  reviewable conflict records and waivers, not opaque pass/fail claims.
- Risk: closure becomes too heavy for small tasks -> Mitigation: require spec
  check only when policy, flag, or governing task metadata asks for it.
- Tradeoff: decision commands add process -> Why accepted: strategic changes
  should remain traceable after specs and roadmap evolve.

## 10) Rollout and Lifecycle

- Start with explicit `--require-spec-check`.
- Add default enforcement only after command behavior and specs agree.
- Backout by leaving compatibility records readable and disabling the required
  gate.

## 11) Verification Philosophy

- Add done/close tests for missing, compatible, conflict, waived, and
  not-applicable spec-check states.
- Add ADR/changelog command tests.
- Add schema tests for materialized spec-check state and JSON command output.
- Add failure-path tests proving rejected gates and failed `done -x` executions
  produce command-error records.
- Run `bun run typecheck`, `bun test`, and `afol validate project --json`.
