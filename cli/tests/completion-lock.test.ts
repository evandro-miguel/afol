import { describe, expect, spyOn, test } from "bun:test";
import * as nodeFs from "node:fs";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { hostname, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	resolveTaskCompletionLockPath,
	TaskCompletionBusyError,
	withTaskCompletionLock,
} from "../services/workbench/completion-lock";

function root(name: string): string {
	return mkdtempSync(join(tmpdir(), `completion-lock-${name}-`));
}
function metadata(pid = process.pid): string {
	const now = new Date().toISOString();
	return `${JSON.stringify({ pid, host: hostname().toLowerCase(), owner_token: "owner", ownership_probe: "probe", generation: 1, acquired_at: now, heartbeat_at: now })}\n`;
}
function legacyMetadata(pid = process.pid): string {
	const now = new Date().toISOString();
	return `${JSON.stringify({ pid, host: hostname().toLowerCase(), owner_token: "owner", generation: 1, acquired_at: now, heartbeat_at: now })}\n`;
}
function deferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve = (): void => {};
	return {
		promise: new Promise((done) => {
			resolve = done;
		}),
		resolve,
	};
}

describe("task completion lock v2", () => {
	test("publishes a regular immutable file lease and removes it after release", async () => {
		const projectRoot = root("file");
		const lockPath = resolveTaskCompletionLockPath(projectRoot, "s", "T-01");
		try {
			await withTaskCompletionLock(projectRoot, "s", "T-01", async () => {
				expect(lstatSync(lockPath).isFile()).toBe(true);
				expect(JSON.parse(readFileSync(lockPath, "utf8")).generation).toBe(1);
			});
			expect(existsSync(lockPath)).toBe(false);
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});
	test("serializes a live successor race through link no-replace", async () => {
		const projectRoot = root("race"),
			entered = deferred(),
			release = deferred();
		let active = 0,
			maximum = 0;
		try {
			const first = withTaskCompletionLock(
				projectRoot,
				"s",
				"T-01",
				async () => {
					active++;
					maximum = Math.max(maximum, active);
					entered.resolve();
					await release.promise;
					active--;
				},
			);
			await entered.promise;
			const second = withTaskCompletionLock(
				projectRoot,
				"s",
				"T-01",
				async () => {
					active++;
					maximum = Math.max(maximum, active);
					active--;
				},
				{ timeoutMs: 40 },
			);
			await expect(second).rejects.toBeInstanceOf(TaskCompletionBusyError);
			release.resolve();
			await first;
			expect(maximum).toBe(1);
		} finally {
			release.resolve();
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});
	test("recovers only a dead legacy file and advances the fence", async () => {
		const projectRoot = root("legacy-file"),
			lockPath = resolveTaskCompletionLockPath(projectRoot, "s", "T-01");
		let generation = 0;
		try {
			mkdirSync(dirname(lockPath), { recursive: true });
			writeFileSync(`${lockPath}.fence`, "4\n");
			writeFileSync(lockPath, metadata(2_147_483_647));
			await withTaskCompletionLock(projectRoot, "s", "T-01", async (lease) => {
				generation = lease.generation;
			});
			expect(generation).toBe(5);
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});
	test("recovers a dead v1 legacy file without an ownership probe", async () => {
		const projectRoot = root("legacy-v1-file"),
			lockPath = resolveTaskCompletionLockPath(projectRoot, "s", "T-01");
		let generation = 0;
		try {
			mkdirSync(dirname(lockPath), { recursive: true });
			writeFileSync(`${lockPath}.fence`, "4\n");
			writeFileSync(lockPath, legacyMetadata(2_147_483_647));
			await withTaskCompletionLock(
				projectRoot,
				"s",
				"T-01",
				async (lease) => {
					generation = lease.generation;
				},
				{ timeoutMs: 40 },
			);
			expect(generation).toBe(5);
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});
	test("recovers only a dead legacy directory", async () => {
		const projectRoot = root("legacy-directory"),
			lockPath = resolveTaskCompletionLockPath(projectRoot, "s", "T-01");
		try {
			mkdirSync(lockPath, { recursive: true });
			writeFileSync(join(lockPath, "owner.json"), metadata(2_147_483_647));
			await expect(
				withTaskCompletionLock(projectRoot, "s", "T-01", async () => {}),
			).resolves.toBeUndefined();
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});
	test("does not reclaim an active prepared candidate", async () => {
		const projectRoot = root("active-prepared"),
			lockPath = resolveTaskCompletionLockPath(projectRoot, "s", "T-01"),
			prepared = `${lockPath}.prepared-active`;
		try {
			mkdirSync(dirname(lockPath), { recursive: true });
			writeFileSync(prepared, metadata());
			await expect(
				withTaskCompletionLock(projectRoot, "s", "T-01", async () => {}, {
					timeoutMs: 40,
				}),
			).resolves.toBeUndefined();
			expect(existsSync(prepared)).toBe(true);
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});
	test("removes a dead prepared orphan before acquiring", async () => {
		const projectRoot = root("stale-prepared"),
			lockPath = resolveTaskCompletionLockPath(projectRoot, "s", "T-01"),
			prepared = `${lockPath}.prepared-stale`;
		try {
			mkdirSync(dirname(lockPath), { recursive: true });
			writeFileSync(prepared, metadata(2_147_483_647));
			await withTaskCompletionLock(projectRoot, "s", "T-01", async () => {});
			expect(existsSync(prepared)).toBe(false);
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});
	test("does not reclaim forged prepared artifacts", async () => {
		const projectRoot = root("forged"),
			lockPath = resolveTaskCompletionLockPath(projectRoot, "s", "T-01"),
			prepared = `${lockPath}.prepared-forged`;
		try {
			mkdirSync(dirname(lockPath), { recursive: true });
			writeFileSync(prepared, "forged\n");
			await withTaskCompletionLock(projectRoot, "s", "T-01", async () => {});
			expect(existsSync(prepared)).toBe(true);
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});
	test("releases via rename without deleting a successor", async () => {
		const projectRoot = root("successor"),
			lockPath = resolveTaskCompletionLockPath(projectRoot, "s", "T-01");
		try {
			await expect(
				withTaskCompletionLock(projectRoot, "s", "T-01", async () => {
					renameSync(lockPath, `${lockPath}.tombstone-crash`);
					writeFileSync(lockPath, metadata());
				}),
			).rejects.toThrow("ownership was lost");
			expect(existsSync(lockPath)).toBe(true);
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});
	test("reacquires after a crash immediately after canonical-to-tombstone rename", async () => {
		const projectRoot = root("crash-after-rename"),
			lockPath = resolveTaskCompletionLockPath(projectRoot, "s", "T-01"),
			originalRename = nodeFs.renameSync;
		let injected = false;
		const rename = spyOn(nodeFs, "renameSync").mockImplementation(((
			from: Parameters<typeof nodeFs.renameSync>[0],
			to: Parameters<typeof nodeFs.renameSync>[1],
		) => {
			const result = originalRename(from, to);
			if (String(from) === lockPath && !injected) {
				injected = true;
				throw new Error("crash-after-rename");
			}
			return result;
		}) as typeof nodeFs.renameSync);
		try {
			await withTaskCompletionLock(projectRoot, "s", "T-01", async () => {});
			expect(injected).toBe(true);
			await expect(
				withTaskCompletionLock(projectRoot, "s", "T-01", async () => {}),
			).resolves.toBeUndefined();
		} finally {
			rename.mockRestore();
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});
	test("leaves a forged tombstone artifact as an observable orphan", async () => {
		const projectRoot = root("forged-tombstone"),
			lockPath = resolveTaskCompletionLockPath(projectRoot, "s", "T-01"),
			forged = `${lockPath}.tombstone-forged`;
		try {
			mkdirSync(dirname(lockPath), { recursive: true });
			writeFileSync(forged, "forged\n");
			await withTaskCompletionLock(projectRoot, "s", "T-01", async () => {});
			expect(existsSync(forged)).toBe(true);
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});
	test("fails a successful action after heartbeat ownership loss aborts it", async () => {
		const projectRoot = root("abort-after-loss"),
			lockPath = resolveTaskCompletionLockPath(projectRoot, "s", "T-01");
		try {
			await expect(
				withTaskCompletionLock(
					projectRoot,
					"s",
					"T-01",
					async () => {
						unlinkSync(lockPath);
						await new Promise((resolve) => setTimeout(resolve, 30));
					},
					{ heartbeatMs: 1 },
				),
			).rejects.toThrow("ownership was lost");
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});
	test("preserves an action-thrown lock-lost error after heartbeat loss", async () => {
		const projectRoot = root("action-error-after-loss"),
			lockPath = resolveTaskCompletionLockPath(projectRoot, "s", "T-01"),
			actionError = new Error("action lock_lost");
		try {
			await expect(
				withTaskCompletionLock(
					projectRoot,
					"s",
					"T-01",
					async () => {
						unlinkSync(lockPath);
						await new Promise((resolve) => setTimeout(resolve, 30));
						throw actionError;
					},
					{ heartbeatMs: 1 },
				),
			).rejects.toBe(actionError);
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});
});
