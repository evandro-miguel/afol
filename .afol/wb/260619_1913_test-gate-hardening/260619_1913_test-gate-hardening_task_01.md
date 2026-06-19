# Tasks: test-gate-hardening

## State Board

| Task | State | Owner | Target files | Commands | Output contract | Notes |
|------|-------|-------|--------------|----------|-----------------|-------|
| T-01 | done | worker | `cli/dev/coverage-check.ts`, `cli/tests/coverage-check.test.ts`, `cli/tests/release-toolchain.test.ts` | `bun test cli/tests/coverage-check.test.ts cli/tests/release-toolchain.test.ts` | Default coverage gate fails on weak per-file coverage and still supports the targeted include path. | Remove the misleading `All files`-only pass path from the release gate. |
| T-02 | done | worker | `package.json`, `cli/tests/release-toolchain.test.ts` | `bun test cli/tests/release-toolchain.test.ts`; `bun run validate:release` if the lane stays tractable | `validate:release` includes `bun run smoke:clean` and the test protects that contract. | Keep the existing release checks intact; only add the clean-checkout smoke gate. |
| T-03 | done | worker | `.afol/wb/260619_1913_test-gate-hardening/260619_1913_test-gate-hardening_plan_01.md`, `.afol/wb/260619_1913_test-gate-hardening/260619_1913_test-gate-hardening_task_01.md`, `.afol/wb/260619_1913_test-gate-hardening/260619_1913_test-gate-hardening_log_01.md` | `afol validate project`; `afol verify-tasks .afol/wb/260619_1913_test-gate-hardening --strict`; `afol close --session 260619_1913_test-gate-hardening` | Session closes only after task evidence exists and the task board matches reality. | Final gate, not more product churn. |
