#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

export type ScanMode = "deps" | "secrets";
type ScanRequirement = "informative" | "required" | "release";

export type SecurityScanStatus =
	| "passed"
	| "failed"
	| "errored"
	| "skipped"
	| "waived";

export type SecurityScanOutcome = {
	tool: string;
	kind: ScanMode;
	mode: ScanRequirement;
	status: SecurityScanStatus;
	reason?: string;
	waiver_required?: boolean;
};

type ScanRunResult = {
	outcome: SecurityScanOutcome;
	exitCode: number;
	stdout?: string;
	stderr?: string;
};

const KIND_LABELS: Record<ScanMode, string> = {
	deps: "dependency",
	secrets: "secret",
};

const SCAN_TOOLS: Record<ScanMode, string[]> = {
	deps: ["osv-scanner", "osv"],
	secrets: ["gitleaks"],
};

export const RELEASE_SECURITY_SCANNERS: Array<{
	tool: string;
	kind: ScanMode;
}> = [
	{ tool: "osv-scanner", kind: "deps" },
	{ tool: "gitleaks", kind: "secrets" },
];

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
	if (args.includes("--release")) {
		return "release";
	}
	return args.includes("--required") ? "required" : "informative";
}

function buildMissingToolOutcome(opts: {
	tool: string;
	kind: ScanMode;
	mode: ScanRequirement;
}): SecurityScanOutcome {
	const label = KIND_LABELS[opts.kind];
	const reasonByMode: Record<ScanRequirement, string> = {
		informative: `${opts.tool} not installed; skipping ${label} scan (informative).`,
		required: `${opts.tool} not installed; required ${label} scan cannot run.`,
		release: `${opts.tool} missing binary; release ${label} scan cannot run.`,
	};
	const statusByMode: Record<ScanRequirement, SecurityScanStatus> = {
		informative: "skipped",
		required: "failed",
		release: "waived",
	};
	return {
		tool: opts.tool,
		kind: opts.kind,
		mode: opts.mode,
		status: statusByMode[opts.mode],
		reason: reasonByMode[opts.mode],
		waiver_required: opts.mode !== "informative",
	};
}

function buildCommandOutcome(opts: {
	tool: string;
	kind: ScanMode;
	mode: ScanRequirement;
	status: number;
}): SecurityScanOutcome {
	const waiver_required = opts.mode !== "informative";
	return {
		tool: opts.tool,
		kind: opts.kind,
		mode: opts.mode,
		status: opts.status === 0 ? "passed" : "failed",
		...(opts.status === 0
			? {}
			: { reason: `${opts.tool} exited with status ${opts.status}.` }),
		...(waiver_required ? { waiver_required } : {}),
	};
}

function buildProbeErrorOutcome(opts: {
	tool: string;
	kind: ScanMode;
	mode: ScanRequirement;
	error: Error & { code?: string };
}): SecurityScanOutcome {
	const waiver_required = opts.mode !== "informative";
	const code = opts.error.code ?? "unknown";
	return {
		tool: opts.tool,
		kind: opts.kind,
		mode: opts.mode,
		status: "errored",
		reason: `${opts.tool} probe failed with ${code}: ${opts.error.message}`,
		...(waiver_required ? { waiver_required } : {}),
	};
}

function buildReleaseScannerOutcome(opts: {
	tool: string;
	kind: ScanMode;
	mode: ScanRequirement;
	env?: NodeJS.ProcessEnv;
}): SecurityScanOutcome {
	const probe = spawnSync(opts.tool, ["--version"], {
		encoding: "utf8",
		env: opts.env,
		shell: false,
		stdio: "ignore",
	});

	if (probe.error) {
		const code = String((probe.error as Error & { code?: string }).code);
		if (code === "ENOENT") {
			return buildMissingToolOutcome(opts);
		}

		return buildProbeErrorOutcome({
			...opts,
			error: probe.error as Error & { code?: string },
		});
	}

	if ((probe.status ?? 0) !== 0) {
		return buildCommandOutcome({
			tool: opts.tool,
			kind: opts.kind,
			mode: opts.mode,
			status: probe.status ?? 1,
		});
	}

	return {
		tool: opts.tool,
		kind: opts.kind,
		mode: opts.mode,
		status: "skipped",
		reason: `${opts.tool} available; scan not executed during provenance generation.`,
	};
}

export function buildReleaseSecurityScanOutcomes(
	env?: NodeJS.ProcessEnv,
): SecurityScanOutcome[] {
	return RELEASE_SECURITY_SCANNERS.map((scanner) =>
		buildReleaseScannerOutcome({
			...scanner,
			mode: "release",
			...(env ? { env } : {}),
		}),
	);
}

function runOptionalScan(opts: {
	binaries: string[];
	args: string[];
	kind: ScanMode;
	mode: ScanRequirement;
	missingMessage: string;
	missingRequiredMessage: string;
	missingReleaseMessage: string;
	json: boolean;
}): ScanRunResult {
	const primaryTool = opts.binaries[0];
	if (!primaryTool) {
		throw new Error("No scan binaries configured.");
	}

	for (const binary of opts.binaries) {
		const result = spawnSync(binary, opts.args, {
			encoding: opts.json ? "utf8" : undefined,
			shell: false,
			stdio: opts.json ? "pipe" : "inherit",
		});

		if (result.error) {
			const error = result.error as Error & { code?: string };
			if (String(error.code) === "ENOENT") {
				continue;
			}

			const stderr = `${binary} failed to start: ${error.message}`;
			return {
				outcome: buildProbeErrorOutcome({
					tool: binary,
					kind: opts.kind,
					mode: opts.mode,
					error,
				}),
				exitCode: 1,
				stderr,
			};
		}

		if (result.status !== 0) {
			const stderr = opts.json ? `${result.stderr ?? ""}`.trim() : "";
			return {
				outcome: buildCommandOutcome({
					tool: binary,
					kind: opts.kind,
					mode: opts.mode,
					status: result.status ?? 1,
				}),
				exitCode: result.status ?? 1,
				...(opts.json && stderr ? { stderr } : {}),
			};
		}

		return {
			outcome: buildCommandOutcome({
				tool: binary,
				kind: opts.kind,
				mode: opts.mode,
				status: 0,
			}),
			exitCode: 0,
		};
	}

	if (opts.mode === "required") {
		return {
			outcome: buildMissingToolOutcome({
				tool: primaryTool,
				kind: opts.kind,
				mode: opts.mode,
			}),
			exitCode: 1,
			stderr: opts.missingRequiredMessage,
		};
	}

	return {
		outcome: buildMissingToolOutcome({
			tool: primaryTool,
			kind: opts.kind,
			mode: opts.mode,
		}),
		exitCode: 0,
		stdout:
			opts.mode === "release"
				? opts.missingReleaseMessage
				: opts.missingMessage,
	};
}

function main(args: string[]): void {
	const mode = args[0] as ScanMode | undefined;
	const requirement = parseRequirement(args.slice(1));
	const json = args.includes("--json") || args.includes("-j");

	if (mode === "deps") {
		const lockfile = supportedDependencyLockfile();
		if (!lockfile) {
			const outcome = buildMissingToolOutcome({
				tool: "dependency-lockfile",
				kind: "deps",
				mode: requirement,
			});
			const messageByMode: Record<ScanRequirement, string> = {
				informative:
					"No OSV-supported dependency lockfile found; skipping dependency scan (informative).",
				required:
					"No OSV-supported dependency lockfile found; required dependency scan cannot run.",
				release:
					"No OSV-supported dependency lockfile found; release dependency scan cannot run.",
			};
			if (json) {
				console.log(
					JSON.stringify({
						...outcome,
						tool: "dependency-lockfile",
						reason: messageByMode[requirement],
					}),
				);
			} else if (requirement === "required") {
				console.error(messageByMode[requirement]);
			} else {
				console.log(messageByMode[requirement]);
			}
			process.exit(requirement === "required" ? 1 : 0);
		}

		const result = runOptionalScan({
			binaries: SCAN_TOOLS.deps,
			args: ["scan", "--lockfile", lockfile],
			kind: "deps",
			mode: requirement,
			missingMessage:
				"osv-scanner not installed; skipping dependency scan (informative).",
			missingRequiredMessage:
				"osv-scanner not installed; required dependency scan cannot run.",
			missingReleaseMessage:
				"osv-scanner not installed; release dependency scan cannot run.",
			json,
		});
		if (json) {
			console.log(JSON.stringify(result.outcome));
		} else if (result.stdout) {
			console.log(result.stdout);
		}
		if (result.stderr) {
			console.error(result.stderr);
		}
		process.exit(result.exitCode);
	}

	if (mode === "secrets") {
		const result = runOptionalScan({
			binaries: SCAN_TOOLS.secrets,
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
			kind: "secrets",
			mode: requirement,
			missingMessage:
				"gitleaks not installed; skipping secret scan (informative).",
			missingRequiredMessage:
				"gitleaks not installed; required secret scan cannot run.",
			missingReleaseMessage:
				"gitleaks not installed; release secret scan cannot run.",
			json,
		});
		if (json) {
			console.log(JSON.stringify(result.outcome));
		} else if (result.stdout) {
			console.log(result.stdout);
		}
		if (result.stderr) {
			console.error(result.stderr);
		}
		process.exit(result.exitCode);
	}

	console.error(
		"Usage: bun run cli/dev/security-scan.ts <deps|secrets> [--required|--release] [--json]",
	);
	process.exit(1);
}

if (import.meta.main) {
	main(process.argv.slice(2));
}
