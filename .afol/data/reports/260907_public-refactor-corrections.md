---
doc_type: report
id: 260907_public-refactor-corrections
theme: public-refactor-corrections
status: complete
created_at: 2026-09-07T23:05:00Z
updated_at: 2026-09-07T23:05:00Z
roadmap_feature: F-34
parent_spec: 260818_public-product-and-portfolio-readiness_spec_01
---

# Public refactoring corrections

## Delivery

Implemented the bounded corrections from the [code audit](260907_code-refactor-audit.md) in `/home/ozy/01_projects/dev/afol.public-root`, on `refactor/audit-corrections-20260907`, based on `48262833132d4add94220eba465d55089b2ba4fb`. Product edits remain uncommitted. Private governance and unrelated concurrent changes were preserved. No push, deployment, global installation, harness permission change, or index service startup occurred.

Governance: F-34, its [architecture child spec](../../adm/specs/260818_public-architecture-code-quality_spec-child_01.md), and native AFOL session `260907_1720_public-refactor-corrections`. The six tasks received observed completion evidence from the local build, artifact receipt generation, compiled smoke, and strict Project RAG verification.

## Corrections and scope decisions

| Audit item | Delivered result | Principal public source |
| --- | --- | --- |
| A1 | Replaced three unreachable benchmark baselines with observed public-source calibration; synchronized measured scenario records and generated builtin payload. Fixed the standalone evolution smoke's catalog path and SQLite snapshot boundary. | `src/builtin-assets/benchmarks/catalog`, `cli/dev/evolve-benchmark-smoke.ts` |
| A2 | Six exact stable-JSON implementations now share the existing serializer. Byte ordering, hashes, and undefined behavior have characterization coverage. | `cli/services/evolution/imports/digest.ts` |
| A3 | Removed the duplicate freshness implementation. A full validation reuses one live workbench snapshot and one validated event ledger; ordering and classifications remain covered. The former 494-line mirror is a 19-line compatibility wrapper. | `cli/services/local-state/workbench-index.ts`, `cli/services/project/validate-freshness.ts` |
| A4 | Replaced manual transaction bookkeeping in one SQL-only replay with Bun's immediate transaction callback; injected SQL failure and nested caller-boundary tests pass. File compensation paths remain separately owned. | `cli/services/evolution/observation-journal.ts` |
| A5 | Session arguments use the shared declarative parser. Preserved aliases, permissive positionals, repeated flags, empty numeric values, and exact missing/invalid-value errors. Removed Citty from its sole smoke import, dependency manifest, lockfile, and notices. | `cli/commands/session-args.ts`, `cli/commands/flag-spec.ts` |
| A6 | Introduced one subcommand handler table, deriving router group membership from it. Kept lazy imports, special command handling, root-free entrypoints, and operation-context forwarding. `main.ts` decreased from 828 to 581 lines. | `cli/dispatch.ts`, `cli/main.ts`, `cli/router.ts` |
| A7 | Mutation implementations and helpers now belong to services; command facades preserve existing imports. Evolution no longer imports command implementations. Command tokenization lives in core. A Bun parser-based test prevents runtime service-to-command imports. | `cli/services/mutations`, `cli/core/command-line.ts`, `cli/tests/service-boundaries.test.ts` |
| A8 | Extracted pure close-report rendering and summary handling, with exact Markdown and current-attempt evidence tests. Lifecycle I/O, locks, transitions, and rollback remain together. | `cli/services/workbench/close-report.ts` |
| A9 | Retained the current import-payload validator. Its ordered identity, digest, redaction, and cross-record checks require a separate behavior contract before a Valibot migration. No demonstrated defect justified changing accepted inputs in this slice. | `cli/services/evolution/import-journal.ts` |
| A10 | Removed the unused feedback alias and an unnecessary re-verification export. Kept selective cleanup; the audit's full unused-export inventory was not treated as permission to delete internal functionality. | `cli/commands/feedback.ts`, `cli/commands/workbench.ts` |
| A11 | Confirmed that current private guidance already assigns the public checkout engine/release authority and retains the private factory for governance/export history. Preserved those concurrent documentation edits and existing factory consumers. | Private `AGENTS.md`, `README.md`, `docs/public/release-process.md` |

## Benchmark provenance

The original native run failed with 11 execution failures and three unreachable-commit issues. It remains negative evidence. Temporary targets were subsequently materialized exclusively from public template config, lock, manifest, and builtin catalog files; no private operator state was copied. Owned fixture files and the resulting empty root directories were removed after calibration.

The successful evolution and state measurements used Bun 1.4.2, three samples, and one warmup. Mutation used Bun 1.3.14, a real compiled artifact, 20 samples, and one warmup. Every selected execution had zero errors and a success rate of one. Their encompassing invocations still exited 2 because the old catalog provenance was invalid; those failures were not relabeled as passes. All three active replacement references resolve to the public base commit, whose existence and ancestry were checked.

The provenance label is `public-head-template-fixture-calibration-20260907`. Mutation's actual `source_dirty: true` and source-state digest were retained: materializing a local catalog affects the runner's source fingerprint. Evolution/state did not emit that field; absence was not rewritten as false. State baseline p50/p95 are maxima across its five measured scenarios, 33/35 ms. The measurements describe the pre-refactor public source and its explicit fixture, not final-branch performance.

Raw task evidence is retained under public `.tmp/refactor-corrections-20260907/`: `clean-head-benchmarks.json`, `fixture-head-benchmarks.json`, `mutation-head-benchmarks.json`, `catalog-before.json`, `catalog-update-evidence.json`, and `test-full.log`. The one-time transformer did not relax the existing baseline writer or validation contracts.

## Verification

- Full native suite with Bun 1.3.14: **2,168 passed, 5 skipped, 0 failed, 130 files** (`TMPDIR=/home/ozy/tmp bun run test:full`).
- `bun run typecheck` and `bun run validate:toolchain`: passed, including generated metadata, Biome, Oxlint, dependency Knip, and toolchain smoke.
- Focused template-policy and registry checks: 38 passed; the previously failing public provenance contract is green.
- `bun run public:audit -- .`: passed after tests and build. `git diff --check`: passed.
- `bun run security:scan:required`: OSV scanned 120 lockfile packages with no issues; redacted Gitleaks scanned the three reachable commits and worktree with no leaks.
- Native local `build`, non-release `release:provenance`, and `smoke:dist`: passed. An earlier smoke rejected stale checksum receipts after rebuilding; regenerating local receipts through the native command resolved it. These are local artifact checks, not release approval.
- Independent backend review approved the final slices. Its sole dependency-notice finding was fixed and re-reviewed. Intermediate writer formatting/type errors were resolved before final validation.

## Project RAG and stack use

Registered canonical project `afol-public-root` (2684), rooted at `/home/ozy/01_projects/dev/afol.public-root`, with `cli,src,docs,scripts`. Initial ingestion indexed 577 files. Final non-forced reconciliation processed 48 additions/updates, leaving **591 covered files**, no blocked files, no ingestion errors, and published build 159. Strict verification reported ready, fresh, and covered; a real hybrid query retrieved the new close-report module and its tests without fallback.

Project embeddings used the verified `llamacpp/qwen3-embedding-1024/1024` profile. The existing process provided successful embeddings and GPU-offload evidence. Generated CLI files, temporary directories, root manifests, and hidden private governance are outside the selected retrieval scope and were checked locally where relevant.

Docs RAG confirmed Bun SQLite transactions and immediate mode from the official Bun corpus. TypeScript contextual typing and the existing parser were reused; no replacement framework was introduced. See the [official transaction reference](https://bun.sh/docs/runtime/sqlite#transactions) and the original audit for additional Docs RAG queries and source limitations.

Applied skills: `evandro-rag-system`, `exploring-tools`, `reducao-segura-complexidade-ciclomatica`, `agentic-orchestrator`, `git-skill`, `agentic-benchmarking`, `afol-integration-test`, `websearch-docs`, and Markdown validation guidance.

## Remaining boundaries

Broad parser conversion, journal variants with distinct digest contracts, mixed filesystem/database transactions, complete lifecycle decomposition, and the generalized schema migration remain separate opportunities. No runtime or distribution claim is made for native Windows, hosted execution, or global installation. Product changes are ready for review on the topic branch; integration and publication remain separate actions. F-34 architecture-child closeout uses public-root `docs/public/architecture-quality.md` (2026-08-18 snapshot), not this dirty-tree topic-branch work as exact-SHA release evidence.
