#!/usr/bin/env bun

import { createHash } from "node:crypto";
import {
	chmodSync,
	copyFileSync,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
	syncDirectoryDurablyIfSupported,
	syncFileDurably,
} from "../services/io/durable-sync";
import {
	assertReleaseArtifactOutputRoot,
	resolveExistingReleaseArtifact,
} from "./release-artifact";
import {
	buildReleaseSpdxSbom,
	type ReleaseSbomProvenance,
} from "./release-sbom";

const ASSET_NAME = "afol-linux-x64";
const DEFAULT_ARTIFACT = "dist/afol";
const DEFAULT_STAGE_DIR = "dist/release/afol-linux-x64";
const DEFAULT_COMPLIANCE_DIR = "release/compliance/linux-x64";

type JsonRecord = Record<string, unknown>;

export type StageReleaseOptions = {
	cwd?: string;
	artifact?: string;
	stageDir?: string;
	complianceDir?: string;
};

export type StageReleaseResult = {
	stageDir: string;
	assetName: string;
	artifactSha256: string;
	files: string[];
};

export type VerifyStagedReleaseOptions = {
	cwd?: string;
	stageDir: string;
};

export type VerifyStagedReleaseResult = StageReleaseResult & {
	provenance: JsonRecord;
	manifestSha256: string;
};

function sha256(bytes: Uint8Array | string): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function readJson(path: string): JsonRecord {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(path, "utf8"));
	} catch {
		throw new Error(`invalid release JSON: ${path}`);
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error(`invalid release JSON: ${path}`);
	}
	return parsed as JsonRecord;
}

function stringField(record: JsonRecord, key: string, label: string): string {
	const value = record[key];
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`missing ${label}`);
	}
	return value;
}

function isDescendant(parent: string, candidate: string): boolean {
	const child = relative(parent, candidate);
	return (
		child.length > 0 &&
		child !== ".." &&
		!child.startsWith("../") &&
		!child.startsWith("..\\") &&
		!isAbsolute(child)
	);
}

function assertRegularFile(path: string, label: string): void {
	if (!existsSync(path) || !lstatSync(path).isFile()) {
		throw new Error(`missing ${label}: ${path}`);
	}
}

function assertNoExistingSymlinks(base: string, candidate: string): void {
	const relativePath = relative(base, candidate);
	if (
		!relativePath ||
		relativePath === ".." ||
		relativePath.startsWith("../") ||
		relativePath.startsWith("..\\") ||
		isAbsolute(relativePath)
	) {
		throw new Error(`release path escapes the project: ${candidate}`);
	}
	let current = base;
	for (const segment of relativePath.split(/[\\/]/u)) {
		current = join(current, segment);
		if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
			throw new Error(`release path uses a symlink: ${current}`);
		}
	}
}

function listRegularFiles(root: string): string[] {
	const result: string[] = [];
	const visit = (dir: string, prefix = "") => {
		for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
			a.name.localeCompare(b.name),
		)) {
			const path = join(dir, entry.name);
			const name = prefix ? `${prefix}/${entry.name}` : entry.name;
			if (entry.isSymbolicLink()) {
				throw new Error(`release input uses a symlink: ${path}`);
			}
			if (entry.isDirectory()) visit(path, name);
			else if (entry.isFile()) result.push(name);
			else throw new Error(`release input is not a regular file: ${path}`);
		}
	};
	visit(root);
	return result;
}

function writeText(path: string, content: string): void {
	writeFileSync(path, content, "utf8");
	chmodSync(path, 0o644);
	syncFileDurably(path);
}

function writeJson(path: string, value: unknown): void {
	writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

function copyDurably(source: string, target: string, mode = 0o644): void {
	copyFileSync(source, target);
	chmodSync(target, mode);
	syncFileDurably(target);
}

function assertEvidence(
	provenance: JsonRecord,
	security: JsonRecord,
	artifactHash: string,
	actualLockHash?: string,
): void {
	if (
		stringField(provenance, "sha256", "provenance artifact hash") !==
		artifactHash
	) {
		throw new Error("release provenance does not bind the artifact");
	}
	if (
		provenance.platform !== "linux" ||
		provenance.arch !== "x64" ||
		provenance.build_target !== "bun-linux-x64"
	) {
		throw new Error("release provenance is not for Linux x64");
	}
	const target = security.target;
	if (!target || typeof target !== "object" || Array.isArray(target)) {
		throw new Error("security report is missing its target");
	}
	const securityTarget = target as JsonRecord;
	if (securityTarget.artifact_sha256 !== artifactHash) {
		throw new Error("security report does not bind the artifact");
	}
	if (securityTarget.commit_sha !== provenance.commit_sha) {
		throw new Error("security report does not bind the source commit");
	}
	const provenanceLockHash = stringField(
		provenance,
		"lock_sha256",
		"provenance lockfile hash",
	);
	if (
		provenance.lockfile !== "bun.lock" ||
		securityTarget.lockfile !== "bun.lock" ||
		!/^[a-f0-9]{64}$/u.test(provenanceLockHash) ||
		securityTarget.lock_sha256 !== provenanceLockHash
	) {
		throw new Error("release evidence does not bind bun.lock");
	}
	if (actualLockHash !== undefined && provenanceLockHash !== actualLockHash) {
		throw new Error("release provenance does not bind the current bun.lock");
	}
	if (!Array.isArray(security.scans)) {
		throw new Error("security report is missing scans");
	}
	const passedKinds = new Set<string>();
	for (const scan of security.scans) {
		if (!scan || typeof scan !== "object" || Array.isArray(scan)) continue;
		const item = scan as JsonRecord;
		if (item.status !== "passed") {
			throw new Error(
				`release security scan did not pass: ${String(item.kind)}`,
			);
		}
		if (typeof item.kind === "string") passedKinds.add(item.kind);
	}
	for (const kind of ["deps", "secrets"]) {
		if (!passedKinds.has(kind))
			throw new Error(`missing release security scan: ${kind}`);
	}
}

function assertSbom(
	value: unknown,
	artifactHash: string,
	provenance: JsonRecord,
): JsonRecord[] {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("staged SBOM is invalid");
	}
	const sbom = value as JsonRecord;
	if (sbom.spdxVersion !== "SPDX-2.3" || !Array.isArray(sbom.packages)) {
		throw new Error("staged SBOM is missing SPDX package data");
	}
	const packages = sbom.packages.map((item) => {
		if (!item || typeof item !== "object" || Array.isArray(item)) {
			throw new Error("staged SBOM contains an invalid package");
		}
		return item as JsonRecord;
	});
	const ids = new Set<string>();
	for (const item of packages) {
		const id = stringField(item, "SPDXID", "SBOM package SPDXID");
		if (ids.has(id))
			throw new Error(`staged SBOM has duplicate package id: ${id}`);
		ids.add(id);
		stringField(item, "name", "SBOM package name");
		stringField(item, "versionInfo", "SBOM package version");
		const license = stringField(
			item,
			"licenseDeclared",
			"SBOM package license",
		);
		if (license === "NOASSERTION") {
			throw new Error(
				`staged SBOM has no declared license: ${String(item.name)}`,
			);
		}
	}
	const applications = packages.filter(
		(item) => item.primaryPackagePurpose === "APPLICATION",
	);
	const application = applications[0];
	if (
		applications.length !== 1 ||
		!application ||
		application.name !== provenance.package_name ||
		application.versionInfo !== provenance.version ||
		application.SPDXID !== "SPDXRef-Package-AFOL"
	) {
		throw new Error("staged SBOM does not bind the AFOL package");
	}
	const checksums = application.checksums;
	if (
		!Array.isArray(checksums) ||
		!checksums.some(
			(item) =>
				!!item &&
				typeof item === "object" &&
				(item as JsonRecord).algorithm === "SHA256" &&
				(item as JsonRecord).checksumValue === artifactHash,
		)
	) {
		throw new Error("staged SBOM does not bind the artifact");
	}
	const bunPackages = packages.filter(
		(item) => item.primaryPackagePurpose === "RUNTIME",
	);
	const bunPackage = bunPackages[0];
	if (
		bunPackages.length !== 1 ||
		!bunPackage ||
		bunPackage.SPDXID !== "SPDXRef-Package-Bun-runtime" ||
		bunPackage.name !== "Bun runtime" ||
		bunPackage.versionInfo !== provenance.bun
	) {
		throw new Error("staged SBOM does not bind the Bun runtime");
	}
	return packages;
}

function approvedLicenseFiles(
	complianceDir: string,
	provenance: JsonRecord,
	artifactHash: string,
	sbomPackages: JsonRecord[],
): { review: JsonRecord; files: string[]; hashes: Map<string, string> } {
	const reviewName = "compliance-review.json";
	const review = readJson(join(complianceDir, reviewName));
	if (
		review.schema !== "afol.release-compliance/v2" ||
		review.status !== "approved"
	) {
		throw new Error("compliance review is not approved");
	}
	if (
		review.artifact_sha256 !== artifactHash ||
		review.source_commit_sha !== provenance.commit_sha ||
		review.bun_version !== provenance.bun
	) {
		throw new Error("compliance review does not bind the release candidate");
	}
	stringField(review, "reviewer", "compliance reviewer");
	const reviewedAt = stringField(
		review,
		"reviewed_at",
		"compliance review time",
	);
	if (!Number.isFinite(Date.parse(reviewedAt))) {
		throw new Error("compliance review has invalid reviewed_at");
	}
	if (
		!Array.isArray(review.license_files) ||
		review.license_files.length === 0
	) {
		throw new Error("compliance review has no license files");
	}
	const reviewed = review.license_files.map((value) => {
		if (!value || typeof value !== "object" || Array.isArray(value)) {
			throw new Error("compliance review has an invalid license file");
		}
		const file = value as JsonRecord;
		const path = stringField(file, "path", "reviewed license path");
		const hash = stringField(file, "sha256", "reviewed license hash");
		if (
			path === reviewName ||
			path.startsWith("/") ||
			path.includes("\\") ||
			path.split("/").some((part) => !part || part === "." || part === "..") ||
			!/^[a-f0-9]{64}$/u.test(hash)
		) {
			throw new Error("compliance review has an invalid license file");
		}
		return { path, sha256: hash };
	});
	const reviewedPaths = reviewed.map((file) => file.path);
	if (new Set(reviewedPaths).size !== reviewedPaths.length) {
		throw new Error("compliance review has duplicate license paths");
	}
	const actual = listRegularFiles(complianceDir)
		.filter((path) => path !== reviewName)
		.sort();
	if (JSON.stringify([...reviewedPaths].sort()) !== JSON.stringify(actual)) {
		throw new Error(
			"reviewed license set does not match the compliance bundle",
		);
	}
	const hashes = new Map<string, string>();
	for (const file of reviewed) {
		if (sha256(readFileSync(join(complianceDir, file.path))) !== file.sha256) {
			throw new Error("reviewed license hash does not match");
		}
		hashes.set(file.path, file.sha256);
	}
	hashes.set(reviewName, sha256(readFileSync(join(complianceDir, reviewName))));
	const packageNoticesValue = review.package_notice_files;
	if (
		!packageNoticesValue ||
		typeof packageNoticesValue !== "object" ||
		Array.isArray(packageNoticesValue)
	) {
		throw new Error("compliance review has no package notice mapping");
	}
	const packageNotices = packageNoticesValue as JsonRecord;
	const packageIds = sbomPackages.map((item) =>
		stringField(item, "SPDXID", "SBOM package SPDXID"),
	);
	if (
		JSON.stringify(Object.keys(packageNotices).sort()) !==
		JSON.stringify([...packageIds].sort())
	) {
		throw new Error(
			"compliance review package notice coverage does not match the SBOM",
		);
	}
	for (const packageId of packageIds) {
		const noticePaths = packageNotices[packageId];
		if (
			!Array.isArray(noticePaths) ||
			noticePaths.length === 0 ||
			noticePaths.some(
				(path) =>
					typeof path !== "string" || !hashes.has(path) || path === reviewName,
			) ||
			new Set(noticePaths).size !== noticePaths.length
		) {
			throw new Error(
				`compliance review has invalid notice coverage for ${packageId}`,
			);
		}
	}
	return { review, files: [reviewName, ...actual].sort(), hashes };
}

function safeRelativeFilePath(path: unknown): path is string {
	return (
		typeof path === "string" &&
		path.length > 0 &&
		!path.startsWith("/") &&
		!path.includes("\\") &&
		!path.split("/").some((part) => !part || part === "." || part === "..")
	);
}

export function verifyStagedRelease(
	options: VerifyStagedReleaseOptions,
): VerifyStagedReleaseResult {
	const cwd = resolve(options.cwd ?? process.cwd());
	const distRoot = assertReleaseArtifactOutputRoot(cwd);
	const stageDir = resolve(cwd, options.stageDir);
	if (!isDescendant(distRoot, stageDir)) {
		throw new Error("release stage must stay inside dist");
	}
	assertNoExistingSymlinks(distRoot, stageDir);
	if (!existsSync(stageDir) || !lstatSync(stageDir).isDirectory()) {
		throw new Error(`missing release stage directory: ${stageDir}`);
	}
	const realStageDir = realpathSync(stageDir);
	if (!isDescendant(realpathSync(distRoot), realStageDir)) {
		throw new Error("release stage escapes dist");
	}
	const manifestPath = join(realStageDir, "manifest.json");
	assertRegularFile(manifestPath, "release stage manifest");
	const manifestBytes = readFileSync(manifestPath);
	let manifest: JsonRecord;
	try {
		const parsed: unknown = JSON.parse(manifestBytes.toString("utf8"));
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			throw new Error("invalid release JSON");
		}
		manifest = parsed as JsonRecord;
	} catch {
		throw new Error(`invalid release JSON: ${manifestPath}`);
	}
	if (
		manifest.schema !== "afol.release-stage/v1" ||
		manifest.asset !== ASSET_NAME
	) {
		throw new Error("release stage manifest is invalid");
	}
	const artifactHash = stringField(
		manifest,
		"artifact_sha256",
		"release stage artifact hash",
	);
	if (!/^[a-f0-9]{64}$/u.test(artifactHash)) {
		throw new Error("release stage manifest has an invalid artifact hash");
	}
	if (!Array.isArray(manifest.files)) {
		throw new Error("release stage manifest is missing its file list");
	}
	const expectedPaths: string[] = [];
	for (const value of manifest.files) {
		if (!value || typeof value !== "object" || Array.isArray(value)) {
			throw new Error("release stage manifest has an invalid file entry");
		}
		const entry = value as JsonRecord;
		const path = entry.path;
		const hash = entry.sha256;
		const size = entry.size_bytes;
		if (
			!safeRelativeFilePath(path) ||
			path === "manifest.json" ||
			typeof hash !== "string" ||
			!/^[a-f0-9]{64}$/u.test(hash) ||
			!Number.isSafeInteger(size) ||
			(size as number) < 0
		) {
			throw new Error("release stage manifest has an invalid file entry");
		}
		expectedPaths.push(path);
	}
	if (
		new Set(expectedPaths).size !== expectedPaths.length ||
		JSON.stringify([...expectedPaths].sort()) !== JSON.stringify(expectedPaths)
	) {
		throw new Error(
			"release stage manifest file list is not unique and sorted",
		);
	}
	const actualFiles = listRegularFiles(realStageDir).sort();
	const completePaths = [...expectedPaths, "manifest.json"].sort();
	if (JSON.stringify(actualFiles) !== JSON.stringify(completePaths)) {
		throw new Error("release stage files do not match the manifest");
	}
	for (const value of manifest.files) {
		const entry = value as JsonRecord;
		const path = entry.path as string;
		const target = join(realStageDir, ...path.split("/"));
		assertRegularFile(target, `staged file ${path}`);
		if (
			sha256(readFileSync(target)) !== entry.sha256 ||
			statSync(target).size !== entry.size_bytes
		) {
			throw new Error(
				`release stage file does not match the manifest: ${path}`,
			);
		}
	}
	const assetPath = join(realStageDir, ASSET_NAME);
	assertRegularFile(assetPath, "staged release asset");
	const stagedArtifactHash = sha256(readFileSync(assetPath));
	if (
		stagedArtifactHash !== artifactHash ||
		statSync(assetPath).size < 1 ||
		readFileSync(join(realStageDir, `${ASSET_NAME}.sha256`), "utf8") !==
			`${artifactHash}  ${ASSET_NAME}\n`
	) {
		throw new Error("staged release asset checksum does not match");
	}
	const provenance = readJson(join(realStageDir, "provenance.json"));
	const security = readJson(join(realStageDir, "security-scan.json"));
	if (
		typeof manifest.source_commit_sha !== "string" ||
		!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(manifest.source_commit_sha) ||
		manifest.source_commit_sha !== provenance.commit_sha
	) {
		throw new Error("release stage manifest does not bind its source commit");
	}
	if (
		provenance.artifact !== ASSET_NAME ||
		provenance.size_bytes !== statSync(assetPath).size ||
		security.target === null ||
		typeof security.target !== "object" ||
		Array.isArray(security.target) ||
		(security.target as JsonRecord).artifact !== ASSET_NAME
	) {
		throw new Error("staged release evidence does not bind the staged asset");
	}
	assertEvidence(provenance, security, artifactHash);
	const sbom = readJson(join(realStageDir, "sbom.spdx.json"));
	const sbomPackages = assertSbom(sbom, artifactHash, provenance);
	approvedLicenseFiles(
		join(realStageDir, "licenses"),
		provenance,
		artifactHash,
		sbomPackages,
	);
	return {
		stageDir: realStageDir,
		assetName: ASSET_NAME,
		artifactSha256: artifactHash,
		files: actualFiles,
		provenance,
		manifestSha256: sha256(manifestBytes),
	};
}

function assertStageTarget(stageDir: string): void {
	if (!existsSync(stageDir)) return;
	const target = lstatSync(stageDir);
	if (target.isSymbolicLink()) {
		throw new Error(`release stage is a symlink: ${stageDir}`);
	}
	if (!target.isDirectory()) {
		throw new Error(`release stage is not a directory: ${stageDir}`);
	}
}

function publishStage(tempDir: string, stageDir: string, cwd: string): void {
	const parent = resolve(stageDir, "..");
	const backup = `${stageDir}.previous-${process.pid}-${Date.now()}`;
	let movedExisting = false;
	try {
		assertStageTarget(stageDir);
		if (existsSync(stageDir)) {
			try {
				verifyStagedRelease({ cwd, stageDir });
			} catch {
				throw new Error(
					`refusing to replace an unverified release stage: ${stageDir}`,
				);
			}
			renameSync(stageDir, backup);
			movedExisting = true;
		}
		renameSync(tempDir, stageDir);
		syncDirectoryDurablyIfSupported(parent);
		if (movedExisting) rmSync(backup, { recursive: true });
	} catch (error) {
		if (!existsSync(stageDir) && movedExisting && existsSync(backup)) {
			renameSync(backup, stageDir);
		}
		throw error;
	}
}

export function stageRelease(
	options: StageReleaseOptions = {},
): StageReleaseResult {
	const cwd = resolve(options.cwd ?? process.cwd());
	const artifact = resolveExistingReleaseArtifact(
		cwd,
		options.artifact ?? DEFAULT_ARTIFACT,
	);
	const distRoot = assertReleaseArtifactOutputRoot(cwd);
	const stageDir = resolve(cwd, options.stageDir ?? DEFAULT_STAGE_DIR);
	const complianceDir = resolve(
		cwd,
		options.complianceDir ?? DEFAULT_COMPLIANCE_DIR,
	);
	if (!isDescendant(distRoot, stageDir)) {
		throw new Error("release stage must stay inside dist");
	}
	assertStageTarget(stageDir);
	if (!isDescendant(cwd, complianceDir) || !existsSync(complianceDir)) {
		throw new Error(`missing release compliance bundle: ${complianceDir}`);
	}
	assertNoExistingSymlinks(cwd, complianceDir);
	if (!isDescendant(realpathSync(cwd), realpathSync(complianceDir))) {
		throw new Error("release compliance bundle escapes the project");
	}
	const provenancePath = `${artifact.artifactPath}.provenance.json`;
	const securityPath = join(cwd, "dist/security-scan.release.json");
	const lockPath = join(cwd, "bun.lock");
	assertRegularFile(provenancePath, "release provenance");
	assertRegularFile(securityPath, "release security report");
	assertRegularFile(lockPath, "Bun dependency lockfile");
	const artifactHash = sha256(readFileSync(artifact.artifactPath));
	const lockHash = sha256(readFileSync(lockPath));
	const provenance = readJson(provenancePath);
	const security = readJson(securityPath);
	assertEvidence(provenance, security, artifactHash, lockHash);
	const sbom = buildReleaseSpdxSbom({
		cwd,
		assetName: ASSET_NAME,
		artifactSha256: artifactHash,
		provenance: {
			package_name: stringField(provenance, "package_name", "package name"),
			version: stringField(provenance, "version", "package version"),
			bun: stringField(provenance, "bun", "Bun runtime version"),
			generated_at: stringField(
				provenance,
				"generated_at",
				"provenance generation time",
			),
			commit_sha: stringField(provenance, "commit_sha", "source commit"),
		} satisfies ReleaseSbomProvenance,
	});
	const sbomPackages = assertSbom(sbom, artifactHash, provenance);
	const compliance = approvedLicenseFiles(
		complianceDir,
		provenance,
		artifactHash,
		sbomPackages,
	);

	const stageParent = resolve(stageDir, "..");
	assertNoExistingSymlinks(cwd, stageParent);
	mkdirSync(stageParent, { recursive: true });
	const realDist = realpathSync(distRoot);
	const realParent = realpathSync(stageParent);
	if (realParent !== realDist && !isDescendant(realDist, realParent)) {
		throw new Error("release stage parent escapes dist");
	}
	const tempDir = mkdtempSync(join(stageParent, ".afol-linux-x64-"));
	try {
		chmodSync(tempDir, 0o755);
		copyDurably(artifact.artifactPath, join(tempDir, ASSET_NAME), 0o755);
		writeText(
			join(tempDir, `${ASSET_NAME}.sha256`),
			`${artifactHash}  ${ASSET_NAME}\n`,
		);
		writeJson(join(tempDir, "provenance.json"), {
			...provenance,
			artifact: ASSET_NAME,
		});
		const target = security.target as JsonRecord;
		writeJson(join(tempDir, "security-scan.json"), {
			...security,
			target: { ...target, artifact: ASSET_NAME },
		});
		writeJson(join(tempDir, "sbom.spdx.json"), sbom);
		const licensesDir = join(tempDir, "licenses");
		mkdirSync(licensesDir);
		chmodSync(licensesDir, 0o755);
		for (const name of compliance.files) {
			const targetPath = join(licensesDir, name);
			mkdirSync(dirname(targetPath), { recursive: true });
			chmodSync(dirname(targetPath), 0o755);
			const expectedHash = compliance.hashes.get(name);
			if (!expectedHash) {
				throw new Error(`missing reviewed hash for compliance file: ${name}`);
			}
			copyDurably(join(complianceDir, name), targetPath);
			if (sha256(readFileSync(targetPath)) !== expectedHash) {
				throw new Error(
					`staged compliance file does not match approval: ${name}`,
				);
			}
		}
		const stagedFiles = listRegularFiles(tempDir).sort();
		writeJson(join(tempDir, "manifest.json"), {
			schema: "afol.release-stage/v1",
			asset: ASSET_NAME,
			artifact_sha256: artifactHash,
			source_commit_sha: provenance.commit_sha,
			files: stagedFiles.map((path) => ({
				path,
				sha256: sha256(readFileSync(join(tempDir, path))),
				size_bytes: statSync(join(tempDir, path)).size,
			})),
		});
		syncDirectoryDurablyIfSupported(tempDir);
		verifyStagedRelease({ cwd, stageDir: tempDir });
		publishStage(tempDir, stageDir, cwd);
		return {
			stageDir,
			assetName: ASSET_NAME,
			artifactSha256: artifactHash,
			files: [...stagedFiles, "manifest.json"].sort(),
		};
	} finally {
		if (existsSync(tempDir)) rmSync(tempDir, { recursive: true });
	}
}

function valueAfter(args: string[], index: number, flag: string): string {
	const value = args[index + 1];
	if (!value || value.startsWith("--"))
		throw new Error(`missing value for ${flag}`);
	return value;
}

function main(args: string[]): void {
	const options: StageReleaseOptions = {};
	let verifyStageDir: string | undefined;
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--verify-stage") {
			if (verifyStageDir !== undefined) {
				throw new Error("--verify-stage may only be specified once");
			}
			verifyStageDir = valueAfter(args, index++, arg);
		} else if (arg === "--artifact")
			options.artifact = valueAfter(args, index++, arg);
		else if (arg === "--stage-dir")
			options.stageDir = valueAfter(args, index++, arg);
		else if (arg === "--compliance-dir")
			options.complianceDir = valueAfter(args, index++, arg);
		else throw new Error(`unknown release stage option: ${arg}`);
	}
	if (verifyStageDir !== undefined) {
		if (
			options.artifact !== undefined ||
			options.stageDir !== undefined ||
			options.complianceDir !== undefined
		) {
			throw new Error("--verify-stage cannot be combined with stage options");
		}
		const result = verifyStagedRelease({ stageDir: verifyStageDir });
		console.log(
			`release stage verified: ${relative(process.cwd(), result.stageDir)} files=${result.files.length} sha256=${result.artifactSha256}`,
		);
		return;
	}
	const result = stageRelease(options);
	console.log(
		`release stage ready: ${relative(process.cwd(), result.stageDir)} files=${result.files.length} sha256=${result.artifactSha256}`,
	);
}

if (import.meta.main) main(process.argv.slice(2));
