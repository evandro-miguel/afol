# Core AFOL Reference

Use this file as project-local static metadata for AFOL-only operation.

## Commands

```bash
afol status
afol new <theme> --feature-id <feature-id> --parent-spec <spec-id>
afol start --session <session-id> --task-id <task-id>
afol evidence --session <session-id> --task-id <task-id> --command "<cmd>" --result passed
afol done --session <session-id> --task-id <task-id>
afol close --session <session-id>
afol validate project --json
afol verify-tasks --strict
afol update check
```

## State

- Mutable AFOL state lives under `.afol/`.
- Static retained metadata lives under `.agents/`.
- Exportable scaffold files live under `src/project-template/`.
