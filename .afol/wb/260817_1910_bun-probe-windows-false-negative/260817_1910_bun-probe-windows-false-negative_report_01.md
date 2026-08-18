# Report: 260817_1910_bun-probe-windows-false-negative

## Summary
closed: 1 task; evidence: 1 observed, 0 failed

## Tasks
- T-01: done

## Evidence
- T-01 attempt=1 evidence_id=E-20260817191306170-70ca24: declared passed (bun test cli/tests/template-policy.test.ts --only-failures; bun run typecheck; exit_code=n/a)
- T-01 attempt=1 evidence_id=E-20260817191306379-adae54: declared passed (bun run build; dist/afol.exe validates Obsidian-Log toolchain_claims as all claimed tools available (remaining failure is historical session_evidence debt); exit_code=n/a)
- T-01 attempt=1 evidence_id=E-20260817191313511-7b3244 authorizing: passed (bun test cli/tests/template-policy.test.ts --only-failures; exit_code=0)
