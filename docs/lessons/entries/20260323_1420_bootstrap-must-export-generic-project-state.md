---
doc_type: lesson_entry
id: "20260323_1420_bootstrap-must-export-generic-project-state"
status: active
created_at: "2026-03-23T14:20:00-03:00"
updated_at: "2026-03-23T14:20:00-03:00"
tags: ["bootstrap", "governance", "sanitization"]
---

# 2026-03-23 - Bootstrap Must Export Generic Project State

## Context
The scaffold bootstrap copied reusable system assets and also leaked repository-local governance state, including generated knowledge indexes, lesson-entry history, telemetry reports, and the scaffold's live roadmap/spec backlog.

## Lesson
Bootstrap output for downstream repositories must start from a generic baseline, not from this scaffold's current operational history.

## Prevention Rule
When exporting the scaffold into another repository, copy reusable tooling and documentation only. Generate empty or placeholder project-governance files for roadmap/spec/index state instead of copying live project artifacts.

## Guardrail
Keep bootstrap sanitization covered by tests that assert the target repo does not receive scaffold-local workbench, lesson-entry, telemetry-report, or roadmap/spec-history artifacts.
