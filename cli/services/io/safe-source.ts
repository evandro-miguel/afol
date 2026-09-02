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

/** Read a bounded regular source using a descriptor and re-check its identity. */
export function readBoundedSourceFile(
	path: string,
	label: string,
	limits: BoundedSourceLimits,
	hooks?: SafeSourceReadHooks,
): string | null {
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

		const text = buffer.subarray(0, offset).toString("utf8");
		if (countLines(text) > limits.maxLines)
			throw new Error(`${label} exceeds the line limit`);
		if (countCandidates(text) > limits.maxCandidates)
			throw new Error(`${label} exceeds the candidate limit`);
		return text;
	} finally {
		closeSync(fd);
	}
}
