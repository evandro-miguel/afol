---
name: analyzer
description: Use when analyzing blind comparison results to understand why the winner won.
metadata:
  tags: "evaluation, analysis, improvement"
  triggers: "analyze comparison, why did it win, improvement suggestions"
---
# Post-hoc Analyzer Agent

Analyze blind comparison results to understand WHY the winner won and generate improvement suggestions.

## Purpose

After the comparator determines a winner, the analyzer:
1. Identifies specific strengths of the winning skill
2. Identifies weaknesses in the losing skill
3. Generates actionable improvement suggestions
4. Prioritizes suggestions by impact

## Process

1. **Read comparison result** - Understand who won and why
2. **Read both skills** - Understand structural differences
3. **Read both transcripts** - See how each skill was used
4. **Analyze instruction following** - Score 1-10 for each
5. **Identify winner strengths** - What did it do well?
6. **Identify loser weaknesses** - Where did it fall short?
7. **Generate improvement suggestions** - Prioritized by impact
8. **Write analysis.json** - Structured output

## Instruction Following Analysis

Score how well each agent followed the skill's instructions:

| Score | Criteria |
|-------|----------|
| 9-10 | Followed all instructions precisely, added value beyond |
| 7-8 | Followed most instructions, minor gaps |
| 5-6 | Followed some instructions, significant gaps |
| 3-4 | Missed key instructions, poor adherence |
| 1-2 | Ignored skill entirely |

Look for:
- Did the agent invoke required tools?
- Did it follow the workflow in order?
- Did it respect constraints (line limits, formats)?
- Did it check all required items?

## Identifying Strengths and Weaknesses

### Winner Strengths

Look for patterns that correlate with success:

| Category | Examples |
|----------|----------|
| Clear instructions | "The step-by-step workflow was easy to follow" |
| Good examples | "The template example made the output format obvious" |
| Appropriate triggers | "The skill activated at exactly the right moment" |
| Helpful scripts | "The bundled script saved manual work" |
| Progressive disclosure | "Key info was in SKILL.md, details in references" |

### Loser Weaknesses

Look for patterns that caused problems:

| Category | Examples |
|----------|----------|
| Vague instructions | "The instruction 'be thorough' was too vague to follow" |
| Missing examples | "No example of expected output format" |
| Wrong triggers | "The skill activated for unrelated tasks" |
| Missing tools | "Agent had to create helper scripts from scratch" |
| Information overload | "SKILL.md was 800 lines, key info buried" |

## Improvement Suggestion Categories

| Category | Description | Example |
|----------|-------------|---------|
| **instructions** | Changes to prose instructions | "Add explicit step numbers to workflow" |
| **tools** | Scripts, templates, utilities | "Bundle a create-skill.sh helper script" |
| **examples** | Input/output examples | "Add before/after examples for each tier" |
| **error_handling** | Failure guidance | "Add section on what to do if overlap detected" |
| **structure** | Content reorganization | "Move detailed rules to separate reference file" |
| **references** | External docs/resources | "Link to CSO guide for description optimization" |

## Priority Levels

| Priority | Criteria |
|----------|----------|
| **high** | Would likely change the outcome of comparison |
| **medium** | Would improve quality but may not change win/loss |
| **low** | Nice to have, marginal improvement |

### High Priority Examples

- "Add explicit workflow section (missing entirely)"
- "Include at least one example of expected output"
- "Reduce SKILL.md from 900 to <500 lines"

### Medium Priority Examples

- "Add more specific trigger phrases in description"
- "Include troubleshooting section for common errors"
- "Add reference links for further reading"

### Low Priority Examples

- "Fix minor typos"
- "Add more examples beyond the minimum"
- "Include advanced configuration options"

## Output Format

Write to `analysis.json`:

```json
{
  "winner": "A",
  "winner_strengths": [
    "Clear 6-step workflow with explicit ordering",
    "Template examples for each tier type",
    "Pushy description with comprehensive trigger phrases",
    "Progressive disclosure kept SKILL.md at 280 lines",
    "Bundled check-skill.js for validation"
  ],
  "loser_weaknesses": [
    "No numbered workflow - agent had to infer order",
    "No examples of expected output format",
    "Description was passive: 'Guide for skill creation'",
    "SKILL.md was 750 lines with buried key information",
    "No bundled scripts - agent created helpers from scratch"
  ],
  "instruction_following": {
    "A": 9,
    "B": 4,
    "notes": "Agent A followed all steps in order. Agent B skipped step 3 entirely and improvised."
  },
  "improvement_suggestions": [
    {
      "category": "instructions",
      "priority": "high",
      "suggestion": "Add explicit numbered workflow section",
      "rationale": "Agent B had to guess the order, leading to skipped steps"
    },
    {
      "category": "examples",
      "priority": "high",
      "suggestion": "Include at least one complete example output",
      "rationale": "Both agents struggled with format expectations"
    },
    {
      "category": "structure",
      "priority": "high",
      "suggestion": "Reduce SKILL.md to under 500 lines, move details to references",
      "rationale": "Agent B missed key info buried at line 600"
    },
    {
      "category": "tools",
      "priority": "medium",
      "suggestion": "Bundle a validation script",
      "rationale": "Agent A used check-skill.js effectively; B had no equivalent"
    },
    {
      "category": "instructions",
      "priority": "low",
      "suggestion": "Add troubleshooting section",
      "rationale": "Would help with edge cases but not critical for main workflow"
    }
  ]
}
```

## Analyzing Transcripts

When reading execution transcripts, look for:

### Signs of Good Skill Design

- Agent references skill content naturally
- Workflow steps are followed in order
- Tool/script invocations match expectations
- Output format matches skill description
- Agent doesn't need to improvise much

### Signs of Poor Skill Design

- Agent says "I'll figure this out" or "let me try"
- Steps are skipped or done out of order
- Agent creates helper scripts that could be bundled
- Output format is unexpected
- Agent goes back and re-reads skill multiple times

## Cross-Reference with Grading

The analyzer should incorporate grading results:

```json
{
  "grading_summary": {
    "A": {"pass_rate": 0.89},
    "B": {"pass_rate": 0.44}
  },
  "failed_expectations": {
    "A": ["Minor: example formatting"],
    "B": ["Major: missing tier structure", "Major: invalid frontmatter", "Minor: passive description"]
  }
}
```

This helps identify which expectations correlate with winning.

## Running the Analyzer

```bash
# After comparison is complete
python scripts/run_loop.py \
  --skill-a skills/my-skill/v1/SKILL.md \
  --skill-b skills/my-skill/v2/SKILL.md \
  --eval-set evals/evals.json \
  --compare --analyze

# Output: evals/analysis.json
```

## Using Analysis Results

The analysis informs skill improvement:

1. **High priority suggestions** - Implement immediately
2. **Medium priority** - Consider for next iteration
3. **Low priority** - Address when time permits

After implementing suggestions, re-run evaluation to verify improvement.

## Integration with Improvement Loop

The analyzer feeds into the description improvement process:

```bash
# Analysis suggests description issues
python scripts/improve_description.py \
  --skill-path skills/my-skill/SKILL.md \
  --analysis evals/analysis.json
```