import { createHash } from "node:crypto";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
	ArtifactSourceChangedError,
	canonicalSessionArtifactKind,
	DEFAULT_RECORD_LIMIT,
	enumerateOwnerDirectory,
	enumerateRecordsPage,
	type InventoryFile,
	MAX_RECORD_CATALOG_PAGE_SIZE,
	MAX_RECORD_SEARCH_BYTES,
	MAX_RECORD_SEARCH_MATCHES,
	MAX_REDACTION_CONTEXT_BYTES,
	OWNER_ID_RE,
	readArtifactPage,
	readArtifactSafeSource,
	resolveRecordDirectory,
} from "../artifacts/inventory";
import type { ArtifactReferenceV2 } from "../artifacts/types";
import {
	readBoundedSourceFile,
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
	filesBySession: Map<string, ArtifactFile[]>;
	changedSessions: string[];
	unsupportedBySession: Map<string, number>;
};

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
): {
	files: ArtifactFile[];
	unsupportedCount: number;
} {
	const enumeration = enumerateOwnerDirectory({
		dir: sessionDir,
		sessionId,
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
	return { files, unsupportedCount: enumeration.unsupportedCount };
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
	let latestChangeMs = 0;
	for (const session of input.sessions) {
		const base =
			session.location === "archived"
				? join(wb, "_archive", session.session_id)
				: join(wb, session.session_id);
		const directory = assertSafeArtifactDirectory(base);
		const { files, unsupportedCount } = artifactFiles(base, session.session_id);
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
	readBudget: { bytes: number };
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
				maxBytes: Math.min(MAX_RANGE_BYTES, remaining),
			});
			if (read.page.byte_end === read.page.byte_start) {
				warnings.push(`empty_range:${file.name}`);
				continue;
			}
			input.readBudget.bytes -= read.rawBytes.byteLength;
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
				read.redactionStatus === "complete"
			) {
				const wholeSource = readArtifactSafeSource({
					root: input.root,
					ownerDir,
					relativePath: file.name,
					label: "session artifact",
					expectedBytes: file.bytes,
				});
				if (
					wholeSource.redactionStatus === "complete" &&
					wholeSource.content !== undefined
				) {
					if (wholeSource.sourceIdentityDigest !== read.sourceIdentityDigest)
						throw new ArtifactSourceChangedError();
					anchor = excerpt(wholeSource.content).anchor;
					contentDigest = wholeSource.rawDigest;
					digestScope = "artifact";
					sourceIdentityDigest = undefined;
					excerptContent = wholeSource.content;
				}
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
		if (input.readBudget.bytes < file.bytes) {
			warnings.push(`skipped_page_read_budget:${file.name}`);
			continue;
		}
		const content =
			readBoundedSourceFile(file.path, "session artifact", {
				maxBytes: MAX_ARTIFACT_BYTES,
				maxLines: 20_000,
				maxCandidates: 50_000,
			}) ?? "";
		input.readBudget.bytes -= file.bytes;
		const displayed = excerpt(content);
		artifacts.push({
			session_id: input.session.session_id,
			path: relative(input.root, file.path).replaceAll("\\", "/"),
			anchor: displayed.anchor,
			content_digest: digest(content),
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
	};
	search?: {
		matches: RecordSearchMatch[];
		scanned_bytes: number;
		work_bytes: number;
		work_budget_bytes: number;
		coverage: "complete" | "partial";
		partial_reason?:
			| "work_budget"
			| "redaction_context"
			| "unsupported_entries";
		withheld_files: number;
		matches_truncated: boolean;
	};
} {
	if (!OWNER_ID_RE.test(input.recordId))
		throw new Error("standalone record id is invalid");
	if (input.artifacts?.length && input.search !== undefined)
		throw new Error("record artifact read and search cannot be combined");
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
	const enumeration = enumerateOwnerDirectory({ dir: recordDir });
	const baseCoverage = {
		total: enumeration.files.length,
		unsupported_count: enumeration.unsupportedCount,
		targeted: Boolean(input.artifacts?.length || input.search !== undefined),
	};
	if (input.search !== undefined) {
		const matches: RecordSearchMatch[] = [];
		let scannedBytes = 0;
		let workBytes = 0;
		let withheldFiles = 0;
		let partialReason:
			| "work_budget"
			| "redaction_context"
			| "unsupported_entries"
			| undefined;
		let matchesTruncated = false;
		for (const file of enumeration.files) {
			if (file.bytes > MAX_REDACTION_CONTEXT_BYTES) {
				withheldFiles += 1;
				partialReason = "redaction_context";
				continue;
			}
			const estimatedWork = file.bytes * 2;
			if (workBytes + estimatedWork > MAX_RECORD_SEARCH_BYTES) {
				partialReason = "work_budget";
				break;
			}
			const safe = readArtifactSafeSource({
				root: input.root,
				ownerDir: recordDir,
				relativePath: file.name,
				label: "record artifact",
				expectedBytes: file.bytes,
			});
			workBytes += safe.scannedBytes;
			if (safe.redactionStatus !== "complete" || safe.content === undefined) {
				withheldFiles += 1;
				partialReason = "redaction_context";
				continue;
			}
			if (safe.sourceBytes !== file.bytes)
				throw new ArtifactSourceChangedError();
			scannedBytes += safe.sourceBytes;
			workBytes += safe.sourceBytes;
			let position = safe.content.indexOf(input.search);
			while (position >= 0) {
				if (matches.length >= MAX_RECORD_SEARCH_MATCHES) {
					matchesTruncated = true;
					partialReason = "work_budget";
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
			if (matchesTruncated) break;
		}
		if (enumeration.unsupportedCount > 0)
			partialReason ??= "unsupported_entries";
		const coverage = partialReason ? "partial" : "complete";
		return {
			read_only: true,
			owner: { kind: "record", id: input.recordId },
			files: [],
			artifacts: [],
			coverage: {
				status: coverage,
				complete: coverage === "complete",
				...baseCoverage,
				returned: 0,
				omitted: 0,
			},
			search: {
				matches,
				scanned_bytes: scannedBytes,
				work_bytes: workBytes,
				work_budget_bytes: MAX_RECORD_SEARCH_BYTES,
				coverage,
				...(partialReason ? { partial_reason: partialReason } : {}),
				withheld_files: withheldFiles,
				matches_truncated: matchesTruncated,
			},
		};
	}
	if (input.artifacts?.length) {
		const artifacts: RecordArtifactView[] = [];
		for (const selector of input.artifacts) {
			const file = selectRecordArtifactFile(enumeration.files, selector);
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
			verifyArtifactReference(input.root, reference);
			artifacts.push({
				...reference,
				bytes: file.bytes,
				excerpt: displayed.excerpt,
				page: { ...read.page, redaction_status: read.redactionStatus },
			});
		}
		const status =
			enumeration.unsupportedCount > 0 ||
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
				...baseCoverage,
				returned: artifacts.length,
				omitted: 0,
			},
		};
	}
	const selected = enumeration.files.slice(0, limit);
	const omitted = enumeration.files.length - selected.length;
	const status =
		omitted > 0 || enumeration.unsupportedCount > 0 ? "partial" : "complete";
	return {
		read_only: true,
		owner: { kind: "record", id: input.recordId },
		files: selected.map((file) => ({ path: file.name, bytes: file.bytes })),
		artifacts: [],
		coverage: {
			status,
			complete: status === "complete",
			...baseCoverage,
			returned: selected.length,
			omitted,
		},
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
	status: "progress" | "complete" | "source_changed";
	page: {
		offset: number;
		limit: number;
		returned: number;
		total: number;
		has_more: boolean;
	};
	cursor: string;
	projection_health: { database: "present" | "absent"; inspected: false };
	coverage: "complete" | "bounded_page" | "source_changed";
	removed_or_untracked_changes: boolean;
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
	let status: "progress" | "complete" | "source_changed" = "progress";
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
				status: "complete",
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
				coverage: "complete",
				removed_or_untracked_changes: false,
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
				: hasMore
					? "bounded_page"
					: "complete",
		removed_or_untracked_changes: changedWithoutArtifact,
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
	const enumeration = enumerateOwnerDirectory({
		dir: ownerDir,
		...(ownerKind === "session" ? { sessionId: ownerId } : {}),
	});
	if (!enumeration.files.some((file) => file.name === fromOwner))
		throw new Error(
			"proposal evidence path is not part of the owner artifact inventory",
		);
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
	const text = readBoundedSourceFile(resolved, "proposal evidence artifact", {
		maxBytes: MAX_ARTIFACT_BYTES,
		maxLines: 20_000,
		maxCandidates: 50_000,
	});
	if (text === null || digest(text) !== reference.content_digest)
		throw new Error(`proposal evidence source changed: ${referencePath}`);
	const lineAnchor = /^line:(\d+)$/.exec(reference.anchor);
	if (
		!lineAnchor ||
		Number(lineAnchor[1]) < 1 ||
		Number(lineAnchor[1]) > text.split(/\r?\n/).length
	)
		throw new Error(`proposal evidence anchor is invalid: ${referencePath}`);
}
