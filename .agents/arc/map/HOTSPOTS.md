---
title: "Hotspots"
description: "Hotspot ranking and change-risk map, combining CodeCharta complexity, git churn, temporal coupling, and Semgrep findings."
doc_kind: "hotspots"
version: "v2026-03-23_2"
created_at: "2026-03-23T21:25:46Z"
updated_at: "2026-03-23T21:28:11Z"
---

# Hotspots

## Why These Files Matter

- Hotspots combine complexity and change frequency.
- These files are where regressions, architectural drift, or refactor pain are most likely to surface first.

## Hotspot Ranking

| Path | MCC | Avg Churn | Commits | Risk |
| --- | ---: | ---: | ---: | ---: |
| .agents/scripts/lib/execution_commands.py | 153.00 | 573.00 | 1.00 | 548603.46 |
| .agents/.cache/upstream/snapshot-origin-main/.agents/scripts/agents-tools.py | 127.00 | 549.00 | 1.00 | 421969.81 |
| .agents/skills/writing-skills/scripts/check-skill.js | 121.00 | 521.00 | 1.00 | 385690.97 |
| .agents/scripts/verify-tasks.py | 250.00 | 218.00 | 6.00 | 371032.45 |
| .agents/.cache/upstream/snapshot-origin-main/.agents/scripts/agents-wb-update.py | 89.00 | 504.00 | 1.00 | 268415.45 |
| .agents/scripts/agents-telemetry.py | 170.00 | 245.60 | 5.00 | 266524.17 |
| .agents/.cache/upstream/snapshot-origin-main/.agents/scripts/agents-structure-map.py | 85.00 | 507.00 | 1.00 | 255878.12 |
| .agents/skills/writing-skills/scripts/skill-advisor.js | 78.00 | 462.00 | 1.00 | 217321.77 |
| .agents/.cache/upstream/snapshot-origin-main/.agents/scripts/agents-lint-docs.py | 91.00 | 415.00 | 1.00 | 215903.55 |
| .agents/scripts/agents-skills-sync.py | 178.00 | 183.50 | 2.00 | 207381.93 |
| .agents/skills/writing-skills/scripts/fix-skill.js | 90.00 | 384.00 | 1.00 | 200311.76 |
| .agents/skills/writing-skills/scripts/create-skill.js | 44.00 | 693.00 | 1.00 | 196202.19 |
| .agents/scripts/agents-new.py | 142.00 | 139.25 | 8.00 | 125887.40 |
| .agents/scripts/agents-wb-update.py | 141.00 | 134.17 | 6.00 | 121108.30 |
| .agents/scripts/agents-tools.py | 132.00 | 149.20 | 5.00 | 121006.05 |

## Why The Top Hotspots Are Risky

- `.agents/scripts/lib/execution_commands.py`: High-signal file surfaced by dependency, symbol, or hotspot analysis. Churn `573.00`, MCC `153.00`.
- `.agents/.cache/upstream/snapshot-origin-main/.agents/scripts/agents-tools.py`: High-signal file surfaced by dependency, symbol, or hotspot analysis. Churn `549.00`, MCC `127.00`.
- `.agents/skills/writing-skills/scripts/check-skill.js`: High-signal file surfaced by dependency, symbol, or hotspot analysis. Churn `521.00`, MCC `121.00`.
- `.agents/scripts/verify-tasks.py`: High-signal file surfaced by dependency, symbol, or hotspot analysis. Churn `218.00`, MCC `250.00`.
- `.agents/.cache/upstream/snapshot-origin-main/.agents/scripts/agents-wb-update.py`: High-signal file surfaced by dependency, symbol, or hotspot analysis. Churn `504.00`, MCC `89.00`.
- `.agents/scripts/agents-telemetry.py`: High-signal file surfaced by dependency, symbol, or hotspot analysis. Churn `245.60`, MCC `170.00`.
- `.agents/.cache/upstream/snapshot-origin-main/.agents/scripts/agents-structure-map.py`: High-signal file surfaced by dependency, symbol, or hotspot analysis. Churn `507.00`, MCC `85.00`.
- `.agents/skills/writing-skills/scripts/skill-advisor.js`: High-signal file surfaced by dependency, symbol, or hotspot analysis. Churn `462.00`, MCC `78.00`.
- `.agents/.cache/upstream/snapshot-origin-main/.agents/scripts/agents-lint-docs.py`: High-signal file surfaced by dependency, symbol, or hotspot analysis. Churn `415.00`, MCC `91.00`.
- `.agents/scripts/agents-skills-sync.py`: Ingestion and synchronization logic moving content into the system. Churn `183.50`, MCC `178.00`.

## Co-Change Signals

| File A | File B | Co-change | Confidence |
| --- | ---: | ---: | ---: |
| .agents/arc/structure/README.md | .agents/arc/structure/backend.md | 9 | 1.00 |
| .agents/arc/structure/README.md | .agents/arc/structure/tests.md | 9 | 1.00 |
| .agents/arc/structure/backend.md | .agents/arc/structure/tests.md | 9 | 1.00 |
| .agents/arc/structure/README.md | .agents/arc/structure/data.md | 7 | 1.00 |
| .agents/arc/structure/backend.md | .agents/arc/structure/data.md | 7 | 1.00 |
| .agents/arc/structure/data.md | .agents/arc/structure/tests.md | 7 | 1.00 |
| .agents/a-docs/standards/Makefile | .agents/a-docs/standards/scripts-reference.md | 7 | 1.00 |
| .agents/arc/structure/README.md | .agents/arc/structure/types.md | 6 | 1.00 |
| .agents/arc/structure/backend.md | .agents/arc/structure/types.md | 6 | 1.00 |
| .agents/arc/structure/data.md | .agents/arc/structure/types.md | 6 | 1.00 |
| .agents/arc/structure/tests.md | .agents/arc/structure/types.md | 6 | 1.00 |
| .agents/a-docs/standards/Makefile | .agents/scripts/agents-doctor.py | 6 | 1.00 |

## Static Findings Worth Attention

- Semgrep auto findings: `0`
- Semgrep custom findings: `0`

### Severity Distribution


### Files With The Most Findings

- No Semgrep findings detected.

### Representative Auto Findings


### Representative Custom Findings
