import { describe, expect, spyOn, test } from "bun:test";
import { spawnSync } from "node:child_process";
import * as nodeFs from "node:fs";
import {
	existsSync,
	linkSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	symlinkSync,
	unlinkSync,
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
	resolveExternalPathLockPath,
	resolveSessionLockPath,
	withExternalPathLock,
	withExternalPathLockSync,
	withResourceLocks,
	withSessionLock,
} from "../services/io/session-lock";
import { withMutationJournalLock } from "../services/mutations/journal";
import { symlinkTestSupport } from "./symlink-test-support";

const RECLAIM_READY = 0;
const RECLAIM_START = 1;
const RECLAIM_ACTIVE = 2;
const RECLAIM_OVERLAP = 3;
const RECLAIM_ENTERED = 4;
const RECLAIM_HOLD = 5;
const REPLACE_READY = 0;
const REPLACE_DONE = 1;

interface ReclaimWorkerData {
	kind: "stale-reclaim";
	participants: number;
	root: string;
	session: string;
	signals: SharedArrayBuffer;
}

interface ReplaceAfterReclaimWorkerData {
	kind: "replace-after-reclaim";
	lockPath: string;
	replacementPath: string;
	signals: SharedArrayBuffer;
}

const SESSION_LOCK_CHILD = "--afol-session-lock-child";

if (process.argv[2] === SESSION_LOCK_CHILD) {
	if (process.argv[3] !== "release-lock") {
		throw new Error("unknown session-lock child mode");
	}
	const lockPath = process.argv[4];
	if (!lockPath) throw new Error("session-lock child requires a lock path");
	Bun.sleepSync(25);
	rmSync(lockPath, { force: true });
	process.exit(0);
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

if (!isMainThread && workerData?.kind === "replace-after-reclaim") {
	const {
		lockPath,
		replacementPath,
		signals: buffer,
	} = workerData as ReplaceAfterReclaimWorkerData;
	const signals = new Int32Array(buffer);
	Atomics.store(signals, REPLACE_READY, 1);
	Atomics.notify(signals, REPLACE_READY);
	const deadline = Date.now() + 5_000;
	while (!existsSync(`${lockPath}.reclaim`)) {
		if (Date.now() >= deadline) {
			throw new Error("replacement worker timed out waiting for reclaim claim");
		}
		Atomics.wait(signals, REPLACE_DONE, 0, 1);
	}
	renameSync(replacementPath, lockPath);
	Atomics.store(signals, REPLACE_DONE, 1);
	Atomics.notify(signals, REPLACE_DONE);
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

function runReplaceAfterReclaimWorker(
	lockPath: string,
	replacementPath: string,
	signals: SharedArrayBuffer,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(new URL(import.meta.url), {
			workerData: {
				kind: "replace-after-reclaim",
				lockPath,
				replacementPath,
				signals,
			} satisfies ReplaceAfterReclaimWorkerData,
		});
		worker.on("error", reject);
		worker.on("exit", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`replacement worker exited with code ${code}`));
			}
		});
	});
}

function waitForSignal(
	signals: Int32Array,
	index: number,
	timeoutMs = 5_000,
): void {
	const result = Atomics.wait(signals, index, 0, timeoutMs);
	if (result === "timed-out") {
		throw new Error(`timed out waiting for worker signal ${index}`);
	}
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
	test("records the Linux process-start identity in acquired locks", () => {
		const root = mkProjectRoot("process-start-identity");
		try {
			const session = "process-start-identity-session";
			const lockPath = resolveSessionLockPath(root, session);
			withSessionLock(root, session, () => {
				const metadata = JSON.parse(readFileSync(lockPath, "utf8")) as {
					process_start_token?: unknown;
				};
				if (process.platform === "linux") {
					expect(metadata.process_start_token).toMatch(/^\d+$/);
				}
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("records the Linux process-start identity in synchronous external locks", () => {
		const root = mkProjectRoot("sync-process-start-identity");
		try {
			const target = join(root, "state.db");
			const lockPath = resolveExternalPathLockPath(target);
			withExternalPathLockSync(target, () => {
				const metadata = JSON.parse(readFileSync(lockPath, "utf8")) as {
					process_start_token?: unknown;
				};
				if (process.platform === "linux") {
					expect(metadata.process_start_token).toMatch(/^\d+$/);
				}
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test.skipIf(!symlinkTestSupport.available)(
		"external path lock keys physical roots identically through symlinks",
		() => {
			const root = mkProjectRoot("external-lock-realpath");
			const link = `${root}-link`;
			try {
				symlinkSync(root, link, "dir");
				expect(resolveExternalPathLockPath(link)).toBe(
					resolveExternalPathLockPath(root),
				);
			} finally {
				rmSync(link, { force: true });
				rmSync(root, { recursive: true, force: true });
			}
		},
	);

	test("external path lock reclaims dead stale owners", async () => {
		const resource = join(tmpdir(), `external-lock-${crypto.randomUUID()}`);
		const lockPath = resolveExternalPathLockPath(resource);
		mkdirSync(dirname(lockPath), { recursive: true });
		const old = Date.now() - 60_000;
		writeFileSync(
			lockPath,
			`${JSON.stringify({
				pid: deadPidFromExitedProcess(),
				host: hostname().toLowerCase(),
				acquired_at: new Date(old).toISOString(),
			})}\n`,
			"utf8",
		);
		utimesSync(lockPath, old / 1000, old / 1000);
		let entered = false;
		await withExternalPathLock(resource, async () => {
			entered = true;
		});
		expect(entered).toBe(true);
		expect(existsSync(lockPath)).toBe(false);
	});

	test.skipIf(process.platform !== "win32")(
		"external path lock retries a proven deleted-lock EPERM transition",
		async () => {
			const resource = join(tmpdir(), `external-lock-${crypto.randomUUID()}`);
			const lockPath = resolveExternalPathLockPath(resource);
			const originalOpenSync = nodeFs.openSync;
			let injected = false;
			const openSpy = spyOn(nodeFs, "openSync").mockImplementation(
				(...args) => {
					if (!injected && args[0] === lockPath && args[1] === "wx") {
						injected = true;
						throw Object.assign(new Error("deleted lock transition"), {
							code: "EPERM",
						});
					}
					return originalOpenSync(...args);
				},
			);
			try {
				let entered = false;
				await withExternalPathLock(resource, async () => {
					entered = true;
				});
				expect(injected).toBe(true);
				expect(entered).toBe(true);
			} finally {
				openSpy.mockRestore();
				rmSync(lockPath, { force: true });
			}
		},
	);

	test.skipIf(process.platform !== "win32")(
		"external path lock treats EPERM on a visible regular lock as contention",
		async () => {
			const resource = join(tmpdir(), `external-lock-${crypto.randomUUID()}`);
			const lockPath = resolveExternalPathLockPath(resource);
			mkdirSync(dirname(lockPath), { recursive: true });
			writeFileSync(lockPath, "existing lock\n", "utf8");
			const originalOpenSync = nodeFs.openSync;
			let injected = false;
			const openSpy = spyOn(nodeFs, "openSync").mockImplementation(
				(...args) => {
					if (!injected && args[0] === lockPath && args[1] === "wx") {
						injected = true;
						throw Object.assign(new Error("unproven lock transition"), {
							code: "EPERM",
						});
					}
					return originalOpenSync(...args);
				},
			);
			// The lock implementation retries synchronously, so a same-thread timer
			// cannot release the fixture. Use a separate process to model the Windows
			// owner finishing its delete-pending transition.
			const release = Bun.spawn({
				cmd: [
					process.execPath,
					import.meta.filename,
					SESSION_LOCK_CHILD,
					"release-lock",
					lockPath,
				],
				stdout: "ignore",
				stderr: "ignore",
			});
			try {
				await withExternalPathLock(resource, async () => undefined);
				expect(injected).toBe(true);
			} finally {
				await release.exited;
				openSpy.mockRestore();
				rmSync(lockPath, { force: true });
			}
		},
	);

	test("external path lock never removes a replacement inode", async () => {
		const resource = join(tmpdir(), `external-lock-${crypto.randomUUID()}`);
		const lockPath = resolveExternalPathLockPath(resource);
		await withExternalPathLock(resource, async () => {
			unlinkSync(lockPath);
			writeFileSync(lockPath, "replacement\n", "utf8");
		});
		expect(readFileSync(lockPath, "utf8")).toBe("replacement\n");
		rmSync(lockPath, { force: true });
	});

	test("does not reclaim a replacement inode with identical metadata", async () => {
		const root = mkProjectRoot("reclaim-replacement");
		try {
			const session = "reclaim-replacement-session";
			const stableMtimeMs = Date.now() - 240_000;
			const raw = `{ not valid json ${"x".repeat(32 * 1024 * 1024)}`;
			const lockPath = writeRawLock(root, session, raw, stableMtimeMs);
			const replacementPath = `${lockPath}.replacement`;
			const witnessPath = `${lockPath}.witness`;
			writeFileSync(replacementPath, raw, "utf8");
			utimesSync(replacementPath, stableMtimeMs / 1000, stableMtimeMs / 1000);
			linkSync(replacementPath, witnessPath);
			const replacementIno = statSync(witnessPath).ino;
			const buffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
			const signals = new Int32Array(buffer);
			let worker: Promise<void> | null = null;
			const beforeStaleLockIdentityCheck =
				process.platform === "win32"
					? () => {
							unlinkSync(lockPath);
							linkSync(replacementPath, lockPath);
							unlinkSync(replacementPath);
							Atomics.store(signals, REPLACE_DONE, 1);
						}
					: undefined;
			const sessionLockOptions = beforeStaleLockIdentityCheck
				? { beforeStaleLockIdentityCheck }
				: undefined;
			if (process.platform !== "win32") {
				worker = runReplaceAfterReclaimWorker(
					lockPath,
					replacementPath,
					buffer,
				);
				waitForSignal(signals, REPLACE_READY);
			}

			let acquired = false;
			let thrown: unknown;
			try {
				withPatchedDateNow(
					Date.now(),
					() =>
						withSessionLock(
							root,
							session,
							() => {
								acquired = true;
							},
							sessionLockOptions,
						),
					31_000,
				);
			} catch (error) {
				thrown = error;
			}
			if (worker !== null) {
				await worker;
			}

			expect(Atomics.load(signals, REPLACE_DONE)).toBe(1);
			expect(acquired).toBe(false);
			expect(thrown).toBeInstanceOf(Error);
			expect((thrown as Error).message).toMatch(
				/Timed out waiting for session lock:/,
			);
			expect(statSync(lockPath).ino).toBe(replacementIno);
			expect(statSync(witnessPath).nlink).toBe(2);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}, 10_000);

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

	test("recovers when a prior stale-lock reclaimer left its marker behind", () => {
		const root = mkProjectRoot("orphaned-reclaim-marker");
		try {
			const session = "orphaned-reclaim-marker-session";
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
			linkSync(lockPath, `${lockPath}.reclaim`);

			let acquired = false;
			withSessionLock(root, session, () => {
				acquired = true;
			});

			expect(acquired).toBe(true);
			expect(existsSync(lockPath)).toBe(false);
			expect(existsSync(`${lockPath}.reclaim`)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("continues after a dead reclaim marker expires at the wait deadline", () => {
		const root = mkProjectRoot("reclaim-marker-deadline");
		try {
			const session = "reclaim-marker-deadline-session";
			const now = Date.now();
			const deadPid = deadPidFromExitedProcess();
			const lockPath = writeLockMetadata(
				root,
				session,
				{
					pid: deadPid,
					session,
					acquired_at: new Date(now - 35_000).toISOString(),
					host: hostname(),
				},
				now - 35_000,
			);
			writeFileSync(
				`${lockPath}.reclaim`,
				`${JSON.stringify({
					pid: deadPid,
					acquired_at: new Date(now).toISOString(),
					host: hostname(),
				})}\n`,
				"utf8",
			);

			let acquired = false;
			withPatchedDateNow(
				now,
				() =>
					withSessionLock(root, session, () => {
						acquired = true;
					}),
				5_000,
			);
			expect(acquired).toBe(true);
			expect(existsSync(lockPath)).toBe(false);
			expect(existsSync(`${lockPath}.reclaim`)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

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

	test("does not remove a replacement lock during final cleanup", () => {
		const root = mkProjectRoot("cleanup-replacement");
		try {
			const session = "cleanup-replacement-session";
			const lockPath = resolveSessionLockPath(root, session);
			withSessionLock(root, session, () => {
				unlinkSync(lockPath);
				writeFileSync(lockPath, "replacement lock\n", "utf8");
			});
			expect(readFileSync(lockPath, "utf8")).toBe("replacement lock\n");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("resource locks are deterministic and reentrant", () => {
		const root = mkProjectRoot("resource-locks");
		try {
			expect(
				withResourceLocks(root, ["/b", "/a"], () =>
					withResourceLocks(root, ["/a", "/b"], () => "ok"),
				),
			).toBe("ok");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("keeps journal-before-resource lock ordering for reverse resource lists", () => {
		const root = mkProjectRoot("journal-resource-order");
		try {
			expect(
				withMutationJournalLock(root, () =>
					withResourceLocks(root, ["/b", "/a"], () =>
						withMutationJournalLock(root, () =>
							withResourceLocks(root, ["/a", "/b"], () => "ordered"),
						),
					),
				),
			).toBe("ordered");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
