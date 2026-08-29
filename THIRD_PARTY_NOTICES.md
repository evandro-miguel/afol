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

## Standalone executable boundary

A Bun-compiled standalone executable contains the application bundle and a copy
of the Bun runtime. The runtime includes third-party components under licenses
not represented by the two tables above.

This inventory is not a complete binary-distribution notice or compliance
bundle. Do not distribute an AFOL standalone binary until the release includes
the applicable dependency and runtime notices, an SPDX SBOM, and any required
relinkable materials or equivalent compliance package.

The distributed AFOL project template contains only AFOL-owned skills.
