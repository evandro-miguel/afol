import { describe, expect, test } from "bun:test";
import {
	closeSync,
	existsSync,
	fsyncSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	openSync,
	readdirSync,
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

function supportsFileSymlinks(): boolean {
	const projectRoot = root("symlink-capability");
	try {
		const targetPath = join(projectRoot, "target.txt");
		writeFileSync(targetPath, "target\n", "utf8");
		symlinkSync(targetPath, join(projectRoot, "link.txt"), "file");
		return true;
	} catch {
		return false;
	} finally {
		rmSync(projectRoot, { recursive: true, force: true });
	}
}

function supportsReplacingOpenFiles(): boolean {
	const projectRoot = root("replace-open-capability");
	let fd: number | null = null;
	try {
		const targetPath = join(projectRoot, "target.txt");
		const replacementPath = join(projectRoot, "replacement.txt");
		writeFileSync(targetPath, "target\n", "utf8");
		writeFileSync(replacementPath, "replacement\n", "utf8");
		fd = openSync(targetPath, "r+");
		renameSync(replacementPath, targetPath);
		return true;
	} catch {
		return false;
	} finally {
		if (fd !== null) closeSync(fd);
		rmSync(projectRoot, { recursive: true, force: true });
	}
}

function fenceTempEntries(lockPath: string): string[] {
	return readdirSync(dirname(lockPath)).filter((entry) =>
		entry.includes(".fence.tmp-"),
	);
}

function existingError(): Error & { code: string } {
	const error = new Error("injected EEXIST") as Error & { code: string };
	error.code = "EEXIST";
	return error;
}

const CAN_CREATE_FILE_SYMLINK = supportsFileSymlinks();
const CAN_REPLACE_OPEN_FILE = supportsReplacingOpenFiles();

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

	test("creates a fresh fence without truncating it", async () => {
		const projectRoot = root("fresh-fence-no-truncate");
		let truncateCalls = 0;
		let publishedSameIdentity = false;
		try {
			const lockPath = resolveTaskCompletionLockPath(
				projectRoot,
				"session-a",
				"T-01",
			);
			const fencePath = `${lockPath}.fence`;
			let generation = 0;
			await withTaskCompletionLock(
				projectRoot,
				"session-a",
				"T-01",
				async (lease) => {
					generation = lease.generation;
				},
				{
					fenceIo: {
						truncate: () => {
							truncateCalls += 1;
							throw new Error("injected fresh-fence EPERM");
						},
						unlink: (temporaryPath) => {
							const temporary = lstatSync(temporaryPath, { bigint: true });
							const canonical = lstatSync(fencePath, { bigint: true });
							publishedSameIdentity =
								temporary.dev === canonical.dev &&
								temporary.ino === canonical.ino;
							unlinkSync(temporaryPath);
						},
					},
				},
			);
			expect(generation).toBe(1);
			expect(truncateCalls).toBe(0);
			expect(publishedSameIdentity).toBe(true);
			expect(readFileSync(fencePath, "utf8")).toBe("1\n");

			await withTaskCompletionLock(
				projectRoot,
				"session-a",
				"T-01",
				async (lease) => {
					generation = lease.generation;
				},
			);
			expect(generation).toBe(2);
			expect(readFileSync(fencePath, "utf8")).toBe("2\n");
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});

	test("fails before publishing when fresh fence write fails", async () => {
		const projectRoot = root("fresh-fence-write-failure");
		let actionRan = false;
		try {
			const lockPath = resolveTaskCompletionLockPath(
				projectRoot,
				"session-a",
				"T-01",
			);
			await expect(
				withTaskCompletionLock(
					projectRoot,
					"session-a",
					"T-01",
					async () => {
						actionRan = true;
					},
					{
						fenceIo: {
							write: () => {
								throw new Error("injected fresh write failure");
							},
						},
					},
				),
			).rejects.toThrow("injected fresh write failure");
			expect(actionRan).toBe(false);
			expect(existsSync(`${lockPath}.fence`)).toBe(false);
			expect(existsSync(lockPath)).toBe(false);
			expect(fenceTempEntries(lockPath)).toEqual([]);
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});

	test("fails before publishing when fresh fence sync fails", async () => {
		const projectRoot = root("fresh-fence-sync-failure");
		let actionRan = false;
		try {
			const lockPath = resolveTaskCompletionLockPath(
				projectRoot,
				"session-a",
				"T-01",
			);
			await expect(
				withTaskCompletionLock(
					projectRoot,
					"session-a",
					"T-01",
					async () => {
						actionRan = true;
					},
					{
						fenceIo: {
							sync: () => {
								throw new Error("injected fresh sync failure");
							},
						},
					},
				),
			).rejects.toThrow("injected fresh sync failure");
			expect(actionRan).toBe(false);
			expect(existsSync(`${lockPath}.fence`)).toBe(false);
			expect(existsSync(lockPath)).toBe(false);
			expect(fenceTempEntries(lockPath)).toEqual([]);
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});

	test("fails closed when fresh fence publication collides", async () => {
		const projectRoot = root("fresh-fence-link-collision");
		let actionRan = false;
		try {
			const lockPath = resolveTaskCompletionLockPath(
				projectRoot,
				"session-a",
				"T-01",
			);
			const fencePath = `${lockPath}.fence`;
			await expect(
				withTaskCompletionLock(
					projectRoot,
					"session-a",
					"T-01",
					async () => {
						actionRan = true;
					},
					{
						fenceIo: {
							link: (_temporary, canonical) => {
								writeFileSync(canonical, "7\n", "utf8");
								throw existingError();
							},
						},
					},
				),
			).rejects.toThrow("concurrently created");
			expect(actionRan).toBe(false);
			expect(readFileSync(fencePath, "utf8")).toBe("7\n");
			expect(existsSync(lockPath)).toBe(false);
			expect(fenceTempEntries(lockPath)).toEqual([]);
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});

	test("fails closed when fresh fence temporary alias cleanup fails", async () => {
		const projectRoot = root("fresh-fence-temp-cleanup-failure");
		let actionRan = false;
		try {
			const lockPath = resolveTaskCompletionLockPath(
				projectRoot,
				"session-a",
				"T-01",
			);
			const fencePath = `${lockPath}.fence`;
			await expect(
				withTaskCompletionLock(
					projectRoot,
					"session-a",
					"T-01",
					async () => {
						actionRan = true;
					},
					{
						fenceIo: {
							unlink: () => {
								throw new Error("injected temporary cleanup failure");
							},
						},
					},
				),
			).rejects.toThrow("temporary alias could not be removed");
			expect(actionRan).toBe(false);
			expect(existsSync(lockPath)).toBe(false);
			expect(readFileSync(fencePath, "utf8")).toBe("1\n");

			const temporaryEntries = fenceTempEntries(lockPath);
			expect(temporaryEntries).toHaveLength(1);
			const temporaryPath = join(dirname(lockPath), temporaryEntries[0] ?? "");
			const canonical = lstatSync(fencePath, { bigint: true });
			const temporary = lstatSync(temporaryPath, { bigint: true });
			expect(temporary.dev).toBe(canonical.dev);
			expect(temporary.ino).toBe(canonical.ino);
			expect(readFileSync(temporaryPath, "utf8")).toBe("1\n");

			let generation = 0;
			await withTaskCompletionLock(
				projectRoot,
				"session-a",
				"T-01",
				async (lease) => {
					generation = lease.generation;
				},
			);
			expect(generation).toBe(2);
			expect(readFileSync(fencePath, "utf8")).toBe("2\n");
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});

	test("cleans up the lock when persisted fence replacement fails", async () => {
		const projectRoot = root("persisted-fence-truncate-failure");
		let truncateCalls = 0;
		let actionRan = false;
		try {
			const lockPath = resolveTaskCompletionLockPath(
				projectRoot,
				"session-a",
				"T-01",
			);
			const fencePath = `${lockPath}.fence`;
			mkdirSync(dirname(lockPath), { recursive: true });
			writeFileSync(fencePath, "1\n", "utf8");

			await expect(
				withTaskCompletionLock(
					projectRoot,
					"session-a",
					"T-01",
					async () => {
						actionRan = true;
					},
					{
						fenceIo: {
							truncate: () => {
								truncateCalls += 1;
								throw new Error("injected persisted-fence EPERM");
							},
						},
					},
				),
			).rejects.toThrow("injected persisted-fence EPERM");
			expect(actionRan).toBe(false);
			expect(truncateCalls).toBe(1);
			expect(existsSync(lockPath)).toBe(false);
			expect(readFileSync(fencePath, "utf8")).toBe("1\n");
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});

	test("restores a persisted fence after a replacement write failure", async () => {
		const projectRoot = root("persisted-fence-write-restore");
		let actionRan = false;
		try {
			const lockPath = resolveTaskCompletionLockPath(
				projectRoot,
				"session-a",
				"T-01",
			);
			const fencePath = `${lockPath}.fence`;
			mkdirSync(dirname(lockPath), { recursive: true });
			writeFileSync(fencePath, "1\n", "utf8");

			await expect(
				withTaskCompletionLock(
					projectRoot,
					"session-a",
					"T-01",
					async () => {
						actionRan = true;
					},
					{
						fenceIo: {
							write: (fd, value) => {
								if (value === "2\n") {
									throw new Error("injected persisted write failure");
								}
								writeFileSync(fd, value, "utf8");
							},
						},
					},
				),
			).rejects.toThrow("injected persisted write failure");
			expect(actionRan).toBe(false);
			expect(existsSync(lockPath)).toBe(false);
			expect(readFileSync(fencePath, "utf8")).toBe("1\n");
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});

	test("restores a persisted fence after a single replacement sync failure", async () => {
		const projectRoot = root("persisted-fence-sync-restore");
		let syncCalls = 0;
		let actionRan = false;
		try {
			const lockPath = resolveTaskCompletionLockPath(
				projectRoot,
				"session-a",
				"T-01",
			);
			const fencePath = `${lockPath}.fence`;
			mkdirSync(dirname(lockPath), { recursive: true });
			writeFileSync(fencePath, "1\n", "utf8");

			await expect(
				withTaskCompletionLock(
					projectRoot,
					"session-a",
					"T-01",
					async () => {
						actionRan = true;
					},
					{
						fenceIo: {
							sync: (fd) => {
								syncCalls += 1;
								if (syncCalls === 1) {
									throw new Error("injected persisted sync failure");
								}
								fsyncSync(fd);
							},
						},
					},
				),
			).rejects.toThrow("injected persisted sync failure");
			expect(syncCalls).toBe(2);
			expect(actionRan).toBe(false);
			expect(existsSync(lockPath)).toBe(false);
			expect(readFileSync(fencePath, "utf8")).toBe("1\n");
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});

	test("reports a hard failure when persisted fence recovery also fails", async () => {
		const projectRoot = root("persisted-fence-recovery-failure");
		let actionRan = false;
		try {
			const lockPath = resolveTaskCompletionLockPath(
				projectRoot,
				"session-a",
				"T-01",
			);
			const fencePath = `${lockPath}.fence`;
			mkdirSync(dirname(lockPath), { recursive: true });
			writeFileSync(fencePath, "1\n", "utf8");

			const failure = await withTaskCompletionLock(
				projectRoot,
				"session-a",
				"T-01",
				async () => {
					actionRan = true;
				},
				{
					fenceIo: {
						write: () => {
							throw new Error("injected unrecoverable write failure");
						},
					},
				},
			).catch((error: unknown) => error);
			expect(failure).toBeInstanceOf(AggregateError);
			expect((failure as AggregateError).message).toContain(
				"could not be restored",
			);
			expect((failure as AggregateError).errors).toHaveLength(2);
			expect(actionRan).toBe(false);
			expect(existsSync(lockPath)).toBe(false);
			expect(readFileSync(fencePath, "utf8")).toBe("");
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});

	test.skipIf(!CAN_CREATE_FILE_SYMLINK)(
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

	test.skipIf(!CAN_REPLACE_OPEN_FILE)(
		"assertOwned rejects an atomic same-metadata replacement",
		async () => {
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
		},
	);

	test.skipIf(!CAN_REPLACE_OPEN_FILE)(
		"assertOwned rejects an atomic same-generation fence replacement",
		async () => {
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
		},
	);
});
