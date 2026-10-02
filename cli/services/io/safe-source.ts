import {
	closeSync,
	constants as fsConstants,
	fstatSync,
	lstatSync,
	openSync,
	readSync,
	realpathSync,
	type Stats,
} from "node:fs";
import { dirname, resolve } from "node:path";

export type BoundedSourceLimits = {
	maxBytes: number;
	maxLines: number;
	maxCandidates: number;
};

export type SafeSourceReadHooks = {
	afterOpen?: () => void;
};

export type BoundedSourceRange = {
	offset: number;
	maxBytes: number;
};

export type BoundedSourceFileContents = {
	bytes: Buffer;
	text: string;
};

export type SafeSourceIdentity = {
	dev: string;
	ino: string;
	size: string;
	mtime_ms: string;
	ctime_ms: string;
};

function sourceIdentity(stat: Stats): SafeSourceIdentity {
	return {
		dev: String(stat.dev),
		ino: String(stat.ino),
		size: String(stat.size),
		mtime_ms: String(stat.mtimeMs),
		ctime_ms: String(stat.ctimeMs),
	};
}

function isMissing(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "ENOENT"
	);
}

function samePath(left: string, right: string): boolean {
	const a = resolve(left);
	const b = resolve(right);
	return process.platform === "win32"
		? a.toLowerCase() === b.toLowerCase()
		: a === b;
}

function inspectParents(path: string): void {
	let current = dirname(path);
	while (true) {
		try {
			const stat = lstatSync(current);
			if (stat.isSymbolicLink() || !stat.isDirectory())
				throw new Error("source parent must be a real directory");
			if (!samePath(realpathSync(current), current))
				throw new Error("source parent crosses a reparse point");
			return;
		} catch (error) {
			if (!isMissing(error)) throw error;
			const parent = dirname(current);
			if (parent === current) throw error;
			current = parent;
		}
	}
}

function sameFile(left: Stats, right: Stats): boolean {
	return (
		String(left.dev) === String(right.dev) &&
		String(left.ino) === String(right.ino) &&
		Number(left.size) === Number(right.size) &&
		Number(left.mtimeMs) === Number(right.mtimeMs) &&
		Number(left.ctimeMs) === Number(right.ctimeMs)
	);
}

/**
 * Validate a source file without following its final component. The stable
 * label keeps malformed-source errors from disclosing absolute paths.
 */
export function assertSafeSourceFile(
	path: string,
	label: string,
	allowMissing = true,
): Stats | null {
	inspectParents(path);
	try {
		const stat = lstatSync(path);
		if (stat.isSymbolicLink() || !stat.isFile())
			throw new Error(`${label} must be a regular file`);
		if (Number(stat.nlink) !== 1)
			throw new Error(`${label} must not be hardlinked`);
		if (!samePath(realpathSync(path), path))
			throw new Error(`${label} crosses a reparse point`);
		return stat;
	} catch (error) {
		if (isMissing(error) && allowMissing) return null;
		throw error;
	}
}

function countLines(text: string): number {
	if (text.length === 0) return 0;
	const lines = text.split(/\r?\n/);
	return lines.at(-1) === "" ? lines.length - 1 : lines.length;
}

function countCandidates(text: string): number {
	return text.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

/** Read bounded UTF-8 source bytes using a descriptor and re-check its identity. */
export function readBoundedSourceFileWithBytes(
	path: string,
	label: string,
	limits: BoundedSourceLimits,
	hooks?: SafeSourceReadHooks,
): BoundedSourceFileContents | null {
	if (
		!Number.isSafeInteger(limits.maxBytes) ||
		limits.maxBytes < 0 ||
		!Number.isSafeInteger(limits.maxLines) ||
		limits.maxLines < 0 ||
		!Number.isSafeInteger(limits.maxCandidates) ||
		limits.maxCandidates < 0
	)
		throw new Error("source limits are invalid");

	const before = assertSafeSourceFile(path, label);
	if (!before) return null;
	if (Number(before.size) > limits.maxBytes)
		throw new Error(`${label} exceeds the byte limit`);

	const flags =
		fsConstants.O_RDONLY |
		(process.platform === "win32" ? 0 : (fsConstants.O_NOFOLLOW ?? 0));
	const fd = openSync(path, flags);
	try {
		hooks?.afterOpen?.();
		const opened = fstatSync(fd);
		if (
			!opened.isFile() ||
			Number(opened.nlink) !== 1 ||
			!sameFile(before, opened)
		)
			throw new Error(`${label} changed during read`);

		const buffer = Buffer.allocUnsafe(limits.maxBytes + 1);
		let offset = 0;
		while (offset < buffer.length) {
			const bytesRead = readSync(
				fd,
				buffer,
				offset,
				buffer.length - offset,
				null,
			);
			if (bytesRead === 0) break;
			offset += bytesRead;
		}
		if (offset > limits.maxBytes)
			throw new Error(`${label} exceeds the byte limit`);

		const after = assertSafeSourceFile(path, label, false);
		if (!after || !sameFile(before, after))
			throw new Error(`${label} changed during read`);

		const bytes = buffer.subarray(0, offset);
		let text: string;
		try {
			text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
				bytes,
			);
		} catch {
			throw new Error(`${label} is not valid UTF-8`);
		}
		if (countLines(text) > limits.maxLines)
			throw new Error(`${label} exceeds the line limit`);
		if (countCandidates(text) > limits.maxCandidates)
			throw new Error(`${label} exceeds the candidate limit`);
		return { bytes, text };
	} finally {
		closeSync(fd);
	}
}

/** Read a bounded regular UTF-8 source and return its decoded text. */
export function readBoundedSourceFile(
	path: string,
	label: string,
	limits: BoundedSourceLimits,
	hooks?: SafeSourceReadHooks,
): string | null {
	return (
		readBoundedSourceFileWithBytes(path, label, limits, hooks)?.text ?? null
	);
}

/** Read one bounded byte range without following the final path component. */
export function readBoundedSourceRange(
	path: string,
	label: string,
	range: BoundedSourceRange,
): {
	bytes: Buffer;
	totalBytes: number;
	sourceIdentity: SafeSourceIdentity;
} {
	if (
		!Number.isSafeInteger(range.offset) ||
		range.offset < 0 ||
		!Number.isSafeInteger(range.maxBytes) ||
		range.maxBytes < 1
	)
		throw new Error("source range limits are invalid");
	const before = assertSafeSourceFile(path, label);
	if (!before) throw new Error(`${label} is unavailable`);
	const totalBytes = Number(before.size);
	if (range.offset > totalBytes)
		throw new Error(`${label} byte offset exceeds the source size`);
	const length = Math.min(range.maxBytes, totalBytes - range.offset);
	const flags =
		fsConstants.O_RDONLY |
		(process.platform === "win32" ? 0 : (fsConstants.O_NOFOLLOW ?? 0));
	const fd = openSync(path, flags);
	try {
		const opened = fstatSync(fd);
		if (
			!opened.isFile() ||
			Number(opened.nlink) !== 1 ||
			!sameFile(before, opened)
		)
			throw new Error(`${label} changed during read`);
		const buffer = Buffer.allocUnsafe(length);
		let offset = 0;
		while (offset < length) {
			const count = readSync(
				fd,
				buffer,
				offset,
				length - offset,
				range.offset + offset,
			);
			if (count === 0) break;
			offset += count;
		}
		const after = assertSafeSourceFile(path, label, false);
		if (!after || !sameFile(before, after))
			throw new Error(`${label} changed during read`);
		return {
			bytes: buffer.subarray(0, offset),
			totalBytes,
			sourceIdentity: sourceIdentity(opened),
		};
	} finally {
		closeSync(fd);
	}
}
