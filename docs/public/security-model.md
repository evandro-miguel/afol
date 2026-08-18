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

Agent and remote operating modes restrict capabilities but are not
authentication mechanisms. A malicious same-user process can still modify
files AFOL can access.
