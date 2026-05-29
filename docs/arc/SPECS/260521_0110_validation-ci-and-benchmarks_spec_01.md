---
doc_type: spec
id: 260521_0110_validation-ci-and-benchmarks_spec_01
theme: validation-ci-and-benchmarks
status: final
owners:
- orchestrator
created_at: '2026-05-21T01:50:00+08:00'
updated_at: '2026-05-29T11:08:02-03:00'
roadmap_feature: F-11
spec_role: parent
parent_spec: 260521_0000_total-reformulation-strategy_spec_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  manifesto: docs/arc/PROJECT-MANIFESTO.md
scope:
  repo_areas:
  - cli/validate
  - tests
  - .github/workflows
  - src/project-template
  - .agents/data/benchmarks
  packages:
  - agentic-cli
risk_level: high
---

# SPEC: validation-ci-and-benchmarks

## 1) Feature Intent

Create validation gates that make the universal agent operating layer
trustworthy.

The validation system must prove correctness, speed, quality, safety, command
parity, update safety, and token economy.

## 2) Problem

Agent systems drift easily across docs, commands, templates, runtime adapters,
workbench files, and tool behavior.

Static tests are necessary but insufficient. Runtime-flow benchmarks are needed
for changes that affect how agents choose commands, tools, rules, skills, or
mutation paths.

## 3) Validation Layers

### CLI kernel

- Type check.
- Unit tests.
- Parser and alias snapshot tests.
- Output envelope tests.
- Project-root and loader tests.
- Delegation parity tests.

### Template export

- Required file checks.
- Forbidden factory-noise checks.
- Manifest ownership checks.
- Downstream bootstrap fixture.
- Wrapper smoke checks.

### Workbench

- Task state validation.
- Evidence-required closure.
- Log and sidecar shape validation.
- Spec-to-roadmap links.
- Strict close validation.

### Rules and skills

- Routing accuracy tests.
- Surface detection tests.
- Compact output tests.
- Relevance threshold checks.

### File mutation and update

- Dry-run zero-write tests.
- Protected path tests.
- Journal record tests.
- Undo tests.
- Update conflict tests.
- Managed vs project-owned preservation tests.

### Runtime and MCP

- CLI/MCP parity tests.
- MCP request/response schema tests.
- Tool registration smoke tests.
- Runtime adapter health checks.

### Coverage Gate Strategy

- Program coverage minimum: **>= 80%** before implementation promotion.
- Current live baseline that remains valid while TS/Bun stack is not yet implemented:
  `.agents/scripts` with **83.24%** coverage.
- TS/Bun/Bundler stack has a mandatory future coverage gate, scoped per
  package and only activated after stack implementation starts.
- Gate target is also 80%; each package must have explicit baseline
  evidence and a recorded justification when temporarily below baseline in
  transition.

## 4) Test Matrix By Tool And Scenario

| Surface | Scenario | Metrics | Required threshold |
| --- | --- | --- | --- |
| `./a -h` | compact help | quality, tokens | <= 25 lines |
| `./a s` | status success | accuracy, speed | 100% pass, p50 <= 2s |
| `./a status` | long alias parity | parity | semantic equality with `s` |
| `./a -j s` | JSON output | contract | valid JSON, required keys |
| invalid root | safety error | safety, quality | non-zero, actionable hint |
| missing config | loader failure | safety | non-zero before mutation |
| unsupported command | router failure | quality | next command hint |
| delegated command | legacy fallback | parity | exit/stdout/stderr contract |
| `./a t d` | task closure | correctness | evidence required |
| `./a e a` | evidence add | correctness | ledger append validated |
| `./a r g` | rule route | accuracy | expected rules returned |
| `./a sk g` | skill route | accuracy | expected skills returned |
| `./a f pt` | patch mutation | safety | journal + protected path gate |
| `./a u` | undo | safety | supported rollback succeeds |
| `./a up ck` | update check | safety | read-only, no writes |
| `./a up ap` | update apply | safety | local edits preserved/flagged |
| MCP `status` | tool parity | parity | same semantic envelope as CLI |
| MCP mutation tools | safe mutation | safety | journal + protected paths |
| benchmark runner | result schema | quality | stable JSON schema |

## 5) Benchmark Result Schema

Benchmark results should record token-aware data, not only bytes.

Required fields:

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

Bytes stay useful for local fixture size. Token fields are the primary token
cost metric and must identify tokenizer, counting method, source, and status.

## 6) Scenario Registry

Every pack must have scenario definitions under:

```text
.agents/data/benchmarks/scenarios/<pack-id>/<scenario-id>.json
```

Each scenario definition must include:

- `scenario_id`,
- `pack_id`,
- command or MCP tool under test,
- fixture path or fixture generator,
- expected result envelope fields,
- side-effect oracle,
- metric thresholds,
- baseline id when comparing,
- required tags for CI selection.

Minimum registry:

The first implementation must create concrete scenario ids matching the F-11
spec-test. Pack-level names alone are not enough.

| Pack | Minimum scenarios | Required coverage |
| --- | ---: | --- |
| `cli-kernel-local` | 6 | help, status, JSON, invalid root |
| `workbench-parity` | 5 | task, evidence, log, verify, close |
| `routing-accuracy` | 4 | file, task, surface, unknown route |
| `mutation-safety` | 5 | dry-run, patch, move, protected, undo |
| `update-safety` | 4 | check, preview, conflict, local edit |
| `mcp-parity` | 5 | status, evidence, rule, mutation, error |
| `runtime-live-agent` | 3 | status, governed flow, MCP smoke |
| `token-economy` | 4 | help, status, routing, noisy output |

Completeness gate: if a changed path selects a pack, CI fails when the pack has
fewer registered scenarios than the minimum or when any scenario lacks an
oracle, threshold, or result-schema mapping.

## 7) Measurement Protocol

Baseline artifacts live under:

```text
.agents/data/benchmarks/baselines/<pack-id>/<baseline-id>.json
```

Protocol:

1. Record `host_profile_id`, OS, CPU class, Bun version, runtime version,
   model id, tokenizer id, and git commit.
2. Run one warmup for local deterministic packs.
3. Run at least three measured samples for local deterministic packs.
4. Compare local timing using p50 and p95, not a single run.
5. Run live packs only with fixed prompt, fixed model tier, fixed fixture, and
   saved result JSON.
6. Treat missing baselines as `baseline-missing`, not pass.
7. Store sample count, warmup count, p50, p95, host profile, runtime versions,
   scenario versions, tokenizer id, and git commit in the baseline artifact.
8. Reject comparison when scenario id, tokenizer id, or host profile differs
   unless a compatible normalized baseline id is declared.
9. Allow threshold override only with a written reason in benchmark evidence.

Early thresholds are provisional until baseline artifacts exist. Once a baseline
exists, comparisons use that versioned baseline.

## 8) Side-Effect Oracle

Mutating scenarios must capture:

- pre-run file tree hash,
- post-run file tree hash,
- allowed path diff list,
- forbidden path diff list,
- event records,
- mutation journal records,
- undo result when supported,
- normalized error envelope for blocked operations.

Safety pass requires:

- no writes outside the allowed diff list,
- no protected path mutation,
- journal record for every accepted mutation,
- zero writes for invalid-root and loader-failure paths,
- undo restores the fixture for supported mutations.

## 9) Semantic Parity Oracle

CLI, MCP, and legacy delegation compare normalized envelopes.

Canonical parity fields:

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

Fields ignored by parity unless explicitly tested:

- timestamp,
- duration,
- ordering of unordered lists,
- runtime-specific transport metadata.

A shared diff helper must report:

- missing fields,
- extra semantic fields,
- mismatched values,
- ignored transport-only fields.

## 10) TDD Strategy

Implementation order:

1. Write spec-test artifacts for the behavior contract.
2. Write type/schema tests.
3. Write parser, alias, and result-envelope unit tests.
4. Write fixture integration tests for `./a`.
5. Write delegation parity tests against legacy commands.
6. Write template export negative tests before shrinking the template.
7. Write MCP parity tests before exposing new MCP tools.
8. Write deterministic benchmark-runner tests.
9. Run live benchmark packs only for risky runtime/tool-routing changes.

## 11) CI Strategy

Default CI runs:

- `bun run typecheck`.
- `bun test`.
- lint.
- template export validation.
- focused integration tests.
- workbench validation where applicable.
- Smoke benchmark runs are acceptable for early continuity checks, but global closure
  requires full artifacts persisted for selected packs (`.agents/data/benchmarks/results/...`)
  and evidence that all F-11 required pack scenarios were executed or explicitly
  waived with artifact-backed reasoning.

Selective CI maps paths to packs:

| Changed path | Required pack |
| --- | --- |
| `cli/**` | `cli-kernel-local` |
| `cli/rules/**` | `routing-accuracy` |
| `cli/skills/**` | `routing-accuracy` |
| `cli/files/**` | `mutation-safety` |
| `cli/update/**` | `update-safety` |
| `cli/mcp/**` | `mcp-parity` |
| `.agents/runtime/**` | `runtime-live-agent` |
| `src/project-template/**` | template export checks |
| prompt/context docs | `token-economy` |

## 12) Acceptance

- Type checks and unit tests exist for the CLI kernel.
- Template export checks catch forbidden content.
- Workbench validation catches missing evidence.
- CLI/MCP parity tests use one normalized envelope and diff helper.
- Benchmark registry defines required scenarios by pack.
- Benchmark results capture tokens, bytes, baseline id, and runtime profile.
- Risky runtime changes have a clear benchmark trigger.
- CI catches schema, command, and template drift before release.

## 13) Closeout

- Status: final.
- Accepted session-backed artifacts:
  - `.agents/wb/260528_1409_f11-validation-benchmark-contract`
  - `.agents/wb/260529_0958_f11-ci-selector-matrix-pack-map`
  - `.agents/wb/260529_1018_f11-real-typecheck-gate`
  - `.agents/wb/260529_1030_f11-routing-accuracy-pack-wave`
  - `.agents/wb/260529_1043_f11-update-safety-pack-wave`
  - `.agents/wb/260529_1054_f11-mutation-safety-pack-wave`
- Accepted implementation evidence:
  - `3a6456e`
  - `afe8a79`
  - `a1fa3e1`
  - `7760358`
  - `681c6d0`
  - `8dd5e20`
- Current benchmark matrix:
  - `cli-kernel-local`
  - `workbench-parity`
  - `routing-accuracy`
  - `mutation-safety`
  - `update-safety`
  - `mcp-parity`
  - `runtime-live-agent`
  - `token-economy`
