import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, realpathSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
	assertSafeSourceFile,
	readBoundedSourceFile,
	readBoundedSourceRange,
} from "../io/safe-source";
import { readProjectConfig, resolveProjectPaths } from "../project/paths";
import { evolutionDbPath } from "./db";
import { enumerateEvolutionHistorySessions } from "./history-sessions";
import { redactImported } from "./imports/redaction";
import { resolveEvolutionConfig } from "./runtime-config";

const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 10;
const MAX_DEFAULT_ARTIFACTS_PER_SESSION = 3;
const MAX_SESSION_ARTIFACTS = 4_096;
const MAX_ARTIFACT_BYTES = 256 * 1024;
const MAX_RANGE_BYTES = 8 * 1024;
const MAX_TOTAL_READ_BYTES = 512 * 1024;
const MAX_EXCERPT_CHARS = 450;
const CURSOR_VERSION = 2;
const SESSION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const ARTIFACT_KINDS = new Set([
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

function canonicalArtifactKind(name: string, sessionId: string): string | null {
	if (name === ".evidence.jsonl") return "evidence";
	const escaped = sessionId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = new RegExp(`^${escaped}_(.+)_([0-9]+)\\.md$`, "i").exec(name);
	const kind = match?.[1]?.toLowerCase();
	return kind && ARTIFACT_KINDS.has(kind) ? kind : null;
}

function artifactFiles(
	sessionDir: string,
	sessionId: string,
): {
	files: ArtifactFile[];
	unsupportedCount: number;
} {
	const names = readdirSync(sessionDir, { withFileTypes: true });
	if (names.length > MAX_SESSION_ARTIFACTS)
		throw new Error(
			`session ${sessionId} exceeds the bounded artifact inventory; select a specific artifact`,
		);
	const files: ArtifactFile[] = [];
	let unsupportedCount = 0;
	for (const entry of names) {
		if (!entry.isFile()) {
			if (entry.name.endsWith(".md") || entry.name.endsWith(".log"))
				unsupportedCount += 1;
			continue;
		}
		if (!canonicalArtifactKind(entry.name, sessionId)) {
			if (/\.(?:md|log|txt|jsonl)$/i.test(entry.name)) unsupportedCount += 1;
			continue;
		}
		const path = join(sessionDir, entry.name);
		const stat = assertSafeSourceFile(path, "session artifact");
		if (!stat) continue;
		files.push({
			name: entry.name,
			path,
			bytes: Number(stat.size),
			mtime_ms: Number(stat.mtimeMs),
			ctime_ms: Number(stat.ctimeMs),
			dev: String(stat.dev),
			ino: String(stat.ino),
		});
	}
	files.sort((left, right) => {
		const score = (name: string) =>
			name === ".evidence.jsonl"
				? 0
				: name.includes("_task_")
					? 1
					: name.includes("_report_")
						? 2
						: name.includes("_log_")
							? 3
							: 4;
		return (
			score(left.name) - score(right.name) ||
			left.name.localeCompare(right.name)
		);
	});
	return { files, unsupportedCount };
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

function excerpt(content: string): { anchor: string; excerpt: string } {
	const normalized = content.replaceAll("\r\n", "\n");
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
	const safe = redactImported(selected);
	return {
		anchor: `line:${index + 1}`,
		excerpt: (typeof safe === "string" ? safe : "[redacted]").slice(
			0,
			MAX_EXCERPT_CHARS,
		),
	};
}

function artifactListForSession(input: {
	root: string;
	session: { session_id: string; location: "live" | "archived" };
	files: ArtifactFile[];
	artifactSelectors?: readonly string[];
	byteOffset?: number;
	readBudget: { bytes: number };
}): {
	artifacts: Array<ArtifactReference & { bytes: number; excerpt: string }>;
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
		candidates = selectors.map((selector) => {
			const byName = input.files.find((file) => file.name === selector);
			const byPath = input.files.find(
				(file) =>
					relative(input.root, file.path).replaceAll("\\", "/") === selector,
			);
			const file = byName ?? byPath;
			if (!file)
				throw new Error(
					`unsupported or missing artifact selector for ${input.session.session_id}: ${selector}; supported names are session-prefixed plan, research, handoff, analysis, review, findings, report, log, task, postmortem, retrospective, or .evidence.jsonl`,
				);
			return file;
		});
	}
	const defaultCandidates = candidates.slice(
		0,
		selectors?.length ? selectors.length : MAX_DEFAULT_ARTIFACTS_PER_SESSION,
	);
	const omittedFiles = selectors?.length
		? []
		: candidates.slice(defaultCandidates.length);
	const artifacts: Array<
		ArtifactReference & { bytes: number; excerpt: string }
	> = [];
	const warnings: string[] = [];
	for (const file of defaultCandidates) {
		if (file.bytes > MAX_ARTIFACT_BYTES && !selectors?.includes(file.name)) {
			warnings.push(
				`skipped_size_limit:${file.name}; retrieve with --session ${input.session.session_id} --artifact ${file.name}`,
			);
			continue;
		}
		let content: string;
		let reference: ArtifactReference;
		if (
			selectors?.length &&
			(input.byteOffset !== undefined || file.bytes > MAX_ARTIFACT_BYTES)
		) {
			const offset = input.byteOffset ?? 0;
			const remaining = input.readBudget.bytes;
			if (remaining < 1) {
				warnings.push(`skipped_page_read_budget:${file.name}`);
				continue;
			}
			const range = readBoundedSourceRange(file.path, "session artifact", {
				offset,
				maxBytes: Math.min(MAX_RANGE_BYTES, remaining),
			});
			if (range.bytes.byteLength === 0) {
				warnings.push(`empty_range:${file.name}`);
				continue;
			}
			input.readBudget.bytes -= range.bytes.byteLength;
			content = range.bytes.toString("utf8");
			reference = {
				session_id: input.session.session_id,
				path: relative(input.root, file.path).replaceAll("\\", "/"),
				anchor: `bytes:${offset}-${offset + range.bytes.byteLength}`,
				content_digest: digest(range.bytes),
				digest_scope: "range",
				source_identity_digest: digest(stableJson(range.sourceIdentity)),
			};
		} else {
			if (input.readBudget.bytes < file.bytes) {
				warnings.push(`skipped_page_read_budget:${file.name}`);
				continue;
			}
			content =
				readBoundedSourceFile(file.path, "session artifact", {
					maxBytes: MAX_ARTIFACT_BYTES,
					maxLines: 20_000,
					maxCandidates: 50_000,
				}) ?? "";
			input.readBudget.bytes -= file.bytes;
			const displayed = excerpt(content);
			reference = {
				session_id: input.session.session_id,
				path: relative(input.root, file.path).replaceAll("\\", "/"),
				anchor: displayed.anchor,
				content_digest: digest(content),
				digest_scope: "artifact",
			};
		}
		const displayed = excerpt(content);
		artifacts.push({
			...reference,
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

export function inspectEvolutionArtifacts(input: {
	root: string;
	sessions?: readonly string[];
	artifacts?: readonly string[];
	byteOffset?: number;
	cursor?: string;
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
		artifacts: Array<ArtifactReference & { bytes: number; excerpt: string }>;
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

/** Verify an emitted artifact reference without opening the evolution database. */
export function verifyArtifactReference(
	root: string,
	reference: ArtifactReference,
): void {
	if (
		!SESSION_ID_RE.test(reference.session_id) ||
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
	if (reference.path.startsWith("/") || reference.path.includes("\\"))
		throw new Error("proposal evidence path is not canonical");
	const location = enumerateEvolutionHistorySessions(root).sessions.find(
		(entry) => entry.session_id === reference.session_id,
	);
	if (!location)
		throw new Error(
			`proposal evidence session is missing or conflicted: ${reference.session_id}`,
		);
	const paths = resolveProjectPaths(root);
	const sessionDir =
		location.location === "archived"
			? join(paths.abs.wbDir, "_archive", location.session_id)
			: join(paths.abs.wbDir, location.session_id);
	const resolved = resolve(root, reference.path);
	const projectPath = relative(root, resolved).replaceAll("\\", "/");
	const fromSession = relative(sessionDir, resolved);
	if (
		projectPath !== reference.path ||
		fromSession.startsWith("..") ||
		!fromSession
	)
		throw new Error("proposal evidence path is outside its selected session");
	if (!canonicalArtifactKind(fromSession, location.session_id))
		throw new Error(
			"proposal evidence path is not a supported canonical artifact",
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
			throw new Error(`proposal evidence source changed: ${reference.path}`);
		return;
	}
	const text = readBoundedSourceFile(resolved, "proposal evidence artifact", {
		maxBytes: MAX_ARTIFACT_BYTES,
		maxLines: 20_000,
		maxCandidates: 50_000,
	});
	if (text === null || digest(text) !== reference.content_digest)
		throw new Error(`proposal evidence source changed: ${reference.path}`);
	const lineAnchor = /^line:(\d+)$/.exec(reference.anchor);
	if (
		!lineAnchor ||
		Number(lineAnchor[1]) < 1 ||
		Number(lineAnchor[1]) > text.split(/\r?\n/).length
	)
		throw new Error(`proposal evidence anchor is invalid: ${reference.path}`);
}
