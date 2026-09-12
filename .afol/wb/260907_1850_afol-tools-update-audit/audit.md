# AFOL command and tool update audit

## Verdict

No new functional regression was confirmed in the pending public-engine changes. The full native suite passes with both installed Bun versions. One existing evolution smoke failure is demonstrably fixed. Command count, invocation count, and compact workflow output are unchanged by this refactor. Batching and quick-task already provide large savings relative to individual task commands.

The benchmark catalog is not fully green: five scripted scenarios still fail in both the base and current code, and four external-agent scenarios require a real harness receipt. These are not newly introduced regressions.

## Identity and scope

- Engine: `/home/ozy/01_projects/dev/afol.public-root`.
- Branch: `refactor/audit-corrections-20260907`; base commit: `48262833132d4add94220eba465d55089b2ba4fb`.
- Candidate: existing uncommitted changes, preserved throughout the audit.
- Current CLI TypeScript fingerprint: `f6a35158147b71773f102a249f1350db9a75682b8f7f5dbb6a2aa67e5dc6102d`.
- Original base CLI TypeScript fingerprint: `554e7df9083df3f31ec6c43b0aae0035f2bed0362b00b9a2d6d6c90addaf047f`.
- Both source-comparison runs confirmed unchanged candidate fingerprints before/after measurement. Additional current tests were subsequently copied into the disposable baseline for regression testing; baseline production code was not edited.
- Project RAG `afol-public-root` verified ready, with matching root and `cli,src,docs,scripts` scope, before indexed discovery. Findings were confirmed in source.
- Scope: 51 registered commands, 46 aliases, native tests, 16 benchmark packs containing 94 scenarios, and real isolated lifecycle journeys. Help acceptance is not a claim of complete behavioral coverage for every possible argument combination.
- Source execution only; no installation, commit, push, deployment, or permission changes.

## Functional verification

| Check | Observed result |
| --- | --- |
| `bun run test:full`, Bun 1.4.2 | 2,194 pass, 5 skip, 0 fail on repeat |
| `bun run test:full`, Bun 1.3.14 | 2,194 pass, 5 skip, 0 fail |
| Initial Bun 1.4.2 run | Two fleet tests exceeded 5 seconds; isolated fleet run passed 24/24 and the full repeat passed |
| `bun run typecheck` | Passed |
| `bun run validate:toolchain`, Bun 1.3.14 | Version, manifest, Biome, Oxlint, Knip, and dependency smoke passed |
| `help <command-or-alias>` | 97/97 accepted |
| Strict lifecycle verification | 36/36 isolated source-comparison fixtures passed `vf <session> --strict` |
| Same current tests against base code | 35 pass, 1 fail across three evolution test files |

The base failure is the evolution smoke loading its contract from the absent private `.afol/data/benchmarks/catalog/...` path. Current `cli/dev/evolve-benchmark-smoke.ts:54` loads the public builtin asset instead. Current `cli/tests/evolution-benchmark-smoke.test.ts:7` passes in both full suites. The transaction and journal tests passed against both versions, so they demonstrate preserved behavior and added coverage, not newly fixed defects.

## Before/after measurements

Primary source comparison uses Bun 1.3.14 for both arms, serial alternating order, one warmup, ten read-command samples and five workflow samples per arm. Each workflow has ten tasks. Fixture bootstrap and post-run inspection are outside measured duration and invocation counts. Actual shell verification appends a marker to a fixture-local file; the final board and evidence are checked separately.

| Workflow | Base median | Current median | AFOL calls in both | Output bytes in both | Verification executions |
| --- | --- | --- | --- | --- | --- |
| Individual `n`, ten `st`/`d -x` pairs, `c` | 1,559.6 ms | 1,559.2 ms | 22 | 952 | 10 |
| Batch `n`, `st T-01..T-10`, `d T-01..T-10 -x`, `c` | 368.2 ms | 368.7 ms | 4 | 196 | 1 |
| `qt` with ten tasks and one command | 191.7 ms | 180.3 ms | 1 | 58 | 1 |

Current batch versus individual: 81.8% fewer AFOL invocations, 79.4% fewer output bytes, and about 76% less measured time. Current quick-task versus individual: 95.5% fewer invocations, 93.9% fewer output bytes, and about 88% less time. These capabilities and call counts already exist in the base commit; they must not be attributed to this pending refactor.

Read-command medians were also close: status 45.1 to 44.0 ms, context 73.3 to 72.0 ms, evolution status 46.4 to 45.4 ms, state show 50.6 to 52.8 ms, update check 46.8 to 49.3 ms. This sample does not establish a substantial overall speed improvement or deterioration.

An initial Bun 1.4.2 run showed slow batch/quick-task measurements. A separate controlled runtime comparison used the same current source, alternating Bun 1.3.14/1.4.2 with five samples plus warmup. Bun 1.4.2 measured 1,309.9/358.6/165.6 ms for individual/batch/quick-task versus 1,606.0/419.4/185.0 ms on 1.3.14. The earlier slowdown did not reproduce; its cause is unproven. Do not label it a runtime or source regression.

These are scripted AFOL invocation counts and output bytes, not provider token usage or measured model tool-call savings. No external-agent efficiency claim is supported without a comparable receipt.

## Benchmark results and remaining failures

The initial 16-pack sweep on Bun 1.4.2 produced 80 passing and 14 nonpassing scenarios. Five mutation scenarios were incompatible with their pinned Bun 1.3.14 profile. Repeating that pack with the installed matching runtime passed all five without changing the profile or thresholds. Combined capability coverage is therefore 85 passing scenarios, five scripted failures, and four receipt-dependent scenarios not demonstrated; this is not a single-runtime green gate.

Passing packs: cli-kernel-local, routing-accuracy, mutation-safety on the matching runtime, update-safety, workbench-parity, mcp-parity, pstr-integrity, context-bundles, state-projection, memory-governance, library-knowledge, and adm-governance. MCP parity here is the AFOL scripted pack, not a live external MCP-client certification.

| Remaining scenario | Current failure | Base comparison / implication |
| --- | --- | --- |
| `evolution-status-contract` | Consumer fixture has no `cli/dev/evolve-benchmark-smoke.ts` | Same failure in base. Public smoke itself is fixed, but catalog invocation remains source-relative. Separate source-only smoke from consumer-safe execution. |
| `token-help` | Estimated output 550 exceeds limit 500 | Same 2,201-byte help and failure in base. Reduce help or review the budget through a separate change; do not claim a pass. |
| `adr-new` | Estimated output 121 exceeds limit 108 in matching pinned fixtures | Same failure in base. Output includes fixture-path-sensitive data; avoid treating historical token estimates as universal. |
| `tool-surface-coverage-matrix` | Setup `ux coverage --tool maintenance` exits 1 with zero journeys | Same failure in base. The fixture lacks required UX coverage; declared catalog coverage is not execution proof. |
| `ux-registry-lifecycle` | Synthetic UX journey lacks recovery/state fields; output also exceeds budget | Same failure in base. Align the fixture with the current validator. |
| Four `runtime-live-agent` scenarios | Required external harness snapshot absent | Not measured. AFOL must not execute models or manufacture receipts. |

Relevant catalog anchors are under `src/builtin-assets/benchmarks/catalog/scenarios/{evolution-core,token-economy,governance-history}/`. In particular, `ux-registry-lifecycle.json:12` writes the incomplete journey, and `tool-surface-coverage-matrix.json:16` requires coverage before the fixture provides it.

## Evidence and measurement limitations

Artifacts are in `/home/ozy/01_projects/dev/afol.public-root/.tmp/afol-tools-update-audit/`:

- `comparison-pinned.json`, `fixture-verification.json`, and `comparison-runtime.json`: measured samples and acceptance evidence.
- `packs-summary.json`, `packs-summary-pinned-current.json`, `packs-summary-pinned-baseline.json`: scenario outcomes, with individual pack JSON for detailed diagnostics.
- `test-full.log`, `test-full-repeat.log`, `test-full-pinned.log`, `typecheck.log`, `toolchain.log`, `baseline-regressions.log`: native checks and preserved failures.
- `compare.ts`, `packs.ts`, `verify-fixtures.ts`: task-scoped reproducible drivers. Bun is selected only through command-local PATH or an explicit executable path.

The first exploratory comparison used an unprepared context index and no session for state inspection. Those failures occurred in both arms and were fixture prerequisites, not regressions. The pinned comparison prepared both correctly. Its initial board-inspection glob omitted hidden `.afol` paths on Bun 1.3.14; direct filesystem enumeration plus native strict verification recovered all 36 fixtures. The original measurement artifact is retained with a separate recovery record, rather than silently rewriting failed checks.

The public source was not edited by this audit. Private changes are this report, the governed audit lifecycle, and the user-correction lesson. Skills used: token-economy, evandro-rag-system, afol-integration-test, agentic-benchmarking, and git-skill. Global installation and hosted/native Windows release readiness were outside this audit.
