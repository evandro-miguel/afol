/**
 * Durable artifact capture. Routing is explicit: a valid `--session` targets
 * that session's supplementary `artifacts/` directory, a valid `--record`
 * targets a standalone record, `--standalone` starts a new record, an
 * explicitly inherited AFOL_SESSION may target that session, and anything
 * else starts a new record. The global, latest, or merely open session is
 * never chosen for the writer. Capture creates no session, plan, task, spec,
 * or closure and never opens the evolution database.
 */

import { isUtf8 } from "node:buffer";
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { readBoundedSourceRange } from "../io/safe-source";
import { withResourceLocks } from "../io/session-lock";
import { resolveArtifactProjectPaths as resolveProjectPaths } from "../project/paths";
import { resolveProjectWritePath } from "../project/root";
import { CaptureDirectory } from "./capture-directory";
import {
	digestBytes,
	OWNER_ID_RE,
	resolveRecordDirectory,
	stableJson,
} from "./inventory";
import {
	ARTIFACT_SAVE_KINDS,
	type ArtifactOwner,
	type ArtifactSaveReceipt,
} from "./types";

const MAX_CAPTURE_BYTES = 256 * 1024;
const MAX_TITLE_CHARS = 200;
const MAX_RECEIPT_BYTES = 4_096;
const SESSION_TASK_FILE = (session: string) => `${session}_task_01.md`;
const SAVE_KINDS = new Set<string>(ARTIFACT_SAVE_KINDS);
const SOURCE_LIMITS = {
	maxBytes: MAX_CAPTURE_BYTES,
	maxLines: 20_000,
	maxCandidates: 50_000,
};

export type ArtifactSaveHooks = {
	afterIntent?: () => void;
	afterPublication?: () => void;
	afterTempOpen?: (fd: number) => void;
	beforeCompletion?: () => void;
};

export type SaveArtifactInput = {
	root: string;
	kind: string;
	/** Inline body from `--text`. */
	text?: string;
	/** Project-relative or root-absolute source file from `--file`. */
	file?: string;
	/** Confirm an explicit source copy; requires an owner and request id. */
	expectedSourceDigest?: string;
	title?: string;
	session?: string;
	record?: string;
	standalone?: boolean;
	/** Explicitly inherited AFOL_SESSION; never a global or context fallback. */
	envSession?: string;
	requestId?: string;
	now?: Date;
};

type PreparedSaveInput = SaveArtifactInput & {
	source?: { path: string; content_digest: string; preserved: true };
};

export class ArtifactSaveError extends Error {
	readonly code: string;

	constructor(code: string, message: string) {
		super(message);
		this.code = code;
	}
}

function fail(code: string, message: string): never {
	throw new ArtifactSaveError(code, message);
}

function isRealDirectory(path: string): boolean {
	try {
		return lstatSync(path).isDirectory();
	} catch {
		return false;
	}
}

/**
 * Validate a session selector. Live sessions (open or closed) accept a new
 * supplementary revision; archived sessions are immutable, and a missing or
 * task-less directory is an invalid target rather than a silent fallback.
 */
function resolveSessionOwner(root: string, session: string): ArtifactOwner {
	const id = session.trim();
	if (!OWNER_ID_RE.test(id))
		fail("invalid-session", `invalid session selector: ${session}`);
	const paths = resolveProjectPaths(root);
	const live = resolveProjectWritePath(root, `${paths.wbDir}/${id}`);
	const archived = resolveProjectWritePath(
		root,
		`${paths.wbDir}/_archive/${id}`,
	);
	const liveExists = live.ok && isRealDirectory(live.value.path);
	const archivedExists = archived.ok && isRealDirectory(archived.value.path);
	if (liveExists && archivedExists)
		fail(
			"duplicate-owner",
			`session id exists live and archived: ${id}; resolve the conflict before saving`,
		);
	if (archivedExists)
		fail(
			"archived-session",
			`session is archived and immutable: ${id}; save a standalone record related to it instead`,
		);
	if (!liveExists) fail("invalid-session", `unknown session selector: ${id}`);
	const taskPath = join(live.value.path, SESSION_TASK_FILE(id));
	if (!existsSync(taskPath))
		fail(
			"invalid-session",
			`session is missing its task file: ${id}; cannot validate its state`,
		);
	return { kind: "session", id };
}

function routeOwner(
	input: SaveArtifactInput,
	replayOwner?: ArtifactOwner,
): ArtifactOwner {
	const explicitSelectors = [
		input.session !== undefined,
		input.record !== undefined,
		input.standalone === true,
	].filter(Boolean).length;
	if (explicitSelectors > 1)
		fail(
			"incompatible-selectors",
			"use at most one of --session, --record, or --standalone",
		);
	if (input.session !== undefined)
		return resolveSessionOwner(input.root, input.session);
	if (input.record !== undefined) {
		const id = input.record.trim();
		resolveRecordDirectory(input.root, id);
		return { kind: "record", id };
	}
	// A pending replay keeps its original destination so a repeated request
	// can never be redirected by an implicit variable or a fresh record id.
	if (replayOwner !== undefined) {
		if (input.standalone === true && replayOwner.kind !== "record")
			fail(
				"request-conflict",
				"--standalone cannot replay a request that targeted a session",
			);
		return replayOwner;
	}
	if (input.standalone === true)
		return { kind: "record", id: `R-${randomUUID()}` };
	if (input.envSession !== undefined && input.envSession.trim().length > 0)
		return resolveSessionOwner(input.root, input.envSession);
	return { kind: "record", id: `R-${randomUUID()}` };
}

function destinationFor(input: {
	root: string;
	owner: ArtifactOwner;
	artifactId: string;
	kind: string;
}): { dir: string; relativeDir: string; fileName: string } {
	const paths = resolveProjectPaths(input.root);
	const relativeDir =
		input.owner.kind === "session"
			? `${paths.wbDir}/${input.owner.id}/artifacts`
			: `${paths.recordsDir}/${input.owner.id}`;
	const resolved = resolveProjectWritePath(input.root, relativeDir);
	if (!resolved.ok) fail("unsafe-destination", resolved.error);
	return {
		dir: resolved.value.path,
		relativeDir,
		fileName: `${input.artifactId}-${input.kind}.md`,
	};
}

function sanitizeTitle(title: string): string {
	const singleLine = title
		.replaceAll(/[\r\n\t]+/g, " ")
		.replace(/\p{C}/gu, "")
		.trim();
	return singleLine.slice(0, MAX_TITLE_CHARS);
}

function buildDocument(input: {
	artifactId: string;
	owner: ArtifactOwner;
	kind: string;
	title?: string;
	createdAt: string;
	body: string;
	source?: PreparedSaveInput["source"];
}): string {
	const frontmatter = [
		"---",
		"schema_version: 1",
		'doc_type: "work_artifact"',
		`id: "${input.artifactId}"`,
		"owner:",
		`  kind: "${input.owner.kind}"`,
		`  id: "${input.owner.id}"`,
		`kind: "${input.kind}"`,
		...(input.title !== undefined
			? [`title: ${JSON.stringify(input.title)}`]
			: []),
		`created_at: "${input.createdAt}"`,
		...(input.source
			? [
					"source:",
					`  path: ${JSON.stringify(input.source.path)}`,
					`  content_digest: "${input.source.content_digest}"`,
					"  preserved: true",
				]
			: []),
		"---",
		"",
	].join("\n");
	const body = input.body.endsWith("\n") ? input.body : `${input.body}\n`;
	return `${frontmatter}\n${body}`;
}

function readSourceContent(input: SaveArtifactInput): string {
	if ((input.text !== undefined) === (input.file !== undefined))
		fail("invalid-input", "exactly one of --text or --file is required");
	if (input.text !== undefined) {
		if (Buffer.byteLength(input.text, "utf8") > MAX_CAPTURE_BYTES)
			fail("invalid-input", `--text exceeds ${MAX_CAPTURE_BYTES} bytes`);
		if (input.text.trim().length === 0)
			fail("invalid-input", "--text is empty");
		return input.text;
	}
	const sourcePath = resolve(input.root, input.file as string);
	const fromRoot = relative(input.root, sourcePath);
	if (fromRoot.startsWith("..") || fromRoot === "")
		fail("invalid-input", "--file must stay inside the project root");
	const safe = resolveProjectWritePath(
		input.root,
		fromRoot.replaceAll("\\", "/"),
	);
	if (!safe.ok) fail("invalid-input", safe.error);
	const source = readBoundedSourceRange(safe.value.path, "artifact source", {
		offset: 0,
		maxBytes: MAX_CAPTURE_BYTES,
	});
	if (source.totalBytes > MAX_CAPTURE_BYTES)
		fail("invalid-input", `--file exceeds ${MAX_CAPTURE_BYTES} bytes`);
	if (source.bytes.length !== source.totalBytes)
		fail("source-changed", "source snapshot is incomplete");
	if (
		input.expectedSourceDigest !== undefined &&
		digestBytes(source.bytes) !== input.expectedSourceDigest
	)
		fail(
			"source-changed",
			"source digest does not match the confirmed file snapshot",
		);
	if (!isUtf8(source.bytes))
		fail("invalid-input", "artifact source must contain valid UTF-8");
	const text = source.bytes.toString("utf8");
	if (text.trim().length === 0) fail("invalid-input", "--file is empty");
	return text;
}

function payloadIdentity(input: {
	kind: string;
	bodyDigest: string;
	title?: string;
	destination: string;
	source?: PreparedSaveInput["source"];
}): string {
	return digestBytes(
		stableJson({
			kind: input.kind,
			body_digest: input.bodyDigest,
			title: input.title ?? null,
			destination: input.destination,
			...(input.source ? { source: input.source } : {}),
		}),
	);
}

function markerPath(root: string, requestId: string): string {
	const paths = resolveProjectPaths(root);
	const relativePath = `${paths.mutableDir}/state/artifact-save-receipts/${digestBytes(requestId)}.json`;
	const resolved = resolveProjectWritePath(root, relativePath);
	if (!resolved.ok) fail("unsafe-destination", resolved.error);
	return resolved.value.path;
}

function readMarker(
	root: string,
	path: string,
): Record<string, unknown> | null {
	const dir = CaptureDirectory.open(root, relative(root, dirname(path)), false);
	if (!dir) return null;
	let raw: string;
	try {
		const file = dir.read(basename(path), 12_288);
		if (!file) return null;
		raw = file.bytes.toString("utf8");
	} finally {
		dir.close();
	}
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
			throw new Error("not an object");
		return parsed as Record<string, unknown>;
	} catch {
		fail(
			"request-marker-corrupt",
			"saved request marker is unreadable; inspect it before saving again",
		);
	}
}

function validateDocument(document: string): void {
	const lines = document.split(/\r?\n/);
	const lineCount = lines.at(-1) === "" ? lines.length - 1 : lines.length;
	if (
		Buffer.byteLength(document, "utf8") > MAX_CAPTURE_BYTES ||
		lineCount > SOURCE_LIMITS.maxLines ||
		lines.filter((line) => line.trim()).length > SOURCE_LIMITS.maxCandidates
	)
		fail(
			"invalid-input",
			"final artifact document exceeds the safe source limit",
		);
}

function markerReceipt(
	marker: Record<string, unknown>,
	requestId: string,
): ArtifactSaveReceipt {
	const value = marker.receipt;
	if (
		marker.request_id !== requestId ||
		value === null ||
		typeof value !== "object" ||
		Array.isArray(value)
	)
		fail("request-marker-corrupt", "request marker has no valid receipt");
	const receipt = value as ArtifactSaveReceipt;
	if (
		!receipt.owner ||
		!["session", "record"].includes(receipt.owner.kind) ||
		typeof receipt.owner.id !== "string" ||
		!OWNER_ID_RE.test(receipt.owner.id) ||
		typeof receipt.artifact_id !== "string" ||
		!/^A-[a-f0-9-]{36}$/.test(receipt.artifact_id) ||
		typeof receipt.path !== "string" ||
		typeof receipt.content_digest !== "string" ||
		!/^[a-f0-9]{64}$/.test(receipt.content_digest) ||
		!Number.isSafeInteger(receipt.bytes) ||
		typeof receipt.created_at !== "string" ||
		!Number.isFinite(Date.parse(receipt.created_at))
	)
		fail("request-marker-corrupt", "request marker receipt fields are invalid");
	if (
		marker.state !== undefined &&
		marker.state !== "prepared" &&
		marker.state !== "committed"
	)
		fail("request-marker-corrupt", "request marker state is invalid");
	return receipt;
}

/** Recover only the exclusive publication temp owned by this verified request. */
function recoverPublicationTemp(
	dir: CaptureDirectory,
	name: string,
	document: string,
): void {
	const tempName = `.${name}.tmp`;
	const stat = dir.stat(tempName);
	if (!stat) return;
	const final = dir.stat(name);
	const paired =
		stat.nlink === 2 &&
		final?.isFile() &&
		stat.dev === final.dev &&
		stat.ino === final.ino;
	if (
		!stat.isFile() ||
		stat.size > MAX_CAPTURE_BYTES ||
		(!paired && (stat.nlink !== 1 || final))
	)
		fail(
			"integrity-error",
			"request publication temp integrity cannot be verified",
		);
	const file = dir.read(tempName, MAX_CAPTURE_BYTES, paired ? [2] : [1]);
	const expected = Buffer.from(document);
	if (!file) fail("integrity-error", "request publication temp is missing");
	if (
		!file.bytes.equals(expected.subarray(0, file.bytes.length)) ||
		(paired && file.bytes.length !== expected.length)
	)
		fail("integrity-error", "request publication temp integrity changed");
	dir.unlinkOwned(tempName, file.stat);
}

function saveLocked(
	input: PreparedSaveInput,
	body: string,
	markerFile: string | undefined,
	hooks: ArtifactSaveHooks,
): ArtifactSaveReceipt {
	const marker = markerFile ? readMarker(input.root, markerFile) : null;
	const prior = marker
		? markerReceipt(marker, input.requestId as string)
		: undefined;
	const owner = routeOwner(input, prior?.owner);
	const artifactId = prior?.artifact_id ?? `A-${randomUUID()}`;
	const createdAt =
		prior?.created_at ?? (input.now ?? new Date()).toISOString();
	const destination = destinationFor({
		root: input.root,
		owner,
		artifactId,
		kind: input.kind,
	});
	const title =
		input.title === undefined ? undefined : sanitizeTitle(input.title);
	const identity = payloadIdentity({
		kind: input.kind,
		bodyDigest: digestBytes(body),
		...(title === undefined ? {} : { title }),
		destination: destination.relativeDir,
		...(input.source ? { source: input.source } : {}),
	});
	const relativePath = `${destination.relativeDir}/${destination.fileName}`
		.replaceAll("\\", "/")
		.replace(/^\.\//, "");
	const document = buildDocument({
		artifactId,
		owner,
		kind: input.kind,
		...(title === undefined ? {} : { title }),
		createdAt,
		body,
		...(input.source ? { source: input.source } : {}),
	});
	validateDocument(document);
	const contentDigest = digestBytes(document);
	const legacyIdentity = digestBytes(
		stableJson({ kind: input.kind, body_digest: digestBytes(body) }),
	);
	if (
		marker &&
		marker.payload_identity !== identity &&
		!(marker.state === undefined && marker.payload_identity === legacyIdentity)
	)
		fail(
			"request-conflict",
			"--request-id was already used for a different artifact payload or destination",
		);
	if (
		prior &&
		(prior.path !== relativePath ||
			prior.owner.kind !== owner.kind ||
			prior.owner.id !== owner.id ||
			prior.content_digest !== contentDigest ||
			prior.bytes !== Buffer.byteLength(document, "utf8"))
	)
		fail(
			"request-conflict",
			"--request-id was already used for a different artifact payload or destination",
		);
	const receipt: ArtifactSaveReceipt = {
		persisted: true,
		duplicate: false,
		artifact_id: artifactId,
		owner,
		path: relativePath,
		content_digest: contentDigest,
		bytes: Buffer.byteLength(document, "utf8"),
		created_at: createdAt,
		...(input.requestId === undefined ? {} : { request_id: input.requestId }),
		index: {
			status: "not_requested",
			detail:
				"no secondary indexing is performed; read directly by receipt.path",
		},
		...(input.source ? { source: input.source } : {}),
	};
	if (Buffer.byteLength(JSON.stringify(receipt), "utf8") > MAX_RECEIPT_BYTES)
		fail("invalid-input", "artifact receipt exceeds the bounded size limit");
	const directory = CaptureDirectory.open(
		input.root,
		destination.relativeDir,
		true,
	);
	if (!directory)
		fail("unsafe-destination", "artifact destination unavailable");
	let markerDirectory: CaptureDirectory | null = null;
	try {
		if (markerFile)
			markerDirectory = CaptureDirectory.open(
				input.root,
				relative(input.root, dirname(markerFile)),
				true,
			);
		const writeState = (state: "prepared" | "committed") => {
			if (markerFile && markerDirectory)
				markerDirectory.writeAtomic(
					basename(markerFile),
					`${JSON.stringify({
						schema_version: 1,
						state,
						request_id: input.requestId,
						payload_identity: identity,
						receipt: {
							...receipt,
							persisted: state === "committed",
							request_state: state,
						},
					})}\n`,
				);
		};
		const complete = (duplicate: boolean): ArtifactSaveReceipt => {
			if (!markerFile) return { ...receipt, duplicate };
			try {
				hooks.beforeCompletion?.();
				writeState("committed");
			} catch {
				directory.assertAttached();
				return { ...receipt, duplicate, request_state: "prepared" };
			}
			directory.assertAttached();
			return { ...receipt, duplicate, request_state: "committed" };
		};
		if (prior && marker?.state === "prepared")
			recoverPublicationTemp(directory, destination.fileName, document);
		const existing = prior
			? directory.read(destination.fileName, MAX_CAPTURE_BYTES)
			: null;
		if (prior && (existing !== null || marker?.state !== "prepared")) {
			if (existing === null || digestBytes(existing.bytes) !== contentDigest)
				fail(
					"integrity-error",
					"saved artifact integrity no longer matches the request receipt",
				);
			return complete(true);
		}
		writeState("prepared");
		hooks.afterIntent?.();
		directory.publish(destination.fileName, document, hooks.afterTempOpen);
		hooks.afterPublication?.();
		const readBack = directory.read(destination.fileName, MAX_CAPTURE_BYTES);
		if (readBack === null || digestBytes(readBack.bytes) !== contentDigest)
			fail(
				"integrity-error",
				"saved artifact integrity failed read-back validation",
			);
		return complete(false);
	} finally {
		markerDirectory?.close();
		directory.close();
	}
}

/** Save one durable artifact and return the bounded, verified receipt. */
export function saveArtifact(
	input: SaveArtifactInput,
	hooks: ArtifactSaveHooks = {},
): ArtifactSaveReceipt {
	if (!SAVE_KINDS.has(input.kind))
		fail(
			"invalid-kind",
			`unsupported artifact kind: ${input.kind}; use one of ${ARTIFACT_SAVE_KINDS.join(", ")}`,
		);
	if (process.platform !== "linux")
		fail(
			"unsupported-platform",
			"durable artifact capture requires Linux directory handles; other platforms are experimental",
		);
	if (input.expectedSourceDigest !== undefined) {
		if (!/^[a-f0-9]{64}$/.test(input.expectedSourceDigest))
			fail("invalid-input", "source digest must be a lowercase SHA-256");
		if (input.file === undefined || input.text !== undefined)
			fail("invalid-input", "verified source copies require --file");
		if (
			(input.session === undefined) === (input.record === undefined) ||
			input.standalone === true
		)
			fail(
				"invalid-input",
				"verified source copies require one explicit --session or --record owner",
			);
		if (!input.requestId?.trim())
			fail(
				"invalid-input",
				"verified source copies require a stable --request-id",
			);
	}
	const body = readSourceContent(input);
	const prepared: PreparedSaveInput = { ...input };
	if (input.expectedSourceDigest !== undefined) {
		prepared.source = {
			path: relative(
				input.root,
				resolve(input.root, input.file as string),
			).replaceAll("\\", "/"),
			content_digest: input.expectedSourceDigest,
			preserved: true,
		};
	}
	resolveProjectPaths(input.root);
	if (input.requestId === undefined)
		return saveLocked(prepared, body, undefined, hooks);
	if (
		!input.requestId.trim() ||
		Buffer.byteLength(input.requestId, "utf8") > 512
	)
		fail("invalid-input", "request id must contain 1 to 512 bytes");
	const path = markerPath(input.root, input.requestId);
	return withResourceLocks(input.root, [path], () =>
		saveLocked(prepared, body, path, hooks),
	);
}
