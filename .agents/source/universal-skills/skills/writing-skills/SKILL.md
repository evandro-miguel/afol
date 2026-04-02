---
name: writing-skills
description: Use when creating, updating, or standardizing agent skills with tier-based architecture and quality gates. Use this skill whenever the user mentions skills, agents, prompts, or wants to create, update, or improve agent capabilities.
metadata:
  category: meta
  tags: "skill-writing, meta-skill, standards, automation"
  triggers: "new skill, create skill, update skill, skill template, standardize skill, tier 1, tier 2, tier 3, agent, prompt engineering, skill evaluation"
  references: "standards, cso, anti-rationalization, testing, templates, tier-1-simple, tier-2-expanded, tier-3-platform, schemas"
---
# Writing Skills

Dispatcher for skill creation, maintenance, and evaluation with a strict tier-based workflow and comprehensive testing capabilities.

## Mandatory Contract

- Every `.md` file must include YAML frontmatter.
- `SKILL.md` must use `name`, `description`, and `metadata`.
- `metadata.tags`, `metadata.triggers`, and `metadata.references` use CSV strings.
- `description` must be single-line and should start with `Use when`.
- Do not use YAML multiline syntax (`>-`, `|-`).
- Script examples and scaffolds must be Bun-first (`bun <script>`), not `node <script>`.
- Do not document static "preferred model" lists for agents; use dynamic discovery via `opencode models`.
- Before creating or modifying skills, the universal mirror must be in sync:
```bash
bun .agents/skills/writing-skills/scripts/check-universal-skills-sync.js
```

See [Standards](./references/standards/README.md) for the canonical contract.

---

## Creating a Skill

### 1. Capture Intent

Ask clarifying questions to understand what the skill should do:

- **Purpose**: What should this skill enable the agent to do?
- **Triggers**: When should it activate? What phrases or contexts from the user?
- **Output**: What format of output is expected?
- **Test cases**: Does the skill have objectively verifiable outputs?

**Test case suitability:**
- Skills with transforms, data extraction, or code generation benefit from test cases.
- Skills with subjective outputs (writing style, creativity) generally don't need them.

### 2. Interview and Research

Gather comprehensive requirements before writing:

- Edge cases and input/output formats
- Success criteria and dependencies
- Check available MCPs/tools for parallel research
- Come prepared with context to reduce burden on the user

Research existing patterns:
```bash
# Check for overlap with existing skills
bun skills/writing-skills/scripts/skill-advisor.js candidate --name my-skill --tier 2
```

### 3. Write the SKILL.md

Structure the skill with these components:

| Field | Purpose |
|-------|---------|
| `name` | Skill identifier (matches folder name) |
| `description` | PRIMARY TRIGGERING MECHANISM - see CSO guidance below |
| `metadata.tags` | Categories for filtering |
| `metadata.triggers` | Phrases that should activate the skill |
| `metadata.references` | Linked reference files |

**Description writing (CRITICAL):**

Agents tend to "undertrigger" - they won't use a skill even when relevant. Make descriptions "pushy":

| Bad | Good |
|-----|------|
| "How to build dashboards" | "Use when building dashboards. Activate this skill whenever the user mentions dashboards, data visualization, metrics display, or company data presentation." |
| "Guide for testing" | "Use when writing tests. Invoke for unit tests, integration tests, E2E tests, test fixtures, or any testing-related work." |

### 4. Progressive Disclosure

Structure content in three levels:

| Level | Content | Size Limit |
|-------|---------|------------|
| Metadata | name + description | ~100 words, always in context |
| SKILL.md body | Core instructions | 250-800 lines ideal |
| Bundled resources | Detailed references | Unlimited, on demand |

**Key patterns:**
- Keep SKILL.md between 250-800 lines; if approaching 800, add hierarchy
- Files ≥800 lines must migrate to Tier 2 structure
- Prefer splitting into smaller files over summarizing content
- Use reference files with guidance on when to read them
- For files over 300 lines, include a table of contents

### 5. Pick a Tier

| Tier | Use When | Structure | Size |
|------|----------|-----------|------|
| **Tier 1** | Single concept, lightweight, frequently loaded | Single SKILL.md with optional examples.md | <800 lines |
| **Tier 2** | Multi-concept OR ≥800 lines | SKILL.md + references/ directory | 800+ lines total |
| **Tier 3** | Platform-level with many products/services | SKILL.md + products/ with 5-file structure per product | Unlimited |

**Important:** If your skill reaches 800 lines, migrate to Tier 2 instead of summarizing. Split content into focused reference files.

See tier guides: [Tier 1](./references/tier-1-simple/README.md) | [Tier 2](./references/tier-2-expanded/README.md) | [Tier 3](./references/tier-3-platform/README.md)

### 6. Scaffold the Skill

```bash
# Tier 1
bun skills/writing-skills/scripts/create-skill.js --name my-skill --tier 1 --type technique

# Tier 2
bun skills/writing-skills/scripts/create-skill.js --name my-skill --tier 2

# Tier 3
bun skills/writing-skills/scripts/create-skill.js --name my-platform --tier 3 --products core,api,data
```

Creation flags:
- `--advice warn` (default): show merge/combine suggestions
- `--advice enforce`: block creation on high duplicate risk
- `--advice off`: skip advisor

---

## Test Cases

After writing a draft, create 2-3 realistic test prompts. Save to `evals/evals.json`:

```json
{
  "skill_name": "example-skill",
  "evals": [
    {
      "id": 1,
      "prompt": "User's task prompt that should trigger the skill",
      "expected_output": "Description of expected result",
      "files": [],
      "expectations": [
        "The output includes X",
        "The skill used script Y",
        "The result follows format Z"
      ],
      "should_trigger": true
    },
    {
      "id": 2,
      "prompt": "A prompt that should NOT trigger this skill",
      "expected_output": "Response without using this skill",
      "should_trigger": false
    }
  ]
}
```

**Process:**
1. Write prompts first, don't write assertions yet
2. Run evaluation with `run_eval.py`
3. Draft assertions while runs are in progress
4. Review results and refine

See [Schemas](./references/schemas.md) for complete JSON schema definitions.

---

## Iteration Loop

Systematic improvement workflow:

```
┌─────────────────────────────────────────┐
│  1. Apply improvements to the skill     │
│  2. Rerun all test cases               │
│  3. Launch reviewer with --previous     │
│  4. Wait for user review               │
│  5. Read feedback, improve again        │
└─────────────────────────────────────────┘
                   │
                   ▼
         Keep going until:
         • User says they're happy
         • Feedback is all empty (looks good)
         • Not making meaningful progress
```

### Automated Description Optimization

Use the improvement loop for description tuning:

```bash
cd skills/writing-skills
python scripts/run_loop.py \
  --eval-set evals/evals.json \
  --skill-path ../my-skill/SKILL.md \
  --max-iterations 10 \
  --holdout 0.4
```

**How it works:**
1. Splits eval set into train (60%) and test (40%)
2. Evaluates current description on all queries
3. If not all pass and iterations remain, uses AI to improve
4. Tracks history and returns best by TEST score (prevents overfitting)

---

## Writing Style

### Principles

- **Imperative form** in instructions: "Create the file" not "You should create the file"
- **Explain the WHY** instead of heavy MUSTs: "Use early returns to reduce nesting" instead of "You MUST use early returns"
- **Theory of mind**: Make skills general, not super-narrow to one specific case
- **Draft, then improve**: Write a first pass, then review with fresh eyes

### Anti-Patterns to Avoid

| Anti-Pattern | Fix |
|--------------|-----|
| Overfitting to examples | Branch out, use different metaphors |
| Bloated prompts | Remove things not pulling their weight |
| Repeated manual work in runs | Bundle helper scripts into the skill |
| Overly narrow triggers | Think about the user's intent, not just keywords |

### Keep Prompts Lean

Read transcripts to see if the skill makes the model waste time on unproductive things. If the skill has 10 instructions but only 3 are consistently used, consider trimming.

### Look for Repeated Work

If all 3 test cases resulted in writing similar helper scripts, that's a strong signal the skill should bundle that script.

---

## Evaluating Skills

### Using run_eval.py

Test whether a skill's description causes correct triggering:

```bash
python scripts/run_eval.py \
  --eval-set evals/evals.json \
  --skill-path skills/my-skill/SKILL.md \
  --cli-tool opencode \
  --timeout 120 \
  --runs-per-query 3
```

**Platform support:**
- `--cli-tool opencode`: OpenCode CLI
- `--cli-tool claude`: Claude Code CLI
- `--cli-tool codex`: Codex CLI

Output: JSON with results per query and summary statistics.

### Blind Comparison

Compare two skill versions without knowing which is which:

```bash
python scripts/run_loop.py \
  --skill-a skills/my-skill/v1/SKILL.md \
  --skill-b skills/my-skill/v2/SKILL.md \
  --eval-set evals/evals.json \
  --compare
```

See [Agents](./agents/README.md) for specialized evaluation agents:
- [grader.md](./agents/grader.md): Evaluate expectations against execution
- [comparator.md](./agents/comparator.md): Blind A/B comparison
- [analyzer.md](./agents/analyzer.md): Post-hoc analysis of why one won

---

## Quick Decision Tree

### Create a new skill

- Single concept, lightweight, frequently loaded -> [Tier 1](./references/tier-1-simple/README.md)
- Multi-concept with modular references -> [Tier 2](./references/tier-2-expanded/README.md)
- Platform-level with many products/services -> [Tier 3](./references/tier-3-platform/README.md)

### Improve an existing skill

- Low discoverability or wrong activation -> [CSO](./references/cso/README.md)
- Agents bypassing mandatory rules -> [Anti-Rationalization](./references/anti-rationalization/README.md)
- Overgrown monolithic content -> [Tier 2/Tier 3 restructuring](./references/templates/tier-3-platform.md)
- Weak reliability under pressure -> [Testing Guide](./references/testing/README.md)

### Enforce compliance

```bash
# Validate all markdown + tier structure
bun skills/writing-skills/scripts/check-skill.js skills/<skill-name> --tier <1|2|3>

# Auto-fix frontmatter issues
bun skills/writing-skills/scripts/fix-skill.js skills/<skill-name> --all-md
```

---

## Standardized Creation Workflow

1. Pick tier using the decision tree
2. Run overlap advisor (candidate mode) to detect merge/combine opportunities
3. Scaffold with the tier-aware script
4. Fill content using the correct template family
5. Apply CSO to description/triggers
6. Add anti-rationalization sections for discipline skills
7. Run validation and fixers until clean
8. Test skill behavior with RED-GREEN-REFACTOR scenarios
9. If changes touch agent models in OpenCode repos, validate against runtime catalog:
```bash
python3 scripts/check-agent-models.py --base .
```

---

## Component Index

| Component | Purpose |
|-----------|---------|
| [Standards](./references/standards/README.md) | Canonical frontmatter contract and tier rules |
| [CSO](./references/cso/README.md) | Discovery optimization for skill triggering |
| [Anti-Rationalization](./references/anti-rationalization/README.md) | Loophole-closing for discipline skills |
| [Testing](./references/testing/README.md) | RED-GREEN-REFACTOR validation process |
| [Best Practices](./references/best-practices/README.md) | Degrees of freedom and progressive disclosure |
| [Templates](./references/templates/README.md) | Technique/reference/discipline/pattern and Tier 3 examples |
| [Schemas](./references/schemas.md) | JSON schemas for evaluation and benchmarking |
| [Rules](./rules/_sections.md) | Enforceable rule groups by impact |
| [Agents](./agents/README.md) | Specialized evaluation agents |

---

## Specialized Agents

| Agent | Purpose |
|-------|---------|
| [grader.md](./agents/grader.md) | Evaluate expectations against execution transcript |
| [comparator.md](./agents/comparator.md) | Blind A/B comparison of outputs |
| [analyzer.md](./agents/analyzer.md) | Post-hoc analysis of why the winner won |

Use these agents for structured skill evaluation and improvement.

---

## Scripts Reference

### Skill Management Commands

Unified command for all skill operations:

```bash
# Discover files
/skill list <skill-name> --tree

# Read content
/skill read <skill-name> --file references/core/README.md

# Validate structure
/skill check <skill-name> --tier 2

# Check migration needs
/skill migration

# Cleanup empty folders
/skill cleanup --dry-run
```

See [`/skill` command](../../commands/skill-use-full-files.md) for details.

### Testing

Run tests for skill scripts:

```bash
# All skill tests
bun run test:skills

# Only script tests
bun run test:skill-scripts

# Specific test file
bun test tests/skills/scripts/check-skill.test.js
```

Test coverage is tracked for:
- `check-skill.js` - Frontmatter and tier validation
- `check-tier-migration.js` - Size limit and empty folder detection
- `cleanup-empty-folders.js` - Empty folder removal

See [Testing Guide](./references/testing/README.md) for test case design patterns.

### Bun/JavaScript Scripts

| Script | Purpose | Tests |
|--------|---------|-------|
| `create-skill.js` | Tier-aware scaffolding | ✅ `tests/skills/scripts/create-skill.test.js` |
| `check-skill.js` | Validation with tier contract | ✅ `tests/skills/scripts/check-skill.test.js` |
| `check-tier-migration.js` | Detect skills ≥800 lines needing Tier 2 migration | ✅ `tests/skills/scripts/check-tier-migration.test.js` |
| `cleanup-empty-folders.js` | Remove empty directories | ✅ `tests/skills/scripts/cleanup-empty-folders.test.js` |
| `fix-skill.js` | Auto-fix frontmatter issues | ✅ `tests/skills/scripts/fix-skill.test.js` |
| `skill-advisor.js` | Overlap detection and merge suggestions | ✅ `tests/skills/scripts/skill-advisor.test.js` |
| `skill-files.js` | List all files in a skill directory | ❌ |
| `skill-read.js` | Read all files from a skill directory | ❌ |
| `check-universal-skills-sync.js` | Mirror sync verification | ✅ `tests/skills/scripts/check-universal-skills-sync.test.js` |

### Python Scripts

| Script | Purpose |
|--------|---------|
| `run_eval.py` | Trigger evaluation with platform support |
| `run_loop.py` | Eval + improve loop with train/test split |
| `improve_description.py` | AI-powered description optimization |
| `aggregate_benchmark.py` | Aggregate results into benchmark stats |

---

## Related Skills for End-to-End Quality

- [doc-coauthoring](skill://doc-coauthoring) for structured collaborative writing workflows
- [doc-standards](../doc-standards/SKILL.md) for document-level structural consistency
- [markdownlint-skill](../markdownlint-skill/SKILL.md) for markdown lint/fix commands
- [llm-markdown-skill](skill://llm-markdown-skill) for strict LLM markdown pipelines

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Workflow in `description` | Use trigger-based `Use when ...` wording only |
| Tier 2 logic inside large monolithic `SKILL.md` | Move details to `references/` files |
| Tier 3 products missing one of the 5 files | Enforce `README/api/configuration/patterns/gotchas` |
| Array syntax in `tags/triggers/references` | Convert to CSV strings via `fix-skill.js` |
| Cross-link chains deeper than one level | Keep direct links from dispatcher to target references |
| Description too passive | Make it "pushy" - explicitly list trigger phrases |
| Overfitted description | Use train/test split in evaluation |

---

## Pre-Deploy Checklist

- [ ] `name` matches folder name exactly
- [ ] `SKILL.md` is uppercase and valid
- [ ] `description` starts with `Use when` and is pushy
- [ ] `metadata.tags/triggers` are CSV strings
- [ ] Tier structure matches 1/2/3 contract
- [ ] `check-skill.js` passes with `--tier`
- [ ] Trigger and behavior scenarios pass
- [ ] No broken relative links
- [ ] `skill-advisor.js candidate` reviewed and merge decisions documented
- [ ] Test cases created (if applicable)
- [ ] Eval loop run (if applicable)

---

## Optional Sync Workflow

When mirroring skills between repositories:

```bash
./skills/writing-skills/scripts/sync-skill.sh --list
./skills/writing-skills/scripts/sync-skill.sh <skill-name>
```

---

## Python Dependencies

For Python scripts, install dependencies:

```bash
cd skills/writing-skills
uv pip install -e .
# or
pip install -e .
```

Requires Python 3.10+. See `pyproject.toml` for dependencies.
