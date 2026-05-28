---
doc_type: spec-test
id: 260521_0135_agent-command-design-system_spec-test_01
theme: agent-command-design-system
status: draft
owners:
- tester
created_at: '2026-05-21T01:35:00+08:00'
updated_at: '2026-05-21T01:35:00+08:00'
roadmap_feature: F-03
parent_spec: 260521_0030_agent-command-design-system_spec_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
scope:
  repo_areas:
  - cli
  - src/project-template/a
  - docs/standards
risk_level: high
---

# SPEC TEST: agent-command-design-system

## 1) Test Intent

Prove that the short command grammar is stable, compact, unambiguous, and
human-auditable.

## 2) Covered Journey

1. Agent uses short aliases for high-frequency work.
2. Human uses long aliases for the same operation.
3. CLI returns compact output by default.
4. CLI returns JSON with `-j`.
5. Errors suggest a next command.

## 3) Required Test Cases

| Case | Input | Expected result |
| --- | --- | --- |
| `TC-01` | alias table snapshot | no ambiguous aliases |
| `TC-02` | `./a s` vs `./a status` | semantic parity |
| `TC-03` | `./a t s T-01` | canonical task-start route |
| `TC-04` | `./a e a -t T-01` | canonical evidence-add route |
| `TC-05` | `./a up ck` | canonical update-check route |
| `TC-06` | `./a -j s` | JSON envelope matches compact fields |
| `TC-07` | unknown alias | actionable hint, no long manual |
| `TC-08` | `./a -h` | <= 25 lines with short and long aliases |

## 4) Metrics

- Accuracy: alias resolution 100% deterministic.
- Quality: all errors include next action when one exists.
- Token economy: compact help <= 25 lines and compact output <= 2.5KB.
- Speed: local parser/router tests complete in normal unit-test budget.

## 5) Recommended Technology

- Parser unit tests.
- Alias snapshot tests.
- Output snapshot tests.
- Fixture integration tests for wrapper behavior.
