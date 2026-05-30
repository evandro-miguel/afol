---
doc_type: spec-test
id: 260521_0130_universal-agent-cli-kernel-contract_spec-test_01
theme: universal-agent-cli-kernel-contract
status: draft
owners:
- tester
created_at: '2026-05-21T01:30:00+08:00'
updated_at: '2026-05-21T01:30:00+08:00'
roadmap_feature: F-01
parent_spec: 260521_0010_universal-agent-cli_spec_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
scope:
  repo_areas:
  - cli
  - packages
  - src/project-template/a
  - .agents/agents
risk_level: high
---

# SPEC TEST: universal-agent-cli-kernel-contract

## 1) Test Intent

Prove that the Bun/TypeScript CLI kernel can safely load project state, resolve
commands, produce compact/JSON output, and delegate legacy behavior without
semantic drift.

## 2) Covered Journey

1. Agent runs `afol -h` in a valid project.
2. Agent runs `afol s`, `afol status`, and `afol -j status`.
3. CLI loads `.agents/config.json` and `.agents/lock.json`.
4. Unsupported or not-yet-migrated commands delegate to `.agents/agents`.
5. Invalid roots or missing state fail before mutation.

## 3) Required Test Cases

| Case | Input | Expected result |
| --- | --- | --- |
| `TC-01` | `afol -h` | compact help, <= 25 lines |
| `TC-02` | `afol s` | compact status, exit 0 |
| `TC-03` | `afol status` | semantic parity with `afol s` |
| `TC-04` | `afol -j status` | valid JSON result envelope |
| `TC-05` | outside project | exit 2 and actionable invalid-root hint |
| `TC-06` | missing config | exit 2 before mutation |
| `TC-07` | missing lock | exit 2 before mutation |
| `TC-08` | delegated command | stdout/stderr/exit-code parity fixture |
| `TC-09` | unsupported command | actionable help hint |

## 4) Normalized Parity Envelope

Parity tests compare these normalized fields:

```text
ok
code
command_id
entity_type
entity_id
state
result
paths
evidence_id
mutation_id
events
errors
hint
metrics
```

The parity helper ignores timestamps, durations, unordered-list order, and
runtime transport metadata unless a scenario explicitly tests them.

## 5) Metrics

- Accuracy: 100% for deterministic local cases.
- Speed: local p50 <= 2s after one warmup and three measured samples.
- Quality: every negative path includes a next action.
- Token economy: compact output <= 2.5KB unless verbose mode requested.
- Safety: zero file writes on invalid-root or loader-failure paths.

## 6) Safety Oracle

Invalid-root and loader-failure tests must capture a pre/post file tree hash.
The allowed diff list is empty. Any write is a test failure.

## 7) Recommended Technology

- `bun test` for parser, loader, schemas, and result envelopes.
- Fixture repositories for valid and invalid root tests.
- Snapshot tests for help and alias resolution.
- Legacy command fixtures for delegation parity.

## 8) Evidence Format

- Test command.
- Pass/fail summary.
- Fixture path.
- Normalized semantic parity report.
- Any stdout/stderr/exit-code mismatch.
