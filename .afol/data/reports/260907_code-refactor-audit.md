# AFOL code refactoring and organization audit

Date: 2026-09-07. Scope: analysis and local verification. Product source was not modified.

## Decision

Prioritize the failing public benchmark provenance contract, then consolidate duplicated domain logic and reduce command-layer coupling. The existing stack is sufficient for the first refactoring slices. A framework replacement, broad rewrite, or additional dependency is not justified by this audit.

## Scope and evidence quality

- Canonical engine: `/home/ozy/01_projects/dev/afol.public-root`, branch `main`, commit `48262833132d4add94220eba465d55089b2ba4fb`; clean during inspection.
- Private governance and export factory: `/home/ozy/01_projects/dev/afol/afol.dev`, branch `dev`, commit `b058a724ca6ebb913e11d8b04cce654aeac844af`; existing dirty files were preserved.
- The public repository has 655 tracked files and 410 TypeScript files. All code paths were inventoried. Automated checks covered `cli/**`; AST discovery also covered `scripts/**`. Manual review focused on the reported functions, their callers, tests, generated-payload ownership, and the private export boundary. This is a repository-wide structural audit, not a claim that every line received manual review.
- `cli/tests` contains 126 TypeScript files, including 125 test files. The public/private comparison found 385 byte-identical code files, 23 differing files, and two public-only files. Thirteen private-only code files remain, mostly governance/export tests plus the legacy Claude adapter and export script.
- Stack declared by `package.json`: Bun 1.3.14, TypeScript 7.0.2, Valibot, and `diff`; Biome, Oxlint, Knip, and Citty are development dependencies. The shell resolved Bun 1.4.2. The failing test was also reproduced with the installed Bun 1.3.14 binary.
- No implementation, public publication, global installation, RAG ingestion, or harness configuration change was performed. RULE-002 permits this analysis without creating a workbench execution session. This report retains evidence that would be unwieldy inline.

## Baseline checks actually run

| Check | Observed result |
| --- | --- |
| `bun run typecheck` | Passed |
| `bun run lint:biome` | Passed; 409 files checked |
| `bun run lint:oxlint` | Passed |
| `bun run lint:knip` | Passed; this script checks dependency issues only |
| `bun run manifest:check` | Passed |
| `bun run cli/dev/generate-template.ts --check` | Passed; template and builtin asset payloads synchronized |
| `bun run test:full` | Failed in batch six: 1,916 passed, five skipped, one failed across the first 120 test files |
| Remaining five test files, explicitly selected with `bun test --only-failures` | 229 passed, zero failed |
| Isolated failing template test on Bun 1.4.2 and Bun 1.3.14 | Same three provenance diagnostics on both runtimes |
| Biome optional cognitive-complexity rule | Exit 0 with 302 informational diagnostics; 294 outside tests/generated code, spread across 127 files |
| Knip expanded audit with `--use-tsconfig-files --reporter=json` | Exit 1: 256 export findings, 242 type findings, seven duplicate-export groups across 113 files; zero unused-file or dependency findings in this configured scope |
| AST scan of function declarations and normalized bodies | 3,394 declarations; 2,971 outside tests/generated code; 16 repeated-body groups with normalized bodies at least 200 characters long |
| Report validation | `rumdl check --no-cache --disable MD013` passed; 30 local file/line anchors were checked for existence and bounds |

Combined coverage of all 125 test files: **2,145 passed, five skipped, one failed**. This is the aggregate of the native runner and its explicitly executed remaining batch, not a successful full-suite exit. Build, release validation, security scanning, coverage collection, and native platform certification were not run for this refactoring analysis.

The Biome counts are cognitive complexity, not cyclomatic complexity. An informational result is not a defect count. Large registries containing mostly data also should not be refactored solely because of line count.

## Prioritized findings

### A1. High priority: repair builtin benchmark provenance before broad refactoring

**Evidence.** [The template contract test](/home/ozy/01_projects/dev/afol.public-root/cli/tests/template-policy.test.ts:296) fails with:

```text
benchmark-provenance-commit-not-found:evolution-core:evolution-status-contract:ffbf031e6e68
mutation-baseline-git-commit-not-found
benchmark-provenance-commit-not-found:state-projection:state-export:3297ae1660103ffa77a3d78f0edbf705bd2f8f68
```

The three active baselines declare `github.com/evandro-miguel/afol` as their repository, but their commits cannot be resolved in the canonical public checkout. `git cat-file -e <commit>^{commit}` returned 128 for each. The mutation baseline refers to `4c70a4672b164a65d58e0b7244752bc51fd21711`.

Sources are [evolution-core](/home/ozy/01_projects/dev/afol.public-root/src/builtin-assets/benchmarks/catalog/baselines/evolution-core/baseline-v2.json:12), [mutation-safety](/home/ozy/01_projects/dev/afol.public-root/src/builtin-assets/benchmarks/catalog/baselines/mutation-safety/baseline-v1.json:8), and [state-projection](/home/ozy/01_projects/dev/afol.public-root/src/builtin-assets/benchmarks/catalog/baselines/state-projection/baseline-v1.json:12). [loadRegistry](/home/ozy/01_projects/dev/afol.public-root/cli/validate/registry.ts:647) falls back to embedded builtin assets when the target has no project catalog. The generated payload check passes, so regeneration alone will preserve the incorrect references.

**Proposed change.** Resolve the historical provenance identity correctly, or collect fresh comparable measurements on a reachable public commit using the existing benchmark workflow. Change the source catalog and regenerate its payload. Do not substitute arbitrary reachable SHAs, invent observed results, or weaken validation to obtain green tests.

**Proof required.** The isolated template contract must pass with valid provenance, followed by the native full suite. This is a demonstrated defect; the entries below are improvement opportunities.

### A2. High return: consolidate canonical JSON serialization

**Evidence.** AST matching found the same `stableJson` body in six evolution modules, including [projection-checkpoint](/home/ozy/01_projects/dev/afol.public-root/cli/services/evolution/projection-checkpoint.ts:59), [observation-model](/home/ozy/01_projects/dev/afol.public-root/cli/services/evolution/observation-model.ts:168), and [suggestion-model](/home/ozy/01_projects/dev/afol.public-root/cli/services/evolution/suggestion-model.ts:145). Additional equivalent-looking variants exist in journals and [imports/digest](/home/ozy/01_projects/dev/afol.public-root/cli/services/evolution/imports/digest.ts:3).

**Proposed change.** Give evolution digest serialization one owner, starting with the six exact copies. Reuse an existing implementation after checking its dependency direction. Keep domain-specific digest functions and event types near their owners. Review the other variants separately.

**Risk and proof.** Serialized bytes determine persisted hashes. Preserve key ordering, array ordering, primitive handling, and historical digest output. Add characterization vectors before moving implementations; verify journal replay and checkpoint tests. Plain `JSON.stringify` is not a replacement for the current sorted-key format.

### A3. High return: merge the duplicated freshness implementation while keeping its fast path

**Evidence.** [validate-freshness.ts](/home/ozy/01_projects/dev/afol.public-root/cli/services/project/validate-freshness.ts:5) explicitly requires mirrored changes with the canonical local-state code. `classifyMessage`, `collectPstrChecks`, and report assembly have identical bodies in both modules. Compare [collectFreshnessReport](/home/ozy/01_projects/dev/afol.public-root/cli/services/local-state/freshness.ts:165) and [collectFreshnessReportFast](/home/ozy/01_projects/dev/afol.public-root/cli/services/project/validate-freshness.ts:477).

**Proposed change.** Keep a single set of freshness classifications and report assembly. Move the batched workbench snapshot validation into the local-state owner, then let project validation call that implementation. The source documents why the fast path exists: it avoids rebuilding and parsing the event ledger once per session.

**Risk and proof.** Removing the fast path would regress latency. Preserve messages, ordering, missing/invalid/stale decisions, and one snapshot per validation pass. Cover both correctness and observed operation counts; investigate whether parity coverage removed from the public export needs a public-safe fixture.

### A4. High return: use Bun transactions for SQL-only projection work

**Evidence.** There are 23 literal `BEGIN IMMEDIATE` statements in 11 runtime service files. Examples include [replayObservationProjection](/home/ozy/01_projects/dev/afol.public-root/cli/services/evolution/observation-journal.ts:695) and [hydrateBoundedReceiptProjection](/home/ozy/01_projects/dev/afol.public-root/cli/services/evolution/suggestion-journal.ts:397), each with repeated commit and rollback handling.

**Proposed change.** For SQL-only blocks, use `db.transaction(callback).immediate(...)`. Bun already supplies commit, rollback, and the immediate transaction mode. [Bun SQLite documentation](https://bun.sh/docs/runtime/sqlite#transactions)

**Risk and proof.** Journal append paths also coordinate file writes, truncation, fsync, projection checkpoints, and recovery. A database transaction does not replace those compensations. Start with one SQL-only replay function and verify successful projection, injected failure, unchanged database state, and existing concurrency tests. Review nested-transaction behavior before converting other callers.

### A5. High return: converge argument parsing and remove smoke-only dependency weight

**Evidence.** [parseFlagSpec](/home/ozy/01_projects/dev/afol.public-root/cli/commands/flag-spec.ts:88) already centralizes common parsing, but only three command files call it. [evolve.ts](/home/ozy/01_projects/dev/afol.public-root/cli/commands/evolve.ts:258) contains numerous separate flag loops, while [session.parseArgs](/home/ozy/01_projects/dev/afol.public-root/cli/commands/session.ts:338) has cognitive complexity 65. Citty's only code import is its own [toolchain smoke](/home/ozy/01_projects/dev/afol.public-root/cli/dev/toolchain-smoke.ts:1).

**Proposed change.** First reuse the existing parser for compatible commands. Review whether Citty still has a justified role; removing a smoke-only import and dependency is a bounded cleanup candidate after checking package/toolchain contracts. For future simple parsing, Bun documents `node:util`/`util.parseArgs`, so another parser dependency is unnecessary. [Bun argument parsing guide](https://bun.sh/guides/process/argv)

**Risk and proof.** Error messages and exit codes are tested contracts. Preserve aliases, repeated flags, positional arguments, `--`, missing values, and values beginning with a dash. Do not run a bulk parser migration or change authorization behavior.

### A6. Medium priority: make command dispatch exhaustive and keep imports lazy

**Evidence.** [main](/home/ozy/01_projects/dev/afol.public-root/cli/main.ts:184) has cognitive complexity 150. Dispatch membership is repeated in `DIRECT_DISPATCH_KINDS`, `SUBCOMMAND_DISPATCH_GROUPS`, [ROUTED_SUBCOMMAND_GROUPS](/home/ozy/01_projects/dev/afol.public-root/cli/router.ts:40), and registry types. The command implementations are already loaded through dynamic imports.

**Proposed change.** Separate help rendering, project-root resolution, and direct/subcommand dispatch. Use small typed handler tables and `satisfies` where it proves exhaustive membership without widening inferred types. Keep operations that work outside a project distinct, and preserve lazy loading. [TypeScript satisfies documentation](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html#the-satisfies-operator)

**Risk and proof.** Run kernel, help, registry, and operation-context tests; preserve default output, unknown-command diagnostics, exit codes, and startup latency. Avoid introducing an abstract command framework just to replace the `if` chain.

### A7. Medium priority: restore the dependency direction around file mutations

**Evidence.** [evolution/apply-service.ts](/home/ozy/01_projects/dev/afol.public-root/cli/services/evolution/apply-service.ts:2) imports patch, undo, and hash helpers from `cli/commands/file/**`. [hot-path-benchmark.ts](/home/ozy/01_projects/dev/afol.public-root/cli/validate/hot-path-benchmark.ts:12) also imports command-layer verification parsing. Domain functionality has acquired command-layer ownership.

**Proposed change.** Put reusable mutation operations under the existing `services/mutations` responsibility. Commands should parse/render and call the service; evolution should call the same service. Move only the shared operation and its required contracts, preserving the existing lock and mutation journal owners.

**Risk and proof.** Keep authorization, path checks, locking, backup validation, and undo guarantees unchanged. Use file-command and evolution-apply tests. The observed imports prove the boundary inversion; this audit does not claim a complete runtime cycle analysis.

### A8. Medium priority: split lifecycle and evolution by behavior, alongside their tests

**Evidence.** [lifecycle.ts](/home/ozy/01_projects/dev/afol.public-root/cli/services/workbench/lifecycle.ts:2814) has 3,202 lines; the locked callback in `closeSession` scores 104. It combines continuation creation, verification, report rendering, rollback, and auxiliary updates. `recordEvidence` has a locked callback scoring 68. [checkEvolutionDbHealth](/home/ozy/01_projects/dev/afol.public-root/cli/services/evolution/health.ts:319) scores 119. The evolution command file has 2,332 lines. [workbench-lifecycle.test.ts](/home/ozy/01_projects/dev/afol.public-root/cli/tests/workbench-lifecycle.test.ts:1) has 7,653 lines.

**Proposed change.** Extract pure close decisions and report data first; retain one explicit coordinator for lock scope and durable writes. Separate evidence, verification recovery, close/continuation, and rendering responsibilities. Split tests by those behaviors and reuse only necessary fixture helpers. For evolution, separate CLI parsing, public output shaping, and database health observations.

**Risk and proof.** This is higher risk than export cleanup. Preserve event order, retry idempotence, carry-open behavior, rollback, and warning-versus-block semantics. Test each slice before moving to the next. A lower complexity score alone is insufficient evidence.

### A9. Medium priority: use Valibot at selected data boundaries

**Evidence.** Runtime Valibot usage is concentrated in [project-benchmark/schema.ts](/home/ozy/01_projects/dev/afol.public-root/cli/services/project-benchmark/schema.ts:143). Meanwhile, [import-journal.validatePayload](/home/ozy/01_projects/dev/afol.public-root/cli/services/evolution/import-journal.ts:174) scores 76 and mixes structural validation with project identity, redaction, and digest relationships.

**Proposed change.** Reuse Valibot for selected structural boundaries, with `safeParse` producing a typed result and issues. Keep domain relationships and redaction requirements as explicit checks. Avoid maintaining independently authored types and schemas when inference can express the existing contract. [Valibot safeParse documentation](https://valibot.dev/api/safeParse/)

**Risk and proof.** Characterize current acceptance first: absent versus null fields, unknown keys, coercion, and failure order. A stricter schema or dropped unknown fields can change stored digests and public behavior. Start with one payload rather than applying schemas to every internal object.

### A10. Low-risk starting point: narrow exports instead of deleting working helpers

**Evidence.** The configured Knip command uses `--dependencies`, which excludes export/type issues. The expanded audit reports 256 exports, 242 types, and seven duplicate-export groups. These are candidates, not 505 proven dead implementations. For example, [runEvidenceReverifyCommand](/home/ozy/01_projects/dev/afol.public-root/cli/commands/workbench.ts:412) is called within its own file. [runFeedback](/home/ozy/01_projects/dev/afol.public-root/cli/commands/feedback.ts:238) is an alias with no other current code reference.

**Proposed change.** Review a bounded group of ordinary modules: remove unnecessary `export` keywords, then remove genuinely unreferenced aliases after checking compatibility. Exclude generated modules from manual edits. Keep a non-blocking expanded Knip audit available for maintenance instead of enabling hundreds of new release failures. [Knip issue selection](https://knip.dev/reference/cli#--dependencies)

**Proof required.** Typecheck plus the affected tests. Validate package/public API contracts before removing exported compatibility names. The current `--use-tsconfig-files` mode also limits what can be concluded about unused files.

### A11. Organization: clarify the private factory's remaining role

**Evidence.** The current root guidance makes the public checkout canonical, but [export-public.ts](/home/ozy/01_projects/dev/afol/afol.dev/scripts/export-public.ts:43) still builds from the private repository, and the private package retains overlapping engine/release scripts. The two trees already differ in 23 corresponding code files.

**Proposed change.** Document whether the private factory now serves historical reproduction or a remaining bounded export responsibility. Keep product implementation in the public repository and avoid treating the private engine copy as an equal development target. Do not delete it, merge histories, or regenerate the public tree from it as part of cleanup.

**Proof required.** Inventory actual operator consumers before retiring any entrypoint. Preserve private governance tests, export history, and existing uncommitted documentation work. The differences alone do not establish that any file is safe to remove.

## RAG and documentation evidence

`ragctl docs health --json` reported a healthy 3,254-document corpus and ready documentation search. Source synchronization was within its configured freshness window. The diagnostic could not prove GPU offload; this limits performance claims, not the cited document text.

Queries run through Docs RAG:

| Source | Query and useful result |
| --- | --- |
| `bun-docs` | `Bun SQLite transactions prepared statements query strict` returned the SQLite API reference |
| `bun-docs` | `Bun parseArgs node:util options allowPositionals strict` returned the argument parsing guide |
| `typescript-docs` | `TypeScript satisfies discriminated unions exhaustive never validation` returned discriminated-union guidance; the precise `satisfies` contract was confirmed in official documentation |
| `biome-docs` | `Biome noExcessiveCognitiveComplexity complexity maintainability` returned the rule's official documentation link through the changelog |

The source list did not contain Valibot, Citty, Knip, Oxlint, or `diff` corpora. Official Valibot and Knip documentation supplemented RAG where needed. No alternate library was proposed merely because its documentation was indexed.

Project retrieval was not suitable as proof. `ragctl projects list --json` had no registration for `/home/ozy/01_projects/dev/afol.public-root`. The registered public candidate pointed to a different checkout. Verification of `afol-dev` reported `PROJECT_INDEX_STALE`: 233 stale files, one indexed file missing on disk, and 74 expected paths absent from the indexed scope. Hidden governance is outside that corpus by design. The fallback `gitnexus status` was used only after observing the missing/stale RAG scope; it reported that the canonical public repository was not indexed. No indexing or service startup was attempted.

## Suggested execution order and retained boundaries

1. Correct A1 with truthful provenance and restore the failing baseline test.
2. Select a small A10 cleanup, then A2's exact duplicate group and A4's SQL-only transaction slice.
3. Address freshness ownership and one parser family, preserving measured fast-path behavior.
4. Refactor dispatch and mutation ownership in separate changes.
5. Split lifecycle/evolution together with meaningful characterization tests.

Use the existing roadmap responsibilities when implementation is authorized: F-03 for command behavior, F-31 for external receipts, and F-34 for public provenance. F-15 records earlier completed simplification; this audit does not reopen its final status or create a replacement roadmap feature. Indexed under F-34 architecture child `260818_public-architecture-code-quality_spec-child_01`; not exact-SHA release evidence.

Retain the useful existing primitives: atomic/durable writes under `services/io`, lock ownership, explicit evidence validation, lazy command imports, `diff` usage in bootstrap/update, and the strict TypeScript configuration. None of the current evidence warrants replacing synchronous CLI I/O wholesale, introducing an ORM, or adopting another schema/test framework.

Skills used: `exploring-tools`, `evandro-rag-system`, `reducao-segura-complexidade-ciclomatica`, `websearch-docs`, and `markdownlint-skill`.
