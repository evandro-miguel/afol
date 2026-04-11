---
id: TOOL-004
theme: agents-new
type: tool-doc
status: active
owner: system
created_at: 2026-02-20 00:00:00-03:00
updated_at: '2026-04-04T10:08:10-03:00'
links:
  tools_json: ./tools-json.md
  templates: ../../templates/
---

# agents-new.py - Workstream Creation

## Why It Exists

**Problem:** Creating a governed workstream manually requires:

- Naming folder correctly (YYMMDD_HHMM_theme_type_N)
- Copying templates
- Filling frontmatter
- Linking roadmap and parent spec
- Updating .active_session

**Solution:** Automation that creates only the artifacts justified by the workstream intent, while still wiring governance and ids correctly.

## Function

Creates or extends a workstream with:

1. **Session folder** - Standardized name
2. **Intent-selected artifacts** - only the docs required by the chosen intent or explicit `--with` flags
3. **Spec file** (optional) - Full or lite specification
4. **Updates .active_session** - Points to new session

Artifact creation now has two layers:

- `workflow.artifact_manifest`: catalog of supported artifact types
- `workflow.artifact_policy`: intent-based policy for what should actually be materialized

The default `delivery` intent creates only `task`. `plan`, `report`,
`postmortem`, and other artifacts are created only when the work actually
needs them. Research, brainstorming, exploration, specification, and closure
flows can be selected explicitly with `--intent`, and extra justified
artifacts can be added with `--with <doc-type>`. When `--intent` is omitted,
`agents-new.py` also applies conservative theme-based inference for obvious
cases such as `investigation`, `research`, `brainstorm`, `explore`, and
`postmortem`. `agents-status.py` consumes the same catalog + policy and now
distinguishes missing artifacts from invalid placeholder-only artifacts.

## What It Touches

### Files Read

| File | Purpose |
|------|---------|
| `.agents/agents.config` | Path configuration |
| `docs/templates/*.md` | Templates to copy |

### Files Created

Delivery default:

```text
.agents/wb/
└── YYMMDD_HHMM_<theme>/
    ├── YYMMDD_HHMM_<theme>_task_01.md
    └── YYMMDD_HHMM_<theme>_spec_01.md (optional)
```

Research example:

```text
.agents/wb/YYMMDD_HHMM_<theme>/
└── YYMMDD_HHMM_<theme>_research_01.md
```

Closure example:

```text
.agents/wb/YYMMDD_HHMM_<theme>/
└── YYMMDD_HHMM_<theme>_report_01.md
```

`--plan-only` now means exactly `plan` only. `--spec` and `--spec-lite`
select the spec variant, and `--with <doc-type>` can materialize specific
artifacts later in the same session without forcing a pack. A postmortem is
typically added later with `--with postmortem` once real closure work exists.

### Files Updated

| File | Change |
|------|--------|
| `.agents/wb/.active_session` | Points to new session |

## How to Configure

### Command Line Options

```bash
# Standard governed workstream
./.agents/agents new auth-refactor --feature-id F-01 --parent-spec my-parent-spec

# Research-only session
./.agents/agents new auth-investigation --feature-id F-02 --parent-spec my-parent-spec --intent research

# With full spec
./.agents/agents new api-endpoint --feature-id F-02 --parent-spec my-parent-spec --spec

# With spec-lite
./.agents/agents new bugfix-login --feature-id F-03 --parent-spec my-parent-spec --spec-lite

# Plan only
./.agents/agents new quick-task --feature-id F-04 --parent-spec my-parent-spec --plan-only

# Add closure artifacts later in the same session
./.agents/agents new auth-refactor --feature-id F-01 --parent-spec my-parent-spec --into-session 260223_1800_auth-refactor --intent closure

# Add the postmortem only when closure analysis actually started
./.agents/agents new auth-refactor --feature-id F-01 --parent-spec my-parent-spec --into-session 260223_1800_auth-refactor --intent closure --with postmortem

# Quick task in active session
./.agents/agents new update-docs --quick

# Reuse an existing session with a pack
./.agents/agents new api-follow-up --feature-id F-07 --parent-spec my-parent-spec --pack api-cleanup --into-session 260306_2002_execution-intelligence-system --spec

# Force flag still exists for backward compatibility
./.agents/agents new epic-feature --feature-id F-05 --parent-spec my-parent-spec --force-new
```

### Governance Rules

- Standard workstreams require `--feature-id` and `--parent-spec`.
- `--child-spec` is optional and must differ from `--parent-spec`.
- `--quick` bypasses standard governance checks and appends work to the active session.
- `--intent` chooses the default artifact set for the workstream.
- When `--intent` is omitted, obvious themes such as `auth-investigation` or `api-postmortem` are mapped to a safer non-delivery intent automatically.
- `--with <doc-type>` adds only the specific extra artifacts that are justified.
- `--into-session` may reuse the root session without `--pack` when you are materializing missing artifacts later.

### Multi-Session Support

**Multiple sessions can coexist.** When you create a new session while another is active:

- ⚠️ System shows a warning (non-blocking)
- ✅ New session is created normally
- 📌 `.active_session` pointer updates to the new session
- 🎯 Use `--session <id>` to target specific sessions in `wb-update` commands

```bash
# Example: Working with multiple sessions
./.agents/agents new feature-a          # Creates session A (active)
./.agents/agents new feature-b          # Creates session B (now active, warns about A)

# Target specific session for operations
./.agents/agents wb-update task T-01 --session 260224_1200_feature-a --mark-done
./.agents/agents wb-update touch --session 260224_1200_feature-b
```

## ExecPlan Convention

- The generated `*_plan_01.md` file is the session ExecPlan.
- It must follow `PLANS.md` and stay updated as work progresses.
- For non-trivial work, do not treat it as a static pre-implementation note.

## How to Modify

### Main Functions

```python
def get_session_id(theme: str) -> str:
    """Generate session folder ID: YYMMDD_HHMM_theme."""

def load_template(template_name: str) -> str:
    """Load template from docs/templates/."""

def fill_template(template: str, session_id: str, theme: str) -> str:
    """Replace placeholders in template."""

def create_session_folder(session_id: str) -> Path:
    """Create session folder in .agents/wb/."""

def set_active_session(session_id: str) -> None:
    """Update .active_session file."""
```

### Artifact Catalog And Policy

The generated file set comes from an ordered manifest catalog plus an intent policy:

- `doc_type`
- `template`
- `phase` (`planning` or `delivery`)
- `purpose`
- optional `depends_on` relationships between artifacts
- optional `flag` gate such as `use_spec` or `use_spec_lite`
- optional per-artifact placeholder overrides
- config-backed ordering in `.agents/agents.config`
- intent policies that define default creation and required context

This keeps filenames, placeholder ids, output order, and artifact readiness
semantics consistent across creation, status, and strict verification flows.

```yaml
# .agents/agents.config
workflow:
  artifact_manifest:
    version: 1
    enabled: true
    artifacts:
      - doc_type: brainstorm
        template: brainstorm.md
        phase: planning
        purpose: Capture real option analysis before committing to a direction.
      - doc_type: plan
        template: plan.md
        phase: planning
        depends_on:
          - brainstorm
  artifact_policy:
    default_intent: delivery
    intents:
      delivery:
        create: [plan, task]
      research:
        create: [research]
      closure:
        create: [report, postmortem]
```

### Adding New Template

1. Create template in `docs/templates/`
2. Add or update the manifest entry in `.agents/agents.config`
3. Keep the loader fallback in `lib/agents_config.py` aligned with the new contract
4. Add placeholder mapping only if another artifact needs to link to it
5. Add command line option only if the artifact is optional

## How to Test

```bash
# Create test workstream
./.agents/agents new test-workstream

# Verify structure
ls -la .agents/wb/26*test-workstream/

# Check .active_session
cat .agents/wb/.active_session
```

## Output

```text
============================================================
Creating new workstream: auth-refactor
============================================================

Session ID: 260223_1800_auth-refactor
Timestamp: 2026-02-23T18:00:00-03:00
Roadmap feature: F-01
Parent spec: 260306_roadmap-first-delivery-system_spec_01

✓ Created session folder: 260223_1800_auth-refactor
✓ Set active session: 260223_1800_auth-refactor

Creating files:
  ✓ Created: 260223_1800_auth-refactor_plan_01.md
  ✓ Created: 260223_1800_auth-refactor_task_01.md

============================================================
Next steps:
0. Confirm roadmap feature and parent spec stay current
1. Edit: .agents/wb/260223_1800_auth-refactor/260223_1800_auth-refactor_plan_01.md
2. Edit: .agents/wb/260223_1800_auth-refactor/260223_1800_auth-refactor_task_01.md
```

## Related

- [tools-json.md](./tools-json.md) - Tool catalog
- `docs/templates/` - Template files

---

*Document: `docs/agentic/agents-new.md`*
