# JSON Schemas

Canonical schemas for skill evaluation, benchmarking, and improvement workflows.

## evals.json

Defines test cases for skill evaluation.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["skill_name", "evals"],
  "properties": {
    "skill_name": {
      "type": "string",
      "description": "Name of the skill being evaluated"
    },
    "evals": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "prompt"],
        "properties": {
          "id": {
            "type": "integer",
            "description": "Unique identifier for this test case"
          },
          "prompt": {
            "type": "string",
            "description": "User's task prompt that should trigger the skill"
          },
          "expected_output": {
            "type": "string",
            "description": "Description of expected result"
          },
          "files": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Files to include in context"
          },
          "expectations": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Assertions about what should happen"
          },
          "should_trigger": {
            "type": "boolean",
            "default": true,
            "description": "Whether the skill should be triggered for this prompt"
          }
        }
      }
    }
  }
}
```

**Example:**
```json
{
  "skill_name": "example-skill",
  "evals": [
    {
      "id": 1,
      "prompt": "Create a new dashboard skill for visualizing company metrics",
      "expected_output": "A valid SKILL.md with tier structure",
      "files": [],
      "expectations": [
        "The output includes a SKILL.md file",
        "The skill uses tier-based scaffolding"
      ],
      "should_trigger": true
    },
    {
      "id": 2,
      "prompt": "What is the capital of France?",
      "expected_output": "General knowledge response without skill",
      "should_trigger": false
    }
  ]
}
```

---

## grading.json

Output from the grader agent evaluating expectations against execution.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["expectations", "summary"],
  "properties": {
    "expectations": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["text", "passed"],
        "properties": {
          "text": {"type": "string"},
          "passed": {"type": "boolean"},
          "evidence": {"type": "string", "description": "Why passed or failed"}
        }
      }
    },
    "summary": {
      "type": "object",
      "required": ["passed", "failed", "total"],
      "properties": {
        "passed": {"type": "integer"},
        "failed": {"type": "integer"},
        "total": {"type": "integer"},
        "pass_rate": {"type": "number", "minimum": 0, "maximum": 1}
      }
    },
    "execution_metrics": {
      "type": "object",
      "properties": {
        "tool_calls": {"type": "integer"},
        "total_steps": {"type": "integer"},
        "files_created": {"type": "integer"},
        "errors_encountered": {"type": "integer"}
      }
    },
    "timing": {
      "type": "object",
      "properties": {
        "duration_ms": {"type": "integer"},
        "total_tokens": {"type": "integer"}
      }
    },
    "claims": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "claim": {"type": "string"},
          "verified": {"type": "boolean"}
        }
      }
    },
    "eval_feedback": {
      "type": "object",
      "properties": {
        "missing_expectations": {"type": "array", "items": {"type": "string"}},
        "suggestions": {"type": "array", "items": {"type": "string"}}
      }
    }
  }
}
```

---

## benchmark.json

Aggregate statistics comparing skill performance.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["metadata", "runs", "run_summary"],
  "properties": {
    "metadata": {
      "type": "object",
      "properties": {
        "skill_name": {"type": "string"},
        "created_at": {"type": "string", "format": "date-time"},
        "eval_set": {"type": "string"}
      }
    },
    "runs": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "eval_id": {"type": "integer"},
          "configuration": {"type": "string", "enum": ["with_skill", "without_skill"]},
          "grading_path": {"type": "string"}
        }
      }
    },
    "run_summary": {
      "type": "object",
      "properties": {
        "with_skill": {
          "type": "object",
          "properties": {
            "mean_pass_rate": {"type": "number"},
            "stddev": {"type": "number"},
            "min": {"type": "number"},
            "max": {"type": "number"}
          }
        },
        "without_skill": {
          "type": "object",
          "properties": {
            "mean_pass_rate": {"type": "number"},
            "stddev": {"type": "number"},
            "min": {"type": "number"},
            "max": {"type": "number"}
          }
        },
        "delta": {
          "type": "object",
          "properties": {
            "pass_rate_improvement": {"type": "number"},
            "statistically_significant": {"type": "boolean"}
          }
        }
      }
    }
  }
}
```

---

## timing.json

Wall clock timing for a single run.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["total_tokens", "duration_ms"],
  "properties": {
    "total_tokens": {"type": "integer"},
    "duration_ms": {"type": "integer"},
    "executor_duration_seconds": {"type": "number"},
    "start_time": {"type": "string", "format": "date-time"},
    "end_time": {"type": "string", "format": "date-time"}
  }
}
```

---

## metrics.json

Tool usage and execution metrics.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "tool_calls": {"type": "integer"},
    "total_steps": {"type": "integer"},
    "files_created": {"type": "integer"},
    "files_modified": {"type": "integer"},
    "files_read": {"type": "integer"},
    "errors_encountered": {"type": "integer"},
    "skill_triggered": {"type": "boolean"},
    "tools_used": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {"type": "string"},
          "count": {"type": "integer"}
        }
      }
    }
  }
}
```

---

## comparison.json

Blind A/B comparison output from comparator agent.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["winner", "reasoning"],
  "properties": {
    "winner": {
      "type": "string",
      "enum": ["A", "B", "TIE"],
      "description": "Which output is better"
    },
    "reasoning": {
      "type": "string",
      "description": "Explanation for the decision"
    },
    "rubric": {
      "type": "object",
      "properties": {
        "A": {
          "type": "object",
          "properties": {
            "content_quality": {"type": "integer", "minimum": 1, "maximum": 10},
            "structure": {"type": "integer", "minimum": 1, "maximum": 10},
            "completeness": {"type": "integer", "minimum": 1, "maximum": 10}
          }
        },
        "B": {
          "type": "object",
          "properties": {
            "content_quality": {"type": "integer", "minimum": 1, "maximum": 10},
            "structure": {"type": "integer", "minimum": 1, "maximum": 10},
            "completeness": {"type": "integer", "minimum": 1, "maximum": 10}
          }
        }
      }
    },
    "output_quality": {
      "type": "object",
      "properties": {
        "A": {
          "type": "object",
          "properties": {
            "strengths": {"type": "array", "items": {"type": "string"}},
            "weaknesses": {"type": "array", "items": {"type": "string"}}
          }
        },
        "B": {
          "type": "object",
          "properties": {
            "strengths": {"type": "array", "items": {"type": "string"}},
            "weaknesses": {"type": "array", "items": {"type": "string"}}
          }
        }
      }
    },
    "assertions_passed": {
      "type": "object",
      "properties": {
        "A": {"type": "integer"},
        "B": {"type": "integer"}
      }
    }
  }
}
```

---

## analysis.json

Post-hoc analysis from analyzer agent.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["winner_strengths", "loser_weaknesses"],
  "properties": {
    "winner": {
      "type": "string",
      "enum": ["A", "B", "TIE"]
    },
    "winner_strengths": {
      "type": "array",
      "items": {"type": "string"},
      "description": "What the winning skill did well"
    },
    "loser_weaknesses": {
      "type": "array",
      "items": {"type": "string"},
      "description": "Where the losing skill fell short"
    },
    "instruction_following": {
      "type": "object",
      "properties": {
        "A": {"type": "integer", "minimum": 1, "maximum": 10},
        "B": {"type": "integer", "minimum": 1, "maximum": 10}
      }
    },
    "improvement_suggestions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["category", "priority", "suggestion"],
        "properties": {
          "category": {
            "type": "string",
            "enum": ["instructions", "tools", "examples", "error_handling", "structure", "references"]
          },
          "priority": {
            "type": "string",
            "enum": ["high", "medium", "low"]
          },
          "suggestion": {"type": "string"},
          "rationale": {"type": "string"}
        }
      }
    }
  }
}
```

---

## improvement_history.json

Tracks description improvement attempts.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "skill_name": {"type": "string"},
    "iterations": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "iteration": {"type": "integer"},
          "description": {"type": "string"},
          "train_score": {"type": "number"},
          "test_score": {"type": "number"},
          "changes_made": {"type": "string"},
          "timestamp": {"type": "string", "format": "date-time"}
        }
      }
    },
    "best_description": {"type": "string"},
    "best_test_score": {"type": "number"}
  }
}
```

---

## Platform-Specific Notes

### OpenCode

Skills in `skills/` or `.agents/skills/`. Use `opencode -p` for evaluation.

### Claude Code

Skills in `.claude/commands/`. Use `claude -p --include-partial-messages` for evaluation.

### Codex

Skills in `AGENTS.md` or equivalent. Adapt paths in `run_eval.py`.