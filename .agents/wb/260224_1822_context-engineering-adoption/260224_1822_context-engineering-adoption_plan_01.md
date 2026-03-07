---
doc_type: plan
id: 260224_1822_context-engineering-adoption_plan_01
theme: context-engineering-adoption
status: deprecated
owners:
- orchestrator
- worker
created_at: '2026-02-24T18:22:00-03:00'
updated_at: '2026-02-24T18:45:00-03:00'
repo: agentic_start_folder
branch: main
links:
  spec: 260224_1822_context-engineering-adoption_spec-lite_01
  task: 260224_1822_context-engineering-adoption_task_01
---

# Plan: Context Engineering Adoption

## Objective
Analyze reference repository (`Agent-Skills-for-Context-Engineering`) and adapt Context Engineering principles and skills into current agentic repository to solve context degradation, optimize token usage, and enhance long-horizon task handling.

## Scope
- **In scope:**
  - Migrate 13 foundational Context Engineering skills to `.agents/skills/`
  - Adopt filesystem-context pattern for dynamic skill loading
  - Implement scratch pad pattern for large tool outputs
  - Integrate context compression techniques
  - Design persistent memory layer (`.agents/memory/`)
- **Out of scope:**
  - Rewriting core agent framework
  - External API integrations not related to context management

## Phase Backlog

### Phase 1: Skill Migration (P1-T01 to P1-T04)
1. P1-T01 Migrate `context-fundamentals` and `context-degradation` to establish baseline context knowledge.
2. P1-T02 Migrate architectural skills: `filesystem-context`, `memory-systems`, `multi-agent-patterns`, `tool-design`.
3. P1-T03 Migrate operational skills: `context-compression`, `context-optimization`, `evaluation`, `advanced-evaluation`.
4. P1-T04 Migrate specialized skills: `hosted-agents`, `project-development`, `bdi-mental-states`.

### Phase 2: Filesystem Context & Dynamic Loading (P2-T01 to P2-T03)
5. P2-T01 Update agent workflows to support dynamic skill loading (only load `SKILL.md` when relevant).
6. P2-T02 Implement "Scratch Pad" pattern: Modify tools with large outputs to write to `.agents/wb/scratch/` and return summaries/references.
7. P2-T03 Standardize plan persistence so agents re-read plans instead of relying on conversation history.

### Phase 3: Context Compression & Optimization (P3-T01 to P3-T02)
8. P3-T01 Integrate `context-compression` techniques into default agent loop to manage long-running sessions.
9. P3-T02 Implement "Observation Masking" where verbose command outputs (tests, linting) are masked with references to logs.

### Phase 4: Memory System Design (P4-T01)
10. P4-T01 Create persistent memory layer (`.agents/memory/`) for user preferences, patterns, and session history sharing.

## Critical Dependencies
- **Tools:** `python3`, `git`, `make`
- **Skills:** `workbench-agent-teams`, `code-strategies`
- **Reference:** `.agents/.tmp/Repos_ref/Agent-Skills-for-Context-Engineering/`

## Risks and Mitigations
| Risk | Severity | Mitigation |
|------|----------|------------|
| Skill schema mismatch | Medium | Validate against `.agents/skills/` templates before merge |
| Context overhead during migration | Low | Migrate incrementally, verify each phase |
| Dynamic loading complexity | Medium | Start with manual loading, automate after validation |

## Verification Plan
- **Unit:** N/A (skills are markdown, not code)
- **Lint:** `make lint` - validate migrated skills follow markdown standards
- **Structure:** `make doctor` - verify skills directory structure
- **E2E:** Test agent session with dynamic skill loading

## Exit Criteria
- All 13 skills migrated and validated
- Dynamic loading workflow documented and tested
- Scratch pad pattern implemented for tools with >2000 token outputs
- Memory layer design documented in `.agents/memory/README.md`

---
*Template: `.agents/a-docs/templates/plan.md`*
