# Report: 260823_0722_reliability-simplicity-remediation

## Summary
closed: 6 tasks; evidence: 9 observed, 3 failed

## Tasks
- T-01: done
- T-02: done
- T-03: done
- T-04: done
- T-05: done
- T-06: done

## Evidence
- T-01 attempt=1 evidence_id=E-20260823080810067-6a7d52: declared passed (bun run kernel -- v project --strict; exit_code=n/a)
- T-02 attempt=1 evidence_id=E-20260823080816288-83f067: declared passed (bun test --only-failures cli/tests/canonical-context-index.test.ts; exit_code=n/a)
- T-03 attempt=1 evidence_id=E-20260823080821714-cc1847: declared passed (bun test --only-failures cli/tests/validate-internals.test.ts cli/tests/validation.test.ts cli/tests/validate-command.test.ts cli/tests/drift.test.ts; exit_code=n/a)
- T-04 attempt=1 evidence_id=E-20260823080827071-4771de: declared passed (bun test --only-failures cli/tests/validate-internals.test.ts cli/tests/validation.test.ts cli/tests/validate-command.test.ts cli/tests/drift.test.ts; exit_code=n/a)
- T-05 attempt=1 evidence_id=E-20260823080836420-f775e9: declared passed (test "$(fd -t f -d 2 'SKILL\.md' .agents/skills | wc -l)" -eq 28 && test "$(fd -t f -d 3 'SKILL\.md' src/project-template/.agents/skills | wc -l)" -eq 5; exit_code=n/a)
- T-06 attempt=1 evidence_id=E-20260823080842982-eca5c2: declared passed (bun test --only-failures; exit_code=n/a)
- T-06 attempt=1 evidence_id=E-20260823080847769-78ef66: declared passed (bun run security:scan:informative; exit_code=n/a)
- T-01 attempt=1 evidence_id=E-20260823080918447-0e7fee authorizing: passed (bun run kernel -- v project --strict; exit_code=0)
- T-02 attempt=1 evidence_id=E-20260823080923792-194e14 authorizing: passed (bun test --only-failures cli/tests/canonical-context-index.test.ts; exit_code=0)
- T-03 attempt=1 evidence_id=E-20260823081113641-864326 authorizing: passed (bun test --only-failures cli/tests/validate-internals.test.ts cli/tests/validation.test.ts; exit_code=0)
- T-04 attempt=1 evidence_id=E-20260823081124205-308a04 authorizing: passed (bun test --only-failures cli/tests/validate-command.test.ts cli/tests/drift.test.ts; exit_code=0)
- T-05 attempt=1 evidence_id=E-20260823081131692-90c17e: failed (test "$(fd -t f -d 2 'SKILL\.md' .agents/skills | wc -l)" -eq 28; exit_code=2)
- T-05 attempt=1 evidence_id=E-20260823081150067-652792: failed (test "$(fd -t f -d 2 "SKILL\.md" .agents/skills | wc -l)" -eq 28; exit_code=2)
- T-05 attempt=1 evidence_id=E-20260823081157920-51355a: failed (test "$(fd -t f -d 2 SKILL.md .agents/skills | wc -l)" -eq 28; exit_code=2)
- T-05 attempt=1 evidence_id=E-20260823081204321-30f042 authorizing: passed (test "$(fd -t f -d 2 SKILL.md .agents/skills | wc -l)" -eq 28; exit_code=0)
- T-06 attempt=1 evidence_id=E-20260823081210310-40bcbc authorizing: passed (bun run typecheck; exit_code=0)
