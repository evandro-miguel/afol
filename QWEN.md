# Agent-specific instructions for QWEN
# Auto-synced from AGENTS.md - run `.agents/scripts/sync-agent-docs.py` to update

# AGENTS.md
# Repo contract for coding agents

## 0) Prime directive
Ship correct changes with proof.
Minimize blast radius.
Do not guess. Search the repo.

## 1) Instruction layering
- This file applies to the whole repo.
- If a folder contains its own AGENTS.md, those rules override locally.
- Keep the root contract short.
- Put operational details in `.agents/a-docs/standards/`.
- Architecture docs live in `.agents/arc/`.
- Structure maps live in `.agents/arc/structure/`.

## 2) Single source of truth for management docs
All planning and management docs MUST use templates from:
`.agents/a-docs/templates/`

Do not create ad-hoc formats.
Do not invent new frontmatter fields unless documented.

## 3) Workbench rules
All workstreams must live in:
`.agents/wb/YYMMDD_HHMM_<theme>/`

Naming:
`<theme>_<doc_type>_<NN>.md`

Doc types:
plan, task, brainstorm, research, log, report

Every file must have YAML frontmatter.
Use UTC timestamps with Z suffix.

### Spec linking rule
- Plan -> link to Spec ID
- Task -> link to Spec ID
- Report -> cite Spec ID with evidence

### Structure map rule
- Run `agents-structure-map.py` after major refactors
- Keep structure docs in sync with codebase
- See: `.agents/a-docs/standards/structure-map.md`

## 4) Mandatory workflow
Non-trivial work requires:
1) Plan file
2) Task file
3) Execution + log updates
4) Report with verification evidence

If the user asks for a quick change, still do steps 3 and 4.

## 5) Setup and verification commands
This repo must define the real commands below.
Agents must search the repo for the truth.
Agents must not invent commands.

Install:
- `<project-specific command>`

Dev:
- `<project-specific command>`

Lint:
- `<project-specific command>`

Typecheck:
- `<project-specific command>`

Test:
- `<project-specific command>`

Build:
- `<project-specific command>`

If commands are missing:
- Create `.agents/a-docs/standards/verification.md` with the discovered commands and references.
- Do not proceed to risky refactors.

## 6) Verification before done
A task is done only with evidence.
Evidence is one of:
- test output
- CI link
- log excerpt
- deterministic command output
- screenshot of output (only if needed)

Report must contain:
- commands run
- pass/fail
- evidence

If verification is blocked:
- explain why
- propose a smaller safe change
- add diagnostics

## 7) Bug fixing protocol
When given a bug:
- reproduce or explain the block
- locate root cause
- fix
- add guardrail if feasible
- verify
- report symptom, cause, fix, proof

## 8) Self-improvement loop
After ANY correction from the user:
- append an entry to `.agents/a-docs/lessons/general-lessons.md`
- add a prevention rule
- add a guardrail when feasible (test, assertion, lint rule, CI step)

Do not repeat the same mistake twice.

## 9) Checkbox markers and compatibility
Preferred checklist markers:
- `- [ ]` pending
- `- [/]` in progress
- `- [%]` implemented, not tested yet
- `- [!]` blocked/error (requires blocks file)
- `- [>]` skipped by user request (requires log entry)
- `- [x]` done (tested and verified)

### Marker Authorization Rules
| Marker | Who can set | Requires log |
|--------|-------------|--------------|
| `- [ ]` | Anyone | No |
| `- [/]` | Agent | No |
| `- [%]` | Agent | No |
| `- [!]` | Agent | Yes (blocks file) |
| `- [>]` | **User only** | **Yes (mandatory)** |
| `- [x]` | Agent | No |

**Agents MUST NOT set `- [>]` without explicit user authorization.**

If a tool cannot parse `- [/]` or `- [%]`, it must fall back to:
- `- [ ]` with a `state: in_progress` or `ready_for_test` in the State Board.

### Blocked tasks protocol
When marking a task with `- [!]`:
1. Create `<task-id>-blocks.md` in the same session folder
2. Document the problem, errors, and context
3. Propose next steps or workarounds

### Skipped tasks protocol
When a task is marked with `- [>]`:
1. User must explicitly authorize the skip
2. Create a log entry documenting the skip reason
3. Record timestamp and authorization

## 10) Safety rules
- No secrets in commits or logs.
- No new dependencies without justification.
- No behavior changes without docs and tests.
- Keep diffs small and reviewable.

## 11) Definition of done
Done means:
- plan and tasks tracked
- verification performed and recorded
- report written with proof
- lessons updated if user corrected anything

## 12) Archive before delete
Never permanently delete files.

All files/folders inside the .agents being removed must go to:
`.agents/z-arq/YYYYMMDD_<description>/`

This maintains history and allows recovery.
Document the reason for archival in a report or lessons log.
