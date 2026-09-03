# AFOL

AFOL is a local continuity layer for coding agents.

It keeps project instructions, specs, tasks, decisions, and validation evidence
in a predictable on-disk structure, so work can continue across sessions and
supported harnesses without relying on chat history.

```text
Project intent -> Task -> Work -> Evidence -> Handoff
```

AFOL does not host your project, call a model, or require a cloud account. It
runs locally and leaves its state as readable project files.

## Why I built it

I originally built AFOL for my own day-to-day work with different coding-agent
harnesses. It grew organically for at least twelve months, changing as I found
new friction in real projects and as provider behavior, capabilities, and
workflows evolved.

I made it public to help other people who face the same continuity problems:
repeating context, losing decisions between sessions, reconciling different
harness conventions, and proving what an agent actually completed.

## The problem it solves

Coding-agent sessions are temporary. Project context should not be.

AFOL gives agents and humans a shared answer to a few practical questions:

- What is this project trying to accomplish?
- What work is active, complete, or blocked?
- Which instructions and specs apply?
- What check proves that a task is done?
- What should the next agent read before continuing?

## Get started

AFOL is currently distributed as source. It requires Git and Bun `>=1.3.14`.

```bash
git clone https://github.com/evandro-miguel/afol.git
cd afol
bun install --frozen-lockfile
export AFOL="$PWD/afol"
```

Initialize AFOL inside a new or existing project:

```bash
cd /path/to/your-project
"$AFOL" init
"$AFOL" status
```

AFOL stays in its own checkout. It does not copy an executable or package into
your project.

## Record verified work

For a small task, create the work, run its validation, and retain the evidence
in one command:

```bash
"$AFOL" qt fix-login \
  -t "Fix login after session expiry" \
  -c "bun test" \
  --no-spec-required \
  --reason "Standalone quick task"
```

For work with several steps:

```bash
"$AFOL" new improve-search \
  --task "Implement ranked results" \
  --task "Add regression tests"

"$AFOL" start T-01
# Work on the project.
"$AFOL" done T-01 -x "bun test"
"$AFOL" close
```

Use `"$AFOL" help` or `"$AFOL" help <command>` to inspect the live command
contract.

## Continue across agents

The root `AGENTS.md` is the canonical instruction file and is read directly by
Codex. AFOL can create a small derived workspace rule for Antigravity:

```bash
"$AFOL" adapter enable antigravity --dry-run
"$AFOL" adapter enable antigravity
```

The adapter manages only `.agents/rules/afol.md` and only when that file has
AFOL's ownership marker and exact managed content. Other files under `.agents/`
remain yours. Antigravity may require activating the workspace rule in the IDE.

After changing `AGENTS.md`, preview and synchronize the rule:

```bash
"$AFOL" adapter sync antigravity --dry-run
"$AFOL" adapter sync antigravity
```

See [Codex and Antigravity integration](docs/public/provider-integrations.md)
for conflict behavior and the handoff checklist.

## What AFOL adds to a project

```text
AGENTS.md        canonical instructions for coding agents
.afol/           project configuration, tasks, specs, state, and evidence
.agents/         optional project skills and Antigravity workspace rule
```

Everything is inspectable with normal filesystem and Git tools. AFOL never
uploads these files; you decide which project files are versioned or shared.

## Alpha status

This alpha currently runs from source on Linux x64. No standalone binary or
package-manager installation is published. See
[Known limitations](docs/public/known-limitations.md) for other platforms.

## Learn more

- [Getting started](docs/public/getting-started.md)
- [Command reference](docs/public/command-reference.md)
- [Codex and Antigravity integration](docs/public/provider-integrations.md)
- [Known limitations](docs/public/known-limitations.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

AFOL is available under the [MIT License](LICENSE).
