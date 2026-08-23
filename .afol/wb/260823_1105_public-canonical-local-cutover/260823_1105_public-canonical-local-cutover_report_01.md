# Report: 260823_1105_public-canonical-local-cutover

## Summary
closed: 5 tasks; evidence: 5 observed, 0 failed

## Tasks
- T-01: done
- T-02: done
- T-03: done
- T-04: done
- T-05: done

## Evidence
- T-01 attempt=1 evidence_id=E-20260823111913962-b7d81e authorizing: passed (bun test --only-failures cli/tests/public-export.test.ts cli/tests/local-state-indexes.test.ts && bun run typecheck; exit_code=0)
- T-02 attempt=1 evidence_id=E-20260823111956697-613c12 authorizing: passed (markdownlint-cli2 README.md CONTRIBUTING.md SECURITY.md ROADMAP.md SUPPORT.md CHANGELOG.md THIRD_PARTY_NOTICES.md 'docs/public/**/*.md' '.afol/adm/specs/260818_public-*.md' && git diff --check; exit_code=0)
- T-03 attempt=1 evidence_id=E-20260823113812484-d1b599 authorizing: passed (git -C /home/ozy/01_projects/dev/afol/afol.public rev-parse --verify HEAD^{commit}; exit_code=0)
- T-04 attempt=1 evidence_id=E-20260823113851619-6ea740: declared passed (cd /home/ozy/tmp/afol-public-clean-09fd89fd && AFOL_GITLEAKS_PATH=/home/ozy/.local/share/mise/installs/go-github-com-zricethezav-gitleaks-v8/8.30.1/bin/gitleaks AFOL_OSV_SCANNER_PATH=/home/ozy/.local/share/mise/installs/go-github-com-google-osv-scanner-v2-cmd-osv-scanner/2.5.0/bin/osv-scanner bun run validate:release; exit_code=n/a)
- T-04 attempt=1 evidence_id=E-20260823113851951-d72aff authorizing: passed (bun --cwd /home/ozy/tmp/afol-public-clean-09fd89fd run public:audit; exit_code=0)
- T-05 attempt=1 evidence_id=E-20260823113916755-de335d authorizing: passed (afol validate project --json; exit_code=0)
