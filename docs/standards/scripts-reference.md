---
doc_type: standard
id: scripts-reference
theme: standards
status: active
created_at: '2026-02-23T23:37:47-03:00'
updated_at: '2026-06-07T12:20:00-03:00'
---

# AFOL Command Reference

## Canonical Commands

Use `afol` as the public and downstream command surface. Do not document
legacy aliases or legacy just command runners as current entrypoints.

```bash
afol --help
afol status
afol validate
afol new <theme> --feature-id F-01 --parent-spec <spec-id>
afol start --task-id T-01
afol evidence T-01 --command "afol validate" --result passed
afol done --task-id T-01 --test "afol validate"
afol verify
afol close
afol bootstrap /path/to/target-repo --partial
```

## Command Map

| Command | Alias | Purpose |
| --- | --- | --- |
| `afol status` | `afol s` | Show project and active-session status |
| `afol validate` | `afol v` | Run validation gates |
| `afol new` | `afol n` | Create workbench session |
| `afol start` | `afol st` | Mark a workbench task in progress |
| `afol evidence` | `afol e` | Add evidence for a task |
| `afol done` | `afol d` | Complete a task with evidence |
| `afol log` | `afol l` | Append a timeline entry |
| `afol verify` | `afol vf` | Verify task state and evidence |
| `afol close` | `afol c` | Close active session |
| `afol bootstrap` | `afol b` | Install scaffold into another repository |

## Validation

Use the narrowest relevant `afol validate` gate first, then broaden when risk
justifies it.

```bash
afol validate --changed-path README.md
afol validate --changed-path cli/validate/contract.ts --json
afol validate --json
```

Runtime-flow benchmark validation:

```bash
afol validate bench --pack runtime-live-agent --json
```

The runtime-flow benchmark is a development test tool, not a public downstream
AFOL command surface. Live benchmark refresh remains script-backed and
factory-only until an AFOL-native refresh verb lands.

## Legacy Boundary

Legacy Python wrappers and legacy just command runners are factory-only retirement
debt. They are not public onboarding contracts and must not be copied into
downstream templates.

---

*Reference: `docs/standards/scripts-reference.md`*
