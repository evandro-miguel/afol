---
doc_type: lesson_entry
id: lesson_20260323_1310_wrapper_must_be_hermetic_in_isolated_runtimes
status: active
created_at: '2026-03-23T13:10:00-03:00'
updated_at: '2026-03-23T13:10:00-03:00'
source: user_correction
related_session: 260323_1305_wrapper-runtime-isolation-hardening
---

# Lesson: Wrapper Must Be Hermetic In Isolated Runtimes

## Correction

The user clarified that this repository is the execution base for downstream agents and must work in isolated environments while still delivering the full tool surface agents need.

## Prevention Rule

- Do not require `uv`, global writable cache paths, or other machine-global mutable state for normal command execution when the local runtime is already provisioned.
- Treat `.agents/agents` as a product entrypoint, not as a thin convenience shell around development-time tooling.

## Guardrail

- Wrapper tests must cover the case where `.agents/scripts/.venv` exists but `uv` is absent from `PATH`.
- Validation commands should use repo-local cache directories when they invoke `uv`.
- CI must run both Python script linting and wrapper-compatible test coverage, not only docs lint and unit tests.

## Expected Behavior

- A bootstrapped scaffold can execute its normal command set from the local virtualenv without relying on user-global runtime state.
