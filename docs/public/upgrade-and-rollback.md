# Upgrade and rollback

Before upgrading, commit or back up project-owned changes and run:

```bash
afol update check
afol update preview
afol update apply --dry-run
```

Apply only after reviewing the ownership classifications. AFOL journals managed
mutations and reports conflicts instead of silently replacing project-owned
files.

To roll back the executable, reinstall the previously verified release asset.
To roll back a scaffold mutation, follow the mutation report and journal for
that operation. Never delete `.afol/` wholesale: it contains task, evidence,
and recovery state. This document does not define hosted updates or a global
installation path.
