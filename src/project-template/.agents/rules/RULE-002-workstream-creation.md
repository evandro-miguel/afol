---
id: RULE-002
theme: workstream-creation
version: 1.0
created: 2026-02-23
applies_to: All agents (Codex, OpenCode, Qwen, Gemini, Claude)
updated_at: '2026-05-14T20:05:00-03:00'
---

# Workstream Creation

**Purpose:** Keep governed execution direct and minimal.

## Artifact Economy Gate

- Create workbench artifacts only for active execution/evidence.
- Default tracked pair: `plan + task`.
- Do not create artifacts as thinking dumps.
- Do not add tasks whose only purpose is to make a plan.

## Standard Workstream

```bash
./.agents/agents new <theme-name> --feature-id F-01 \
  --parent-spec <parent-spec-id>
./.agents/agents new <theme-name> --feature-id F-01 \
  --parent-spec <parent-spec-id> --spec
./.agents/agents new <theme-name> --feature-id F-01 \
  --parent-spec <parent-spec-id> --spec-lite
./.agents/agents new <theme-name> --feature-id F-01 \
  --parent-spec <parent-spec-id> --child-spec <child-spec-id>
just new THEME=<theme-name> FEATURE_ID=F-01 PARENT_SPEC=<parent-spec-id>
```

## Quick Task (active session only)

```bash
./.agents/agents new "Quick task description" --quick
```

## Naming Conventions

| Element | Pattern |
| --- | --- |
| Session folder | `YYMMDD_HHMM_<theme>` |
| Plan file | `*_plan_NN.md` |
| Task file | `*_task_NN.md` |
| Log file | `*_log_NN.md` |
| Spec file | `*_spec_NN.md` |
| Roadmap feature | `F-NN` |
| Task IDs | `T-NN` |
| Pack folder | `packs/<pack-slug>/` |

## Task Status Markers

```markdown
- [ ] T-01 # pending
- [/] T-02 # in_progress
- [%] T-03 # implemented_untested
- [&] T-04 # tested_needs_spec_validation
- [!] T-05 # problem
- [>] T-06 # moved
- [x] T-07 # done
```

## Task State Commands

```bash
./.agents/agents implement start --session <session-id> --task-id T-01
./.agents/agents implement complete --session <session-id> --task-id T-01 \
  --command "just verify" --result passed \
  --artifact .agents/wb/<session-id>/<report-or-log>
./.agents/agents wb-update evidence T-01 --session <session-id> \
  --command "just verify" --result passed \
  --artifact .agents/wb/<session-id>/<report-or-log>
./.agents/agents wb-update task T-01 --session <session-id> \
  --mark-done --evidence-id E-...
```

## Workflow Rules

- For ambiguous or product-shaped work, run smallest decision-intake lane.
- Keep plans executable now.
- Optional artifacts (`brainstorm`, `research`, `explorer-check`,
  `postmortem`) are sidecars only when requested or blocking.
- Start task before product edits.
- Close task only with valid evidence id.
