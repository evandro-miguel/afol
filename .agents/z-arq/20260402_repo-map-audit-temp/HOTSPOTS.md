---
title: "Hotspots"
description: "Hotspot ranking and change-risk map, combining CodeCharta complexity, git churn, temporal coupling, and Semgrep findings."
doc_kind: "hotspots"
version: "v2026-04-02_1"
created_at: "2026-04-02T23:17:11Z"
updated_at: "2026-04-02T23:17:11Z"
---

# Hotspots

## Why These Files Matter

- Hotspots combine complexity and change frequency.
- These files are where regressions, architectural drift, or refactor pain are most likely to surface first.

## Hotspot Ranking

| Path | MCC | Avg Churn | Commits | Risk |
| --- | ---: | ---: | ---: | ---: |

## Why The Top Hotspots Are Risky


## Co-Change Signals

| File A | File B | Co-change | Confidence |
| --- | ---: | ---: | ---: |
| .agents/arc/structure/README.md | .agents/arc/structure/backend.md | 10 | 1.00 |
| .agents/arc/structure/README.md | .agents/arc/structure/tests.md | 10 | 1.00 |
| .agents/arc/structure/backend.md | .agents/arc/structure/tests.md | 10 | 1.00 |
| .agents/a-docs/standards/Makefile | .agents/a-docs/standards/scripts-reference.md | 8 | 1.00 |
| .agents/arc/structure/README.md | .agents/arc/structure/data.md | 8 | 1.00 |
| .agents/arc/structure/backend.md | .agents/arc/structure/data.md | 8 | 1.00 |
| .agents/arc/structure/data.md | .agents/arc/structure/tests.md | 8 | 1.00 |
| .agents/a-docs/standards/Makefile | .agents/scripts/agents-doctor.py | 7 | 1.00 |
| .agents/arc/structure/README.md | .agents/arc/structure/types.md | 7 | 1.00 |
| .agents/arc/structure/README.md | .agents/scripts/agents-doctor.py | 7 | 1.00 |
| .agents/arc/structure/README.md | .agents/scripts/verify-tasks.py | 7 | 1.00 |
| .agents/arc/structure/backend.md | .agents/arc/structure/types.md | 7 | 1.00 |

## Static Findings Worth Attention

- Semgrep auto findings: `0`
- Semgrep custom findings: `0`

### Severity Distribution


### Files With The Most Findings

- No Semgrep findings detected.

### Representative Auto Findings


### Representative Custom Findings
