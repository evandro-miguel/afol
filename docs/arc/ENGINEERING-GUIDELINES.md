---
doc_type: standard
id: 000000_000000_engineering-guidelines_standard_01
status: active
created_at: '2026-03-07T00:00:00Z'
updated_at: '2026-03-06T22:29:30-03:00'
---

# Engineering Guidelines

## Working Rules
- Roadmap and parent spec must exist before non-trivial implementation.
- Workbench artifacts are the execution source of truth.
- Verification evidence must exist before work is treated as complete.

## Documentation Rules
- Keep `AGENTS.md` and `.agents/*` canonical.
- Update runtime mirrors when canonical runtime guidance changes.
- Use automation for managed metadata such as `updated_at`.

## Safety Rules
- Never commit secrets or runtime credentials.
- Prefer logical, minimally destructive operations.
- Use git as supporting evidence, not as a replacement for governed workbench state.
