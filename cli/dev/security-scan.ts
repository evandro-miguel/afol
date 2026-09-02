#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmodSync,
	existsSync,
	lstatSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join } from "node:path";
import { atomicWriteText } from "../services/io/atomic";
import { releaseArtifactPath } from "./build-release";
import {
	resolveExistingReleaseArtifact,
	resolveReleaseArtifact,
} from "./release-artifact";
import {
	assertReleaseOutputFileStable,
	assertSafeReleaseArtifact,
	prepareReleaseOutputFile,
} from "./release-output";

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
	version?: string;
	executable_path?: string;
	executable_sha256?: string;
	reason?: string;
	waiver_required?: boolean;
};

export type SecurityScanTarget = {
	artifact: string;
	artifact_sha256: string;
	commit_sha: string;
	lockfile: string;
	lock_sha256: string;
};

export type SecurityScanReport = {
	generated_at: string;
	mode: "release";
	target: SecurityScanTarget;
	target_errors?: string[];
	scans: SecurityScanOutcome[];
};

type ScanRunResult = {
	outcome: SecurityScanOutcome;
	exitCode: number;
	stdout?: string;
	stderr?: string;
};

export const RELEASE_SECURITY_EVIDENCE_PATH = "dist/security-scan.release.json";
export const DEFAULT_RELEASE_ARTIFACT = releaseArtifactPath("dist/afol");

const KIND_LABELS: Record<ScanMode, string> = {
	deps: "dependency",
	secrets: "secret",
};

const SCAN_TOOLS: Record<ScanMode, string[]> = {
	deps: ["osv-scanner"],
	secrets: ["gitleaks"],
};

const RELEASE_SCANNER_PATH_ENV: Record<string, string> = {
	"osv-scanner": "AFOL_OSV_SCANNER_PATH",
	gitleaks: "AFOL_GITLEAKS_PATH",
};

type ScannerIdentity = {
	executable_path: string;
	executable_sha256: string;
};

type ScannerFileIdentity = ScannerIdentity & {
	dev: string;
	ino: string;
	size: string;
};

type ReleaseScannerResolution =
	| { identity: ScannerFileIdentity; executable: string; bytes: Uint8Array }
	| { error: string };

type ImmutableScannerCopy =
	| { executable: string; cleanup: () => void }
	| { error: string };

function resolveToolExecutable(tool: string, env?: NodeJS.ProcessEnv): string {
	// Informative and required scans retain PATH discovery for local operator use.
	// Release scans resolve only the explicit, hash-recorded paths below.
	if (process.platform !== "win32") return tool;
	const pathValue =
		env?.PATH ?? env?.Path ?? process.env.PATH ?? process.env.Path;
	if (!pathValue) return tool;
	for (const directory of pathValue.split(delimiter)) {
		if (!directory) continue;
		for (const candidate of [
			`${tool}.exe`,
			`${tool}.cmd`,
			`${tool}.bat`,
			tool,
		]) {
			const resolved = join(directory, candidate);
			if (existsSync(resolved)) return resolved;
		}
	}
	return tool;
}

function hasReparsePoint(path: string): boolean {
	let current = path;
	while (true) {
		if (lstatSync(current).isSymbolicLink()) {
			return true;
		}
		const parent = dirname(current);
		if (parent === current) {
			return false;
		}
		current = parent;
	}
}

function sameScannerIdentity(
	left: ScannerFileIdentity,
	right: ScannerFileIdentity,
): boolean {
	return (
		left.executable_path === right.executable_path &&
		left.executable_sha256 === right.executable_sha256 &&
		left.dev === right.dev &&
		left.ino === right.ino &&
		left.size === right.size
	);
}

function inspectReleaseScannerExecutable(
	tool: string,
	variable: string,
	configuredPath: string,
): ReleaseScannerResolution {
	try {
		const before = lstatSync(configuredPath);
		if (hasReparsePoint(configuredPath)) {
			return {
				error: `release ${tool} scanner ${variable} must not traverse a symlink or reparse point`,
			};
		}
		if (!before.isFile()) {
			return {
				error: `release ${tool} scanner ${variable} must name a regular file`,
			};
		}
		const bytes = readFileSync(configuredPath);
		const after = lstatSync(configuredPath);
		if (
			String(before.dev) !== String(after.dev) ||
			String(before.ino) !== String(after.ino) ||
			Number(before.size) !== Number(after.size)
		) {
			return {
				error: `release ${tool} scanner ${variable} changed while its identity was read`,
			};
		}
		return {
			executable: configuredPath,
			bytes,
			identity: {
				executable_path: configuredPath,
				executable_sha256: sha256Hex(bytes),
				dev: String(before.dev),
				ino: String(before.ino),
				size: String(before.size),
			},
		};
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return {
			error: `release ${tool} scanner ${variable} is not an approved readable file: ${detail}`,
		};
	}
}

function materializeImmutableScannerCopy(
	tool: string,
	resolution: Exclude<ReleaseScannerResolution, { error: string }>,
): ImmutableScannerCopy {
	let directory: string | null = null;
	try {
		directory = mkdtempSync(join(tmpdir(), "afol-release-scanner-"));
		chmodSync(directory, 0o700);
		const executable = join(directory, basename(resolution.executable));
		writeFileSync(executable, resolution.bytes, {
			flag: "wx",
			mode: 0o500,
		});
		chmodSync(executable, 0o500);
		const copied = lstatSync(executable);
		if (
			!copied.isFile() ||
			sha256Hex(readFileSync(executable)) !==
				resolution.identity.executable_sha256
		) {
			throw new Error("immutable copy does not match the verified bytes");
		}
		chmodSync(directory, 0o500);
		return {
			executable,
			cleanup: () => {
				chmodSync(directory as string, 0o700);
				rmSync(directory as string, { recursive: true, force: true });
			},
		};
	} catch (error) {
		if (directory !== null) {
			rmSync(directory, { recursive: true, force: true });
		}
		return {
			error: `release ${tool} scanner could not create an immutable verified copy: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

function revalidateReleaseScannerExecutable(
	tool: string,
	env: NodeJS.ProcessEnv | undefined,
	expected: ScannerFileIdentity,
): string | null {
	const current = resolveReleaseScannerExecutable(tool, env);
	if ("error" in current) return current.error;
	if (!sameScannerIdentity(expected, current.identity)) {
		return `release ${tool} scanner changed after trust validation`;
	}
	return null;
}

function resolveReleaseScannerExecutable(
	tool: string,
	env?: NodeJS.ProcessEnv,
): ReleaseScannerResolution {
	const variable = RELEASE_SCANNER_PATH_ENV[tool];
	if (!variable) {
		return { error: `release scanner ${tool} has no approved path variable` };
	}
	const configuredPath = (env ?? process.env)[variable];
	if (!configuredPath) {
		return {
			error: `release ${tool} scan requires ${variable} to name an approved absolute binary; PATH discovery is not allowed`,
		};
	}
	if (!isAbsolute(configuredPath)) {
		return {
			error: `release ${tool} scanner ${variable} must be an absolute path`,
		};
	}

	return inspectReleaseScannerExecutable(tool, variable, configuredPath);
}

const MISSING_LOCKFILE_MESSAGES: Record<ScanRequirement, string> = {
	informative:
		"No OSV-supported dependency lockfile found; skipping dependency scan (informative).",
	required:
		"No OSV-supported dependency lockfile found; required dependency scan cannot run.",
	release:
		"No OSV-supported dependency lockfile found; release dependency scan cannot run.",
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

function sha256Hex(bytes: Uint8Array | string): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function runGitCommand(cwd: string, args: string[]): string {
	const result = spawnSync("git", args, {
		cwd,
		encoding: "utf8",
		shell: false,
	});
	if (result.error || result.status !== 0) {
		return "unknown";
	}
	const value = `${result.stdout ?? ""}`.trim();
	return value.length > 0 ? value : "unknown";
}

function buildReleaseSecurityTarget(
	cwd: string,
	artifact: string,
): { target: SecurityScanTarget; errors: string[] } {
	const resolved = resolveReleaseArtifact(cwd, releaseArtifactPath(artifact));
	artifact = resolved.artifact;
	const errors: string[] = [];
	const artifactPath = resolved.artifactPath;
	prepareReleaseOutputFile(cwd, artifactPath);
	const lockfile = supportedDependencyLockfile(cwd);
	const commitSha = runGitCommand(cwd, ["rev-parse", "HEAD"]);
	const target: SecurityScanTarget = {
		artifact,
		artifact_sha256: "unknown",
		commit_sha: commitSha,
		lockfile: lockfile ?? "unknown",
		lock_sha256: "unknown",
	};

	if (!existsSync(artifactPath)) {
		errors.push(`missing release artifact: ${artifact}`);
	} else {
		const existing = resolveExistingReleaseArtifact(cwd, artifact);
		assertSafeReleaseArtifact(cwd, existing.artifactPath);
		target.artifact_sha256 = sha256Hex(readFileSync(existing.artifactPath));
	}

	if (commitSha === "unknown") {
		errors.push("release commit_sha is unknown");
	}

	if (!lockfile) {
		errors.push("release dependency lockfile is unknown");
	} else {
		target.lock_sha256 = sha256Hex(readFileSync(join(cwd, lockfile)));
	}

	return { target, errors };
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
	const status = statusByMode[opts.mode];
	const waiverRequired = shouldRequireWaiver(opts.mode, status);
	return {
		tool: opts.tool,
		kind: opts.kind,
		mode: opts.mode,
		status,
		reason: reasonByMode[opts.mode],
		...(waiverRequired ? { waiver_required: true } : {}),
	};
}

function shouldRequireWaiver(
	mode: ScanRequirement,
	status: SecurityScanStatus,
): boolean {
	return mode !== "informative" && status !== "passed";
}

function buildCommandOutcome(opts: {
	tool: string;
	kind: ScanMode;
	mode: ScanRequirement;
	status: number;
	version?: string;
	identity?: ScannerIdentity;
	failureDetail?: string;
}): SecurityScanOutcome {
	const status = opts.status === 0 ? "passed" : "failed";
	const waiverRequired = shouldRequireWaiver(opts.mode, status);
	const failureReason = opts.failureDetail
		? `${opts.tool} exited with status ${opts.status}: ${opts.failureDetail}`
		: `${opts.tool} exited with status ${opts.status}.`;
	return {
		tool: opts.tool,
		kind: opts.kind,
		mode: opts.mode,
		status,
		...(opts.version ? { version: opts.version } : {}),
		...opts.identity,
		...(opts.status !== 0 && { reason: failureReason }),
		...(waiverRequired && { waiver_required: true }),
	};
}

function summarizeFailureOutput(output: string): string | undefined {
	const summary = output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.join(" ");
	if (!summary) {
		return undefined;
	}
	return summary.length > 500 ? `${summary.slice(0, 497)}...` : summary;
}

function probeToolVersion(
	tool: string,
	env?: NodeJS.ProcessEnv,
	executable?: string,
): string | undefined {
	const probe = spawnSync(
		executable ?? resolveToolExecutable(tool, env),
		["--version"],
		{
			encoding: "utf8",
			...(env ? { env } : {}),
			shell: false,
			stdio: "pipe",
		},
	);
	if (probe.error || (probe.status ?? 0) !== 0) {
		return undefined;
	}
	const version = `${probe.stdout || probe.stderr || ""}`.trim();
	return version.length > 0 ? version : undefined;
}

function buildProbeErrorOutcome(opts: {
	tool: string;
	kind: ScanMode;
	mode: ScanRequirement;
	error: Error & { code?: string };
	identity?: ScannerIdentity;
}): SecurityScanOutcome {
	const status: SecurityScanStatus = "errored";
	const waiverRequired = shouldRequireWaiver(opts.mode, status);
	const code = opts.error.code ?? "unknown";
	return {
		tool: opts.tool,
		kind: opts.kind,
		mode: opts.mode,
		status,
		...opts.identity,
		reason: `${opts.tool} probe failed with ${code}: ${opts.error.message}`,
		...(waiverRequired && { waiver_required: true }),
	};
}

function buildReleaseScannerOutcome(opts: {
	tool: string;
	kind: ScanMode;
	mode: ScanRequirement;
	env?: NodeJS.ProcessEnv;
}): SecurityScanOutcome {
	const resolution = resolveReleaseScannerExecutable(opts.tool, opts.env);
	if ("error" in resolution) {
		return buildReleaseScannerTrustErrorOutcome({
			...opts,
			reason: resolution.error,
		});
	}
	const beforeProbe = revalidateReleaseScannerExecutable(
		opts.tool,
		opts.env,
		resolution.identity,
	);
	if (beforeProbe) {
		return buildReleaseScannerTrustErrorOutcome({
			...opts,
			reason: beforeProbe,
		});
	}
	const probe = spawnSync(resolution.executable, ["--version"], {
		encoding: "utf8",
		env: opts.env,
		shell: false,
		stdio: "pipe",
	});
	const afterProbe = revalidateReleaseScannerExecutable(
		opts.tool,
		opts.env,
		resolution.identity,
	);
	if (afterProbe) {
		return buildReleaseScannerTrustErrorOutcome({
			...opts,
			reason: afterProbe,
		});
	}

	if (probe.error) {
		return buildProbeErrorOutcome({
			...opts,
			error: probe.error as Error & { code?: string },
			identity: resolution.identity,
		});
	}

	if ((probe.status ?? 0) !== 0) {
		return buildCommandOutcome({
			tool: opts.tool,
			kind: opts.kind,
			mode: opts.mode,
			status: probe.status ?? 1,
			identity: resolution.identity,
		});
	}

	const status: SecurityScanStatus = "skipped";
	const version = `${probe.stdout || probe.stderr || ""}`.trim();
	return {
		tool: opts.tool,
		kind: opts.kind,
		mode: opts.mode,
		status,
		...(version ? { version } : {}),
		...resolution.identity,
		reason: `${opts.tool} available; scan not executed during provenance generation.`,
		...(shouldRequireWaiver(opts.mode, status)
			? { waiver_required: true }
			: {}),
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
	args?: string[];
	commands?: string[][];
	cwd?: string;
	env?: NodeJS.ProcessEnv;
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
	const commands = opts.commands ?? [opts.args ?? []];

	for (const binary of opts.binaries) {
		let binaryMissing = false;
		const releaseResolution =
			opts.mode === "release"
				? resolveReleaseScannerExecutable(binary, opts.env)
				: undefined;
		if (releaseResolution && "error" in releaseResolution) {
			return {
				outcome: buildReleaseScannerTrustErrorOutcome({
					tool: binary,
					kind: opts.kind,
					mode: opts.mode,
					reason: releaseResolution.error,
				}),
				exitCode: 1,
				stderr: releaseResolution.error,
			};
		}
		let immutableCopy: Exclude<ImmutableScannerCopy, { error: string }> | null =
			null;
		try {
			if (releaseResolution) {
				const snapshot = materializeImmutableScannerCopy(
					binary,
					releaseResolution,
				);
				if ("error" in snapshot) {
					return {
						outcome: buildReleaseScannerTrustErrorOutcome({
							tool: binary,
							kind: opts.kind,
							mode: opts.mode,
							reason: snapshot.error,
						}),
						exitCode: 1,
						stderr: snapshot.error,
					};
				}
				immutableCopy = snapshot;
			}
			const executable =
				immutableCopy?.executable ?? resolveToolExecutable(binary, opts.env);
			const identity = releaseResolution?.identity;
			if (releaseResolution) {
				const beforeProbe = revalidateReleaseScannerExecutable(
					binary,
					opts.env,
					releaseResolution.identity,
				);
				if (beforeProbe) {
					return {
						outcome: buildReleaseScannerTrustErrorOutcome({
							tool: binary,
							kind: opts.kind,
							mode: opts.mode,
							reason: beforeProbe,
						}),
						exitCode: 1,
						stderr: beforeProbe,
					};
				}
			}
			const version = probeToolVersion(binary, opts.env, executable);
			if (releaseResolution) {
				const afterProbe = revalidateReleaseScannerExecutable(
					binary,
					opts.env,
					releaseResolution.identity,
				);
				if (afterProbe) {
					return {
						outcome: buildReleaseScannerTrustErrorOutcome({
							tool: binary,
							kind: opts.kind,
							mode: opts.mode,
							reason: afterProbe,
						}),
						exitCode: 1,
						stderr: afterProbe,
					};
				}
			}

			for (const commandArgs of commands) {
				if (releaseResolution) {
					const beforeScan = revalidateReleaseScannerExecutable(
						binary,
						opts.env,
						releaseResolution.identity,
					);
					if (beforeScan) {
						return {
							outcome: buildReleaseScannerTrustErrorOutcome({
								tool: binary,
								kind: opts.kind,
								mode: opts.mode,
								reason: beforeScan,
							}),
							exitCode: 1,
							stderr: beforeScan,
						};
					}
				}
				const result = spawnSync(executable, commandArgs, {
					encoding: opts.json ? "utf8" : undefined,
					...(opts.cwd ? { cwd: opts.cwd } : {}),
					...(opts.env ? { env: opts.env } : {}),
					shell: false,
					stdio: opts.json ? "pipe" : "inherit",
				});
				if (releaseResolution) {
					const afterScan = revalidateReleaseScannerExecutable(
						binary,
						opts.env,
						releaseResolution.identity,
					);
					if (afterScan) {
						return {
							outcome: buildReleaseScannerTrustErrorOutcome({
								tool: binary,
								kind: opts.kind,
								mode: opts.mode,
								reason: afterScan,
							}),
							exitCode: 1,
							stderr: afterScan,
						};
					}
				}

				if (result.error) {
					const error = result.error as Error & { code?: string };
					if (String(error.code) === "ENOENT") {
						binaryMissing = true;
						break;
					}

					const stderr = `${binary} failed to start: ${error.message}`;
					return {
						outcome: buildProbeErrorOutcome({
							tool: binary,
							kind: opts.kind,
							mode: opts.mode,
							error,
							...(identity ? { identity } : {}),
						}),
						exitCode: 1,
						stderr,
					};
				}

				if (result.status !== 0) {
					const stderr = opts.json ? `${result.stderr ?? ""}`.trim() : "";
					const stdout = opts.json ? `${result.stdout ?? ""}`.trim() : "";
					const failureDetail = opts.json
						? summarizeFailureOutput(stderr || stdout)
						: undefined;
					return {
						outcome: buildCommandOutcome({
							tool: binary,
							kind: opts.kind,
							mode: opts.mode,
							status: result.status ?? 1,
							...(version ? { version } : {}),
							...(identity ? { identity } : {}),
							...(failureDetail ? { failureDetail } : {}),
						}),
						exitCode: result.status ?? 1,
						...(opts.json && stderr ? { stderr } : {}),
					};
				}
			}

			if (binaryMissing) {
				continue;
			}
			return {
				outcome: buildCommandOutcome({
					tool: binary,
					kind: opts.kind,
					mode: opts.mode,
					status: 0,
					...(version ? { version } : {}),
					...(identity ? { identity } : {}),
				}),
				exitCode: 0,
			};
		} finally {
			immutableCopy?.cleanup();
		}
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
		exitCode: opts.mode === "release" ? 1 : 0,
		stdout:
			opts.mode === "release"
				? opts.missingReleaseMessage
				: opts.missingMessage,
	};
}

function missingLockfileResult(mode: ScanRequirement): ScanRunResult {
	const outcome = buildMissingToolOutcome({
		tool: "dependency-lockfile",
		kind: "deps",
		mode,
	});
	return {
		outcome: {
			...outcome,
			tool: "dependency-lockfile",
			reason: MISSING_LOCKFILE_MESSAGES[mode],
		},
		exitCode: mode === "informative" ? 0 : 1,
		...(mode === "required"
			? { stderr: MISSING_LOCKFILE_MESSAGES[mode] }
			: { stdout: MISSING_LOCKFILE_MESSAGES[mode] }),
	};
}

function runDependencyScan(opts: {
	mode: ScanRequirement;
	json: boolean;
	cwd?: string;
	env?: NodeJS.ProcessEnv;
}): ScanRunResult {
	const cwd = opts.cwd ?? process.cwd();
	const lockfile = supportedDependencyLockfile(cwd);
	if (!lockfile) {
		return missingLockfileResult(opts.mode);
	}

	return runOptionalScan({
		binaries: SCAN_TOOLS.deps,
		args: ["scan", "--lockfile", lockfile],
		cwd,
		...(opts.env ? { env: opts.env } : {}),
		kind: "deps",
		mode: opts.mode,
		missingMessage:
			"osv-scanner not installed; skipping dependency scan (informative).",
		missingRequiredMessage:
			"osv-scanner not installed; required dependency scan cannot run.",
		missingReleaseMessage:
			"osv-scanner not installed; release dependency scan cannot run.",
		json: opts.json,
	});
}

function runSecretsScan(opts: {
	mode: ScanRequirement;
	json: boolean;
	cwd?: string;
	env?: NodeJS.ProcessEnv;
}): ScanRunResult {
	return runOptionalScan({
		binaries: SCAN_TOOLS.secrets,
		commands: [
			["git", "-v", "--redact", "--exit-code", "1", "."],
			["dir", "-v", "--redact", "--exit-code", "1", "."],
		],
		...(opts.cwd ? { cwd: opts.cwd } : {}),
		...(opts.env ? { env: opts.env } : {}),
		kind: "secrets",
		mode: opts.mode,
		missingMessage:
			"gitleaks not installed; skipping secret scan (informative).",
		missingRequiredMessage:
			"gitleaks not installed; required secret scan cannot run.",
		missingReleaseMessage:
			"gitleaks not installed; release secret scan cannot run.",
		json: opts.json,
	});
}

export function runReleaseSecurityScans(
	opts: { cwd?: string; env?: NodeJS.ProcessEnv; artifact?: string } = {},
): { report: SecurityScanReport; exitCode: number } {
	const cwd = opts.cwd ?? process.cwd();
	const artifact = resolveReleaseArtifact(
		cwd,
		opts.artifact ?? DEFAULT_RELEASE_ARTIFACT,
	).artifact;
	const target = buildReleaseSecurityTarget(cwd, artifact);
	const scans = [
		runDependencyScan({
			mode: "release",
			json: true,
			cwd,
			...(opts.env ? { env: opts.env } : {}),
		}),
		runSecretsScan({
			mode: "release",
			json: true,
			cwd,
			...(opts.env ? { env: opts.env } : {}),
		}),
	];
	const report: SecurityScanReport = {
		generated_at: new Date().toISOString(),
		mode: "release",
		target: target.target,
		...(target.errors.length > 0 ? { target_errors: target.errors } : {}),
		scans: scans.map((scan) => scan.outcome),
	};
	return {
		report,
		exitCode:
			target.errors.length === 0 && scans.every((scan) => scan.exitCode === 0)
				? 0
				: 1,
	};
}

export function writeReleaseSecurityScanReport(
	report: SecurityScanReport,
	cwd = process.cwd(),
): string {
	const artifact = resolveReleaseArtifact(cwd, report.target.artifact).artifact;
	if (artifact !== report.target.artifact) {
		throw new Error(
			`release security scan artifact is not canonical: ${report.target.artifact}`,
		);
	}
	if (report.target.artifact_sha256 !== "unknown") {
		const resolved = resolveExistingReleaseArtifact(cwd, artifact);
		if (
			sha256Hex(readFileSync(resolved.artifactPath)) !==
			report.target.artifact_sha256
		) {
			throw new Error(
				`release artifact changed before security report write: ${artifact}`,
			);
		}
	}
	const outputPath = join(cwd, RELEASE_SECURITY_EVIDENCE_PATH);
	const outputGuard = prepareReleaseOutputFile(cwd, outputPath);
	atomicWriteText(outputPath, `${JSON.stringify(report, null, 2)}\n`);
	assertReleaseOutputFileStable(outputGuard, true);
	return outputPath;
}

function buildReleaseScannerTrustErrorOutcome(opts: {
	tool: string;
	kind: ScanMode;
	mode: ScanRequirement;
	reason: string;
}): SecurityScanOutcome {
	return {
		tool: opts.tool,
		kind: opts.kind,
		mode: opts.mode,
		status: "errored",
		reason: opts.reason,
		...(shouldRequireWaiver(opts.mode, "errored")
			? { waiver_required: true }
			: {}),
	};
}

function writeScanResult(result: ScanRunResult, json: boolean): void {
	if (json) {
		console.log(JSON.stringify(result.outcome));
	} else if (result.stdout) {
		console.log(result.stdout);
	}
	if (result.stderr) {
		console.error(result.stderr);
	}
}

function main(args: string[]): void {
	const mode = args[0] as ScanMode | "release" | undefined;
	const requirement = parseRequirement(args.slice(1));
	const json = args.includes("--json") || args.includes("-j");

	if (mode === "release") {
		const { report, exitCode } = runReleaseSecurityScans();
		const outputPath = writeReleaseSecurityScanReport(report);
		console.log(`release security scan: ${outputPath}`);
		process.exit(exitCode);
	}

	if (mode === "deps") {
		const result = runDependencyScan({
			mode: requirement,
			json,
		});
		writeScanResult(result, json);
		process.exit(result.exitCode);
	}

	if (mode === "secrets") {
		const result = runSecretsScan({
			mode: requirement,
			json,
		});
		writeScanResult(result, json);
		process.exit(result.exitCode);
	}

	console.error(
		"Usage: bun run cli/dev/security-scan.ts <deps|secrets|release> [--required|--release] [--json]",
	);
	process.exit(1);
}

if (import.meta.main) {
	main(process.argv.slice(2));
}
