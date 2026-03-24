#!/usr/bin/env python3
"""Improve a skill description based on eval results.

Uses Claude with extended thinking to propose improvements.
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

try:
    import anthropic
except ImportError:
    print("Error: anthropic package required. Install with: pip install anthropic")
    sys.exit(1)


def load_skill_content(skill_path: str) -> tuple[str, str]:
    """Load skill name and content from SKILL.md file."""
    skill_file = Path(skill_path)
    if not skill_file.exists():
        raise FileNotFoundError(f"Skill file not found: {skill_path}")

    content = skill_file.read_text()

    # Extract name from frontmatter
    import re
    name_match = re.search(r'^name:\s*(\S+)', content, re.MULTILINE)
    skill_name = name_match.group(1) if name_match else skill_file.parent.name

    return skill_name, content


def load_eval_results(eval_results_path: str) -> dict[str, Any]:
    """Load evaluation results from grading.json."""
    results_file = Path(eval_results_path)
    if not results_file.exists():
        raise FileNotFoundError(f"Eval results not found: {eval_results_path}")

    return json.loads(results_file.read_text())


def extract_description(skill_content: str) -> str:
    """Extract description from frontmatter."""
    import re
    match = re.search(r'^description:\s*(.+)$', skill_content, re.MULTILINE)
    if match:
        return match.group(1).strip()
    return ""


def build_prompt(
    skill_name: str,
    skill_content: str,
    current_description: str,
    eval_results: dict[str, Any],
    history: list[dict[str, Any]],
    model: str,
) -> str:
    """Build prompt for description improvement."""

    # Extract failed/success triggers
    evals = eval_results.get("evals", [])
    grading_results = eval_results.get("results", [])

    failed_triggers = []
    false_triggers = []

    for result in grading_results:
        eval_id = result.get("eval_id")
        should_trigger = result.get("should_trigger", True)
        triggered = result.get("triggered", False)

        # Find the prompt
        prompt = ""
        for e in evals:
            if e.get("id") == eval_id:
                prompt = e.get("prompt", "")[:100]
                break

        if should_trigger and not triggered:
            failed_triggers.append(prompt)
        elif not should_trigger and triggered:
            false_triggers.append(prompt)

    # Build previous attempts summary
    history_summary = ""
    if history:
        history_summary = "\n## Previous Attempts\n"
        for h in history[-3:]:  # Last 3 attempts
            history_summary += f"- Iteration {h.get('iteration', '?')}: score={h.get('score', 0):.2f}\n"

    prompt = f"""You are an expert at writing skill descriptions for AI agents.

Current description:
```
{current_description}
```

Skill name: {skill_name

Skill content (first 2000 chars):
```
{skill_content[:2000]}
```

## Evaluation Results

Failed triggers (should have triggered but didn't):
{chr(10).join(f"- {t}" for t in failed_triggers) if failed_triggers else "- None"}

False triggers (triggered but shouldn't have):
{chr(10).join(f"- {t}" for t in false_triggers) if false_triggers else "- None"}

{history_summary}

## Task

Improve the skill description to fix the trigger issues. Consider:

1. **Imperative form**: Use "Use when..." instead of passive phrases
2. **Focus on user intent**: Think about what the user is trying to DO, not keywords
3. **Distinctive and recognizable**: What makes this skill unique?
4. **Pushy triggers**: Be explicit about when to activate
5. **100-200 words max**: Keep it concise

Tips from Anthropic skill-creator:
- Agents tend to "undertrigger" - make descriptions pushy
- Instead of "How to build dashboards", use "Use when building dashboards. Invoke this skill whenever the user mentions dashboards, data visualization, or company metrics."
- If previous attempts failed, change things up - don't repeat the same pattern

Output ONLY the new description (single line, no code blocks), nothing else."""

    return prompt


def improve_description(
    client: anthropic.Anthropic,
    skill_name: str,
    skill_content: str,
    current_description: str,
    eval_results: dict[str, Any],
    history: list[dict[str, Any]],
    model: str = "claude-sonnet-4-20250514",
) -> str:
    """Call Claude API with extended thinking to improve description."""

    prompt = build_prompt(
        skill_name, skill_content, current_description, eval_results, history, model
    )

    # Use extended thinking for better results
    response = client.messages.create(
        model=model,
        max_tokens=1024,
        thinking={
            "type": "enabled",
            "budget_tokens": 8000,
        },
        messages=[
            {
                "role": "user",
                "content": prompt,
            }
        ],
    )

    # Handle 1024 char limit with rewrite if needed
    text = response.content[0].text

    # If response is wrapped in markdown, extract just the description
    text = text.strip()
    if text.startswith("```"):
        # Extract content between code blocks
        lines = text.split("\n")
        if len(lines) > 2:
            text = "\n".join(lines[1:-1])

    # Handle description wrapper
    text = text.strip()

    # Ensure it starts with "Use when" or similar trigger phrase
    if not text.lower().startswith(("use when", "invoke", "activate", "apply")):
        # Check if it's wrapped in quotes or other delimiters
        text = text.strip('"\'')
        if len(text) > 500:
            # Too long, truncate intelligently
            text = text[:500].rsplit(" ", 1)[0] + "..."

    return text


def main():
    parser = argparse.ArgumentParser(description="Improve skill description using AI")
    parser.add_argument("--skill-path", required=True, help="Path to SKILL.md")
    parser.add_argument(
        "--eval-results", required=True, help="Path to grading.json results"
    )
    parser.add_argument(
        "--history",
        help="Path to previous improvement history JSON",
    )
    parser.add_argument(
        "--output", help="Output file for new description (default: stdout)"
    )
    parser.add_argument(
        "--model",
        default="claude-sonnet-4-20250514",
        help="Model to use for improvement",
    )
    parser.add_argument(
        "--api-key",
        env_var="ANTHROPIC_API_KEY",
        help="Anthropic API key (or set ANTHROPIC_API_KEY env var)",
    )

    args = parser.parse_args()

    # Load inputs
    skill_name, skill_content = load_skill_content(args.skill_path)
    eval_results = load_eval_results(args.eval_results)

    # Load history if provided
    history = []
    if args.history and Path(args.history).exists():
        history = json.loads(Path(args.history).read_text()).get("iterations", [])

    # Get API key
    api_key = args.api_key or "ANTHROPIC_API_KEY"
    if not api_key or api_key == "ANTHROPIC_API_KEY":
        api_key = Path.home() / ".anthropic" / "api_key"
        if api_key.exists():
            api_key = api_key.read_text().strip()
        else:
            print("Error: ANTHROPIC_API_KEY not set")
            sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    # Get current description
    current_description = extract_description(skill_content)

    # Improve
    new_description = improve_description(
        client,
        skill_name,
        skill_content,
        current_description,
        eval_results,
        history,
        args.model,
    )

    # Output
    if args.output:
        Path(args.output).write_text(new_description)
        print(f"New description written to: {args.output}")
    else:
        print(new_description)


if __name__ == "__main__":
    main()