#!/usr/bin/env bun

import { spawnSync } from "node:child_process";

type ScanMode = "deps" | "secrets";

const mode = process.argv[2] as ScanMode | undefined;

if (mode === "deps") {
  runOptionalScan({
    binary: "osv",
    args: ["scan", "."],
    missingMessage: "osv not installed; skipping dependency scan (informative).",
  });
  process.exit(0);
}

if (mode === "secrets") {
  runOptionalScan({
    binary: "gitleaks",
    args: ["detect", "--no-git", "-v", "--redact", "--exit-code", "1", "--source", "."],
    missingMessage: "gitleaks not installed; skipping secret scan (informative).",
  });
  process.exit(0);
}

console.error("Usage: bun run cli/dev/security-scan.ts <deps|secrets>");
process.exit(1);

function runOptionalScan(opts: {
  binary: string;
  args: string[];
  missingMessage: string;
}): void {
  const result = spawnSync(opts.binary, opts.args, {
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    if (String((result.error as Error & { code?: string }).code) === "ENOENT") {
      console.log(opts.missingMessage);
      return;
    }

    console.error(`${opts.binary} failed to start: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
