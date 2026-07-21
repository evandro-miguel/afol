---
doc_type: lesson_entry
id: 20260717_1927_orchestrate-repair-sequences-behind-one-command
status: active
created_at: '2026-07-17T19:27:41-03:00'
updated_at: '2026-07-17T19:27:41-03:00'
---

# Lesson: Orchestrate repair sequences behind one command

## Trigger

- A maintenance recovery was presented as several operator commands.
- The user asked for one coordinated command or a bounded delegated repair.

## What Went Wrong

- The steps were individually valid, but internal choreography leaked into the
  operator experience.
- Repetitive recovery work increased latency and obscured ownership of the
  final outcome.

## Prevention Rule

- For a deterministic repair with a stable order, provide one governed command.
  It must coordinate the sequence, validate each stage, and report final state.
- Until that command exists, delegate the bounded mechanical repair. The
  orchestrator retains verification and review ownership.

## Guardrail

- The combined command must fail closed and expose partial failures.
- Individual commands remain available for diagnosis. They are not the default
  operator journey.
