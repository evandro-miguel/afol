# Known limitations

- This is alpha software. Experimental command contracts may change.
- Linux x64 is the supported source-execution target.
- WSL2 is supported from observed local smoke, not from a hosted matrix.
- Native Windows is experimental. Do not depend on it for production work.
- macOS and ARM release assets are not provided.
- The alpha is source-only. A source tag does not promise a standalone binary
  or registry package.
- The repository has no hosted CI workflow; local exact-SHA validation is the
  release gate.
- Binary publication, attestations, hosted updates, and global installation
  are outside the documented alpha contract.
- AFOL is not a multi-user authentication or sandbox boundary.
- Bun is required to build and test from source.
- The transition-admission repair path has a known terminal-session limitation.
- Evolution, fleet, memory/library adoption, telemetry, and receipts are
  outside the stable alpha contract.
- Codex reads the root `AGENTS.md` directly. The adapter lifecycle is a stable
  alpha surface, but its only optional integration is the exact Antigravity
  workspace rule `.agents/rules/afol.md`; a user may need to activate it in the
  IDE.
- Coverage numbers in engineering notes apply to selected surfaces unless a
  document says otherwise.
