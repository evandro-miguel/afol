---
doc_type: spec-child
id: 260728_2359_session-resolution-reliability_spec-child_01
theme: session-resolution-reliability
status: final
closure_note: "Delivered on dev (2026-07-29): invalid implicit context falls through safely; new and session switch repair malformed generated context when a Git context exists; session list remains diagnostic when bindings are corrupt; close unbinds after durable commit; verification output is checkout-path independent; all workbench release scenarios use one compiled artifact and context-only fixtures. Public workbench-parity passed 10/10 with 20 measured samples, zero errors/retries, short-path p50 53-80 ms and p95 62-91 ms; full suite 1781/0; two independent critics PASS."
owners:
- orchestrator
workstream_intent: Restore one reliable low-token session target across AFOL agent-facing commands.
artifact_purpose: Govern the stale-binding repair and prove session selection, recovery, latency, and token economy.
created_at: '2026-07-28T23:59:40-05:00'
updated_at: '2026-07-28T23:59:40-05:00'
roadmap_feature: F-20
spec_role: child
parent_spec: 260426_1215_parallel-session-isolation_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  parent: .afol/adm/specs/260426_1215_parallel-session-isolation_spec_01.md
  related:
  - .afol/adm/specs/260712_agent-cli-extreme-ease-latency-write-tokens_spec-child_01.md
  - .afol/adm/specs/260521_0030_agent-command-design-system_spec_01.md
risk_level: high
---

# SPEC CHILD: session resolution reliability

## Intent

- Outcome: one implicit session resolution contract selects the same usable
  session for orientation, lifecycle mutation, state, and recovery commands.
- Roadmap feature: `F-20`.
- Parent spec: `260426_1215_parallel-session-isolation_spec_01`.
- Cross-contract: preserve the F-03 short write path, latency targets, compact
  output, explicit multi-agent targeting, and fail-closed evidence semantics.

## Child Scope Rationale

- The delivered F-20 resolver can select a closed or missing context binding
  before a newer global active session.
- `afol new` updates the global pointer without selecting the new session in
  the current branch/worktree context.
- Some agent-facing readers use the global pointer directly while lifecycle
  mutations use the context-aware resolver, so orientation and mutation can
  target different sessions.
- This is a bounded reliability residual. It does not reopen the broader F-20
  concurrency design or replace explicit `-S` targeting for parallel agents.

## User or Operator Journey

1. An agent creates a governed session with `afol n`.
2. The new session becomes the effective branch/worktree session unless an
   explicit flag or `AFOL_SESSION` intentionally overrides it.
3. `afol s`, `afol st T-01`, `afol d T-01 -x "..."`, and `afol c` target the
   same usable session without repeated session identifiers.
4. Closing the session clears matching implicit selectors after the durable
   close commit.
5. If stale state or auxiliary cleanup remains, `afol ss list` identifies raw
   and effective selection and gives one cheap recovery action.

## Resolution Contract

1. Precedence remains explicit flag, `AFOL_SESSION`, context binding, guarded
   global fallback.
2. Explicit flag and environment selections remain explicit even when invalid,
   so the requested target fails clearly instead of silently changing.
3. Context and global selections are implicit and must point to an existing,
   structurally valid, open session.
4. Invalid context falls through to a valid global only when global fallback is
   allowed. CI never gains global fallback through this repair.
5. Resolution reads do not prune or rewrite mutable context.
6. `afol new` is create-and-select for the current context. A post-commit bind
   failure is reported as a durable creation warning with an exact repair
   command; it must not encourage a duplicate `new` retry.
7. Close cleanup is idempotent, occurs only after durable close, and cannot
   roll back an already committed close.

## Boundaries

- In scope:
  - session resolver validity and diagnostics;
  - `new` context selection and `close` context cleanup;
  - agent-facing implicit-session consumer alignment;
  - raw versus effective session visibility;
  - focused concurrency, recovery, argv, stdout, and warm latency tests.
- Out of scope:
  - replacing worktrees or explicit multi-agent targeting;
  - timestamp-based ownership arbitration;
  - changing evidence, governance, or task state semantics;
  - promoting `main`, installing the global binary, or deploying.

## Risks and Mitigations

- Extra lifecycle reads increase latency -> reuse canonical lifecycle state
  parsing and enforce before/after p50 and p95 evidence.
- Create succeeds but context binding fails -> preserve the durable session,
  emit one repair command, and test no duplicate creation.
- Cleanup coupling creates import cycles -> keep orchestration above lifecycle
  or extract dependency-neutral session primitives first.
- Consumer migration changes deliberate global guards -> inventory and classify
  each direct global-pointer reader before editing.
- Same-worktree parallel creation reorders selectors -> serialize
  create-and-select and keep explicit `-S` as the parallel contract.

## Acceptance

- [x] A closed, missing, or corrupt context never becomes an implicit mutation
      target.
- [x] A closed, missing, or corrupt global pointer never becomes an implicit
      mutation target.
- [x] Open explicit, environment, context, and global precedence remains
      deterministic, with CI global fallback still disabled.
- [x] `new -> status -> start -> done-with-test -> close` uses one session
      without `-S` in the single-context path.
- [x] `new` replaces an older open binding in the same branch/worktree.
- [x] A failed close preserves selectors; durable or idempotent close removes
      matching selectors without affecting another session.
- [x] `session list` exposes raw binding state, ignored reason, effective
      session, and source without noisy default output, and remains diagnostic
      when the context file is malformed.
- [x] Agent-facing implicit consumers are either routed through the canonical
      resolver or documented and tested as deliberate global-pointer guards.
- [x] Focused RED reproductions became GREEN and the full suite remains green.
- [x] Warm measurements use enough samples for p50/p95 and show no material
      regression in lifecycle latency.
- [x] The canonical active-session lifecycle remains within the F-03 argv and
      default output budgets.
- [x] An independent skeptical critic returned PASS after checking every
      acceptance item, regression surface, and validation artifact.

## Delivery Evidence

- `./dist/afol v bench --pack workbench-parity --json`: 10/10 pass, 20
  samples plus one warmup per scenario, zero errors and zero retries.
- Context-only short path: start 53/62 ms, done 80/91 ms, close 69/77 ms
  (p50/p95); argv 12/24/6 characters; output about 5/16/8 tokens.
- Eight sequential verifications: 155/182 ms, 163 argv characters, about 23
  output tokens.
- `verify-tasks`: path-independent session label, 37/43 ms p50/p95, about 34
  output tokens in the compiled benchmark.
- `bun test --only-failures`: 1781 pass, 0 fail, 11878 assertions.
- `validate:toolchain`, typecheck, template/manifest parity, deterministic
  build/smokes, and `validate:security:release`: pass.
- Two independent `critic-codex-xhigh` reviews: PASS after the post-commit
  findings were remediated.

---

*Template: `docs/templates/spec-child.md`*
