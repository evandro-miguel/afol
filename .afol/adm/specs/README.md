---
doc_type: specs_readme
id: "SPECS_readme"
status: active
created_at: "2026-05-28T19:41:46+00:00"
updated_at: "2026-06-14T00:00:00+00:00"
---

# SPECS README

## Purpose

SPECS define behavior, scope, verification, and rollout.
SPECS prevent guesswork.

## When to write a SPEC

Write SPEC when:

- new feature
- non-trivial refactor
- architectural change
- changes that can break users

Write SPEC CHILD when:

- a large parent feature needs a bounded objective under the same roadmap goal
- multiple agents or teams can own separate slices
- the work crosses several architectural surfaces or rollout phases
- one parent spec would be too broad to review or verify cleanly

Write SPEC TEST when:

- test implementation is planned but strategy is not yet documented
- a feature has one or more critical journeys that need explicit evidence criteria
- testing technology choice and construction approach must be agreed before coding tests

Legacy compatibility note:

- `spec-lite` remains accepted as a historical alias while migration to `spec-child` is in progress.

## Folder rules

- One spec per theme.
- Use IDs consistently.
- Link specs from plan and tasks.
- Keep specs updated when scope changes.
- Child specs must carry `parent_spec`, `roadmap_feature`, and `spec_role: child`.
- Parent specs must list required child specs in `Child Spec Strategy`.

## Required sections

- Objective
- Non-goals
- Architecture impact
- Verification plan
- Rollout and backout

## Index

Update `INDEX.md` for every new spec.

---

*Specs folder: `.afol/adm/specs/`*
