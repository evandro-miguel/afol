#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

export type ScanMode = "deps" | "secrets";
type ScanRequirement = "informative" | "required";

export function supportedDependencyLockfile(
	cwd = process.cwd(),
): string | null {
	const lockfiles = [
		"bun.lock",
		"package-lock.json",
		"npm-shrinkwrap.json",
		"yarn.lock",
		"pnpm-lock.yaml",
	];
	return lockfiles.find((path) => existsSync(`${cwd}/${path}`)) ?? null;
}

function parseRequirement(args: string[]): ScanRequirement {
	return args.includes("--required") ? "required" : "informative";
}

function main(args: string[]): void {
	const mode = args[0] as ScanMode | undefined;
	const requirement = parseRequirement(args.slice(1));

	if (mode === "deps") {
		const lockfile = supportedDependencyLockfile();
		if (!lockfile) {
			if (requirement === "required") {
				console.error(
					"No OSV-supported dependency lockfile found; required dependency scan cannot run.",
				);
				process.exit(1);
			}

			console.log(
				"No OSV-supported dependency lockfile found; skipping dependency scan (informative).",
			);
			process.exit(0);
		}

		runOptionalScan({
			binaries: ["osv-scanner", "osv"],
			args: ["scan", "--lockfile", lockfile],
			missingMessage:
				"osv-scanner not installed; skipping dependency scan (informative).",
			missingRequiredMessage:
				"osv-scanner not installed; required dependency scan cannot run.",
			requirement,
		});
		process.exit(0);
	}

	if (mode === "secrets") {
		runOptionalScan({
			binaries: ["gitleaks"],
			args: [
				"detect",
				"--no-git",
				"-v",
				"--redact",
				"--exit-code",
				"1",
				"--source",
				".",
			],
			missingMessage:
				"gitleaks not installed; skipping secret scan (informative).",
			missingRequiredMessage:
				"gitleaks not installed; required secret scan cannot run.",
			requirement,
		});
		process.exit(0);
	}

	console.error(
		"Usage: bun run cli/dev/security-scan.ts <deps|secrets> [--required]",
	);
	process.exit(1);
}

function runOptionalScan(opts: {
	binaries: string[];
	args: string[];
	missingMessage: string;
	missingRequiredMessage: string;
	requirement: ScanRequirement;
}): void {
	for (const binary of opts.binaries) {
		const result = spawnSync(binary, opts.args, {
			stdio: "inherit",
			shell: false,
		});

		if (result.error) {
			if (
				String((result.error as Error & { code?: string }).code) === "ENOENT"
			) {
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

	if (opts.requirement === "required") {
		console.error(opts.missingRequiredMessage);
		process.exit(1);
	}

	console.log(opts.missingMessage);
}

if (import.meta.main) {
	main(process.argv.slice(2));
}
