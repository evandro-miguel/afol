import { describe, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	closeSession,
	doneTask,
	newWorkstream,
	type RecordEvidenceInput,
	recordEvidence as recordEvidenceRaw,
	sessionPaths,
	startTask,
	transitionTask,
} from "../services/workbench/lifecycle";

function mkRoot(name: string): string {
	return mkdtempSync(join(tmpdir(), `wb-continuation-${name}-`));
}

function initGitRepo(root: string): void {
	for (const args of [
		["init"],
		["config", "user.email", "test@example.com"],
		["config", "user.name", "Test User"],
	] as const) {
		const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
		if (result.status !== 0) {
			throw new Error(
				result.stderr || result.stdout || `git ${args.join(" ")}`,
			);
		}
	}
	writeFileSync(join(root, "README.md"), "fixture\n", "utf8");
	for (const args of [
		["add", "README.md"],
		["commit", "-m", "init"],
	] as const) {
		const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
		if (result.status !== 0) {
			throw new Error(
				result.stderr || result.stdout || `git ${args.join(" ")}`,
			);
		}
	}
}

function writeCliProjectContract(root: string): void {
	mkdirSync(join(root, ".agents"), { recursive: true });
	writeFileSync(
		join(root, ".agents", "config.json"),
		JSON.stringify(
			{
				schema_version: 1,
				paths: {
					agents_dir: ".agents",
					mutable_dir: ".afol",
					wb_dir: ".afol/wb",
					active_session_file: ".afol/wb/.active_session",
					data_dir: ".afol/data",
					data_index_dir: ".afol/data/index",
					events_file: ".afol/data/events/events.jsonl",
				},
			},
			null,
			2,
		),
		"utf8",
	);
	writeFileSync(
		join(root, ".agents", "lock.json"),
		JSON.stringify({ schema_version: 1, locked: true }),
		"utf8",
	);
}

function recordObservedCompletion(root: string, input: RecordEvidenceInput) {
	startTask(root, input);
	transitionTask(root, { ...input, state: "implemented_untested" });
	transitionTask(root, {
		...input,
		state: "tested_needs_spec_validation",
	});
	recordEvidenceRaw(root, {
		...input,
		exitCode: input.exitCode ?? 0,
		provenance: "observed",
	});
	doneTask(root, input);
}

function createFailedCloseFixture(root: string, theme: string) {
	writeCliProjectContract(root);
	initGitRepo(root);
	const created = newWorkstream(root, theme, {
		featureId: "F-30",
		parentSpec: "carry-open-spec",
		tasks: ["invalid completion", "deferred work"],
	});
	recordObservedCompletion(root, {
		session: created.session,
		taskId: "T-01",
		command: "bun test",
		result: "passed",
	});
	writeFileSync(created.evidencePath, "{invalid evidence}\n", "utf8");
	return created;
}

describe("workbench continuation preservation", () => {
	test("failed close preserves callback-written continuation work", () => {
		const root = mkRoot("callback-work");
		try {
			const created = createFailedCloseFixture(root, "carry-open-preserve");
			let continuationId = "";
			let largeWorkPath = "";
			let rollbackCalled = false;
			let closeError: Error | undefined;
			try {
				closeSession(root, created.session, {
					carryOpen: true,
					reason: "wait for dependency",
					onContinuationCreated: (session) => {
						continuationId = session;
						largeWorkPath = join(
							sessionPaths(root, session).sessionDir,
							"large-work-in-progress.bin",
						);
						writeFileSync(
							join(
								sessionPaths(root, session).sessionDir,
								"work-in-progress.md",
							),
							"callback work\n",
							"utf8",
						);
						writeFileSync(
							largeWorkPath,
							Buffer.alloc(2 * 1024 * 1024 + 1, 0x78),
						);
					},
					onContinuationRollback: () => {
						rollbackCalled = true;
					},
				});
			} catch (error) {
				closeError = error as Error;
			}

			expect(closeError?.message).toContain("failed strict verification");
			expect(closeError?.message).toContain(
				`preserved continuation ${continuationId}`,
			);
			expect(rollbackCalled).toBe(false);
			expect(existsSync(sessionPaths(root, continuationId).sessionDir)).toBe(
				true,
			);
			expect(
				readFileSync(
					join(
						sessionPaths(root, continuationId).sessionDir,
						"work-in-progress.md",
					),
					"utf8",
				),
			).toBe("callback work\n");
			expect(readFileSync(largeWorkPath).byteLength).toBe(2 * 1024 * 1024 + 1);
			expect(readFileSync(created.taskPath, "utf8")).toContain(
				`destination=${continuationId}`,
			);
			expect(readFileSync(created.activeSessionPath, "utf8").trim()).toBe(
				continuationId,
			);
			startTask(root, { session: continuationId, taskId: "T-01" });
			expect(
				readFileSync(sessionPaths(root, continuationId).taskPath, "utf8"),
			).toContain("| T-01 | in_progress |");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("failed close preserves a replaced continuation path", () => {
		const root = mkRoot("symlink-replacement");
		try {
			const created = createFailedCloseFixture(root, "carry-open-symlink");
			const externalDir = join(root, "external-target");
			const externalMarker = join(externalDir, "keep.txt");
			mkdirSync(externalDir);
			writeFileSync(externalMarker, "untouched\n", "utf8");

			let continuationId = "";
			let rollbackCalled = false;
			let closeError: Error | undefined;
			try {
				closeSession(root, created.session, {
					carryOpen: true,
					reason: "wait for dependency",
					onContinuationCreated: (session) => {
						continuationId = session;
						const sessionDir = sessionPaths(root, session).sessionDir;
						renameSync(sessionDir, `${sessionDir}.preserved`);
						symlinkSync(externalDir, sessionDir, "dir");
					},
					onContinuationRollback: () => {
						rollbackCalled = true;
					},
				});
			} catch (error) {
				closeError = error as Error;
			}

			expect(closeError?.message).toContain(
				`preserved continuation ${continuationId}`,
			);
			expect(rollbackCalled).toBe(false);
			expect(readFileSync(externalMarker, "utf8")).toBe("untouched\n");
			expect(
				readFileSync(
					`${sessionPaths(root, continuationId).sessionDir}.preserved/${continuationId}_task_01.md`,
					"utf8",
				),
			).toContain("continuation_of:");
			expect(readFileSync(created.taskPath, "utf8")).toContain(
				`destination=${continuationId}`,
			);
			expect(readFileSync(created.activeSessionPath, "utf8").trim()).toBe(
				continuationId,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("failed close preserves a concurrent child-process write", async () => {
		const root = mkRoot("concurrent-work");
		try {
			const created = createFailedCloseFixture(root, "carry-open-concurrent");
			const gate = join(root, "continuation-ready.txt");
			const completed = join(root, "concurrent-write-complete.txt");
			const childScript = [
				'const { existsSync, readFileSync, writeFileSync } = require("node:fs");',
				'const { join } = require("node:path");',
				`const gate = ${JSON.stringify(gate)};`,
				`const completed = ${JSON.stringify(completed)};`,
				`const wbRoot = ${JSON.stringify(created.sessionDir.slice(0, created.sessionDir.lastIndexOf("/")))};`,
				"const wait = new Int32Array(new SharedArrayBuffer(4));",
				"const deadline = Date.now() + 10000;",
				"while (!existsSync(gate) && Date.now() < deadline) Atomics.wait(wait, 0, 0, 5);",
				"if (!existsSync(gate)) process.exit(2);",
				"const session = readFileSync(gate, 'utf8').trim();",
				"writeFileSync(join(wbRoot, session, 'work-in-progress.md'), 'child process work\\n', 'utf8');",
				"writeFileSync(completed, session + '\\n', 'utf8');",
			].join("\n");
			const child = spawn("bun", ["-e", childScript], {
				cwd: root,
				stdio: ["ignore", "ignore", "pipe"],
			});
			let childStderr = "";
			child.stderr?.on("data", (chunk: Buffer) => {
				childStderr += chunk.toString();
			});
			const childExit = new Promise<{
				code: number | null;
				signal: NodeJS.Signals | null;
			}>((resolve, reject) => {
				child.once("error", reject);
				child.once("exit", (code, signal) => resolve({ code, signal }));
			});

			let continuationId = "";
			let closeError: Error | undefined;
			try {
				closeSession(root, created.session, {
					carryOpen: true,
					reason: "wait for dependency",
					onContinuationCreated: (session) => {
						continuationId = session;
						writeFileSync(gate, `${session}\n`, "utf8");
						const wait = new Int32Array(new SharedArrayBuffer(4));
						const deadline = Date.now() + 10000;
						while (!existsSync(completed) && Date.now() < deadline) {
							Atomics.wait(wait, 0, 0, 5);
						}
						if (!existsSync(completed)) {
							throw new Error("Concurrent child did not write its marker.");
						}
					},
				});
			} catch (error) {
				closeError = error as Error;
			}
			const childResult = await childExit;
			expect(childResult.code).toBe(0);
			expect(childStderr).toBe("");
			expect(closeError?.message).toContain(
				`preserved continuation ${continuationId}`,
			);
			expect(readFileSync(completed, "utf8").trim()).toBe(continuationId);
			expect(
				readFileSync(
					join(
						sessionPaths(root, continuationId).sessionDir,
						"work-in-progress.md",
					),
					"utf8",
				),
			).toBe("child process work\n");
			expect(readFileSync(created.taskPath, "utf8")).toContain(
				`destination=${continuationId}`,
			);
			expect(readFileSync(created.activeSessionPath, "utf8").trim()).toBe(
				continuationId,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
