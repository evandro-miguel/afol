# Security model

AFOL assumes the local OS account and project filesystem are the deployment
boundary. It does not authenticate users or isolate mutually hostile processes
running with the same filesystem permissions.

Security invariants include:

- reject absolute paths and traversal outside the resolved project root;
- reject symlinks that escape the project;
- fail closed for dangerous actions and ambiguous ownership;
- bound subprocess time and captured output;
- write mutable state atomically or through recoverable journals;
- bind locks to process identity, including process start identity where
  available;
- keep release scanners, receipts, checksums, and provenance tied to the exact
  artifact.

## Boundaries and non-boundaries

In scope: the resolved project root, path and symlink checks, subprocess
timeouts and output limits, lock identity, mutation journals, and release
artifact binding.

Out of scope: authentication of principals, isolation from another process
with the same OS permissions, multi-user authorization, and sandboxing a
hostile same-user agent. Agent and remote modes restrict capabilities; they
are not identity verification.
