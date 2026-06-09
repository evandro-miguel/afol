# Tasks: contract-hardening-followup

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | orchestrator | Coordinate slices, preserve prior dirty work, integrate reports, record evidence. |
| T-02 | done | builder-update | Update all managed template files using embedded template payload with normalized hashes, journal, backup, atomic writes. |
| T-03 | done | builder-mutation | File command exit/binary safety: blocked -> 4, text patch rejects binary, byte-safe move/archive stays supported. |
| T-04 | done | builder-release | Required release security scan, Biome check/ci, Knip strict release threshold, version/provenance hardening where isolated. |
| T-05 | done | builder-runtime | Structured validate/catalog failures and public delegate surface cleanup. |
| T-06 | done | verifier | Audit implementation, evidence, changed symbols, focused tests, typecheck, and release readiness. |
