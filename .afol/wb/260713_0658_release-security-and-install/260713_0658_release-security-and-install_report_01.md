# Report: 260713_0658_release-security-and-install

## Summary
Exact commit 2f5f42f passed clean-clone release, OSV, Gitleaks, provenance and external smoke; installed ELF matches validated SHA-256 39d4559c2fbd627e2464a64571d8ac64228b6aa4999a8c1ceaee13c5bfde416b.

## Tasks
- T-01: done — Validate the exact committed AFOL source in a clean clone, run release and security gates, install the real binary globally, and verify outside the repository attempt=1

## Evidence
- T-01: passed (cmp -s .tmp/release-clean/dist/afol /home/ozy/.local/bin/afol; exit_code=0)
