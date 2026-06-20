---
doc_type: lesson_entry
id: lesson_20260323_1310_wrapper_must_be_hermetic_in_isolated_runtimes
status: superseded
created_at: '2026-03-23T13:10:00-03:00'
updated_at: '2026-06-20T00:00:00-03:00'
source: user_correction
related_session: 260323_1305_wrapper-runtime-isolation-hardening
superseded_by: afol_only_entrypoints
---

# Superseded Lesson: Wrapper Must Be Hermetic In Isolated Runtimes

## Correction

The user clarified that this repository is the execution base for downstream agents and must work in isolated environments while still delivering the full tool surface agents need.

## Prevention Rule

- Do not require global writable cache paths or other machine-global mutable
  state for normal command execution when the local runtime is already
  provisioned.
- Treat `afol` as the only public product entrypoint.

## Guardrail

- Validation commands should use repo-local cache directories when a tool needs
  them.
- CI must cover AFOL CLI behavior and downstream template compatibility, not
  retired Python wrappers.

## Expected Behavior

- A bootstrapped scaffold can execute its normal AFOL command set without
  relying on user-global runtime state.
