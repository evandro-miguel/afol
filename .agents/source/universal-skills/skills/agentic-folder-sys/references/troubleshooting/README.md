# AFOL Troubleshooting

## Structure Or State Drift

```bash
afol status
afol local-state rebuild --json
afol validate project --json
```

## Workbench Evidence Drift

```bash
afol verify-tasks --strict
```

Fix task state, evidence, or checklist mismatches in `.afol/wb/`, then rerun
the verification command.

## Update Drift

```bash
afol update check
afol update preview
afol update apply --dry-run
```

Use compact output first. Inspect verbose update output only when a conflict
requires file-by-file detail.
