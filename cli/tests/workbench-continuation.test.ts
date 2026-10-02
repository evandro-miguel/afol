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
import { resolveWorkbenchEventLogPath } from "../services/local-state/workbench-events";
import {
	rebuildWorkBenchIndex,
	validateWorkBenchIndex,
} from "../services/local-state/workbench-index";
import { resolveProjectPaths } from "../services/project/paths";
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
import {
	bindSession,
	compensateCarriedContinuationBinding,
	readSessionContext,
	resolveSession,
} from "../services/workbench/session-context";

const kernelPath = `${process.cwd()}/cli/main.ts`;

function mkRoot(name: string): string {
	return mkdtempSync(join(tmpdir(), `wb-continuation-${name}-`));
}

function recordObservedSuccess(root: string, input: RecordEvidenceInput) {
	return recordEvidenceRaw(root, {
		...input,
		exitCode: input.exitCode ?? 0,
		provenance: "observed",
	});
}

function recordObservedCompletion(root: string, input: RecordEvidenceInput) {
	const taskPath = join(
		resolveProjectPaths(root).abs.wbDir,
		input.session,
		`${input.session}_task_01.md`,
	);
	const state = (): string => {
		const match = readFileSync(taskPath, "utf8").match(
			new RegExp(`^\\|\\s*${input.taskId}\\s*\\|\\s*([^|]+)\\|`, "m"),
		);
		return match?.[1]?.trim() ?? "";
	};
	if (state() === "pending") {
		startTask(root, input);
	}
	if (state() === "in_progress") {
		transitionTask(root, { ...input, state: "implemented_untested" });
	}
	if (state() === "implemented_untested") {
		transitionTask(root, {
			...input,
			state: "tested_needs_spec_validation",
		});
	}
	return recordObservedSuccess(root, input);
}

function runKernel(cwd: string, args: string[]): ReturnType<typeof spawnSync> {
	return spawnSync("bun", [kernelPath, ...args], {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
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

function readLocalStateEvents(root: string): Array<Record<string, unknown>> {
	const path = resolveWorkbenchEventLogPath(root);
	if (!existsSync(path)) {
		return [];
	}
	return readFileSync(path, "utf8")
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((line) => JSON.parse(line) as Record<string, unknown>);
}

function writeProviderCompatibleConfig(root: string): void {
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
}

function writeCliProjectContract(root: string): void {
	writeProviderCompatibleConfig(root);
	writeFileSync(
		join(root, ".agents", "lock.json"),
		JSON.stringify({ schema_version: 1, locked: true }),
		"utf8",
	);
}

function parseEnvelope(stdout: string): Record<string, unknown> {
	return JSON.parse(stdout) as Record<string, unknown>;
}

describe("workbench continuation service", () => {
	test("closeSession carries open tasks into one governed continuation", () => {
		const root = mkRoot("close-carry-open");
		try {
			const created = newWorkstream(root, "carry-open", {
				featureId: "F-30",
				parentSpec: "carry-open-spec",
				tasks: ["finished work", "blocked work"],
			});
			startTask(root, { session: created.session, taskId: "T-01" });
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });
			startTask(root, { session: created.session, taskId: "T-02" });
			transitionTask(root, {
				session: created.session,
				taskId: "T-02",
				state: "problem",
				reason: "external dependency is unavailable",
			});

			const result = closeSession(root, created.session, {
				carryOpen: true,
				reason: "continue after dependency recovery",
			});
			const continuationId = result.continuation;
			expect(continuationId).toBeTruthy();
			if (!continuationId)
				throw new Error("Expected a carry-open continuation.");
			expect(readFileSync(created.taskPath, "utf8")).toContain(
				'status: "closed"',
			);
			expect(readFileSync(created.taskPath, "utf8")).toContain(
				"| T-02 | moved |",
			);
			expect(readFileSync(created.taskPath, "utf8")).toContain(
				`destination=${continuationId} reason=continue after dependency recovery`,
			);
			const report = readFileSync(join(root, result.report.path ?? ""), "utf8");
			expect(report).toContain("- T-02: moved");
			const continuation = sessionPaths(root, continuationId);
			const continuationTask = readFileSync(continuation.taskPath, "utf8");
			expect(continuationTask).toContain('feature_id: "F-30"');
			expect(continuationTask).toContain('parent_spec: "carry-open-spec"');
			expect(continuationTask).toContain(
				`continuation_of: "${created.session}"`,
			);
			expect(continuationTask).toContain('carry_open_tasks: "T-02"');
			expect(continuationTask).toContain("| T-01 | pending |");
			expect(readFileSync(created.activeSessionPath, "utf8").trim()).toBe(
				continuationId,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("failed carry-open close preserves a linked continuation and retry reuses it", () => {
		const root = mkRoot("close-carry-open-compensation");
		try {
			writeCliProjectContract(root);
			initGitRepo(root);
			const created = newWorkstream(root, "carry-open-compensation", {
				featureId: "F-30",
				parentSpec: "carry-open-spec",
				tasks: ["invalid completion", "deferred work"],
			});
			const branch = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
				cwd: root,
				encoding: "utf8",
			}).stdout.trim();
			bindSession(root, { session: created.session, branch, worktree: root });
			startTask(root, { session: created.session, taskId: "T-01" });
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });
			const validEvidence = readFileSync(created.evidencePath, "utf8");
			writeFileSync(created.evidencePath, "{invalid evidence}\n", "utf8");
			rebuildWorkBenchIndex(root);
			expect(validateWorkBenchIndex(root).ok).toBe(true);
			const eventsBefore = readLocalStateEvents(root);
			const closeArgs = [
				"close",
				"--session",
				created.session,
				"--carry-open",
				"--reason",
				"wait for dependency",
				"--json",
			];
			const close = runKernel(root, closeArgs);
			expect(close.status).toBe(2);
			const sourceAfterFailure = readFileSync(created.taskPath, "utf8");
			const continuationId = sourceAfterFailure.match(
				/^\| T-02 \| moved \|[^|]*\|[^|]*destination=([^\s|]+)/m,
			)?.[1];
			expect(continuationId).toBeTruthy();
			if (!continuationId) throw new Error("Expected a linked continuation.");
			const continuation = sessionPaths(root, continuationId);
			expect(sourceAfterFailure).toContain(
				`destination=${continuationId} reason=wait for dependency`,
			);
			expect(existsSync(continuation.sessionDir)).toBe(true);
			expect(readFileSync(continuation.taskPath, "utf8")).toContain(
				`continuation_of: "${created.session}"`,
			);
			expect(readFileSync(continuation.taskPath, "utf8")).toContain(
				'status: "active"',
			);
			expect(readFileSync(created.activeSessionPath, "utf8").trim()).toBe(
				continuationId,
			);
			expect(readLocalStateEvents(root)).toEqual(eventsBefore);
			expect(resolveSession(root, {})).toEqual({
				session: continuationId,
				source: "context",
			});
			const indexValidation = validateWorkBenchIndex(root);
			if (!indexValidation.ok) throw new Error(indexValidation.message);

			writeFileSync(created.evidencePath, validEvidence, "utf8");
			const retry = runKernel(root, closeArgs);
			expect(retry.status).toBe(0);
			const retryData = parseEnvelope(retry.stdout as string).data as {
				continuation?: string;
			};
			expect(retryData.continuation).toBe(continuationId);
			expect(readFileSync(created.taskPath, "utf8")).toContain(
				'status: "closed"',
			);
			expect(existsSync(continuation.sessionDir)).toBe(true);
			expect(resolveSession(root, {})).toEqual({
				session: continuationId,
				source: "context",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("failed carry-open close preserves callback-written continuation work", () => {
		const root = mkRoot("close-carry-open-preserve-callback-work");
		try {
			writeCliProjectContract(root);
			initGitRepo(root);
			const created = newWorkstream(root, "carry-open-preserve", {
				featureId: "F-30",
				parentSpec: "carry-open-spec",
				tasks: ["deferred work"],
			});
			writeFileSync(created.evidencePath, "{invalid evidence}\n", "utf8");

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

	test("failed carry-open close preserves a replaced continuation path", () => {
		const root = mkRoot("close-carry-open-symlink-replacement");
		try {
			writeCliProjectContract(root);
			initGitRepo(root);
			const created = newWorkstream(root, "carry-open-symlink", {
				featureId: "F-30",
				parentSpec: "carry-open-spec",
				tasks: ["deferred work"],
			});
			writeFileSync(created.evidencePath, "{invalid evidence}\n", "utf8");
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

	test("failed carry-open close preserves a concurrent child-process write", async () => {
		const root = mkRoot("close-carry-open-preserve-child-work");
		try {
			writeCliProjectContract(root);
			initGitRepo(root);
			const created = newWorkstream(root, "carry-open-concurrent", {
				featureId: "F-30",
				parentSpec: "carry-open-spec",
				tasks: ["deferred work"],
			});
			writeFileSync(created.evidencePath, "{invalid evidence}\n", "utf8");
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

	test("close carry-open binds the continuation and removes the source context", () => {
		const root = mkRoot("close-carry-open-context");
		try {
			writeCliProjectContract(root);
			initGitRepo(root);
			const created = newWorkstream(root, "carry-open-context", {
				featureId: "F-30",
				parentSpec: "carry-open-spec",
				tasks: ["completed", "deferred"],
			});
			const branch = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
				cwd: root,
				encoding: "utf8",
			}).stdout.trim();
			bindSession(root, { session: created.session, branch, worktree: root });
			startTask(root, { session: created.session, taskId: "T-01" });
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });
			const close = runKernel(root, [
				"close",
				"--session",
				created.session,
				"--carry-open",
				"--reason",
				"dependency pending",
				"--json",
			]);
			expect(close.status).toBe(0);
			const continuation = (
				parseEnvelope(close.stdout as string).data as {
					continuation: string;
				}
			).continuation;
			expect(resolveSession(root, {})).toEqual({
				session: continuation,
				source: "context",
			});
			expect(
				readSessionContext(root).bindings.map((entry) => entry.session),
			).toEqual([continuation]);
			expect(readFileSync(created.activeSessionPath, "utf8").trim()).toBe(
				continuation,
			);
			const repeated = runKernel(root, [
				"close",
				"--session",
				created.session,
				"--carry-open",
				"--reason",
				"dependency pending",
				"--json",
			]);
			expect(repeated.status).toBe(0);
			expect(
				(
					parseEnvelope(repeated.stdout as string).data as {
						continuation?: string;
					}
				).continuation,
			).toBeUndefined();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("carry-open binding compensation preserves a concurrent replacement", () => {
		const root = mkRoot("carry-open-context-interleave");
		try {
			initGitRepo(root);
			const branch = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
				cwd: root,
				encoding: "utf8",
			}).stdout.trim();
			bindSession(root, { session: "source", branch, worktree: root });
			const continuation = bindSession(root, {
				session: "continuation",
				branch,
				worktree: root,
			});
			bindSession(root, { session: "other", branch, worktree: root });
			compensateCarriedContinuationBinding(root, {
				sourceSession: "source",
				continuation,
			});
			expect(
				readSessionContext(root).bindings.map((entry) => entry.session),
			).toEqual(["other"]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("close carry-open recovers an already-created continuation after a crash", () => {
		const root = mkRoot("close-carry-open-recovery");
		try {
			const created = newWorkstream(root, "carry-open-recovery", {
				featureId: "F-30",
				parentSpec: "carry-open-spec",
				tasks: ["deferred"],
			});
			const continuation = newWorkstream(
				root,
				"carry-open-recovery continuation",
				{
					continuationOf: created.session,
					carryOpenTasks: ["T-01"],
					featureId: "F-30",
					parentSpec: "carry-open-spec",
					tasks: ["T-01: deferred"],
				},
			);
			const source = readFileSync(created.taskPath, "utf8")
				.replace('status: "open"', 'status: "open"')
				.replace(
					/^\| T-01 \|.*$/m,
					`| T-01 | moved | agent | deferred destination=${continuation.session} reason=dependency pending |`,
				);
			writeFileSync(created.taskPath, source, "utf8");

			const result = closeSession(root, created.session, {
				carryOpen: true,
				reason: "dependency pending",
			});
			expect(result.continuation).toBe(continuation.session);
			expect(readFileSync(created.taskPath, "utf8")).toContain(
				'status: "closed"',
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("close carry-open rejects an unrelated continuation destination", () => {
		const root = mkRoot("close-carry-open-recovery-mismatch");
		try {
			const created = newWorkstream(root, "carry-open-recovery", {
				featureId: "F-30",
				parentSpec: "carry-open-spec",
				tasks: ["deferred"],
			});
			const unrelated = newWorkstream(root, "unrelated", {
				featureId: "F-30",
				parentSpec: "carry-open-spec",
				tasks: ["unrelated task"],
			});
			writeFileSync(
				created.taskPath,
				readFileSync(created.taskPath, "utf8").replace(
					/^\| T-01 \|.*$/m,
					`| T-01 | moved | agent | deferred destination=${unrelated.session} reason=dependency pending |`,
				),
				"utf8",
			);

			expect(() =>
				closeSession(root, created.session, {
					carryOpen: true,
					reason: "dependency pending",
				}),
			).toThrow(
				"Carry-open recovery continuation linkage does not match source.",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

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
	doneTask(root, { session: created.session, taskId: "T-01" });
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
