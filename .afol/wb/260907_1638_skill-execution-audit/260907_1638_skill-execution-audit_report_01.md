# AFOL Project Skill Audit

## Decision

The 20 installed project-local skills are not uniformly validated. Nine pass the Universal Skills directory validator; eleven fail, with 62 reported errors. The stricter catalog preflight reports 42 metadata errors and stops before comparing mirrors. These are different validators and counts, not conflicting results.

Executable trials found defects in several examples and a diagnostic helper. Other proposed changes did not improve the tested outcome and are not recommended. All original skill files remain unchanged. Supported candidates below are review findings, not adopted or installed skill revisions.

## Scope and evidence boundaries

- Reviewed all 20 `.agents/skills/*/SKILL.md` entrypoints, relevant executable/reference material, and existing evaluation records. Recorded hashes for 103 skill files.
- Source checkout: `dev`, `b058a724ca6ebb913e11d8b04cce654aeac844af`. At initial inspection, guidance pointed to the absent `afol.public` checkout. A concurrent edit later corrected that path to `/home/ozy/01_projects/dev/afol.public-root`, which was verified to exist. Tests in this audit still concern the private checkout and isolated fixtures; no public-engine or release proof is claimed.
- Tools exercised: Bun 1.4.2, Node 26.8.1, TypeScript 7.0.2, MCP SDK 1.29.0. The SDK was reused from an existing sibling installation. AFOL global version was `0.1.0-alpha.1`, SHA-256 `e2e83e2bd5bbe9871771c7ac1b484e7a3fe68e8e9fde3c4f39c904ceda2a1d38`. Some AFOL fixture journeys use the repo-local `./afol`; their provenance is detailed in the AFOL evidence report.
- Project RAG identity `afol-dev` matched this checkout but verification reported `PROJECT_INDEX_STALE`: 233 stale files and one missing tracked file. Its include roots also exclude `.agents` and hidden administration. No indexed result was used as proof; no index was repaired.
- Seven skills have evaluation files: the six AFOL/benchmark skills have four cases each and their latest learning records remain `inconclusive`; `mcp-builder` has 28 manual evaluation prompts without execution results. Thirteen skills have no bundled eval files. Absence of bundled results does not prove they were never tested elsewhere.

## Per-skill assessment

Paths in this table are relative to `.agents/skills/`. “Pass” means only the stated checks passed. “Not exercised” is not an endorsement of execution quality.

| Skill | Universal directory contract | Execution evidence and decision |
| --- | --- | --- |
| `afol-integration-test` | Pass | Disposable lifecycle and synthetic receipt admission/duplicate/invalid-input paths exercised. Telemetry identity wording at `SKILL.md:85` is ambiguous; changing it remains unproven as an agent improvement. |
| `afol-library` | Pass | Health, dry-run review, list, and disposable proposal paths passed. No supported command defect found. |
| `afol-maintenance` | Pass | Weekly/monthly plans and area dry-runs passed. Actual archival, pruning, and rotation were not exercised. |
| `afol-memory` | Pass | Health, dry-run review, list, and disposable proposal paths passed. No supported command defect found. |
| `afol-rules` | Pass | Rule/context checks passed. `SKILL.md:72` runs template generation in a validation section; a `--check` candidate avoids the observed write. Full skill behavior comparison remains incomplete. |
| `agentic-benchmarking` | Pass | Local benchmark-catalog validation passed. External harness/model execution, latency, and token claims remain unverified. |
| `bun-development` | Fail: 3 metadata errors | Resolver, password verification, compatibility globals, and Node-target build passed. Published speed/compatibility generalizations were not benchmarked or endorsed. |
| `bun-runtime` | Fail: 3 metadata errors | Both documented/tested `--env-file` placements worked; shell environment precedence passed. No command-order change supported. |
| `node` | Fail: 3 metadata errors | Native TypeScript and `node:test` paths passed. `rules/graceful-shutdown.md:122` mixes undeclared web `Request`/`Response` types with Express methods; the native-Response case fails. A native fetch-handler candidate passed 200/503 checks; it is not an Express replacement. |
| `javascript-testing-patterns` | Fail: 4 errors | `SKILL.md:409` uses a valid Vitest API, `vi.mocked`, which fails through Bun's compatibility runner. Equivalent `bun:test` behavior passed. Select the actual project runner before applying the example. Undeclared `User`/`CreateUserDTO` are an illustrative-code completeness issue. |
| `javascript-typescript-jest` | Fail: 3 metadata errors | Jest is absent in this checkout. A Bun run cannot validate Jest globals. Actual Jest behavior remains unverified; no replacement or installation is recommended from this result. |
| `modern-javascript-patterns` | Fail: 4 errors | `SKILL.md:221` drops `0` and `false`; `SKILL.md:411` retains a timer after early settlement. Narrow candidates passed the tested value and process-lifetime cases. |
| `typescript-advanced-types` | Fail: 3 metadata errors | API endpoint constraints (`SKILL.md:326`), builder state (`:385`), and inconsistent form keys (`:525`) fail strict TypeScript compilation. Candidate snippets passed positive and negative type checks. |
| `typescript-expert` | Fail: 4 errors | `scripts/ts_diagnostic.py:42` rejects valid JSONC; `:13` discards subprocess status and `:137` relies on truncated text. TypeScript's own configuration parser and explicit exit handling are supported corrective directions. |
| `mutation-testing-guardian` | Pass | Workflow inspected; no mutation campaign executed. Its frozen behavioral case was not completed. No claim of measured mutation effectiveness. |
| `reducao-segura-complexidade-ciclomatica` | Pass | Workflow inspected; no refactor/metric trial executed. Its frozen behavioral case was not completed. No claim of measured complexity reduction. |
| `ux-design` | Pass | Flow/state/recovery guidance inspected; no user/browser or complete agent UX evaluation executed. Optional companion skills were unavailable. No measured UX improvement is claimed. |
| `mcp-builder` | Fail: 29 errors | One fresh agent selected the current skill and implemented the raw-SDK task successfully. A separately routed candidate also passed the same eight checks; no functional improvement from changing routing was demonstrated. The `mcp-use` framework/CLI itself was not exercised. |
| `mcp-cli` | Fail: 3 metadata errors | The exact filename pipeline at `SKILL.md:62` passed 3/6 cases; separated arguments plus JSON serialization passed 6/6. A controlled CLI fixture tested argument handling. The actual `mcp-cli` executable was unavailable, so external transport is unverified. |
| `typescript-mcp-server-generator` | Fail: 3 metadata errors | Real SDK tool/resource/prompt/error journeys passed 8/8 with each Zod API tested. Scaffold installation, HTTP listeners, Inspector, and production deployment were not exercised. |

## Hypotheses and observed outcomes

### Supported within the tested scope

1. **Preserve filenames when calling MCP tools.** The exact `xargs ... sh -c` example fails for double quotes, single quotes, and backslashes. It passes simple, spaced, and Unicode names. A candidate that parses the search result, constructs JSON, and passes separate arguments passes all six cases, including the four reserved additional cases. This demonstrates an argument-handling improvement, not a live MCP service result. Evidence: `mcp-cases.json`, `mcp-tests.ts`, `mcp-results.json`.
2. **Preserve falsy interpolated values.** Replacing `values[i] || ""` with `values[i] ?? ""` preserves `0` and `false`. Null, undefined, empty-string, and NaN checks establish the candidate's tested boundary. This is a narrow value-preservation fix, not certification of the entire tagged-template example.
3. **Release completed timeout handles.** With an 80 ms timeout and an immediately resolved promise, the baseline returns promptly but keeps the process alive until approximately 81 ms. A `finally`/`clearTimeout` candidate exits promptly. This is one local mechanism test, not a statistical performance benchmark or proof that the wrapped operation is cancelled.
4. **Correct the TypeScript examples.** A response-bearing endpoint constraint, consistent `password` field, and `Partial<T>` builder state remove the reproduced strict-compiler errors while preserving the tested invalid-method/body, unknown-key, and incomplete-builder rejections. Candidate files and commands are in the language evidence report.
5. **Use the real project test runner.** The Bun/Vitest compatibility layer accepts a simple import but does not supply the tested `vi.mocked` behavior. The equivalent Bun-native test passes two public-behavior cases. This supports an early runner check, not rewriting correct Vitest examples for every project.
6. **Parse TypeScript configuration with TypeScript.** The diagnostic helper reports `Invalid JSON` for valid commented configuration. `tsc --showConfig` accepts that configuration and rejects an invalid option. The helper also loses process status and truncates compiler output. The parser/exit-code primitives were tested; a fully revised helper still needs an end-to-end regression before adoption.
7. **Keep validation nonmutating.** The AFOL rule skill's unqualified generator invocation writes/formats its generated target even when bytes are unchanged. A parent-controlled paired trial ran `--check`, generation, and `--check` again in the same disposable source copy: all exited zero, bytes stayed equal, and only generation changed mtime. Evidence: `template-paired-results.json`. This supports the command-level candidate; complete fresh-agent regression/held-out evaluation of the skill remains outstanding.

### Partially supported or not supported

- **“Metadata alone makes all skills compliant.” — disproved.** Metadata-only candidate copies preserve every Markdown body byte-for-byte and improve the directory result from 9/20 to 19/20; the stricter metadata gate improves from 42 errors to zero. Adding frontmatter exposes two further `mcp-builder` reference-length failures, so `metadata-trial.ts` intentionally retains its failed all-20 assertion and exits 1. Candidate version/provider fields are test data, not approved release metadata.
- **“Add `./` to fix navigation.” — not supported.** All 79 relative links in entrypoints resolve. Sixty variants with and without the prefix resolve to the same destination. A formatting warning does not demonstrate a broken execution path.
- **“The Bun env-file argument order is broken.” — disproved locally.** Both placements and the environment-precedence case pass on Bun 1.4.2.
- **“Zod 3 must be replaced for SDK compatibility.” — disproved locally.** The installed SDK passes 8/8 journeys using the Zod 3 compatibility API and 8/8 using Zod 4. The [official SDK v1 documentation](https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x#installation) also documents support for the two APIs. These tests used Zod 4.4.3's `zod/v3` export, not a separate fresh Zod 3 package installation.
- **“An early raw-SDK route improves this agent task.” — no gain demonstrated.** A fresh baseline agent autonomously read the installed MCP skill; a fresh candidate agent was explicitly routed to the modified copy. Both implementations passed the same eight independent assertions and preserved dependencies. This is one positive native-selection observation and one explicit-behavior comparison, not catalog-wide accuracy or a complete routing holdout. Evidence: `native-a`, `native-b`, `native-results.json`.
- **“Changing integration telemetry labels prevents execution failure.” — inconclusive.** A synthetic receipt with distinct external run and AFOL session identifiers was accepted and a duplicate was idempotent. That proves the values can remain distinct. It does not show that the existing text caused an agent failure or that the candidate prevented one. Text-marker assertions alone were excluded as behavioral proof.

## Checks and evidence

- AFOL-focused unit suite: **345 passed, zero failed**, across ten files; see [AFOL audit evidence](/home/ozy/01_projects/dev/afol/afol.dev/.tmp/skill-audit-20260907/afol/audit-report.md) and its provenance qualifications.
- Help tests: **32 passed**. Project `bun run typecheck`: passed. These execute the private checkout's current tests, not a public release gate.
- AFOL read-only and synthetic lifecycle/receipt journeys: outcomes, command origins, and evidence limitations are recorded in the AFOL report. No real library or continuity content was changed by those trials.
- Universal `validateSkillTarget`: **exit 1**, 9/20 passing, 62 errors. The sync preflight: **exit 1**, 42 metadata errors; mirror equality was not reached.
- Metadata experiment: **exit 1**, 19/20 directory checks passing; independent strict metadata contract: **exit 0**. The remaining two errors are retained, not waived.
- `bun .tmp/skill-audit-20260907/mcp-tests.ts`: passed, retaining the expected 3/6 baseline versus 6/6 candidate distinction and 16 successful SDK cases.
- `bun .tmp/skill-audit-20260907/native-verify.ts`: passed, eight checks for each independently produced implementation.
- [Language/engineering evidence](/home/ozy/01_projects/dev/afol/afol.dev/.tmp/skill-audit-20260907/language/report.md) contains the eleven-skill table, source anchors, candidate snippets, compiler failures, and validation commands. Its “adopt” wording identifies a suggested code direction; this parent report governs the actual disposition: no skill revision was adopted or applied.

Scratch code and larger raw outputs live under `.tmp/skill-audit-20260907/`; they are local audit evidence, not committed fixtures. Failed setup probes were excluded from skill verdicts: the inventory initially included a journal directory, an eval README was initially parsed as JSON, and a disposable lifecycle probe used an AFOL-rejected no-op. These harness mistakes were corrected before the corresponding results were counted.

One delegated read-only launcher temporarily wrote JSON outputs under `/tmp` and removed them. That was an evaluator workflow deviation from the required `/home/ozy` scratch boundary, not a target-skill result. Its 15 exit codes and before/after tree hashes survive in the reconciled provenance note, but those original JSON files do not. All retained audit artifacts are under `/home/ozy`.

## Delivery and remaining proof

This audit changed no skill source, installed global copy, dependency set, harness authorization, service, release artifact, commit, or remote. Existing and newly observed concurrent edits were preserved. This audit's changes are limited to disposable experiments and its AFOL workbench/governance state.

The supported example/command corrections are concrete candidates for a subsequent skill revision. Adoption still requires the applicable complete frozen/held-out skill checks and Universal validation in the owning source. No broad metadata, routing, provider, mutation, complexity, UX, or performance effectiveness is inferred from the narrower results above. The six historical AFOL evaluation outcomes remain inconclusive.

Method and authority: `writing-skills`, `skill-evolution`, `universal-skills-system`, RULE-006, RULE-002, and RULE-004; `evandro-rag-system` for the read-only identity/freshness check; relevant audited domain skills and official SDK documentation for implementation details. No synchronization or installation was performed.

## AFOL completion evidence

Session `260907_1638_skill-execution-audit` is closed; task `T-01` is done. The observed verification command was `bun .tmp/skill-audit-20260907/final-check.ts`, exit 0, authorizing evidence `E-20260907172002909-304c9a`. The command rechecked the original skill hashes and replayed the MCP argument/SDK and independently produced implementation checks. It does not override the explicitly failed structural diagnostics above.

Scoped `afol verify-tasks .afol/wb/260907_1638_skill-execution-audit --strict` passed with one completed task. The final report contains all 20 skill rows, its local links exist, and the final hash comparison found no changes to the 103 original skill files.
