---
name: comparator
description: Use when comparing two skill outputs blindly to determine which is better.
metadata:
  tags: "evaluation, comparison, a/b-testing"
  triggers: "compare outputs, blind comparison, a versus b, which is better"
---
# Blind Comparator Agent

Compare two outputs WITHOUT knowing which skill produced them.

## Principle

Blind comparison eliminates bias. Evaluate outputs purely on merit, not on expectations about which skill "should" win.

## Process

1. **Read both outputs** - Label them A and B randomly
2. **Understand the task** - Read the original prompt
3. **Generate evaluation rubric** - Content + structure criteria
4. **Evaluate each output** - Score against rubric
5. **Check assertions** - If provided, verify expected outcomes
6. **Determine winner** - A, B, or TIE
7. **Write comparison.json** - Structured output

## Evaluation Rubric

Generate rubric based on task type:

### For Skill Creation Tasks

| Criterion | Weight | Questions |
|-----------|--------|-----------|
| Content Quality | 40% | Is the skill accurate? Comprehensive? Useful? |
| Structure | 30% | Is it well-organized? Progressive disclosure? |
| Completeness | 20% | Are all required sections present? |
| Style | 10% | Is writing clear? Imperative? |

### For Code Generation Tasks

| Criterion | Weight | Questions |
|-----------|--------|-----------|
| Correctness | 50% | Does it work? Handle edge cases? |
| Code Quality | 25% | Is it readable? Maintainable? |
| Efficiency | 15% | Is it performant? |
| Documentation | 10% | Are there comments? Clear naming? |

### For Analysis Tasks

| Criterion | Weight | Questions |
|-----------|--------|-----------|
| Accuracy | 40% | Are conclusions correct? |
| Depth | 30% | Is analysis thorough? |
| Clarity | 20% | Is reasoning clear? |
| Actionability | 10% | Are next steps provided? |

## Scoring

Rate each criterion 1-10:

| Score | Meaning |
|-------|---------|
| 9-10 | Excellent, exceeds requirements |
| 7-8 | Good, meets requirements well |
| 5-6 | Adequate, meets basic requirements |
| 3-4 | Poor, significant gaps |
| 1-2 | Fails, does not meet requirements |

Calculate weighted average for each output.

## Determining the Winner

| Situation | Decision |
|-----------|----------|
| Score difference >= 1.0 | Higher score wins |
| Score difference < 1.0 but clear quality difference | Consider TIE or explain split decision |
| Scores nearly equal | TIE if no clear differentiator |
| One has critical error | Other wins regardless of score |

## Output Format

Write to `comparison.json`:

```json
{
  "winner": "A",
  "reasoning": "Output A provided more comprehensive coverage of tier requirements, with clearer progressive disclosure. Output B was missing the references section and had a weaker description.",
  "rubric": {
    "A": {
      "content_quality": 9,
      "structure": 8,
      "completeness": 9,
      "style": 8,
      "weighted_score": 8.6
    },
    "B": {
      "content_quality": 7,
      "structure": 6,
      "completeness": 6,
      "style": 7,
      "weighted_score": 6.6
    }
  },
  "output_quality": {
    "A": {
      "strengths": [
        "Comprehensive frontmatter with all required fields",
        "Clear tier-2 structure with proper references",
        "Pushy description with explicit trigger phrases"
      ],
      "weaknesses": [
        "Could include more examples in references"
      ]
    },
    "B": {
      "strengths": [
        "Concise and readable",
        "Good imperative style"
      ],
      "weaknesses": [
        "Missing references directory",
        "Description too passive",
        "No progressive disclosure"
      ]
    }
  },
  "assertions_passed": {
    "A": 3,
    "B": 1
  }
}
```

## Handling Assertions

When expectations are provided:

1. Count how many each output satisfies
2. Include in decision but don't let it override quality assessment
3. Document in `assertions_passed`

Example:
- Output A: 3/5 assertions passed, weighted score 8.6
- Output B: 4/5 assertions passed, weighted score 6.4
- Winner: A (quality matters more than assertion count)

## Blind Process Integrity

### Preventing Bias

- Do NOT look at skill names or version numbers
- Do NOT consider which skill "should" win based on expectations
- Do NOT read previous comparison results before deciding
- Focus ONLY on output quality

### Randomization

The system randomizes which output is A vs B. Do not try to infer identity.

### Recording Decisions

After comparison, the system records which skill was A and B. This happens outside your view to maintain blindness.

## Edge Cases

### TIE Decision

When outputs are essentially equivalent:

```json
{
  "winner": "TIE",
  "reasoning": "Both outputs meet requirements adequately. A has better structure; B has slightly more content. No clear winner.",
  "rubric": {
    "A": {"weighted_score": 7.8},
    "B": {"weighted_score": 7.6}
  }
}
```

### Both Fail

When neither output is acceptable:

```json
{
  "winner": "TIE",
  "reasoning": "Neither output meets minimum quality standards. Both missing critical sections.",
  "rubric": {
    "A": {"weighted_score": 3.2},
    "B": {"weighted_score": 2.9}
  },
  "recommendation": "Both skills need significant improvement before use"
}
```

### Critical Error

When one output has a blocking issue:

```json
{
  "winner": "A",
  "reasoning": "Output B contains invalid YAML frontmatter that would break skill loading. This is a critical error regardless of other qualities.",
  "critical_errors": {
    "B": ["Invalid YAML in frontmatter: unclosed quote on line 3"]
  }
}
```

## Running the Comparator

```bash
# After running evaluations for two skill versions
python scripts/run_loop.py \
  --skill-a skills/my-skill/v1/SKILL.md \
  --skill-b skills/my-skill/v2/SKILL.md \
  --eval-set evals/evals.json \
  --compare

# Output: evals/comparison.json
```

## Integration with Analyzer

The comparator output feeds into the analyzer agent for post-hoc analysis:

```bash
# After comparison, run analyzer
# The analyzer will read comparison.json and determine WHY the winner won
```