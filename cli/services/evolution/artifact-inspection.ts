import { createHash } from "node:crypto";
import { existsSync, lstatSync, realpathSync, type Stats } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
	ArtifactCatalogChangedError,
	ArtifactSourceChangedError,
	canonicalSessionArtifactKind,
	DEFAULT_RECORD_LIMIT,
	enumerateOwnerDirectory,
	enumerateRecordsPage,
	type InventoryFile,
	MAX_OWNER_FILES,
	MAX_PAGE_BYTES,
	MAX_RECORD_CATALOG_PAGE_SIZE,
	MAX_RECORD_SEARCH_BYTES,
	MAX_RECORD_SEARCH_MATCHES,
	MAX_REDACTION_CONTEXT_BYTES,
	OWNER_ID_RE,
	readArtifactPage,
	readArtifactSafeSource,
	resolveOwnerArtifactFile,
	resolveRecordDirectory,
	sourceIdentityDigest,
} from "../artifacts/inventory";
import type { ArtifactReferenceV2 } from "../artifacts/types";
import {
	readBoundedSourceFileWithBytes,
	readBoundedSourceRange,
} from "../io/safe-source";
import { readProjectConfig, resolveProjectPaths } from "../project/paths";
import { evolutionDbPath } from "./db";
import { enumerateEvolutionHistorySessions } from "./history-sessions";
import { importedTextRedactionSpans } from "./imports/redaction";
import { resolveEvolutionConfig } from "./runtime-config";

const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 10;
const MAX_DEFAULT_ARTIFACTS_PER_SESSION = 3;
const MAX_ARTIFACT_BYTES = 256 * 1024;
const MAX_RANGE_BYTES = 8 * 1024;
const MAX_TOTAL_READ_BYTES = 512 * 1024;
const MAX_SOURCE_CATALOG_WORK_UNITS = 4_096;
const MAX_PAGE_WORK_BYTES =
	MAX_REDACTION_CONTEXT_BYTES * 2 + MAX_PAGE_BYTES + 16;
const MAX_EXCERPT_CHARS = 450;
const CURSOR_VERSION = 2;
const SESSION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;

export type ArtifactReference = {
	session_id: string;
	path: string;
	anchor: string;
	content_digest: string;
	digest_scope?: "artifact" | "range";
	source_identity_digest?: string;
};

type CursorV2 = {
	v: 2;
	phase: "initial" | "delta" | "checkpoint";
	offset: number;
	limit: number;
	selection_digest: string;
	catalog_digest: string;
	scan_after_ms: number;
};

type ArtifactFile = {
	name: string;
	path: string;
	bytes: number;
	mtime_ms: number;
	ctime_ms: number;
	dev: string;
	ino: string;
};

type ArtifactDirectory = {
	mtime_ms: number;
	ctime_ms: number;
	dev: string;
	ino: string;
};

type SourceCatalog = {
	digest: string;
	latestChangeMs: number;
	scannedEntries: number;
	ownersScanned: number;
	workUnits: number;
	filesBySession: Map<string, ArtifactFile[]>;
	changedSessions: string[];
	unsupportedBySession: Map<string, number>;
};

export class ArtifactSessionCatalogBudgetError extends Error {
	constructor() {
		super(
			`session artifact catalog exceeds the ${MAX_SOURCE_CATALOG_WORK_UNITS}-unit page budget; narrow the selected sessions`,
		);
		this.name = "ArtifactSessionCatalogBudgetError";
	}
}

type RecordFilesCursor = {
	v: 1;
	op: "record-files";
	record_id: string;
	owner_path: string;
	offset: number;
	limit: number;
	catalog_digest: string;
};

type RecordSearchCursor = {
	v: 1;
	op: "record-search";
	record_id: string;
	owner_path: string;
	query_digest: string;
	offset: number;
	catalog_digest: string;
	total_read_bytes: number;
	total_scanned_bytes: number;
	total_work_bytes: number;
	total_withheld_files: number;
	incomplete_reasons: Array<
		"redaction_context" | "work_budget" | "unsupported_entries"
	>;
};

export class ArtifactFileCursorError extends Error {
	constructor() {
		super("record file cursor is invalid for this owner or inventory");
		this.name = "ArtifactFileCursorError";
	}
}

export class ArtifactSearchCursorError extends Error {
	constructor() {
		super(
			"record search cursor is invalid for this owner, query, or inventory",
		);
		this.name = "ArtifactSearchCursorError";
	}
}

function digest(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value !== null && typeof value === "object")
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
			.join(",")}}`;
	return JSON.stringify(value) ?? "null";
}

function encodeOwnerCursor(
	cursor: RecordFilesCursor | RecordSearchCursor,
): string {
	return Buffer.from(stableJson(cursor), "utf8").toString("base64url");
}

function decodeCursorValue(token: string): unknown {
	try {
		if (token.length > 4_096) throw new Error("cursor too large");
		return JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
	} catch {
		return null;
	}
}

function decodeRecordFilesCursor(token: string): RecordFilesCursor {
	const value = decodeCursorValue(token);
	if (value === null || typeof value !== "object")
		throw new ArtifactFileCursorError();
	const cursor = value as Record<string, unknown>;
	if (
		cursor.v !== 1 ||
		cursor.op !== "record-files" ||
		typeof cursor.record_id !== "string" ||
		typeof cursor.owner_path !== "string" ||
		!Number.isSafeInteger(cursor.offset) ||
		Number(cursor.offset) < 0 ||
		!Number.isSafeInteger(cursor.limit) ||
		Number(cursor.limit) < 1 ||
		Number(cursor.limit) > MAX_RECORD_CATALOG_PAGE_SIZE ||
		typeof cursor.catalog_digest !== "string" ||
		!SHA256_RE.test(cursor.catalog_digest)
	)
		throw new ArtifactFileCursorError();
	return cursor as RecordFilesCursor;
}

function decodeRecordSearchCursor(token: string): RecordSearchCursor {
	const value = decodeCursorValue(token);
	if (value === null || typeof value !== "object")
		throw new ArtifactSearchCursorError();
	const cursor = value as Record<string, unknown>;
	const reasons = cursor.incomplete_reasons;
	const validReasons = new Set([
		"redaction_context",
		"work_budget",
		"unsupported_entries",
	]);
	if (
		cursor.v !== 1 ||
		cursor.op !== "record-search" ||
		typeof cursor.record_id !== "string" ||
		typeof cursor.owner_path !== "string" ||
		!SHA256_RE.test(String(cursor.query_digest)) ||
		!Number.isSafeInteger(cursor.offset) ||
		Number(cursor.offset) < 0 ||
		!SHA256_RE.test(String(cursor.catalog_digest)) ||
		!Number.isSafeInteger(cursor.total_read_bytes) ||
		Number(cursor.total_read_bytes) < 0 ||
		!Number.isSafeInteger(cursor.total_scanned_bytes) ||
		Number(cursor.total_scanned_bytes) < 0 ||
		!Number.isSafeInteger(cursor.total_work_bytes) ||
		Number(cursor.total_work_bytes) < 0 ||
		!Number.isSafeInteger(cursor.total_withheld_files) ||
		Number(cursor.total_withheld_files) < 0 ||
		!Array.isArray(reasons) ||
		reasons.some((reason) => !validReasons.has(String(reason)))
	)
		throw new ArtifactSearchCursorError();
	return cursor as RecordSearchCursor;
}

function recordOwnerSnapshot(input: {
	root: string;
	recordId: string;
	recordDir: string;
}): {
	enumeration: ReturnType<typeof enumerateOwnerDirectory>;
	ownerPath: string;
	digest: string;
} {
	const directoryStat = (path: string): Stats => {
		const stat = lstatSync(path);
		if (
			stat.isSymbolicLink() ||
			!stat.isDirectory() ||
			realpathSync(path) !== resolve(path)
		)
			throw new Error("artifact owner directory must be a real directory");
		return stat;
	};
	const identity = (stat: Stats) => ({
		dev: String(stat.dev),
		ino: String(stat.ino),
		size: String(stat.size),
		mtime_ms: String(stat.mtimeMs),
		ctime_ms: String(stat.ctimeMs),
	});
	const before = directoryStat(input.recordDir);
	const enumeration = enumerateOwnerDirectory({ dir: input.recordDir });
	const after = directoryStat(input.recordDir);
	if (stableJson(identity(before)) !== stableJson(identity(after)))
		throw new ArtifactCatalogChangedError();
	const ownerPath = relative(
		resolve(input.root),
		resolve(input.recordDir),
	).replaceAll("\\", "/");
	return {
		enumeration,
		ownerPath,
		digest: digest(
			stableJson({
				record_id: input.recordId,
				owner_path: ownerPath,
				directory: identity(after),
				files: enumeration.files.map(
					({ name, bytes, mtime_ms, ctime_ms, dev, ino }) => ({
						name,
						bytes,
						mtime_ms,
						ctime_ms,
						dev,
						ino,
					}),
				),
				unsupported_count: enumeration.unsupportedCount,
				scanned_entries: enumeration.scannedEntries,
				complete: enumeration.complete,
			}),
		),
	};
}

function inventoryFileIdentity(file: InventoryFile): string {
	return sourceIdentityDigest({
		dev: file.dev,
		ino: file.ino,
		size: file.bytes,
		mtimeMs: file.mtime_ms,
		ctimeMs: file.ctime_ms,
	});
}

function artifactFileIdentity(file: ArtifactFile): string {
	return sourceIdentityDigest({
		dev: file.dev,
		ino: file.ino,
		size: file.bytes,
		mtimeMs: file.mtime_ms,
		ctimeMs: file.ctime_ms,
	});
}

function sessionArtifactScore(name: string, isCanonical: boolean): number {
	if (!isCanonical) return 5;
	if (name === ".evidence.jsonl") return 0;
	if (name.includes("_task_")) return 1;
	if (name.includes("_report_")) return 2;
	if (name.includes("_log_")) return 3;
	return 4;
}

/**
 * Shared inventory enumeration for one session: managed canonical files at
 * the session root plus supplementary files at the root and anywhere under
 * `artifacts/`. Files the inventory cannot represent safely are counted as
 * unsupported instead of disappearing.
 */
function artifactFiles(
	sessionDir: string,
	sessionId: string,
	maxEntries: number,
): {
	files: ArtifactFile[];
	unsupportedCount: number;
	scannedEntries: number;
	complete: boolean;
} {
	const enumeration = enumerateOwnerDirectory({
		dir: sessionDir,
		sessionId,
		maxEntries,
	});
	const files: ArtifactFile[] = enumeration.files.map(
		(file: InventoryFile) => ({
			name: file.name,
			path: file.path,
			bytes: file.bytes,
			mtime_ms: file.mtime_ms,
			ctime_ms: file.ctime_ms,
			dev: file.dev,
			ino: file.ino,
		}),
	);
	files.sort((left, right) => {
		const score = (name: string) =>
			sessionArtifactScore(
				name,
				Boolean(canonicalSessionArtifactKind(name, sessionId)),
			);
		return (
			score(left.name) - score(right.name) ||
			left.name.localeCompare(right.name)
		);
	});
	return {
		files,
		unsupportedCount: enumeration.unsupportedCount,
		scannedEntries: enumeration.scannedEntries,
		complete: enumeration.complete,
	};
}

function assertSafeArtifactDirectory(path: string): ArtifactDirectory {
	const stat = lstatSync(path);
	if (
		stat.isSymbolicLink() ||
		!stat.isDirectory() ||
		realpathSync(path) !== resolve(path)
	)
		throw new Error("session artifact directory must be a real directory");
	return {
		mtime_ms: Number(stat.mtimeMs),
		ctime_ms: Number(stat.ctimeMs),
		dev: String(stat.dev),
		ino: String(stat.ino),
	};
}

function encodeCursor(cursor: CursorV2): string {
	return Buffer.from(stableJson(cursor), "utf8").toString("base64url");
}

function decodeCursor(token: string): CursorV2 {
	let value: unknown;
	try {
		value = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
	} catch {
		throw new Error("evolve artifacts cursor is invalid");
	}
	if (value === null || typeof value !== "object")
		throw new Error("evolve artifacts cursor is invalid");
	const cursor = value as Record<string, unknown>;
	if (
		cursor.v !== CURSOR_VERSION ||
		!(
			cursor.phase === "initial" ||
			cursor.phase === "delta" ||
			cursor.phase === "checkpoint"
		) ||
		!Number.isSafeInteger(cursor.offset) ||
		Number(cursor.offset) < 0 ||
		!Number.isSafeInteger(cursor.limit) ||
		Number(cursor.limit) < 1 ||
		Number(cursor.limit) > MAX_LIMIT ||
		!SHA256_RE.test(String(cursor.selection_digest)) ||
		!SHA256_RE.test(String(cursor.catalog_digest)) ||
		typeof cursor.scan_after_ms !== "number" ||
		!Number.isFinite(cursor.scan_after_ms) ||
		cursor.scan_after_ms < 0
	)
		throw new Error("evolve artifacts cursor is invalid");
	return cursor as CursorV2;
}

function sourceCatalog(input: {
	root: string;
	sessions: Array<{ session_id: string; location: "live" | "archived" }>;
	scanAfterMs: number;
}): SourceCatalog {
	const wb = resolveProjectPaths(input.root).abs.wbDir;
	const filesBySession = new Map<string, ArtifactFile[]>();
	const unsupportedBySession = new Map<string, number>();
	const changedSessions: string[] = [];
	const rows: unknown[] = [];
	let scannedEntries = 0;
	let ownersScanned = 0;
	let workUnits = 0;
	let latestChangeMs = 0;
	for (let index = 0; index < input.sessions.length; index += 1) {
		const session = input.sessions[index] as (typeof input.sessions)[number];
		const remaining = MAX_SOURCE_CATALOG_WORK_UNITS - workUnits;
		if (remaining < 1) throw new ArtifactSessionCatalogBudgetError();
		workUnits += 1;
		ownersScanned += 1;
		const base =
			session.location === "archived"
				? join(wb, "_archive", session.session_id)
				: join(wb, session.session_id);
		const directory = assertSafeArtifactDirectory(base);
		const remainingEntries = MAX_SOURCE_CATALOG_WORK_UNITS - workUnits;
		if (remainingEntries < 1) throw new ArtifactSessionCatalogBudgetError();
		const inventory = artifactFiles(
			base,
			session.session_id,
			Math.min(remainingEntries, MAX_OWNER_FILES),
		);
		scannedEntries += inventory.scannedEntries;
		workUnits += inventory.scannedEntries;
		if (
			!inventory.complete ||
			(workUnits >= MAX_SOURCE_CATALOG_WORK_UNITS &&
				index + 1 < input.sessions.length)
		)
			throw new ArtifactSessionCatalogBudgetError();
		const { files, unsupportedCount } = inventory;
		filesBySession.set(session.session_id, files);
		unsupportedBySession.set(session.session_id, unsupportedCount);
		let newest = Math.max(directory.mtime_ms, directory.ctime_ms);
		latestChangeMs = Math.max(latestChangeMs, directory.ctime_ms);
		for (const file of files) newest = Math.max(newest, file.ctime_ms);
		for (const file of files)
			latestChangeMs = Math.max(latestChangeMs, file.ctime_ms);
		rows.push({
			session_id: session.session_id,
			location: session.location,
			directory,
			files: files.map(({ name, bytes, mtime_ms, ctime_ms, dev, ino }) => ({
				name,
				bytes,
				mtime_ms,
				ctime_ms,
				dev,
				ino,
			})),
		});
		if (newest >= input.scanAfterMs) changedSessions.push(session.session_id);
	}
	return {
		digest: digest(stableJson(rows)),
		latestChangeMs,
		scannedEntries,
		ownersScanned,
		workUnits,
		filesBySession,
		changedSessions,
		unsupportedBySession,
	};
}

function redactSourcePreservingLines(content: string): string {
	const characters = content.split("");
	for (const span of importedTextRedactionSpans(content)) {
		for (let index = span.start; index < span.end; index += 1) {
			if (characters[index] !== "\r" && characters[index] !== "\n")
				characters[index] = "*";
		}
	}
	return characters.join("");
}

function excerpt(content: string): { anchor: string; excerpt: string } {
	const normalized = redactSourcePreservingLines(content).replaceAll(
		"\r\n",
		"\n",
	);
	const lines = normalized.split("\n");
	const index = Math.max(
		0,
		lines.findIndex((line) => line.trim().length > 0),
	);
	const start = Math.max(0, index - 2);
	const selected = lines
		.slice(start, start + 12)
		.map((line, position) => `${start + position + 1}: ${line}`)
		.join("\n");
	return {
		anchor: `line:${index + 1}`,
		excerpt: selected.slice(0, MAX_EXCERPT_CHARS),
	};
}

type SessionArtifact = ArtifactReference & {
	bytes: number;
	excerpt: string;
	page?: PageEnvelope;
};

type PageEnvelope = {
	content: string;
	byte_start: number;
	byte_end: number;
	source_bytes: number;
	has_more: boolean;
	next_offset?: number;
	cursor?: string;
	coverage: "complete" | "partial";
	redaction_status:
		| "complete"
		| "withheld_context_limit"
		| "withheld_invalid_utf8";
};

function selectorError(sessionId: string, selector: string): Error {
	return new Error(
		`unsupported or missing artifact selector for ${sessionId}: ${selector}; supported names are session-prefixed plan, research, handoff, analysis, review, findings, report, log, task, postmortem, retrospective, .evidence.jsonl, or a supplementary file such as artifacts/<name>.md`,
	);
}

/**
 * Resolve one `--artifact` selector against the shared inventory: the exact
 * owner-relative name wins, then the project-relative path, then a unique
 * basename. An ambiguous basename is an error, never a silent pick.
 */
function selectArtifactFile(input: {
	root: string;
	sessionId: string;
	files: readonly ArtifactFile[];
	selector: string;
}): ArtifactFile {
	const normalized = input.selector.replaceAll("\\", "/");
	const byName = input.files.filter((file) => file.name === normalized);
	if (byName.length === 1) return byName[0] as ArtifactFile;
	const byPath = input.files.filter(
		(file) =>
			relative(input.root, file.path).replaceAll("\\", "/") === normalized,
	);
	if (byPath.length === 1) return byPath[0] as ArtifactFile;
	const byBasename = input.files.filter((file) => {
		const parts = file.name.split("/");
		return parts[parts.length - 1] === normalized;
	});
	if (byBasename.length === 1) return byBasename[0] as ArtifactFile;
	if (byBasename.length > 1)
		throw new Error(
			`ambiguous artifact selector for ${input.sessionId}: ${normalized}; use the owner-relative name such as artifacts/<name>.md`,
		);
	throw selectorError(input.sessionId, input.selector);
}

function artifactListForSession(input: {
	root: string;
	session: { session_id: string; location: "live" | "archived" };
	files: ArtifactFile[];
	artifactSelectors?: readonly string[];
	byteOffset?: number;
	pageCursor?: string;
	readBudget: { bytes: number; workBytes: number };
}): {
	artifacts: SessionArtifact[];
	warnings: string[];
	coverage: {
		canonical_total: number;
		returned: number;
		omitted: number;
		omitted_names: string[];
		unsupported_count: number;
		targeted: boolean;
	};
} {
	const selectors = input.artifactSelectors;
	let candidates = input.files;
	if (selectors?.length) {
		candidates = selectors.map((selector) =>
			selectArtifactFile({
				root: input.root,
				sessionId: input.session.session_id,
				files: input.files,
				selector,
			}),
		);
	}
	const defaultCandidates = candidates.slice(
		0,
		selectors?.length ? selectors.length : MAX_DEFAULT_ARTIFACTS_PER_SESSION,
	);
	const omittedFiles = selectors?.length
		? []
		: candidates.slice(defaultCandidates.length);
	const artifacts: SessionArtifact[] = [];
	const warnings: string[] = [];
	for (const file of defaultCandidates) {
		if (file.bytes > MAX_ARTIFACT_BYTES && !selectors?.length) {
			warnings.push(
				`skipped_size_limit:${file.name}; retrieve with --session ${input.session.session_id} --artifact ${file.name}`,
			);
			continue;
		}
		if (selectors?.length) {
			// Directed read: return the requested page itself with a
			// continuation cursor, never only the file's first lines.
			const remaining = input.readBudget.bytes;
			if (remaining < 1) {
				warnings.push(`skipped_page_read_budget:${file.name}`);
				continue;
			}
			const pageBytes = Math.min(MAX_RANGE_BYTES, remaining);
			const estimatedWork =
				file.bytes <= MAX_REDACTION_CONTEXT_BYTES
					? file.bytes * 2 + pageBytes + 1
					: pageBytes + 9;
			if (estimatedWork > input.readBudget.workBytes) {
				warnings.push(`skipped_page_work_budget:${file.name}`);
				continue;
			}
			const paths = resolveProjectPaths(input.root);
			const ownerDir =
				input.session.location === "archived"
					? join(paths.abs.wbDir, "_archive", input.session.session_id)
					: join(paths.abs.wbDir, input.session.session_id);
			const read = readArtifactPage({
				root: input.root,
				ownerDir,
				relativePath: file.name,
				label: "session artifact",
				...(input.byteOffset === undefined
					? {}
					: { byteOffset: input.byteOffset }),
				...(input.pageCursor ? { cursor: input.pageCursor } : {}),
				maxBytes: pageBytes,
				...(input.byteOffset === undefined &&
				input.pageCursor === undefined &&
				file.bytes <= MAX_ARTIFACT_BYTES
					? { includeFullSourceSnapshot: true }
					: {}),
			});
			if (
				read.page.source_bytes !== file.bytes ||
				read.sourceIdentityDigest !== artifactFileIdentity(file)
			)
				throw new ArtifactSourceChangedError();
			if (read.page.byte_end === read.page.byte_start) {
				warnings.push(`empty_range:${file.name}`);
				continue;
			}
			input.readBudget.bytes -= read.rawBytes.byteLength;
			input.readBudget.workBytes -= read.workBytes;
			let anchor = read.anchor;
			let contentDigest = read.rawDigest;
			let digestScope: "artifact" | "range" = "range";
			let sourceIdentityDigest: string | undefined = read.sourceIdentityDigest;
			let excerptContent = read.page.content;
			if (
				input.byteOffset === undefined &&
				input.pageCursor === undefined &&
				read.page.byte_start === 0 &&
				file.bytes <= MAX_ARTIFACT_BYTES &&
				read.redactionStatus === "complete" &&
				read.fullSourceSnapshot !== undefined
			) {
				anchor = excerpt(read.fullSourceSnapshot.content).anchor;
				contentDigest = read.fullSourceSnapshot.rawDigest;
				digestScope = "artifact";
				sourceIdentityDigest = undefined;
				excerptContent = read.fullSourceSnapshot.content;
			}
			const displayed = excerpt(excerptContent);
			const projectPath = relative(input.root, file.path).replaceAll("\\", "/");
			artifacts.push({
				session_id: input.session.session_id,
				path: projectPath,
				anchor,
				content_digest: contentDigest,
				digest_scope: digestScope,
				...(sourceIdentityDigest
					? { source_identity_digest: sourceIdentityDigest }
					: {}),
				bytes: file.bytes,
				excerpt: displayed.excerpt,
				page: { ...read.page, redaction_status: read.redactionStatus },
			});
			continue;
		}
		const estimatedWork = file.bytes * 2;
		if (
			input.readBudget.bytes < file.bytes ||
			input.readBudget.workBytes < estimatedWork
		) {
			warnings.push(`skipped_page_read_budget:${file.name}`);
			continue;
		}
		const source = readBoundedSourceFileWithBytes(
			file.path,
			"session artifact",
			{
				maxBytes: MAX_ARTIFACT_BYTES,
				maxLines: 20_000,
				maxCandidates: 50_000,
			},
		);
		const content = source?.text ?? "";
		input.readBudget.bytes -= file.bytes;
		input.readBudget.workBytes -= estimatedWork;
		const displayed = excerpt(content);
		artifacts.push({
			session_id: input.session.session_id,
			path: relative(input.root, file.path).replaceAll("\\", "/"),
			anchor: displayed.anchor,
			content_digest: digest(source?.bytes ?? new Uint8Array()),
			digest_scope: "artifact",
			bytes: file.bytes,
			excerpt: displayed.excerpt,
		});
	}
	if (omittedFiles.length > 0)
		warnings.push(
			`additional_canonical_artifacts:${omittedFiles.length}; query each with --artifact <filename>`,
		);
	return {
		artifacts,
		warnings,
		coverage: {
			canonical_total: candidates.length,
			returned: artifacts.length,
			omitted: omittedFiles.length,
			omitted_names: omittedFiles.slice(0, 10).map((file) => file.name),
			unsupported_count: 0,
			targeted: Boolean(selectors?.length),
		},
	};
}

export function inspectArtifactRecords(input: {
	root: string;
	limit?: number;
	cursor?: string;
}) {
	return enumerateRecordsPage(input);
}

type RecordArtifactView = ArtifactReferenceV2 & {
	bytes: number;
	excerpt: string;
	page?: PageEnvelope;
};

type RecordSearchMatch = {
	path: string;
	byte_offset: number;
	excerpt: string;
};

function selectRecordArtifactFile(
	files: readonly InventoryFile[],
	selector: string,
): InventoryFile {
	const normalized = selector.replaceAll("\\", "/");
	const exact = files.filter((file) => file.name === normalized);
	if (exact.length === 1) return exact[0] as InventoryFile;
	const basename = files.filter(
		(file) => file.name.split("/").at(-1) === normalized,
	);
	if (basename.length === 1) return basename[0] as InventoryFile;
	throw new Error("record artifact selector is unsupported or ambiguous");
}

function searchExcerpt(
	content: string,
	index: number,
	queryLength: number,
): string {
	const start = Math.max(
		0,
		index - Math.floor((MAX_EXCERPT_CHARS - queryLength) / 2),
	);
	const end = Math.min(content.length, start + MAX_EXCERPT_CHARS);
	return content.slice(start, end);
}

export function inspectStandaloneRecordArtifacts(input: {
	root: string;
	recordId: string;
	artifacts?: readonly string[];
	search?: string;
	fileCursor?: string;
	searchCursor?: string;
	byteOffset?: number;
	pageCursor?: string;
	limit?: number;
}): {
	read_only: true;
	owner: { kind: "record"; id: string };
	files: Array<{ path: string; bytes: number }>;
	artifacts: RecordArtifactView[];
	coverage: {
		status: "complete" | "partial";
		complete: boolean;
		total: number;
		returned: number;
		omitted: number;
		unsupported_count: number;
		targeted: boolean;
		inventory_scanned: boolean;
	};
	files_page?: {
		offset: number;
		limit: number;
		returned: number;
		total: number;
		has_more: boolean;
	};
	files_cursor?: string;
	search?: {
		matches: RecordSearchMatch[];
		read_bytes: number;
		scanned_bytes: number;
		work_bytes: number;
		work_budget_bytes: number;
		total_read_bytes: number;
		total_scanned_bytes: number;
		total_work_bytes: number;
		total_withheld_files: number;
		coverage: "complete" | "partial";
		partial_reason?:
			| "work_budget"
			| "redaction_context"
			| "unsupported_entries";
		withheld_files: number;
		matches_truncated: boolean;
		cursor?: string;
	};
} {
	if (!OWNER_ID_RE.test(input.recordId))
		throw new Error("standalone record id is invalid");
	if (input.artifacts?.length && input.search !== undefined)
		throw new Error("record artifact read and search cannot be combined");
	if (input.fileCursor && input.searchCursor)
		throw new Error("record file and search cursors are separate routes");
	if (
		input.fileCursor &&
		(input.artifacts?.length || input.search !== undefined)
	)
		throw new ArtifactFileCursorError();
	if (input.searchCursor && input.search === undefined)
		throw new ArtifactSearchCursorError();
	if ((input.artifacts?.length ?? 0) > 4)
		throw new Error("record artifact reads accept at most four selectors");
	if (input.search !== undefined) {
		if (
			!input.search.trim() ||
			Buffer.byteLength(input.search, "utf8") > 256 ||
			input.byteOffset !== undefined ||
			input.pageCursor !== undefined
		)
			throw new Error(
				"record search requires a query of at most 256 UTF-8 bytes",
			);
	}
	if (input.pageCursor && input.artifacts?.length !== 1)
		throw new Error(
			"artifact page cursor requires one record artifact selector",
		);
	if (input.byteOffset !== undefined && input.artifacts?.length !== 1)
		throw new Error(
			"artifact byte offset requires one record artifact selector",
		);
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
	const { recordDir } = resolveRecordDirectory(input.root, input.recordId);
	const targetSelectors = input.artifacts ?? [];
	if (input.search !== undefined) {
		const snapshot = recordOwnerSnapshot({
			root: input.root,
			recordId: input.recordId,
			recordDir,
		});
		const previous = input.searchCursor
			? decodeRecordSearchCursor(input.searchCursor)
			: undefined;
		const queryDigest = digest(input.search);
		if (
			previous &&
			(previous.record_id !== input.recordId ||
				previous.owner_path !== snapshot.ownerPath ||
				previous.query_digest !== queryDigest)
		)
			throw new ArtifactSearchCursorError();
		if (previous && previous.catalog_digest !== snapshot.digest)
			throw new ArtifactCatalogChangedError();
		const offset = previous?.offset ?? 0;
		if (offset > snapshot.enumeration.files.length)
			throw new ArtifactSearchCursorError();
		const matches: RecordSearchMatch[] = [];
		let readBytes = 0;
		let scannedBytes = 0;
		let workBytes = 0;
		let withheldFiles = 0;
		const incompleteReasons = new Set(previous?.incomplete_reasons ?? []);
		if (snapshot.enumeration.unsupportedCount > 0)
			incompleteReasons.add("unsupported_entries");
		let pageStopReason: "work_budget" | undefined;
		let matchesTruncated = false;
		let nextOffset = offset;
		for (
			let index = offset;
			index < snapshot.enumeration.files.length;
			index += 1
		) {
			const file = snapshot.enumeration.files[index] as InventoryFile;
			if (file.bytes > MAX_REDACTION_CONTEXT_BYTES) {
				withheldFiles += 1;
				incompleteReasons.add("redaction_context");
				nextOffset = index + 1;
				continue;
			}
			const estimatedWork = file.bytes * 2;
			if (estimatedWork > MAX_RECORD_SEARCH_BYTES) {
				withheldFiles += 1;
				incompleteReasons.add("work_budget");
				nextOffset = index + 1;
				continue;
			}
			if (workBytes + estimatedWork > MAX_RECORD_SEARCH_BYTES) {
				pageStopReason = "work_budget";
				break;
			}
			const safe = readArtifactSafeSource({
				root: input.root,
				ownerDir: recordDir,
				relativePath: file.name,
				label: "record artifact",
				expectedBytes: file.bytes,
			});
			if (
				safe.sourceBytes !== file.bytes ||
				safe.sourceIdentityDigest !== inventoryFileIdentity(file)
			)
				throw new ArtifactSourceChangedError();
			readBytes += safe.readBytes;
			scannedBytes += safe.scannedBytes;
			workBytes += safe.readBytes + safe.scannedBytes;
			if (safe.redactionStatus !== "complete" || safe.content === undefined) {
				withheldFiles += 1;
				incompleteReasons.add("redaction_context");
				nextOffset = index + 1;
				continue;
			}
			let position = safe.content.indexOf(input.search);
			while (position >= 0) {
				if (matches.length >= MAX_RECORD_SEARCH_MATCHES) {
					matchesTruncated = true;
					incompleteReasons.add("work_budget");
					break;
				}
				matches.push({
					path: file.name,
					byte_offset: Buffer.byteLength(
						safe.content.slice(0, position),
						"utf8",
					),
					excerpt: searchExcerpt(safe.content, position, input.search.length),
				});
				position = safe.content.indexOf(
					input.search,
					position + Math.max(input.search.length, 1),
				);
			}
			nextOffset = index + 1;
			if (matchesTruncated) break;
		}
		const hasMore = nextOffset < snapshot.enumeration.files.length;
		const cursor =
			hasMore && !matchesTruncated
				? encodeOwnerCursor({
						v: 1,
						op: "record-search",
						record_id: input.recordId,
						owner_path: snapshot.ownerPath,
						query_digest: queryDigest,
						offset: nextOffset,
						catalog_digest: snapshot.digest,
						total_read_bytes: (previous?.total_read_bytes ?? 0) + readBytes,
						total_scanned_bytes:
							(previous?.total_scanned_bytes ?? 0) + scannedBytes,
						total_work_bytes: (previous?.total_work_bytes ?? 0) + workBytes,
						total_withheld_files:
							(previous?.total_withheld_files ?? 0) + withheldFiles,
						incomplete_reasons: [...incompleteReasons].sort(),
					})
				: undefined;
		const coverage =
			cursor || incompleteReasons.size > 0 || matchesTruncated
				? "partial"
				: "complete";
		const partialReason =
			pageStopReason ??
			(incompleteReasons.has("redaction_context")
				? "redaction_context"
				: incompleteReasons.has("work_budget")
					? "work_budget"
					: incompleteReasons.has("unsupported_entries")
						? "unsupported_entries"
						: undefined);
		const totalReadBytes = (previous?.total_read_bytes ?? 0) + readBytes;
		const totalScannedBytes =
			(previous?.total_scanned_bytes ?? 0) + scannedBytes;
		const totalWorkBytes = (previous?.total_work_bytes ?? 0) + workBytes;
		const totalWithheldFiles =
			(previous?.total_withheld_files ?? 0) + withheldFiles;
		return {
			read_only: true,
			owner: { kind: "record", id: input.recordId },
			files: [],
			artifacts: [],
			coverage: {
				status: coverage,
				complete: coverage === "complete",
				total: snapshot.enumeration.files.length,
				unsupported_count: snapshot.enumeration.unsupportedCount,
				targeted: true,
				inventory_scanned: true,
				returned: 0,
				omitted: 0,
			},
			search: {
				matches,
				read_bytes: readBytes,
				scanned_bytes: scannedBytes,
				work_bytes: workBytes,
				work_budget_bytes: MAX_RECORD_SEARCH_BYTES,
				total_read_bytes: totalReadBytes,
				total_scanned_bytes: totalScannedBytes,
				total_work_bytes: totalWorkBytes,
				total_withheld_files: totalWithheldFiles,
				coverage,
				...(partialReason ? { partial_reason: partialReason } : {}),
				withheld_files: totalWithheldFiles,
				matches_truncated: matchesTruncated,
				...(cursor ? { cursor } : {}),
			},
		};
	}
	if (targetSelectors.length) {
		const directlyResolved = targetSelectors.map((selector) =>
			resolveOwnerArtifactFile({
				dir: recordDir,
				relativePath: selector.replaceAll("\\", "/"),
				rejectRootBasenameCollision: true,
			}),
		);
		const inventoryScanned = directlyResolved.some((file) => file === null);
		const snapshot = inventoryScanned
			? recordOwnerSnapshot({
					root: input.root,
					recordId: input.recordId,
					recordDir,
				})
			: undefined;
		const enumeration = snapshot?.enumeration;
		const artifacts: RecordArtifactView[] = [];
		for (let index = 0; index < targetSelectors.length; index += 1) {
			const selector = targetSelectors[index] as string;
			const file =
				directlyResolved[index] ??
				selectRecordArtifactFile(enumeration?.files ?? [], selector);
			const read = readArtifactPage({
				root: input.root,
				ownerDir: recordDir,
				relativePath: file.name,
				label: "record artifact",
				...(input.byteOffset === undefined
					? {}
					: { byteOffset: input.byteOffset }),
				...(input.pageCursor ? { cursor: input.pageCursor } : {}),
				maxBytes: MAX_RANGE_BYTES,
			});
			if (
				read.page.source_bytes !== file.bytes ||
				read.sourceIdentityDigest !== inventoryFileIdentity(file)
			)
				throw new ArtifactSourceChangedError();
			const displayed = excerpt(read.page.content);
			const emptyWholeSource = file.bytes === 0 && read.wholeSource;
			const reference: ArtifactReferenceV2 = emptyWholeSource
				? {
						schema_version: 2,
						owner: { kind: "record", id: input.recordId },
						relative_path: file.name,
						content_digest: read.rawDigest,
						digest_scope: "artifact",
						anchor: "line:1",
					}
				: {
						schema_version: 2,
						owner: { kind: "record", id: input.recordId },
						relative_path: file.name,
						content_digest: read.rawDigest,
						digest_scope: "range",
						anchor: read.anchor,
						source_identity_digest: read.sourceIdentityDigest,
					};
			// `readArtifactPage` validated the safe path, source identity, and raw
			// range digest used to construct this reference, so re-reading it here
			// would duplicate work without adding a new proof.
			artifacts.push({
				...reference,
				bytes: file.bytes,
				excerpt: displayed.excerpt,
				page: { ...read.page, redaction_status: read.redactionStatus },
			});
		}
		const status =
			!inventoryScanned ||
			(enumeration?.unsupportedCount ?? 0) > 0 ||
			artifacts.some((artifact) => artifact.page?.coverage !== "complete")
				? "partial"
				: "complete";
		return {
			read_only: true,
			owner: { kind: "record", id: input.recordId },
			files: [],
			artifacts,
			coverage: {
				status,
				complete: status === "complete",
				total: enumeration?.files.length ?? artifacts.length,
				unsupported_count: enumeration?.unsupportedCount ?? 0,
				targeted: true,
				inventory_scanned: inventoryScanned,
				returned: artifacts.length,
				omitted: 0,
			},
		};
	}
	const snapshot = recordOwnerSnapshot({
		root: input.root,
		recordId: input.recordId,
		recordDir,
	});
	const previous = input.fileCursor
		? decodeRecordFilesCursor(input.fileCursor)
		: undefined;
	if (
		previous &&
		(previous.record_id !== input.recordId ||
			previous.owner_path !== snapshot.ownerPath ||
			(input.limit !== undefined && input.limit !== previous.limit))
	)
		throw new ArtifactFileCursorError();
	if (previous && previous.catalog_digest !== snapshot.digest)
		throw new ArtifactCatalogChangedError();
	const pageLimit = previous?.limit ?? limit;
	const offset = previous?.offset ?? 0;
	if (offset > snapshot.enumeration.files.length)
		throw new ArtifactFileCursorError();
	const selected = snapshot.enumeration.files.slice(offset, offset + pageLimit);
	const nextOffset = offset + selected.length;
	const hasMore = nextOffset < snapshot.enumeration.files.length;
	const filesCursor = hasMore
		? encodeOwnerCursor({
				v: 1,
				op: "record-files",
				record_id: input.recordId,
				owner_path: snapshot.ownerPath,
				offset: nextOffset,
				limit: pageLimit,
				catalog_digest: snapshot.digest,
			})
		: undefined;
	const omitted = snapshot.enumeration.files.length - nextOffset;
	const status =
		hasMore || snapshot.enumeration.unsupportedCount > 0
			? "partial"
			: "complete";
	return {
		read_only: true,
		owner: { kind: "record", id: input.recordId },
		files: selected.map((file) => ({ path: file.name, bytes: file.bytes })),
		artifacts: [],
		coverage: {
			status,
			complete: status === "complete",
			total: snapshot.enumeration.files.length,
			unsupported_count: snapshot.enumeration.unsupportedCount,
			targeted: false,
			inventory_scanned: true,
			returned: selected.length,
			omitted,
		},
		files_page: {
			offset,
			limit: pageLimit,
			returned: selected.length,
			total: snapshot.enumeration.files.length,
			has_more: hasMore,
		},
		...(filesCursor ? { files_cursor: filesCursor } : {}),
	};
}

export function inspectEvolutionArtifacts(input: {
	root: string;
	sessions?: readonly string[];
	artifacts?: readonly string[];
	byteOffset?: number;
	cursor?: string;
	pageCursor?: string;
	limit?: number;
}): {
	read_only: true;
	status: "progress" | "complete" | "source_changed" | "partial";
	page: {
		offset: number;
		limit: number;
		returned: number;
		total: number;
		has_more: boolean;
	};
	cursor: string;
	projection_health: { database: "present" | "absent"; inspected: false };
	coverage: "complete" | "bounded_page" | "source_changed" | "partial";
	source_catalog: {
		sessions_considered: number;
		owners_scanned: number;
		owner_entries_scanned: number;
		work_units: number;
		work_budget_units: number;
	};
	removed_or_untracked_changes: boolean;
	conflicts: string[];
	items: Array<{
		session_id: string;
		location: "live" | "archived";
		snapshot_digest: string;
		artifacts: SessionArtifact[];
		artifact_coverage: {
			canonical_total: number;
			returned: number;
			omitted: number;
			omitted_names: string[];
			unsupported_count: number;
			targeted: boolean;
		};
		warnings: string[];
	}>;
} {
	const limit = input.limit ?? DEFAULT_LIMIT;
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT)
		throw new Error("evolve artifacts --limit must be an integer from 1 to 10");
	const selectedIds = input.sessions ? [...input.sessions] : undefined;
	if ((selectedIds?.length ?? 0) > 100)
		throw new Error("evolve artifacts accepts at most 100 --session selectors");
	if (input.artifacts?.length && selectedIds?.length !== 1)
		throw new Error("--artifact requires exactly one --session selector");
	if ((input.artifacts?.length ?? 0) > 4)
		throw new Error(
			"evolve artifacts accepts at most four --artifact selectors",
		);
	if (input.byteOffset !== undefined && input.artifacts?.length !== 1)
		throw new Error("--byte-offset requires exactly one --artifact selector");
	if (
		input.pageCursor &&
		(selectedIds?.length !== 1 || input.artifacts?.length !== 1)
	)
		throw new Error(
			"--page-cursor requires one session and one --artifact selector",
		);
	if (input.pageCursor && input.cursor)
		throw new Error("--page-cursor and history --cursor are separate routes");
	const selectorIds = selectedIds ?? [];
	const seen = new Set<string>();
	for (const id of selectorIds) {
		if (!SESSION_ID_RE.test(id))
			throw new Error("evolve artifacts session id is invalid");
		if (seen.has(id))
			throw new Error(`evolve artifacts duplicate session selector: ${id}`);
		seen.add(id);
	}
	const enumeration = enumerateEvolutionHistorySessions(input.root);
	const byId = new Map(
		enumeration.sessions.map((session) => [session.session_id, session]),
	);
	const sessions = selectedIds
		? selectedIds.map((id) => {
				const match = byId.get(id);
				if (!match)
					throw new Error(
						`evolve artifacts session is missing or conflicted: ${id}`,
					);
				return match;
			})
		: enumeration.sessions;
	const selectionDigest = digest(
		stableJson(selectedIds ? selectorIds : ["all-history"]),
	);
	const previous = input.cursor ? decodeCursor(input.cursor) : undefined;
	if (previous && previous.selection_digest !== selectionDigest)
		throw new Error(
			"evolve artifacts cursor does not match the selected sessions",
		);
	if (previous && input.limit !== undefined && input.limit !== previous.limit)
		throw new Error(
			"evolve artifacts cursor limit changed; restart without --cursor",
		);
	if (input.artifacts?.length && previous)
		throw new Error("targeted artifact reads do not use a history cursor");
	const pageLimit = previous?.limit ?? limit;
	const scanAfter = previous?.scan_after_ms ?? 0;
	const catalog = sourceCatalog({
		root: input.root,
		sessions,
		scanAfterMs: scanAfter,
	});
	let status: "progress" | "complete" | "source_changed" | "partial" =
		"progress";
	let offset = previous?.offset ?? 0;
	let candidates = sessions;
	let phase = previous?.phase ?? "initial";
	let changedWithoutArtifact = false;
	if (previous?.phase === "checkpoint") {
		if (catalog.digest === previous.catalog_digest) {
			const nextCursor = encodeCursor({
				v: CURSOR_VERSION,
				phase: "checkpoint",
				offset: 0,
				limit: pageLimit,
				selection_digest: selectionDigest,
				catalog_digest: catalog.digest,
				scan_after_ms: catalog.latestChangeMs,
			});
			const config = resolveEvolutionConfig(readProjectConfig(input.root));
			return {
				read_only: true,
				status: enumeration.conflicts.length > 0 ? "partial" : "complete",
				page: {
					offset: 0,
					limit: pageLimit,
					returned: 0,
					total: 0,
					has_more: false,
				},
				cursor: nextCursor,
				projection_health: {
					database: existsSync(
						evolutionDbPath(input.root, config.paths.evolutionDb),
					)
						? "present"
						: "absent",
					inspected: false,
				},
				coverage: enumeration.conflicts.length > 0 ? "partial" : "complete",
				source_catalog: {
					sessions_considered: sessions.length,
					owners_scanned: catalog.ownersScanned,
					owner_entries_scanned: catalog.scannedEntries,
					work_units: catalog.workUnits,
					work_budget_units: MAX_SOURCE_CATALOG_WORK_UNITS,
				},
				removed_or_untracked_changes: false,
				conflicts: enumeration.conflicts,
				items: [],
			};
		}
		candidates = sessions.filter((session) =>
			catalog.changedSessions.includes(session.session_id),
		);
		status = "source_changed";
		phase = "delta";
		offset = 0;
		changedWithoutArtifact = candidates.length === 0;
	} else if (previous && catalog.digest !== previous.catalog_digest) {
		candidates = sessions.filter((session) =>
			catalog.changedSessions.includes(session.session_id),
		);
		status = "source_changed";
		phase = "delta";
		offset = 0;
		changedWithoutArtifact = candidates.length === 0;
	} else if (previous?.phase === "delta") {
		candidates = sessions.filter((session) =>
			catalog.changedSessions.includes(session.session_id),
		);
		phase = "delta";
	}
	if (input.artifacts?.length) {
		candidates = sessions;
		offset = 0;
		phase = "checkpoint";
		status = "complete";
	}
	const page = candidates.slice(offset, offset + pageLimit);
	const readBudget = {
		bytes: input.artifacts?.length ? MAX_RANGE_BYTES : MAX_TOTAL_READ_BYTES,
		workBytes: input.artifacts?.length
			? MAX_PAGE_WORK_BYTES
			: MAX_TOTAL_READ_BYTES,
	};
	const items = page.map((session) => {
		const files = catalog.filesBySession.get(session.session_id) ?? [];
		const fetched = artifactListForSession({
			root: input.root,
			session,
			files,
			...(input.artifacts ? { artifactSelectors: input.artifacts } : {}),
			...(input.byteOffset === undefined
				? {}
				: { byteOffset: input.byteOffset }),
			...(input.pageCursor ? { pageCursor: input.pageCursor } : {}),
			readBudget,
		});
		return {
			session_id: session.session_id,
			location: session.location,
			snapshot_digest: digest(
				stableJson(
					fetched.artifacts.map(({ path, content_digest, anchor }) => ({
						path,
						content_digest,
						anchor,
					})),
				),
			),
			artifacts: fetched.artifacts,
			artifact_coverage: {
				...fetched.coverage,
				unsupported_count:
					catalog.unsupportedBySession.get(session.session_id) ?? 0,
			},
			warnings: [
				...fetched.warnings,
				...((catalog.unsupportedBySession.get(session.session_id) ?? 0) > 0
					? [
							`excluded_noncanonical_artifacts:${catalog.unsupportedBySession.get(session.session_id)}; use supported session-prefixed names or .evidence.jsonl`,
						]
					: []),
			],
		};
	});
	const hasMore = offset + page.length < candidates.length;
	if (hasMore) status = status === "source_changed" ? status : "progress";
	else status = changedWithoutArtifact ? "source_changed" : "complete";
	if (!hasMore && status === "complete" && enumeration.conflicts.length > 0)
		status = "partial";
	const cursorPhase = hasMore ? phase : "checkpoint";
	const nextOffset = hasMore ? offset + page.length : 0;
	const nextCursor = encodeCursor({
		v: CURSOR_VERSION,
		phase: cursorPhase,
		offset: nextOffset,
		limit: pageLimit,
		selection_digest: selectionDigest,
		catalog_digest: catalog.digest,
		scan_after_ms: hasMore ? scanAfter : catalog.latestChangeMs,
	});
	const config = resolveEvolutionConfig(readProjectConfig(input.root));
	return {
		read_only: true,
		status,
		page: {
			offset,
			limit: pageLimit,
			returned: page.length,
			total: candidates.length,
			has_more: hasMore,
		},
		cursor: nextCursor,
		projection_health: {
			database: existsSync(
				evolutionDbPath(input.root, config.paths.evolutionDb),
			)
				? "present"
				: "absent",
			inspected: false,
		},
		coverage:
			status === "source_changed"
				? "source_changed"
				: status === "partial"
					? "partial"
					: hasMore
						? "bounded_page"
						: "complete",
		source_catalog: {
			sessions_considered: sessions.length,
			owners_scanned: catalog.ownersScanned,
			owner_entries_scanned: catalog.scannedEntries,
			work_units: catalog.workUnits,
			work_budget_units: MAX_SOURCE_CATALOG_WORK_UNITS,
		},
		removed_or_untracked_changes: changedWithoutArtifact,
		conflicts: enumeration.conflicts,
		items,
	};
}

/**
 * Verify an emitted artifact reference without opening the evolution
 * database. Accepts the legacy v1 session reference and the owner-based v2
 * reference (session or standalone record). The check is membership in the
 * shared inventory, so every supplementary file the reader can return is a
 * verifiable reference, not only canonical session-prefixed names.
 */
/** Preserve legacy session identity across reference encodings, including custom/archive roots. */
export function canonicalArtifactEvidenceReference(
	root: string,
	reference: ArtifactReference | ArtifactReferenceV2,
): ArtifactReference | ArtifactReferenceV2 {
	const v2 = reference as ArtifactReferenceV2;
	if (v2.schema_version !== 2 || v2.owner.kind !== "session") return reference;
	const location = enumerateEvolutionHistorySessions(root).sessions.find(
		(entry) => entry.session_id === v2.owner.id,
	);
	if (!location)
		throw new Error("proposal evidence session is missing or conflicted");
	const paths = resolveProjectPaths(root);
	const ownerDir =
		location.location === "archived"
			? join(paths.abs.wbDir, "_archive", v2.owner.id)
			: join(paths.abs.wbDir, v2.owner.id);
	const absolute = resolve(ownerDir, v2.relative_path);
	if (relative(ownerDir, absolute).replaceAll("\\", "/") !== v2.relative_path)
		throw new Error("proposal evidence path is outside its selected owner");
	return {
		session_id: v2.owner.id,
		path: relative(root, absolute).replaceAll("\\", "/"),
		anchor: v2.anchor,
		content_digest: v2.content_digest,
		digest_scope: v2.digest_scope,
		...(v2.source_identity_digest
			? { source_identity_digest: v2.source_identity_digest }
			: {}),
	};
}

export function verifyArtifactReference(
	root: string,
	reference: ArtifactReference | ArtifactReferenceV2,
): void {
	const asV2 = reference as ArtifactReferenceV2;
	const asV1 = reference as ArtifactReference;
	const isV2 = asV2.schema_version === 2;
	const ownerKind: "session" | "record" = isV2 ? asV2.owner.kind : "session";
	const ownerId = isV2 ? asV2.owner.id : asV1.session_id;
	const referencePath = isV2 ? asV2.relative_path : asV1.path;
	const pathBase: "project" | "owner" = isV2 ? "owner" : "project";
	if (
		(ownerKind === "session" && !SESSION_ID_RE.test(ownerId)) ||
		(ownerKind === "record" && !OWNER_ID_RE.test(ownerId)) ||
		!SHA256_RE.test(reference.content_digest)
	)
		throw new Error("proposal evidence reference is invalid");
	const hasByteAnchor = reference.anchor.startsWith("bytes:");
	if (
		(reference.digest_scope === "range") !== hasByteAnchor ||
		(reference.digest_scope === "range" &&
			(!reference.source_identity_digest ||
				!SHA256_RE.test(reference.source_identity_digest))) ||
		(reference.digest_scope === "artifact" &&
			reference.source_identity_digest !== undefined) ||
		(reference.digest_scope !== "range" &&
			reference.digest_scope !== "artifact")
	)
		throw new Error("proposal evidence scope does not match its anchor");
	if (
		referencePath.startsWith("/") ||
		referencePath.includes("\\") ||
		referencePath.split("/").some((part) => part === ".." || part.length === 0)
	)
		throw new Error("proposal evidence path is not canonical");
	let ownerDir: string;
	if (ownerKind === "record") {
		ownerDir = resolveRecordDirectory(root, ownerId).recordDir;
	} else {
		const location = enumerateEvolutionHistorySessions(root).sessions.find(
			(entry) => entry.session_id === ownerId,
		);
		if (!location)
			throw new Error(
				`proposal evidence session is missing or conflicted: ${ownerId}`,
			);
		const paths = resolveProjectPaths(root);
		ownerDir =
			location.location === "archived"
				? join(paths.abs.wbDir, "_archive", location.session_id)
				: join(paths.abs.wbDir, location.session_id);
	}
	const resolved =
		pathBase === "owner"
			? resolve(ownerDir, referencePath)
			: resolve(root, referencePath);
	const projectPath = relative(root, resolved).replaceAll("\\", "/");
	const fromOwner = relative(ownerDir, resolved).replaceAll("\\", "/");
	if (
		fromOwner.startsWith("..") ||
		!fromOwner ||
		(pathBase === "owner"
			? fromOwner !== referencePath
			: projectPath !== referencePath)
	)
		throw new Error("proposal evidence path is outside its selected owner");
	if (ownerKind === "record") {
		if (!resolveOwnerArtifactFile({ dir: ownerDir, relativePath: fromOwner }))
			throw new Error(
				"proposal evidence path is not part of the owner artifact inventory",
			);
	} else {
		const enumeration = enumerateOwnerDirectory({
			dir: ownerDir,
			sessionId: ownerId,
		});
		if (!enumeration.files.some((file) => file.name === fromOwner))
			throw new Error(
				"proposal evidence path is not part of the owner artifact inventory",
			);
	}
	if (reference.digest_scope === "range") {
		const rangeAnchor = /^bytes:(\d+)-(\d+)$/.exec(reference.anchor);
		if (!rangeAnchor)
			throw new Error("proposal evidence range anchor is invalid");
		const offset = Number(rangeAnchor[1]);
		const end = Number(rangeAnchor[2]);
		if (
			!Number.isSafeInteger(offset) ||
			!Number.isSafeInteger(end) ||
			end <= offset ||
			end - offset > MAX_RANGE_BYTES
		)
			throw new Error("proposal evidence range anchor is invalid");
		const range = readBoundedSourceRange(
			resolved,
			"proposal evidence artifact",
			{ offset, maxBytes: end - offset },
		);
		if (
			range.bytes.byteLength !== end - offset ||
			digest(range.bytes) !== reference.content_digest ||
			digest(stableJson(range.sourceIdentity)) !==
				reference.source_identity_digest
		)
			throw new Error(`proposal evidence source changed: ${referencePath}`);
		return;
	}
	const source = readBoundedSourceFileWithBytes(
		resolved,
		"proposal evidence artifact",
		{
			maxBytes: MAX_ARTIFACT_BYTES,
			maxLines: 20_000,
			maxCandidates: 50_000,
		},
	);
	if (source === null || digest(source.bytes) !== reference.content_digest)
		throw new Error(`proposal evidence source changed: ${referencePath}`);
	const lineAnchor = /^line:(\d+)$/.exec(reference.anchor);
	if (
		!lineAnchor ||
		Number(lineAnchor[1]) < 1 ||
		Number(lineAnchor[1]) > source.text.split(/\r?\n/).length
	)
		throw new Error(`proposal evidence anchor is invalid: ${referencePath}`);
}
