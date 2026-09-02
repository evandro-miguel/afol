# Codex and Antigravity integration

AFOL's canonical project instructions live in the root `AGENTS.md`; Codex
reads that file directly. AFOL does not select a model, call a provider
service, or manage credentials.

## Optional Antigravity workspace rule

The sole optional adapter manages one exact file:
`.agents/rules/afol.md`. It does not own the `.agents/` directory or any other
file. Its managed content points Antigravity back to the canonical
`../../AGENTS.md` instructions.

Antigravity may require the user to activate the workspace rule in the IDE.
Open the project in Antigravity and use its Rules or Customizations controls
when activation is needed. AFOL cannot activate an IDE setting for the user.
Google's [Getting Started with Antigravity IDE codelab](https://codelabs.developers.google.com/getting-started-agy-ide)
documents workspace rules under `your-workspace/.agents/rules/`.

## Adapter lifecycle

The adapter lifecycle is a stable alpha surface. Preview each mutation first:

```bash
afol adapter list
afol adapter enable antigravity --dry-run
afol adapter sync antigravity --dry-run
afol adapter disable antigravity --dry-run
```

Apply the reviewed action explicitly:

```bash
afol adapter enable antigravity
afol adapter sync antigravity
afol adapter disable antigravity
```

`enable` creates the exact rule when it is missing. `sync` reconciles the
managed rule after `AGENTS.md` changes. `disable` removes only the AFOL-managed
rule; a user-owned file remains in place.

## Managed-file safety

AFOL recognizes ownership only for the exact managed content, including this
marker:

```text
<!-- AFOL-MANAGED: provider=antigravity source=AGENTS.md version=1 -->
```

AFOL may write only `.agents/rules/afol.md` and only when the file is missing
or already has the exact managed form. An unmarked, edited, symlinked, or
otherwise user-owned file is preserved. The command reports a conflict and
makes no file changes; resolve the conflict explicitly rather than forcing an
overwrite.

## Codex ↔ Antigravity handoff

Use this checklist for the only supported handoff:

- Put shared project instructions in root `AGENTS.md`; Codex reads it directly.
- If Antigravity is used, preview and then enable the exact
  `.agents/rules/afol.md` adapter file.
- Activate the workspace rule in the Antigravity IDE when the IDE requires it.
- After changing `AGENTS.md`, preview and sync the adapter again.
- If a conflict is reported, preserve the user-owned file and resolve it
  explicitly before retrying.
