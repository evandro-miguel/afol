---
title: Reuse Canonical Archive Surfaces Instead of Adding Parallel Ones
status: superseded
created_at: 2026-04-04 15:46:00+00:00
updated_at: '2026-06-20T00:00:00-03:00'
owner: codex
related:
- AGENTS.md
- .afol/wb/260404_1356_scaffold-quality-review/260404_1356_scaffold-quality-review_plan_01.md
---

# Superseded Lesson

This lesson is retained as historical context only. `.agents/z-arq/` is retired
and must not be used as a current archive target.

# Current Lesson

When the scaffold already has a canonical archive surface, new noise-reduction or retention rules must reuse it instead of inventing a parallel archive namespace.

# Why

- Parallel archive folders split lifecycle semantics and confuse both agents and docs.
- Existing rules, docs, and automation must point to AFOL-owned archive or
  migration surfaces, not retired `.agents/z-arq/`.
- A second archive namespace increases discovery ambiguity without solving the real policy problem.

# Prevention

- Before proposing a new folder for retention or archiving, search existing
  archive contracts in `AGENTS.md`, `.agents/config.json`, `.afol/adm/**`, and
  `docs/`.
- Prefer extending the existing archive policy over adding a sibling namespace.
- If a new archive rule is needed, define how it coexists with the current contract before it lands in a plan.
