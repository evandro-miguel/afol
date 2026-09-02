import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { ImportLimits } from "./types.ts";
import { DEFAULT_IMPORT_LIMITS } from "./types.ts";

export type JsonlReaderState = {
	bytes: number;
	lines: number;
	contentDigest: string;
};

type FileIdentity = {
	dev: number;
	ino: number;
	size: number;
	mtimeMs: number;
	nlink: number;
};

function mergedLimits(limits?: Partial<ImportLimits>): ImportLimits {
	return { ...DEFAULT_IMPORT_LIMITS, ...limits };
}

function snapshot(stats: {
	dev: number;
	ino: number;
	size: number;
	mtimeMs: number;
	nlink: number;
}): FileIdentity {
	return {
		dev: Number(stats.dev),
		ino: Number(stats.ino),
		size: Number(stats.size),
		mtimeMs: Number(stats.mtimeMs),
		nlink: Number(stats.nlink),
	};
}

function sameIdentity(before: FileIdentity, after: FileIdentity): boolean {
	return (
		before.dev === after.dev &&
		before.ino === after.ino &&
		before.nlink === after.nlink
	);
}

function checkShape(
	value: unknown,
	limits: ImportLimits,
	depth = 0,
	fieldCount = { value: 0 },
): void {
	if (depth > limits.maxDepth)
		throw new Error("import record exceeds maximum object depth");
	if (Array.isArray(value)) {
		for (const item of value) checkShape(item, limits, depth + 1, fieldCount);
		return;
	}
	if (value && typeof value === "object") {
		const entries = Object.entries(value);
		fieldCount.value += entries.length;
		if (fieldCount.value > limits.maxFields)
			throw new Error("import record exceeds maximum field count");
		for (const [key, item] of entries) {
			if (Buffer.byteLength(key, "utf8") > limits.maxLineBytes)
				throw new Error("import field name is too large");
			checkShape(item, limits, depth + 1, fieldCount);
		}
	}
}

export async function* readJsonl(
	path: string,
	state: JsonlReaderState,
	limitsInput?: Partial<ImportLimits>,
): AsyncGenerator<{ line: number; value: Record<string, unknown> }> {
	const isWindowsDrivePath = /^[A-Za-z]:[\\/]/.test(path);
	if (
		path.includes("\0") ||
		/^(?:\\\\|\/\/)/.test(path) ||
		(isWindowsDrivePath && process.platform !== "win32") ||
		path
			.split(/[\\/]/)
			.some(
				(part, index) =>
					part.includes(":") &&
					!(isWindowsDrivePath && index === 0 && /^[A-Za-z]:$/.test(part)),
			)
	)
		throw new Error("import source path is not a supported local path");
	const resolvedPath = resolve(path);
	const canonicalPath = await realpath(path);
	const samePhysicalPath =
		process.platform === "win32"
			? canonicalPath.toLowerCase() === resolvedPath.toLowerCase()
			: canonicalPath === resolvedPath;
	if (!samePhysicalPath)
		throw new Error("import source path must not contain symbolic links");
	if (canonicalPath.split(sep).some((part) => part === ".."))
		throw new Error("import source path is invalid");
	const limits = mergedLimits(limitsInput);
	const initial = await lstat(canonicalPath);
	if (!initial.isFile() || initial.isSymbolicLink() || initial.nlink !== 1)
		throw new Error("import source must be a regular, single-link file");
	const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
	const handle = await open(canonicalPath, flags);
	const opened = snapshot(await handle.stat());
	if (!sameIdentity(snapshot(initial), opened) || opened.nlink !== 1) {
		await handle.close();
		throw new Error("import source identity changed before reading");
	}
	const digest = createHash("sha256");
	state.bytes = 0;
	state.lines = 0;
	state.contentDigest = "";
	let carry = "";
	const decoder = new TextDecoder("utf-8", { fatal: true });
	const buffer = Buffer.allocUnsafe(64 * 1024);
	try {
		while (true) {
			const result = await handle.read(buffer, 0, buffer.byteLength, null);
			if (result.bytesRead === 0) break;
			const chunk = buffer.subarray(0, result.bytesRead);
			state.bytes += result.bytesRead;
			if (state.bytes > limits.maxBytes)
				throw new Error("import source exceeds maximum byte size");
			digest.update(chunk);
			carry += decoder.decode(chunk, { stream: true });
			if (Buffer.byteLength(carry, "utf8") > limits.maxLineBytes)
				throw new Error("import line exceeds maximum byte size");
			let newline = carry.indexOf("\n");
			while (newline >= 0) {
				const line = carry.slice(0, newline).replace(/\r$/, "");
				carry = carry.slice(newline + 1);
				state.lines += 1;
				if (state.lines > limits.maxLines)
					throw new Error("import source exceeds maximum line count");
				if (Buffer.byteLength(line, "utf8") > limits.maxLineBytes)
					throw new Error("import line exceeds maximum byte size");
				if (line.trim()) {
					let value: unknown;
					try {
						value = JSON.parse(line);
					} catch {
						throw new Error(`invalid JSONL record at line ${state.lines}`);
					}
					if (!value || typeof value !== "object" || Array.isArray(value))
						throw new Error(
							`JSONL record at line ${state.lines} must be an object`,
						);
					checkShape(value, limits);
					yield { line: state.lines, value: value as Record<string, unknown> };
				}
				newline = carry.indexOf("\n");
			}
		}
		carry += decoder.decode();
		if (carry) {
			state.lines += 1;
			if (state.lines > limits.maxLines)
				throw new Error("import source exceeds maximum line count");
			if (Buffer.byteLength(carry, "utf8") > limits.maxLineBytes)
				throw new Error("import line exceeds maximum byte size");
			let value: unknown;
			try {
				value = JSON.parse(carry);
			} catch {
				throw new Error(`invalid JSONL record at line ${state.lines}`);
			}
			if (!value || typeof value !== "object" || Array.isArray(value))
				throw new Error(
					`JSONL record at line ${state.lines} must be an object`,
				);
			checkShape(value, limits);
			yield { line: state.lines, value: value as Record<string, unknown> };
		}
		state.contentDigest = digest.digest("hex");
		const final = snapshot(await handle.stat());
		if (
			!sameIdentity(opened, final) ||
			final.size !== state.bytes ||
			final.nlink !== 1
		)
			throw new Error("import source changed while reading");
	} finally {
		await handle.close();
	}
}
