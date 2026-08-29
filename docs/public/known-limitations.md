# Known limitations

- This is alpha software. Experimental command contracts may change.
- Linux x64 is the supported release target.
- WSL2 is supported from observed local smoke, not from a hosted matrix.
- Native Windows is experimental. Do not depend on it for production work.
- macOS and ARM release assets are not provided.
- The public-alpha publication path is source-first. A source tag does not
  promise a standalone binary.
- Standalone binaries are not promoted until checksum, provenance, SBOM,
  license/relink materials, and clean-install smoke are complete.
- The repository has no hosted CI workflow; local exact-SHA validation is the
  release gate.
- Release publication, attestations, and global installation are outside the
  documented local engineering contract.
- AFOL is not a multi-user authentication or sandbox boundary.
- Bun is required to build and test from source.
- The transition-admission repair path has a known terminal-session limitation
  tracked in issue #96.
- Evolution, fleet, memory/library adoption, telemetry, receipts, and provider
  adapters are outside the stable alpha contract.
- Coverage numbers in engineering notes apply to selected surfaces unless a
  document says otherwise.
