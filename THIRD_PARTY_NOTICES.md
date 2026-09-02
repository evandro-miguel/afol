# Third-party notices

AFOL source code is licensed under MIT. Third-party packages and build tools
remain under their own licenses.

## Runtime packages

| Package | License |
| --- | --- |
| diff | BSD-3-Clause |
| valibot | MIT |

## Development tooling

| Package | License |
| --- | --- |
| citty | MIT |
| knip | ISC |
| oxlint | MIT |
| TypeScript | Apache-2.0 |
| Biome | MIT OR Apache-2.0 |
| Bun type definitions | MIT |

Exact dependency versions are recorded in `bun.lock`.

## Source-only alpha boundary

The alpha distributes source only. Users install the pinned dependencies and
Bun locally; no standalone executable or registry package is distributed by
this repository. If a future release distributes a compiled executable, its
release must include the applicable Bun-runtime and dependency notices, an
SPDX SBOM, and any required relinkable materials before publication.

The distributed AFOL project template contains only AFOL-owned skills.
