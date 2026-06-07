---
doc_type: plan
id: 260531_2106_mvp-finalization-gap-implementation_plan_01
theme: mvp-finalization-gap-implementation
status: active
created_at: '2026-05-31T23:46:29-03:00'
updated_at: '2026-05-31T23:46:29-03:00'
roadmap_feature: F-12
parent_spec: 260521_0120_public-distribution-and-onboarding_spec_01
---

# Plan: mvp-finalization-gap-implementation

## Native command metadata

- feature_id: F-FINAL
- parent_spec: docs/arc/GENERAL-ROADMAP.md
- session: 260531_2106_mvp-finalization-gap-implementation

## Evidence Inputs

- Round 1 docs audit: `round1_docs_audit.md`
- Round 1 code audit: `round1_code_audit.md`
- Round 1 release audit: `round1_release_validation_audit.md`
- Round 2 docs/code verifier: `round2_docs_code_verifier.md`
- Round 2 release verifier: `round2_release_verifier.md`
- Round 2 plan audit: `round2_plan_audit.md`

## Facts

- The Bun/TypeScript CLI and template boundary are materially functional: current local gates pass, including `bun run validate`.
- `docs/arc/GENERAL-ROADMAP.md` marks F-00..F-17 as `final`, but F-07..F-12 still contain implementation gaps, waivers, or release-evidence gaps when checked against current code.
- The confirmed MVP-critical gaps are `update apply`, `file archive`, and local-state scope beyond workbench-only indexing.
- F-10 MCP/adapters and F-11 runtime-live-agent are not false positives, but they are larger than the immediate MVP closeout unless explicitly pulled into this release.
- F-12 public release readiness is partial: local release gates exist, but CI/release evidence, security hard-fail policy, artifact checksums, and cross-platform claims need a tighter contract.

## Scope

In scope for MVP finalization:

- Implement safe `update apply`.
- Implement or explicitly descope `file archive`; preferred path is implementation because it is exposed and documented.
- Expand local-state to cover the F-07 minimum beyond workbench or rewrite the F-07 acceptance to the actual workbench-only MVP. Preferred path is expansion.
- Make release validation honest: CI runs release gate, security policy is explicit, release evidence is persisted, and public claims match proven platforms.
- Reconcile docs/spec/roadmap statuses after implementation so `final` means proven, not waived.

Out of scope for this MVP unless the owner explicitly promotes it:

- Full replacement of all legacy delegated runtime surfaces.
- Full MCP tool catalog and transport parity for every command family.
- Homebrew, curl installers, marketplace distribution, signing/notarization, and full Windows/macOS release claims without native smoke evidence.
- SQLite, vector indexes, cloud sync, always-on watcher, raw prompt capture, and broad provider transcript ingestion.

## Confirmed Gaps

| Priority | Area | Status | Required closeout |
| --- | --- | --- | --- |
| P0 | F-09 update/versioning | `afol update` supports `check` and `preview`, not `apply`. | Add safe apply with ownership decisions, conflict blocking, write context, rollback/journal where feasible, and post-apply validation. |
| P1 | F-08 file mutation | `file archive` is exposed but returns "archive not implemented in this MVP". | Implement archive with dry-run, protected-path checks, journal, backup/restore, and tests, or remove/descope from CLI contract. |
| P1 | F-07 local-state | Current persisted index path is centered on workbench events/index. | Add rules/skills/specs/files index coverage and freshness checks, or update spec to a narrower MVP. |
| P1 | F-12 release validation | `validate:release` exists, but CI does not run the complete release gate with persisted evidence and security policy is still local/informative. | Add release CI gate, hard-fail or explicit waiver policy for security, artifact evidence, and checksum/provenance for generated binaries. |
| P2 | F-10 MCP/adapters | Several runtime/adapters remain delegated through legacy surfaces. | Keep deferred with explicit status, or implement shared-core parity for promoted command set. |
| P2 | F-11 runtime-live-agent | Benchmark artifact has skipped/waived status for missing live runner. | Execute live runner or refresh a dated waiver before public release claims. |
| P2 | F-12 cross-platform | Local Linux smoke is proven; broader target claims lack native/VM evidence. | Defer unsupported platform claims or add target matrix evidence. |

## Implementation Tasks

### T-01 P0: Implement Safe `update apply`

Parent specs:

- `docs/arc/SPECS/260521_0090_template-update-and-versioning_spec_01.md`
- `docs/arc/260521_total-reformulation-execution-plan.md` T-20..T-22

Actions:

- Extend `cli/commands/update.ts` to accept `apply`.
- Add service code that converts the existing update preview into deterministic write actions.
- Enforce manifest ownership: `project-owned` is never overwritten automatically; `managed` updates only when the old hash matches; conflicts block.
- Require session/task/reason for real writes, or document why update apply is governed through another equivalent context.
- Persist update decisions and post-apply validation result.
- Add tests for no-source, up-to-date, managed update, project-owned preserve, user-edited conflict, and JSON/human output.

Acceptance:

- `afol update apply --dry-run` shows the same decisions as preview without writes.
- `afol update apply` updates only safe managed files and blocks conflicts.
- Post-apply validation runs or reports a typed failure.
- Focused update tests pass.

### T-02 P1: Implement `file archive`

Parent specs:

- `docs/arc/SPECS/260521_0080_safe-file-mutation-and-undo_spec_01.md`

Actions:

- Replace the current archive stub in `cli/commands/file.ts`.
- Move archived files into a deterministic project-local archive path or mutation backup area.
- Record journal entries with mutation id, source path, archive path, hashes, session, task, and reason.
- Support dry-run preview and undo where feasible.
- Block protected paths, path traversal, symlink escape, missing context writes, and unsafe destinations.

Acceptance:

- `file ar --dry-run` is non-mutating and reports target/archive decision.
- Real archive writes only with session/task/reason.
- Undo restores archived file when supported.
- Mutation-safety tests cover archive success, dry-run, protected path, and undo.

### T-03 P1: Complete F-07 Local-State MVP

Parent specs:

- `docs/arc/SPECS/260521_0070_local-state-index-and-event-log_spec_01.md`

Actions:

- Keep workbench event/index behavior.
- Add deterministic index snapshots for at least rules, skills, specs, and files, or explicitly narrow F-07 with a spec edit before closure.
- Add rebuild/query/freshness checks that fail closed on stale trusted reads.
- Avoid raw prompt capture and keep provider/lifecycle payloads redacted by default.

Acceptance:

- Local-state rebuild creates expected JSON index files under `.agents/data/index/`.
- Stale index validation fails or refreshes deterministically.
- Tests cover rules/skills/specs/files index shape and freshness.

### T-04 P1: Harden Release Gate and Evidence

Parent specs:

- `docs/arc/SPECS/260521_0110_validation-ci-and-benchmarks_spec_01.md`
- `docs/arc/SPECS/260521_0120_public-distribution-and-onboarding_spec_01.md`

Actions:

- Add a CI job or workflow step that runs `bun run validate:release`.
- Persist compact release evidence as artifacts or repo-local generated evidence where appropriate: validation status, build path, binary hash, security scan status, and benchmark pack status.
- Decide security behavior: hard-fail in release CI or add an explicit dated waiver with owner and expiry.
- Generate checksums for built artifacts in the release path.
- Keep public docs/platform claims limited to targets with smoke evidence.

Acceptance:

- CI runs release gate or the equivalent command is documented as required and locally reproducible.
- Security scan policy cannot silently disappear from release closeout.
- Release evidence includes build smoke and artifact checksum.

### T-05 P2: Reconcile F-10 Adapter/MCP Scope

Parent specs:

- `docs/arc/SPECS/260521_0100_runtime-adapters-and-mcp_spec_01.md`
- `docs/arc/SPECS/F-10/spec-tests/260521_0140_runtime-adapters-and-mcp-parity_spec-test_01.md`

Actions:

- Make a documented scope decision for MVP: deferred full MCP/adapters, or promoted shared-core command subset.
- If promoted, implement parity for the chosen command subset and typed error behavior.
- If deferred, update roadmap/spec closeout language so F-10 does not imply complete native parity.
- Map current delegated commands and identify which are stable compatibility versus native target.

Acceptance:

- No release claim says full MCP/native adapter parity unless tests prove it.
- Deferred state is explicit and tied to a follow-up task.

### T-06 P2: Resolve Runtime-Live Benchmark Status

Parent specs:

- `docs/arc/SPECS/260521_0110_validation-ci-and-benchmarks_spec_01.md`
- `docs/arc/SPECS/F-11/spec-tests/260521_0145_validation-ci-benchmark-matrix_spec-test_01.md`

Actions:

- Choose `executed` or `waived` for `runtime-live-agent`.
- If executed, add the live runner path and result artifact.
- If waived, refresh the waiver artifact with date, reason, owner, scope, expiry/revisit trigger, and impact.
- Ensure benchmark output includes required pack/scenario/result metadata.

Acceptance:

- F-11 no longer has an ambiguous stale skip.
- Release closeout references the current execution or waiver artifact.

### T-07 P2: Public Onboarding and Platform Claim Sweep

Parent specs:

- `docs/arc/SPECS/260521_0120_public-distribution-and-onboarding_spec_01.md`

Actions:

- Review README/onboarding/install docs for private assumptions.
- Keep `afol` as public command and `./a` as local/downstream wrapper where intended.
- Add first-run smoke proof for the supported platform set.
- Defer Windows/macOS claims unless native or VM-backed smoke exists.

Acceptance:

- A clean checkout can run install/build/help/bootstrap smoke from documented commands.
- Public docs do not claim unsupported distribution channels or platforms.

## Final Validation

Required before claiming MVP finalization:

- `bun run typecheck`
- `bun test`
- `bun run validate:release`
- `bun run smoke:clean`
- `./afol verify-tasks --strict`
- `./.agents/agents verify-tasks --strict`

Additional release evidence when applicable:

- Update apply focused tests.
- Mutation archive focused tests.
- Local-state freshness/index tests.
- Benchmark artifact for `runtime-live-agent`: executed or current waiver.
- Binary checksum for `dist/afol`.

## Risks

- Highest risk: `update apply` can corrupt project-owned files unless ownership and hash checks are strict.
- High risk: release claims can become false if CI/security/cross-platform evidence is not pinned to actual artifacts.
- Medium risk: local-state expansion can create stale trust if freshness is not fail-closed.
- Medium risk: adapter/MCP documentation can overstate parity while legacy delegation remains.
- Low risk: archive implementation can be safely scoped if it stays project-local, journaled, and reversible where feasible.

## Progress

- [x] 2026-06-01 - Round 1 docs, code, and release audits identified the MVP-critical gaps.
- [x] 2026-06-01 - Round 2 docs/code and release verifiers confirmed the remaining closeout work.
- [x] 2026-06-01 - The implementation tasks now enumerate T-01 through T-08 in priority order.

## Concrete Steps

- Implement T-01 through T-08 in priority order.
- Keep the evidence inputs aligned with the round 1 and round 2 audit artifacts.
- Reconcile docs/spec/roadmap status only after the implementation gates pass.

## Validation and Acceptance

- `bun run typecheck`
- `bun test`
- `bun run validate:release`
- `bun run smoke:clean`
- `./.agents/agents verify-tasks --strict`
