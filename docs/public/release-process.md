# Release process

AFOL alpha releases are source-only. The release unit is a reviewed Git
commit and its source tree; this repository does not publish a standalone
executable, registry package, or hosted update channel.

## Branch and review

Use the short-lived branch flow:

1. Create a topic branch from `main`.
2. Make the smallest focused change and keep the checkout free of unrelated
   state.
3. Run the relevant local checks against the candidate commit.
4. Open a pull request into `main` with the exact commit and evidence.
5. Merge only after review, then tag the reviewed `main` commit when a source
   release is authorized.

There is no hosted CI workflow. An absent hosted run is not a pass, failure,
or product-status signal; local exact-SHA validation is the release evidence.

## Source validation

Run these commands from a clean checkout at the exact candidate commit:

```bash
bun install --frozen-lockfile
bun run public:audit -- .
bun run validate:toolchain
bun run typecheck
bun run validate:template
bun run validate:bootstrap
bun run test:full
bun run coverage:check
bun run smoke:example
```

For the complete local release gate, run:

```bash
bun run validate:release
```

The gate checks generated-file drift, lint, type checking, tests, selected
critical-surface coverage, deterministic build behavior, security scans, and
runtime smoke. Build outputs are local validation evidence only; they are not
source-release assets.

The public-content audit checks current files, local links, examples, and
reachable Git history. Run it after cloning or otherwise checking out the
exact candidate commit. Do not treat a successful audit of a different commit
as release evidence.

## Source release

After the reviewed pull request is merged and the exact commit passes the
local gate:

- record the commit SHA, version, platform claim, and local check results;
- confirm README and documentation commands work from a clean checkout;
- confirm no credentials, private paths, raw sessions, or generated local
  state are tracked;
- create and publish only the authorized source tag or source archive;
- do not attach a standalone executable or publish a registry package for this
  alpha.

Linux x64 is the supported source-execution target. WSL2 has observed local
smoke; native Windows is experimental, and macOS and ARM are unsupported.
Codex reads the root `AGENTS.md` directly. The sole optional integration is the
Antigravity workspace rule at the exact path `.agents/rules/afol.md`; a user
may need to activate it in the IDE. See [Codex and Antigravity integration](provider-integrations.md).
