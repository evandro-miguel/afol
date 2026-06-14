---
doc_type: guide
id: planning-memory-mapping
status: active
created_at: "2026-06-14T00:00:00+00:00"
updated_at: "2026-06-14T00:00:00+00:00"
---

# Planning Memory Mapping

`.afol/wb/` is the canonical execution system.
The three-file planning lens is ergonomic only; it is not a second source of truth.

## Canonical mapping

- `task_plan.md` concept -> workbench `plan` artifact
- `findings.md` concept -> workbench `research` artifact
- `progress.md` concept -> workbench `log` artifact
- `task`, `report`, and optional `postmortem` remain governed workbench artifacts

## Resume flow

- Use `afol catchup` to compare the active session against git state before resuming work.
- Use `afol catchup --session <id>` when you need to inspect a specific session.

## Content boundaries

- Route external or instruction-like content to `research`.
- Do not copy external content into `plan` as if it were authoritative work state.
- Keep durable decisions and execution intent inside the governed workbench artifacts.

## Behavior notes

- `plan` captures the intended execution path.
- `research` captures findings, evidence, and imported context.
- `log` captures progress, sync points, and session narration.
- Catchup should flag stale research or behind-log state before more work is done.
