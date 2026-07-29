# Retention review: governance contract reconciliation

## Scope

- Source snapshot: `3d24138c77cb73f6f775fdf5799bc3b0e991bfed`
- Classification: `migrate-copy`
- Reason: preserve exact accepted governance text before replacing stale,
  prescriptive runtime guidance with the active AFOL-only contract
- Archive authority: historical provenance only; never an active runtime or
  governance source
- Files archived: 4 regular files; no source or archive path is a symlink

## Exact mappings

| Source and active replacement | SHA-256 | Size |
| --- | --- | ---: |
| `.afol/adm/specs/260521_0010_universal-agent-cli_spec_01.md` | `f971065dbffb5babdd1009d13978f500b5d522c47c57ac056e9c0d8189b7f61d` | 8976 |
| `.afol/adm/specs/260411_agentic-runtime-restructure_spec_01.md` | `37a1859ed22b775c9ba217e2a9e0165e2afb0c420c1a084b615e21c9349e1d30` | 6751 |
| `.afol/adm/specs/260412_2004_repo-wide-simplification-runtime-parity_spec_01.md` | `5024757e3db3ff512e59ee80a5680080968eed1c2ee41fe2233c985e9611eb2d` | 8966 |
| `.afol/adm/specs/260521_0110_validation-ci-and-benchmarks_spec_01.md` | `a61003e1c9cddceab33fe8cecdaa85269d3ed17f627221527d9240ede0604c97` | 16377 |

Each destination is
`.afol/data/migrations/260726_f29-governance-contract-reconciliation/originals/<source>`.
The manifest records the exact destination, source mode, Git blob, source
timestamp, source commit, classification, reason, and active replacement.

## Retention

- Review at: `2026-08-02T18:51:58Z`
- `deletion_approved: false`
- Default action at review: retain unless the user explicitly approves the
  exact archive paths after checksum and dependency review
- Restoration: only after reviewing the current canonical contract; never
  restore a retained original as active authority by default

## Verification

The four originals were copied before any active target was edited and then
verified against the recorded SHA-256 and size. Because the migration root is
ignored by default, only `manifest.json`, `review.md`, and these four exact
original files are force-tracked. No broad ignored directory is staged.
