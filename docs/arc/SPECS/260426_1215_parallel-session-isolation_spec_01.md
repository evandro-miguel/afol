---
doc_type: spec
id: 260426_1215_parallel-session-isolation_spec_01
theme: parallel-session-isolation
status: active
owners:
- orchestrator
workstream_intent: Make workbench sessions safe for concurrent remote and local agents.
artifact_purpose: Define the plan for eliminating global active-session contamination.
created_at: '2026-04-26T12:15:45-03:00'
updated_at: '2026-04-26T12:16:53-03:00'
roadmap_feature: F-20
spec_role: parent
parent_spec: ''
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
scope:
  repo_areas:
  - .afol/wb
  - .agents/scripts/agents-new.py
  - .agents/scripts/agents-session.py
  - .agents/scripts/agents-status.py
  - .agents/scripts/agents-review.py
  - .agents/scripts/agents-wb-update.py
  - .agents/scripts/verify-tasks.py
  - docs/standards/
  packages:
  - workbench sessions
  - active session resolution
  - concurrent agent operations
risk_level: high
---

# SPEC: Parallel Session Isolation

## 1) Feature Intent

- Outcome: multiple local, remote, and asynchronous agents can work in the same
  repository without corrupting or overwriting each other's workbench session
  context.
- Why now: Jules created multiple PRs against stale `main` and repeatedly
  changed `.afol/wb/.active_session` as a CI workaround. That exposed a real
  design gap: one global pointer is too fragile for parallel sessions.
- Roadmap feature: `F-20`
- Role of this spec: parent plan for active-session isolation and concurrent
  session workflows.

## 2) Problem

- `.afol/wb/.active_session` is a single mutable global pointer.
- CI, remote agents, local agents, and quick tasks can all mutate or rely on the
  same pointer.
- Pull requests can accidentally include pointer changes, making unrelated
  sessions appear active after merge.
- Commands support `--session`, but the UX still makes implicit active-session
  usage too easy in contexts where explicit targeting is required.

## 3) Users and User Journey

Primary users:

- A local operator running Codex/OpenCode/Gemini against the repo.
- A remote coding agent such as Jules creating branch or PR work.
- CI validating a PR without mutating repository-owned workbench state.

User journey:

1. A user or remote agent starts a workstream.
2. The system creates or selects a session bound to that actor/branch/context.
3. Commands default to the bound session inside that context.
4. CI validates the session contract without rewriting the canonical pointer.
5. The operator can list, inspect, switch, close, or archive sessions explicitly.

Failure or friction points:

- A PR modifies `.afol/wb/.active_session` -> validation warns unless the PR is
  explicitly a session-management change.
- A command runs without a session in a parallel context -> command fails with a
  short hint to pass `--session` or set a context-local session.
- A stale remote branch targets old session state -> review identifies stale
  base and session contamination before merge.

## 4) Experience and Behavior

Expected behavior:

- Interactive commands still support a convenient active session for single
  operator work.
- Parallel contexts use explicit or context-local session selection instead of
  the repository-global pointer.
- `.afol/wb/.active_session` remains a local convenience pointer, not a safe
  cross-agent synchronization primitive.
- CI treats pointer changes as suspicious unless they are part of an explicit
  session-management task.
- Session commands can show active, recent, stale, closed, and branch-bound
  sessions.

Boundaries:

- Do not replace workbench sessions with a new planning tree.
- Do not require remote agents to share one active session.
- Do not make every quick local command verbose; preserve the single-operator
  fast path.

## 5) Scope

In scope:

- Session resolution policy for local, CI, and remote-agent contexts.
- A context-local active-session mechanism, such as environment override,
  branch/worktree mapping, or `.afol/wb/session-context.json`.
- CLI warnings and validation for pointer mutations in PRs.
- Documentation for safe parallel Jules-style review.
- Tests for explicit-session behavior and contamination prevention.

Out of scope:

- Replacing git branches or worktrees.
- Building a long-lived backend coordinator service.
- Importing Jules-specific state into the scaffold.

## 6) Delivery Plan

1. Inventory current implicit active-session reads and writes.
   - Map every command that reads `.afol/wb/.active_session`.
   - Map every command that writes it.
   - Classify each command as interactive-only, CI-safe, or explicit-session
     required.
2. Introduce a session-resolution contract.
   - Resolution order should be: explicit `--session`, environment override,
     context-local mapping, repository-global pointer.
   - CI and remote-agent modes should reject repository-global fallback unless
     explicitly allowed.
   - Error messages should name the exact fix.
3. Add branch/worktree-aware session context.
   - Store mappings outside final docs, under `.afol/wb/session-context.json`
     or another `.agents/` runtime surface.
   - Track session id, branch, worktree path, actor label, and last touched time.
   - Keep this surface safe to ignore or regenerate.
4. Harden PR and CI validation.
   - Add a check that flags `.afol/wb/.active_session` changes unless the
     change is scoped to session-management work.
   - Add review output that distinguishes stale base, active-pointer drift, and
     valid session metadata changes.
5. Update command UX.
   - Add `session list`, `session switch`, and `session bind` or equivalent
     affordances if existing commands cannot cover the workflow cleanly.
   - Keep `session catchup --session <id>` as the required resume path for
     non-active sessions.
6. Document remote-agent review rules.
   - Update Jules/remote-agent guidance to require patch/PR review without
     accepting `.active_session` mutations.
   - Explain how to salvage useful code while rejecting contaminated session
     state.

## 7) Acceptance

- [ ] Commands that mutate workbench state can run without relying on the global
      active pointer when `--session` or a context binding exists.
- [ ] CI can validate PRs without requiring `.afol/wb/.active_session` to
      point at an existing local session folder.
- [ ] PRs that modify `.afol/wb/.active_session` produce a clear warning or
      failure unless explicitly allowed.
- [ ] Parallel sessions can be listed, inspected, and resumed without changing
      the repository-global pointer.
- [ ] Remote-agent review docs explain how to reject session contamination while
      preserving useful code/test ideas.

## 8) Risks

- Risk: making session selection too strict slows local single-agent work.
  Mitigation: keep the existing global pointer as a local convenience fallback.
- Risk: adding another state file creates a second governance system.
  Mitigation: keep context binding operational only; plans/tasks/reports remain
  in `.afol/wb/<session>/`.
- Risk: CI blocks legitimate session-management changes.
  Mitigation: allow explicit bypass labels or scoped command flags with tests.
