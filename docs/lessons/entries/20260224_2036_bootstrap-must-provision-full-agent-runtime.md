---
doc_type: lesson_entry
id: lesson_20260224_2036_bootstrap_must_provision_full_agent_runtime
status: active
created_at: '2026-02-24T20:36:00-03:00'
updated_at: '2026-02-24T20:37:49-03:00'
source: user_correction
related_session: bootstrap-system-hardening
---

# Lesson: Bootstrap Must Provision the Full Agent Runtime

## Correction

User reported bootstrap was incomplete: beyond root instruction files, it also missed runtime folders, symlink/copy behavior, and full operational readiness.

## Root Cause

Bootstrap scope was defined around minimal `.agents` assets and did not enforce the complete runtime contract (`.claude/.qwen/.codex/.gemini`, mirror docs sync, skills sync, and symlink fallback preparation).

## Prevention Rule

Treat bootstrap as a full system provisioning workflow, not a partial file copy.
A bootstrap is valid only if the target repository can run core workflows without manual remediation steps.

## Guardrails Added

- Mandatory bootstrap assets now include mirror docs and core arc/skills artifacts.
- Bootstrap now ensures runtime agent folders exist.
- Post-bootstrap pipeline now executes sync, skills-sync, and fix-symlinks before doctor/tools-check.
- Bootstrap fails fast when mandatory source files or directories are missing.
