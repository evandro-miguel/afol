# Report: 260814_1432_downstream-version-e2e

## Summary
closed: 3 tasks; evidence: 3 observed, 0 failed

## Tasks
- T-01: done
- T-02: done
- T-03: done

## Evidence
- T-01 attempt=1 evidence_id=E-20260814145150584-e489a5 authorizing: passed (cd .tmp/e2e-happy/downstream && /home/ozy/01_projects/dev/afol/afol.dev/dist/afol validate project --json >/dev/null; exit_code=0)
- T-02 attempt=1 evidence_id=E-20260814145154747-9a2b43 authorizing: passed (cd .tmp/e2e-adversarial/fixture && /home/ozy/01_projects/dev/afol/afol.dev/dist/afol validate project --json >/dev/null; exit_code=0)
- T-03 attempt=1 evidence_id=E-20260814145200932-f69b41 authorizing: passed (bun run typecheck && bun run manifest:check && bun run validate:template; exit_code=0)
