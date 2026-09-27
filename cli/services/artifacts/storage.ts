/**
 * Durable artifact capture. Routing is explicit: a valid `--session` targets
 * that session's supplementary `artifacts/` directory, a valid `--record`
 * targets a standalone record, `--standalone` starts a new record, an
 * explicitly inherited AFOL_SESSION may target that session, and anything
 * else starts a new record. The global, latest, or merely open session is
 * never chosen for the writer. Capture creates no session, plan, task, spec,
 * or closure and never opens the evolution database.
 */

import { randomUUID } from "node:crypto";
import {
	closeSync,
	existsSync,
	fsyncSync,
	linkSync,
	lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	unlinkSync,
	writeSync,
} from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { syncDirectoryDurablyIfSupported } from "../io/durable-sync";
import { readBoundedSourceFile } from "../io/safe-source";
import { resolveProjectPaths } from "../project/paths";
import { resolveProjectWritePath } from "../project/root";
import { digestBytes, OWNER_ID_RE, resolveRecordDirectory, stableJson } from "./inventory";
import {
	ARTIFACT_SAVE_KINDS,
	type ArtifactOwner,
	type ArtifactSaveKind,
	type ArtifactSaveReceipt,
} from "./types";

const MAX_CAPTURE_BYTES = 256 * 1024;
const MAX_TITLE_CHARS = 200;
const MAX_RECEIPT_BYTES = 4_096;
const SESSION_TASK_FILE = (session: string) => `${session}_task_01.md`;
const SAVE_KINDS = new Set<string>(ARTIFACT_SAVE_KINDS);

export type SaveArtifactInput = {
	root: string;
	kind: string;
	/** Inline body from `--text`. */
	text?: string;
	/** Project-relative or root-absolute source file from `--file`. */
	file?: string;
	title?: string;
	session?: string;
	record?: string;
	standalone?: boolean;
	/** Explicitly inherited AFOL_SESSION; never a global or context fallback. */
	envSession?: string;
	requestId?: string;
	now?: Date;
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
	if (input.standalone === true) return { kind: "record", id: `R-${randomUUID()}` };
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
		"---",
		"",
	].join("\n");
	const body = input.body.endsWith("\n") ? input.body : `${input.body}\n`;
	return `${frontmatter}\n${body}`;
}

function readSourceContent(input: SaveArtifactInput): string {
	if ((input.text !== undefined) === (input.file !== undefined))
		fail(
			"invalid-input",
			"exactly one of --text or --file is required",
		);
	if (input.text !== undefined) {
		if (Buffer.byteLength(input.text, "utf8") > MAX_CAPTURE_BYTES)
			fail("invalid-input", `--text exceeds ${MAX_CAPTURE_BYTES} bytes`);
		if (input.text.trim().length === 0) fail("invalid-input", "--text is empty");
		return input.text;
	}
	const sourcePath = resolve(input.root, input.file as string);
	const fromRoot = relative(input.root, sourcePath);
	if (fromRoot.startsWith("..") || fromRoot === "")
		fail("invalid-input", "--file must stay inside the project root");
	const safe = resolveProjectWritePath(input.root, fromRoot.replaceAll("\\", "/"));
	if (!safe.ok) fail("invalid-input", safe.error);
	const text = readBoundedSourceFile(safe.value.path, "artifact source", {
		maxBytes: MAX_CAPTURE_BYTES,
		maxLines: 20_000,
		maxCandidates: 50_000,
	});
	if (text === null) fail("invalid-input", "--file is missing or unreadable");
	if (text.trim().length === 0) fail("invalid-input", "--file is empty");
	return text;
}

function payloadIdentity(input: {
	kind: string;
	bodyDigest: string;
}): string {
	return digestBytes(
		stableJson({
			kind: input.kind,
			body_digest: input.bodyDigest,
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

function readMarker(path: string): Record<string, unknown> | null {
	let raw: string;
	try {
		raw = readFileSync(path, "utf8");
	} catch {
		return null;
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

function writeMarkerExclusive(
	path: string,
	payload: Record<string, unknown>,
): void {
	mkdirSync(dirname(path), { recursive: true });
	const buffer = Buffer.from(`${JSON.stringify(payload)}\n`, "utf8");
	const fd = openSync(path, "wx");
	try {
		writeSync(fd, buffer);
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
}

function writeAll(fd: number, buffer: Buffer): void {
	let offset = 0;
	while (offset < buffer.byteLength) {
		const written = writeSync(fd, buffer, offset, buffer.byteLength - offset);
		if (written <= 0) throw new Error("artifact write made no progress");
		offset += written;
	}
}

/**
 * Publish the document exclusively: a crash before publication leaves only a
 * dot-prefixed temporary file that the inventory never presents; publication
 * uses link(2), which cannot overwrite another agent's file.
 */
function publishExclusively(dir: string, fileName: string, content: string) {
	try {
		mkdirSync(dir, { recursive: true });
	} catch (error) {
		fail(
			"unsafe-destination",
			`artifact destination directory is unavailable: ${(error as Error).message}`,
		);
	}
	const finalPath = join(dir, fileName);
	const tempPath = join(dir, `.${fileName}.${process.pid}.tmp`);
	const buffer = Buffer.from(content, "utf8");
	const fd = openSync(tempPath, "wx");
	try {
		writeAll(fd, buffer);
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
	try {
		linkSync(tempPath, finalPath);
	} catch (error) {
		unlinkSync(tempPath);
		if (
			typeof error === "object" &&
			error !== null &&
			(error as { code?: unknown }).code === "EEXIST"
		)
			fail(
				"destination-exists",
				`artifact destination already exists: ${fileName}; retry to publish under a new id`,
			);
		throw error;
	}
	unlinkSync(tempPath);
	syncDirectoryDurablyIfSupported(dir);
	return { finalPath, buffer };
}

/** Save one durable artifact and return the bounded receipt. */
export function saveArtifact(input: SaveArtifactInput): ArtifactSaveReceipt {
	if (!SAVE_KINDS.has(input.kind))
		fail(
			"invalid-kind",
			`unsupported artifact kind: ${input.kind}; use one of ${ARTIFACT_SAVE_KINDS.join(", ")}`,
		);
	const body = readSourceContent(input);
	const identity = payloadIdentity({
		kind: input.kind,
		bodyDigest: digestBytes(body),
	});

	// Resolve a prior request intention before minting any destination so a
	// replay returns the original receipt and a different payload conflicts
	// before any write.
	const marker =
		input.requestId !== undefined
			? readMarker(markerPath(input.root, input.requestId))
			: null;
	const replayReceipt =
		marker !== null && marker.receipt !== null && typeof marker.receipt === "object"
			? (marker.receipt as ArtifactSaveReceipt)
			: undefined;
	const owner = routeOwner(
		input,
		marker !== undefined ? replayReceipt?.owner : undefined,
	);
	if (marker !== null) {
		if (marker.payload_identity !== identity)
			fail(
				"request-conflict",
				"--request-id was already used for a different artifact payload",
			);
		if (replayReceipt === undefined)
			fail(
				"request-marker-corrupt",
				"saved request marker has no receipt; inspect it before saving again",
			);
		if (
			(input.session !== undefined &&
				!(owner.kind === "session" && owner.id === input.session.trim())) ||
			(input.record !== undefined &&
				!(owner.kind === "record" && owner.id === input.record.trim()))
		)
			fail(
				"request-conflict",
				"--request-id was already used for a different destination",
			);
		return { ...replayReceipt, persisted: true, duplicate: true };
	}

	const now = input.now ?? new Date();
	const createdAt = now.toISOString();
	const artifactId = `A-${randomUUID()}`;
	const destination = destinationFor({
		root: input.root,
		owner,
		artifactId,
		kind: input.kind,
	});
	const relativePath = `${destination.relativeDir}/${destination.fileName}`
		.replaceAll("\\", "/")
		.replace(/^\.\//, "");
	const document = buildDocument({
		artifactId,
		owner,
		kind: input.kind,
		...(input.title !== undefined ? { title: sanitizeTitle(input.title) } : {}),
		createdAt,
		body,
	});
	const contentDigest = digestBytes(document);

	const receipt: ArtifactSaveReceipt = {
		persisted: true,
		duplicate: false,
		artifact_id: artifactId,
		owner,
		path: relativePath,
		content_digest: contentDigest,
		bytes: Buffer.byteLength(document, "utf8"),
		created_at: createdAt,
		...(input.requestId !== undefined ? { request_id: input.requestId } : {}),
		index: { status: "ok" },
	};
	if (Buffer.byteLength(JSON.stringify(receipt), "utf8") > MAX_RECEIPT_BYTES)
		fail("invalid-input", "artifact receipt exceeds the bounded size");

	publishExclusively(destination.dir, destination.fileName, document);

	// Validate the durable result before reporting success: the published file
	// must be a safe source whose bytes match exactly what was written.
	const readBack = readBoundedSourceFile(
		join(destination.dir, destination.fileName),
		"saved artifact",
		{ maxBytes: MAX_CAPTURE_BYTES, maxLines: 20_000, maxCandidates: 50_000 },
	);
	if (readBack === null || digestBytes(readBack) !== contentDigest)
		fail(
			"integrity-error",
			"saved artifact failed read-back validation; inspect it before retrying",
		);

	if (input.requestId !== undefined) {
		try {
			writeMarkerExclusive(markerPath(input.root, input.requestId), {
				request_id: input.requestId,
				payload_identity: identity,
				receipt,
			});
		} catch (error) {
			if (
				typeof error === "object" &&
				error !== null &&
				(error as { code?: unknown }).code === "EEXIST"
			) {
				const raced = readMarker(markerPath(input.root, input.requestId));
				if (raced?.payload_identity === identity)
					return { ...receipt, duplicate: true };
			}
			// The durable write stands; only the replay marker is pending.
			receipt.index = {
				status: "pending",
				detail: `request marker unavailable: ${(error as Error).message}`.slice(
					0,
					200,
				),
			};
		}
	}
	return receipt;
}
