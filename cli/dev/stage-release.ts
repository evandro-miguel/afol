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

function approvedLicenseFiles(
	complianceDir: string,
	provenance: JsonRecord,
	artifactHash: string,
): { review: JsonRecord; files: string[] } {
	const reviewName = "compliance-review.json";
	const review = readJson(join(complianceDir, reviewName));
	if (
		review.schema !== "afol.release-compliance/v1" ||
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
		if (
			typeof value !== "string" ||
			value.length === 0 ||
			value.includes("\\") ||
			value.split("/").some((part) => !part || part === "." || part === "..")
		) {
			throw new Error("compliance review has an invalid license path");
		}
		return value;
	});
	const actual = listRegularFiles(complianceDir).filter(
		(path) => path !== reviewName,
	);
	if (JSON.stringify(reviewed.sort()) !== JSON.stringify(actual)) {
		throw new Error(
			"reviewed license set does not match the compliance bundle",
		);
	}
	return { review, files: [reviewName, ...actual].sort() };
}

function publishStage(tempDir: string, stageDir: string): void {
	const parent = resolve(stageDir, "..");
	const backup = `${stageDir}.previous-${process.pid}-${Date.now()}`;
	let movedExisting = false;
	try {
		if (existsSync(stageDir)) {
			if (lstatSync(stageDir).isSymbolicLink()) {
				throw new Error(`release stage is a symlink: ${stageDir}`);
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
	if (!isDescendant(cwd, complianceDir) || !existsSync(complianceDir)) {
		throw new Error(`missing release compliance bundle: ${complianceDir}`);
	}
	assertNoExistingSymlinks(cwd, complianceDir);
	if (!isDescendant(realpathSync(cwd), realpathSync(complianceDir))) {
		throw new Error("release compliance bundle escapes the project");
	}
	const provenancePath = `${artifact.artifactPath}.provenance.json`;
	const securityPath = join(cwd, "dist/security-scan.release.json");
	assertRegularFile(provenancePath, "release provenance");
	assertRegularFile(securityPath, "release security report");
	const artifactHash = sha256(readFileSync(artifact.artifactPath));
	const provenance = readJson(provenancePath);
	const security = readJson(securityPath);
	assertEvidence(provenance, security, artifactHash);
	const compliance = approvedLicenseFiles(
		complianceDir,
		provenance,
		artifactHash,
	);

	const stageParent = resolve(stageDir, "..");
	assertNoExistingSymlinks(distRoot, stageParent);
	mkdirSync(stageParent, { recursive: true });
	if (!isDescendant(realpathSync(distRoot), realpathSync(stageParent))) {
		throw new Error("release stage parent escapes dist");
	}
	if (existsSync(stageDir) && lstatSync(stageDir).isSymbolicLink()) {
		throw new Error(`release stage is a symlink: ${stageDir}`);
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
		writeJson(
			join(tempDir, "sbom.spdx.json"),
			buildReleaseSpdxSbom({
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
			}),
		);
		const licensesDir = join(tempDir, "licenses");
		mkdirSync(licensesDir);
		chmodSync(licensesDir, 0o755);
		for (const name of compliance.files) {
			const targetPath = join(licensesDir, name);
			mkdirSync(dirname(targetPath), { recursive: true });
			chmodSync(dirname(targetPath), 0o755);
			copyDurably(join(complianceDir, name), targetPath);
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
		publishStage(tempDir, stageDir);
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
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--artifact") options.artifact = valueAfter(args, index++, arg);
		else if (arg === "--stage-dir")
			options.stageDir = valueAfter(args, index++, arg);
		else if (arg === "--compliance-dir")
			options.complianceDir = valueAfter(args, index++, arg);
		else throw new Error(`unknown release stage option: ${arg}`);
	}
	const result = stageRelease(options);
	console.log(
		`release stage ready: ${relative(process.cwd(), result.stageDir)} files=${result.files.length} sha256=${result.artifactSha256}`,
	);
}

if (import.meta.main) main(process.argv.slice(2));
