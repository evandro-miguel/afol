---
description: Validation and recovery guidance for scaffold install, upgrade, workbench, and skills drift
metadata:
  tags: "agentic-folder-sys, troubleshooting, validation, bootstrap, skills-sync, workbench"
---

# Agentic Folder Sys Troubleshooting

Use this reference when scaffold operations fail or when the repo state is
unclear.

## 1. Bootstrap Fails on a New Path

Symptom:

- `Target directory not found`

Cause:

- the target path points to a file, or the bootstrap path is malformed

Fix:

```bash
afol bootstrap /path/to/new-project
```

Full bootstrap creates the target directory when it is missing.

## 2. Partial Install Fails

Symptom:

- `Partial install requires an existing target directory`

Cause:

- `--partial` is only for an already existing repo

Fix:

- create the repo first use full bootstrap for a new repo

## 3. Pull Did Not Update Installed Skills

Symptom:

- upstream refresh ran, but `.agents/skills/` did not change

Cause:

- `skills-sync pull` only refreshed the external source when one was configured

Fix:

```bash
./.agents/agents skills-sync update --runtime codex
```

## 4. Existing Repo Already Owns `make all`

Use:

```bash
make agents-all
```

The scaffold preserves the host `all` target and exposes the aggregate scaffold
validation through `agents-all`.

## 5. Minimal Recovery Checks

Run the smallest proof set first:

```bash
make doctor
make lint
make test-scripts
./.agents/agents skills-sync check
```

For governed workstreams:

```bash
./.agents/agents verify-tasks --strict .afol/wb/$(cat .afol/wb/.active_session)
```
