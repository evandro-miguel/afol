# AGENTS.md

## Project Goal

- Goal: <describe the product, system, or repository purpose>.
- Primary users: <describe who this project serves>.
- Success criteria: <describe the observable outcome that means the work is correct>.
- Current constraints: <describe important technical, security, operational, or delivery constraints>.

Keep this section project-specific. Update it before significant work starts.

## Agent Operating Contract

- Contribute to a correct, minimal, tested, well-evidenced, and context-efficient delivery.
- Prefer truth over fluency, evidence over guesswork, reuse over reinvention, minimal delta over broad changes, focused context over broad context, and executable validation over model opinion.
- Do not fabricate facts, code behavior, file contents, test results, tool outputs, source quality, or repository state.
- Do not silently assume unclear requirements when the ambiguity materially affects correctness, architecture, scope, contracts, security, or data.
- Do not create speculative features, expand scope silently, or perform unrelated repo-wide cleanup.
- Do not mark work as done without evidence.

## Context Discipline

- Start narrow.
- Read, search, and inspect only what is needed for the current task.
- Prefer symbol search, grep, index search, file tree checks, and targeted reads before broad reads.
- Before opening more files or sources, summarize what is already known in 3 to 7 lines.
- Stop gathering context when additional context is unlikely to change the decision.
- Pass compressed handoffs, not raw dumps.
- Prefer structured summaries over long prose.

## Evidence Rules

Prefer deterministic evidence over model judgment whenever possible.

Evidence priority:

1. Reproducible tests or deterministic repro
2. Lint, typecheck, build, schema checks, static checks
3. Focused runtime validation
4. Visual or observable confirmation
5. Model critique

Use model critique to find problems and improvement opportunities. Do not use it as final proof when executable checks are available.

## Testing and Quality

- Strong default target: at least 80% of touched logic should be covered by meaningful tests or equivalent high-confidence validation when practical and measurable.
- Coverage is not a substitute for meaningful assertions.
- Always look for existing tests before writing new ones.
- Prefer focused tests close to the changed behavior.
- If tests cannot be added or run, explain exactly why and provide the strongest substitute validation available.
- Leave the touched scope cleaner, more coherent, and easier to verify than before.

## Project Structure

```text
<project-root>/
|-- AGENTS.md                 # Agent operating contract for this project
|-- Justfile                  # Wrapper that delegates to docs/standards/Justfile
|-- docs/
|   |-- arc/                  # Goal-state governance: roadmap, specs, decisions
|   |   |-- GENERAL-ROADMAP.md
|   |   |-- SPECS/
|   |   `-- DECISIONS/
|   |-- map/                  # Current-state maps and analysis evidence
|   |   `-- structure/
|   |-- standards/            # Human-readable standards and command references
|   |-- templates/            # Reusable document starters only
|   |-- lessons/              # Lessons learned and prevention rules
|   |-- knowledge/            # Repo-local knowledge index and notes
|   |-- patterns/             # Proven patterns and anti-patterns
|   |-- telemetry/            # Telemetry docs and dashboards
|   `-- agentic/              # Tool and runtime documentation
|-- .agents/
|   |-- agents                # CLI wrapper
|   |-- agents.config         # Central scaffold config
|   |-- tools.json            # Tool catalog
|   |-- rules/                # Mandatory agent rules
|   |-- scripts/              # Automation scripts and shared helpers
|   |-- runtime/              # Runtime package and MCP surfaces
|   |-- skills/               # Project-local skills
|   |-- source/               # Repo-local universal-skills source seed
|   |-- wb/                   # Active workbench sessions
|   |-- tmp/                  # Disposable workspace
|   |-- data/                 # Schemas and runtime data
|   `-- z-arq/                # Archived work and notes
`-- .claude/                  # Claude adapter
```

## Documentation Boundaries

- `docs/arc/` is prescriptive goal-state governance.
- `docs/map/` is descriptive current-state evidence.
- `docs/templates/` is the only location for reusable document starters.
- `.agents/` is for agent-system surfaces: rules, workbench state, skills, telemetry, adapters, runtime automation, and disposable state.
- Do not put runtime state, caches, generated operational artifacts, or workbench sessions under `docs/`.
- Do not put roadmap entries, specs, ADRs, or product intent under `docs/map/`.

## Mandatory Rules

Read `.agents/rules/README.md` first when rule coverage is unclear.

- `.agents/rules/RULE-001-tool-discovery.md`: use before relying on unfamiliar tools or wrappers.
- `.agents/rules/RULE-002-workstream-creation.md`: use before creating or updating workbench sessions.
- `.agents/rules/RULE-003-documentation-standards.md`: use before adding or editing managed Markdown docs.
- `.agents/rules/RULE-004-validation-linting.md`: use before marking work complete.
- `.agents/rules/RULE-005-folder-structure.md`: use when adding, moving, or validating project folders.

Agents must follow the applicable rule file, not only this summary.

## Workbench

- Use `.agents/wb/` for active sessions.
- Keep one session folder per workstream.
- Require frontmatter on workbench Markdown files.
- Track plan, task, log, report, and postmortem artifacts where applicable.
- Use `./.agents/agents wb-update ...` for managed timestamps, task state, links, file lists, and evidence when available.

## Reuse and Minimality

- First search for an existing pattern, helper, module, test, or documentation that can be reused.
- Prefer deletion, simplification, consolidation, or reuse before adding new code.
- Prefer the smallest correct change that satisfies the requirement.
- If a task is too broad, reduce it to the smallest executable slice and state the remaining slices clearly.

## Cleanliness

- Clean what you touch.
- Remove orphaned imports, dead branches, duplicated snippets introduced by the current work, stale comments caused by the change, and local inconsistencies in the touched scope.
- Do not perform unrelated cleanup unless it blocks correctness, validation, or safe delivery.

## Escalation

- After 2 failed attempts on the same issue, change strategy.
- After 3 materially different strategies without meaningful progress, escalate.
- Escalate early if the blocker is caused by missing access, contradictory requirements, broken tooling, external dependency failure, or systemic ambiguity.
- Escalation must state: current objective, observed evidence, strategies attempted, suspected root cause, and minimum next action needed.

## Communication

- Be concise.
- Lead with the answer, finding, or verdict.
- Separate facts, inferences, risks, and unknowns.
- Prefer compact structured output.
- Avoid long narrative unless it adds decision value.

## Verification

- Verify behavior before marking work done.
- Keep lint and test commands explicit in repo docs.
- Run the narrowest meaningful checks first, then broader checks when the change affects shared behavior.
- If checks cannot run, explain why and provide the strongest substitute evidence available.

## Language

- Write repository artifacts in English by default.
- Use another language only when explicitly requested.
