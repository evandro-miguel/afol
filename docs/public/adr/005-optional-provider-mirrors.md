# ADR-005: Optional Antigravity workspace rule

Status: accepted

AFOL's canonical project guidance is the root `AGENTS.md`, with mutable state
under `.afol/`. Codex reads `AGENTS.md` directly. The sole optional adapter is
the Antigravity workspace rule at the exact path `.agents/rules/afol.md`.
AFOL does not select a model or manage credentials.

The adapter is opt-in and exposes `enable`, `sync`, and `disable`. AFOL may
create or update only that exact file when it has the valid ownership marker and
exact managed format. An unmarked or edited file is user-owned; report the
conflict and preserve it. Never force-overwrite it. Keep `AGENTS.md`
authoritative and sync the rule after changing it.

Antigravity users may need to activate the workspace rule in their IDE. The
public contract follows Google's [workspace-rules path](https://codelabs.developers.google.com/getting-started-agy-ide)
under `your-workspace/.agents/rules/`.
