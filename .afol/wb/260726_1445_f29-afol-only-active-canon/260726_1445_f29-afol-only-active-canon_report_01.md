# Report: 260726_1445_f29-afol-only-active-canon

## Summary
Retired active legacy config authority with verified archive, canonical fixture/template parity, and explicit offline OSV limitation.

## Tasks
- T-01: done — Migrate active configuration authority to AFOL-only canon with verified legacy archive attempt=1

## Evidence
- T-01: passed (bun test cli/tests/active-canon-migration.test.ts; exit_code=n/a)
- T-01: passed (bun run typecheck; exit_code=n/a)
- T-01: passed (bun run manifest:check; exit_code=n/a)
- T-01: passed (PATH=/tmp/afol-tool-shims:$PATH bun run template:check; exit_code=n/a)
- T-01: passed (./afol validate project --check-drift --json; exit_code=n/a)
- T-01: passed (bun test cli/tests/file-command-unit.test.ts; exit_code=n/a)
- T-01: passed (bun test cli/tests/mutation-safety.test.ts; exit_code=n/a)
- T-01: passed (bun test cli/tests/project-root.test.ts; exit_code=n/a)
- T-01: passed (bash -lc 'set -euo pipefail; test ! -e node_modules; test ! -L node_modules; install -d -m 700 /tmp/afol-bun-local /tmp/afol-bun-tmp; ln -s /home/maku/dev/apps/afol/node_modules node_modules; cleanup() { unlink node_modules; }; trap cleanup EXIT INT TERM; test "$(jq -r .version node_modules/@biomejs/biome/package.json)" = "2.4.16"; BUN_INSTALL=/tmp/afol-bun-local BUN_TMPDIR=/tmp/afol-bun-tmp TMPDIR=/tmp/afol-bun-tmp bun run template:check'; exit_code=n/a)
- T-01: passed (bun test cli/tests/active-canon-migration.test.ts; exit_code=n/a)
- T-01: failed (bash -lc 'set -euo pipefail; test "$PWD" = "/tmp/afol-f29-active-canon"; cleanup() { rm -rf -- /tmp/afol-f29-active-canon/node_modules; }; trap cleanup EXIT INT TERM; cleanup; bun install --offline --frozen-lockfile --ignore-scripts; bun run template:check'; exit_code=n/a)
- T-01: failed (set -euo pipefail; [ "$PWD" = "/tmp/afol-f29-active-canon" ]; cleanup() { rm -rf -- /tmp/afol-f29-active-canon/node_modules /tmp/afol-f29-bun-tmp; }; trap cleanup EXIT INT TERM; cleanup; install -d /tmp/afol-f29-bun-tmp; export BUN_TMPDIR=/tmp/afol-f29-bun-tmp; bun install --offline --frozen-lockfile --ignore-scripts; bun run template:check; cleanup; trap - EXIT INT TERM; exit_code=n/a)
- T-01: passed (bun test cli/tests/template-source-parity.test.ts; exit_code=n/a)
- T-01: passed (bun test cli/tests/template-policy.test.ts; exit_code=n/a)
- T-01: passed (bun test cli/tests/active-canon-migration.test.ts; exit_code=n/a)
- T-01: passed (bun run manifest:check; exit_code=n/a)
- T-01: passed (git diff --check && git diff --cached --check; exit_code=n/a)
- T-01: passed (bun test cli/tests/template-source-parity.test.ts; exit_code=n/a)
- T-01: passed (git diff --check && git diff --cached --check; exit_code=n/a)
- T-01: passed (/tmp/afol-security-tools-final/gitleaks git --redact=100 --no-banner --no-color . && /tmp/afol-security-tools-final/gitleaks dir --redact=100 --no-banner --no-color .; exit_code=n/a)
- T-01: failed (/tmp/afol-security-tools-final/osv-scanner scan source --offline --offline-vulnerabilities --recursive .; exit_code=n/a)
- T-01: passed (git diff --quiet 532345f -- package.json bun.lock; exit_code=n/a)
- T-01: passed (bun test cli/tests/template-source-parity.test.ts; exit_code=n/a)
- T-01: passed (bun test cli/tests/template-policy.test.ts; exit_code=n/a)
- T-01: passed (bun test cli/tests/active-canon-migration.test.ts; exit_code=n/a)
- T-01: passed (bun run manifest:check; exit_code=n/a)
- T-01: passed (./afol local-state rebuild --json; exit_code=n/a)
- T-01: passed (./afol validate project --check-drift --json; exit_code=n/a)
- T-01: passed (git diff --check && git diff --cached --check; exit_code=n/a)
- T-01: failed (git diff --check && git diff --cached --check; exit_code=128)
- T-01: passed (git diff --check; exit_code=0)
