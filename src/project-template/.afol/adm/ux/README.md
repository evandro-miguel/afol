---
doc_type: ux-index
id: afol-ux-registry
status: active
created_at: '2026-06-27T00:00:00Z'
updated_at: '2026-06-27T00:00:00Z'
---

# AFOL UX Journey Registry

`.afol/adm/ux/**` stores standalone UX journeys when the roadmap/spec/spec-test
chain needs more detail than frontmatter and benchmark metadata can carry.

Canonical source of truth remains:

1. roadmap feature
2. parent spec
3. child spec
4. spec-test or benchmark scenario
5. workbench evidence

Use this folder for complex flows only. Do not duplicate routine command
coverage that already lives in specs and benchmark scenarios.

## Experience Maps

Use separately licensed UX guidance for journeys that cross agents, workbench
state, maintenance cadence, memory, library, rules, specs, benchmark evidence,
or warnings. AFOL does not vendor third-party UX guidance. Those journeys must
include:

- facts, assumptions, and unknowns
- current and target experience maps
- frontstage/backstage service blueprint
- expected warnings, review prompts, and recovery paths
- scripted or live-agent evidence

Routine single-command coverage can stay in specs and benchmark metadata.
Complex delegated-agent or maintenance flows belong here as standalone
`ux-journey` docs.

## Control Commands

```bash
afol ux list
afol ux show <journey-id>
afol ux validate
afol ux coverage --tool <afol-command>
afol ux register --from-spec <spec-id>
```

Every command behavior change must have a journey, benchmark scenario, or
explicit backlog entry in the AFOL tool scenario coverage plan.
