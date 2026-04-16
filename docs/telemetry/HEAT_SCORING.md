---
doc_type: telemetry_feature
status: active
created_at: '2026-02-23T22:00:00Z'
updated_at: '2026-04-13T19:37:04-03:00'
---

# Heat Scoring - Element Engagement by Period

## Overview

Heat scoring tracks which elements (tools, patterns, templates, documents) are most and least used **within specific time periods**.

**Key insight:** An element can be hot this week but cold last month, revealing usage patterns and trends.

## Time Periods

| Period | Window | Use Case |
|--------|--------|----------|
| **daily** | Last 24 hours | What's hot right now |
| **weekly** | Last 7 days | Current sprint focus |
| **monthly** | Last 30 days | Monthly trends |
| **all** | All time | Historical usage |

## Heat Score Formula (per period)

```text
heat_score = (frequency_score × 0.5) + (recency_score × 0.3) + (success_score × 0.2)
```

### Components

| Component | Weight | Calculation |
|-----------|--------|-------------|
| **Frequency** | 50% | `(access_count_in_period / max_access) × 100` |
| **Recency** | 30% | `100 × (0.9 ^ days_ago)` (exponential decay) |
| **Success** | 20% | `(success_count / total_outcomes) × 100` |

### Heat Levels

| Level | Score Range | Meaning |
|-------|-------------|---------|
| 🔴 **Hot** | 70-100 | High engagement in this period |
| 🟡 **Warm** | 40-69 | Moderate engagement |
| 🔵 **Cold** | 0-39 | Low engagement in this period |

## Commands

### Show Full Heat Map

```bash
# Current week (default)
just telemetry-heat

# Different periods
just telemetry-heat PERIOD=daily
just telemetry-heat PERIOD=weekly
just telemetry-heat PERIOD=monthly
just telemetry-heat PERIOD=all

# Filter by type
just telemetry-heat TYPE=tools
just telemetry-heat TYPE=patterns

# Minimum score filter
just telemetry-heat MIN_SCORE=50

# JSON output
just telemetry-heat FORMAT=json PERIOD=weekly
```

### Show Hottest Elements

```bash
# Top 10 hot elements this week (default)
just telemetry-hot

# Top 5 hot elements today
just telemetry-hot LIMIT=5 PERIOD=daily

# Hot patterns this month
just telemetry-hot TYPE=patterns PERIOD=monthly LIMIT=5
```

### Show Coldest Elements

```bash
# Top 10 cold elements this week (default)
just telemetry-cold

# Top 5 cold patterns this month
just telemetry-cold TYPE=patterns PERIOD=monthly LIMIT=5
```

### Direct Python Commands

```bash
# Heat map
python3 .agents/scripts/agents-telemetry.py heat

# Hot elements
python3 .agents/scripts/agents-telemetry.py hot --limit=10

# Cold elements
python3 .agents/scripts/agents-telemetry.py cold --limit=10

# Filter by type
python3 .agents/scripts/agents-telemetry.py heat --type=tools
python3 .agents/scripts/agents-telemetry.py hot --type=patterns
```

## Example Output

### Weekly Heat Map

```text
======================================================================
🔥 HEAT MAP - Element Usage & Engagement (weekly)
======================================================================
Period: 2026-02-16 → 2026-02-23

Total Elements: 6
Total Accesses: 37
🔴 Hot (score >= 70): 1
🟡 Warm (score 40-69): 5
🔵 Cold (score < 40): 0
Avg Heat Score: 60.6


TOOLS
----------------------------------------------------------------------
Element                      Score    Level   Access     Last    Success
----------------------------------------------------------------------
🔴 tools                      100.0      hot       29   0d ago 29/29 (100%)
🟡 doctor                      53.4     warm        2   0d ago 2/2 (100%)
🟡 wb-update                   51.7     warm        1   0d ago 1/1 (100%)
🟡 new                         51.7     warm        1   0d ago 1/1 (100%)

PATTERNS
----------------------------------------------------------------------
Element                      Score    Level   Access     Last    Success
----------------------------------------------------------------------
🟡 PAT-002                     53.4     warm        2   0d ago 1/2 (100%)
🟡 PAT-001                     53.4     warm        2   0d ago 1/2 (100%)
```

### Comparing Periods

```bash
# Compare this week vs last week
just telemetry-heat PERIOD=weekly FORMAT=json > this_week.json
# ... wait a week ...
just telemetry-heat PERIOD=weekly FORMAT=json > last_week.json

# Compare daily vs weekly
just telemetry-heat PERIOD=daily
just telemetry-heat PERIOD=weekly
```

## Use Cases

### Session-Based Analysis

**Scenario:** Your team works in sprints with gaps between sessions.

```bash
# What was hot during last sprint?
just telemetry-heat PERIOD=weekly

# What's hot in current session (today)?
just telemetry-heat PERIOD=daily

# Elements that were hot but now cold (abandoned between sprints)
just telemetry-heat PERIOD=monthly FORMAT=json | jq '.all[] | select(.heat_level=="cold")'
```

**Insight:** Elements that are hot weekly but cold daily may indicate:

- Tools used only in specific sprint phases
- Patterns applied during planning, not execution
- Seasonal/cyclical usage patterns

### Identifying Session Gaps

```bash
# Daily heat (active today)
just telemetry-heat PERIOD=daily

# Weekly heat (active this week)
just telemetry-heat PERIOD=weekly

# If daily << weekly, session gap detected
```

**Example:**

- Daily: 2 elements, 5 accesses
- Weekly: 15 elements, 100 accesses
- **Conclusion:** Active early in week, gap in last 24h

### Sprint Retrospectives

```bash
# End of sprint: export weekly heat
just telemetry-heat PERIOD=weekly FORMAT=json > sprint_heat.json

# Analyze: what tools/patterns were most used?
jq '.tools | sort_by(.heat_score) | reverse' sprint_heat.json

# Plan: promote cold elements that should be hot
jq '.patterns[] | select(.heat_level=="cold")' sprint_heat.json
```

### Trend Detection

```bash
# Daily trend: is engagement increasing?
for i in 1 2 3 4 5; do
  just telemetry-heat PERIOD=daily FORMAT=json | \
    jq '.summary.total_accesses'
  sleep 86400  # wait 1 day
done
```

### Cold Element Investigation

**Cold elements can mean:**

1. **Obsolete** - Should be deprecated
2. **New** - Not yet adopted
3. **Niche** - Used only in specific contexts
4. **Forgotten** - Should be used but isn't

```bash
# Find cold elements this month
just telemetry-cold PERIOD=monthly TYPE=tools

# Investigate each:
# - Check if tool still works
# - Review documentation
# - Ask team if still relevant
```

## Automatic Tracking

Heat scoring is **fully automatic**. Elements are tracked when:

| Element Type | Tracked When |
|--------------|--------------|
| **Tools** | Every `.agents/agents <tool>` call |
| **Patterns** | When applied via `patterns apply` |
| **Templates** | When accessed (manual tracking) |
| **Documents** | When viewed/edited (manual tracking) |

## Manual Tracking (Optional)

For custom elements:

```bash
# Track document view
python3 .agents/scripts/agents-telemetry.py record element_view \
  --metadata='{"element_id":"ARCHITECTURE.md","element_type":"document","outcome":"success"}'

# Track template usage
python3 .agents/scripts/agents-telemetry.py record element_apply \
  --metadata='{"element_id":"plan.md","element_type":"template","outcome":"success"}'
```

## Interpreting Scores

### High Frequency, Low Recency

```text
Element: old-tool
frequency_score: 95 (used a lot historically)
recency_score: 10 (not used in 30+ days)
→ Was popular, now abandoned
```

**Action**: Check if replaced by newer tool, consider deprecation.

### High Recency, Low Frequency

```text
Element: new-feature
frequency_score: 15 (few uses)
recency_score: 100 (used today)
→ New feature, early adoption
```

**Action**: Monitor growth, promote adoption.

### Low Success Rate

```text
Element: flaky-tool
success_score: 45 (55% failure rate)
→ Reliability issues
```

**Action**: Investigate failures, fix or deprecate.

## Export for Analysis

```bash
# Export full heat data
python3 .agents/scripts/agents-telemetry.py heat --format=json > heat_data.json

# Export hot elements only
python3 .agents/scripts/agents-telemetry.py hot --limit=20 --format=json > hot_elements.json
```

## Integration

### In Reports

Add heat summary to weekly reports:

```bash
# Add to report generation script
python3 .agents/scripts/agents-telemetry.py heat --format=json | \
  jq '.summary' >> weekly_report.md
```

### In Dashboards

Embed heat map in dashboard:

```markdown
## Element Heat Summary

```bash
just telemetry-heat MIN_SCORE=50
```
```


```text


```text


```text

---
*Heat Scoring: `docs/telemetry/HEAT_SCORING.md`*
