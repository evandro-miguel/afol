# AFOL Patterns

## Governed Execution

```bash
afol new <theme> --feature-id <feature-id> --parent-spec <spec-id>
afol start --session <session-id> --task-id T-01
afol evidence --session <session-id> --task-id T-01 --command "<cmd>" --result passed
afol done --session <session-id> --task-id T-01
afol verify-tasks --strict
afol close --session <session-id>
```

## Repository Hygiene

- Keep `.agents/` static.
- Keep mutable workbench state under `.afol/wb/`.
- Keep current-state maps under `.afol/pstr/`.
- Keep roadmap/spec/ADR direction under `.afol/adm/`.
- Use `docs/map/` for repo maps intended for humans or future agents.
