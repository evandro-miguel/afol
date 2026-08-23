# Known limitations

- This is alpha software. Experimental command contracts may change.
- Linux x64 is the supported release target.
- WSL2 is supported from observed local smoke, not from a hosted matrix.
- Native Windows is experimental. Do not depend on it for production work.
- macOS and ARM release assets are not provided.
- The repository has no hosted CI workflow; local exact-SHA validation is the
  release gate.
- Release publication, attestations, and global installation are outside this
  documented local contract.
- AFOL is not a multi-user authentication or sandbox boundary.
- Bun is required only to build and test from source.
- Evolution, fleet, memory/library adoption, telemetry, receipts, and provider
  adapters are outside the stable alpha contract.
- Coverage numbers in engineering notes apply to selected surfaces unless a
  document says otherwise.
