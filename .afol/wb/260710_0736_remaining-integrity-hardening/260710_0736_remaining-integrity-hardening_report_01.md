---
doc_type: report
id: 260710_0736_remaining-integrity-hardening_report_01
theme: remaining-integrity-hardening
status: final
owners:
- orchestrator
created_at: '2026-07-10T11:57:27Z'
updated_at: '2026-07-10T11:57:27Z'
roadmap_feature: F-18
parent_spec: 260612_workbench-hydration-and-markdown-projection_spec-child_01
links:
  plan: 260710_0736_remaining-integrity-hardening_plan_01
  task: 260710_0736_remaining-integrity-hardening_task_01
---

# Report: Remaining Integrity Hardening

## Scope

Close the remaining execution-integrity findings in session locking, local-state worker routing, migration evidence scanning, and orphaned lifecycle continuity. Validate the complete repository and publish the reviewed result to `origin/dev`.

## Findings

- Session lock cleanup could remove a replacement path because ownership was checked by path metadata instead of the identity of the open lock file.
- A non-main worker could enter the local-state rebuild path without an explicit worker-kind contract.
- Workbench health indexing repeated migration-tree scans for each missing session.
- One historical lifecycle session had no durable continuity artifact after its original workbench state disappeared.

## Delivered Changes

- Bound lock ownership to the device and inode observed through the same file descriptor and added replacement-race regressions.
- Required `workerData.kind === "workbench-rebuild"` before worker execution and added an unrelated-kind regression.
- Collected migration evidence once per index build and added a bounded-I/O regression.
- Added an AFOL-owned migration continuity record with explicit evidence and a marked hypothesis for the unrecoverable original task identity.
- Corrected the historical execution summary and recorded current AFOL lifecycle evidence.

## Delegation Review

- `t07_flake_repro` owned lock identity and cleanup behavior.
- `report_writer` owned worker routing, continuity documentation, and historical summary correction.
- `t06_behavior_audit` owned migration evidence scan behavior.
- Each agent stayed within its assigned write lane. The orchestrator retained AFOL lifecycle, validation, review, commit, and push ownership.

## Evidence

- Focused regression suites: 81 passed, 0 failed.
- Full suite: 979 passed, 0 failed, 8,063 assertions across 64 files.
- Biome lint: 246 files clean.
- TypeScript typecheck: passed.
- Project benchmark validation: passed with strict relations, at least 80 percent coverage, and deterministic generated output.
- Lock regression benchmark: five samples, p50 2.500 seconds, p95 2.570 seconds.
- Changed-path benchmark: `cli-kernel-local` selected; typecheck and 54 focused tests passed.
- Runtime live-agent benchmark pack: 4 of 4 saved scenarios passed. The pack is a historical snapshot, so the current governed session is the live orchestration proof.
- Release validation: passed coverage, deterministic build, distribution smoke, clean-checkout smoke, OSV Scanner, Gitleaks, and provenance generation.
- AFOL project validation: passed with zero health warnings and zero problem tasks before closure.
- GitNexus change detection reported broad critical impact through shared workbench consumers. Source review and full repository gates found no blocking regression.
- Product commit `745baeaa8b54997ca6dcacda3a1679758c64645a` was pushed to `origin/dev`.

## Severity

- Resolved lock ownership race: HIGH.
- Resolved worker routing ambiguity: MEDIUM.
- Resolved repeated migration scan: MEDIUM.
- Resolved lifecycle continuity gap: MEDIUM.
- Residual theoretical path replacement between the final descriptor check and POSIX path unlink: LOW. Node and POSIX do not expose an atomic conditional unlink by inode. The implementation now minimizes the window and prevents cleanup of replacements observed before unlink.

## Recommendation

Keep the new focused regressions in the release gate. Treat any future lock cleanup change as high-impact because workbench lifecycle flows share this primitive.

## Next Step

Close T-05, verify strict task state, rebuild local state, validate the closed project, commit the closure artifacts, and push the final AFOL state to `origin/dev`.
