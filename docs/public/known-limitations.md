# Known limitations

- AFOL is alpha software and command contracts may change when marked
  experimental.
- Linux x64 is the initial supported release target.
- WSL2 support is based on observed smoke tests.
- Native Windows support remains experimental until hosted Windows CI evidence
  is green.
- macOS and ARM release assets are not supported yet.
- AFOL is not a multi-user authentication or sandbox boundary.
- Bun is required to build and test from source.
- Evolution, fleet, memory/library adoption, and telemetry-related surfaces are
  not part of the stable alpha contract.
- Coverage thresholds apply to selected critical surfaces; whole-runtime
  coverage is reported separately and must not be represented as the same
  metric.
