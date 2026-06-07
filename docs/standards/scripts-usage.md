---
doc_type: standard
id: scripts-usage
theme: standards
status: active
created_at: '2026-02-23T23:37:47-03:00'
updated_at: '2026-06-07T12:30:00-03:00'
---

# Scripts Usage

The maintained command surface is `afol`.

```bash
afol --help
afol status
afol validate
afol benchmark list
afol benchmark run --save
afol new <theme> --feature-id F-01 --parent-spec <spec-id>
afol start --task-id T-01
afol evidence T-01 --command "afol validate" --result passed
afol done --task-id T-01 --test "afol validate"
afol verify
afol close
afol bootstrap /path/to/target-repo --partial
```

See `docs/standards/scripts-reference.md` for command details.

Legacy Python wrappers and legacy just command runners are factory-only
retirement debt. New docs, templates, and downstream bootstrap output must not
depend on them.
