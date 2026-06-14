---
doc_type: spec-test
id: 260521_0132_minimal-project-template-export_spec-test_01
theme: minimal-project-template-export
status: superseded
superseded_by: cli/tests/bootstrap-template-cleanliness.test.ts and template-policy enforcement
closure_note: Minimal-export and forbidden-path rejection enforced by template-policy tests; parent spec F-02 closed.
owners:
- tester
created_at: '2026-05-21T01:32:00+08:00'
updated_at: '2026-06-14T00:00:00-03:00'
roadmap_feature: F-02
parent_spec: 260521_0020_minimal-project-template_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
scope:
  repo_areas:
  - src/project-template
  - .agents/scripts/agents-bootstrap.py
risk_level: high
---

# SPEC TEST: minimal-project-template-export

## 1) Test Intent

Prove that `src/project-template/` exports only the minimal project-local agent
protocol and rejects factory noise.

## 2) Covered Journey

1. Export or bootstrap prepares a downstream project fixture.
2. The fixture includes `afol`, `AGENTS.md`, config, lock, manifest, rules,
   skills, workbench, data, tmp, and minimal `docs/arc` files.
3. Forbidden root-only artifacts are absent.
4. Managed and project-owned files are classified before updates.

## 3) Required Test Cases

| Case | Input | Expected result |
| --- | --- | --- |
| `TC-01` | export fixture | required files exist |
| `TC-02` | forbidden root workbench path | export fails |
| `TC-03` | forbidden cache/test/source seed | export fails |
| `TC-04` | downstream project-owned edit | update plan preserves or flags |
| `TC-05` | `afol -h` in fixture | wrapper smoke succeeds |
| `TC-06` | `afol s` in fixture | status smoke succeeds or delegates |

## 4) Metrics

- Accuracy: required-file and forbidden-file checks 100% pass.
- Safety: zero project-owned overwrites without conflict record.
- Token economy: exported starter docs stay minimal and command-oriented.
- Quality: export failure names the exact forbidden path.

## 5) Recommended Technology

- Fixture export tests.
- Manifest hash tests.
- Forbidden-path negative tests.
- Downstream smoke bootstrap.
