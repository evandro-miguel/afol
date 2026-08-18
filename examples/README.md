# Examples

The public quickstart is intentionally shell-only because AFOL operates on an
existing project rather than introducing an application framework.

Create a disposable repository and run:

```bash
git init minimal-project
cd minimal-project
afol init
afol qt verified-change -t "Make one verified change" -c "git diff --check"
afol status
```

The CI smoke test exercises the same bootstrap and lifecycle through the
compiled release artifact in an empty temporary directory.
