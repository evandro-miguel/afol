---
doc_type: spec
id: 260521_0110_validation-ci-and-benchmarks_spec_01
theme: validation-ci-and-benchmarks
status: final
owners:
- orchestrator
created_at: '2026-05-21T01:50:00+08:00'
updated_at: '2026-07-12T21:20:00Z'
roadmap_feature: F-11
spec_role: parent
parent_spec: 260521_0000_total-reformulation-strategy_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  manifesto: .afol/adm/doctrine/PROJECT-MANIFESTO.md
scope:
  repo_areas:
  - cli/validate
  - cli/tests
  - .github/workflows
  - src/project-template
  - .afol/data/benchmarks
risk_level: high
---

# SPEC: validation-ci-and-benchmarks

## 1) Feature Intent

Create deterministic validation gates that make the AFOL operating layer
trustworthy across correctness, latency, quality, safety, command parity,
update safety, release provenance, and token economy.

Token gates cover both:

1. **Forced output tokens** — compact default output warns above 5,000 tokens
   and fails above 10,000.
2. **Write tokens** — short lifecycle commands avoid repeated session IDs and
   collapse verification into `afol d T-01 -x "<check>"` where appropriate.

## Current AFOL Contract

- Projects invoke the external `afol` operator. The root `./afol` is only the
  factory development/package entrypoint and is not exported downstream.
- Bun/TypeScript under `cli/**` owns validation commands, selectors, scenario
  execution, coverage orchestration, security orchestration, and result
  contracts.
- `.afol/config.json` is canonical project configuration; benchmark catalog,
  scenarios, baselines, and results live under `.afol/data/benchmarks/**`.
- Retired command routing is absent from the active runtime.
- Explicit resolver compatibility fixtures are boundary tests only; they do
  not select or execute a retired command system.
- Historical migration material is retained under
  `.afol/data/migrations/**`; it is outside current gate selection.
- Required Bun/AFOL gates include `bun run typecheck`,
  `./afol validate project --check-drift --json`, focused tests, manifest and
  template checks, deterministic build/smoke, coverage, provenance, and strict
  security checks when release readiness is claimed.

## 2) Release and Security Policy

- `bun run validate:release` is the required release-quality gate.
- The active compiler gate is TypeScript 7 through `bun run typecheck`.
- Release validation includes toolchain, template, bootstrap, deterministic
  build, standalone smoke, checksum/provenance, coverage, and security
  orchestration.
- Release security fails closed on missing scanners, scanner failure,
  findings, or unsupported lock input.
- Local `bun run validate:security` remains a diagnostic lane and cannot by
  itself prove release readiness.
- Gitleaks scans history and the current worktree with redaction.
- OSV Scanner evaluates dependency inputs; any lock-format limitation is
  reported explicitly with the narrowest safe fallback.
- `bun install --frozen-lockfile` is required in release-quality clean-room
  validation.
- A cross-target build is only a candidate until native or VM-backed smoke
  evidence proves the target.

## 3) Validation Layers

### CLI kernel

- Typecheck and unit tests.
- Parser, alias, registry, and output-envelope tests.
- Project-root and canonical-loader tests.
- Short/long semantic parity tests.

### Template export

- Required-file and forbidden-factory-noise checks.
- Manifest ownership and source/generated payload parity.
- Downstream bootstrap fixtures.
- Repo-local development and standalone `dist/afol` smoke checks.

### Workbench

- Canonical State Board transitions.
- Evidence-required completion and closure.
- Spec/roadmap/session linkage.
- Strict task verification.

### Rules and skills

- Routing accuracy and relevance tests.
- Surface detection and compact-output checks.
- Prompt/body token-budget checks.

### File mutation and update

- Dry-run zero-write checks.
- Protected-path, journal, and undo checks.
- Managed/project-owned conflict preservation.
- Update preview, apply, and rollback checks.

### Optional adapter and pack harnesses

- Schema and normalized-envelope fixture tests.
- Registration and error-boundary tests.
- Pack IDs such as `mcp-parity` and `runtime-live-agent` remain catalog
  contracts; their presence does not claim a project-local adapter runtime.

### Coverage

- Program coverage is at least 80% lines and functions before implementation
  promotion.
- `bun run coverage:check` enforces the active Bun/TypeScript threshold inside
  `bun run validate:release`.
- Retained earlier release evidence is historical proof for its recorded
  product commit, not evidence for a later checkout.

## 4) Current Tool and Scenario Matrix

| Surface | Scenario | Required result |
| --- | --- | --- |
| `afol -h` | compact help | <=25 lines and <=~550 estimated output tokens |
| `afol s` | status | 100% pass; p50 <=100 ms and p95 <=300 ms on matching local profile |
| `afol st T-01` / `afol d T-01 -x` / `afol c` | fast lifecycle | no repeated session ID when context is unambiguous |
| explicit `-S` / `-T` | concurrent lifecycle | deterministic selected session/task |
| `afol -j s` | structured output | valid JSON with required envelope fields |
| invalid root/config | safety | non-zero before mutation with actionable hint |
| `afol d T-01 -x "<check>"` | task completion | verification evidence required |
| `afol e T-01 -c "<check>" -o passed` | evidence | validated ledger append |
| `afol rule list\|show\|resolve` | rule routing | expected governed rules |
| `afol skill list\|show\|search` | skill routing | expected provider skills |
| `afol file patch` | mutation | journal plus protected-path gate |
| `afol file undo --mutation-id <id>` | undo | supported rollback succeeds |
| `afol up check` | update | read-only and compact |
| `afol up apply --dry-run` | update preview | no writes and conflicts reported |
| `bun run build` / `bun run smoke:dist` | standalone artifact | deterministic build and smoke |
| benchmark runner | result contract | stable schema and bounded output |
| clean install | reproducibility | frozen lock exits without lock changes |

## 5) Benchmark Result Schema

Required result fields:

```text
run_id
scenario_id
pack_id
profile
adapter_id
runtime_id
model_id
model_version
tokenizer_id
tokenizer_version
token_count_method
token_count_source
token_count_status
baseline_id
host_profile_id
git_commit
pass
accuracy
duration_ms
timing_p50_ms
timing_p95_ms
tool_call_count
tool_success_rate
error_count
retry_count
context_bytes
context_tokens
prompt_bytes
prompt_tokens
output_bytes
output_tokens
mutation_count
fs_diff_allowed
journal_record_count
protected_path_block_count
semantic_parity
semantic_diff
notes
```

Bytes remain useful for fixture size. Token fields are the primary token-cost
measure and identify tokenizer, counting method, source, and status.

## 6) Scenario Registry

Scenario definitions live under:

```text
.afol/data/benchmarks/scenarios/<pack-id>/<scenario-id>.json
```

Each definition includes its command or harness action, fixture, expected
envelope fields, side-effect oracle, thresholds, baseline ID, and CI tags.

| Pack | Minimum scenarios | Required coverage |
| --- | ---: | --- |
| `cli-kernel-local` | 6 | help, status, JSON, invalid root |
| `workbench-parity` | 5 | task, evidence, log, verify, close |
| `routing-accuracy` | 4 | file, task, surface, unknown route |
| `mutation-safety` | 5 | dry-run, patch, move, protected, undo |
| `update-safety` | 4 | check, preview, conflict, local edit |
| `mcp-parity` | 5 | normalized harness contract and error cases |
| `runtime-live-agent` | 3 | explicit live-runner contract states |
| `token-economy` | 4+ | compact output and authored argv |

If a changed path selects a pack, CI fails when the pack is incomplete or a
scenario lacks an oracle, threshold, or result mapping.

## 7) Measurement Protocol

Baselines live under:

```text
.afol/data/benchmarks/baselines/<pack-id>/<baseline-id>.json
```

1. Record host profile, OS, CPU class, Bun version, runtime version, model,
   tokenizer, and Git commit.
2. Run one warmup and at least three measured samples for deterministic local
   packs.
3. Compare p50 and p95 instead of a single duration.
4. Run live packs only with fixed prompt, model tier, fixture, and persisted
   result.
5. Treat a missing baseline as `baseline-missing`.
6. Reject incomparable scenario, tokenizer, or host profiles unless a
   compatible normalized baseline is declared.
7. Require a written, evidence-backed reason for any threshold override.

For F-03 input-token measurement, `argv_chars` is the number of Unicode code
points in the trimmed authored `scenario.command`. Setup commands, process argv
expansion, and generated arguments are excluded.

## 8) Safety and Semantic Oracles

Mutating scenarios capture pre/post tree hashes, allowed and forbidden diffs,
event/journal records, protected-path blocks, normalized errors, and undo
results where supported.

Safety passes only when:

- no write escapes the allowed diff list;
- protected resources remain unchanged;
- every accepted mutation has a journal record;
- invalid-root and loader failures make zero writes;
- supported undo restores the fixture.

Normalized semantic comparison covers:

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

Timestamps, durations, ordering of unordered lists, and transport-only metadata
are ignored unless a scenario explicitly tests them.

## 9) TDD and CI Strategy

Implementation order:

1. Create or update the linked spec-test.
2. Write type/schema and negative safety tests.
3. Add parser, alias, registry, and result-envelope tests.
4. Add isolated filesystem integration tests.
5. Add source/generated template negative checks.
6. Add optional adapter harness checks before enabling an adapter.
7. Add deterministic benchmark-runner tests.
8. Run live packs only for risky routing or tool-choice changes.

Default CI runs typecheck, focused/full tests as configured, lint, deterministic
build/smoke, template validation, workbench validation, coverage, provenance,
and strict security orchestration for release claims.

Selective mapping:

| Changed path | Required pack |
| --- | --- |
| `cli/**` | `cli-kernel-local` |
| `cli/rules/**` | `routing-accuracy` |
| `cli/skills/**` | `routing-accuracy` |
| `cli/files/**` | `mutation-safety` |
| `cli/update/**` | `update-safety` |
| `cli/mcp/**` | `mcp-parity` when that optional surface exists |
| `src/project-template/**` | template export checks |
| prompt/context docs | `token-economy` |

## 10) Acceptance

- Type and behavior checks cover the CLI kernel.
- Template checks catch forbidden downstream content.
- Workbench validation catches missing evidence and governance drift.
- Benchmark registry defines required scenarios and stable result fields.
- Results capture tokens, bytes, baseline, host, and runtime profile.
- Release validation includes clean install, deterministic smoke, coverage,
  security, provenance, and checksums.
- Risky changes have a selective benchmark trigger.
- CI catches schema, command, template, and index drift before release.

## 11) Closeout and Historical Provenance

- Status: final.
- Accepted session-backed artifacts:
  - `.afol/wb/260528_1409_f11-validation-benchmark-contract`
  - `.afol/wb/260529_0958_f11-ci-selector-matrix-pack-map`
  - `.afol/wb/260529_1018_f11-real-typecheck-gate`
  - `.afol/wb/260529_1030_f11-routing-accuracy-pack-wave`
  - `.afol/wb/260529_1043_f11-update-safety-pack-wave`
  - `.afol/wb/260529_1054_f11-mutation-safety-pack-wave`
- Accepted implementation evidence:
  - `3a6456e`
  - `afe8a79`
  - `a1fa3e1`
  - `7760358`
  - `681c6d0`
  - `8dd5e20`
- Persisted selected-pack benchmark results:
  - `.afol/data/benchmarks/results/20260529_142632_cli-kernel-local.json`
  - `.afol/data/benchmarks/results/20260529_142632_workbench-parity.json`
  - `.afol/data/benchmarks/results/20260529_142633_routing-accuracy.json`
  - `.afol/data/benchmarks/results/20260529_142633_mutation-safety.json`
  - `.afol/data/benchmarks/results/20260529_142633_update-safety.json`
  - `.afol/data/benchmarks/results/20260529_142633_mcp-parity.json`
  - `.afol/data/benchmarks/results/20260529_142633_runtime-live-agent.json`
  - `.afol/data/benchmarks/results/20260529_142633_token-economy.json`
- Historical artifact-backed waiver: `runtime-live-agent` was recorded as
  `status=skipped` with note
  `all-scenarios-skipped:not-implemented-live-runner` in its accepted result.
- Current benchmark catalog retains:
  - `cli-kernel-local`
  - `workbench-parity`
  - `routing-accuracy`
  - `mutation-safety`
  - `update-safety`
  - `mcp-parity`
  - `runtime-live-agent`
  - `token-economy`
- The exact pre-reconciliation spec is retained under
  `.afol/data/migrations/260726_f29-governance-contract-reconciliation/`,
  with verified source commit, bytes, and retention metadata.
