---
doc_type: spec
id: 260306_primary-agent-runtime-compatibility_spec_01
theme: primary-agent-runtime-compatibility
status: active
owners:
  - orchestrator
created_at: '2026-03-06T22:36:20+00:00'
updated_at: '2026-03-06T22:36:20+00:00'
links:
  roadmap: 260223_0000_arc_roadmap_01
scope:
  repo_areas:
    - AGENTS.md
    - docs/arc
    - docs
    - .agents/scripts
    - .qwen
    - .codex
    - .opencode
  packages:
    - primary runtime compatibility
risk_level: medium
---

# SPEC: Primary Agent Runtime Compatibility

## 1) Objective

- Make this scaffold solid for the three primary target runtimes: OpenCode, Codex, and Qwen.

## 2) Problem

- The scaffold already has a strong canonical governance layer, but its runtime-facing layer is uneven.
- Codex and Qwen have dedicated folders and mirrored docs, while OpenCode is not yet treated as a first-class runtime.
- That creates ambiguity about where runtime-specific instructions should live, which files are safe to commit, and how approval/tooling behavior should align with the roadmap-first system.

## 3) Non-goals

- This spec does not choose provider credentials, models, or local auth flows for users.
- This spec does not attempt to normalize every runtime into identical file formats.
- This spec does not commit secrets or user-local runtime state.

## 4) Scope

In scope:

- The compatibility contract for OpenCode, Codex, and Qwen in repositories that use this scaffold.
- Which runtime-facing files should be committed, generated, or left local-only.
- How canonical governance artifacts (`AGENTS.md`, roadmap, specs, workstreams) map into runtime-specific entrypoints.
- Bootstrap/sync/runtime docs changes needed to support the three primary runtimes cleanly.

Out of scope:

- Runtime-specific provider secrets
- Personal machine-level configuration outside the repository
- Support for every agent runtime in the ecosystem

## 5) Users and Use Cases

Primary users:

- Project owners bootstrapping a repository from this scaffold
- Agents operating through OpenCode, Codex, or Qwen

Use cases:

- UC-01 A repository owner wants one canonical instruction source while still supporting multiple runtimes.
- UC-02 An OpenCode user wants a project-local entrypoint that loads the repo’s governance files safely.
- UC-03 A Codex or Qwen user wants committed runtime-facing files that stay aligned with the scaffold’s canonical instructions.
- UC-04 A reviewer wants to know which runtime-specific files are safe to commit and which must remain local-only.

## 6) Assumptions

- OpenCode, Codex, and Qwen all support agentic work, but they expose different config surfaces.
- The scaffold should standardize the shared contract instead of pretending the runtimes are identical.
- Canonical governance should stay runtime-agnostic; runtime-specific files should adapt that canonical layer, not fork it.

## 7) Constraints

- Must remain secret-free in committed config.
- Must not depend on a single provider or model family.
- Must support project-local operation without requiring users to edit global machine state first.

## 8) Proposed Solution

Summary:

- Keep `AGENTS.md` and `.agents/*` as the canonical governance layer, then add explicit runtime adapters for OpenCode, Codex, and Qwen.

Key design choices:

- Canonical-first: `AGENTS.md`, roadmap, specs, and workstreams remain the single source of truth.
- Runtime adapters: each runtime gets only the committed files needed to enter that canonical layer cleanly.
- Secret-free contract: committed runtime config may set instructions, safe defaults, and file structure, but never credentials.
- Runtime-specific boundaries: document clearly which files are committed versus user-local.

## 9) Architecture Impact

Touched layers:

- Root runtime entrypoint docs/files
- Runtime folders (`.codex/`, `.qwen/`, `.opencode/`)
- Bootstrap and sync flows
- Standards/documentation

New conceptual components:

- OpenCode-first project adapter
- Cross-runtime compatibility standard

Dependency rules:

- Runtime-facing docs/config must point back to canonical governance artifacts.
- Runtime-specific adapters must never replace roadmap/spec/workstream governance.

## 10) Interfaces

User-facing interfaces:

- Canonical instructions: `AGENTS.md`
- Runtime mirrors/adapters: `QWEN.md`, `OPENCODE.md`, runtime folders, and runtime-local config entrypoints

Operational interfaces:

- Bootstrap provisions runtime-facing repo files
- Sync updates runtime mirrors where mirroring is the chosen contract
- Standards explain runtime-specific boundaries and expected usage

## 11) Data Model

Entities:

- Runtime adapter
  - fields: runtime_id, committed_files, local_only_files, canonical_source, permission_defaults
- Canonical governance source
  - fields: source_file, linked_roadmap, linked_specs

Storage:

- Repo markdown/config files only

Migrations:

- Yes, OpenCode support and runtime docs need migration into the scaffold baseline

## 12) Flow

Happy path:

1. Project owner bootstraps the scaffold.
2. Canonical governance files are created.
3. Runtime adapters are provisioned for OpenCode, Codex, and Qwen.
4. Agents enter through their runtime-specific files, but read and follow the same governance source.
5. Work proceeds through roadmap/spec/workstream rules regardless of runtime.

Error paths:

- E-01 Runtime-specific file drifts from canonical governance -> resync or regenerate.
- E-02 Committed runtime config contains secrets -> block as policy violation.
- E-03 OpenCode/Codex/Qwen entrypoints point to different governance instructions -> treat as compatibility drift.

## 13) Error Handling

- Runtime compatibility violations should be explicit in docs and validation where feasible.
- Missing optional local-only user config should never block repo health checks.
- Missing committed runtime adapter files should be treated as bootstrap/system-quality issues.

## 14) Security and Privacy

- Never commit runtime credentials, tokens, or auth state.
- Use environment variables or runtime-local user config for secrets.
- Keep committed runtime config minimal and reviewable.

## 15) Performance

Budgets:

- New users should understand the runtime contract in one pass through the standard docs.
- Runtime adapters should stay thin enough that drift risk remains low.

Hot paths:

- Bootstrap into a fresh repo
- Entering the repo from OpenCode/Codex/Qwen
- Reviewing whether runtime files still map to canonical governance

## 16) Observability

Logs:

- Capture bootstrap/sync/validation events, not user-local secrets

Metrics:

- Runtime adapter coverage across primary runtimes
- Drift incidents between canonical and runtime-facing files

Tracing:

- Runtime adapter -> canonical instructions -> roadmap/spec/workstream

## 17) Rollout Plan

- Steps:
  1. Research primary runtime capabilities and constraints
  2. Define the shared compatibility contract
  3. Add OpenCode-first repo support and update docs/bootstrap/sync
  4. Add validation or smoke coverage where feasible

Backout:

- Remove or simplify runtime adapters while preserving the canonical governance layer

## 18) Verification Plan

Commands:

- Lint: `make lint`
- Unit: `make test-scripts`
- Validation: `make doctor`
- Full baseline: `make all`

Validation cases:

- VC-01 OpenCode is represented in committed repo structure and bootstrap
- VC-02 Canonical governance remains the source of truth across runtime adapters
- VC-03 Runtime-facing docs/config remain secret-free and reviewable

Evidence required:

- Clean docs, passing tests, and updated runtime-facing scaffold files

## 19) Risks and Mitigations

- Risk: Overfitting to one runtime -> Mitigation: define compatibility at the shared-contract level.
- Risk: Runtime files become stale mirrors -> Mitigation: keep mirrors/adapters narrow and automate sync where possible.
- Risk: Committing dangerous runtime defaults -> Mitigation: keep conservative, secret-free defaults only.

## 20) Open Questions

- Q-01 Should OpenCode use a mirrored `OPENCODE.md`, direct `AGENTS.md`, or both?
- Q-02 Which runtime-specific files deserve validation in `doctor` versus documentation only?
- Q-03 Should Codex and Qwen get explicit committed local config templates, or is folder/readme support enough?

## 21) Acceptance Checklist

- [x] Scope and non-goals are explicit
- [x] Dependency rules defined
- [x] Verification commands defined
- [x] Rollout and backout defined
- [x] Security boundaries included

---

*Spec: `docs/arc/SPECS/260306_primary-agent-runtime-compatibility_spec_01.md`*
