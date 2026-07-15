---
doc_type: spec-child
id: 260712_agent-cli-extreme-ease-latency-write-tokens_spec-child_01
theme: agent-cli-extreme-ease-latency-write-tokens
status: final
owners:
- orchestrator
created_at: '2026-07-12T21:20:00Z'
updated_at: '2026-07-12T21:20:00Z'
roadmap_feature: F-03
spec_role: child
parent_spec: 260521_0030_agent-command-design-system_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  parent: .afol/adm/specs/260521_0030_agent-command-design-system_spec_01.md
  related:
  - .afol/adm/specs/260521_0010_universal-agent-cli_spec_01.md
  - .afol/adm/specs/260521_0060_file-first-low-token-execution_spec_01.md
  - .afol/adm/specs/260521_0110_validation-ci-and-benchmarks_spec_01.md
  - .afol/adm/specs/260612_temporal-health-freshness-token-budget_spec-child_01.md
risk_level: high
---

# SPEC CHILD: agent CLI extreme ease, latency, write tokens, reliability

## Intent

- Outcome: AFOL is the **easiest, cheapest, fastest, and most reliable** tool
  surface for agents to drive governed work without burning model tokens on
  either **command text they write** or **CLI output they are forced to read**.
- Roadmap feature: `F-03` (extends F-01 kernel and F-11 validation gates).
- Parent spec: `260521_0030_agent-command-design-system_spec_01`.

## Current Evidence And Residual Scope

- Observed `workbench-parity` evidence: session
  `.afol/wb/260713_0724_final-observed-workbench-benchmark/` (8/8 scenarios;
  short-path p50 65-70 ms, p95 66-71 ms; argv 6/24/12 characters).
- Implementation slice: commit `2f5f42f`.
- The residual implementation and acceptance evidence are closed by the
  governed F-03 session below; no additional product scope is opened.

## Child Scope Rationale

The parent F-03 closed with short grammar and compact defaults. Live audit
showed residual gaps that still force agents into **long write-path commands**,
**long next-step hints**, and **docs that teach the expensive form**:

1. Operational docs and workbench hints still push full
   `--session <long-id> --task-id T-xx` lifecycle strings.
2. Flag/alias tables in the parent drifted from the live CLI (for example
   result flag and session short flags).
3. Token-economy benches measure **stdout**, not **argv / agent-written
   command** cost.
4. Multi-agent isolation correctly requires explicit session in some modes,
   but the **single active-session fast path** must stay first-class and cheap.

This child hardens those gaps without reopening the whole kernel redesign.

## Product Priorities (ordered)

These four priorities are **joint constraints**. A change that wins one while
destroying another is a design bug.

| Priority | Meaning | Non-negotiable |
| --- | --- | --- |
| **P0 Extreme ease of use** | Agents discover and use the correct short command on the first try | One obvious happy path; few flags; defaults do the right thing |
| **P1 Extremely low latency** | Hot-path CLI returns before the agent context idles | Typical agent commands p50 **≤ 100 ms**, p95 **≤ 300 ms** on local warm host |
| **P2 Low write-token consumption** | Agents must not type giant CLIs | Prefer omit-able session, short aliases, positional task, collapsed steps |
| **P3 Very high reliability** | Short paths are as safe and deterministic as long paths | Same state transitions, same gates, same errors, no silent drift |

Secondary (still mandatory when relevant):

- **P4 Low forced read tokens**: default stdout stays compact; verbose is opt-in.
- **P5 File-first durability**: large detail lives in workbench files (F-06), not
  in agent tool payloads.

**Write tokens are worse than read tokens.** A long command string is authored
by the model on every lifecycle step and is often repeated after retries. Specs,
hints, docs, and benches must treat **command-input economy** as first-class,
not as a side effect of output compression.

## Canonical Agent Paths

### Single-session / active-session fast path (default for agents)

When a global active session, context bind, or `AFOL_SESSION` resolves:

```bash
afol st T-01
afol e T-01 -c "bun test" -o passed
# preferred collapse when verification is the only evidence:
afol d T-01 -x "bun test"
afol c
afol l -m "note"
afol s
```

Rules:

1. **Omit `--session` / `-S`** when resolution is unambiguous.
2. Prefer **positional task** (`T-01`) or `-T T-01` over long flag names when
   unambiguous.
3. Prefer **command aliases** (`st`, `e`, `d`, `c`, `n`, `l`, `qt`, `s`, `v`)
   for agent tool calls.
4. Prefer **`d -x "<cmd>"`** over separate `e` + `d` when one verification
   command is the closure evidence.
5. Prefer **`qt`** for true one-shot micro work instead of a five-step
   lifecycle.

### Explicit multi-session / CI path (safety path)

When CI mode, parallel agents, or ambiguous session context:

```bash
afol st -S <session-id> -T T-01
afol d -S <session-id> -T T-01 -x "bun test"
afol c -S <session-id>
```

Rules:

1. Explicit session is required when global fallback is disabled or unsafe.
2. Long flag names (`--session`, `--task-id`) remain valid and must keep
   semantic parity with short forms.
3. Reliability must not depend on agents remembering long session ids for the
   common single-session case.

### Human / audit path

Long command names and long flags remain valid for humans, reviews, and
handoffs. They must not be the **only** documented happy path for agents.

## Live Flag Contract (agent-relevant)

Align docs, hints, and tests to the **live** short-flag map for high-frequency
workbench commands (authoritative source: `cli/aliases.ts` + parsers):

| Short | Long | Notes |
| --- | --- | --- |
| `-S` | `--session` | Prefer omit on active-session fast path |
| `-T` | `--task-id` or `--task` | Domain-dependent; workbench start/done/evidence use task-id |
| `-c` | `--command` | Evidence / done / quick-task verification command |
| `-o` | `--result` | Evidence result; not `-r` on evidence today |
| `-x` | `--test` | Done: run verification + record evidence + complete |
| `-m` | `--message` | Log |
| `-F` | `--feature-id` | Governed new / quick-task |
| `-P` | `--parent-spec` | Governed new / quick-task |
| `-t` / `-T` | `--task` | New / quick-task task summary |
| `-j` | `--json` | Opt-in machine envelope |

Any intentional flag rename must update: registry help, alias table, parent
examples, this child, AGENTS short path, and workbench hints in the same change.

## Forced Output Budget (agents)

Default agent-facing commands must minimize **forced** context cost:

| Class | Target (est. tokens ≈ bytes/4) | Hard rule |
| --- | --- | --- |
| Hot status/lifecycle human compact | ≤ 200 | Prefer one-line or few-line success |
| Hot status JSON | ≤ 500 | Envelope only; no dump |
| Help root (`afol -h`) | ≤ 550 | Token-economy gate |
| Project validate human | ≤ 800 | Summary first |
| Project validate JSON | ≤ 3000 preferred; ≤ 5000 warn; ≤ 10000 fail | Existing project rule |
| Verbose / preview / full | opt-in only | Never default for agents |

Do **not** expand default stdout to “be more helpful.” Put detail behind
`--verbose`, `--full`, files, or targeted follow-up commands.

## Write-Token Budget (agents)

Measure the **shell command string** the agent must emit (argv text), not only
stdout.

The benchmark field `argv_chars` is the number of Unicode code points in the
trimmed authored `scenario.command` string (`Array.from(command.trim()).length`).
It excludes every `scenario.setup` command and does not count tokenized runtime
argv, wrapper expansion, or generated process arguments.

| Lifecycle shape | Target total argv chars (active session) | Notes |
| --- | --- | --- |
| start → done-with-test → close | ≤ 120 | e.g. `st T-01` + `d T-01 -x "…"` + `c` plus short cmd |
| start → evidence → done → close | ≤ 180 | avoid unless evidence needs extra metadata |
| micro one-shot | ≤ 120 | prefer `qt` when appropriate |

Regressions:

- Teaching or hinting the long form as the only next step is a **spec defect**.
- Requiring session id on every step when active session is unambiguous is a
  **spec defect**.
- Requiring both long evidence and long done when `d -x` is valid is a
  **usability defect**.

## Latency Budget (agents)

Local warm host, installed or repo CLI, non-pathological project:

| Command class | p50 | p95 |
| --- | ---: | ---: |
| `s` / `st` / `e` / `d` / `c` / `l` / `session list` | ≤ 100 ms | ≤ 300 ms |
| `v project` / compact validate | ≤ 250 ms | ≤ 500 ms |
| Micro pack of 7 CLI probes | ≤ 800 ms total | ≤ 1500 ms total |

Latency must not be “fixed” by dumping more work into agent context. Prefer
indexes, SQLite, and bounded scans (F-07 / state services).

## Reliability Contract

Short and long forms of the same operation must:

1. Resolve to the same canonical command and state transition.
2. Honor the same evidence, governance, and close gates.
3. Fail closed on ambiguous session or missing required proof.
4. Return actionable errors with a **short next command** on the appropriate
   path (fast path vs explicit path).
5. Never require manual edits of State Board / task files for routine lifecycle.

Reliability beats clever compression. If a shorter form is unsafe, keep the
longer form and document when it is required—do not invent silent shortcuts.

## Hints, Docs, And Training Surfaces

These surfaces must agree with this child:

| Surface | Requirement |
| --- | --- |
| Workbench `nextCommandHint` / `repairHint` | Prefer short active-session form; include `-S` only when session is not resolvable |
| `AGENTS.md` canonical commands | Lead with short agent path; long form as explicit multi-agent/CI variant |
| Runtime reference / standards | Same dual-path teaching |
| Skills that demonstrate lifecycle | Use short path in examples |
| Help errors | One short recoverable command, not a manual |

Contradiction between F-03 / this child and agent-facing docs is a **delivery
blocker** for related changes.

## Boundaries

In scope:

- Command grammar, aliases, flags, defaults, hints, docs alignment.
- Input and output token budgets for agent tool use.
- Latency budgets for agent hot path.
- Bench/validation gates that prove the above.
- Session resolution policy (active / bind / env / explicit / CI).

Out of scope:

- Changing governance semantics of evidence-required done.
- Removing multi-agent session isolation.
- Live-agent total model spend budgets (separate from CLI argv/stdout).
- MCP-only redesign (must still share the same short semantic surface).

## Acceptance

- [x] Parent F-03 examples and flag tables match live CLI or explicitly mark
      historical examples as superseded by this child.
- [x] Active-session lifecycle works without repeating session id:
      `st T-01`, `d T-01 -x "…"`, `c`.
- [x] Explicit-session lifecycle still works for CI/multi-agent.
- [x] Hints after `new` / `start` / `evidence` / `done` suggest the short form
      when session context is known.
- [x] `AGENTS.md` and runtime reference lead with the short agent path.
- [x] Token-economy validation covers **output** and records **input argv**
      targets for lifecycle scenarios (or a dedicated pack section).
- [x] Hot-path latency stays within the latency budget table on local warm host.
- [x] No high-frequency agent command defaults to verbose/full output.
- [x] Alias/flag snapshot tests fail on silent drift of agent-critical shorts.

## Closure

The residual child is final on `E-20260715181045803-75a16e` from
`.afol/wb/260715_1628_afol-1-0-agent-cli-residual/`, with the reconciled status
recorded by `260715_1811_afol-1-0-final-status`. Full tests were observed at
`1203/0`; no remote CI or unsupported platform claim is implied.

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Short path used in multi-agent CI causes wrong session | Keep CI fallback disabled; force explicit `-S` when ambiguous |
| Docs teach long form “for clarity” and re-train agents | Dual-path docs; hints use short form; gate examples in reviews |
| Collapsed `d -x` hides failed tests | Fail closed: non-zero test prevents done; evidence records failure |
| Over-aggressive defaults omit required governance | Unbound/scratch still requires explicit waiver reason; governed new still needs feature/spec |

## Implementation Notes (non-binding order)

1. Align hints to short path.
2. Align AGENTS / standards examples.
3. Fix parent F-03 drift tables.
4. Add input-argv metrics to token-economy or cli-kernel scenarios.
5. Keep latency gates tight on hot path; do not relax to hide index work.

## Review Questions

- Can a new agent complete start → verify → done → close without ever typing a
  40-character session id when one active session exists?
- Does every failure message teach the cheap recovery command?
- Is any default agent command still forcing multi-kilobyte stdout?
- Do short and long forms still share one state machine?
