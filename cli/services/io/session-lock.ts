import {
	closeSync,
	existsSync,
	fsyncSync,
	linkSync,
	mkdirSync,
	openSync,
	readFileSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { resolveProjectPaths } from "../project/paths";
import { resolveProjectWritePath } from "../project/root";

const SESSION_LOCK_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;
const LOCK_RETRY_MS = 25;
const LOCK_TIMEOUT_MS = 30_000;
const LOCK_STALE_AGE_MS = 30_000;
const LOCK_OWNERLESS_STALE_AGE_MS = 120_000;
const LOCK_WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4));
const heldLocks = new Map<string, number>();
const HOSTNAME = hostname().toLowerCase();

interface SessionLockMetadata {
	isParsed: boolean;
	pid?: number;
	acquiredAtMs: number | null;
	host?: string;
	raw: string | null;
	mtimeMs: number;
}

function sleepSync(ms: number): void {
	if (ms <= 0) {
		return;
	}
	if (typeof Atomics.wait === "function") {
		Atomics.wait(LOCK_WAIT_BUFFER, 0, 0, ms);
		return;
	}
	const deadline = Date.now() + ms;
	while (Date.now() < deadline) {}
}

function isAlreadyExistsError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "EEXIST"
	);
}

function assertSessionLockName(session: string): string {
	const normalized = session.trim();
	if (
		!SESSION_LOCK_RE.test(normalized) ||
		normalized.includes("..") ||
		normalized.length === 0
	) {
		throw new Error(`Invalid session identifier for lock: ${session}`);
	}
	return normalized;
}

export function resolveSessionLockPath(root: string, session: string): string {
	const normalized = assertSessionLockName(session);
	const projectPaths = resolveProjectPaths(root);
	const lockPath = join(projectPaths.wbDir, ".locks", `${normalized}.lock`);
	const resolved = resolveProjectWritePath(root, lockPath);
	if (!resolved.ok) {
		throw new Error(resolved.error);
	}
	return resolved.value.path;
}

function releaseHeldLock(lockPath: string): void {
	const count = heldLocks.get(lockPath) ?? 0;
	if (count <= 1) {
		heldLocks.delete(lockPath);
		return;
	}
	heldLocks.set(lockPath, count - 1);
}

function readExistingLockHint(lockPath: string): string {
	if (!existsSync(lockPath)) {
		return lockPath;
	}
	try {
		const raw = readFileSync(lockPath, "utf8");
		const parsed = parseLockMetadataText(raw);
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			Array.isArray(parsed)
		) {
			return lockPath;
		}
		const payload = parsed as {
			pid?: unknown;
			acquired_at?: unknown;
			host?: unknown;
		};
		const pid = typeof payload.pid === "number" ? ` pid=${payload.pid}` : "";
		const acquiredAt =
			typeof payload.acquired_at === "string"
				? ` acquired_at=${payload.acquired_at}`
				: "";
		const host =
			typeof payload.host === "string" ? ` host=${payload.host}` : "";
		return `${lockPath}${pid}${acquiredAt}${host}`;
	} catch {
		return lockPath;
	}
}

function parseLockMetadataText(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

function readLockMetadata(lockPath: string): SessionLockMetadata | null {
	try {
		const raw = readFileSync(lockPath, "utf8");
		const parsed = parseLockMetadataText(raw);
		const mtimeMs = statSync(lockPath).mtimeMs;
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			Array.isArray(parsed)
		) {
			return {
				acquiredAtMs: null,
				isParsed: false,
				raw: raw.trim().length > 0 ? raw : null,
				mtimeMs,
			};
		}
		const payload = parsed as {
			pid?: unknown;
			acquired_at?: unknown;
			host?: unknown;
		};
		const pidRaw = payload.pid;
		const pid =
			typeof pidRaw === "number" && Number.isInteger(pidRaw) && pidRaw > 0
				? pidRaw
				: undefined;
		const acquiredAtRaw = payload.acquired_at;
		const acquiredAtMs =
			typeof acquiredAtRaw === "string" &&
			Number.isFinite(Date.parse(acquiredAtRaw))
				? Date.parse(acquiredAtRaw)
				: null;
		const host =
			typeof payload.host === "string"
				? payload.host.trim().toLowerCase()
				: undefined;
		return {
			acquiredAtMs,
			...(host?.length ? { host } : {}),
			isParsed: true,
			...(pid !== undefined ? { pid } : {}),
			raw: raw,
			mtimeMs,
		};
	} catch {
		return null;
	}
}

function metadataSignature(metadata: SessionLockMetadata): string {
	return `${metadata.pid ?? ""}|${metadata.host ?? ""}|${
		metadata.acquiredAtMs ?? ""
	}|${metadata.raw ?? ""}|${metadata.mtimeMs}`;
}

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		if (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			(error as { code?: unknown }).code === "ESRCH"
		) {
			return false;
		}
		return true;
	}
}

function shouldRecoverStaleLock(
	lockPath: string,
	nowMs: number,
): SessionLockMetadata | null {
	const metadata = readLockMetadata(lockPath);
	if (metadata === null) {
		return null;
	}

	const mtimeAgeMs = nowMs - metadata.mtimeMs;
	if (metadata.isParsed && metadata.pid !== undefined) {
		if (metadata.host === undefined || metadata.host !== HOSTNAME) {
			return null;
		}
		if (isProcessAlive(metadata.pid)) {
			return null;
		}
		const ageMs =
			metadata.acquiredAtMs === null
				? mtimeAgeMs
				: nowMs - metadata.acquiredAtMs;
		if (ageMs < LOCK_STALE_AGE_MS) {
			return null;
		}
		return metadata;
	}

	if (mtimeAgeMs < LOCK_OWNERLESS_STALE_AGE_MS) {
		return null;
	}
	return metadata;
}

function tryReclaimStaleLock(
	lockPath: string,
	expected: SessionLockMetadata,
): boolean {
	const reclaimPath = `${lockPath}.reclaim`;
	try {
		linkSync(lockPath, reclaimPath);
	} catch {
		return false;
	}

	try {
		const claimed = readLockMetadata(reclaimPath);
		const rechecked = readLockMetadata(lockPath);
		const expectedSignature = metadataSignature(expected);
		if (
			claimed === null ||
			rechecked === null ||
			metadataSignature(claimed) !== expectedSignature ||
			metadataSignature(rechecked) !== expectedSignature
		) {
			return false;
		}
		try {
			unlinkSync(lockPath);
			return true;
		} catch {
			return false;
		}
	} finally {
		try {
			unlinkSync(reclaimPath);
		} catch {}
	}
}

export function withSessionLock<T>(
	root: string,
	session: string,
	action: () => T,
): T {
	const lockPath = resolveSessionLockPath(root, session);
	const currentDepth = heldLocks.get(lockPath) ?? 0;
	if (currentDepth > 0) {
		heldLocks.set(lockPath, currentDepth + 1);
		try {
			return action();
		} finally {
			releaseHeldLock(lockPath);
		}
	}

	mkdirSync(dirname(lockPath), { recursive: true });
	const startedAt = Date.now();
	let fd: number | null = null;

	while (fd === null) {
		try {
			fd = openSync(lockPath, "wx");
		} catch (error) {
			if (!isAlreadyExistsError(error)) {
				throw error;
			}
			const now = Date.now();
			const staleMetadata = shouldRecoverStaleLock(lockPath, now);
			if (
				staleMetadata !== null &&
				tryReclaimStaleLock(lockPath, staleMetadata)
			) {
				continue;
			}
			if (now - startedAt >= LOCK_TIMEOUT_MS) {
				throw new Error(
					`Timed out waiting for session lock: ${readExistingLockHint(lockPath)}`,
				);
			}
			sleepSync(LOCK_RETRY_MS);
		}
	}

	heldLocks.set(lockPath, 1);
	try {
		writeFileSync(
			fd,
			`${JSON.stringify({
				pid: process.pid,
				acquired_at: new Date().toISOString(),
				host: HOSTNAME,
				session,
			})}\n`,
			"utf8",
		);
		fsyncSync(fd);
		return action();
	} finally {
		releaseHeldLock(lockPath);
		if (fd !== null) {
			closeSync(fd);
		}
		try {
			unlinkSync(lockPath);
		} catch {}
	}
}
