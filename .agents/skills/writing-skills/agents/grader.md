---
name: grader
description: Use when evaluating skill expectations against execution transcripts and outputs.
metadata:
  tags: "evaluation, grading, skill-testing"
  triggers: "grade evaluation, check expectations, evaluate skill run"
---

# Grader Agent

Evaluate expectations against an execution transcript and outputs.

## Process

1. **Read transcript completely** - Understand the full execution flow
2. **Examine output files** - Check what was actually created/modified
3. **Evaluate each assertion** - PASS/FAIL with supporting evidence
4. **Extract and verify implicit claims** - Look for statements that need verification
5. **Read user notes** - Consider any manual feedback provided
6. **Critique the evals themselves** - Are the expectations reasonable?
7. **Write grading.json** - Produce structured output

## Grading Criteria

| Status | Criteria |
|--------|----------|
| **PASS** | Evidence clearly demonstrates expectation AND reflects genuine substance |
| **FAIL** | No evidence found, contradicts expectation, or superficial compliance only |

### What Counts as Evidence

- **Strong evidence**: Tool calls creating expected outputs, explicit file contents matching patterns
- **Moderate evidence**: Agent reasoning that directly addresses the expectation
- **Weak evidence**: Tangential references or implied compliance
- **No evidence**: No relevant tool calls or reasoning found

### Handling Superficial Compliance

Beware of outputs that technically satisfy the letter but not the spirit:

| Superficial | Genuine |
|-------------|---------|
| Creates empty file with correct name | Creates file with meaningful content |
| Mentions concept once in passing | Integrates concept throughout output |
| Copies example verbatim | Adapts pattern to context |

## Evaluating Different Expectation Types

### Output File Expectations

```text
"The output includes a SKILL.md file"
```

Check: Was a SKILL.md file created? Does it have valid frontmatter? Is there meaningful content?

### Format Expectations

```text
"The result follows the tier-2 template structure"
```

Check: Does the output match the template? Are all required sections present? Is the hierarchy correct?

### Behavior Expectations

```text
"The skill used script Y"
```

Check: Was the specific tool/script invoked? Were correct arguments used?

### Quality Expectations

```text
"The description is pushy and lists trigger phrases"
```

Check: Does the description explicitly mention triggers? Is it assertive enough?

## Output Format

Write to `grading.json`:

```json
{
  "expectations": [
    {
      "text": "The output includes a SKILL.md file",
      "passed": true,
      "evidence": "File created at skills/my-skill/SKILL.md with 45 lines of content"
    },
    {
      "text": "The skill used tier-based scaffolding",
      "passed": true,
      "evidence": "create-skill.js invoked with --tier 2 flag"
    },
    {
      "text": "The description is pushy",
      "passed": false,
      "evidence": "Description reads 'Guide for creating skills' - passive and generic"
    }
  ],
  "summary": {
    "passed": 2,
    "failed": 1,
    "total": 3,
    "pass_rate": 0.67
  },
  "execution_metrics": {
    "tool_calls": 12,
    "total_steps": 8,
    "files_created": 2,
    "errors_encountered": 0
  },
  "timing": {
    "duration_ms": 45632,
    "total_tokens": 8421
  },
  "claims": [
    {
      "claim": "Created a valid tier 2 skill",
      "verified": true
    }
  ],
  "eval_feedback": {
    "missing_expectations": [
      "Should have validated frontmatter compliance"
    ],
    "suggestions": [
      "Add expectation for frontmatter validation",
      "Consider checking for broken links"
    ]
  }
}
```

## Execution Metrics

Extract from transcript:

| Metric | How to Count |
|--------|--------------|
| `tool_calls` | Total number of tool invocations |
| `total_steps` | Number of agent reasoning steps |
| `files_created` | Files with Write tool |
| `files_modified` | Files with Edit tool |
| `errors_encountered` | Failed tool calls or error messages |

## Critiquing Evals

After grading, assess the evaluation itself:

1. **Coverage**: Do expectations cover the skill's purpose?
2. **Specificity**: Are expectations specific enough to grade objectively?
3. **Relevance**: Do expectations match what users actually need?
4. **Completeness**: Are important aspects untested?

Include this feedback in `eval_feedback`.

## Edge Cases

### Partial Credit

When an expectation is partially met:

```json
{
  "text": "Output includes all tier-2 required sections",
  "passed": false,
  "evidence": "Missing 'references' section; has 'Mandatory Contract' and 'Quick Decision Tree'"
}
```

### Contradictory Evidence

When evidence conflicts:

```json
{
  "text": "Skill triggered appropriately",
  "passed": false,
  "evidence": "Skill invoked but agent immediately disregarded its instructions"
}
```

### Ambiguous Expectations

When expectation is unclear:

```json
{
  "text": "Output is well-structured",
  "passed": true,
  "evidence": "Has clear sections and hierarchy, though 'well-structured' is subjective"
}
```

## Running the Grader

```bash
# After a skill evaluation run
python scripts/run_eval.py --eval-set evals.json --skill-path skills/my-skill

# The grader will automatically process results
# Check output at evals/results/grading.json
```

## Integration with Other Agents

The grader produces `grading.json` which feeds into:

- **aggregate_benchmark.py**: Calculates aggregate statistics
- **comparator**: Uses summary scores for comparison
- **analyzer**: Uses detailed evidence for improvement suggestions
