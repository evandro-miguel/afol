---
doc_type: plan
id: 260531_2042_security-osv-v2_plan_01
theme: security-osv-v2
status: active
created_at: '2026-05-31T23:46:29-03:00'
updated_at: '2026-05-31T23:46:29-03:00'
roadmap_feature: F-11
parent_spec: 260521_0110_validation-ci-and-benchmarks_spec_01
---

# Plan: security-osv-v2

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-security
- parent_spec: 260521_0110_validation-ci-and-benchmarks

## Progress

- [x] 2026-05-31 - OSV Scanner v2 install, bun.lock scan, Biome vulnerability removal, and release/security gate validation completed.

## Concrete Steps

- Keep the security scan path tied to the F-11 validation/release contract.
- Preserve the local informative scan path and the release gate behavior already verified in the session.

## Validation and Acceptance

- `bun run validate:security`
- `bun run validate:release`
- `./.agents/agents verify-tasks --strict`
