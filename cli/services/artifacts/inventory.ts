/**
 * Shared artifact inventory: bounded owner-relative enumeration and paged
 * reads for workbench sessions and standalone records. Capture, listing,
 * directed read, and reference verification all consume this module, so a
 * file that is listable is also readable and citable. The inventory never
 * opens the evolution database and never requires a healthy session.
 */

import { createHash } from "node:crypto";
import {
	existsSync,
	lstatSync,
	readdirSync,
	type Dirent,
	type Stats,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { assertSafeSourceFile, readBoundedSourceRange } from "../io/safe-source";
import { redactImported } from "../evolution/imports/redaction";
import { resolveProjectPaths } from "../project/paths";
import { resolveProjectWritePath } from "../project/root";
import type { ArtifactOwner, ArtifactPage } from "./types";

const SESSION_ARTIFACT_KINDS = new Set([
	"analysis",
	"findings",
	"handoff",
	"log",
	"plan",
	"postmortem",
	"report",
	"research",
	"retrospective",
	"review",
	"task",
]);

export const OWNER_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
export const MAX_OWNER_FILES = 4_096;
export const MAX_ARTIFACT_NESTING_DEPTH = 4;
export const DEFAULT_PAGE_BYTES = 8 * 1024;
export const MAX_PAGE_BYTES = 32 * 1024;
export const MAX_ARTIFACT_BYTES = 256 * 1024;

const ARTIFACT_TEXT_EXTENSION_RE = /\.(?:md|log|txt|jsonl)$/i;
const PAGE_CURSOR_VERSION = 1;

export type InventoryFile = {
	/** Owner-relative posix path, e.g. `S-x_report_1.md` or `artifacts/handoff.md`. */
	name: string;
	/** Absolute path inside the project root. */
	path: string;
	bytes: number;
	mtime_ms: number;
	ctime_ms: number;
	dev: string;
	ino: string;
	/** True for canonical session-prefixed managed names. */
	canonical: boolean;
};

export type InventoryEnumeration = {
	files: InventoryFile[];
	unsupportedCount: number;
};

export type SourceIdentityDigest = string;

export type ArtifactPageRead = {
	page: ArtifactPage;
	rawDigest: string;
	sourceIdentityDigest: SourceIdentityDigest;
	anchor: string;
	digestScope: "artifact" | "range";
	/** True when this page covered the entire source file. */
	wholeSource: boolean;
	/** Raw bytes of the page before redaction; only for in-process validation. */
	rawBytes: Buffer;
};

type PageCursor = {
	v: 1;
	op: "page";
	path: string;
	offset: number;
	source_identity_digest: string;
};

export function digestBytes(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex");
}

export function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value !== null && typeof value === "object")
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
			.join(",")}}`;
	return JSON.stringify(value) ?? "null";
}

export function sourceIdentityDigest(stat: {
	dev: string | number;
	ino: string | number;
	size: string | number;
	mtimeMs: string | number;
	ctimeMs: string | number;
}): string {
	return digestBytes(
		stableJson({
			dev: String(stat.dev),
			ino: String(stat.ino),
			size: String(stat.size),
			mtime_ms: String(stat.mtimeMs),
			ctime_ms: String(stat.ctimeMs),
		}),
	);
}

/** Canonical managed artifact name for a session, e.g. `S-x_report_1.md`. */
export function canonicalSessionArtifactKind(
	name: string,
	sessionId: string,
): string | null {
	if (name === ".evidence.jsonl") return "evidence";
	const escaped = sessionId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = new RegExp(`^${escaped}_(.+)_([0-9]+)\\.md$`, "i").exec(name);
	const kind = match?.[1]?.toLowerCase();
	return kind && SESSION_ARTIFACT_KINDS.has(kind) ? kind : null;
}

function inventoryFile(
	path: string,
	name: string,
	stat: Stats,
	canonical: boolean,
): InventoryFile {
	return {
		name,
		path,
		bytes: Number(stat.size),
		mtime_ms: Number(stat.mtimeMs),
		ctime_ms: Number(stat.ctimeMs),
		dev: String(stat.dev),
		ino: String(stat.ino),
		canonical,
	};
}

function supplementaryStat(path: string): Stats | null {
	try {
		const stat = lstatSync(path);
		return stat.isFile() ? stat : null;
	} catch {
		return null;
	}
}

function enumerateArtifactSubtree(
	input: {
		baseDir: string;
		prefix: string;
		depth: number;
		budget: { entries: number };
	},
	out: {
		files: InventoryFile[];
		unsupportedCount: number;
	},
): void {
	if (input.depth > MAX_ARTIFACT_NESTING_DEPTH) {
		out.unsupportedCount += 1;
		return;
	}
	let entries: Dirent[];
	try {
		entries = readdirSync(input.baseDir, { withFileTypes: true });
	} catch {
		out.unsupportedCount += 1;
		return;
	}
	for (const entry of entries) {
		if (input.budget.entries >= MAX_OWNER_FILES) {
			out.unsupportedCount += 1;
			return;
		}
		input.budget.entries += 1;
		const path = join(input.baseDir, entry.name);
		const name = `${input.prefix}${entry.name}`;
		if (entry.isDirectory()) {
			enumerateArtifactSubtree(
				{ baseDir: path, prefix: `${name}/`, depth: input.depth + 1, budget: input.budget },
				out,
			);
			continue;
		}
		if (
			!entry.isFile() ||
			entry.name.startsWith(".") ||
			!ARTIFACT_TEXT_EXTENSION_RE.test(entry.name)
		) {
			out.unsupportedCount += 1;
			continue;
		}
		const stat = supplementaryStat(path);
		if (!stat) {
			out.unsupportedCount += 1;
			continue;
		}
		out.files.push(inventoryFile(path, name, stat, false));
	}
}

/**
 * Enumerate one artifact owner directory: managed files at the root,
 * supplementary text files at the root, and the whole `artifacts/`
 * supplementary subtree used by retained session attachments. Files that
 * cannot be safely represented are counted, never silently dropped.
 */
export function enumerateOwnerDirectory(input: {
	dir: string;
	sessionId?: string;
}): InventoryEnumeration {
	const budget = { entries: 0 };
	const out: InventoryEnumeration = { files: [], unsupportedCount: 0 };
	let entries: Dirent[];
	try {
		entries = readdirSync(input.dir, { withFileTypes: true });
	} catch {
		throw new Error(
			"artifact owner directory must be a real directory inside the project root",
		);
	}
	for (const entry of entries) {
		if (budget.entries >= MAX_OWNER_FILES)
			throw new Error(
				"artifact owner exceeds the bounded inventory; select a specific artifact",
			);
		budget.entries += 1;
		if (entry.isDirectory()) {
			if (entry.name === "artifacts") {
				enumerateArtifactSubtree(
					{ baseDir: join(input.dir, entry.name), prefix: "artifacts/", depth: 1, budget },
					out,
				);
			} else {
				out.unsupportedCount += 1;
			}
			continue;
		}
		if (!entry.isFile()) {
			out.unsupportedCount += 1;
			continue;
		}
		const path = join(input.dir, entry.name);
		const canonicalKind = input.sessionId
			? canonicalSessionArtifactKind(entry.name, input.sessionId)
			: null;
		if (canonicalKind) {
			const stat = assertSafeSourceFile(path, "session artifact");
			if (!stat) continue;
			out.files.push(inventoryFile(path, entry.name, stat, true));
			continue;
		}
		if (
			entry.name.startsWith(".") ||
			!ARTIFACT_TEXT_EXTENSION_RE.test(entry.name)
		) {
			out.unsupportedCount += 1;
			continue;
		}
		const stat = supplementaryStat(path);
		if (!stat) {
			out.unsupportedCount += 1;
			continue;
		}
		out.files.push(inventoryFile(path, entry.name, stat, false));
	}
	out.files.sort((left, right) => left.name.localeCompare(right.name));
	return out;
}

/** Resolve and validate a standalone record directory. */
export function resolveRecordDirectory(
	root: string,
	recordId: string,
): { recordDir: string; existed: boolean } {
	if (!OWNER_ID_RE.test(recordId))
		throw new Error(`invalid standalone record id: ${recordId}`);
	const paths = resolveProjectPaths(root);
	const recordRelative = `${paths.recordsDir}/${recordId}`;
	const resolved = resolveProjectWritePath(root, recordRelative);
	if (!resolved.ok) throw new Error(resolved.error);
	const liveSession = resolveProjectWritePath(
		root,
		`${paths.wbDir}/${recordId}`,
	);
	const archivedSession = resolveProjectWritePath(
		root,
		`${paths.wbDir}/_archive/${recordId}`,
	);
	const sessionConflict =
		(liveSession.ok && existsSync(liveSession.value.path)) ||
		(archivedSession.ok && existsSync(archivedSession.value.path));
	if (sessionConflict)
		throw new Error(
			`duplicate artifact owner id in two locations: ${recordId}; standalone records must not reuse a session id`,
		);
	const existed = existsSync(resolved.value.path);
	if (existed) {
		const stat = lstatSync(resolved.value.path);
		if (!stat.isDirectory())
			throw new Error(`standalone record path is not a directory: ${recordId}`);
	}
	return { recordDir: resolved.value.path, existed };
}

export function recordsDirectory(root: string): string {
	const paths = resolveProjectPaths(root);
	const resolved = resolveProjectWritePath(root, paths.recordsDir);
	if (!resolved.ok) throw new Error(resolved.error);
	return resolved.value.path;
}

export function ownerBaseDirectory(root: string, owner: ArtifactOwner): string {
	if (owner.kind === "record") return resolveRecordDirectory(root, owner.id).recordDir;
	const paths = resolveProjectPaths(root);
	const live = resolveProjectWritePath(root, `${paths.wbDir}/${owner.id}`);
	if (live.ok && existsSync(live.value.path)) return live.value.path;
	const archived = resolveProjectWritePath(
		root,
		`${paths.wbDir}/_archive/${owner.id}`,
	);
	if (archived.ok && existsSync(archived.value.path))
		return archived.value.path;
	throw new Error(`artifact owner is missing or conflicted: ${owner.id}`);
}

function encodePageCursor(cursor: PageCursor): string {
	return Buffer.from(stableJson(cursor), "utf8").toString("base64url");
}

export function decodePageCursor(token: string): PageCursor {
	let value: unknown;
	try {
		value = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
	} catch {
		throw new Error("artifact page cursor is invalid");
	}
	if (value === null || typeof value !== "object")
		throw new Error("artifact page cursor is invalid");
	const cursor = value as Record<string, unknown>;
	if (
		cursor.v !== PAGE_CURSOR_VERSION ||
		cursor.op !== "page" ||
		typeof cursor.path !== "string" ||
		!Number.isSafeInteger(cursor.offset) ||
		Number(cursor.offset) < 0 ||
		typeof cursor.source_identity_digest !== "string" ||
		!/^[a-f0-9]{64}$/.test(cursor.source_identity_digest)
	)
		throw new Error("artifact page cursor is invalid");
	return cursor as PageCursor;
}

function redactedText(text: string): string {
	const safe = redactImported(text);
	return typeof safe === "string" ? safe : "[redacted]";
}

/**
 * Read one bounded page of an owner artifact. The digest always covers the
 * raw bytes; the presented content carries the applicable redaction. The
 * returned cursor binds the next offset to the current source identity, so a
 * changed source forces an explicit restart instead of mixed pages.
 */
export function readArtifactPage(input: {
	root: string;
	ownerDir: string;
	relativePath: string;
	label: string;
	byteOffset?: number;
	maxBytes?: number;
	cursor?: string;
}): ArtifactPageRead {
	const maxBytes = Math.min(
		Math.max(1, input.maxBytes ?? DEFAULT_PAGE_BYTES),
		MAX_PAGE_BYTES,
	);
	let offset = input.byteOffset ?? 0;
	let expectedIdentity: string | undefined;
	if (input.cursor) {
		const cursor = decodePageCursor(input.cursor);
		const cursorPath = relative(input.root, resolve(input.ownerDir, cursor.path));
		if (
			cursorPath !== input.relativePath.replaceAll("\\", "/") &&
			cursor.path !== input.relativePath.replaceAll("\\", "/")
		)
			throw new Error("artifact page cursor does not match the selected artifact");
		offset = cursor.offset;
		expectedIdentity = cursor.source_identity_digest;
	}
	const resolvedPath = resolveProjectWritePath(
		input.root,
		relative(input.root, resolve(input.ownerDir, input.relativePath)),
	);
	if (!resolvedPath.ok) throw new Error(resolvedPath.error);
	const range = readBoundedSourceRange(resolvedPath.value.path, input.label, {
		offset,
		maxBytes,
	});
	const identity = sourceIdentityDigest({
		dev: range.sourceIdentity.dev,
		ino: range.sourceIdentity.ino,
		size: range.sourceIdentity.size,
		mtimeMs: range.sourceIdentity.mtime_ms,
		ctimeMs: range.sourceIdentity.ctime_ms,
	});
	if (expectedIdentity !== undefined && expectedIdentity !== identity)
		throw new Error("artifact source changed; restart the read without a cursor");
	const byteStart = offset;
	const byteEnd = offset + range.bytes.byteLength;
	const hasMore = byteEnd < range.totalBytes;
	const wholeSource = byteStart === 0 && !hasMore;
	return {
		page: {
			content: redactedText(range.bytes.toString("utf8")),
			byte_start: byteStart,
			byte_end: byteEnd,
			source_bytes: range.totalBytes,
			has_more: hasMore,
			...(hasMore ? { next_offset: byteEnd } : {}),
			...(hasMore
				? {
						cursor: encodePageCursor({
							v: PAGE_CURSOR_VERSION,
							op: "page",
							path: input.relativePath.replaceAll("\\", "/"),
							offset: byteEnd,
							source_identity_digest: identity,
						}),
					}
				: {}),
			coverage: wholeSource ? "complete" : "partial",
		},
		rawDigest: digestBytes(range.bytes),
		sourceIdentityDigest: identity,
		anchor: `bytes:${byteStart}-${byteEnd}`,
		digestScope: "range",
		wholeSource,
		rawBytes: range.bytes,
	};
}
