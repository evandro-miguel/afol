import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
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

	test("carry-open compensation preserves canonical state when strict close fails", () => {
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
			writeFileSync(created.evidencePath, "{invalid evidence}\n", "utf8");
			rebuildWorkBenchIndex(root);
			expect(validateWorkBenchIndex(root).ok).toBe(true);
			const eventsBefore = readLocalStateEvents(root);
			const close = runKernel(root, [
				"close",
				"--session",
				created.session,
				"--carry-open",
				"--reason",
				"wait for dependency",
			]);
			expect(close.status).toBe(2);
			expect(readFileSync(created.taskPath, "utf8")).toContain(
				"| T-02 | pending |",
			);
			expect(readFileSync(created.activeSessionPath, "utf8").trim()).toBe(
				created.session,
			);
			expect(readLocalStateEvents(root)).toEqual(eventsBefore);
			expect(resolveSession(root, {})).toEqual({
				session: created.session,
				source: "context",
			});
			const indexValidation = validateWorkBenchIndex(root);
			if (!indexValidation.ok) throw new Error(indexValidation.message);
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
