# Report: 260823_1206_public-cutover-proof

## Summary
closed: 1 task; evidence: 5 observed, 3 failed

## Tasks
- T-01: done

## Evidence
- T-01 attempt=1 evidence_id=E-20260823120632398-148e93: failed (git -C /home/ozy/tmp/afol-public-observed-09fd89fd log -1 --format=%H | rg -qx 09fd89fda14c40c5a4fd8a3160510e22670ec3bc && AFOL_GITLEAKS_PATH=/home/ozy/.local/share/mise/installs/go-github-com-zricethezav-gitleaks-v8/8.30.1/bin/gitleaks AFOL_OSV_SCANNER_PATH=/home/ozy/.local/share/mise/installs/go-github-com-google-osv-scanner-v2-cmd-osv-scanner/2.5.0/bin/osv-scanner TOKF_DB_PATH=/home/ozy/tmp/tokf-afol-observed-proof.db tokf --no-mask-exit-code err bun --cwd /home/ozy/tmp/afol-public-observed-09fd89fd run validate:release && bun --cwd /home/ozy/tmp/afol-public-observed-09fd89fd run public:audit; exit_code=128)
- T-01 attempt=1 evidence_id=E-20260823120751519-13711d: failed (cd /home/ozy/tmp/afol-public-observed-09fd89fd && git log -1 --format=%H | rg -qx 09fd89fda14c40c5a4fd8a3160510e22670ec3bc && AFOL_GITLEAKS_PATH=/home/ozy/.local/share/mise/installs/go-github-com-zricethezav-gitleaks-v8/8.30.1/bin/gitleaks AFOL_OSV_SCANNER_PATH=/home/ozy/.local/share/mise/installs/go-github-com-google-osv-scanner-v2-cmd-osv-scanner/2.5.0/bin/osv-scanner TOKF_DB_PATH=/home/ozy/tmp/tokf-afol-observed-proof.db tokf --no-mask-exit-code err bun run validate:release && bun run public:audit; exit_code=1)
- T-01 attempt=1 evidence_id=E-20260823120817846-5e955c: failed (git -C /home/ozy/tmp/afol-public-observed-09fd89fd merge-base --is-ancestor 09fd89fda14c40c5a4fd8a3160510e22670ec3bc HEAD && cd /home/ozy/tmp/afol-public-observed-09fd89fd && AFOL_GITLEAKS_PATH=/home/ozy/.local/share/mise/installs/go-github-com-zricethezav-gitleaks-v8/8.30.1/bin/gitleaks AFOL_OSV_SCANNER_PATH=/home/ozy/.local/share/mise/installs/go-github-com-google-osv-scanner-v2-cmd-osv-scanner/2.5.0/bin/osv-scanner TOKF_DB_PATH=/home/ozy/tmp/tokf-afol-observed-proof.db tokf --no-mask-exit-code err bun run validate:release && bun run public:audit; exit_code=129)
- T-01 attempt=1 evidence_id=E-20260823122412821-0ea873: passed (external receipt public-cutover-09fd89fd-20260823 harness codex-shell run validate-release-09fd89fd-20260823; exit_code=n/a)
- T-01 attempt=1 evidence_id=E-20260823122421813-787d0d authorizing: passed (bun --cwd /home/ozy/tmp/afol-public-observed-09fd89fd run public:audit; exit_code=0)
