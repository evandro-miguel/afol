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
	readFileSync,
	readSync,
	realpathSync,
	unlinkSync,
	writeSync,
} from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { resolveProjectPaths } from "../project/paths";
import { resolveProjectWritePath } from "../project/root";

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_HEARTBEAT_MS = 500;
const RETRY_MS = 25;
const HOSTNAME = hostname().toLowerCase();
const NOFOLLOW = fsConstants.O_NOFOLLOW ?? 0;
const READ_NOFOLLOW = fsConstants.O_RDONLY | NOFOLLOW;
const READ_WRITE_NOFOLLOW = fsConstants.O_RDWR | NOFOLLOW;

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

interface GenerationRecord {
	generation: number;
	raw: string;
}

interface CompletionFenceIo {
	truncate?: (fd: number, size: number) => void;
	write?: (fd: number, value: string) => void;
	sync?: (fd: number) => void;
	link?: (existingPath: string, newPath: string) => void;
	unlink?: (path: string) => void;
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
	/** Narrow test-only fault-injection seam for completion fence durability. */
	fenceIo?: CompletionFenceIo;
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

function isAlreadyExistsError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "EEXIST"
	);
}

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return !(
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			(error as { code?: unknown }).code === "ESRCH"
		);
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

function sameFile(left: LockIdentity, right: LockIdentity): boolean {
	return (
		left.dev === right.dev &&
		left.ino === right.ino &&
		left.birthtimeNs === right.birthtimeNs
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
			typeof value.generation !== "number" ||
			typeof value.acquired_at !== "string" ||
			typeof value.heartbeat_at !== "string"
		) {
			return null;
		}
		return value as CompletionLockMetadata;
	} catch {
		return null;
	}
}

function readOwnedMetadata(
	path: string,
	expected: LockIdentity,
): CompletionLockMetadata | null {
	let fd: number | null = null;
	try {
		fd = openSync(path, READ_NOFOLLOW);
		if (
			!sameIdentity(identity(fd), expected) ||
			!pathHasIdentity(path, expected)
		) {
			return null;
		}
		return parseMetadata(readFileSync(fd, "utf8"));
	} catch {
		return null;
	} finally {
		if (fd !== null) closeSync(fd);
	}
}

function readGenerationRecordFd(fd: number): GenerationRecord | null {
	try {
		const size = fstatSync(fd).size;
		if (size === 0 || size > 32) return null;
		const buffer = Buffer.alloc(size);
		if (readSync(fd, buffer, 0, size, 0) !== size) return null;
		const raw = buffer.toString("utf8");
		if (!/^(0|[1-9]\d*)\n$/.test(raw)) return null;
		const generation = Number.parseInt(raw, 10);
		return Number.isSafeInteger(generation) && generation >= 0
			? { generation, raw }
			: null;
	} catch {
		return null;
	}
}

function readGenerationFd(fd: number): number | null {
	return readGenerationRecordFd(fd)?.generation ?? null;
}

function readOwnedGeneration(
	path: string,
	fd: number,
	expected: LockIdentity,
): number | null {
	try {
		if (
			!sameIdentity(identity(fd), expected) ||
			!pathHasIdentity(path, expected)
		) {
			return null;
		}
		return readGenerationFd(fd);
	} catch {
		return null;
	}
}

function writeFence(fd: number, value: string, io?: CompletionFenceIo): void {
	if (io?.write) {
		io.write(fd, value);
		return;
	}
	const buffer = Buffer.from(value, "utf8");
	let offset = 0;
	while (offset < buffer.length) {
		const written = writeSync(
			fd,
			buffer,
			offset,
			buffer.length - offset,
			offset,
		);
		if (written <= 0) {
			throw new Error("Task completion fence write made no progress.");
		}
		offset += written;
	}
}

function syncFence(fd: number, io?: CompletionFenceIo): void {
	(io?.sync ?? fsyncSync)(fd);
}

function restoreGeneration(
	path: string,
	fd: number,
	expected: LockIdentity,
	previous: string,
	io?: CompletionFenceIo,
): void {
	const currentIdentity = identity(fd);
	if (
		!sameFile(currentIdentity, expected) ||
		!pathHasIdentity(path, currentIdentity)
	) {
		throw new Error(
			"Task completion fence ownership was lost before recovery.",
		);
	}
	(io?.truncate ?? ftruncateSync)(fd, 0);
	writeFence(fd, previous, io);
	syncFence(fd, io);
	const restoredIdentity = identity(fd);
	if (
		!pathHasIdentity(path, restoredIdentity) ||
		readGenerationRecordFd(fd)?.raw !== previous
	) {
		throw new Error("Task completion fence recovery could not be verified.");
	}
}

function incrementExistingGeneration(
	path: string,
	fd: number,
	io?: CompletionFenceIo,
): GenerationFence {
	try {
		let fenceIdentity = identity(fd);
		if (!pathHasIdentity(path, fenceIdentity)) {
			throw new Error("Task completion fence is not a regular owned file.");
		}
		const current = readGenerationRecordFd(fd);
		if (current === null) {
			throw new Error(
				"Task completion fence contains invalid generation data.",
			);
		}
		const next = current.generation + 1;
		if (!Number.isSafeInteger(next)) {
			throw new Error("Task completion fence generation is exhausted.");
		}
		(io?.truncate ?? ftruncateSync)(fd, 0);
		try {
			writeFence(fd, `${next}\n`, io);
			syncFence(fd, io);
		} catch (primaryError) {
			try {
				restoreGeneration(path, fd, fenceIdentity, current.raw, io);
			} catch (recoveryError) {
				throw new AggregateError(
					[primaryError, recoveryError],
					"Task completion fence update failed and could not be restored.",
				);
			}
			throw primaryError;
		}
		fenceIdentity = identity(fd);
		if (
			!pathHasIdentity(path, fenceIdentity) ||
			readGenerationRecordFd(fd)?.generation !== next
		) {
			throw new Error("Task completion fence ownership was lost.");
		}
		return { fd, generation: next, identity: fenceIdentity };
	} catch (error) {
		closeSync(fd);
		throw error;
	}
}

// This is atomic for observed synchronous I/O failures, not sudden power loss.
function createFreshGeneration(
	path: string,
	io?: CompletionFenceIo,
): GenerationFence {
	const temporaryPath = `${path}.tmp-${randomUUID()}`;
	let fd: number | null = null;
	let temporaryIdentity: LockIdentity | null = null;
	try {
		fd = openSync(
			temporaryPath,
			fsConstants.O_RDWR | fsConstants.O_CREAT | fsConstants.O_EXCL | NOFOLLOW,
			0o600,
		);
		temporaryIdentity = identity(fd);
		if (!pathHasIdentity(temporaryPath, temporaryIdentity)) {
			throw new Error("Task completion fence temporary file is not owned.");
		}
		writeFence(fd, "1\n", io);
		syncFence(fd, io);
		temporaryIdentity = identity(fd);
		if (readGenerationRecordFd(fd)?.raw !== "1\n") {
			throw new Error(
				"Task completion fence temporary data could not be verified.",
			);
		}
		try {
			(io?.link ?? linkSync)(temporaryPath, path);
		} catch (error) {
			if (isAlreadyExistsError(error)) {
				throw new Error("Task completion fence was concurrently created.");
			}
			throw error;
		}
		// Publishing and removing the temporary hard link both change ctime.
		// Refresh the descriptor identity after each link-count mutation.
		temporaryIdentity = identity(fd);
		if (
			!pathHasIdentity(path, temporaryIdentity) ||
			!pathHasIdentity(temporaryPath, temporaryIdentity)
		) {
			throw new Error("Task completion fence publication ownership was lost.");
		}
		if (!unlinkOwned(temporaryPath, temporaryIdentity, io?.unlink)) {
			throw new Error(
				"Task completion fence temporary alias could not be removed.",
			);
		}
		temporaryIdentity = identity(fd);
		if (!pathHasIdentity(path, temporaryIdentity)) {
			throw new Error("Task completion fence publication ownership was lost.");
		}
		return { fd, generation: 1, identity: temporaryIdentity };
	} catch (error) {
		if (temporaryIdentity !== null) {
			if (fd !== null) {
				try {
					temporaryIdentity = identity(fd);
				} catch {}
			}
			unlinkOwned(temporaryPath, temporaryIdentity, io?.unlink);
		}
		if (fd !== null) closeSync(fd);
		throw error;
	}
}

function incrementGeneration(
	path: string,
	io?: CompletionFenceIo,
): GenerationFence {
	try {
		return incrementExistingGeneration(
			path,
			openSync(path, fsConstants.O_RDWR | NOFOLLOW),
			io,
		);
	} catch (error) {
		if (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			(error as { code?: unknown }).code === "ENOENT"
		) {
			return createFreshGeneration(path, io);
		}
		throw error;
	}
}

function writeMetadataFd(fd: number, metadata: CompletionLockMetadata): void {
	replaceFileContents(fd, `${JSON.stringify(metadata)}\n`);
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

function unlinkOwned(
	path: string,
	expected: LockIdentity,
	unlink: (path: string) => void = unlinkSync,
): boolean {
	let fd: number | null = null;
	try {
		fd = openSync(path, READ_NOFOLLOW);
		if (!sameIdentity(identity(fd), expected)) return false;
		unlink(path);
		return true;
	} catch {
		return false;
	} finally {
		if (fd !== null) closeSync(fd);
	}
}

function reclaimDeadOwner(path: string): boolean {
	let fd: number | null = null;
	try {
		fd = openSync(path, READ_NOFOLLOW);
		const expected = identity(fd);
		const metadata = parseMetadata(readFileSync(fd, "utf8"));
		if (
			metadata === null ||
			metadata.host.toLowerCase() !== HOSTNAME ||
			isProcessAlive(metadata.pid)
		) {
			return false;
		}
		return unlinkOwned(path, expected);
	} catch {
		return false;
	} finally {
		if (fd !== null) closeSync(fd);
	}
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
	const lockPath = resolveTaskCompletionLockPath(root, session, taskId);
	const fencePath = `${lockPath}.fence`;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
	mkdirSync(dirname(lockPath), { recursive: true });

	const startedAt = Date.now();
	let fd: number | null = null;
	while (fd === null) {
		try {
			fd = openSync(lockPath, "wx+");
		} catch (error) {
			if (!isAlreadyExistsError(error)) throw error;
			if (reclaimDeadOwner(lockPath)) continue;
			if (Date.now() - startedAt >= timeoutMs) {
				throw new TaskCompletionBusyError(session, taskId);
			}
			await sleep(RETRY_MS);
		}
	}

	const ownerFd = fd;
	let ownedIdentity = identity(ownerFd);
	const ownerToken = randomUUID();
	let generation: number;
	let fenceFd: number | null = null;
	let fenceIdentity: LockIdentity;
	let metadata: CompletionLockMetadata;
	try {
		const fence = incrementGeneration(fencePath, options.fenceIo);
		fenceFd = fence.fd;
		generation = fence.generation;
		fenceIdentity = fence.identity;
		const acquiredAt = new Date().toISOString();
		metadata = {
			pid: process.pid,
			host: HOSTNAME,
			owner_token: ownerToken,
			ownership_probe: randomUUID(),
			generation,
			acquired_at: acquiredAt,
			heartbeat_at: acquiredAt,
		};
		writeMetadataFd(ownerFd, metadata);
		ownedIdentity = identity(ownerFd);
	} catch (error) {
		try {
			// Metadata replacement changes ctime even when the write or fsync then
			// fails. Refresh from the still-owned descriptor so cleanup cannot leave
			// an empty or partial lock permanently blocking future completions.
			ownedIdentity = identity(ownerFd);
			unlinkOwned(lockPath, ownedIdentity);
		} finally {
			try {
				if (fenceFd !== null) closeSync(fenceFd);
			} finally {
				closeSync(ownerFd);
			}
		}
		throw error;
	}

	const abort = new AbortController();
	let lost = false;
	const markLost = (): void => {
		lost = true;
		abort.abort();
	};
	const assertOwned = (): void => {
		const current = readOwnedMetadata(lockPath, ownedIdentity);
		if (
			lost ||
			current?.owner_token !== ownerToken ||
			current.generation !== generation ||
			readOwnedGeneration(fencePath, fenceFd, fenceIdentity) !== generation
		) {
			markLost();
			throw new Error("Task completion lock ownership was lost.");
		}
	};
	const heartbeat = setInterval(() => {
		let heartbeatFd: number | null = null;
		try {
			assertOwned();
			heartbeatFd = openSync(lockPath, READ_WRITE_NOFOLLOW);
			if (!sameIdentity(identity(heartbeatFd), ownedIdentity)) {
				markLost();
				return;
			}
			writeMetadataFd(heartbeatFd, {
				...metadata,
				heartbeat_at: new Date().toISOString(),
			});
			ownedIdentity = identity(heartbeatFd);
		} catch {
			markLost();
		} finally {
			if (heartbeatFd !== null) closeSync(heartbeatFd);
		}
	}, heartbeatMs);
	heartbeat.unref();

	let result: T | undefined;
	let actionError: unknown;
	let stillOwned = false;
	try {
		result = await action({
			generation,
			ownerToken,
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
		try {
			if (stillOwned) {
				const ownershipProbe = randomUUID();
				metadata = {
					...metadata,
					heartbeat_at: new Date().toISOString(),
					ownership_probe: ownershipProbe,
				};
				writeMetadataFd(ownerFd, metadata);
				ownedIdentity = identity(ownerFd);
				const current = readOwnedMetadata(lockPath, ownedIdentity);
				if (
					current?.owner_token !== ownerToken ||
					current.generation !== generation ||
					current.ownership_probe !== ownershipProbe ||
					!unlinkOwned(lockPath, ownedIdentity)
				) {
					stillOwned = false;
					markLost();
				}
			}
		} catch (error) {
			stillOwned = false;
			markLost();
			if (actionError === undefined) actionError = error;
		} finally {
			try {
				closeSync(fenceFd);
			} finally {
				closeSync(ownerFd);
			}
		}
		if (!stillOwned && actionError === undefined) {
			actionError = new Error("Task completion lock ownership was lost.");
		}
	}
	if (actionError !== undefined) throw actionError;
	return result as T;
}
