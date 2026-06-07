---
doc_type: spec
id: 260521_0030_agent-command-design-system_spec_01
theme: agent-command-design-system
status: final
owners:
- orchestrator
created_at: '2026-05-21T00:30:00+08:00'
updated_at: '2026-05-29T14:10:48-03:00'
roadmap_feature: F-03
spec_role: parent
parent_spec: 260521_0000_total-reformulation-strategy_spec_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  manifesto: docs/arc/PROJECT-MANIFESTO.md
scope:
  repo_areas:
  - cli
  - src/project-template/a
  - docs/standards
  packages:
  - agentic-cli
risk_level: high
---

# SPEC: agent-command-design-system

## 1) Feature Intent

Define a command design system optimized for agents.

The goal is to reduce repeated command tokens and manual file edits while
keeping every operation auditable by humans.

The intended simple operator surface includes `afol s`, `afol ck`, and
`afol b <repo> --partial`. The workbench shortcuts `afol st`, `afol d -x "..."`,
and `afol c` route to existing governed command paths and remain part of the
simple operator surface. Long aliases remain available for human readability.

## 2) Problem

Long commands are expensive when agents execute them repeatedly. Manual file
edits for routine state are more expensive and more error-prone.

The command grammar must be short, stable, and testable.

## 3) Grammar Contract

```text
afol <domain> <action> [target] [flags]
```

Examples:

```bash
afol s
afol new auth-refactor -F F-02 -S auth-spec
afol st -T T-01
afol d -T T-01 -x "bun test"
afol evidence add -t T-01 -c "bun test" -r pass
afol log add -t T-01 -m "Added validation"
afol rule get frontend
afol skill update
afol query search -t T-02 -f research.md -m "Summary"
afol ck
afol c
afol update check
```

Short aliases are canonical for agents. Long aliases are canonical for humans
and docs. `afol` is the canonical front door; `afol` remains a compatibility
alias during migration.

## 4) Locked Domain Aliases

| Short | Long | Purpose |
| --- | --- | --- |
| `s` | `status` | compact project/session state |
| `n` | `new` | create session/task/artifact |
| `p` | `plan` | plan operations |
| `t` | `task` | task operations |
| `l` | `log` | log operations |
| `e` | `evidence` | evidence operations |
| `r` | `rule` | rule resolution |
| `sk` | `skill` | skill operations |
| `q` | `query` | research and knowledge operations |
| `f` | `file` | safe file operations |
| `v` | `verify` | validation |
| `c` | `close` | session closure |
| `u` | `undo` | mutation undo |
| `up` | `update` | local system update |
| `b` | `bootstrap` | bootstrap or install |
| `ix` | `index` | local index operations |
| `ev` | `event` | event-log operations |

## 5) Locked Action Aliases

| Short | Long |
| --- | --- |
| `a` | `add` |
| `d` | `done` |
| `s` | `start` |
| `g` | `get` |
| `ls` | `list` |
| `rm` | `remove` |
| `mv` | `move` |
| `ck` | `check` |
| `ap` | `apply` |
| `st` | `status` |
| `pt` | `patch` |
| `ar` | `archive` |

## 6) Flag Aliases

| Flag | Meaning |
| --- | --- |
| `-s` | session |
| `-t` | task |
| `-e` | evidence |
| `-f` | file |
| `-m` | message |
| `-c` | command |
| `-r` | result |
| `-F` | feature |
| `-S` | spec |
| `-j` | json |
| `-q` | quiet |
| `-y` | yes or confirm |

## 7) Output Contract

Default output is compact and line-oriented.

```text
ok task=T-01 state=done evidence=E-01
```

JSON output uses the same typed result envelope.

```json
{
  "ok": true,
  "task": "T-01",
  "state": "done",
  "evidence": "E-01"
}
```

Error output must include the next useful command when possible.

```text
err missing-evidence task=T-01 hint="run afol evidence add -t T-01 -c <cmd> -r pass"
```

## 8) Help Rules

- `afol -h` must fit in 25 lines or fewer.
- Help must show short and long aliases.
- Full docs are not printed by default.
- Unknown commands must return a focused hint, not a long manual.

## 8.1) Parser And Interaction Policy

- Command definitions live in the local registry/router. Parser libraries are
  implementation helpers, not the source of truth.
- `citty` is the preferred parser helper for registry-backed commands because
  this system needs aliases, generated help, async handlers, and typed command
  metadata.
- `util.parseArgs` is acceptable for narrow internal scripts that do not need
  command discovery or generated help.
- Prompt/TUI/spinner behavior must be opt-in human-mode behavior. Default
  agent-mode commands must not block on interactive input, must keep compact
  output stable, and must expose the same semantic result in JSON mode.
- Framework-style scaffolding CLIs such as Bunli, meow-based starter CLIs, or
  Ace CLI/Bejibun remain reference material unless a future spike proves they
  reduce local code without expanding runtime scope.

## 9) Testable Invariants

- Alias resolution is one hop: short and long resolve to one canonical command.
- No two aliases can resolve ambiguously in the same position.
- Compact output and JSON output carry the same semantic fields.
- Negative paths are actionable.
- High-frequency workbench updates do not require manual file edits.
- Parser/help snapshots prove that short aliases, long aliases, and generated
  help stay synchronized.
- Interactive affordances, when added, have noninteractive bypass tests.

## 10) Acceptance

- `afol status` and `afol s` have semantic parity.
- `afol -j status` emits valid JSON.
- `afol -h` remains compact.
- `afol ck`, `afol st`, `afol d -x`, `afol c`, and `afol b` have parity with
  their long forms.
- Unknown commands fail with an actionable hint.
- The alias table is snapshot-tested.
- Agents can perform routine workbench updates without opening raw files.

## 11) Closure

- Accepted implementation evidence: `E-20260529134101240986`.
- Closeout session: `.agents/wb/260529_1336_f03-kernel-grammar-alias-help/`
- Strict verification:
  `./.agents/agents verify-tasks --strict .agents/wb/260529_1336_f03-kernel-grammar-alias-help/`
  passed.

## 12) Hermes Benchmark Decisions

- Pattern: generate help, catalogs, and capability views from one registry.
- Hermes source concept: toolsets/capabilities group tool specs into
  discoverable surfaces.
- Local decision: adapt as command groups and generated help/catalog output
  backed by the CLI registry.
- Acceptance criteria: aliases, command metadata, help, and capability listings
  resolve from the registry; `ResultEnvelope` remains the output contract for
  both compact and JSON modes.
- Non-goals: no dynamic marketplace discovery, no progressive tool discovery
  before command groups and help snapshots prove the need.
