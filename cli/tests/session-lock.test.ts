import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { hostname, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	isMainThread,
	parentPort,
	Worker,
	workerData,
} from "node:worker_threads";
import {
	resolveSessionLockPath,
	withSessionLock,
} from "../services/io/session-lock";

const RECLAIM_READY = 0;
const RECLAIM_START = 1;
const RECLAIM_ACTIVE = 2;
const RECLAIM_OVERLAP = 3;
const RECLAIM_ENTERED = 4;
const RECLAIM_HOLD = 5;

interface ReclaimWorkerData {
	kind: "stale-reclaim";
	participants: number;
	root: string;
	session: string;
	signals: SharedArrayBuffer;
}

if (!isMainThread && workerData?.kind === "stale-reclaim") {
	const {
		participants,
		root,
		session,
		signals: buffer,
	} = workerData as ReclaimWorkerData;
	const signals = new Int32Array(buffer);
	const ready = Atomics.add(signals, RECLAIM_READY, 1) + 1;
	if (ready === participants) {
		Atomics.store(signals, RECLAIM_START, 1);
		Atomics.notify(signals, RECLAIM_START, participants - 1);
	} else if (Atomics.wait(signals, RECLAIM_START, 0, 5_000) === "timed-out") {
		throw new Error("stale-reclaim worker barrier timed out");
	}

	withSessionLock(root, session, () => {
		if (Atomics.add(signals, RECLAIM_ACTIVE, 1) !== 0) {
			Atomics.store(signals, RECLAIM_OVERLAP, 1);
		}
		Atomics.add(signals, RECLAIM_ENTERED, 1);
		Atomics.wait(signals, RECLAIM_HOLD, 0, 50);
		Atomics.sub(signals, RECLAIM_ACTIVE, 1);
	});
	parentPort?.postMessage("done");
	process.exit(0);
}

function runStaleReclaimWorker(
	root: string,
	session: string,
	participants: number,
	signals: SharedArrayBuffer,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(new URL(import.meta.url), {
			workerData: {
				kind: "stale-reclaim",
				participants,
				root,
				session,
				signals,
			} satisfies ReclaimWorkerData,
		});
		worker.on("error", reject);
		worker.on("exit", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`stale-reclaim worker exited with code ${code}`));
			}
		});
	});
}

function mkProjectRoot(name: string): string {
	const root = mkdtempSync(join(tmpdir(), `session-lock-${name}-`));
	mkdirSync(join(root, ".agents"), { recursive: true });
	writeFileSync(
		join(root, ".agents", "config.json"),
		JSON.stringify({ schema_version: 1 }),
		"utf8",
	);
	writeFileSync(
		join(root, ".agents", "lock.json"),
		JSON.stringify({ schema_version: 1, locked: true }),
		"utf8",
	);
	return root;
}

function withPatchedDateNow<T>(
	nextNow: number | (() => number),
	fn: () => T,
	stepMs = 1_000,
): T {
	const originalNow = Date.now;
	if (typeof nextNow === "number") {
		let now = nextNow;
		(Date as { now: () => number }).now = () => {
			const value = now;
			now += stepMs;
			return value;
		};
	} else {
		(Date as { now: () => number }).now = nextNow;
	}
	try {
		return fn();
	} finally {
		(Date as { now: () => number }).now = originalNow;
	}
}

function deadPidFromExitedProcess(): number {
	const proc = spawnSync(
		process.execPath,
		["-e", "process.stdout.write(String(process.pid));"],
		{
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	if (proc.status !== 0) {
		throw new Error("failed to spawn exited process for dead pid");
	}
	const pid = Number(proc.stdout.trim());
	if (!Number.isInteger(pid) || pid <= 0) {
		throw new Error(`invalid dead pid ${proc.stdout}`);
	}
	return pid;
}

function writeLockMetadata(
	root: string,
	session: string,
	metadata: Record<string, unknown>,
	lockMtimeMs = Date.now(),
): string {
	const lockPath = resolveSessionLockPath(root, session);
	mkdirSync(dirname(lockPath), { recursive: true });
	writeFileSync(lockPath, `${JSON.stringify(metadata)}\n`, "utf8");
	utimesSync(lockPath, lockMtimeMs / 1000, lockMtimeMs / 1000);
	return lockPath;
}

function writeRawLock(
	root: string,
	session: string,
	raw: string,
	lockMtimeMs = Date.now(),
): string {
	const lockPath = resolveSessionLockPath(root, session);
	mkdirSync(dirname(lockPath), { recursive: true });
	writeFileSync(lockPath, raw, "utf8");
	utimesSync(lockPath, lockMtimeMs / 1000, lockMtimeMs / 1000);
	return lockPath;
}

describe("session-lock", () => {
	test("serializes simultaneous reclaimers of the same stale lock", async () => {
		const root = mkProjectRoot("simultaneous-reclaim");
		try {
			const session = "simultaneous-reclaim-session";
			const lockPath = writeLockMetadata(
				root,
				session,
				{
					pid: deadPidFromExitedProcess(),
					session,
					acquired_at: new Date(Date.now() - 35_000).toISOString(),
					host: hostname(),
				},
				Date.now() - 35_000,
			);
			const participants = 12;
			const buffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 6);
			const signals = new Int32Array(buffer);
			await Promise.all(
				Array.from({ length: participants }, () =>
					runStaleReclaimWorker(root, session, participants, buffer),
				),
			);

			expect(Atomics.load(signals, RECLAIM_ENTERED)).toBe(participants);
			expect(Atomics.load(signals, RECLAIM_OVERLAP)).toBe(0);
			expect(Atomics.load(signals, RECLAIM_ACTIVE)).toBe(0);
			expect(existsSync(lockPath)).toBe(false);
			expect(existsSync(`${lockPath}.reclaim`)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}, 10_000);

	test("recovers stale dead lock after the stale-age threshold", () => {
		const root = mkProjectRoot("stale-dead");
		try {
			const session = "stale-dead-session";
			const lockPath = writeLockMetadata(
				root,
				session,
				{
					pid: deadPidFromExitedProcess(),
					session,
					acquired_at: new Date(Date.now() - 35_000).toISOString(),
					host: hostname(),
				},
				Date.now() - 35_000,
			);
			const result = withSessionLock(root, session, () => "acquired");
			expect(result).toBe("acquired");
			expect(existsSync(lockPath)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("recovers stale malformed/ownerless lock after a conservative age threshold", () => {
		const root = mkProjectRoot("ownerless");
		try {
			const session = "ownerless-session";
			const lockPath = writeRawLock(
				root,
				session,
				"{ not valid json",
				Date.now() - 240_000,
			);
			const result = withSessionLock(root, session, () => "acquired");
			expect(result).toBe("acquired");
			expect(existsSync(lockPath)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("never removes a live lock from the current host", () => {
		const root = mkProjectRoot("live-lock");
		try {
			const session = "live-lock-session";
			const lockPath = writeLockMetadata(
				root,
				session,
				{
					pid: process.pid,
					session,
					acquired_at: new Date().toISOString(),
					host: hostname(),
				},
				Date.now() - 5_000,
			);
			const currentNow = Date.now();
			withPatchedDateNow(currentNow + 31_000, () => {
				expect(() => withSessionLock(root, session, () => "acquired")).toThrow(
					/Timed out waiting for session lock:/,
				);
			});
			const raw = readFileSync(lockPath, "utf8");
			expect(raw).toContain(`"pid":${process.pid}`);
			expect(raw).toContain(`"host":"${hostname()}"`);
			expect(existsSync(lockPath)).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("keeps a recent dead lock until timeout path so it can still be reclaimed normally", () => {
		const root = mkProjectRoot("recent-dead");
		try {
			const session = "recent-dead-session";
			const lockPath = writeLockMetadata(
				root,
				session,
				{
					pid: deadPidFromExitedProcess(),
					session,
					acquired_at: new Date(Date.now() + 60_000).toISOString(),
					host: hostname(),
				},
				Date.now(),
			);
			const currentNow = Date.now();
			withPatchedDateNow(currentNow + 31_000, () => {
				expect(() => withSessionLock(root, session, () => "acquired")).toThrow(
					/Timed out waiting for session lock:/,
				);
			});
			expect(existsSync(lockPath)).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("removes the lock path after action failure", () => {
		const root = mkProjectRoot("cleanup");
		try {
			const session = "cleanup-session";
			const lockPath = resolveSessionLockPath(root, session);
			expect(() =>
				withSessionLock(root, session, () => {
					throw new Error("callback failure");
				}),
			).toThrow("callback failure");
			expect(existsSync(lockPath)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
