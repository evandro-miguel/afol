---
doc_type: spec
id: 260521_0030_agent-command-design-system_spec_01
theme: agent-command-design-system
status: draft
owners:
- orchestrator
created_at: '2026-05-21T00:30:00+08:00'
updated_at: '2026-05-21T00:30:00+08:00'
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

## 2) Problem

Long commands are expensive when agents execute them repeatedly. Manual file
edits for routine state are more expensive and more error-prone.

The command grammar must be short, stable, and testable.

## 3) Grammar Contract

```text
./a <domain> <action> [target] [flags]
```

Examples:

```bash
./a s
./a n auth-refactor -F F-02 -S auth-spec
./a t s T-01
./a t d T-01 -e E-01
./a e a -t T-01 -c "bun test" -r pass
./a l a -t T-01 -m "Added validation"
./a r g frontend
./a sk u
./a q s -t T-02 -f research.md -m "Summary"
./a v
./a c
./a up ck
```

Short aliases are canonical for agents. Long aliases are canonical for humans
and docs.

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
err missing-evidence task=T-01 hint="run ./a e a -t T-01 -c <cmd> -r pass"
```

## 8) Help Rules

- `./a -h` must fit in 25 lines or fewer.
- Help must show short and long aliases.
- Full docs are not printed by default.
- Unknown commands must return a focused hint, not a long manual.

## 9) Testable Invariants

- Alias resolution is one hop: short and long resolve to one canonical command.
- No two aliases can resolve ambiguously in the same position.
- Compact output and JSON output carry the same semantic fields.
- Negative paths are actionable.
- High-frequency workbench updates do not require manual file edits.

## 10) Acceptance

- `./a s` and `./a status` have semantic parity.
- `./a -j s` emits valid JSON.
- `./a -h` remains compact.
- Unknown commands fail with an actionable hint.
- The alias table is snapshot-tested.
- Agents can perform routine workbench updates without opening raw files.
