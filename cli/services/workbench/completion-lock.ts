import { createHash, randomUUID } from "node:crypto";
import {
	closeSync,
	constants as fsConstants,
	fstatSync,
	fsyncSync,
	ftruncateSync,
	lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	readSync,
	realpathSync,
	unlinkSync,
	writeFileSync,
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
	return { dev: stat.dev, ino: stat.ino };
}

function sameIdentity(left: LockIdentity, right: LockIdentity): boolean {
	return left.dev === right.dev && left.ino === right.ino;
}

function pathHasIdentity(path: string, expected: LockIdentity): boolean {
	try {
		const stat = lstatSync(path, { bigint: true });
		return (
			stat.isFile() && sameIdentity({ dev: stat.dev, ino: stat.ino }, expected)
		);
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

function incrementGeneration(path: string): GenerationFence {
	let fd: number;
	let created = false;
	try {
		fd = openSync(
			path,
			fsConstants.O_RDWR |
				fsConstants.O_CREAT |
				fsConstants.O_EXCL |
				fsConstants.O_APPEND |
				NOFOLLOW,
			0o600,
		);
		created = true;
	} catch (error) {
		if (!isAlreadyExistsError(error)) throw error;
		fd = openSync(path, fsConstants.O_RDWR | fsConstants.O_APPEND | NOFOLLOW);
	}
	try {
		const fenceIdentity = identity(fd);
		if (!pathHasIdentity(path, fenceIdentity)) {
			throw new Error("Task completion fence is not a regular owned file.");
		}
		const current = readGenerationFd(fd, created);
		if (current === null) {
			throw new Error(
				"Task completion fence contains invalid generation data.",
			);
		}
		const next = current + 1;
		if (!Number.isSafeInteger(next)) {
			throw new Error("Task completion fence generation is exhausted.");
		}
		ftruncateSync(fd, 0);
		writeFileSync(fd, `${next}\n`, "utf8");
		fsyncSync(fd);
		if (!pathHasIdentity(path, fenceIdentity)) {
			throw new Error("Task completion fence ownership was lost.");
		}
		return { fd, generation: next, identity: fenceIdentity };
	} catch (error) {
		closeSync(fd);
		throw error;
	}
}

function writeMetadataFd(fd: number, metadata: CompletionLockMetadata): void {
	ftruncateSync(fd, 0);
	writeFileSync(fd, `${JSON.stringify(metadata)}\n`, "utf8");
	fsyncSync(fd);
}

function unlinkOwned(path: string, expected: LockIdentity): boolean {
	let fd: number | null = null;
	try {
		fd = openSync(path, READ_NOFOLLOW);
		if (!sameIdentity(identity(fd), expected)) return false;
		unlinkSync(path);
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
	const ownedIdentity = identity(ownerFd);
	const ownerToken = randomUUID();
	let generation: number;
	let fenceFd: number | null = null;
	let fenceIdentity: LockIdentity;
	let metadata: CompletionLockMetadata;
	try {
		const fence = incrementGeneration(fencePath);
		fenceFd = fence.fd;
		generation = fence.generation;
		fenceIdentity = fence.identity;
		const acquiredAt = new Date().toISOString();
		metadata = {
			pid: process.pid,
			host: HOSTNAME,
			owner_token: ownerToken,
			generation,
			acquired_at: acquiredAt,
			heartbeat_at: acquiredAt,
		};
		writeMetadataFd(ownerFd, metadata);
	} catch (error) {
		try {
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
		} catch {
			markLost();
		} finally {
			if (heartbeatFd !== null) closeSync(heartbeatFd);
		}
	}, heartbeatMs);
	heartbeat.unref();

	try {
		return await action({
			generation,
			ownerToken,
			signal: abort.signal,
			assertOwned,
		});
	} finally {
		clearInterval(heartbeat);
		try {
			const current = readOwnedMetadata(lockPath, ownedIdentity);
			if (
				current?.owner_token === ownerToken &&
				current.generation === generation
			) {
				unlinkOwned(lockPath, ownedIdentity);
			}
		} finally {
			try {
				closeSync(fenceFd);
			} finally {
				closeSync(ownerFd);
			}
		}
	}
}
