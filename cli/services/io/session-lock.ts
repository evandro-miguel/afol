import { createHash, randomUUID } from "node:crypto";
import {
	closeSync,
	existsSync,
	fstatSync,
	fsyncSync,
	lstatSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	realpathSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { hostname, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { resolveProjectPaths } from "../project/paths";
import { resolveProjectWritePath } from "../project/root";

const SESSION_LOCK_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;
const LOCK_RETRY_MS = 25;
const LOCK_TIMEOUT_MS = 30_000;
const LOCK_STALE_AGE_MS = 30_000;
const LOCK_OWNERLESS_STALE_AGE_MS = 120_000;
const LOCK_OWNERLESS_WRITE_WINDOW_MS = 250;
const LOCK_WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4));
const heldLocks = new Map<string, number>();
const HOSTNAME = hostname().toLowerCase();
const PROCESS_STARTED_AT_MS = Date.now() - process.uptime() * 1_000;
const PROCESS_START_TOKEN = readProcessStartToken(process.pid);
const PROCESS_OWNER_TOKEN = randomUUID();

interface LockIdentity {
	dev: bigint;
	ino: bigint;
}

interface SessionLockMetadata extends LockIdentity {
	isParsed: boolean;
	pid?: number;
	processStartToken?: string;
	ownerToken?: string;
	acquiredAtMs: number | null;
	host?: string;
	raw: string | null;
	mtimeMs: number;
}

export type SessionLockOptions = {
	/** Narrow test seam; never used by normal callers. */
	beforeStaleLockIdentityCheck?: () => void;
};

export type SessionLockObservation = {
	present: boolean;
	active: boolean;
	parsed: boolean;
	pid: number | null;
	host: string | null;
	reason:
		| "absent"
		| "active"
		| "ownerless-write-window"
		| "foreign"
		| "dead"
		| "stale"
		| "malformed";
};

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

function errorCode(error: unknown): string | null {
	return typeof error === "object" && error !== null && "code" in error
		? typeof (error as { code?: unknown }).code === "string"
			? (error as { code: string }).code
			: null
		: null;
}

function isWindowsDeletedLockTransition(
	error: unknown,
	lockPath: string,
): boolean {
	if (process.platform !== "win32" || errorCode(error) !== "EPERM") {
		return false;
	}
	try {
		const stat = lstatSync(lockPath);
		// Windows may report EPERM while another process owns a visible regular
		// lock or while its deletion is pending. Treat this only as contention;
		// the next exclusive create remains the sole ownership authority.
		return stat.isFile() && !stat.isSymbolicLink();
	} catch (probeError) {
		// The target has to be demonstrably absent. A generic EPERM (or an
		// inaccessible existing path) remains an error; the next `wx` call is
		// still the authority that grants ownership.
		return errorCode(probeError) === "ENOENT";
	}
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

function readProcessStartToken(pid: number): string | null {
	if (process.platform !== "linux") return null;
	try {
		const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
		const commandEnd = stat.lastIndexOf(")");
		if (commandEnd < 0) return null;
		const fields = stat
			.slice(commandEnd + 1)
			.trim()
			.split(/\s+/);
		const token = fields[19];
		return token && /^\d+$/.test(token) ? token : null;
	} catch {
		return null;
	}
}

function readFdIdentity(fd: number): LockIdentity {
	const stats = fstatSync(fd, { bigint: true });
	return { dev: stats.dev, ino: stats.ino };
}

function identitiesMatch(left: LockIdentity, right: LockIdentity): boolean {
	return left.dev === right.dev && left.ino === right.ino;
}

function unlinkIfIdentityMatches(
	lockPath: string,
	expected: LockIdentity,
): boolean {
	let fd: number | null = null;
	try {
		fd = openSync(lockPath, "r");
		if (!identitiesMatch(readFdIdentity(fd), expected)) {
			return false;
		}
		unlinkSync(lockPath);
		return true;
	} catch {
		return false;
	} finally {
		if (fd !== null) {
			closeSync(fd);
		}
	}
}

function readLockMetadata(lockPath: string): SessionLockMetadata | null {
	let fd: number | null = null;
	try {
		fd = openSync(lockPath, "r");
		const raw = readFileSync(fd, "utf8");
		const parsed = parseLockMetadataText(raw);
		const stats = fstatSync(fd, { bigint: true });
		const identity = { dev: stats.dev, ino: stats.ino };
		const mtimeMs = Number(stats.mtimeMs);
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			Array.isArray(parsed)
		) {
			return {
				acquiredAtMs: null,
				...identity,
				isParsed: false,
				raw: raw.trim().length > 0 ? raw : null,
				mtimeMs,
			};
		}
		const payload = parsed as {
			pid?: unknown;
			process_start_token?: unknown;
			owner_token?: unknown;
			acquired_at?: unknown;
			host?: unknown;
		};
		const pidRaw = payload.pid;
		const pid =
			typeof pidRaw === "number" && Number.isInteger(pidRaw) && pidRaw > 0
				? pidRaw
				: undefined;
		const processStartToken =
			typeof payload.process_start_token === "string" &&
			/^\d+$/.test(payload.process_start_token)
				? payload.process_start_token
				: undefined;
		const ownerToken =
			typeof payload.owner_token === "string" &&
			/^[0-9a-f-]{36}$/i.test(payload.owner_token)
				? payload.owner_token
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
			...identity,
			...(host?.length ? { host } : {}),
			isParsed: true,
			...(pid !== undefined ? { pid } : {}),
			...(processStartToken !== undefined ? { processStartToken } : {}),
			...(ownerToken !== undefined ? { ownerToken } : {}),
			raw: raw,
			mtimeMs,
		};
	} catch {
		return null;
	} finally {
		if (fd !== null) {
			closeSync(fd);
		}
	}
}

function metadataSignature(metadata: SessionLockMetadata): string {
	return `${metadata.pid ?? ""}|${metadata.host ?? ""}|${
		metadata.acquiredAtMs ?? ""
	}|${metadata.raw ?? ""}|${metadata.mtimeMs}|${metadata.dev}|${metadata.ino}`;
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

function lockOwnerIsAlive(metadata: SessionLockMetadata): boolean {
	if (metadata.pid === undefined || !isProcessAlive(metadata.pid)) return false;
	if (metadata.processStartToken !== undefined) {
		const currentToken = readProcessStartToken(metadata.pid);
		if (currentToken !== null) {
			return currentToken === metadata.processStartToken;
		}
	}
	return !(
		metadata.pid === process.pid &&
		metadata.acquiredAtMs !== null &&
		metadata.acquiredAtMs < PROCESS_STARTED_AT_MS - LOCK_STALE_AGE_MS
	);
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
		if (lockOwnerIsAlive(metadata)) {
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

function observationFromMetadata(
	metadata: SessionLockMetadata | null,
): SessionLockObservation {
	if (metadata === null) {
		return {
			present: false,
			active: false,
			parsed: false,
			pid: null,
			host: null,
			reason: "absent",
		};
	}
	if (
		metadata.isParsed &&
		metadata.pid !== undefined &&
		metadata.host === HOSTNAME &&
		lockOwnerIsAlive(metadata)
	) {
		return {
			present: true,
			active: true,
			parsed: true,
			pid: metadata.pid,
			host: metadata.host,
			reason: "active",
		};
	}
	return {
		present: true,
		active: false,
		parsed: metadata.isParsed,
		pid: metadata.pid ?? null,
		host: metadata.host ?? null,
		reason:
			metadata.isParsed &&
			metadata.host !== undefined &&
			metadata.host !== HOSTNAME
				? "foreign"
				: metadata.isParsed && metadata.pid !== undefined
					? "dead"
					: "malformed",
	};
}

/**
 * Observe a session lock without acquiring, reclaiming, or otherwise mutating it.
 * A just-created ownerless file is sampled briefly to cover the writer's
 * create-then-write window; old malformed/dead locks remain inactive so they
 * cannot hide a required projection rebuild.
 */
export function observeSessionLock(
	root: string,
	session: string,
): SessionLockObservation {
	const lockPath = resolveSessionLockPath(root, session);
	if ((heldLocks.get(lockPath) ?? 0) > 0) {
		return {
			present: true,
			active: true,
			parsed: true,
			pid: process.pid,
			host: HOSTNAME,
			reason: "active",
		};
	}
	const first = readLockMetadata(lockPath);
	const initial = observationFromMetadata(first);
	if (initial.active || first === null) return initial;
	if (first.isParsed && first.pid !== undefined) {
		return initial;
	}
	const ageMs = Math.max(0, Date.now() - first.mtimeMs);
	if (ageMs > LOCK_OWNERLESS_WRITE_WINDOW_MS) return initial;
	for (let attempt = 0; attempt < 3; attempt += 1) {
		sleepSync(LOCK_RETRY_MS);
		const current = readLockMetadata(lockPath);
		const observed = observationFromMetadata(current);
		if (observed.active || !observed.present) return observed;
		if (
			current !== null &&
			Date.now() - current.mtimeMs > LOCK_OWNERLESS_WRITE_WINDOW_MS
		)
			return observed;
	}
	return { ...initial, active: true, reason: "ownerless-write-window" };
}

function tryReclaimStaleLock(
	lockPath: string,
	expected: SessionLockMetadata,
	beforeIdentityCheck?: () => void,
): boolean {
	const reclaimPath = `${lockPath}.reclaim`;
	let reclaimFd: number | null = null;
	let reclaimIdentity: LockIdentity | null = null;
	try {
		reclaimFd = openSync(reclaimPath, "wx");
		reclaimIdentity = readFdIdentity(reclaimFd);
		writeFileSync(
			reclaimFd,
			`${JSON.stringify({
				pid: process.pid,
				...(PROCESS_START_TOKEN !== null
					? { process_start_token: PROCESS_START_TOKEN }
					: {}),
				acquired_at: new Date().toISOString(),
				host: HOSTNAME,
			})}\n`,
			"utf8",
		);
		fsyncSync(reclaimFd);
	} catch (error) {
		if (reclaimFd !== null) closeSync(reclaimFd);
		if (isAlreadyExistsError(error)) {
			const staleMarker = shouldRecoverStaleLock(reclaimPath, Date.now());
			if (staleMarker !== null) {
				return unlinkIfIdentityMatches(reclaimPath, staleMarker);
			}
		}
		return false;
	}

	try {
		const rechecked = readLockMetadata(lockPath);
		const expectedSignature = metadataSignature(expected);
		if (
			rechecked === null ||
			metadataSignature(rechecked) !== expectedSignature
		) {
			return false;
		}
		beforeIdentityCheck?.();
		return unlinkIfIdentityMatches(lockPath, expected);
	} finally {
		if (reclaimIdentity !== null) {
			unlinkIfIdentityMatches(reclaimPath, reclaimIdentity);
		}
		if (reclaimFd !== null) closeSync(reclaimFd);
	}
}

export function withSessionLock<T>(
	root: string,
	session: string,
	action: () => T,
	options: SessionLockOptions = {},
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
			if (
				!isAlreadyExistsError(error) &&
				!isWindowsDeletedLockTransition(error, lockPath)
			) {
				throw error;
			}
			const now = Date.now();
			const staleMetadata = shouldRecoverStaleLock(lockPath, now);
			if (
				staleMetadata !== null &&
				tryReclaimStaleLock(
					lockPath,
					staleMetadata,
					options.beforeStaleLockIdentityCheck,
				)
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
	let ownedIdentity: LockIdentity | null = null;
	try {
		ownedIdentity = readFdIdentity(fd);
		writeFileSync(
			fd,
			`${JSON.stringify({
				pid: process.pid,
				...(PROCESS_START_TOKEN !== null
					? { process_start_token: PROCESS_START_TOKEN }
					: {}),
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
		if (ownedIdentity !== null) {
			unlinkIfIdentityMatches(lockPath, ownedIdentity);
		}
		if (fd !== null) {
			closeSync(fd);
		}
	}
}

export function resolveExternalPathLockPath(canonicalPath: string): string {
	const resolvedPath = resolve(canonicalPath);
	const physicalPath = existsSync(resolvedPath)
		? realpathSync(resolvedPath)
		: resolvedPath;
	const key = createHash("sha256").update(physicalPath).digest("hex");
	return join(tmpdir(), "afol-external-locks", `${key}.lock`);
}

export type ExternalPathLease<T> = {
	value: T;
	release: () => void;
};

function resolveExternalPathLeaseDir(canonicalPath: string): string {
	return `${resolveExternalPathLockPath(canonicalPath)}.leases`;
}

/**
 * Establish a process-owned lease while holding the path coordination lock.
 * The caller must release it only after the returned resource is fully closed.
 */
export function establishExternalPathLeaseSync<T>(
	canonicalPath: string,
	action: () => T,
): ExternalPathLease<T> {
	return withExternalPathLockSync(canonicalPath, () => {
		const leaseDir = resolveExternalPathLeaseDir(canonicalPath);
		mkdirSync(leaseDir, { recursive: true });
		const leasePath = join(leaseDir, `${process.pid}-${randomUUID()}.lease`);
		const fd = openSync(leasePath, "wx");
		let identity: LockIdentity | null = null;
		try {
			identity = readFdIdentity(fd);
			writeFileSync(
				fd,
				`${JSON.stringify({
					pid: process.pid,
					...(PROCESS_START_TOKEN !== null
						? { process_start_token: PROCESS_START_TOKEN }
						: {}),
					owner_token: PROCESS_OWNER_TOKEN,
					acquired_at: new Date().toISOString(),
					host: HOSTNAME,
					resource: resolve(canonicalPath),
				})}\n`,
				"utf8",
			);
			fsyncSync(fd);
		} finally {
			closeSync(fd);
		}

		let released = false;
		const release = () => {
			if (released) return;
			released = true;
			if (identity !== null) unlinkIfIdentityMatches(leasePath, identity);
		};
		try {
			return { value: action(), release };
		} catch (error) {
			release();
			throw error;
		}
	});
}

/** Wait for every live resource lease while new leases are externally blocked. */
export function waitForExternalPathLeasesToDrainSync(
	canonicalPath: string,
): void {
	const leaseDir = resolveExternalPathLeaseDir(canonicalPath);
	const startedAt = Date.now();
	for (;;) {
		let activeCount = 0;
		let entries: string[];
		try {
			entries = readdirSync(leaseDir).filter((entry) =>
				entry.endsWith(".lease"),
			);
		} catch (error) {
			if (errorCode(error) === "ENOENT") return;
			throw error;
		}
		for (const entry of entries) {
			const leasePath = join(leaseDir, entry);
			const metadata = readLockMetadata(leasePath);
			if (metadata === null) continue;
			// This function and same-module SQLite writes are synchronous. The
			// current isolate cannot mutate the DB while it is copying the files.
			if (
				metadata.pid === process.pid &&
				metadata.ownerToken === PROCESS_OWNER_TOKEN
			) {
				continue;
			}
			const staleMetadata = shouldRecoverStaleLock(leasePath, Date.now());
			if (
				staleMetadata !== null &&
				tryReclaimStaleLock(leasePath, staleMetadata)
			) {
				continue;
			}
			activeCount += 1;
		}
		if (activeCount === 0) return;
		if (Date.now() - startedAt >= LOCK_TIMEOUT_MS) {
			throw new Error(
				`Timed out waiting for ${activeCount} external path lease(s) to close`,
			);
		}
		sleepSync(LOCK_RETRY_MS);
	}
}

export async function withExternalPathLock<T>(
	canonicalPath: string,
	action: () => Promise<T>,
): Promise<T> {
	const lockPath = resolveExternalPathLockPath(canonicalPath);
	mkdirSync(dirname(lockPath), { recursive: true });
	const startedAt = Date.now();
	let fd: number | null = null;
	while (fd === null) {
		try {
			fd = openSync(lockPath, "wx");
		} catch (error) {
			if (
				!isAlreadyExistsError(error) &&
				!isWindowsDeletedLockTransition(error, lockPath)
			)
				throw error;
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
					`Timed out waiting for external path lock: ${readExistingLockHint(lockPath)}`,
				);
			}
			sleepSync(LOCK_RETRY_MS);
		}
	}

	let ownedIdentity: LockIdentity | null = null;
	try {
		ownedIdentity = readFdIdentity(fd);
		writeFileSync(
			fd,
			`${JSON.stringify({
				pid: process.pid,
				...(PROCESS_START_TOKEN !== null
					? { process_start_token: PROCESS_START_TOKEN }
					: {}),
				acquired_at: new Date().toISOString(),
				host: HOSTNAME,
				resource: resolve(canonicalPath),
			})}\n`,
			"utf8",
		);
		fsyncSync(fd);
		return await action();
	} finally {
		if (ownedIdentity !== null)
			unlinkIfIdentityMatches(lockPath, ownedIdentity);
		if (fd !== null) closeSync(fd);
	}
}

/**
 * Synchronous counterpart for filesystem initialization paths such as SQLite
 * migrations. The resource key remains external to the project so callers
 * can safely lock a configured path without deriving a project root from it.
 */
export function withExternalPathLockSync<T>(
	canonicalPath: string,
	action: () => T,
): T {
	const lockPath = resolveExternalPathLockPath(canonicalPath);
	mkdirSync(dirname(lockPath), { recursive: true });
	const startedAt = Date.now();
	let fd: number | null = null;
	while (fd === null) {
		try {
			fd = openSync(lockPath, "wx");
		} catch (error) {
			if (
				!isAlreadyExistsError(error) &&
				!isWindowsDeletedLockTransition(error, lockPath)
			)
				throw error;
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
					`Timed out waiting for external path lock: ${readExistingLockHint(lockPath)}`,
				);
			}
			sleepSync(LOCK_RETRY_MS);
		}
	}

	let ownedIdentity: LockIdentity | null = null;
	try {
		ownedIdentity = readFdIdentity(fd);
		writeFileSync(
			fd,
			`${JSON.stringify({
				pid: process.pid,
				...(PROCESS_START_TOKEN !== null
					? { process_start_token: PROCESS_START_TOKEN }
					: {}),
				acquired_at: new Date().toISOString(),
				host: HOSTNAME,
				resource: resolve(canonicalPath),
			})}\n`,
			"utf8",
		);
		fsyncSync(fd);
		return action();
	} finally {
		if (ownedIdentity !== null)
			unlinkIfIdentityMatches(lockPath, ownedIdentity);
		if (fd !== null) closeSync(fd);
	}
}

export function withResourceLocks<T>(
	root: string,
	canonicalPaths: readonly string[],
	action: () => T,
): T {
	const normalizedPaths = [
		...new Set(canonicalPaths.map((path) => resolve(root, path))),
	].sort();
	const keys = normalizedPaths.map(
		(path) => `__resource_${createHash("sha256").update(path).digest("hex")}`,
	);
	const acquire = (index: number): T =>
		index >= keys.length
			? action()
			: withSessionLock(root, keys[index] as string, () => acquire(index + 1));
	return acquire(0);
}
