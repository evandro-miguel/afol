---
doc_type: "workbench_plan"
id: "260912_1506_f03-quality-backlog_plan_01"
session_id: "260912_1506_f03-quality-backlog"
theme: "f03-quality-backlog"
status: "closed"
created_at: "2026-09-12T20:06:08.447Z"
updated_at: "2026-09-12T20:14:13.181Z"
roadmap_feature: "F-03"
feature_id: "F-03"
parent_spec: "260716_1234_agent-cli-sequential-verification-runs_spec-child_01"
task_ids: "T-01,T-02,T-03"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
closed_at: "2026-09-12T20:14:13.181Z"
---

# Plan: f03-quality-backlog

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-03
- parent_spec: 260716_1234_agent-cli-sequential-verification-runs_spec-child_01
- task: Inventory remaining quality gaps into this session plan (no sidecar pack)
- task: Calibrate leftover active docs and RULE-002 lesson already written
- task: Review: no new handoff packs; remaining skip list is explicit

## Handoff (this plan is the handoff — no `.tmp/grok-handoff-*.md`)

Happy path: `n` / `st` / `d T-01 -x "<real>"` / `c` and `qt`. `e` diagnostic only.

### Already done this week
Hints on n/st/d, no-op reject, journeys, skills, public/template AGENTS, runtime-reference/agents-usage/PAT-002/telemetry/checkbox/task templates.

### T-01 inventory
Scan active surfaces only (`docs/` except `lessons/entries`, `.afol/adm/rules`, `src/project-template`, `cli` user-facing help, `README.md`). Append a "T-01 findings" section here with ACTIVE vs SKIP. Do not create sidecar packs.

Known leftover to confirm:
- `docs/telemetry/README.md` still `afol close --session` / `afol done --session` without `-x`
- `docs/afol-runtime-reference.md` L58–60 CI block (ok if labeled ambiguous/CI)
- untracked `.afol/wb/260912_1431_smoke/` (accidental; do not commit)
- uncommitted RULE-002 1.2 + lesson `20260912_1800_afol-session-is-the-handoff`
- `--test-shell true` still parse-legal (argv `-x true` already rejected)

### T-02 execute
Calibrate remaining ACTIVE docs to short path. Do not rewrite `docs/lessons/entries/**`. Do not reopen final F-03 child. Leave smoke untracked. Do not add harness handoff files.

### T-03 review
Confirm no new `.tmp/grok-handoff-*.md`. Explicit skip list. Close only if T-01 and T-02 are done.

## Execution Plan

- T-01: Inventory remaining quality gaps into this session plan (no sidecar pack)
- T-02: Calibrate leftover active docs and RULE-002 lesson already written
- T-03: Review: no new handoff packs; remaining skip list is explicit

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.

## T-01 findings

Taught happy path still `start --session` + `evidence` then `done` without `-x` (ACTIVE vs SKIP).

### ACTIVE (T-02 should calibrate to `n`/`st`/`d -x`/`c`; `e` diagnostic)

| Surface | Gap |
|---------|-----|
| `docs/telemetry/README.md` L95–97 | Trigger table still `afol close --session` and `afol done --session … --task-id` with no `-x`. Quick Start above already uses `n`/`st`/`d`/`c`. |
| `.afol/adm/rules/README.md` L41–47 | Quick Reference is the old two-hop: `afol new … --feature-id`, `start --session`, `evidence --session … --result passed`, `done --session` (no `-x`), `close --session`. Root `RULE-002` body is already 1.2 short path. |
| `src/project-template/.afol/adm/rules/README.md` L41–47 | Same stale Quick Reference as factory rules README. |
| `src/project-template/.afol/adm/rules/RULE-002-workstream-creation.md` v1.1 | Flow still `evidence -> done -> close`. Commands block is `start --session` + `evidence --result passed` + `done` without `-x`. Root RULE-002 is 1.2; template not synced. |
| `docs/lessons/general-lessons.md` L154 | Prevention rule: `afol evidence` then `afol done` (file is `docs/lessons/` not `entries/`, so in T-01 scope). |
| `.afol/adm/rules/RULE-004-validation-linting.md` L56, L61 | “Record AFOL evidence before running `afol done`” / “without … evidence” still reads as two-hop vs `d -x`. |

### SKIP (do not treat as remaining happy-path debt)

- `docs/afol-runtime-reference.md` L54–61: long `--session` block is labeled CI/multi-agent; `done` already has `-x`. Happy path above is `st`/`d -x`/`qt`.
- `cli/help.ts` `SHORT_USAGE` start: compact `st`/`start T-01` first; `--session` is trailing long usage, not the taught default.
- `docs/lessons/entries/**`: out of T-01/T-02 rewrite scope (historical).
- `docs/standards/evidence-compatibility.md`: `evidence admit --session` is compatibility, not lifecycle happy path.
- `docs/patterns/success/PAT-002_single-active-session.md`, `docs/standards/agents-usage.md`, `docs/public/command-reference.md`, `README.md`, template `AGENTS.md` / `AGENTS_TEMPLATE.md` / `task.md`: already short path or CI-labeled long forms.
- Untracked `.afol/wb/260912_1431_smoke/`: accidental; do not commit.
- Uncommitted root RULE-002 1.2 + lesson `20260912_1800_afol-session-is-the-handoff`: already written; T-02 does not rewrite entries.
- `--test-shell true` still parse-legal (argv `-x true` already rejected): product behavior, not a doc happy-path example in this scan.
- `AGENTS.md` L229: long human forms remain valid by policy.
- `RULE-008` `evidence reverify -S`: post-close diagnostic, not `evidence` then `done`.
- Template `.afol/adm/tools.json` long `--session` usage strings: catalog flags, not taught sequence.

### Residual unknowns

- Whether T-02 should rewrite `docs/lessons/general-lessons.md` (index of entries) vs only rules/telemetry/template RULE-002. Recommend yes: it still teaches two-hop and is not under `entries/`.
- Template `tools.json` not listed ACTIVE; confirm T-02 does not expand into catalog JSON.
