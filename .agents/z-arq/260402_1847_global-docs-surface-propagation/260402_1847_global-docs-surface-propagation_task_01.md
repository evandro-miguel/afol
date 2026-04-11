---
doc_type: task
id: 260402_1847_global-docs-surface-propagation_task_01
theme: global-docs-surface-propagation
status: done
owners:
- worker
- tester
created_at: '2026-04-02T18:47:19-03:00'
updated_at: '2026-04-02T18:55:32-03:00'
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: ''
depends_on:
- 260402_1847_global-docs-surface-propagation_plan_01
links:
  plan: 260402_1847_global-docs-surface-propagation_plan_01
  roadmap: .agents/arc/GENERAL-ROADMAP.md
---

# Tasks: global-docs-surface-propagation

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Audited global Codex guidance, skills, plugin docs, and local scaffold entrypoints for repo-map path drift |
| T-02 | done | worker | Updated global Codex guidance and plugin docs/prompts to standardize on `docs/map/` |
| T-03 | done | worker | Updated local scaffold policy docs, template guidance, and `agentic-system-workflow`, then resynced runtime mirrors |
| T-04 | done | tester | Passed local lint, skills-sync consistency, targeted global markdown lint, TOML parse, YAML parse, and no-hit legacy path search |

**State values:** `pending` | `in_progress` | `ready_for_test` | `testing` | `done` | `blocked`

**Task ID format:** `T-01`, `T-02`, ... (ou `T-001` para boards grandes)

**State marker rules:** See [../standards/checkbox-protocol.md](../standards/checkbox-protocol.md)

## Governance Context
- Roadmap feature: `F-11`
- Parent spec: `260323_1741_current-state-maps-and-goal-state-governance_spec_01`
- Child spec: ``
- Task rule:
  - Tasks execute approved intent; they do not replace roadmap/spec definition.

## Relevant Lessons

Before starting work, consult relevant resources:

### Prevention Rules
- [ ] Check [../lessons/general-lessons.md](../lessons/general-lessons.md)
- [ ] Check lesson entries in [../lessons/entries/](../lessons/entries/)

### Useful Resources
- Rules useful for this task:
  - [x] `AGENTS.md` Agent Sync
  - [x] `AGENTS.md` Project-Local Skills Preferred
- Docs useful for this task:
  - [x] `.agents/a-docs/standards/repo-map.md`
  - [x] `.agents/arc/SPECS/260323_1741_current-state-maps-and-goal-state-governance_spec_01.md`
- Skills useful for this task:
  - [x] `agentic-system-workflow`
  - [x] `workbench-agent-teams`
  - [x] `docs-operations`
- Integrations useful for this task:
  - [x] Global Codex home under `/home/ozy/.codex`

## Implementation Checkpoint
- Files touched:
  - `/home/ozy/.codex/AGENTS.md`
  - `/home/ozy/.codex/agents/repo-organizer.toml`
  - `/home/ozy/.codex/skills/code-discovery/SKILL.md`
  - `/home/ozy/.codex/skills/mcp-skill/SKILL.md`
  - `/home/ozy/.codex/skills/mcp-skill/mcp/repo-analysis/README.md`
  - `/home/ozy/.codex/plugins/docker-analisys-tools/references/repo-map-docs.md`
  - `/home/ozy/.codex/plugins/docker-analisys-tools/references/analysis-tools-guide.md`
  - `/home/ozy/.codex/plugins/docker-analisys-tools/skills/repo-map-docs/SKILL.md`
  - `/home/ozy/.codex/plugins/docker-analisys-tools/skills/analysis-tools-guide/SKILL.md`
  - `/home/ozy/.codex/plugins/docker-analisys-tools/skills/*/agents/openai.yaml`
  - `AGENTS.md`
  - `OPENCODE.md`
  - `QWEN.md`
  - `CLAUDE.md`
  - `GEMINI.md`
  - `README.md`
  - `.agents/templates/AGENTS_TEMPLATE.md`
  - `.agents/a-docs/standards/repo-map.md`
  - `.agents/skills/agentic-system-workflow/`
  - `.agents/source/universal-skills/skills/agentic-system-workflow/`
- Key decisions:
  - Standardize current-state repo-map publication on `docs/map/`.
  - Keep `.agents/` described as the agent-system surface.
  - Record the deeper `.agents/a-docs` and `.agents/arc` relocation as
    follow-up debt rather than pretending it landed here.

## Test Gate
- Move to `ready_for_test` only after implementation checkpoint.
- Record command, result, and evidence before marking done.

### Test Evidence
- Command: `make lint`
- Result: pass
- Evidence: `Files checked: 369`, `Issues found: 0`
- Command: `./.agents/agents skills-sync check`
- Result: pass
- Evidence: `PASS: skills structure and sync are valid`
- Command: `./.agents/agents sync --force`
- Result: pass
- Evidence: `Sync complete. 4 file(s) updated.`
- Command: `markdownlint-cli2 /home/ozy/.codex/skills/code-discovery/SKILL.md ...`
- Result: pass
- Evidence: `Linting: 7 file(s)`, `Summary: 0 error(s)`
- Command: `python3` `tomllib` parse of `/home/ozy/.codex/agents/repo-organizer.toml`
- Result: pass
- Evidence: `TOML OK`
- Command: `node` YAML parse of the two plugin `openai.yaml` files
- Result: pass
- Evidence: `YAML OK: ...analysis-tools-guide...`, `YAML OK: ...repo-map-docs...`
- Command: `rg -n "\.agents/arc/map|docs/project-overview" /home/ozy/.codex/AGENTS.md /home/ozy/.codex/agents /home/ozy/.codex/skills /home/ozy/.codex/plugins -S`
- Result: pass
- Evidence: exit code `1` with no matches

---
*Template: `.agents/a-docs/templates/task.md`*
