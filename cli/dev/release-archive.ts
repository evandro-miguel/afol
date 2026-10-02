#!/usr/bin/env bun

import { createHash } from "node:crypto";
import {
	closeSync,
	constants,
	fstatSync,
	linkSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	openSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import {
	syncDirectoryDurablyIfSupported,
	syncFileDurably,
} from "../services/io/durable-sync";
import { assertReleaseArtifactOutputRoot } from "./release-artifact";
import { verifyStagedRelease } from "./stage-release";

const DEFAULT_STAGE_DIR = "dist/release/afol-linux-x64";
const ARCHIVE_NAME = "afol-linux-x64.tar.gz";

type JsonRecord = Record<string, unknown>;

export type PackageStagedReleaseArchiveOptions = {
	cwd?: string;
	stageDir: string;
};

export type PackageStagedReleaseArchiveResult = {
	archivePath: string;
	archiveName: string;
	archiveSha256: string;
	checksumPath: string;
	files: string[];
	provenance: JsonRecord;
};

function sha256(bytes: Uint8Array | string): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function tarOctalField(
	bytes: Uint8Array,
	offset: number,
	length: number,
	label: string,
): number {
	if ((bytes[offset] ?? 0) & 0x80) {
		throw new Error(`unsupported TAR ${label} encoding`);
	}
	const value = new TextDecoder()
		.decode(bytes.subarray(offset, offset + length))
		.replace(/\0.*$/u, "")
		.trim();
	if (value === "") return 0;
	if (!/^[0-7]+$/u.test(value)) {
		throw new Error(`invalid TAR ${label}`);
	}
	const parsed = Number.parseInt(value, 8);
	if (!Number.isSafeInteger(parsed) || parsed < 0) {
		throw new Error(`invalid TAR ${label}`);
	}
	return parsed;
}

function canonicalizeTarModificationTimes(tarBytes: Uint8Array): Uint8Array {
	const tar = new Uint8Array(tarBytes);
	let offset = 0;
	let foundEndMarker = false;
	while (offset + 512 <= tar.byteLength) {
		const header = tar.subarray(offset, offset + 512);
		if (header.every((byte) => byte === 0)) {
			foundEndMarker = true;
			break;
		}
		const storedChecksum = tarOctalField(header, 148, 8, "header checksum");
		let actualChecksum = 0;
		for (let index = 0; index < header.length; index++) {
			actualChecksum +=
				index >= 148 && index < 156 ? 0x20 : (header[index] ?? 0);
		}
		if (storedChecksum !== actualChecksum) {
			throw new Error("invalid TAR header checksum from Bun.Archive");
		}
		const size = tarOctalField(header, 124, 12, "entry size");
		const nextOffset = offset + 512 + Math.ceil(size / 512) * 512;
		if (nextOffset > tar.byteLength) {
			throw new Error("truncated TAR entry from Bun.Archive");
		}

		header.fill(0x30, 136, 147);
		header[147] = 0;
		header.fill(0x20, 148, 156);
		let normalizedChecksum = 0;
		for (const byte of header) normalizedChecksum += byte;
		const checksumText = normalizedChecksum.toString(8).padStart(6, "0");
		if (checksumText.length > 6) {
			throw new Error("TAR header checksum exceeds its supported field");
		}
		for (let index = 0; index < checksumText.length; index++) {
			header[148 + index] = checksumText.charCodeAt(index);
		}
		header[154] = 0;
		header[155] = 0x20;
		offset = nextOffset;
	}
	if (!foundEndMarker) {
		throw new Error("missing TAR end marker from Bun.Archive");
	}
	return tar;
}

function isWithin(root: string, candidate: string): boolean {
	const child = relative(root, candidate);
	return (
		child === "" ||
		(child !== ".." &&
			!child.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) &&
			!isAbsolute(child))
	);
}

function existsIncludingDanglingSymlink(path: string): boolean {
	try {
		lstatSync(path);
		return true;
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return false;
		}
		throw error;
	}
}

function removePublishedLinkIfOwned(
	publishedPath: string,
	tempPath: string,
): void {
	if (!existsIncludingDanglingSymlink(publishedPath)) return;
	const published = lstatSync(publishedPath);
	const temporary = lstatSync(tempPath);
	if (
		!published.isFile() ||
		published.isSymbolicLink() ||
		!temporary.isFile() ||
		temporary.isSymbolicLink() ||
		published.dev !== temporary.dev ||
		published.ino !== temporary.ino
	) {
		throw new Error("release archive output changed during rollback");
	}
	rmSync(publishedPath);
}

function readRegularFile(path: string, root: string): Uint8Array {
	const resolved = resolve(path);
	if (!isWithin(root, resolved)) {
		throw new Error("release stage file escapes its verified directory");
	}
	const realPath = realpathSync(resolved);
	if (!isWithin(root, realPath) || !lstatSync(resolved).isFile()) {
		throw new Error("release stage contains a non-regular file");
	}
	const descriptor = openSync(
		resolved,
		constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
	);
	try {
		if (!fstatSync(descriptor).isFile()) {
			throw new Error("release stage contains a non-regular file");
		}
		return readFileSync(descriptor);
	} finally {
		closeSync(descriptor);
	}
}

function stageArchiveEntries(
	stageDir: string,
	paths: string[],
	expectedManifestSha256: string,
): Record<string, Uint8Array> {
	const manifestBytes = readRegularFile(
		join(stageDir, "manifest.json"),
		stageDir,
	);
	if (sha256(manifestBytes) !== expectedManifestSha256) {
		throw new Error("release stage manifest changed during archive packaging");
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(new TextDecoder().decode(manifestBytes));
	} catch {
		throw new Error("release stage manifest changed during archive packaging");
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error("release stage manifest changed during archive packaging");
	}
	const manifest = parsed as JsonRecord;
	if (!Array.isArray(manifest.files)) {
		throw new Error("release stage manifest changed during archive packaging");
	}
	const expected = new Map<string, { sha256: string; size: number }>();
	for (const value of manifest.files) {
		if (!value || typeof value !== "object" || Array.isArray(value)) {
			throw new Error(
				"release stage manifest changed during archive packaging",
			);
		}
		const entry = value as JsonRecord;
		if (
			typeof entry.path !== "string" ||
			typeof entry.sha256 !== "string" ||
			typeof entry.size_bytes !== "number"
		) {
			throw new Error(
				"release stage manifest changed during archive packaging",
			);
		}
		expected.set(entry.path, {
			sha256: entry.sha256,
			size: entry.size_bytes,
		});
	}
	const entries = Object.create(null) as Record<string, Uint8Array>;
	for (const path of paths) {
		if (path === "manifest.json") {
			entries[path] = manifestBytes;
			continue;
		}
		const binding = expected.get(path);
		if (!binding) {
			throw new Error(
				"release stage manifest changed during archive packaging",
			);
		}
		const bytes = readRegularFile(join(stageDir, ...path.split("/")), stageDir);
		if (bytes.byteLength !== binding.size || sha256(bytes) !== binding.sha256) {
			throw new Error(
				`release stage file changed during archive packaging: ${path}`,
			);
		}
		entries[path] = bytes;
	}
	if (
		expected.size + 1 !== paths.length ||
		[...expected.keys(), "manifest.json"].sort().join("\n") !==
			[...paths].sort().join("\n")
	) {
		throw new Error("release stage inventory changed during archive packaging");
	}
	return entries;
}

function releaseOutputDirectory(cwd: string): string {
	const distRoot = assertReleaseArtifactOutputRoot(cwd);
	const releaseDir = join(distRoot, "release");
	if (existsIncludingDanglingSymlink(releaseDir)) {
		if (
			lstatSync(releaseDir).isSymbolicLink() ||
			!lstatSync(releaseDir).isDirectory()
		) {
			throw new Error("release archive output directory is unsafe");
		}
	} else {
		mkdirSync(releaseDir);
	}
	const realDist = realpathSync(distRoot);
	const realRelease = realpathSync(releaseDir);
	if (!isWithin(realDist, realRelease) || realRelease === realDist) {
		throw new Error("release archive output directory escapes dist");
	}
	return realRelease;
}

export async function packageStagedReleaseArchive({
	cwd: cwdOption,
	stageDir: stageDirOption,
}: PackageStagedReleaseArchiveOptions): Promise<PackageStagedReleaseArchiveResult> {
	const cwd = resolve(cwdOption ?? process.cwd());
	const stageDir = resolve(cwd, stageDirOption);
	const verified = verifyStagedRelease({ cwd, stageDir });
	const outputDir = releaseOutputDirectory(cwd);
	const archivePath = join(outputDir, ARCHIVE_NAME);
	const checksumPath = `${archivePath}.sha256`;
	if (
		existsIncludingDanglingSymlink(archivePath) ||
		existsIncludingDanglingSymlink(checksumPath)
	) {
		throw new Error("release archive output already exists");
	}
	const entries = stageArchiveEntries(
		verified.stageDir,
		verified.files,
		verified.manifestSha256,
	);
	const tarBytes = await new Bun.Archive(entries).bytes();
	const archiveBytes = gzipSync(canonicalizeTarModificationTimes(tarBytes), {
		level: 9,
	});
	const archiveSha256 = sha256(archiveBytes);
	const checksum = `${archiveSha256}  ${ARCHIVE_NAME}\n`;
	const tempDir = mkdtempSync(join(outputDir, ".afol-release-archive-"));
	const tempArchive = join(tempDir, ARCHIVE_NAME);
	const tempChecksum = `${tempArchive}.sha256`;
	let publishedArchive = false;
	let publishedChecksum = false;
	try {
		writeFileSync(tempArchive, archiveBytes, { mode: 0o644, flag: "wx" });
		syncFileDurably(tempArchive);
		writeFileSync(tempChecksum, checksum, { mode: 0o644, flag: "wx" });
		syncFileDurably(tempChecksum);
		linkSync(tempArchive, archivePath);
		publishedArchive = true;
		linkSync(tempChecksum, checksumPath);
		publishedChecksum = true;
		syncDirectoryDurablyIfSupported(outputDir);
	} catch (error) {
		let rollbackError: unknown;
		if (publishedChecksum) {
			try {
				removePublishedLinkIfOwned(checksumPath, tempChecksum);
			} catch (cleanupError) {
				rollbackError = cleanupError;
			}
		}
		if (publishedArchive) {
			try {
				removePublishedLinkIfOwned(archivePath, tempArchive);
			} catch (cleanupError) {
				rollbackError ??= cleanupError;
			}
		}
		if (rollbackError) {
			throw new Error("release archive rollback could not remove its outputs", {
				cause: rollbackError,
			});
		}
		throw error;
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
	return {
		archivePath,
		archiveName: ARCHIVE_NAME,
		archiveSha256,
		checksumPath,
		files: verified.files,
		provenance: verified.provenance,
	};
}

async function main(args: string[]): Promise<void> {
	let stageDir: string | undefined;
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg !== "--stage-dir") {
			throw new Error(`unknown release archive option: ${arg}`);
		}
		if (stageDir !== undefined) {
			throw new Error("--stage-dir may only be specified once");
		}
		const value = args[index + 1];
		if (!value || value.startsWith("--")) {
			throw new Error("missing value for --stage-dir");
		}
		stageDir = value;
		index += 1;
	}
	const result = await packageStagedReleaseArchive({
		stageDir: stageDir ?? DEFAULT_STAGE_DIR,
	});
	console.log(
		`release archive ready: ${relative(process.cwd(), result.archivePath)} sha256=${result.archiveSha256} files=${result.files.length}`,
	);
}

if (import.meta.main) {
	main(process.argv.slice(2)).catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : "archive failed");
		process.exitCode = 1;
	});
}
