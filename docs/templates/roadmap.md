---
doc_type: roadmap
id: "ROADMAP_general"
status: active
owners: ["orchestrator"]
created_at: "YYYY-MM-DDTHH:MM:SSZ"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
---

# GENERAL ROADMAP

## 1) North Star

- <long-term product direction>
- <why this repository exists>
- <what success looks like for users and maintainers>

## 2) Mandatory Operating Model

- Every meaningful feature must exist in this roadmap before implementation starts.
- Every roadmap feature must link to one parent spec.
- Large features must declare child specs before execution starts.
- Workstreams must reference the roadmap feature and governing spec context.
- Specs define philosophy, expected behavior, user journey, constraints, and acceptance.
- Execution artifacts define delivery, verification, and outcomes.

## 3) Current Phase

- Phase: <current phase>
- Goal: <phase goal>
- Definition of done:
  - <done condition>

## 4) Feature Portfolio

### F-01 <feature title>

- Status: planned
- Why: <why this feature matters>
- Governing spec: `.afol/adm/specs/<parent-spec-file>.md`
- Child spec policy:
  - Required: <yes/no>
  - Child specs:
    - <child-spec-id-or-file>
- Exit criteria:
  - <criterion>
  - <criterion>
- Delivery tasks:
  - [ ] Define or update the parent spec
  - [ ] Create child specs if the feature is large
  - [ ] Implement through linked workstreams

### F-02 <feature title>

- Status: planned
- Why: <why this feature matters>
- Governing spec: `.afol/adm/specs/<parent-spec-file>.md`
- Child spec policy:
  - Required: <yes/no>
  - Child specs:
    - <child-spec-id-or-file>
- Exit criteria:
  - <criterion>
- Delivery tasks:
  - [ ] <task>

## 5) Backlog Rules

- No non-trivial implementation without a roadmap feature.
- No roadmap feature without a governing parent spec.
- No large feature without child-spec decomposition.
- Prefer updating existing features/specs over creating duplicate records.
- Close roadmap tasks only when linked work and verification are complete.

## 6) Prioritization

Score inputs:

- User impact
- Strategic leverage
- Risk reduction
- Dependencies
- Effort

Tie-breaker:

- Prefer features that unblock other roadmap items.

## 7) Risks

- <risk> -> <mitigation>
- <risk> -> <mitigation>

## 8) Operating Cadence

- Weekly review:
  - roadmap status changes
  - new features added or removed
  - parent specs created or updated
  - child specs needed before next execution
  - blocked features and follow-ups

---

*Template: `docs/templates/roadmap.md`*
