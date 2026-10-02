# Architecture decision records

Public ADRs record product-level choices that affect contributors and
downstream users. Internal development history stays out of this tree.

| ID | Decision | Status |
| --- | --- | --- |
| [001](001-bun-typescript-runtime.md) | Bun and TypeScript are the canonical runtime | Accepted |
| [002](002-afol-sole-entrypoint.md) | `afol` is the only public CLI entrypoint | Accepted |
| [003](003-readable-local-state.md) | Project state stays readable on disk | Accepted |
| [004](004-binary-first-distribution.md) | Binary-first distribution | Superseded |
| [005](005-optional-provider-mirrors.md) | Optional Antigravity workspace rule | Accepted |
| [006](006-source-only-alpha.md) | The alpha is source-only | Accepted |
| [007](007-hosted-ci.md) | Hosted CI provides regression evidence | Accepted |

New design changes that affect the public contract should add or update an ADR
here.
