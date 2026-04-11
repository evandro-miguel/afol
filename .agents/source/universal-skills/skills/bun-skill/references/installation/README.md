---
description: Bun installation methods, system requirements, and troubleshooting.
metadata:
  tags: "bun, installation, setup, requirements, troubleshooting"
---

# Bun Installation

Official installation methods and system requirements for Bun.

## Quick Install

### macOS & Linux

```bash
curl -fsSL https://bun.com/install | bash
```

**Requirements:**

- `unzip` package installed
- Linux Kernel 5.6+ (minimum 5.1)
- Check kernel: `uname -r`

### Windows

```powershell
powershell -c "irm bun.sh/install.ps1|iex"
```

**Requirements:**

- Windows 10 version 1809 or later

### Package Managers

```bash
# npm
npm install -g bun

# Homebrew
brew install oven-sh/bun/bun

# Scoop
scoop install bun
```

### Docker

```bash
# Pull image
docker pull oven/bun

# Run
docker run --rm --init --ulimit memlock=-1:-1 oven/bun

# Variants
docker pull oven/bun:debian
docker pull oven/bun:slim
docker pull oven/bun:distroless
docker pull oven/bun:alpine
```

## Verification

```bash
# Check version
bun --version
# Output: 1.x.y

# Check precise commit
bun --revision
# Output: 1.x.y+b7982ac13189
```

## PATH Configuration

If `bun: command not found`, add to PATH:

### macOS & Linux

Add to `~/.bashrc`, `~/.zshrc`, or `~/.config/fish/config.fish`:

```bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
```

Then reload:

```bash
source ~/.bashrc  # or ~/.zshrc
```

### Windows

```powershell
[System.Environment]::SetEnvironmentVariable(
  "Path",
  [System.Environment]::GetEnvironmentVariable("Path", "User") + ";$env:USERPROFILE\.bun\bin",
  [System.EnvironmentVariableTarget]::User
)
```

Restart terminal after setting PATH.

## Upgrading

```bash
# Upgrade to latest stable
bun upgrade

# Upgrade to canary (untested, latest commits)
bun upgrade --canary

# Switch back to stable
bun upgrade --stable
```

**Note:** Use package manager commands if installed via Homebrew/Scoop:

- Homebrew: `brew upgrade bun`
- Scoop: `scoop update bun`

## Installing Specific Versions

### Linux & macOS

```bash
curl -fsSL https://bun.com/install | bash -s "bun-v1.3.3"
```

### Windows

```powershell
iex "& {$(irm https://bun.com/install.ps1)} -Version 1.3.3"
```

## CPU Requirements

### Standard Builds (x64)

Requires AVX and AVX2 instructions:

| Platform | Intel | AMD |
|----------|-------|-----|
| x64 | Haswell (4th gen Core) or newer | Excavator or newer |

### Baseline Builds (x64-baseline)

For older CPUs without AVX2:

| Platform | Intel | AMD |
|----------|-------|-----|
| x64-baseline | Nehalem (1st gen Core) or newer | Bulldozer or newer |

**Warning:** Baseline builds are slower. Use only if you encounter "Illegal Instruction" errors.

**Minimum Requirements:**

- SSE4.2 extension required
- macOS 13.0+ required for Apple Silicon

## Direct Downloads

Download binaries directly from GitHub releases:

| Platform | Download |
|----------|----------|
| Linux x64 | [bun-linux-x64.zip](https://github.com/oven-sh/bun/releases/latest/download/bun-linux-x64.zip) |
| Linux x64 Baseline | [bun-linux-x64-baseline.zip](https://github.com/oven-sh/bun/releases/latest/download/bun-linux-x64-baseline.zip) |
| Linux ARM64 | [bun-linux-aarch64.zip](https://github.com/oven-sh/bun/releases/latest/download/bun-linux-aarch64.zip) |
| Windows x64 | [bun-windows-x64.zip](https://github.com/oven-sh/bun/releases/latest/download/bun-windows-x64.zip) |
| Windows x64 Baseline | [bun-windows-x64-baseline.zip](https://github.com/oven-sh/bun/releases/latest/download/bun-windows-x64-baseline.zip) |
| macOS ARM64 | [bun-darwin-aarch64.zip](https://github.com/oven-sh/bun/releases/latest/download/bun-darwin-aarch64.zip) |
| macOS x64 | [bun-darwin-x64.zip](https://github.com/oven-sh/bun/releases/latest/download/bun-darwin-x64.zip) |

### Musl Binaries (Alpine Linux, Void Linux)

- [Linux x64 musl](https://github.com/oven-sh/bun/releases/latest/download/bun-linux-x64-musl.zip)
- [Linux x64 musl baseline](https://github.com/oven-sh/bun/releases/latest/download/bun-linux-x64-musl-baseline.zip)
- [Linux ARM64 musl](https://github.com/oven-sh/bun/releases/latest/download/bun-linux-aarch64-musl.zip)

**Use musl if you see:** `bun: /lib/x86_64-linux-gnu/libm.so.6: version GLIBC_2.29 not found`

## Uninstall

```bash
# macOS & Linux
rm -rf ~/.bun

# Windows
powershell -c ~\.bun\uninstall.ps1

# Package Managers
npm uninstall -g bun
brew uninstall bun
scoop uninstall bun
```

## Troubleshooting

### "command not found" after installation

1. Verify binary exists: `ls ~/.bun/bin/bun`
2. Add to PATH (see PATH Configuration above)
3. Restart terminal

### "Illegal Instruction" error

Your CPU doesn't support AVX2. Use baseline build:

```bash
curl -fsSL https://bun.com/install | bash -s "bun-v1.3.3"
# Download x64-baseline variant manually
```

### GLIBC version errors (Linux)

Use musl binary for distributions without glibc:

```bash
# Download musl variant from releases page
```

### Windows installation fails

- Ensure Windows 10 version 1809 or later
- Run PowerShell as Administrator if needed
- Check Windows Defender/antivirus isn't blocking

## Environment Variables

| Variable | Description |
|----------|-------------|
| `BUN_INSTALL` | Installation directory (default: `~/.bun`) |
| `PATH` | Must include `$BUN_INSTALL/bin` |

---

*Source: Official Bun Documentation - bun.com*
