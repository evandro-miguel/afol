#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

type ScanMode = "deps" | "secrets";

const mode = process.argv[2] as ScanMode | undefined;

if (mode === "deps") {
  const lockfile = supportedDependencyLockfile();
  if (!lockfile) {
    console.log("No OSV-supported dependency lockfile found; skipping dependency scan (informative).");
    process.exit(0);
  }

  runOptionalScan({
    binaries: ["osv-scanner", "osv"],
    args: ["scan", "--lockfile", lockfile],
    missingMessage: "osv-scanner not installed; skipping dependency scan (informative).",
  });
  process.exit(0);
}

if (mode === "secrets") {
  runOptionalScan({
    binaries: ["gitleaks"],
    args: ["detect", "--no-git", "-v", "--redact", "--exit-code", "1", "--source", "."],
    missingMessage: "gitleaks not installed; skipping secret scan (informative).",
  });
  process.exit(0);
}

console.error("Usage: bun run cli/dev/security-scan.ts <deps|secrets>");
process.exit(1);

function runOptionalScan(opts: {
  binaries: string[];
  args: string[];
  missingMessage: string;
}): void {
  for (const binary of opts.binaries) {
    const result = spawnSync(binary, opts.args, {
      stdio: "inherit",
      shell: false,
    });

    if (result.error) {
      if (String((result.error as Error & { code?: string }).code) === "ENOENT") {
        continue;
      }

      console.error(`${binary} failed to start: ${result.error.message}`);
      process.exit(1);
    }

    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }

    return;
  }

  console.log(opts.missingMessage);
}

function supportedDependencyLockfile(): string | null {
  const lockfiles = ["package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml"];
  return lockfiles.find((path) => existsSync(path)) ?? null;
}
