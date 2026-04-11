---
doc_type: brainstorm
id: 260323_1507_bootstrap-partial-install_brainstorm_01
theme: bootstrap-partial-install
status: final
roadmap_feature: F-04
parent_spec: 260306_roadmap-first-delivery-system_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260323_1507_bootstrap-partial-install_plan_01
created_at: '2026-03-23T15:07:03-03:00'
updated_at: '2026-03-23T15:24:34-03:00'
---

# Brainstorm: bootstrap-partial-install

## Problem Statement
- The scaffold needed a first-class installation path for existing projects, not only a fresh-repo bootstrap story.
- The bootstrap path also still had residual cleanliness issues: synced skill docs produced lint noise in target repos, generated target repos had no active-session pointer yet still warned, and generated IDs were not fully convention-compliant.

## Repo Context to Validate
- Files/areas likely involved:
  - `.agents/scripts/agents-bootstrap.py`
  - `.agents/scripts/agents-lint-docs.py`
  - `.agents/scripts/agents-doctor.py`
- Existing patterns or constraints to confirm:
  - Existing target repos must preserve pre-existing files unless overwrite is explicit.
  - Bootstrapped targets should validate cleanly immediately after install.

## Assumptions
- Existing projects need an adoption-oriented governance baseline, not the same generic fresh-project placeholder backlog.
- Synced skill content should be validated by `skills-check`, not produce markdown-lint noise for imported reference docs.

## Options
1. Option A - Keep the current bootstrap semantics and only document that existing repos are “partial by default”.
2. Option B - Add an explicit `--partial` mode with an adoption baseline for existing projects and clean up the target-validation noise.
3. Option C - Split installation into a separate script unrelated to `agents-bootstrap.py`.

## Tradeoffs
| Option | Pros | Cons | Risk | Complexity |
|--------|------|------|------|------------|
| A | Minimal code change | Ambiguous UX, docs/code drift remains, existing-project flow still feels improvised | Medium | low |
| B | Clear install contract, better target ergonomics, testable | Requires baseline branching and extra validation | Low | medium |
| C | Max separation of concerns | More maintenance and duplicated provisioning logic | Medium | high |

## Preferred Direction
- Selected: Option B
- Why: The bootstrap command remains the canonical installer, but now exposes an explicit adoption path for already-running projects and produces cleaner targets.
- Rejected options:
  - Option A -> still leaves behavior implicit and does not encode the existing-project mental model into the tool.
  - Option C -> adds unnecessary script sprawl for a workflow that shares almost all provisioning logic.

## Decision Criteria
- Existing repos must be installable without clobbering project-owned files.
- Fresh and partial installs must both pass post-bootstrap validation cleanly.

## Planning Readiness
- Ready for explorer-check: yes
- Unknowns that must be verified against the current repo:
  - Whether the current lint and doctor warnings can be eliminated without weakening safety checks.
  - Which generated baseline should be used for an existing project.
- Knowledge to reuse before planning:
  - `./.agents/agents knowledge pull "bootstrap partial install existing project warnings lint skills docs"` -> no reusable knowledge found.

---
*Template: `.agents/a-docs/templates/brainstorm.md`*
