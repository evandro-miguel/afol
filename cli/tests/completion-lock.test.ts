import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
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
});
