# Install, upgrade, rollback, and uninstall

The executable and its provenance sidecar form one installation. A version
string alone is not proof of an upgrade or rollback because two builds can
report the same version. Record and compare SHA-256 hashes at every phase.
Run the selected blocks below in one Bash session and in order. Safety-critical
blocks enable fail-fast behavior so a failed check stops before replacement.

## Verify the candidate

For a source build, run from the clean public repository root:

```bash
set -euo pipefail
bun install --frozen-lockfile
bun run build
bun run release:provenance
AFOL_CANDIDATE="$PWD/dist/afol"
AFOL_CHECKSUM="$PWD/dist/afol.sha256"
AFOL_PROVENANCE="$PWD/dist/afol.provenance.json"
sha256sum -c "$AFOL_CHECKSUM"
```

For a staged standalone release, run from its extracted directory and set:

```bash
set -euo pipefail
AFOL_CANDIDATE="$PWD/afol-linux-x64"
AFOL_CHECKSUM="$PWD/afol-linux-x64.sha256"
AFOL_PROVENANCE="$PWD/provenance.json"
sha256sum -c "$AFOL_CHECKSUM"
```

In either case, confirm that the provenance binds the candidate bytes:

```bash
set -euo pipefail
: "${AFOL_CANDIDATE:?select a candidate first}"
: "${AFOL_PROVENANCE:?select candidate provenance first}"
AFOL_CANDIDATE_SHA=$(sha256sum "$AFOL_CANDIDATE" | awk '{print $1}')
test "$(jq -r '.sha256' "$AFOL_PROVENANCE")" = "$AFOL_CANDIDATE_SHA"
```

Do not install a standalone download unless its release also supplies the
documented security, SBOM, license, and compliance artifacts.

## Preserve the current installation

Choose a durable recovery directory and save the current bytes before the
first replacement command:

```bash
set -euo pipefail
AFOL_INSTALL_DIR="$HOME/.local/bin"
AFOL_LIVE_BINARY="$AFOL_INSTALL_DIR/afol"
AFOL_LIVE_PROVENANCE="$AFOL_INSTALL_DIR/afol.provenance.json"
AFOL_RECOVERY_ROOT="$HOME/.local/state/afol/recovery"
install -d "$AFOL_INSTALL_DIR"
install -d -m 700 "$AFOL_RECOVERY_ROOT"
AFOL_RECOVERY_DIR=$(mktemp -d "$AFOL_RECOVERY_ROOT/$(date -u +%Y%m%dT%H%M%SZ).XXXXXX")
if test -x "$AFOL_LIVE_BINARY"; then
  install -m 755 "$AFOL_LIVE_BINARY" "$AFOL_RECOVERY_DIR/afol"
  (cd "$AFOL_RECOVERY_DIR" && sha256sum afol > afol.sha256)
  "$AFOL_RECOVERY_DIR/afol" --version > "$AFOL_RECOVERY_DIR/version.txt"
fi
if test -f "$AFOL_LIVE_PROVENANCE"; then
  install -m 644 "$AFOL_LIVE_PROVENANCE" "$AFOL_RECOVERY_DIR/afol.provenance.json"
  (cd "$AFOL_RECOVERY_DIR" && \
    sha256sum afol.provenance.json > afol.provenance.json.sha256)
else
  touch "$AFOL_RECOVERY_DIR/no-provenance"
fi
```

Keep `AFOL_RECOVERY_DIR` until the new installation and project smoke tests
have passed.

## Install or upgrade

Stage both files in the destination, verify the staged executable, then move
the provenance sidecar and executable into place. The executable moves last:

```bash
set -euo pipefail
: "${AFOL_CANDIDATE:?verify the candidate first}"
: "${AFOL_PROVENANCE:?verify candidate provenance first}"
: "${AFOL_CANDIDATE_SHA:?verify the candidate hash first}"
: "${AFOL_INSTALL_DIR:?preserve the current installation first}"
: "${AFOL_LIVE_BINARY:?preserve the current installation first}"
: "${AFOL_LIVE_PROVENANCE:?preserve the current installation first}"
AFOL_STAGE_DIR=$(mktemp -d "$AFOL_INSTALL_DIR/.afol-install.XXXXXX")
install -m 755 "$AFOL_CANDIDATE" "$AFOL_STAGE_DIR/afol"
install -m 644 "$AFOL_PROVENANCE" "$AFOL_STAGE_DIR/afol.provenance.json"
test "$(sha256sum "$AFOL_STAGE_DIR/afol" | awk '{print $1}')" = "$AFOL_CANDIDATE_SHA"
mv "$AFOL_STAGE_DIR/afol.provenance.json" "$AFOL_LIVE_PROVENANCE"
mv "$AFOL_STAGE_DIR/afol" "$AFOL_LIVE_BINARY"
rmdir "$AFOL_STAGE_DIR"
test ! -L "$AFOL_LIVE_BINARY"
test "$(sha256sum "$AFOL_LIVE_BINARY" | awk '{print $1}')" = "$AFOL_CANDIDATE_SHA"
test "$(jq -r '.sha256' "$AFOL_LIVE_PROVENANCE")" = "$AFOL_CANDIDATE_SHA"
"$AFOL_LIVE_BINARY" --version
```

Run a smoke in a disposable Git repository outside the AFOL source checkout:

```bash
set -euo pipefail
: "${AFOL_LIVE_BINARY:?install the candidate first}"
AFOL_SMOKE_DIR=$(mktemp -d)
cd "$AFOL_SMOKE_DIR"
git init -q
"$AFOL_LIVE_BINARY" init
"$AFOL_LIVE_BINARY" qt install-smoke -t "Verify installed AFOL" -c "git diff --check"
"$AFOL_LIVE_BINARY" validate project --json
```

## Project template upgrades

Before upgrading, commit or back up project-owned changes and run:

```bash
afol update check
afol update preview
afol update apply --dry-run
```

Apply only after reviewing the ownership classifications. AFOL journals managed
mutations and reports conflicts instead of silently replacing project-owned
files.

## Roll back the executable

Use the exact recovery directory created before the upgrade:

```bash
set -euo pipefail
: "${AFOL_RECOVERY_DIR:?select the exact recovery directory}"
: "${AFOL_INSTALL_DIR:?set the installation directory}"
: "${AFOL_LIVE_BINARY:?set the live binary path}"
: "${AFOL_LIVE_PROVENANCE:?set the live provenance path}"
test -x "$AFOL_RECOVERY_DIR/afol"
(cd "$AFOL_RECOVERY_DIR" && sha256sum -c afol.sha256)
AFOL_ROLLBACK_DIR=$(mktemp -d "$AFOL_INSTALL_DIR/.afol-rollback.XXXXXX")
install -m 755 "$AFOL_RECOVERY_DIR/afol" "$AFOL_ROLLBACK_DIR/afol"
if test -f "$AFOL_RECOVERY_DIR/afol.provenance.json"; then
  (cd "$AFOL_RECOVERY_DIR" && sha256sum -c afol.provenance.json.sha256)
  install -m 644 "$AFOL_RECOVERY_DIR/afol.provenance.json" \
    "$AFOL_ROLLBACK_DIR/afol.provenance.json"
  mv "$AFOL_ROLLBACK_DIR/afol.provenance.json" "$AFOL_LIVE_PROVENANCE"
else
  test -f "$AFOL_RECOVERY_DIR/no-provenance"
  rm -f "$AFOL_LIVE_PROVENANCE"
fi
mv "$AFOL_ROLLBACK_DIR/afol" "$AFOL_LIVE_BINARY"
rmdir "$AFOL_ROLLBACK_DIR"
test ! -L "$AFOL_LIVE_BINARY"
"$AFOL_LIVE_BINARY" --version
sha256sum "$AFOL_LIVE_BINARY"
```

To roll back a scaffold mutation, follow its mutation report and journal.
Never delete `.afol/` wholesale: it contains task, evidence, and recovery
state.

## Uninstall

Uninstall only the operator executable and its provenance sidecar. Project
state remains intact:

```bash
set -euo pipefail
: "${AFOL_LIVE_BINARY:?set the live binary path}"
: "${AFOL_LIVE_PROVENANCE:?set the live provenance path}"
rm -f "$AFOL_LIVE_BINARY" "$AFOL_LIVE_PROVENANCE"
test ! -e "$AFOL_LIVE_BINARY"
test ! -e "$AFOL_LIVE_PROVENANCE"
```

This procedure is local and user-scoped. It does not define hosted updates or
publish a standalone release.
