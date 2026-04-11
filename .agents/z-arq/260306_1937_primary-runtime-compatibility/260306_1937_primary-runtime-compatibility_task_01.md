---
doc_type: task
id: 260306_1937_primary-runtime-compatibility_task_01
theme: primary-runtime-compatibility
status: active
owners:
- worker
- tester
created_at: '2026-03-06T19:37:14-03:00'
updated_at: '2026-03-06T19:49:56-03:00'
roadmap_feature: F-06
parent_spec: 260306_primary-agent-runtime-compatibility_spec_01
child_spec: ''
depends_on:
- 260306_1937_primary-runtime-compatibility_plan_01
links:
  plan: 260306_1937_primary-runtime-compatibility_plan_01
  roadmap: .agents/arc/GENERAL-ROADMAP.md
---

# Tasks: primary-runtime-compatibility

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Research official runtime capabilities for OpenCode, Codex, and Qwen. |
| T-02 | done | worker | Add first-class OpenCode support to committed repo structure, sync, and bootstrap flows. |
| T-03 | done | worker | Define and document the primary runtime compatibility contract for OpenCode, Codex, and Qwen. |
| T-04 | skipped | worker | `spec-lite` and child-spec thresholds belong to roadmap features F-02/F-03, not this runtime-compatibility feature. |
| T-05 | done | worker | Add runtime health checks, tool discovery parity, and runtime README standardization. |

**State values:** `pending` | `in_progress` | `ready_for_test` | `testing` | `done` | `blocked`

**Task ID format:** `T-01`, `T-02`, ... (ou `T-001` para boards grandes)

**State marker rules:** See [../standards/checkbox-protocol.md](../standards/checkbox-protocol.md)

## Governance Context
- Roadmap feature: `F-06`
- Parent spec: `260306_primary-agent-runtime-compatibility_spec_01`
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
  - [ ] `.agents/rules/RULE-002-workstream-creation.md`
- Docs useful for this task:
  - [ ] `.agents/a-docs/standards/primary-runtime-compatibility.md`
  - [ ] `.agents/arc/SPECS/260306_primary-agent-runtime-compatibility_spec_01.md`
- Skills useful for this task:
  - [ ] `agentic-system-workflow`
- Integrations useful for this task:
  - [ ] `Official runtime docs for OpenCode, Codex, and Qwen`

## Implementation Checkpoint
- Files touched:
  - `.agents/arc/GENERAL-ROADMAP.md`
  - `.agents/arc/SPECS/260306_primary-agent-runtime-compatibility_spec_01.md`
  - `.agents/a-docs/standards/primary-runtime-compatibility.md`
  - `.agents/a-docs/agentic/agents-bootstrap.md`
  - `.agents/scripts/sync-agent-docs.py`
  - `.agents/scripts/agents-doctor.py`
  - `.agents/scripts/agents-bootstrap.py`
  - `.agents/scripts/tests/test_runtime_compatibility.py`
  - `.agents/agents.config`
  - `.agents/scripts/lib/agents_config.py`
  - `.agents/tools.json`
  - `AGENTS.md`
  - `README.md`
  - `OPENCODE.md`
  - `opencode.json`
  - `.codex/README.md`
  - `.qwen/README.md`
  - `.opencode/README.md`
  - `.opencode/agent/README.md`
  - `260306_1937_primary-runtime-compatibility_research_01.md`
- Key decisions:
  - OpenCode becomes a first-class committed runtime adapter.
  - `AGENTS.md` remains canonical across OpenCode, Codex, and Qwen.
  - Committed runtime files must stay secret-free and thin.
  - Runtime health checks belong in `doctor`, not only in narrative docs.
  - Claude and Gemini remain compatibility mirrors, while OpenCode/Codex/Qwen are the primary runtime set.

## Test Gate
- Move to `ready_for_test` only after implementation checkpoint.
- Record command, result, and evidence before marking done.

### Test Evidence
- Command: `make lint`
- Result: pass
- Evidence: 0 lint issues across 216 checked markdown files.
- Command: `make test-scripts`
- Result: pass
- Evidence: `72 passed, 5 deselected`.
- Command: `make doctor`
- Result: pass
- Evidence: primary runtime compatibility checks passed for OpenCode, Codex, and Qwen.
- Command: `make all`
- Result: pass
- Evidence: full validation completed successfully, including sync, index, tools smoke, telemetry validation, and script tests.

---
*Template: `.agents/a-docs/templates/task.md`*
