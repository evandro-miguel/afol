---
title: "Features"
description: "Feature-oriented breakdown of the repository, explaining why each cluster exists and which files represent it."
doc_kind: "features"
version: "v2026-03-23_2"
created_at: "2026-03-23T21:25:46Z"
updated_at: "2026-03-23T21:28:11Z"
---

# Features

This file groups the repository by feature or concern, not by raw directory listing.

## Feature Themes From The Product README

- No README feature bullets were extracted.

## Feature Clusters

### `.agents/scripts`

- Why it exists: Feature cluster inferred from source layout, hotspots, and public boundaries.
- Signal strength: `14` high-signal references from boundaries, hotspots, and dependency artifacts.
- Representative files:
- `.agents/scripts/lib/execution_commands.py`
- `.agents/scripts/verify-tasks.py`
- `.agents/scripts/agents-telemetry.py`
- `.agents/scripts/agents-skills-sync.py`
- `.agents/scripts/agents-new.py`
- `.agents/scripts/agents-wb-update.py`

### `.agents/.cache`

- Why it exists: Feature cluster inferred from source layout, hotspots, and public boundaries.
- Signal strength: `6` high-signal references from boundaries, hotspots, and dependency artifacts.
- Representative files:
- `.agents/.cache/upstream/snapshot-origin-main/.agents/scripts/agents-tools.py`
- `.agents/.cache/upstream/snapshot-origin-main/.agents/scripts/agents-wb-update.py`
- `.agents/.cache/upstream/snapshot-origin-main/.agents/scripts/agents-structure-map.py`
- `.agents/.cache/upstream/snapshot-origin-main/.agents/scripts/agents-lint-docs.py`
- `.agents/.cache/upstream/snapshot-origin-main/.agents/scripts/agents-doctor.py`
- `.agents/.cache/upstream/snapshot-origin-main/.agents/scripts/agents-bootstrap.py`

### `.agents/skills`

- Why it exists: Feature cluster inferred from source layout, hotspots, and public boundaries.
- Signal strength: `5` high-signal references from boundaries, hotspots, and dependency artifacts.
- Representative files:
- `.agents/skills/writing-skills/scripts/check-skill.js`
- `.agents/skills/writing-skills/scripts/skill-advisor.js`
- `.agents/skills/writing-skills/scripts/fix-skill.js`
- `.agents/skills/writing-skills/scripts/create-skill.js`
- `.agents/skills/writing-skills/scripts/check-universal-skills-sync.js`
- `.agents/skills/writing-skills/scripts/sync-skill.sh`
