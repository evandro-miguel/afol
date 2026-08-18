# Report: 260815_2306_afol-governance-promotion

## Summary
closed: 3 tasks; evidence: 4 observed, 1 failed

## Tasks
- T-01: done
- T-02: done
- T-03: done

## Evidence
- T-01 attempt=1 evidence_id=E-20260816105601733-268e8a authorizing: passed (git show -s --format=%H e9cac4b627293c4aef6d73125d871ea17b94815c; exit_code=0)
- T-02 attempt=1 evidence_id=E-20260816105608915-063c9a authorizing: passed (gh pr view 91 --json state,mergeCommit; exit_code=0)
- T-03 attempt=3 evidence_id=E-20260816120647095-202219: failed (test ! -L /home/ozy/.local/bin/afol && cmp -s /home/ozy/01_projects/dev/afol/afol/dist/afol /home/ozy/.local/bin/afol; exit_code=2)
- T-03 attempt=3 evidence_id=E-20260816120654356-495c9d authorizing: passed (cmp -s /home/ozy/01_projects/dev/afol/afol/dist/afol /home/ozy/.local/bin/afol; exit_code=0)
