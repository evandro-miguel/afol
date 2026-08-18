import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { hostname, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { symlinkTestSupport } from "./symlink-test-support";

const symlinkTest = test.skipIf(!symlinkTestSupport.available);

import {
	resolveTaskCompletionLockPath,
	TaskCompletionBusyError,
	withTaskCompletionLock,
} from "../services/workbench/completion-lock";

function root(name: string): string {
	return mkdtempSync(join(tmpdir(), `completion-lock-${name}-`));
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve = (): void => {};
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe("task completion lock", () => {
	test("serializes a canonical project/session/task and rejects live-owner takeover", async () => {
		const projectRoot = root("serialize");
		const entered = deferred();
		const release = deferred();
		try {
			const first = withTaskCompletionLock(
				projectRoot,
				"session-a",
				"T-01",
				async () => {
					entered.resolve();
					await release.promise;
				},
				{ heartbeatMs: 10 },
			);
			await entered.promise;
			const blocked = withTaskCompletionLock(
				projectRoot,
				"session-a",
				"T-01",
				async () => {},
				{ timeoutMs: 40, heartbeatMs: 10 },
			);
			await expect(blocked).rejects.toBeInstanceOf(TaskCompletionBusyError);
			await expect(blocked).rejects.toMatchObject({
				code: "task_completion_busy",
			});
			release.resolve();
			await first;
			expect(
				existsSync(
					resolveTaskCompletionLockPath(projectRoot, "session-a", "T-01"),
				),
			).toBe(false);
		} finally {
			release.resolve();
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});

	test("done rejects a same-task nested completion attempt with a typed busy error", async () => {
		const projectRoot = root("nested-same-task");
		let nestedActionRan = false;
		try {
			await withTaskCompletionLock(
				projectRoot,
				"session-a",
				"T-01",
				async () => {
					await expect(
						withTaskCompletionLock(
							projectRoot,
							"session-a",
							"T-01",
							async () => {
								nestedActionRan = true;
							},
							{ timeoutMs: 40, heartbeatMs: 10 },
						),
					).rejects.toMatchObject({
						code: "task_completion_busy",
					});
				},
				{ heartbeatMs: 10 },
			);
			expect(nestedActionRan).toBe(false);
			expect(
				existsSync(
					resolveTaskCompletionLockPath(projectRoot, "session-a", "T-01"),
				),
			).toBe(false);
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});

	test("recovers only a provably dead local owner and advances fencing", async () => {
		const projectRoot = root("dead-owner");
		try {
			const lockPath = resolveTaskCompletionLockPath(
				projectRoot,
				"session-a",
				"T-01",
			);
			mkdirSync(dirname(lockPath), { recursive: true });
			writeFileSync(`${lockPath}.fence`, "4\n", "utf8");
			writeFileSync(
				lockPath,
				`${JSON.stringify({
					pid: 2_147_483_647,
					host: hostname().toLowerCase(),
					owner_token: "dead-owner",
					generation: 4,
					acquired_at: "2026-01-01T00:00:00.000Z",
					heartbeat_at: "2026-01-01T00:00:00.000Z",
				})}\n`,
				"utf8",
			);

			let generation = 0;
			await withTaskCompletionLock(
				projectRoot,
				"session-a",
				"T-01",
				async (lease) => {
					generation = lease.generation;
				},
			);
			expect(generation).toBe(5);
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});

	test("fails closed when fencing ownership changes", async () => {
		const projectRoot = root("fencing");
		try {
			await expect(
				withTaskCompletionLock(
					projectRoot,
					"session-a",
					"T-01",
					async (lease) => {
						const lockPath = resolveTaskCompletionLockPath(
							projectRoot,
							"session-a",
							"T-01",
						);
						writeFileSync(
							`${lockPath}.fence`,
							`${lease.generation + 1}\n`,
							"utf8",
						);
						lease.assertOwned();
					},
				),
			).rejects.toThrow("ownership was lost");
			const fencePath = `${resolveTaskCompletionLockPath(
				projectRoot,
				"session-a",
				"T-01",
			)}.fence`;
			expect(readFileSync(fencePath, "utf8").trim()).toBe("2");
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});

	test("removes the acquired lock when fence initialization fails", async () => {
		const projectRoot = root("fence-init");
		try {
			const lockPath = resolveTaskCompletionLockPath(
				projectRoot,
				"session-a",
				"T-01",
			);
			mkdirSync(`${lockPath}.fence`, { recursive: true });

			await expect(
				withTaskCompletionLock(
					projectRoot,
					"session-a",
					"T-01",
					async () => {},
				),
			).rejects.toThrow();
			expect(existsSync(lockPath)).toBe(false);
			expect(existsSync(`${lockPath}.fence`)).toBe(true);
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});

	symlinkTest(
		"rejects a fence symlink without modifying its target",
		async () => {
			const projectRoot = root("fence-symlink");
			try {
				const lockPath = resolveTaskCompletionLockPath(
					projectRoot,
					"session-a",
					"T-01",
				);
				const targetPath = join(projectRoot, "preserve.txt");
				mkdirSync(dirname(lockPath), { recursive: true });
				writeFileSync(targetPath, "preserve\n", "utf8");
				symlinkSync(targetPath, `${lockPath}.fence`, "file");

				await expect(
					withTaskCompletionLock(
						projectRoot,
						"session-a",
						"T-01",
						async () => {},
					),
				).rejects.toThrow();
				expect(readFileSync(targetPath, "utf8")).toBe("preserve\n");
				expect(existsSync(lockPath)).toBe(false);
			} finally {
				rmSync(projectRoot, { recursive: true, force: true });
			}
		},
	);

	for (const [name, content] of [
		["empty", ""],
		["partial", "4"],
		["malformed", "four\n"],
	] as const) {
		test(`rejects ${name} persisted fence generation data`, async () => {
			const projectRoot = root(`fence-${name}`);
			try {
				const lockPath = resolveTaskCompletionLockPath(
					projectRoot,
					"session-a",
					"T-01",
				);
				mkdirSync(dirname(lockPath), { recursive: true });
				writeFileSync(`${lockPath}.fence`, content, "utf8");

				await expect(
					withTaskCompletionLock(
						projectRoot,
						"session-a",
						"T-01",
						async () => {},
					),
				).rejects.toThrow("invalid generation data");
				expect(existsSync(lockPath)).toBe(false);
				expect(readFileSync(`${lockPath}.fence`, "utf8")).toBe(content);
			} finally {
				rmSync(projectRoot, { recursive: true, force: true });
			}
		});
	}

	test("assertOwned rejects an atomic same-metadata replacement", async () => {
		const projectRoot = root("atomic-replacement");
		let lockPath = "";
		try {
			await expect(
				withTaskCompletionLock(
					projectRoot,
					"session-a",
					"T-01",
					async (lease) => {
						lockPath = resolveTaskCompletionLockPath(
							projectRoot,
							"session-a",
							"T-01",
						);
						const replacementPath = `${lockPath}.replacement`;
						writeFileSync(
							replacementPath,
							readFileSync(lockPath, "utf8"),
							"utf8",
						);
						if (process.platform === "win32") unlinkSync(lockPath);
						renameSync(replacementPath, lockPath);
						lease.assertOwned();
					},
					{ heartbeatMs: 60_000 },
				),
			).rejects.toThrow("ownership was lost");
			expect(existsSync(lockPath)).toBe(true);
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});

	test("assertOwned rejects an atomic same-generation fence replacement", async () => {
		const projectRoot = root("atomic-fence-replacement");
		let fencePath = "";
		try {
			await expect(
				withTaskCompletionLock(
					projectRoot,
					"session-a",
					"T-01",
					async (lease) => {
						const lockPath = resolveTaskCompletionLockPath(
							projectRoot,
							"session-a",
							"T-01",
						);
						fencePath = `${lockPath}.fence`;
						const replacementPath = `${fencePath}.replacement`;
						writeFileSync(
							replacementPath,
							readFileSync(fencePath, "utf8"),
							"utf8",
						);
						if (process.platform === "win32") unlinkSync(fencePath);
						renameSync(replacementPath, fencePath);
						lease.assertOwned();
					},
					{ heartbeatMs: 60_000 },
				),
			).rejects.toThrow("ownership was lost");
			expect(existsSync(fencePath)).toBe(true);
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});
});
