---
doc_type: rule
id: RULE-011
theme: maintenance-cadence
version: 1.0
created: 2026-06-27
updated_at: '2026-06-27T00:00:00Z'
applies_to: All agents (Codex, OpenCode, Qwen, Gemini, Claude)
---

# Maintenance Cadence

**Purpose:** agents must surface routine cleanup, review, and rotation needs
before project state becomes stale or misleading.

## Applies When

Use this rule for maintenance, health review, memory/library review, workbench
backlog, cleanup, archive, update, benchmark, and closure work.

## Required Behavior

- Run or recommend `afol maintenance weekly --dry-run` when routine maintenance,
  stale state, memory/library freshness, or workbench backlog is relevant.
- Run or recommend `afol maintenance monthly --dry-run` when roadmap, specs,
  manifest, rules, skills, logs, or long-retention archives may be stale.
- Weekly review must surface PSTR/index freshness, old workbench sessions, and
  due areas including memory and library.
- Monthly review must surface roadmap/spec/manifest alignment, obsolete
  rule/skill review, log rotation, and old closed-session archive candidates.
- Use AFOL commands before raw file reads for supported health, maintenance,
  session, memory, and library checks.
- Keep maintenance warnings visible in final reports and handoffs.

## Safety

- Do not delete, archive, or rewrite memory, library, workbench, rule, skill,
  roadmap, spec, or manifest content without explicit user approval.
- Record a maintenance review only after real inspection with
  `afol maintenance review --area <area> --note "<summary>"`.

## Validation

- Benchmark coverage must include a live-agent maintenance cadence scenario.
- Focused checks should include maintenance command output and project/template
  validation when changing this behavior.
