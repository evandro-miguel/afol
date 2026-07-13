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
  - tests
  - .github/workflows
  - src/project-template
  - .afol/data/benchmarks
  packages:
  - agentic-cli
risk_level: high
---

# SPEC: validation-ci-and-benchmarks

## 1) Feature Intent

Create validation gates that make the universal agent operating layer
trustworthy.

The validation system must prove correctness, **speed/latency**, quality,
safety, command parity, update safety, and **token economy on both axes**:

1. **Forced output tokens** — CLI stdout agents must read (compact default;
   >5k warn, >10k fail per project rule).
2. **Write tokens** — argv / command strings agents must author (short
   lifecycle path, omit-able session, collapsed `d -x`; see F-03 child
   `260712_agent-cli-extreme-ease-latency-write-tokens_spec-child_01`).

Gates should fail when agents are forced into giant commands or giant default
output, not only when functional tests break.

2026-05-31 DR addendum:

- Release/security gate set for F-11 includes build determinism, static analysis,
  and dependency-risk checks.
- TS minimum compiler floor is TypeScript 6 for the documented baseline and
  TS7/`tsgo` runs remain informative until the stack is fully stabilized.
- Security floor adds Biome/Oxlint/Knip and dependency/runtime checks with OSV and
  Gitleaks (or modern equivalent) in the release-quality path.
- `bun run validate:security` drives the release security lane through
  `security:scan:informative`; with `osv-scanner` v2 installed it scans
  `bun.lock`, and with `gitleaks` installed it scans project content using
  `.gitleaks.toml`.
- This spec does not require OSV/Gitleaks to be installed everywhere; scripts
  still skip safely when tooling is unavailable, but this factory checkout has
  both tools installed and validated locally.
- Build validation uses Bun standalone executable smoke tests and clean-room
  install checks. `bun install --frozen-lockfile` is required in release-quality
  validation so `bun.lock` cannot change during the gate.
- Cross-target binaries require per-target smoke evidence before they count as
  supported. Linux-built macOS or Windows artifacts are build candidates until
  native or VM-backed smoke validates them.

### 1.1) Release policy for MVP

MVP hardening treats the release lane as:

- `bun run validate:release` as the required release gate equivalent in CI.
- Hard checks inside that lane: toolchain, template, bootstrap, deterministic
  build, smoke, checksum/provenance generation, and security scan orchestration.
- Security is informative in this phase: `bun run validate:security` can skip
  when scanners are unavailable, but every non-local release must document that
  waiver explicitly with the missing-tool reason.
- MCP full/native adapters, runtime-live-agent transport, and broad cross-platform
  claims remain deferred until explicit evidence packs pass for those lanes.

## 2) Problem

Agent systems drift easily across docs, commands, templates, runtime adapters,
workbench files, and tool behavior.

Static tests are necessary but insufficient. Runtime-flow benchmarks are a
selective development-time regression check for changes that affect how agents
choose commands, tools, rules, skills, or mutation paths.

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
- Standalone build checks (`bun run build` and `bun run smoke:dist`).

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
| `afol -h` | compact help | quality, tokens | <= 25 lines and <= ~550 est. output tokens |
| `afol s` | status success | accuracy, speed | 100% pass, p50 <= 100 ms warm local, p95 <= 300 ms |
| `afol st T-01` / `afol d -x` / `afol c` | agent fast-path lifecycle | write tokens, reliability, speed | works without repeated session id when active session resolves; p95 <= 300 ms |
| `afol st -S … -T …` | explicit multi-agent lifecycle | reliability | required when session ambiguous or CI fallback disabled |
| `afol status` | long alias parity | parity | semantic equality with `s` |
| `afol -j s` | JSON output | contract | valid JSON, required keys |
| invalid root | safety error | safety, quality | non-zero, actionable hint |
| missing config | loader failure | safety | non-zero before mutation |
| unsupported command | router failure | quality | next command hint |
| delegated command | legacy fallback | parity | exit/stdout/stderr contract |
| `afol t d` | task closure | correctness | evidence required |
| `afol e a` | evidence add | correctness | ledger append validated |
| `afol r g` | rule route | accuracy | expected rules returned |
| `afol sk g` | skill route | accuracy | expected skills returned |
| `afol f pt` | patch mutation | safety | journal + protected path gate |
| `afol u` | undo | safety | supported rollback succeeds |
| `afol up ck` | update check | safety | read-only, no writes |
| `afol up ap` | update apply | safety | local edits preserved/flagged |
| `bun run build` | standalone build | release safety | deterministic artifact produced |
| `bun run smoke:dist` | standalone smoke | safety + tokens | `./dist/afol --help` succeeds |
| MCP `status` | tool parity | parity | same semantic envelope as CLI |
| MCP mutation tools | safe mutation | safety | journal + protected paths |
| benchmark runner | result schema | quality | stable JSON schema |
| clean install | reproducibility | release safety | `bun install --frozen-lockfile` exits without lock changes |
| cross-target binary | platform support | release safety | each claimed target has native/VM smoke evidence |

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
.afol/data/benchmarks/scenarios/<pack-id>/<scenario-id>.json
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
| `token-economy` | 4+ | help, status, routing, noisy **output**; extend with **input argv** / short-lifecycle scenarios per F-03 child |

Completeness gate: if a changed path selects a pack, CI fails when the pack has
fewer registered scenarios than the minimum or when any scenario lacks an
oracle, threshold, or result-schema mapping.

## 7) Measurement Protocol

Baseline artifacts live under:

```text
.afol/data/benchmarks/baselines/<pack-id>/<baseline-id>.json
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

For F-03 input-token measurements, `argv_chars` is the number of Unicode code
points in the trimmed authored `scenario.command` (`Array.from(command.trim()).length`).
Scenario setup commands, tokenized process argv, wrappers, and generated
arguments are excluded.

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
4. Write fixture integration tests for `afol`.
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
- `bun run build` + `bun run smoke:dist`.
- template export validation.
- focused integration tests.
- workbench validation where applicable.
- Smoke benchmark runs are acceptable for early continuity checks, but they are
  not a daily production gate. Global closure requires full artifacts persisted
  for selected packs (`.afol/data/benchmarks/results/...`) and evidence that
  all F-11 required pack scenarios were executed or explicitly waived with
  artifact-backed reasoning.

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
- Release-quality validation includes deterministic standalone build smoke and
  security/toolchain checks where configured.
- Public release claims include clean install evidence, binary provenance,
  checksums, and notarization status where relevant.
- Risky runtime changes have a clear, selective benchmark trigger.
- CI catches schema, command, and template drift before release.

## 13) Closeout

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
- Waiver (artifact-backed):
  - `runtime-live-agent` is explicitly recorded as
    `status=skipped` with note
    `all-scenarios-skipped:not-implemented-live-runner`
    in `.afol/data/benchmarks/results/20260529_142633_runtime-live-agent.json`.
- Current benchmark matrix:
  - `cli-kernel-local`
  - `workbench-parity`
  - `routing-accuracy`
  - `mutation-safety`
  - `update-safety`
  - `mcp-parity`
  - `runtime-live-agent`
  - `token-economy`
