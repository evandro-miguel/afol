import { createHash, randomUUID } from "node:crypto";
import {
	closeSync,
	constants as fsConstants,
	fstatSync,
	fsyncSync,
	ftruncateSync,
	linkSync,
	lstatSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	readSync,
	realpathSync,
	renameSync,
	unlinkSync,
	writeSync,
} from "node:fs";
import { hostname } from "node:os";
import { basename, dirname, join } from "node:path";
import { resolveProjectPaths } from "../project/paths";
import { resolveProjectWritePath } from "../project/root";

const DEFAULT_TIMEOUT_MS = 5_000,
	RETRY_MS = 25,
	HOSTNAME = hostname().toLowerCase();
const NOFOLLOW = fsConstants.O_NOFOLLOW ?? 0,
	READ_NOFOLLOW = fsConstants.O_RDONLY | NOFOLLOW;
const OWNER_FLAGS =
	fsConstants.O_RDWR | fsConstants.O_CREAT | fsConstants.O_EXCL | NOFOLLOW;
const TOMBSTONE_MARKER = ".tombstone-",
	PREPARED_MARKER = ".prepared-";
interface LockIdentity {
	dev: bigint;
	ino: bigint;
	birthtimeNs: bigint;
	ctimeNs: bigint;
}
interface GenerationFence {
	fd: number;
	generation: number;
	identity: LockIdentity;
}
interface CompletionLockMetadata {
	pid: number;
	host: string;
	owner_token: string;
	ownership_probe?: string;
	generation: number;
	acquired_at: string;
	heartbeat_at: string;
}
export interface TaskCompletionLease {
	generation: number;
	ownerToken: string;
	signal: AbortSignal;
	assertOwned: () => void;
}
export interface TaskCompletionLockOptions {
	timeoutMs?: number;
	heartbeatMs?: number;
}
export class TaskCompletionBusyError extends Error {
	readonly code = "task_completion_busy";
	constructor(session: string, taskId: string) {
		super(`Timed out waiting for task completion lock: ${session}/${taskId}`);
		this.name = "TaskCompletionBusyError";
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
function errorCode(error: unknown): string | null {
	return typeof error === "object" &&
		error !== null &&
		"code" in error &&
		typeof (error as { code?: unknown }).code === "string"
		? (error as { code: string }).code
		: null;
}
function isAlreadyExistsError(error: unknown): boolean {
	return errorCode(error) === "EEXIST";
}
function isPathContentionError(error: unknown, path: string): boolean {
	const code = errorCode(error);
	if (code === "EEXIST") return true;
	if (process.platform !== "win32" || code !== "EPERM") return false;
	try {
		lstatSync(path);
		return true;
	} catch (probeError) {
		return errorCode(probeError) === "ENOENT";
	}
}
function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return errorCode(error) !== "ESRCH";
	}
}
function identity(fd: number): LockIdentity {
	const stat = fstatSync(fd, { bigint: true });
	return {
		dev: stat.dev,
		ino: stat.ino,
		birthtimeNs: stat.birthtimeNs,
		ctimeNs: stat.ctimeNs,
	};
}
function identityFromStat(stat: {
	dev: bigint;
	ino: bigint;
	birthtimeNs: bigint;
	ctimeNs: bigint;
}): LockIdentity {
	return {
		dev: stat.dev,
		ino: stat.ino,
		birthtimeNs: stat.birthtimeNs,
		ctimeNs: stat.ctimeNs,
	};
}
function sameIdentity(left: LockIdentity, right: LockIdentity): boolean {
	return (
		left.dev === right.dev &&
		left.ino === right.ino &&
		left.birthtimeNs === right.birthtimeNs &&
		left.ctimeNs === right.ctimeNs
	);
}
function pathHasIdentity(path: string, expected: LockIdentity): boolean {
	try {
		const stat = lstatSync(path, { bigint: true });
		return stat.isFile() && sameIdentity(identityFromStat(stat), expected);
	} catch {
		return false;
	}
}
function parseMetadata(raw: string): CompletionLockMetadata | null {
	try {
		const value = JSON.parse(raw) as Partial<CompletionLockMetadata>;
		if (
			typeof value.pid !== "number" ||
			typeof value.host !== "string" ||
			typeof value.owner_token !== "string" ||
			(value.ownership_probe !== undefined &&
				typeof value.ownership_probe !== "string") ||
			typeof value.generation !== "number" ||
			typeof value.acquired_at !== "string" ||
			typeof value.heartbeat_at !== "string"
		)
			return null;
		return value as CompletionLockMetadata;
	} catch {
		return null;
	}
}
function readMetadata(
	path: string,
): { identity: LockIdentity; metadata: CompletionLockMetadata | null } | null {
	let fd: number | null = null;
	try {
		fd = openSync(path, READ_NOFOLLOW);
		const owner = identity(fd);
		if (!pathHasIdentity(path, owner)) return null;
		return {
			identity: owner,
			metadata: parseMetadata(readFileSync(fd, "utf8")),
		};
	} catch {
		return null;
	} finally {
		if (fd !== null) closeSync(fd);
	}
}
function replaceFileContents(fd: number, contents: string): void {
	ftruncateSync(fd, 0);
	const value = Buffer.from(contents, "utf8");
	let offset = 0;
	while (offset < value.length) {
		const written = writeSync(fd, value, offset, value.length - offset, offset);
		if (written <= 0) throw new Error("Failed to write task completion state.");
		offset += written;
	}
	fsyncSync(fd);
}
function readGenerationFd(fd: number, allowEmpty = false): number | null {
	try {
		const size = fstatSync(fd).size;
		if (size === 0) return allowEmpty ? 0 : null;
		if (size > 32) return null;
		const buffer = Buffer.alloc(size);
		if (readSync(fd, buffer, 0, size, 0) !== size) return null;
		const raw = buffer.toString("utf8");
		if (!/^(0|[1-9]\d*)\n$/.test(raw)) return null;
		const value = Number.parseInt(raw, 10);
		return Number.isSafeInteger(value) && value >= 0 ? value : null;
	} catch {
		return null;
	}
}
function readOwnedGeneration(
	path: string,
	fd: number,
	expected: LockIdentity,
): number | null {
	try {
		return sameIdentity(identity(fd), expected) &&
			pathHasIdentity(path, expected)
			? readGenerationFd(fd)
			: null;
	} catch {
		return null;
	}
}
function incrementGeneration(path: string): GenerationFence {
	let fd: number;
	let created = false;
	try {
		fd = openSync(path, OWNER_FLAGS, 0o600);
		created = true;
	} catch (error) {
		if (!isAlreadyExistsError(error)) throw error;
		fd = openSync(path, fsConstants.O_RDWR | NOFOLLOW);
	}
	try {
		let fenceIdentity = identity(fd);
		if (!pathHasIdentity(path, fenceIdentity))
			throw new Error("Task completion fence is not a regular owned file.");
		const current = readGenerationFd(fd, created);
		if (current === null)
			throw new Error(
				"Task completion fence contains invalid generation data.",
			);
		const next = current + 1;
		if (!Number.isSafeInteger(next))
			throw new Error("Task completion fence generation is exhausted.");
		replaceFileContents(fd, `${next}\n`);
		fenceIdentity = identity(fd);
		if (!pathHasIdentity(path, fenceIdentity))
			throw new Error("Task completion fence ownership was lost.");
		return { fd, generation: next, identity: fenceIdentity };
	} catch (error) {
		closeSync(fd);
		throw error;
	}
}
function nextGeneration(path: string): number {
	let fd: number | null = null;
	try {
		fd = openSync(path, READ_NOFOLLOW);
		const current = readGenerationFd(fd);
		if (current === null || !Number.isSafeInteger(current + 1))
			throw new Error(
				"Task completion fence contains invalid generation data.",
			);
		return current + 1;
	} catch (error) {
		if (errorCode(error) === "ENOENT") return 1;
		throw error;
	} finally {
		if (fd !== null) closeSync(fd);
	}
}
function fenceStillOwned(
	path: string,
	expected: LockIdentity,
	generation: number,
): boolean {
	let fd: number | null = null;
	try {
		fd = openSync(path, READ_NOFOLLOW);
		return readOwnedGeneration(path, fd, expected) === generation;
	} catch {
		return false;
	} finally {
		if (fd !== null) closeSync(fd);
	}
}
function uniquePath(lockPath: string, marker: string): string {
	return `${lockPath}${marker}${randomUUID()}`;
}
function removeExact(path: string, expected: LockIdentity): boolean {
	try {
		if (!pathHasIdentity(path, expected)) return false;
		unlinkSync(path);
		return true;
	} catch {
		return false;
	}
}
function moveExactToTombstone(
	lockPath: string,
	expected: LockIdentity,
): boolean {
	try {
		if (!pathHasIdentity(lockPath, expected)) return false;
		const tombstone = uniquePath(lockPath, TOMBSTONE_MARKER);
		renameSync(lockPath, tombstone);
		const moved = readMetadata(tombstone);
		if (moved !== null) removeExact(tombstone, moved.identity);
		return true;
	} catch {
		return false;
	}
}
function isDeadLocalOwner(metadata: CompletionLockMetadata | null): boolean {
	return (
		metadata !== null &&
		metadata.host.toLowerCase() === HOSTNAME &&
		!isProcessAlive(metadata.pid)
	);
}
function cleanupStalePrepared(lockPath: string): void {
	let names: string[];
	try {
		names = readdirSync(dirname(lockPath));
	} catch {
		return;
	}
	const prefix = `${basename(lockPath)}${PREPARED_MARKER}`;
	for (const name of names) {
		if (!name.startsWith(prefix)) continue;
		const path = join(dirname(lockPath), name);
		const observation = readMetadata(path);
		if (observation?.metadata && isDeadLocalOwner(observation.metadata))
			removeExact(path, observation.identity);
	}
}
function reclaimLegacy(lockPath: string): boolean {
	let stat: ReturnType<typeof lstatSync>;
	try {
		stat = lstatSync(lockPath, { bigint: true });
	} catch {
		return false;
	}
	if (stat.isFile()) {
		const observation = readMetadata(lockPath);
		return (
			observation !== null &&
			isDeadLocalOwner(observation.metadata) &&
			moveExactToTombstone(lockPath, observation.identity)
		);
	}
	if (!stat.isDirectory()) return false;
	const owner = readMetadata(join(lockPath, "owner.json"));
	if (owner === null || !isDeadLocalOwner(owner.metadata)) return false;
	try {
		renameSync(lockPath, uniquePath(lockPath, TOMBSTONE_MARKER));
		return true;
	} catch {
		return false;
	}
}
function releaseOwned(
	lockPath: string,
	owner: LockIdentity,
	metadata: CompletionLockMetadata,
	fencePath: string,
	fenceIdentity: LockIdentity,
): boolean {
	if (!fenceStillOwned(fencePath, fenceIdentity, metadata.generation))
		return false;
	const current = readMetadata(lockPath);
	if (
		current === null ||
		!sameIdentity(current.identity, owner) ||
		current.metadata?.owner_token !== metadata.owner_token ||
		current.metadata.generation !== metadata.generation ||
		current.metadata.ownership_probe !== metadata.ownership_probe
	)
		return false;
	return moveExactToTombstone(lockPath, owner);
}

export function resolveTaskCompletionLockPath(
	root: string,
	session: string,
	taskId: string,
): string {
	const project = realpathSync(root);
	const key = createHash("sha256")
		.update(`${project}\0${session.trim()}\0${taskId.trim()}`)
		.digest("hex");
	const projectPaths = resolveProjectPaths(root);
	const candidate = join(
		projectPaths.wbDir,
		".locks",
		`completion-${key}.lock`,
	);
	const resolved = resolveProjectWritePath(root, candidate);
	if (!resolved.ok) throw new Error(resolved.error);
	return resolved.value.path;
}
export async function withTaskCompletionLock<T>(
	root: string,
	session: string,
	taskId: string,
	action: (lease: TaskCompletionLease) => Promise<T>,
	options: TaskCompletionLockOptions = {},
): Promise<T> {
	const lockPath = resolveTaskCompletionLockPath(root, session, taskId),
		fencePath = `${lockPath}.fence`,
		timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
		heartbeatMs = options.heartbeatMs ?? 500;
	mkdirSync(dirname(lockPath), { recursive: true });
	const startedAt = Date.now();
	let ownerFd: number | null = null,
		ownerIdentity: LockIdentity | null = null,
		fenceFd: number | null = null,
		fenceIdentity: LockIdentity | null = null,
		metadata: CompletionLockMetadata | null = null;
	while (metadata === null) {
		cleanupStalePrepared(lockPath);
		const prepared = uniquePath(lockPath, PREPARED_MARKER);
		let preparedFd: number | null = null;
		try {
			const acquiredAt = new Date().toISOString(),
				candidate: CompletionLockMetadata = {
					pid: process.pid,
					host: HOSTNAME,
					owner_token: randomUUID(),
					ownership_probe: randomUUID(),
					generation: nextGeneration(fencePath),
					acquired_at: acquiredAt,
					heartbeat_at: acquiredAt,
				};
			preparedFd = openSync(prepared, OWNER_FLAGS, 0o600);
			replaceFileContents(preparedFd, `${JSON.stringify(candidate)}\n`);
			const preparedIdentity = identity(preparedFd);
			if (!pathHasIdentity(prepared, preparedIdentity))
				throw new Error("Task completion prepared lease ownership was lost.");
			linkSync(prepared, lockPath);
			closeSync(preparedFd);
			preparedFd = null;
			unlinkSync(prepared);
			const acquired = readMetadata(lockPath);
			if (acquired === null)
				throw new Error(
					"Task completion lease acquisition was not a regular owned file.",
				);
			ownerIdentity = acquired.identity;
			const fence = incrementGeneration(fencePath);
			if (fence.generation !== candidate.generation) {
				closeSync(fence.fd);
				throw new Error(
					"Task completion fence generation changed before acquisition.",
				);
			}
			fenceFd = fence.fd;
			fenceIdentity = fence.identity;
			metadata = candidate;
			ownerFd = openSync(lockPath, READ_NOFOLLOW);
			if (
				!sameIdentity(identity(ownerFd), ownerIdentity) ||
				!pathHasIdentity(lockPath, ownerIdentity)
			)
				throw new Error("Task completion lock ownership was lost.");
		} catch (error) {
			if (preparedFd !== null) {
				try {
					closeSync(preparedFd);
				} catch {}
			}
			const preparedObservation = readMetadata(prepared);
			if (preparedObservation !== null)
				removeExact(prepared, preparedObservation.identity);
			if (ownerIdentity !== null && metadata !== null && fenceIdentity !== null)
				releaseOwned(
					lockPath,
					ownerIdentity,
					metadata,
					fencePath,
					fenceIdentity,
				);
			else if (ownerIdentity !== null)
				moveExactToTombstone(lockPath, ownerIdentity);
			ownerFd = null;
			ownerIdentity = null;
			if (fenceFd !== null) {
				try {
					closeSync(fenceFd);
				} catch {}
				fenceFd = null;
			}
			fenceIdentity = null;
			metadata = null;
			if (!isPathContentionError(error, lockPath)) throw error;
			cleanupStalePrepared(lockPath);
			if (reclaimLegacy(lockPath)) continue;
			if (Date.now() - startedAt >= timeoutMs)
				throw new TaskCompletionBusyError(session, taskId);
			await sleep(RETRY_MS);
		}
	}
	const acquiredMetadata = metadata,
		acquiredOwner = ownerIdentity as LockIdentity,
		acquiredFence = fenceIdentity as LockIdentity;
	let lost = false;
	const abort = new AbortController();
	const markLost = (): void => {
		if (!lost) abort.abort();
		lost = true;
	};
	const assertOwned = (): void => {
		if (
			lost ||
			!fenceStillOwned(fencePath, acquiredFence, acquiredMetadata.generation)
		) {
			markLost();
			throw new Error("Task completion lock ownership was lost.");
		}
		const current = readMetadata(lockPath);
		if (
			current === null ||
			!sameIdentity(current.identity, acquiredOwner) ||
			current.metadata?.owner_token !== acquiredMetadata.owner_token ||
			current.metadata.generation !== acquiredMetadata.generation ||
			current.metadata.ownership_probe !== acquiredMetadata.ownership_probe
		) {
			markLost();
			throw new Error("Task completion lock ownership was lost.");
		}
	};
	const heartbeat = setInterval(() => {
		try {
			assertOwned();
		} catch {
			markLost();
		}
	}, heartbeatMs);
	heartbeat.unref();
	let result: T | undefined;
	let actionError: unknown;
	let stillOwned = false;
	try {
		result = await action({
			generation: acquiredMetadata.generation,
			ownerToken: acquiredMetadata.owner_token,
			signal: abort.signal,
			assertOwned,
		});
	} catch (error) {
		actionError = error;
	} finally {
		clearInterval(heartbeat);
		try {
			assertOwned();
			stillOwned = true;
		} catch {
			markLost();
		}
		if (ownerFd !== null) closeSync(ownerFd);
		if (fenceFd !== null) closeSync(fenceFd);
		if (stillOwned)
			releaseOwned(
				lockPath,
				acquiredOwner,
				acquiredMetadata,
				fencePath,
				acquiredFence,
			);
		if (!stillOwned && actionError === undefined) {
			actionError = new Error("Task completion lock ownership was lost.");
		}
	}
	if (actionError !== undefined) throw actionError;
	return result as T;
}
