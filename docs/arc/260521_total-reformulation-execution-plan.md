---
doc_type: execution_plan
id: 260521_0000_total_reformulation_execution_plan_01
status: active
owners:
- orchestrator
created_at: '2026-05-21T00:00:00+08:00'
updated_at: '2026-05-21T22:16:18-03:00'
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  manifesto: docs/arc/PROJECT-MANIFESTO.md
---

# Total Reformulation Execution Plan

## 1) Current Evidence

Repository inspection and delegated read-only exploration found that the current
project already has useful foundations:

- File-first, chat-light governance exists in
  `docs/standards/file-first-chat-light.md` and `AGENTS.md`.
- Workbench commands, evidence, task closure, and strict verification already
  exist in `.agents/scripts`.
- Safe mutation concepts already exist in the Python runtime and MCP-oriented
  scaffold.
- Project-template separation already exists as a goal-state spec and bootstrap
  concept.
- Skills sync and runtime compatibility are already modeled.
- Project-only Bun, TypeScript, JavaScript testing, Node, and MCP skills are now
  available under `.agents/skills/`.

The main conflicts are:

- The current stack is Python 3.11, Bash, uv, Just, and Markdown, while the new
  target is Bun/TypeScript-first.
- The public low-level dispatcher is `.agents/agents` plus Just aliases; the
  canonical product command should be `afol`, with `./a` kept as a
  compatibility alias during migration.
- `src/project-template` still carries runtime implementation, scripts, broad
  docs, skills source seed, and generated or operational baggage.
- Existing specs favor compatibility-first runtime migration, which is correct
  and should constrain the reformulation.

## 2) Strategy Decision

Do not perform a Big Bang rewrite.

The correct path is staged parity:

1. Add `afol` as the new command front door.
2. Keep `./a` as a compatibility alias and make both entrypoints delegate to
   existing `.agents/agents` behavior where TypeScript parity does not exist
   yet.
3. Build the Bun/TypeScript CLI kernel behind that wrapper.
4. Move one high-frequency command family at a time.
5. Shrink the downstream template only after bootstrap/export tests protect
   required behavior.

## 3) First Workstream

Implement F-00 to F-03 first:

- F-00: total reformulation strategy.
- F-01: universal agent CLI.
- F-02: minimal project template.
- F-03: agent command design system.

Do not start F-04+ implementation before the CLI kernel can prove project
detection, config/lock reading, compact output, and compatibility delegation.

## 4) Builder Slices

### Slice 1: Strategy Lock

Files:

- `docs/arc/PROJECT-MANIFESTO.md`
- `docs/arc/GENERAL-ROADMAP.md`
- `docs/arc/SPECS/260521_0000_total-reformulation-strategy_spec_01.md`
- `docs/arc/SPECS/260521_0010_universal-agent-cli_spec_01.md`
- `docs/arc/SPECS/260521_0020_minimal-project-template_spec_01.md`
- `docs/arc/SPECS/260521_0030_agent-command-design-system_spec_01.md`

Validation:

- Markdown/frontmatter lint.
- Specs index refresh when wrapper/runtime allows.
- Review against current-state anchors from agents.

Coverage and benchmark lock (applies to the program):

- Mínimo global de cobertura de programa: **>= 80%**. O gate de cobertura só
  entra como bloqueador quando houver medições de pacote/stack válidas.
- O gate atual vivo é o pacote legado de scripts Python (`.agents/scripts`) com
  base de auditoria em **83.24%**. Esse valor permanece como linha de base até que
  um novo stack seja ativado.
- Para stacks não implementados ainda (Bun/TypeScript e toolchain associada),
  cobertura é um gate futuro obrigatório por pacote/stack, com o mesmo limite de
  80% e evidência própria de baseline antes da migração funcional.
- Estratégia de benchmark de fechamento: cenário de smoke pode validar fluxo de
  regressão local; fechamento global exige evidências persistidas por pack,
  incluindo outputs JSON de resultado em diretório de artefatos, e aderência à
  matriz do F-11 antes do `T-27`.

### Slice 2: `afol` Canonical Front Door, `./a` Compatibility Alias

Files likely involved:

- `afol`
- `./a`
- `src/project-template/a`
- `.agents/agents`
- wrapper dispatch tests
- help output snapshots

Behavior:

- `afol -h` prints compact help.
- `afol status` maps to compact status.
- `afol s` is the short status alias.
- Unsupported commands delegate or produce actionable errors.
- `./a` remains a compatibility alias during migration.

Validation:

- `afol -h`
- `afol status`
- `afol s`
- `afol -j status`
- focused wrapper tests
- legacy `.agents/agents` smoke checks

### Slice 3A: Kernel Schemas

Files likely involved:

- `package.json`
- `tsconfig.json`
- `cli` or `packages/agentic-cli` source tree
- schema tests

Behavior:

- `ProjectStateV1`, `ProjectConfigV1`, `ProjectLockV1`,
  `ProjectManifestV1`, `CommandRequestV1`, `CommandResultV1`, and
  `CommandErrorV1` exist.
- Typed result envelopes are shared by compact and JSON output.

Validation:

- `bun run typecheck`
- `bun test` schema fixtures
- invalid JSON negative tests

### Slice 3B: Root Detection And State Loader

Behavior:

- Project root detection walks upward safely.
- `.agents/config.json` and `.agents/lock.json` are required.
- `.agents/manifest.json` is loaded only when needed.
- Invalid roots and missing state fail before mutation.

Validation:

- valid fixture root test
- invalid root negative test
- missing config/lock negative tests

### Slice 3C: Router, Aliases, And Output

Behavior:

- Short and long aliases resolve to canonical command IDs.
- Compact output is default.
- `-j` JSON mode returns the same semantic fields.
- Error output includes next-command hints.

Validation:

- alias table snapshot
- `afol -h`
- `afol s`
- `afol status`
- `afol -j status`

### Slice 3D: Compatibility Delegation

Behavior:

- Commands without TypeScript parity delegate to `.agents/agents`.
- Delegation preserves exit code and useful failure evidence.
- Every delegated command has a parity stop condition.

Validation:

- delegated smoke checks
- stdout/stderr/exit-code parity tests
- unsupported-command tests

### Slice 4: Template Cleanliness Contract

Files likely involved:

- `src/project-template/`
- `.agents/scripts/agents-bootstrap.py`
- bootstrap/export tests
- `docs/standards/bootstrap-other-repo.md`

Behavior:

- Template includes only local project protocol and required starter docs.
- Factory workbench history, telemetry, root maps, tests, caches, venvs, source
  seeds, and broad docs do not export.
- Compatibility install remains possible while universal CLI distribution is not
  public-ready.

Validation:

- export-cleanliness tests
- forbidden-path negative tests
- downstream smoke bootstrap

### Slice 5: Validation And Benchmark Contract

Files:

- `docs/arc/SPECS/260521_0110_validation-ci-and-benchmarks_spec_01.md`
- `docs/arc/SPECS/F-*/spec-tests/`
- future benchmark scenario definitions under `.agents/data/benchmarks/`

Behavior:

- TDD order is explicit.
- Spec-tests exist for kernel, command grammar, template export, MCP parity, and
  benchmark matrix.
- Benchmarks measure accuracy, speed, quality, safety, and token cost.

Validation:

- spec-test review
- benchmark result schema checks
- selective live benchmark only for risky runtime/tool-routing changes

## 5) Builder-Ready Task List

These tasks expand the plan beyond F-00 to F-03 while preserving the staging
rule: do not implement later behavior before the CLI kernel and validation
contract can protect parity.

### Kernel And Template Foundation

- `T-01` F-01/F-02/F-03: define versioned schemas and result envelopes.
  Verification: typecheck, schema fixtures, invalid JSON tests.
- `T-02` F-01: implement root detection and state loading.
  Verification: valid root, invalid root, missing config, missing lock.
- `T-03` F-03: implement short router, aliases, compact output, and JSON.
  Verification: alias snapshots, `afol -h`, `afol s`, `afol -j status`.
- `T-04` F-01/F-03: implement legacy delegation adapter.
  Verification: stdout, stderr, exit-code, and semantic parity fixtures.
- `T-05` F-02: lock minimal template export contract.
  Verification: required files, forbidden paths, downstream wrapper smoke.
- `T-06` F-11: implement benchmark registry and CI selector contract.
  Verification: scenario registry checks and benchmark schema tests.

### Workbench Core

- `T-07` F-04: model session, plan, task, evidence, log, sidecar, closure.
  Verification: schema tests and fixture serialization tests.
- `T-08` F-04/F-06: implement command-managed session and task operations.
  Verification: new, task start, task done, evidence required.
- `T-09` F-04/F-11: implement verify and close gates.
  Verification: missing evidence fails, valid closure passes.
- `T-10` F-06: implement compact handoff and research save flow.
  Verification: sidecar saved, summary returned, no chat dump required.

### Rules And Skills Routing

- `T-11` F-05: implement rule metadata and surface detection.
  Verification: file, task, surface, unknown-route fixtures.
- `T-12` F-05: implement skill metadata, list, get, and update behavior.
  Verification: local skills resolve without global dependency.
- `T-13a` F-05: define serialization payload schema for delegation payloads.
  Verification: schema fixture tests for payload envelope and required keys.
- `T-13b` F-06: implement delegation payload transport and route metadata rules.
  Verification: payload/parity fixtures and route metadata integrity tests.
- `T-13c` F-10: enforce workbench handoff contract for delegated context.
  Verification: compact subagent handoff with rule/skill/context compatibility.

### Local State And Event Log

- `T-14` F-07: define event schema and append-only JSONL event log.
  Verification: command events append with valid schema.
- `T-15` F-07: implement workbench, rules, skills, specs, and files indexes.
  Verification: rebuild, stale detection, compact status query.
- `T-16` F-07/F-11: implement event replay and freshness validation.
  Verification: stale index fails before trusted reads.

### Safe File Mutation

- `T-17` F-08: implement mutation policy and journal schema.
  Verification: journal record for every accepted mutation.
- `T-18` F-08: implement write, move, patch, and archive commands.
  Verification: allowed diff only, protected paths blocked.
- `T-19` F-08/F-11: implement dry-run and undo.
  Verification: dry-run zero writes, undo restores supported fixture.

### Template Update And Versioning

- `T-20` F-09: implement lock and manifest ownership model.
  Verification: managed, project-owned, generated, ignored, conflict.
- `T-21` F-09: implement update check and update plan.
  Verification: read-only check, conflict detection, local edit detection.
- `T-22` F-09: implement update apply and post-update validation.
  Verification: no silent overwrite, validation runs, event recorded.

### Runtime Adapters And MCP

- `T-23` F-10: implement shared action specs for CLI and MCP.
  Verification: one core handler per action, no adapter business logic.
- `T-24` F-10/F-11: implement MCP tool parity for core workbench tools.
  Verification: normalized CLI/MCP result envelope equality.
- `T-25` F-10: implement runtime smoke and health checks.
  Verification: thin adapter smoke for supported runtimes.

### Validation, Benchmarks, And Public Readiness

- `T-26` F-11: implement validation command family.
  Verification: `afol verify`, `afol verify wb`, `afol verify tpl`,
  `afol verify update`.
- `T-27` F-11: implement deterministic benchmark runner and baselines.
  Verification: p50, p95, tokenizer fields, baseline comparison.
- `T-28` F-12: implement public init and onboarding path.
  Verification: new fixture can install, run `afol status`, add evidence, close.
- `T-29` F-12: prepare public docs and examples.
  Verification: README, 10 commands, examples, no private assumptions.

## 6) Non-Negotiable Constraints

- Do not delete Python/Bash runtime behavior before parity evidence exists.
- Do not shrink `src/project-template` by guesswork; protect the export contract
  with tests first.
- Do not turn docs into the product. Docs describe the operating layer; the CLI
  must own routine behavior.
- Do not make indexes or event logs trusted without freshness checks.
- Do not make updates overwrite local edits silently.
- Do not benchmark vague product ideas; benchmark fixed scenarios with expected
  outputs and thresholds.

## 7) Immediate Next Action

Start with Slice 2 only after strategic docs and spec-tests are reviewed:

1. implement `afol` as the thin compatibility front door,
2. keep `./a` as a compatibility alias,
3. add local/template wrappers,
4. add compact help/status alias mapping,
5. validate against existing `.agents/agents` behavior.
