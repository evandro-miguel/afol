---
doc_type: plan
id: 260413_1551_python-runtime-hardening_plan_02
theme: python-runtime-hardening
status: final
owners:
- orchestrator
workstream_intent: delivery
artifact_purpose: Plan the RAG-backed Python script quality remediation queue.
created_at: 2026-04-13 18:09:48-03:00
updated_at: '2026-04-21T20:52:19-03:00'
roadmap_feature: F-16
parent_spec: 260413_1250_project-template-source-separation_spec_01
child_spec: null
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  task: 260413_1551_python-runtime-hardening_task_01
repo: agentic_start_folder
branch: main
---

# Plan: RAG-backed Python script quality remediation

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds.

## Purpose / Big Picture

- Execute the highest-value quality improvements found by Project RAG and Python-focused agent review.
- Improve correctness, test coverage, type safety, and maintainability in `.agents/scripts/` without broad rewrites.
- Keep the work incremental: small slices, focused tests, full script/runtime gates after each meaningful change.

## Progress

- [x] 2026-04-13T18:09-03:00 - Project RAG corpus for script analysis was created from mirror `/home/ozy/tmp/agentic_start_folder_scripts_rag_20260413_175616/scripts`.
- [x] 2026-04-13T18:09-03:00 - Five Python-focused agent analyses completed: code style, type safety, testing, design, and performance/resource management.
- [x] 2026-04-13T18:09-03:00 - Execute remediation queue slices 1, 2, 4 and 6; add focused regression tests.
- [x] Execute remaining remediation queue slices 3 and 4 follow-up:
  - slice 3 (helper centralization) completed with tested timestamp/session helper reuse.
  - slice 4 (performance/resource deltas) reviewed and deferred pending benchmark evidence.

## Surprises & Discoveries

- Observation: Project RAG ignored `.agents/...` when registered from the repository root, so scripts were indexed through a non-hidden mirror.
  Evidence: direct `.agents` registrations scanned `0` files; mirror ingestion scanned 70 files and created 2556 chunks.
- Observation: the highest-risk correctness items are schema validation gaps, not the large-module refactors.
  Evidence: RAG findings for `agents-telemetry.py` JSON object validation and `agents-tools.py` catalog shape validation.
- Observation: the largest design debt is real, but should be handled after smaller guardrail changes.
  Evidence: `agents-bootstrap.py`, `verify-tasks.py`, `agents-new.py`, and `agents-skills-sync.py` are the largest mixed-responsibility modules.

## Decision Log

- Decision: start with correctness and tests, then refactor structure.
  Rationale: schema validation and destructive/copying behavior have clearer failure modes and smaller blast radius than decomposing monoliths.
  Date/Author: 2026-04-13 / Codex
- Decision: treat Project RAG mirror paths as analysis evidence only, and edit the real paths under `.agents/scripts/`.
  Rationale: the mirror was necessary for indexing, but the source of truth remains the repository.
  Date/Author: 2026-04-13 / Codex
- Decision: defer broad module splits until helper centralization and parity tests exist.
  Rationale: large-file decomposition without parity tests would risk behavior regressions.
  Date/Author: 2026-04-13 / Codex

## Outcomes & Retrospective

- Outcome: plan created from RAG-backed multi-agent analysis.
- Outcome: implemented correctness guards (telemetry/tools), repo-map file-op reliability checks, skills-sync trailer idempotence, bootstrap seed handling, and process utils pass-through tests.
- Outcome: centralized time/session helpers by reusing existing `lib/agents_config` utilities in bootstrap/new/telemetry.
- Outcome: performance/resource slice was reviewed and deferred to a follow-up plan due no low-risk bounded optimization target with immediate evidence.
- Lesson: hidden scaffold paths can be poor Project RAG roots; use explicit mirrors or a supported non-hidden source when ingestion scans zero files.

## Governance Context

- Roadmap feature: `F-16`
- Parent spec: `260413_1250_project-template-source-separation_spec_01`
- Child spec: ``
- Planning rule:
  - Do not redefine feature philosophy here; use this file to plan execution of already-defined intent.
  - Keep RAG line references as evidence, but verify edits against the real repository paths before changing files.

## Planning Inputs

- Project RAG index:
  - Project ID: `md7608d8126cjr7mxyb7w6f9jd84szzy`
  - Mirror root: `/home/ozy/tmp/agentic_start_folder_scripts_rag_20260413_175616/scripts`
  - Verified state: 70 files, 2556 chunks, 2523 symbols, freshness `fresh`
- Agent analysis skills:
  - `python-code-style`
  - `python-type-safety`
  - `python-testing-patterns`
  - `python-design-patterns`
  - `python-performance-optimization`
  - `python-resource-management`
- Knowledge lookup performed:
  - Read active workbench session.
  - Used Project RAG `search_project_code` results and agent reports.
  - Cross-checked local file sizes and subprocess/file I/O patterns with `find`, `wc`, and `rg`.

## Context and Orientation

- `.agents/scripts/` contains the CLI entrypoints and shared helpers for the scaffold.
- `.agents/scripts/lib/` contains reusable helper modules.
- `.agents/scripts/tests/` contains the pytest suite for script behavior and compatibility.
- RAG evidence uses `scripts/...` mirror paths; implementation must target `.agents/scripts/...`.

## Scope

- In scope:
  - JSON object validation in `.agents/scripts/agents-telemetry.py`
  - tool catalog schema validation in `.agents/scripts/agents-tools.py`
  - focused tests for repo-map sync, skills-sync trailer behavior, bootstrap seed/skip behavior, and process_utils passthrough
  - centralization of duplicated time/session helpers when the change is small and covered
  - measured or clearly bounded resource-management improvements
- Out of scope:
  - wholesale rewrites of `agents-bootstrap.py`, `verify-tasks.py`, `agents-new.py`, or `agents-skills-sync.py`
  - speculative caching without evidence or tests
  - changing template/source separation behavior
  - changing Project RAG itself

## Plan of Work

- Slice 1: Correctness guards.
  - Harden `_load_json_dict()` and record-path handling in `.agents/scripts/agents-telemetry.py`.
  - Add focused tests for non-object JSON metadata/context.
  - Add or tighten catalog validation in `.agents/scripts/agents-tools.py` so malformed entries fail with actionable diagnostics.
- Slice 2: Test gaps around risky file operations.
  - Add repo-map tests for destination overwrite/sentinel behavior and staging cleanup on validation failure.
  - Add skills-sync trailer idempotence and commit-message composition tests.
  - Add bootstrap seed skip/error branch tests.
  - Add process_utils passthrough and non-timeout exception tests.
- Slice 3: Low-risk helper centralization.
  - Consolidate duplicated timestamp/session helpers only where tests already cover the consumers.
  - Prefer existing `scripts/lib/agents_config.py` and `scripts/lib/execution_commands.py` helpers over new abstractions.
- Slice 4: Performance/resource management.
  - Optimize `agents-structure-map.py` single-file reads only if tests can prove equivalent output.
  - Defer repo-map shadow-repo strategy and skills-sync hashing cache unless a focused benchmark or regression test is added.
- Slice 5: Refactor backlog.
  - Create follow-up tasks for decomposing `agents-bootstrap.py`, `verify-tasks.py`, `agents-new.py`, and `agents-skills-sync.py` after parity coverage is in place.

## Concrete Steps

1. Re-read the exact target functions in real repo paths:
   - `.agents/scripts/agents-telemetry.py`
   - `.agents/scripts/agents-tools.py`
   - `.agents/scripts/agents-repo-map.py`
   - `.agents/scripts/agents-skills-sync.py`
   - `.agents/scripts/agents-bootstrap.py`
   - `.agents/scripts/lib/process_utils.py`
2. Implement Slice 1 and run:
   - `uv run --project .agents/scripts --locked pytest .agents/scripts/tests/test_agents_telemetry.py .agents/scripts/tests/test_agents_tools_catalog.py -q`
   - `uv run --project .agents/scripts --locked ruff check .agents/scripts/agents-telemetry.py .agents/scripts/agents-tools.py`
3. Implement Slice 2 and run the affected pytest files.
4. Implement Slice 3 only when the consumer tests are already green.
5. Run full gates:
   - `uv run --project .agents/scripts --locked pytest .agents/scripts/tests -q`
   - `uv run --project .agents/runtime --locked pytest .agents/runtime/tests -q`
   - `uv run --project .agents/scripts --locked ruff check .agents/scripts`
   - `uv run --project .agents/runtime --locked ruff check .agents/runtime/src .agents/runtime/tests`
   - `make lint`

## Interfaces and Dependencies

- Tools:
  - `uv`
  - `pytest`
  - `ruff`
  - `rg`
  - `make`
- MCPs:
  - `rag-docs` Project RAG for analysis evidence only
- Skills:
  - `evandro-rag-system`
  - `python-code-style`
  - `python-type-safety`
  - `python-testing-patterns`
  - `python-design-patterns`
  - `python-performance-optimization`
  - `python-resource-management`
- Files and interfaces that must exist at the end:
  - `.agents/scripts/agents-telemetry.py`
  - `.agents/scripts/agents-tools.py`
  - `.agents/scripts/agents-repo-map.py`
  - `.agents/scripts/agents-skills-sync.py`
  - `.agents/scripts/agents-bootstrap.py`
  - `.agents/scripts/lib/process_utils.py`
  - relevant tests under `.agents/scripts/tests/`

## Risks and Mitigations

- Risk: catalog validation breaks currently accepted but valid catalog shapes -> Mitigation: inspect `.agents/tools.json` and preserve all valid existing shapes in fixtures.
- Risk: telemetry validation rejects useful primitive metadata -> Mitigation: treat metadata/context as object-only contract and update error messages/tests explicitly.
- Risk: repo-map file operation tests become brittle -> Mitigation: use temp dirs and sentinel files, not real `docs/map/`.
- Risk: helper centralization creates import-cycle or temp-repo compatibility regressions -> Mitigation: run integration temp-repo tests before broad replacement.
- Risk: performance work changes behavior without measurable value -> Mitigation: defer unless parity tests and a simple measurement exist.

## Validation and Acceptance

- Unit:
  - affected pytest files per slice
  - then `uv run --project .agents/scripts --locked pytest .agents/scripts/tests -q`
- Runtime:
  - `uv run --project .agents/runtime --locked pytest .agents/runtime/tests -q`
- Typecheck:
  - N/A for this pass unless a project typecheck command is introduced.
- Lint:
  - `uv run --project .agents/scripts --locked ruff check .agents/scripts`
  - `uv run --project .agents/runtime --locked ruff check .agents/runtime/src .agents/runtime/tests`
  - `make lint`
- Behavioral acceptance:
  - non-object telemetry JSON fails cleanly
  - malformed tools catalog fails cleanly
  - repo-map sync tests prove destination overwrite and failure behavior
  - skills-sync trailer tests prove no duplicate `Co-authored-by: Codex <noreply@openai.com>` trailer
  - process_utils tests prove passthrough and exception behavior

## Idempotence and Recovery

- Pytest and Ruff commands are safe to rerun.
- File-operation tests must use temp directories and avoid real `docs/map/`.
- If helper centralization regresses temp repo tests, revert that helper slice only and keep correctness/test guard slices.
- If performance work lacks a measurable signal, leave it as backlog rather than forcing a change.

## Artifacts and Notes

- RAG findings captured by agents:
  - type safety: telemetry JSON object validation, tools catalog schema, verify-tasks timestamp type normalization, execution_commands TypedDict/dataclass opportunity
  - code style: `agents-new.py` and `agents-skills-sync.py` concentration, `agents-telemetry.py` and `agents-tools.py` repeated CLI/rendering
  - testing: repo-map sync, skills-sync trailer, skills-sync source resolution, bootstrap seed/skip, process_utils passthrough
  - performance/resource: repo-map copy strategy, structure-map repeated reads, skills-sync recursive hashing, bootstrap repeated copy/checks
  - design: bootstrap and verify-tasks monoliths, duplicated time/session helpers
- Local support evidence:
  - `find .agents/scripts -maxdepth 2 -type f -name '*.py' -printf '%p\n' | xargs wc -l | sort -nr | head -20`
  - `rg -n "subprocess\\.run\\(|run_command\\(|read_text\\(|write_text\\(|shutil\\.copy|copytree|rglob\\(|glob\\(" .agents/scripts -g '*.py'`

## Completion Gate

- [x] RAG-backed analysis exists and is summarized in this plan
- [x] Relevant prior knowledge was searched or explicitly ruled out
- [x] The ExecPlan remains self-contained enough for a new contributor to resume
- [x] Progress entries reflect the actual current state
- [x] Validation path is concrete enough to execute without guesswork
- [x] Implementation tasks are complete
- [x] Full script/runtime/lint gates pass after implementation

---

*Template: `docs/templates/plan.md`*
