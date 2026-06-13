#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_TEMPLATE_HASH } from "../generated/template";
import { CLI_PACKAGE_NAME, CLI_VERSION } from "../generated/version";
import {
	buildReleaseSecurityScanOutcomes,
	supportedDependencyLockfile,
} from "./security-scan";

const DEFAULT_ARTIFACT = "dist/afol";
const DEFAULT_BUILD_COMMAND = "bun run build:deterministic";

type ReleaseProvenance = {
	artifact: string;
	package_name: string;
	version: string;
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
	security_scanners: Array<{
		tool: string;
		kind: string;
		status: string;
		reason?: string;
		waiver_required?: boolean;
	}>;
};

type WriteReleaseProvenanceOptions = {
	cwd?: string;
	artifact?: string;
	releaseMode?: boolean;
	buildCommand?: string;
};

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

export function buildReleaseProvenance(
	options: WriteReleaseProvenanceOptions = {},
): ReleaseProvenance {
	const cwd = options.cwd ?? process.cwd();
	const artifact = options.artifact ?? DEFAULT_ARTIFACT;
	const artifactPath = join(cwd, artifact);
	if (!existsSync(artifactPath)) {
		throw new Error(`missing release artifact: ${artifact}`);
	}

	const bytes = readFileSync(artifactPath);
	const stats = statSync(artifactPath);
	const lockMetadata = readLockMetadata(cwd);
	const provenance: ReleaseProvenance = {
		artifact,
		package_name: CLI_PACKAGE_NAME,
		version: CLI_VERSION,
		sha256: sha256Hex(bytes),
		size_bytes: stats.size,
		bun: process.versions.bun ?? "unknown",
		node: process.version,
		generated_at: new Date().toISOString(),
		commit_sha: runGitCommand(cwd, ["rev-parse", "HEAD"]),
		branch: runGitCommand(cwd, ["branch", "--show-current"]),
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
		security_scanners: buildReleaseSecurityScanOutcomes().map((scanner) => ({
			tool: scanner.tool,
			kind: scanner.kind,
			status: scanner.status,
			...(scanner.reason ? { reason: scanner.reason } : {}),
			...(scanner.waiver_required
				? { waiver_required: scanner.waiver_required }
				: {}),
		})),
	};

	if (options.releaseMode) {
		assertKnownReleaseFields(provenance);
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
	const artifact = options.artifact ?? DEFAULT_ARTIFACT;
	const checksumPath = join(cwd, `${artifact}.sha256`);
	const provenancePath = join(cwd, `${artifact}.provenance.json`);
	const provenance = buildReleaseProvenance(options);

	writeFileSync(checksumPath, `${provenance.sha256}  ${artifact}\n`, "utf8");
	writeFileSync(
		provenancePath,
		`${JSON.stringify(provenance, null, 2)}\n`,
		"utf8",
	);

	return { checksumPath, provenancePath };
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
