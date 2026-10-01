/**
 * Shared artifact inventory: bounded owner-relative enumeration and paged
 * reads for workbench sessions and standalone records. Capture, listing,
 * directed read, and reference verification all consume this module, so a
 * file that is listable is also readable and citable. The inventory never
 * opens the evolution database and never requires a healthy session.
 */

import { createHash } from "node:crypto";
import { lstatSync, opendirSync, realpathSync, type Stats } from "node:fs";
import { join, relative, resolve } from "node:path";
import { importedTextRedactionSpans } from "../evolution/imports/redaction";
import {
	assertSafeSourceFile,
	readBoundedSourceRange,
} from "../io/safe-source";
import { resolveArtifactProjectPaths } from "../project/paths";
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
/** Maximum complete source window used to prove artifact redaction context. */
export const MAX_REDACTION_CONTEXT_BYTES = 1_048_576;
export const MAX_RECORD_CATALOG_ENTRIES = MAX_OWNER_FILES;
export const MAX_RECORD_SEARCH_BYTES = 512 * 1024;
export const MAX_RECORD_SEARCH_MATCHES = 25;
export const DEFAULT_RECORD_LIMIT = 10;
export const MAX_RECORD_CATALOG_PAGE_SIZE = 100;

const ARTIFACT_TEXT_EXTENSION_RE = /\.(?:md|log|txt|jsonl)$/i;
const PAGE_CURSOR_VERSION = 2;

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
	scannedEntries: number;
	complete: boolean;
};

export type SourceIdentityDigest = string;

export type ArtifactPageRead = {
	page: ArtifactPage;
	redactionStatus:
		| "complete"
		| "withheld_context_limit"
		| "withheld_invalid_utf8";
	rawDigest: string;
	sourceIdentityDigest: SourceIdentityDigest;
	anchor: string;
	digestScope: "artifact" | "range";
	/** True when this page covered the entire source file. */
	wholeSource: boolean;
	/** Raw bytes of the page before redaction; only for in-process validation. */
	rawBytes: Buffer;
	/** Complete, redacted source snapshot reused by trusted in-process callers. */
	fullSourceSnapshot?: { content: string; rawDigest: string };
	readBytes: number;
	scannedBytes: number;
	workBytes: number;
};

function isMissing(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "ENOENT"
	);
}

function lstatIfPresent(path: string): Stats | null {
	try {
		return lstatSync(path);
	} catch (error) {
		if (isMissing(error)) return null;
		throw error;
	}
}

function assertRealDirectory(path: string, label: string): Stats {
	const stat = lstatIfPresent(path);
	if (
		!stat ||
		stat.isSymbolicLink() ||
		!stat.isDirectory() ||
		realpathSync(path) !== resolve(path)
	)
		throw new Error(
			`${label} must be a real directory inside the project root`,
		);
	return stat;
}

type PageCursor = {
	v: 2;
	op: "page";
	owner_path: string;
	path: string;
	offset: number;
	source_identity_digest: string;
};

type RecordsCursor = {
	v: 1;
	op: "records";
	path: string;
	offset: number;
	limit: number;
	catalog_digest: string;
};

export class ArtifactPageCursorError extends Error {
	constructor() {
		super("artifact page cursor is invalid for this owner, path, or source");
		this.name = "ArtifactPageCursorError";
	}
}

export type RecordsCatalogPage = {
	records: string[];
	records_page: {
		offset: number;
		limit: number;
		returned: number;
		total: number;
		has_more: boolean;
	};
	coverage: "complete" | "partial";
	unsupported_count: number;
	scanned_entries: number;
	records_cursor?: string;
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
	const stat = lstatIfPresent(path);
	return stat?.isFile() ? stat : null;
}

function enumerateArtifactSubtree(
	input: {
		baseDir: string;
		prefix: string;
		depth: number;
		budget: { entries: number; scannedEntries: number; limit: number };
	},
	out: {
		files: InventoryFile[];
		unsupportedCount: number;
		complete: boolean;
	},
): void {
	if (input.depth > MAX_ARTIFACT_NESTING_DEPTH) {
		out.unsupportedCount += 1;
		return;
	}
	let directory: ReturnType<typeof opendirSync>;
	try {
		directory = opendirSync(input.baseDir);
	} catch (error) {
		if (isMissing(error)) {
			out.unsupportedCount += 1;
			return;
		}
		throw error;
	}
	try {
		while (true) {
			const entry = directory.readSync();
			if (!entry) break;
			input.budget.scannedEntries += 1;
			if (input.budget.entries >= input.budget.limit) {
				out.unsupportedCount += 1;
				out.complete = false;
				return;
			}
			input.budget.entries += 1;
			const path = join(input.baseDir, entry.name);
			const name = `${input.prefix}${entry.name}`;
			if (entry.isDirectory()) {
				enumerateArtifactSubtree(
					{
						baseDir: path,
						prefix: `${name}/`,
						depth: input.depth + 1,
						budget: input.budget,
					},
					out,
				);
				if (!out.complete) return;
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
	} finally {
		directory.closeSync();
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
	maxEntries?: number;
}): InventoryEnumeration {
	if (
		input.maxEntries !== undefined &&
		(!Number.isSafeInteger(input.maxEntries) ||
			input.maxEntries < 1 ||
			input.maxEntries > MAX_OWNER_FILES)
	)
		throw new Error("artifact inventory entry limit is invalid");
	const strictLimit = input.maxEntries === undefined;
	const budget = {
		entries: 0,
		scannedEntries: 0,
		limit: input.maxEntries ?? MAX_OWNER_FILES,
	};
	const out: InventoryEnumeration = {
		files: [],
		unsupportedCount: 0,
		scannedEntries: 0,
		complete: true,
	};
	assertRealDirectory(input.dir, "artifact owner directory");
	let directory: ReturnType<typeof opendirSync>;
	try {
		directory = opendirSync(input.dir);
	} catch (error) {
		if (!isMissing(error)) throw error;
		throw new Error(
			"artifact owner directory must be a real directory inside the project root",
		);
	}
	try {
		while (true) {
			const entry = directory.readSync();
			if (!entry) break;
			budget.scannedEntries += 1;
			if (budget.entries >= budget.limit) {
				if (strictLimit)
					throw new Error(
						"artifact owner exceeds the bounded inventory; select a specific artifact",
					);
				out.unsupportedCount += 1;
				out.complete = false;
				break;
			}
			budget.entries += 1;
			if (entry.isDirectory()) {
				if (entry.name === "artifacts") {
					enumerateArtifactSubtree(
						{
							baseDir: join(input.dir, entry.name),
							prefix: "artifacts/",
							depth: 1,
							budget,
						},
						out,
					);
					if (!out.complete) break;
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
	} finally {
		directory.closeSync();
	}
	if (strictLimit && !out.complete)
		throw new Error(
			"artifact owner exceeds the bounded inventory; select a specific artifact",
		);
	out.files.sort((left, right) => left.name.localeCompare(right.name));
	out.scannedEntries = budget.scannedEntries;
	return out;
}

/** Search only the nested artifact tree for a basename alias. */
function hasNestedArtifactBasename(input: {
	dir: string;
	basename: string;
}): boolean {
	const baseDir = join(input.dir, "artifacts");
	const rootStat = lstatIfPresent(baseDir);
	if (
		!rootStat ||
		rootStat.isSymbolicLink() ||
		!rootStat.isDirectory() ||
		realpathSync(baseDir) !== resolve(baseDir)
	)
		return false;
	let scannedEntries = 0;
	const visit = (dir: string, depth: number): boolean => {
		if (depth > MAX_ARTIFACT_NESTING_DEPTH)
			throw new Error("record artifact basename cannot be resolved safely");
		const directory = opendirSync(dir);
		try {
			while (true) {
				const entry = directory.readSync();
				if (!entry) return false;
				scannedEntries += 1;
				if (scannedEntries > MAX_OWNER_FILES)
					throw new Error(
						"record artifact basename exceeds its bounded inventory",
					);
				if (entry.isDirectory()) {
					const path = join(dir, entry.name);
					if (realpathSync(path) !== resolve(path))
						throw new Error("record artifact parent must be a real directory");
					if (visit(path, depth + 1)) return true;
					continue;
				}
				if (
					entry.isFile() &&
					!entry.name.startsWith(".") &&
					ARTIFACT_TEXT_EXTENSION_RE.test(entry.name) &&
					entry.name === input.basename
				)
					return true;
			}
		} finally {
			directory.closeSync();
		}
	};
	return visit(baseDir, 1);
}

/** Resolve one canonical owner-relative file without inventorying siblings. */
export function resolveOwnerArtifactFile(input: {
	dir: string;
	relativePath: string;
	/** Refuse root aliases when a nested artifact has the same basename. */
	rejectRootBasenameCollision?: boolean;
}): InventoryFile | null {
	const normalized = input.relativePath.replaceAll("\\", "/");
	const parts = normalized.split("/");
	if (
		!normalized ||
		normalized.startsWith("/") ||
		parts.some((part) => !part || part === "." || part === "..")
	)
		return null;
	if (
		parts.length > 1 &&
		(parts[0] !== "artifacts" || parts.length > MAX_ARTIFACT_NESTING_DEPTH + 1)
	)
		return null;
	if (
		parts.some((part) => part.startsWith(".")) ||
		!ARTIFACT_TEXT_EXTENSION_RE.test(parts.at(-1) ?? "")
	)
		return null;
	if (
		input.rejectRootBasenameCollision &&
		parts.length === 1 &&
		hasNestedArtifactBasename({ dir: input.dir, basename: parts[0] as string })
	)
		throw new Error("record artifact selector is ambiguous; use its full path");
	let baseDir = input.dir;
	for (const segment of parts.slice(0, -1)) {
		baseDir = join(baseDir, segment);
		const stat = lstatIfPresent(baseDir);
		if (!stat) return null;
		if (
			stat.isSymbolicLink() ||
			!stat.isDirectory() ||
			realpathSync(baseDir) !== resolve(baseDir)
		)
			throw new Error("artifact parent must be a real directory");
	}
	const path = join(input.dir, ...parts);
	const stat = assertSafeSourceFile(path, "record artifact");
	return stat ? inventoryFile(path, normalized, stat, false) : null;
}

/** Resolve and validate a standalone record directory. */
export function resolveRecordDirectory(
	root: string,
	recordId: string,
): { recordDir: string; existed: boolean } {
	if (!OWNER_ID_RE.test(recordId))
		throw new Error(`invalid standalone record id: ${recordId}`);
	const paths = resolveArtifactProjectPaths(root);
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
		(liveSession.ok && lstatIfPresent(liveSession.value.path) !== null) ||
		(archivedSession.ok && lstatIfPresent(archivedSession.value.path) !== null);
	if (sessionConflict)
		throw new Error(
			`duplicate artifact owner id in two locations: ${recordId}; standalone records must not reuse a session id`,
		);
	const recordStat = lstatIfPresent(resolved.value.path);
	const existed = recordStat !== null;
	if (recordStat) {
		if (
			recordStat.isSymbolicLink() ||
			!recordStat.isDirectory() ||
			realpathSync(resolved.value.path) !== resolve(resolved.value.path)
		)
			throw new Error(`standalone record path is not a directory: ${recordId}`);
	}
	return { recordDir: resolved.value.path, existed };
}

export function recordsDirectory(root: string): string {
	const paths = resolveArtifactProjectPaths(root);
	const resolved = resolveProjectWritePath(root, paths.recordsDir);
	if (!resolved.ok) throw new Error(resolved.error);
	return resolved.value.path;
}

export class ArtifactCatalogChangedError extends Error {
	constructor() {
		super("artifact catalog changed; restart without its cursor");
		this.name = "ArtifactCatalogChangedError";
	}
}

function encodeRecordsCursor(cursor: RecordsCursor): string {
	return Buffer.from(stableJson(cursor), "utf8").toString("base64url");
}

function decodeRecordsCursor(token: string): RecordsCursor {
	let value: unknown;
	try {
		if (token.length > 4_096) throw new Error("cursor too large");
		value = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
	} catch {
		throw new Error("artifact records cursor is invalid");
	}
	if (value === null || typeof value !== "object")
		throw new Error("artifact records cursor is invalid");
	const cursor = value as Record<string, unknown>;
	if (
		cursor.v !== 1 ||
		cursor.op !== "records" ||
		typeof cursor.path !== "string" ||
		!Number.isSafeInteger(cursor.offset) ||
		Number(cursor.offset) < 0 ||
		!Number.isSafeInteger(cursor.limit) ||
		Number(cursor.limit) < 1 ||
		Number(cursor.limit) > MAX_RECORD_CATALOG_PAGE_SIZE ||
		typeof cursor.catalog_digest !== "string" ||
		!/^[a-f0-9]{64}$/.test(cursor.catalog_digest)
	)
		throw new Error("artifact records cursor is invalid");
	return cursor as RecordsCursor;
}

function statIdentity(stat: Stats): Record<string, string> {
	return {
		dev: String(stat.dev),
		ino: String(stat.ino),
		size: String(stat.size),
		mtime_ms: String(stat.mtimeMs),
		ctime_ms: String(stat.ctimeMs),
	};
}

function hasSessionOwner(root: string, recordId: string): boolean {
	const paths = resolveArtifactProjectPaths(root);
	return (
		lstatIfPresent(join(paths.abs.wbDir, recordId)) !== null ||
		lstatIfPresent(join(paths.abs.wbDir, "_archive", recordId)) !== null
	);
}

function recordCatalogSnapshot(input: { root: string }): {
	path: string;
	records: string[];
	digest: string;
	partial: boolean;
	unsupportedCount: number;
	scannedEntries: number;
} {
	const path = recordsDirectory(input.root);
	const initialStat = lstatIfPresent(path);
	if (
		initialStat &&
		(initialStat.isSymbolicLink() ||
			!initialStat.isDirectory() ||
			realpathSync(path) !== resolve(path))
	)
		throw new Error("standalone records path must be a real directory");
	const records: Array<{ id: string; identity: Record<string, string> }> = [];
	let unsupportedCount = 0;
	let scannedEntries = 0;
	let partial = false;
	if (initialStat) {
		const directory = opendirSync(path);
		try {
			while (scannedEntries <= MAX_RECORD_CATALOG_ENTRIES) {
				const entry = directory.readSync();
				if (!entry) break;
				scannedEntries += 1;
				if (scannedEntries > MAX_RECORD_CATALOG_ENTRIES) {
					partial = true;
					break;
				}
				if (!OWNER_ID_RE.test(entry.name)) {
					unsupportedCount += 1;
					partial = true;
					continue;
				}
				const recordPath = join(path, entry.name);
				const stat = lstatIfPresent(recordPath);
				if (
					!stat ||
					stat.isSymbolicLink() ||
					!stat.isDirectory() ||
					realpathSync(recordPath) !== resolve(recordPath) ||
					hasSessionOwner(input.root, entry.name)
				) {
					unsupportedCount += 1;
					partial = true;
					continue;
				}
				records.push({ id: entry.name, identity: statIdentity(stat) });
			}
		} finally {
			directory.closeSync();
		}
		const finalStat = lstatIfPresent(path);
		if (
			!finalStat ||
			JSON.stringify(statIdentity(finalStat)) !==
				JSON.stringify(statIdentity(initialStat))
		)
			throw new ArtifactCatalogChangedError();
	}
	records.sort((left, right) => left.id.localeCompare(right.id));
	const relativePath = relative(input.root, path).replaceAll("\\", "/");
	const digest = digestBytes(
		stableJson({
			path: relativePath,
			directory: initialStat ? statIdentity(initialStat) : null,
			records,
			partial,
			unsupported_count: unsupportedCount,
			scanned_entries: scannedEntries,
		}),
	);
	return {
		path: relativePath,
		records: records.map((record) => record.id),
		digest,
		partial,
		unsupportedCount,
		scannedEntries,
	};
}

/** Stream a bounded, metadata-only page of standalone record owners. */
export function enumerateRecordsPage(input: {
	root: string;
	limit?: number;
	cursor?: string;
}): RecordsCatalogPage {
	const limit = input.limit ?? DEFAULT_RECORD_LIMIT;
	if (
		!Number.isSafeInteger(limit) ||
		limit < 1 ||
		limit > MAX_RECORD_CATALOG_PAGE_SIZE
	)
		throw new Error(
			"evolve artifacts --limit must be an integer from 1 to " +
				MAX_RECORD_CATALOG_PAGE_SIZE,
		);
	const previous = input.cursor ? decodeRecordsCursor(input.cursor) : undefined;
	if (previous && input.limit !== undefined && input.limit !== previous.limit)
		throw new Error(
			"artifact records cursor limit changed; restart without it",
		);
	const snapshot = recordCatalogSnapshot({ root: input.root });
	if (previous && previous.path !== snapshot.path)
		throw new Error("artifact records cursor does not match this project");
	if (previous && previous.catalog_digest !== snapshot.digest)
		throw new ArtifactCatalogChangedError();
	const pageLimit = previous?.limit ?? limit;
	const offset = previous?.offset ?? 0;
	if (offset > snapshot.records.length)
		throw new Error("artifact records cursor offset is invalid");
	const records = snapshot.records.slice(offset, offset + pageLimit);
	const hasMore = offset + records.length < snapshot.records.length;
	const recordsCursor = hasMore
		? encodeRecordsCursor({
				v: 1,
				op: "records",
				path: snapshot.path,
				offset: offset + records.length,
				limit: pageLimit,
				catalog_digest: snapshot.digest,
			})
		: undefined;
	return {
		records,
		records_page: {
			offset,
			limit: pageLimit,
			returned: records.length,
			total: snapshot.records.length,
			has_more: hasMore,
		},
		coverage: snapshot.partial ? "partial" : "complete",
		unsupported_count: snapshot.unsupportedCount,
		scanned_entries: snapshot.scannedEntries,
		...(recordsCursor ? { records_cursor: recordsCursor } : {}),
	};
}

export function ownerBaseDirectory(root: string, owner: ArtifactOwner): string {
	if (owner.kind === "record")
		return resolveRecordDirectory(root, owner.id).recordDir;
	const paths = resolveArtifactProjectPaths(root);
	const live = resolveProjectWritePath(root, `${paths.wbDir}/${owner.id}`);
	if (live.ok && lstatIfPresent(live.value.path)) {
		assertRealDirectory(live.value.path, "artifact owner directory");
		return live.value.path;
	}
	const archived = resolveProjectWritePath(
		root,
		`${paths.wbDir}/_archive/${owner.id}`,
	);
	if (archived.ok && lstatIfPresent(archived.value.path)) {
		assertRealDirectory(archived.value.path, "artifact owner directory");
		return archived.value.path;
	}
	throw new Error(`artifact owner is missing or conflicted: ${owner.id}`);
}

function encodePageCursor(cursor: PageCursor): string {
	return Buffer.from(stableJson(cursor), "utf8").toString("base64url");
}

export function decodePageCursor(token: string): PageCursor {
	let value: unknown;
	try {
		if (token.length > 4_096) throw new Error("cursor too large");
		value = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
	} catch {
		throw new ArtifactPageCursorError();
	}
	if (value === null || typeof value !== "object")
		throw new ArtifactPageCursorError();
	const cursor = value as Record<string, unknown>;
	if (
		cursor.v !== PAGE_CURSOR_VERSION ||
		cursor.op !== "page" ||
		typeof cursor.owner_path !== "string" ||
		typeof cursor.path !== "string" ||
		!Number.isSafeInteger(cursor.offset) ||
		Number(cursor.offset) < 0 ||
		typeof cursor.source_identity_digest !== "string" ||
		!/^[a-f0-9]{64}$/.test(cursor.source_identity_digest)
	)
		throw new ArtifactPageCursorError();
	return cursor as PageCursor;
}

export class ArtifactSourceChangedError extends Error {
	constructor() {
		super("artifact source changed; restart the read without a page cursor");
		this.name = "ArtifactSourceChangedError";
	}
}

type ByteSpan = { start: number; end: number };

function sameSourceIdentity(
	left: {
		dev: string;
		ino: string;
		size: string;
		mtime_ms: string;
		ctime_ms: string;
	},
	right: {
		dev: string;
		ino: string;
		size: string;
		mtime_ms: string;
		ctime_ms: string;
	},
): boolean {
	return (
		left.dev === right.dev &&
		left.ino === right.ino &&
		left.size === right.size &&
		left.mtime_ms === right.mtime_ms &&
		left.ctime_ms === right.ctime_ms
	);
}

function sourceDigestFromRange(range: {
	sourceIdentity: {
		dev: string;
		ino: string;
		size: string;
		mtime_ms: string;
		ctime_ms: string;
	};
}): string {
	return sourceIdentityDigest({
		dev: range.sourceIdentity.dev,
		ino: range.sourceIdentity.ino,
		size: range.sourceIdentity.size,
		mtimeMs: range.sourceIdentity.mtime_ms,
		ctimeMs: range.sourceIdentity.ctime_ms,
	});
}

function utf8Width(lead: number): number {
	if (lead < 0x80) return 1;
	if (lead >= 0xc2 && lead <= 0xdf) return 2;
	if (lead >= 0xe0 && lead <= 0xef) return 3;
	if (lead >= 0xf0 && lead <= 0xf4) return 4;
	return 0;
}

function isUtf8Boundary(
	path: string,
	label: string,
	target: number,
	totalBytes: number,
	expectedSource: {
		dev: string;
		ino: string;
		size: string;
		mtime_ms: string;
		ctime_ms: string;
	},
	onBytesRead?: (bytes: number) => void,
): boolean {
	if (target === 0 || target === totalBytes) return true;
	const start = Math.max(0, target - 4);
	const range = readBoundedSourceRange(path, label, {
		offset: start,
		maxBytes: target - start,
	});
	onBytesRead?.(range.bytes.byteLength);
	if (!sameSourceIdentity(range.sourceIdentity, expectedSource))
		throw new ArtifactSourceChangedError();
	let index = range.bytes.length - 1;
	while (index >= 0) {
		const byte = range.bytes[index];
		if (byte === undefined || byte < 0x80 || byte > 0xbf) break;
		index -= 1;
	}
	if (index < 0) return false;
	const lead = range.bytes[index] ?? 0;
	const width = utf8Width(lead);
	return width > 0 && range.bytes.length - index === width;
}

function readRawBoundedPage(
	path: string,
	label: string,
	offset: number,
	maxBytes: number,
	expectedIdentity?: string,
): {
	range: ReturnType<typeof readBoundedSourceRange>;
	identity: string;
} {
	const range = readBoundedSourceRange(path, label, { offset, maxBytes });
	const identity = sourceDigestFromRange(range);
	if (expectedIdentity !== undefined && identity !== expectedIdentity)
		throw new ArtifactSourceChangedError();
	return { range, identity };
}

function decodeCompleteUtf8(bytes: Buffer): {
	text: string;
	unitStartByte: Uint32Array;
	unitEndByte: Uint32Array;
} {
	const text = new TextDecoder("utf-8", {
		fatal: true,
		ignoreBOM: true,
	}).decode(bytes);
	const unitStartByte = new Uint32Array(text.length + 1);
	const unitEndByte = new Uint32Array(text.length + 1);
	let unitOffset = 0;
	let byteOffset = 0;
	for (const scalar of text) {
		const scalarBytes = Buffer.byteLength(scalar, "utf8");
		for (let unit = 0; unit < scalar.length; unit += 1) {
			unitStartByte[unitOffset + unit] = byteOffset;
			unitEndByte[unitOffset + unit] = byteOffset + scalarBytes;
		}
		unitOffset += scalar.length;
		byteOffset += scalarBytes;
		unitStartByte[unitOffset] = byteOffset;
		unitEndByte[unitOffset] = byteOffset;
	}
	return { text, unitStartByte, unitEndByte };
}

function completeUtf8Boundary(bytes: Buffer, offset: number): boolean {
	return (
		offset === 0 ||
		offset === bytes.byteLength ||
		((bytes[offset] ?? 0) & 0xc0) !== 0x80
	);
}

function byteRedactionSpans(
	text: string,
	unitStartByte: Uint32Array,
	unitEndByte: Uint32Array,
): ByteSpan[] {
	const spans: ByteSpan[] = [];
	for (const span of importedTextRedactionSpans(text)) {
		const start = unitStartByte[span.start];
		const end = unitEndByte[span.end - 1];
		if (start === undefined || end === undefined || end <= start) continue;
		const previous = spans.at(-1);
		if (previous && start <= previous.end)
			previous.end = Math.max(previous.end, end);
		else spans.push({ start, end });
	}
	return spans;
}

function redactedPageBytes(
	bytes: Buffer,
	byteStart: number,
	spans: readonly ByteSpan[],
): Buffer {
	const out = Buffer.from(bytes);
	const byteEnd = byteStart + out.length;
	for (const span of spans) {
		const start = Math.max(byteStart, span.start);
		const end = Math.min(byteEnd, span.end);
		if (end > start) out.fill(0x2a, start - byteStart, end - byteStart);
	}
	return out;
}

export type SafeArtifactSourceRead = {
	redactionStatus: ArtifactPageRead["redactionStatus"];
	content?: string;
	rawDigest: string;
	readBytes: number;
	sourceBytes: number;
	scannedBytes: number;
	sourceIdentityDigest: string;
};

/**
 * Read and sanitize a complete source once for bounded record search. No
 * content is returned unless the whole source is valid UTF-8 and its complete
 * redaction context fits the declared budget.
 */
export function readArtifactSafeSource(input: {
	root: string;
	ownerDir: string;
	relativePath: string;
	label: string;
	expectedBytes: number;
}): SafeArtifactSourceRead {
	const resolvedPath = resolveProjectWritePath(
		input.root,
		relative(input.root, resolve(input.ownerDir, input.relativePath)),
	);
	if (!resolvedPath.ok) throw new Error(resolvedPath.error);
	const path = resolvedPath.value.path;
	if (
		!Number.isSafeInteger(input.expectedBytes) ||
		input.expectedBytes < 0 ||
		input.expectedBytes > MAX_REDACTION_CONTEXT_BYTES
	)
		throw new Error("artifact source exceeds the redaction context budget");
	const full = readRawBoundedPage(
		path,
		input.label,
		0,
		Math.max(1, input.expectedBytes),
	);
	if (full.range.totalBytes !== input.expectedBytes)
		throw new ArtifactSourceChangedError();
	const totalBytes = full.range.totalBytes;
	try {
		const decoded = decodeCompleteUtf8(full.range.bytes);
		const spans = byteRedactionSpans(
			decoded.text,
			decoded.unitStartByte,
			decoded.unitEndByte,
		);
		const safeBytes = redactedPageBytes(full.range.bytes, 0, spans);
		return {
			redactionStatus: "complete",
			content: new TextDecoder("utf-8", {
				fatal: true,
				ignoreBOM: true,
			}).decode(safeBytes),
			rawDigest: digestBytes(full.range.bytes),
			readBytes: full.range.bytes.byteLength,
			sourceBytes: totalBytes,
			scannedBytes: full.range.bytes.byteLength,
			sourceIdentityDigest: full.identity,
		};
	} catch (error) {
		if (!(error instanceof TypeError)) throw error;
		return {
			redactionStatus: "withheld_invalid_utf8",
			rawDigest: digestBytes(full.range.bytes),
			readBytes: full.range.bytes.byteLength,
			sourceBytes: totalBytes,
			scannedBytes: full.range.bytes.byteLength,
			sourceIdentityDigest: full.identity,
		};
	}
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
	includeFullSourceSnapshot?: boolean;
}): ArtifactPageRead {
	if (
		input.maxBytes !== undefined &&
		(!Number.isSafeInteger(input.maxBytes) || input.maxBytes < 1)
	)
		throw new Error("artifact page size must be a positive integer");
	const maxBytes = Math.min(
		Math.max(4, input.maxBytes ?? DEFAULT_PAGE_BYTES),
		MAX_PAGE_BYTES,
	);
	let offset = input.byteOffset ?? 0;
	let expectedIdentity: string | undefined;
	if (input.cursor) {
		if (input.byteOffset !== undefined) throw new ArtifactPageCursorError();
		const cursor = decodePageCursor(input.cursor);
		const ownerPath = relative(
			resolve(input.root),
			resolve(input.ownerDir),
		).replaceAll("\\", "/");
		const selectedPath = input.relativePath.replaceAll("\\", "/");
		if (
			ownerPath.startsWith("../") ||
			ownerPath === ".." ||
			cursor.owner_path !== ownerPath ||
			cursor.path !== selectedPath
		)
			throw new ArtifactPageCursorError();
		offset = cursor.offset;
		expectedIdentity = cursor.source_identity_digest;
	}
	if (!Number.isSafeInteger(offset) || offset < 0) {
		if (input.cursor) throw new ArtifactPageCursorError();
		throw new Error("artifact byte offset is invalid");
	}
	const resolvedPath = resolveProjectWritePath(
		input.root,
		relative(input.root, resolve(input.ownerDir, input.relativePath)),
	);
	if (!resolvedPath.ok) throw new Error(resolvedPath.error);
	const sourcePath = resolvedPath.value.path;
	let rawBytes: Buffer;
	let safeText: string | undefined;
	let wholeSourceSnapshot: ArtifactPageRead["fullSourceSnapshot"];
	let readBytes = 0;
	let scannedBytes = 0;
	let redactionStatus: ArtifactPageRead["redactionStatus"] = "complete";
	let identity: string;
	let totalBytes: number;
	let rangeSourceIdentity: ReturnType<
		typeof readBoundedSourceRange
	>["sourceIdentity"];
	let byteEnd: number;
	const head = readRawBoundedPage(
		sourcePath,
		input.label,
		0,
		1,
		expectedIdentity,
	);
	readBytes += head.range.bytes.byteLength;
	totalBytes = head.range.totalBytes;
	identity = head.identity;
	rangeSourceIdentity = head.range.sourceIdentity;
	if (offset > totalBytes && input.cursor) throw new ArtifactPageCursorError();
	if (offset > totalBytes)
		throw new Error(`${input.label} byte offset exceeds the source size`);
	if (totalBytes > 0 && offset === totalBytes) {
		if (input.cursor) throw new ArtifactPageCursorError();
		throw new Error("artifact byte offset is at end of source");
	}
	if (totalBytes <= MAX_REDACTION_CONTEXT_BYTES) {
		const full = readRawBoundedPage(
			sourcePath,
			input.label,
			0,
			Math.max(1, totalBytes),
			identity,
		);
		readBytes += full.range.bytes.byteLength;
		scannedBytes = full.range.bytes.byteLength;
		rangeSourceIdentity = full.range.sourceIdentity;
		identity = full.identity;
		let decoded: ReturnType<typeof decodeCompleteUtf8> | undefined;
		try {
			decoded = decodeCompleteUtf8(full.range.bytes);
		} catch (error) {
			if (!(error instanceof TypeError)) throw error;
			redactionStatus = "withheld_invalid_utf8";
		}
		if (decoded) {
			if (!completeUtf8Boundary(full.range.bytes, offset)) {
				if (input.cursor) throw new ArtifactPageCursorError();
				throw new Error("artifact byte offset is not a UTF-8 boundary");
			}
			const requestedEnd = Math.min(totalBytes, offset + maxBytes);
			byteEnd = requestedEnd;
			while (
				byteEnd > offset &&
				!completeUtf8Boundary(full.range.bytes, byteEnd)
			)
				byteEnd -= 1;
			if (byteEnd === offset && offset < totalBytes)
				throw new Error(
					"artifact page size is too small to make UTF-8 progress",
				);
			const spans = byteRedactionSpans(
				decoded.text,
				decoded.unitStartByte,
				decoded.unitEndByte,
			);
			const pageRawBytes = full.range.bytes.subarray(offset, byteEnd);
			rawBytes = pageRawBytes;
			if (input.includeFullSourceSnapshot) {
				const safeFullBytes = redactedPageBytes(full.range.bytes, 0, spans);
				const decoder = new TextDecoder("utf-8", {
					fatal: true,
					ignoreBOM: true,
				});
				wholeSourceSnapshot = {
					content: decoder.decode(safeFullBytes),
					rawDigest: digestBytes(full.range.bytes),
				};
				safeText = decoder.decode(safeFullBytes.subarray(offset, byteEnd));
			} else {
				safeText = new TextDecoder("utf-8", {
					fatal: true,
					ignoreBOM: true,
				}).decode(redactedPageBytes(pageRawBytes, offset, spans));
			}
		} else {
			const invalidRange = readRawBoundedPage(
				sourcePath,
				input.label,
				offset,
				Math.min(maxBytes, Math.max(1, totalBytes - offset)),
				identity,
			);
			readBytes += invalidRange.range.bytes.byteLength;
			rawBytes = invalidRange.range.bytes;
			byteEnd = offset + rawBytes.length;
			safeText = "[content withheld: source is not valid UTF-8]";
		}
	} else {
		redactionStatus = "withheld_context_limit";
		if (
			!isUtf8Boundary(
				sourcePath,
				input.label,
				offset,
				totalBytes,
				rangeSourceIdentity,
				(bytes) => {
					readBytes += bytes;
				},
			)
		) {
			if (input.cursor) throw new ArtifactPageCursorError();
			throw new Error("artifact byte offset is not a UTF-8 boundary");
		}
		const next = readRawBoundedPage(
			sourcePath,
			input.label,
			offset,
			Math.min(maxBytes, Math.max(1, totalBytes - offset)),
			identity,
		);
		readBytes += next.range.bytes.byteLength;
		rawBytes = next.range.bytes;
		byteEnd = offset + rawBytes.length;
		while (
			byteEnd > offset &&
			!isUtf8Boundary(
				sourcePath,
				input.label,
				byteEnd,
				totalBytes,
				rangeSourceIdentity,
				(bytes) => {
					readBytes += bytes;
				},
			)
		) {
			byteEnd -= 1;
			rawBytes = rawBytes.subarray(0, byteEnd - offset);
		}
		if (byteEnd === offset && offset < totalBytes) {
			rawBytes = next.range.bytes;
			byteEnd = offset + rawBytes.length;
		}
		safeText = "[content withheld: redaction context budget exceeded]";
	}
	const byteStart = offset;
	const hasMore = byteEnd < totalBytes;
	const isWholeSource = byteStart === 0 && !hasMore;
	const ownerPath = relative(
		resolve(input.root),
		resolve(input.ownerDir),
	).replaceAll("\\", "/");
	return {
		page: {
			content: safeText ?? "[content withheld]",
			byte_start: byteStart,
			byte_end: byteEnd,
			source_bytes: totalBytes,
			has_more: hasMore,
			...(hasMore ? { next_offset: byteEnd } : {}),
			...(hasMore
				? {
						cursor: encodePageCursor({
							v: PAGE_CURSOR_VERSION,
							op: "page",
							owner_path: ownerPath,
							path: input.relativePath.replaceAll("\\", "/"),
							offset: byteEnd,
							source_identity_digest: identity,
						}),
					}
				: {}),
			coverage:
				redactionStatus === "complete" && isWholeSource
					? "complete"
					: "partial",
		},
		redactionStatus,
		rawDigest: digestBytes(rawBytes),
		sourceIdentityDigest: identity,
		anchor: `bytes:${byteStart}-${byteEnd}`,
		digestScope: "range",
		wholeSource: isWholeSource && redactionStatus === "complete",
		rawBytes,
		...(wholeSourceSnapshot ? { fullSourceSnapshot: wholeSourceSnapshot } : {}),
		readBytes,
		scannedBytes,
		workBytes: readBytes + scannedBytes,
	};
}
