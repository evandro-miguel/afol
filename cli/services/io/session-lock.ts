import {
	closeSync,
	existsSync,
	fsyncSync,
	mkdirSync,
	openSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { resolveProjectPaths } from "../project/paths";

const SESSION_LOCK_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;
const LOCK_RETRY_MS = 25;
const LOCK_TIMEOUT_MS = 30_000;
const LOCK_WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4));
const heldLocks = new Map<string, number>();

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
	if (!SESSION_LOCK_RE.test(normalized) || normalized.includes("..") || normalized.length === 0) {
		throw new Error(`Invalid session identifier for lock: ${session}`);
	}
	return normalized;
}

export function resolveSessionLockPath(root: string, session: string): string {
	const normalized = assertSessionLockName(session);
	const wbRoot = resolveProjectPaths(root).abs.wbDir;
	return join(wbRoot, ".locks", `${normalized}.lock`);
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
		const payload = JSON.parse(readFileSync(lockPath, "utf8")) as {
			pid?: unknown;
			acquired_at?: unknown;
		};
		const pid = typeof payload.pid === "number" ? ` pid=${payload.pid}` : "";
		const acquiredAt =
			typeof payload.acquired_at === "string"
				? ` acquired_at=${payload.acquired_at}`
				: "";
		return `${lockPath}${pid}${acquiredAt}`;
	} catch {
		return lockPath;
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
			if (Date.now() - startedAt >= LOCK_TIMEOUT_MS) {
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
