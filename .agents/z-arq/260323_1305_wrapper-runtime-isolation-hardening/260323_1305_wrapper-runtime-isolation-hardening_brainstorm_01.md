---
doc_type: brainstorm
id: 260323_1305_wrapper-runtime-isolation-hardening_brainstorm_01
theme: wrapper-runtime-isolation-hardening
status: active
created_at: '2026-03-23T13:05:37-03:00'
updated_at: '2026-03-23T13:59:10-03:00'
roadmap_feature: F-06
parent_spec: 260306_primary-agent-runtime-compatibility_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
---

# Brainstorm: wrapper-runtime-isolation-hardening

## Problem Statement
- The scaffold wrapper depends on `uv run` even when the local virtualenv already exists.
- That breaks the base contract for isolated agent work in restricted environments.

## Candidate Fixes
- Use `.agents/scripts/.venv/bin/python3` directly for normal command execution.
- Keep `uv` only for initial environment provisioning when `.venv` is missing.
- Move `UV_CACHE_DIR` into the repository so setup and validation do not depend on user-global writable cache paths.
- Expand automated validation so wrapper isolation and Python linting become merge blockers.

## Decision
- Implement the hermetic local-venv path and strengthen validation coverage in the same change.
