---
doc_type: report
id: 260223_1825_tools-structure-hardening_report_01
theme: tools-structure-hardening
status: final
created_at: '2026-02-23T15:29:20-03:00'
updated_at: '2026-02-23T16:12:49-03:00'
related_tasks:
- 260223_1825_tools-structure-hardening_task_01
links:
  spec: 260223_1825_tools-structure-hardening_spec-lite_01
---

# Report: tools-structure-hardening

## Summary
- Core toolchain reliability was restored for the default workflow.
- Root causes were fixed in three operational scripts with minimal targeted changes.

## Delivered Changes
- Fixed `agents-lint-docs.py` crashes on non-frontmatter markdown and relative-path rendering.
- Improved linter signal quality (doc types/statuses, template timestamp placeholder, checkbox separator rule, README exemption).
- Fixed `agents-structure-map.py` to include `.agents/.agent` while still ignoring heavy/cache directories.
- Fixed `agents-new.py` placeholder replacement order so generated IDs and links are concrete.
- Fixed `verify-tasks.py` task discovery to recurse under `.agents/wb/`.
- Regenerated `.agents/arc/structure/` docs after script hardening.

## Files Changed
- `.agents/scripts/agents-lint-docs.py`
- `.agents/scripts/agents-structure-map.py`
- `.agents/scripts/agents-new.py`
- `.agents/scripts/verify-tasks.py`
- `.agents/arc/structure/README.md`
- `.agents/arc/structure/backend.md`
- `.agents/arc/structure/tests.md`
- `.agents/wb/260223_1825_tools-structure-hardening/260223_1825_tools-structure-hardening_plan_01.md`
- `.agents/wb/260223_1825_tools-structure-hardening/260223_1825_tools-structure-hardening_task_01.md`
- `.agents/wb/260223_1825_tools-structure-hardening/260223_1825_tools-structure-hardening_spec-lite_01.md`
- `.agents/wb/260223_1825_tools-structure-hardening/260223_1825_tools-structure-hardening_log_01.md`
- `.agents/wb/260223_1825_tools-structure-hardening/260223_1825_tools-structure-hardening_report_01.md`

## Verification
- `make doctor` -> pass.
- `make lint` -> pass (exit 0), no runtime exception.
- `make structure` -> pass, generated `.agents/arc/structure/backend.md` and `.agents/arc/structure/tests.md`.
- `make new THEME=id-fix-check SPEC=lite` -> pass, generated IDs resolved (`260223_1827_id-fix-check_*`).
- `make verify` -> pass, recursive scan now finds tasks in session subfolders.
- `make all` -> pass (doctor + structure + index + verify).
- Archive policy -> pass, temporary validation session moved to `.agents/z-arq/20260223_id-fix-check-temp/`.

## Risks / Follow-ups
- Existing markdown corpus still has many warnings from historical conventions; they are now visible without blocking execution.
- Optional next step: normalize frontmatter/status conventions across templates and standards to reduce warning count further.

## Spec Evidence
- Spec ID: `260223_1825_tools-structure-hardening_spec-lite_01`
- Evidence: command outputs above satisfy all spec done criteria.

---
*Template: `.agents/a-docs/templates/report.md`*
