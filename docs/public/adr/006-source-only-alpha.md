# ADR-006: Source-only alpha distribution

Status: accepted

The AFOL alpha is distributed as source. Users install the pinned Bun
dependencies and run the repository's `afol` source runner. The alpha does not
promise a standalone executable, registry package, hosted update channel, or
global installation path.

Local exact-SHA validation is the release evidence, and this repository has no
hosted CI workflow. A future binary or package channel requires a separate
decision with its own reproducibility, security, licensing, and installation
evidence; a successful local build alone does not change this contract.
