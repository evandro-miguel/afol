---
doc_type: lesson_entry
id: lesson_20260710_1442_ci_contract_tests_must_parse_effective_configuration
status: active
created_at: '2026-07-10T14:42:40-03:00'
source: user_correction
related_workstream_id: 260710_1159_typescript-7-toolchain-adoption
---

# Lesson: CI Contract Tests Must Parse Effective Configuration

## Correction

The TypeScript migration test inspected workflow YAML with regular expressions.
This allowed required steps in another job and custom shell overrides to satisfy
the assertions while the effective `validate` job could still mask failures.

## Prevention Rule

- Parse structured configuration with the platform-native parser when behavior
  depends on nesting, inheritance, or effective scope.
- Verify required CI steps inside their owning job.
- Reject workflow, job, and step overrides that can change failure propagation
  or redirect command execution to another project or executable.
- Run an independent read-only review after correcting a CI contract test.

## Guardrail

- A blocking typecheck contract must verify the exact command, owning job, step
  order, working directory, environment, conditional execution, error handling,
  and effective shell.
- Adversarial validation must include equivalent configuration at the wrong
  scope and wrappers that can convert failure into success.
