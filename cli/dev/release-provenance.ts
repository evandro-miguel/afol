#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { DEFAULT_TEMPLATE_HASH } from "../generated/template";
import { CLI_PACKAGE_NAME, CLI_VERSION } from "../generated/version";
import { atomicWriteText } from "../services/io/atomic";
import {
	compiledReleaseBuildArgs,
	DEFAULT_BUILD_COMMAND,
	readMinifiedCompiledReleaseBuildReceipt,
	releaseArtifactPath,
} from "./build-release";
import {
	resolveExistingReleaseArtifact,
	resolveReleaseArtifact,
} from "./release-artifact";
import {
	assertReleaseOutputFileStable,
	assertSafeReleaseArtifact,
	prepareReleaseOutputFile,
} from "./release-output";
import {
	buildReleaseSecurityScanOutcomes,
	DEFAULT_RELEASE_ARTIFACT,
	RELEASE_SECURITY_EVIDENCE_PATH,
	runReleaseSecurityScans,
	type SecurityScanOutcome,
	type SecurityScanReport,
	type SecurityScanTarget,
	supportedDependencyLockfile,
	writeReleaseSecurityScanReport,
} from "./security-scan";

const VERSION_SOURCE_PATH = "package.json";
const RELEASE_SECURITY_EVIDENCE_MAX_AGE_MS = 30 * 60 * 1000;
const RELEASE_SECURITY_EVIDENCE_FUTURE_SKEW_MS = 5 * 60 * 1000;
const SEMVER_PATTERN =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

type ReleaseProvenance = {
	artifact: string;
	package_name: string;
	version: string;
	version_source_path: string;
	version_source_sha256: string;
	sha256: string;
	size_bytes: number;
	bun: string;
	node: string;
	generated_at: string;
	commit_sha: string;
	branch: string;
	lockfile: string;
	lock_sha256: string;
	template_hash: string;
	build_command: string;
	platform: string;
	arch: string;
	build_target: string;
	compile_bytecode?: boolean;
	compile_minify?: boolean;
	module_format: "esm";
	compile_autoload_dotenv: boolean;
	compile_autoload_bunfig: boolean;
	security_scanners: Array<{
		tool: string;
		kind: string;
		status: string;
		version?: string;
		executable_path?: string;
		executable_sha256?: string;
		reason?: string;
		waiver_required?: boolean;
	}>;
};

type WriteReleaseProvenanceOptions = {
	cwd?: string;
	artifact?: string;
	releaseMode?: boolean;
	buildCommand?: string;
	env?: NodeJS.ProcessEnv;
};

type PackageMetadata = {
	name: string;
	version: string;
};

type ResolvedVersionSource = {
	packageName: string;
	version: string;
	sourcePath: string;
	sourceSha256: string;
};

type ProvenanceSecurityScanner = ReleaseProvenance["security_scanners"][number];
const RELEASE_SCAN_STATUSES = new Set([
	"passed",
	"failed",
	"waived",
	"errored",
	"skipped",
]);

function sha256Hex(bytes: Uint8Array | string): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function assertValidVersion(value: string, label: string): void {
	if (!SEMVER_PATTERN.test(value)) {
		throw new Error(`${label} must be a valid semver string`);
	}
	if (value === "0.0.0") {
		throw new Error(`${label} must not use placeholder 0.0.0`);
	}
}

function readPackageMetadata(cwd: string): PackageMetadata {
	const raw = JSON.parse(
		readFileSync(join(cwd, "package.json"), "utf8"),
	) as Partial<PackageMetadata>;
	if (typeof raw.name !== "string" || raw.name.length === 0) {
		throw new Error("package.json name must be a non-empty string");
	}
	if (typeof raw.version !== "string" || raw.version.length === 0) {
		throw new Error("package.json version must be a non-empty string");
	}
	assertValidVersion(raw.version, "package.json version");
	return { name: raw.name, version: raw.version };
}

function resolveVersionSource(cwd: string): ResolvedVersionSource {
	const metadata = readPackageMetadata(cwd);
	if (CLI_PACKAGE_NAME !== metadata.name || CLI_VERSION !== metadata.version) {
		throw new Error(
			`generated version metadata ${JSON.stringify(`${CLI_PACKAGE_NAME}@${CLI_VERSION}`)} does not match package metadata ${JSON.stringify(`${metadata.name}@${metadata.version}`)} in ${VERSION_SOURCE_PATH}`,
		);
	}

	return {
		packageName: metadata.name,
		version: metadata.version,
		sourcePath: VERSION_SOURCE_PATH,
		sourceSha256: sha256Hex(readFileSync(join(cwd, VERSION_SOURCE_PATH))),
	};
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

function githubRefBranch(env: NodeJS.ProcessEnv | undefined): string {
	const headRef = env?.GITHUB_HEAD_REF?.trim();
	if (headRef) {
		return headRef;
	}

	const refName = env?.GITHUB_REF_NAME?.trim();
	if (refName) {
		return refName;
	}

	const ref = env?.GITHUB_REF?.trim();
	if (ref?.startsWith("refs/heads/")) {
		return ref.slice("refs/heads/".length);
	}
	if (ref?.startsWith("refs/pull/")) {
		return ref;
	}

	return "unknown";
}

function resolveBranch(
	cwd: string,
	env: NodeJS.ProcessEnv | undefined,
): string {
	const currentBranch = runGitCommand(cwd, ["branch", "--show-current"]);
	if (currentBranch !== "unknown") {
		return currentBranch;
	}

	const branchFromEnv = githubRefBranch(env);
	if (branchFromEnv !== "unknown") {
		return branchFromEnv;
	}

	return runGitCommand(cwd, ["name-rev", "--name-only", "HEAD"]);
}

function readLockMetadata(cwd: string): {
	lockfile: string;
	lock_sha256: string;
} {
	const lockfile = supportedDependencyLockfile(cwd);
	if (!lockfile) {
		return { lockfile: "unknown", lock_sha256: "unknown" };
	}

	const lockPath = join(cwd, lockfile);
	return {
		lockfile,
		lock_sha256: sha256Hex(readFileSync(lockPath)),
	};
}

function assertKnownReleaseFields(provenance: ReleaseProvenance): void {
	const requiredFields: Array<keyof ReleaseProvenance> = [
		"commit_sha",
		"branch",
		"lockfile",
		"lock_sha256",
		"template_hash",
		"build_command",
		"platform",
		"arch",
		"build_target",
		"module_format",
		"compile_autoload_dotenv",
		"compile_autoload_bunfig",
		"security_scanners",
	];
	const unknownFields = requiredFields.filter(
		(field) => provenance[field] === "unknown",
	);
	if (unknownFields.length > 0) {
		throw new Error(
			`release provenance missing required fields: ${unknownFields.join(", ")}`,
		);
	}
}

function assertCleanReleaseSource(cwd: string): void {
	const result = spawnSync(
		"git",
		[
			"status",
			"--porcelain",
			"--untracked-files=all",
			"--",
			".",
			":(exclude)dist",
		],
		{
			cwd,
			encoding: "utf8",
			shell: false,
		},
	);
	if (result.error || result.status !== 0) {
		throw new Error("release provenance cannot verify clean source checkout");
	}

	const dirtyPaths = `${result.stdout ?? ""}`
		.trim()
		.split("\n")
		.filter(Boolean);
	if (dirtyPaths.length > 0) {
		throw new Error(
			`release provenance requires clean source checkout; dirty paths: ${dirtyPaths.slice(0, 5).join(", ")}`,
		);
	}
}

function toProvenanceSecurityScanners(
	scans: SecurityScanOutcome[],
): ProvenanceSecurityScanner[] {
	return scans.map((scanner) => ({
		tool: scanner.tool,
		kind: scanner.kind,
		status: scanner.status,
		...(scanner.version ? { version: scanner.version } : {}),
		...(scanner.executable_path
			? { executable_path: scanner.executable_path }
			: {}),
		...(scanner.executable_sha256
			? { executable_sha256: scanner.executable_sha256 }
			: {}),
		...(scanner.reason ? { reason: scanner.reason } : {}),
		...(scanner.waiver_required
			? { waiver_required: scanner.waiver_required }
			: {}),
	}));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertReleaseSecurityScanEvidenceShape(
	raw: Partial<SecurityScanReport>,
): asserts raw is SecurityScanReport {
	if (
		typeof raw.generated_at !== "string" ||
		raw.mode !== "release" ||
		!isRecord(raw.target) ||
		!Array.isArray(raw.scans)
	) {
		throw new Error(
			`${RELEASE_SECURITY_EVIDENCE_PATH} is not a release security scan report`,
		);
	}

	for (const field of [
		"artifact",
		"artifact_sha256",
		"commit_sha",
		"lockfile",
		"lock_sha256",
	] satisfies Array<keyof SecurityScanTarget>) {
		if (
			typeof raw.target[field] !== "string" ||
			raw.target[field].length === 0
		) {
			throw new Error(
				`${RELEASE_SECURITY_EVIDENCE_PATH} target ${field} must be a non-empty string`,
			);
		}
	}
	if (
		"target_errors" in raw &&
		(!Array.isArray(raw.target_errors) ||
			raw.target_errors.some((error) => typeof error !== "string"))
	) {
		throw new Error(
			`${RELEASE_SECURITY_EVIDENCE_PATH} target_errors must be strings`,
		);
	}

	for (const [index, scan] of raw.scans.entries()) {
		if (!isRecord(scan)) {
			throw new Error(
				`${RELEASE_SECURITY_EVIDENCE_PATH} scan ${index} must be an object`,
			);
		}
		if (
			typeof scan.tool !== "string" ||
			scan.tool.length === 0 ||
			(scan.kind !== "deps" && scan.kind !== "secrets") ||
			scan.mode !== "release" ||
			typeof scan.status !== "string" ||
			!RELEASE_SCAN_STATUSES.has(scan.status)
		) {
			throw new Error(
				`${RELEASE_SECURITY_EVIDENCE_PATH} scan ${index} has invalid required fields`,
			);
		}
		if (
			("version" in scan && typeof scan.version !== "string") ||
			("executable_path" in scan && typeof scan.executable_path !== "string") ||
			("executable_sha256" in scan &&
				typeof scan.executable_sha256 !== "string") ||
			("reason" in scan && typeof scan.reason !== "string") ||
			("waiver_required" in scan && typeof scan.waiver_required !== "boolean")
		) {
			throw new Error(
				`${RELEASE_SECURITY_EVIDENCE_PATH} scan ${index} has invalid optional fields`,
			);
		}
		if (
			scan.status === "passed" &&
			(typeof scan.executable_path !== "string" ||
				!isAbsolute(scan.executable_path) ||
				typeof scan.executable_sha256 !== "string" ||
				!/^[a-f0-9]{64}$/i.test(scan.executable_sha256))
		) {
			throw new Error(
				`${RELEASE_SECURITY_EVIDENCE_PATH} passed scan ${index} must bind an approved absolute scanner path and SHA-256`,
			);
		}
	}
}

function assertReleaseSecurityScanTarget(
	report: SecurityScanReport,
	expected: SecurityScanTarget,
): void {
	if (report.target_errors && report.target_errors.length > 0) {
		throw new Error(
			`${RELEASE_SECURITY_EVIDENCE_PATH} target is incomplete: ${report.target_errors.join(", ")}`,
		);
	}

	const mismatches = (
		[
			"artifact",
			"artifact_sha256",
			"commit_sha",
			"lockfile",
			"lock_sha256",
		] satisfies Array<keyof SecurityScanTarget>
	).filter((field) => report.target[field] !== expected[field]);
	if (mismatches.length > 0) {
		throw new Error(
			`${RELEASE_SECURITY_EVIDENCE_PATH} target does not match current release: ${mismatches.join(", ")}`,
		);
	}
}

function assertReleaseSecurityScanFresh(report: SecurityScanReport): void {
	const generatedAtMs = Date.parse(report.generated_at);
	if (!Number.isFinite(generatedAtMs)) {
		throw new Error(
			`${RELEASE_SECURITY_EVIDENCE_PATH} generated_at must be a valid timestamp`,
		);
	}

	const ageMs = Date.now() - generatedAtMs;
	if (ageMs > RELEASE_SECURITY_EVIDENCE_MAX_AGE_MS) {
		throw new Error(
			`${RELEASE_SECURITY_EVIDENCE_PATH} is stale; rerun bun run validate:security:release`,
		);
	}
	if (ageMs < -RELEASE_SECURITY_EVIDENCE_FUTURE_SKEW_MS) {
		throw new Error(
			`${RELEASE_SECURITY_EVIDENCE_PATH} generated_at is too far in the future`,
		);
	}
}

function readReleaseSecurityScanEvidence(
	cwd: string,
	expectedTarget: SecurityScanTarget,
): ProvenanceSecurityScanner[] {
	const evidencePath = join(cwd, RELEASE_SECURITY_EVIDENCE_PATH);
	if (!existsSync(evidencePath)) {
		throw new Error(
			`missing required ${RELEASE_SECURITY_EVIDENCE_PATH}; run bun run validate:security:release before release provenance`,
		);
	}
	assertSafeReleaseArtifact(cwd, evidencePath);

	const raw = JSON.parse(
		readFileSync(evidencePath, "utf8"),
	) as Partial<SecurityScanReport>;
	assertReleaseSecurityScanEvidenceShape(raw);
	assertReleaseSecurityScanTarget(raw, expectedTarget);
	assertReleaseSecurityScanFresh(raw);

	return toProvenanceSecurityScanners(raw.scans);
}

function refreshReleaseSecurityScanEvidence(
	cwd: string,
	artifact: string,
	env?: NodeJS.ProcessEnv,
): void {
	const { report } = runReleaseSecurityScans({
		cwd,
		artifact,
		...(env ? { env } : {}),
	});
	writeReleaseSecurityScanReport(report, cwd);
}

function assertReleaseSecurityScansPassed(
	scanners: ProvenanceSecurityScanner[],
): void {
	const requiredKinds = ["deps", "secrets"];
	const missingKinds = requiredKinds.filter(
		(kind) =>
			!scanners.some(
				(scanner) => scanner.kind === kind && scanner.status === "passed",
			),
	);
	const failedScanners = scanners.filter(
		(scanner) => scanner.status !== "passed",
	);
	if (missingKinds.length > 0 || failedScanners.length > 0) {
		const failed = failedScanners
			.map((scanner) => `${scanner.kind}:${scanner.tool}:${scanner.status}`)
			.join(", ");
		const missing = missingKinds.join(", ");
		throw new Error(
			`release provenance requires passed security scans${missing ? `; missing: ${missing}` : ""}${failed ? `; failed: ${failed}` : ""}`,
		);
	}
}

export function buildReleaseProvenance(
	options: WriteReleaseProvenanceOptions = {},
): ReleaseProvenance {
	const cwd = options.cwd ?? process.cwd();
	const candidate = resolveReleaseArtifact(
		cwd,
		releaseArtifactPath(options.artifact ?? DEFAULT_RELEASE_ARTIFACT),
	);
	const artifactGuard = prepareReleaseOutputFile(cwd, candidate.artifactPath);
	const { artifact, artifactPath } = resolveExistingReleaseArtifact(
		cwd,
		candidate.artifact,
	);
	assertReleaseOutputFileStable(artifactGuard, true);
	if (!existsSync(artifactPath)) {
		throw new Error(`missing release artifact: ${artifact}`);
	}
	assertSafeReleaseArtifact(cwd, artifactPath);

	const bytes = readFileSync(artifactPath);
	const stats = statSync(artifactPath);
	const lockMetadata = readLockMetadata(cwd);
	const commitSha = runGitCommand(cwd, ["rev-parse", "HEAD"]);
	const versionSource = resolveVersionSource(cwd);
	const compiledReceipt = readMinifiedCompiledReleaseBuildReceipt(
		artifactPath,
		compiledReleaseBuildArgs("cli/main.ts", artifact),
	);
	if (options.releaseMode && !compiledReceipt) {
		throw new Error(`missing compiled release build receipt: ${artifactPath}`);
	}
	if (options.releaseMode) {
		assertCleanReleaseSource(cwd);
		refreshReleaseSecurityScanEvidence(cwd, artifact, options.env);
	}
	const securityScanners = options.releaseMode
		? readReleaseSecurityScanEvidence(cwd, {
				artifact,
				artifact_sha256: sha256Hex(bytes),
				commit_sha: commitSha,
				lockfile: lockMetadata.lockfile,
				lock_sha256: lockMetadata.lock_sha256,
			})
		: toProvenanceSecurityScanners(
				buildReleaseSecurityScanOutcomes(options.env),
			);
	const provenance: ReleaseProvenance = {
		artifact,
		package_name: versionSource.packageName,
		version: versionSource.version,
		version_source_path: versionSource.sourcePath,
		version_source_sha256: versionSource.sourceSha256,
		sha256: sha256Hex(bytes),
		size_bytes: stats.size,
		bun: process.versions.bun ?? "unknown",
		node: process.version,
		generated_at: new Date().toISOString(),
		commit_sha: commitSha,
		branch: resolveBranch(cwd, options.env ?? process.env),
		lockfile: lockMetadata.lockfile,
		lock_sha256: lockMetadata.lock_sha256,
		template_hash:
			typeof DEFAULT_TEMPLATE_HASH === "string" &&
			DEFAULT_TEMPLATE_HASH.length > 0
				? DEFAULT_TEMPLATE_HASH
				: "unknown",
		build_command: options.buildCommand ?? DEFAULT_BUILD_COMMAND,
		platform: process.platform || "unknown",
		arch: process.arch || "unknown",
		build_target:
			process.platform && process.arch
				? `bun-${process.platform}-${process.arch}`
				: "unknown",
		...(compiledReceipt
			? { compile_bytecode: false, compile_minify: true }
			: {}),
		module_format: "esm",
		compile_autoload_dotenv: false,
		compile_autoload_bunfig: false,
		security_scanners: securityScanners,
	};

	if (options.releaseMode) {
		assertKnownReleaseFields(provenance);
		assertReleaseSecurityScansPassed(provenance.security_scanners);
	}

	return provenance;
}

export function writeReleaseProvenance(
	options: WriteReleaseProvenanceOptions = {},
): {
	checksumPath: string;
	provenancePath: string;
} {
	const cwd = options.cwd ?? process.cwd();
	const candidate = resolveReleaseArtifact(
		cwd,
		releaseArtifactPath(options.artifact ?? DEFAULT_RELEASE_ARTIFACT),
	);
	const artifact = candidate.artifact;
	const checksumPath = join(cwd, `${artifact}.sha256`);
	const provenancePath = join(cwd, `${artifact}.provenance.json`);
	const checksumGuard = prepareReleaseOutputFile(cwd, checksumPath);
	const provenanceGuard = prepareReleaseOutputFile(cwd, provenancePath);
	resolveExistingReleaseArtifact(cwd, candidate.artifact);
	const provenance = buildReleaseProvenance({ ...options, artifact });

	const checksumContent = `${provenance.sha256}  ${artifact}\n`;
	const provenanceContent = `${JSON.stringify(provenance, null, 2)}\n`;
	const revalidated = resolveExistingReleaseArtifact(cwd, artifact);
	if (
		sha256Hex(readFileSync(revalidated.artifactPath)) !== provenance.sha256 ||
		statSync(revalidated.artifactPath).size !== provenance.size_bytes
	) {
		throw new Error(
			`release artifact changed before sidecar write: ${artifact}`,
		);
	}
	writeFileAtomically(cwd, checksumPath, checksumContent, checksumGuard);
	writeFileAtomically(cwd, provenancePath, provenanceContent, provenanceGuard);
	assertReleaseProvenanceBindsArtifact(
		cwd,
		artifact,
		provenance,
		checksumPath,
		provenancePath,
	);

	return { checksumPath, provenancePath };
}

function writeFileAtomically(
	cwd: string,
	path: string,
	content: string,
	outputGuard = prepareReleaseOutputFile(cwd, path),
): void {
	atomicWriteText(path, content);
	assertReleaseOutputFileStable(outputGuard, true);
}

function assertReleaseProvenanceBindsArtifact(
	cwd: string,
	artifact: string,
	provenance: ReleaseProvenance,
	checksumPath: string,
	provenancePath: string,
): void {
	const artifactPath = join(cwd, artifact);
	assertSafeReleaseArtifact(cwd, artifactPath);
	assertSafeReleaseArtifact(cwd, checksumPath);
	assertSafeReleaseArtifact(cwd, provenancePath);
	const artifactSha256 = sha256Hex(readFileSync(artifactPath));
	const written = JSON.parse(
		readFileSync(provenancePath, "utf8"),
	) as ReleaseProvenance;
	const checksumText = readFileSync(checksumPath, "utf8").trim();
	const artifactSize = statSync(artifactPath).size;
	const sizeMatches =
		Number.isSafeInteger(provenance.size_bytes) &&
		Number.isSafeInteger(written.size_bytes) &&
		provenance.size_bytes >= 0 &&
		written.size_bytes >= 0 &&
		provenance.size_bytes === artifactSize &&
		written.size_bytes === artifactSize;
	if (
		provenance.sha256 !== artifactSha256 ||
		written.sha256 !== artifactSha256 ||
		provenance.artifact !== artifact ||
		written.artifact !== artifact ||
		checksumText !== `${artifactSha256}  ${artifact}` ||
		!sizeMatches
	) {
		throw new Error(
			`release provenance does not bind its artifact: ${artifact}`,
		);
	}
}

function main(args: string[]): void {
	const releaseMode = args.includes("--release");
	const { checksumPath, provenancePath } = writeReleaseProvenance({
		releaseMode,
	});
	console.log(`release provenance: ${checksumPath} ${provenancePath}`);
}

if (import.meta.main) {
	main(process.argv.slice(2));
}
