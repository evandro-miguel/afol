---
doc_type: spec
id: 260521_0030_agent-command-design-system_spec_01
theme: agent-command-design-system
status: final
owners:
- orchestrator
created_at: '2026-05-21T00:30:00+08:00'
updated_at: '2026-07-12T21:20:00Z'
roadmap_feature: F-03
spec_role: parent
parent_spec: 260521_0000_total-reformulation-strategy_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  manifesto: .afol/adm/doctrine/PROJECT-MANIFESTO.md
  living_child: .afol/adm/specs/260712_agent-cli-extreme-ease-latency-write-tokens_spec-child_01.md
scope:
  repo_areas:
  - cli
  - src/project-template
  - docs/standards
  - AGENTS.md
  packages:
  - agentic-cli
risk_level: high
---

# SPEC: agent-command-design-system

## 1) Feature Intent

Define a command design system optimized for **agents first**.

AFOL must make governed execution:

1. **Extremely easy to use** — the correct next command is obvious and short.
2. **Extremely low latency** — hot-path commands return in tens to low hundreds
   of milliseconds.
3. **Low write-token consumption** — agents must not author giant CLI strings.
4. **Very high reliability** — short forms are as safe as long forms.
5. **Low forced read tokens** — default stdout is compact; detail is opt-in or
   file-first.

**Write tokens are more expensive than read tokens.** Command text is model
output on every step and is often retried. Prefer omit-able context, short
aliases, positional args, and collapsed lifecycle steps over repeating long
session ids and flag names.

Living refinement of residual gaps (hints, docs dual-path, input budgets, flag
drift): `.afol/adm/specs/260712_agent-cli-extreme-ease-latency-write-tokens_spec-child_01.md`

## 2) Problem

Long commands are expensive when agents execute them repeatedly. Manual file
edits for routine state are more expensive and more error-prone. Verbose default
output forces agents to burn context on every tool result.

If docs and hints teach only long forms (`--session <long-id> --task-id …`),
agents will keep paying that cost even when short grammar exists.

The command grammar must be short, stable, dual-path (fast vs explicit), and
testable.

## 3) Grammar Contract

```text
afol <command|alias> [positional-target] [flags]
```

### 3.1 Agent fast path (active / bound / env session)

Canonical for single-session agent work:

```bash
afol s
afol st T-01
afol e T-01 -c "bun test" -o passed
afol d T-01 -x "bun test"
afol c
afol l -m "progress note"
afol n my-theme -t "do the thing" --no-spec-required --reason "scratch"
afol qt fix-x -t "fix" -c "bun test" -o passed --no-spec-required --reason "scratch"
afol v project
```

### 3.2 Explicit path (CI / multi-agent / ambiguous)

```bash
afol st -S <session-id> -T T-01
afol e -S <session-id> -T T-01 -c "bun test" -o passed
afol d -S <session-id> -T T-01 -x "bun test"
afol c -S <session-id>
```

### 3.3 Human long path

Long command names remain valid for humans and audits:

```bash
afol status
afol start --session <session-id> --task-id T-01
afol evidence --session <session-id> --task-id T-01 --command "bun test" --result passed
afol done --session <session-id> --task-id T-01
afol close --session <session-id>
```

**Policy:** short aliases and omit-able session are **canonical for agents**.
Long names and explicit session are **canonical for humans, CI, and multi-agent
safety**. Agent-facing docs must lead with the fast path.

## 4) High-Frequency Command Aliases (live)

| Short | Long | Purpose |
| --- | --- | --- |
| `s` | `status` | compact project/session state |
| `n` | `new` | create session |
| `st` | `start` | start task |
| `e` | `evidence` | record evidence |
| `d` | `done` | complete task |
| `c` | `close` | close session |
| `l` | `log` | append log |
| `qt` | `quick-task` | one-shot lifecycle |
| `v` / `ck` | `validate` | validation gates |
| `ss` | `session` | session bind/list/switch |
| `up` | `update` | scaffold update |
| `cx` | `ctx` | context bundles |
| `ht` | `health` | health checks |
| `b` | `bootstrap` | install elsewhere |
| `f` | `file` | safe file ops |
| `r` | `rule` | rules |
| `sk` | `skill` | skills |

Historical domain/action tables from early F-03 drafts that conflict with the
live registry are **superseded** by `cli/registry.ts`, `cli/aliases.ts`, and the
living child spec.

## 5) High-Frequency Flag Aliases (live)

| Flag | Long | Notes |
| --- | --- | --- |
| `-S` | `--session` | Prefer omit on active-session fast path |
| `-T` | `--task-id` | start / done / evidence |
| `-t` / `-T` | `--task` | new / quick-task summary |
| `-c` | `--command` | verification command |
| `-o` | `--result` | evidence result (`passed` / `failed`) |
| `-x` | `--test` | done: verify + evidence + complete |
| `-m` | `--message` | log message |
| `-F` | `--feature-id` | governed new |
| `-P` | `--parent-spec` | governed new |
| `-j` | `--json` | machine envelope |
| `-a` | `--artifact` | optional evidence artifact |
| `-n` | `--note` | optional evidence note |

Authoritative implementation: `cli/aliases.ts` and workbench parsers. Spec
examples must not invent short flags that the CLI rejects (for example evidence
does not accept `-r` for result; use `-o`).

## 6) Output Contract (forced read tokens)

Default output is compact and line-oriented.

```text
task started: T-01
evidence recorded: E-…
task done: T-01
```

JSON output uses the typed result envelope and is opt-in (`-j` / `--json`).

Project rule (also enforced in validate bench):

- **> 5 000** estimated output tokens → non-ideal (warn)
- **> 10 000** estimated output tokens → prohibited (fail)

Verbose / full / preview dumps are **never** the agent default.

Error output must include the next useful **short** command when possible:

```text
err missing-evidence task=T-01 hint="run afol e T-01 -c <cmd> -o passed"
```

When session is not resolvable, hints may include `-S <session-id>`.

## 7) Write-Token Contract (agent-authored argv)

| Requirement | Detail |
| --- | --- |
| Omit session when unambiguous | Active session, bind, or `AFOL_SESSION` |
| Prefer aliases | `st` / `e` / `d` / `c` over long names in agent tool calls |
| Prefer collapse | `d -x "…"` over separate evidence + done when valid |
| Prefer one-shot | `qt` for true micro tasks |
| No forced long teaching | Hints and AGENTS lead with fast path |

See living child for numeric argv budgets and acceptance checks.

## 8) Latency Contract

Hot-path agent commands (`s`, `st`, `e`, `d`, `c`, `l`, session list) target:

- p50 ≤ 100 ms
- p95 ≤ 300 ms

on a local warm host. Validation may be higher but should stay sub-second for
compact project checks. Do not “fix” latency by expanding default output.

## 9) Reliability Contract

- Short and long forms share one state machine and the same gates.
- Evidence-required done remains enforced.
- Ambiguous session fails closed in CI / multi-agent modes.
- High-frequency workbench updates never require manual State Board edits.
- Alias resolution is deterministic and snapshot-tested.

## 10) Help Rules

- `afol -h` stays compact (token-economy gated; prefer ≤ ~550 est. tokens).
- Help shows short and long aliases.
- Full docs are not printed by default.
- Unknown commands return a focused short hint, not a long manual.

## 11) Parser And Interaction Policy

- Command definitions live in the local registry/router.
- Parser libraries are implementation helpers, not the source of truth.
- Default agent-mode commands must not block on interactive input.
- Interactive affordances, when added, need noninteractive bypass tests.

## 12) Testable Invariants

- Alias resolution is one hop: short and long resolve to one canonical command.
- No two aliases resolve ambiguously in the same position.
- Compact and JSON output carry the same semantic fields.
- Negative paths are actionable with short next commands.
- Active-session lifecycle works without repeating session id.
- Explicit-session lifecycle works when required for safety.
- Parser/help snapshots keep short aliases and generated help synchronized.
- Token economy measures **stdout** and tracks **argv** targets for lifecycle
  scenarios (see living child + F-11).

## 13) Acceptance

### Closed (initial F-03 delivery)

- `afol status` and `afol s` have semantic parity.
- Compact help and alias tables exist.
- `afol st`, `afol d -x`, `afol c` exist with parity to long forms.
- Agents can perform routine workbench updates without opening raw files.
- Accepted implementation evidence: `E-20260529134101240986`.
- Closeout session: `.afol/wb/260529_1336_f03-kernel-grammar-alias-help/`.

### Residual (living child — required for “excellent agent CLI”)

Tracked in `260712_agent-cli-extreme-ease-latency-write-tokens_spec-child_01`:

- Hints and agent docs lead with fast path.
- Flag/example tables stay aligned with live CLI.
- Input argv budgets and latency budgets are validated.
- Forced output stays within project token rules on agent defaults.

## 14) Hermes Benchmark Decisions

- Pattern: generate help, catalogs, and capability views from one registry.
- Local decision: command groups and generated help/catalog output are backed
  by the CLI registry.
- Acceptance: aliases, command metadata, help, and capability listings resolve
  from the registry; `ResultEnvelope` remains the output contract for compact
  and JSON modes.
- Non-goals: no dynamic marketplace discovery before command groups and help
  snapshots prove the need.
