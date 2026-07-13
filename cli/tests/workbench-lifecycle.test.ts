import { describe, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
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
import { runStartCommand, runTransitionCommand } from "../commands/workbench";
import {
	agentOperationContext,
	defaultOperationContext,
} from "../core/operation-context";
import { readTelemetryEvents } from "../services/events/telemetry";
import { resolvePendingSpec } from "../services/governance/pending-specs";
import { validateFilesIndex } from "../services/local-state/project-indexes";
import { resolveWorkbenchEventLogPath } from "../services/local-state/workbench-events";
import { validateWorkBenchIndex } from "../services/local-state/workbench-index";
import { resolveProjectPaths } from "../services/project/paths";
import {
	advanceTaskAfterObservedTest,
	appendTimelineEntry,
	closeSession,
	doneTask,
	isSessionClosed,
	newWorkstream,
	type RecordEvidenceInput,
	recordEvidence as recordEvidenceRaw,
	startTask,
	transitionTask,
} from "../services/workbench/lifecycle";
import {
	briefingUnavailableFor,
	buildStartBriefing,
} from "../services/workbench/start-briefing";
import { verifyWorkbenchTasks } from "../services/workbench/verify";

const kernelPath = `${process.cwd()}/cli/main.ts`;

function mkRoot(name: string): string {
	return mkdtempSync(join(tmpdir(), `wb-lifecycle-${name}-`));
}

function recordRawEvidence(root: string, input: RecordEvidenceInput) {
	return recordEvidenceRaw(root, input);
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

function waitForExit(
	proc: ReturnType<typeof spawn>,
): Promise<{ code: number | null; stderr: string; stdout: string }> {
	return new Promise((resolve, reject) => {
		let stdout = "";
		let stderr = "";
		proc.stdout?.setEncoding("utf8");
		proc.stderr?.setEncoding("utf8");
		proc.stdout?.on("data", (chunk: string) => {
			stdout += chunk;
		});
		proc.stderr?.on("data", (chunk: string) => {
			stderr += chunk;
		});
		proc.on("error", reject);
		proc.on("close", (code) => {
			resolve({ code, stderr, stdout });
		});
	});
}

function runKernel(cwd: string, args: string[]): ReturnType<typeof spawnSync> {
	return spawnSync("bun", [kernelPath, ...args], {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
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

describe("workbench lifecycle service", () => {
	test("newWorkstream creates plan/task/log/evidence and active session pointer", () => {
		const root = mkRoot("new");
		try {
			const created = newWorkstream(root, "cli native command parity");

			expect(created.session).toMatch(
				/^\d{6}_\d{4}_cli-native-command-parity(?:_[0-9a-f]{4}|_\d{2})?$/,
			);
			expect(existsSync(created.sessionDir)).toBe(true);
			expect(existsSync(created.planPath)).toBe(true);
			expect(existsSync(created.taskPath)).toBe(true);
			expect(existsSync(created.logPath)).toBe(true);
			expect(existsSync(created.evidencePath)).toBe(true);
			expect(readFileSync(created.activeSessionPath, "utf8")).toBe(
				`${created.session}\n`,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("newWorkstream renders multiple task rows in the canonical task board", () => {
		const root = mkRoot("new-multi-task");
		try {
			const created = newWorkstream(root, "cli native command parity", {
				tasks: ["Investigate parser state", "Patch lifecycle renderer"],
			});

			const plan = readFileSync(created.planPath, "utf8");
			const taskDoc = readFileSync(created.taskPath, "utf8");

			expect(plan).toContain("- T-01: Investigate parser state");
			expect(plan).toContain("- T-02: Patch lifecycle renderer");
			expect(taskDoc).toContain(
				"| T-01 | pending | worker | Investigate parser state |",
			);
			expect(taskDoc).toContain(
				"| T-02 | pending | worker | Patch lifecycle renderer |",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("newWorkstream multi-task sessions verify every generated task row", () => {
		const root = mkRoot("new-multi-task-verify");
		try {
			const created = newWorkstream(root, "cli native command parity", {
				tasks: ["Investigate parser state", "Patch lifecycle renderer"],
			});

			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-02",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });
			doneTask(root, { session: created.session, taskId: "T-02" });

			const result = verifyWorkbenchTasks(created.sessionDir, true);
			expect(result.allCompleted).toBe(true);
			expect(result.totalTasks).toBe(2);
			expect(result.completed).toBe(2);
			expect(result.openTasks).toHaveLength(0);
			expect(result.issues).toHaveLength(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("cli workbench lifecycle json envelopes", () => {
		const root = mkRoot("cli-json");
		try {
			writeCliProjectContract(root);

			const newProc = runKernel(root, [
				"new",
				"cli json",
				"--no-spec-required",
				"--reason",
				"test waiver",
				"--json",
			]);
			expect(newProc.status).toBe(0);
			const newEnvelope = parseEnvelope(newProc.stdout as string);
			expect(newEnvelope).toMatchObject({
				schema: "afol.result/v1",
				ok: true,
				action: "workbench.new",
			});
			expect((newEnvelope.data as Record<string, unknown>).session).toMatch(
				/^\d{6}_\d{4}_cli-json(?:_[0-9a-f]{4}|_\d{2})?$/,
			);
			expect((newEnvelope.data as Record<string, unknown>).status).toBe(
				"created",
			);
			expect(
				(newEnvelope.data as Record<string, unknown>).governance_status,
			).toBe("unbound");

			const humanNewProc = runKernel(root, [
				"new",
				"cli governed",
				"--feature-id",
				"F-01",
				"--parent-spec",
				"spec-01",
			]);
			expect(humanNewProc.status).toBe(0);
			expect(humanNewProc.stdout as string).toContain(
				"governance_status: governed",
			);

			const deniedAgentNew = runKernel(root, [
				"--agent",
				"new",
				"agent denied",
				"--json",
			]);
			expect(deniedAgentNew.status).toBe(2);
			expect(deniedAgentNew.stdout as string).toContain(
				"workbench.new denied for agent callers",
			);

			const created = newWorkstream(root, "cli done json", {
				noSpecRequiredReason: "json lifecycle fixture",
			});
			const startProc = runKernel(root, [
				"start",
				"--session",
				created.session,
				"--json",
			]);
			expect(startProc.status).toBe(0);
			const startEnvelope = parseEnvelope(startProc.stdout as string);
			expect(startEnvelope).toMatchObject({
				schema: "afol.result/v1",
				ok: true,
				action: "workbench.start",
			});
			expect(startEnvelope.data).toMatchObject({
				session: created.session,
				task: "T-01",
				status: "in_progress",
			});
			expect(
				(startEnvelope.data as Record<string, unknown>).briefing,
			).toBeUndefined();

			const briefCreated = newWorkstream(root, "cli start brief json", {
				noSpecRequiredReason: "briefing fixture",
			});
			const startBriefProc = runKernel(root, [
				"start",
				"--session",
				briefCreated.session,
				"--json",
				"--task-id",
				"T-01",
				"--brief",
			]);
			expect(startBriefProc.status).toBe(0);
			const startBriefEnvelope = parseEnvelope(startBriefProc.stdout as string);
			expect(startBriefEnvelope).toMatchObject({
				schema: "afol.result/v1",
				ok: true,
				action: "workbench.start",
			});
			expect(
				(startBriefEnvelope.data as Record<string, unknown>).briefing,
			).toMatchObject({
				schema: "afol_start_briefing_v1",
				project: {
					session: briefCreated.session,
					task: "T-01",
				},
				resume: {
					session_status: "active",
				},
				tasks: {
					open_total: expect.any(Number),
					problem_total: expect.any(Number),
				},
			});
			const startBriefing = (startBriefEnvelope.data as Record<string, unknown>)
				.briefing as Record<string, unknown>;
			expect((startBriefing.project as Record<string, unknown>).root).toBe(".");
			expect(Array.isArray(startBriefing.warnings)).toBe(true);
			expect(Array.isArray(startBriefing.questions)).toBe(true);

			const logProc = runKernel(root, [
				"log",
				"--session",
				created.session,
				"--message",
				"json timeline",
				"--json",
			]);
			expect(logProc.status).toBe(0);
			const logEnvelope = parseEnvelope(logProc.stdout as string);
			expect(logEnvelope).toMatchObject({
				schema: "afol.result/v1",
				ok: true,
				action: "workbench.log",
			});
			expect(logEnvelope.data).toMatchObject({
				session: created.session,
				status: "logged",
				message: "json timeline",
			});

			const verifyProc = runKernel(root, [
				"verify-tasks",
				`.afol/wb/${created.session}`,
				"--json",
			]);
			expect(verifyProc.status).toBe(1);
			const verifyEnvelope = parseEnvelope(verifyProc.stdout as string);
			expect(verifyEnvelope).toMatchObject({
				schema: "afol.result/v1",
				ok: false,
				action: "workbench.verify",
				exit_code: 1,
			});
			expect((verifyEnvelope.error as Record<string, unknown>).message).toBe(
				"Verification failed.",
			);

			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});

			const doneProc = runKernel(root, [
				"done",
				"--session",
				created.session,
				"--task-id",
				"T-01",
				"--command",
				"bun test",
				"--result",
				"passed",
				"--json",
			]);
			expect(doneProc.status).toBe(0);
			const doneEnvelope = parseEnvelope(doneProc.stdout as string);
			expect(doneEnvelope).toMatchObject({
				schema: "afol.result/v1",
				ok: true,
				action: "workbench.done",
			});
			expect(doneEnvelope.data).toMatchObject({
				session: created.session,
				task: "T-01",
				status: "done",
			});

			const closeProc = runKernel(root, [
				"close",
				"--session",
				created.session,
				"--allow-no-report",
				"--reason",
				"research-only session",
				"--json",
			]);
			expect(closeProc.status).toBe(0);
			const closeEnvelope = parseEnvelope(closeProc.stdout as string);
			expect(closeEnvelope).toMatchObject({
				schema: "afol.result/v1",
				ok: true,
				action: "workbench.close",
			});
			expect(closeEnvelope.data).toMatchObject({
				session: created.session,
				status: "closed",
			});

			const missingProc = runKernel(root, ["new", "--json"]);
			expect(missingProc.status).toBe(2);
			const missingEnvelope = parseEnvelope(missingProc.stdout as string);
			expect(missingEnvelope).toMatchObject({
				schema: "afol.result/v1",
				ok: false,
				action: "workbench.new",
			});
			expect((missingEnvelope.error as Record<string, unknown>).message).toBe(
				"Missing theme for new workstream.",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("cli pending_spec blocks its own start while unrelated new remains allowed", () => {
		const root = mkRoot("pending-spec");
		try {
			writeCliProjectContract(root);

			const first = runKernel(root, ["new", "missing spec", "--json"]);
			expect(first.status).toBe(0);
			const firstEnvelope = parseEnvelope(first.stdout as string);
			const firstData = firstEnvelope.data as Record<string, unknown>;
			expect(firstData.governance_status).toBe("pending_spec");
			expect(firstData.pending_spec).toBe(true);
			const session = String(firstData.session);

			const start = runKernel(root, [
				"start",
				"--session",
				session,
				"--task-id",
				"T-01",
			]);
			expect(start.status).toBe(2);
			expect(start.stderr as string).toContain("pending_spec blocks start");

			const evidence = runKernel(root, [
				"evidence",
				"--session",
				session,
				"--task-id",
				"T-01",
				"--command",
				"bun test",
				"--result",
				"passed",
			]);
			expect(evidence.status).toBe(0);

			const done = runKernel(root, [
				"done",
				"--session",
				session,
				"--task-id",
				"T-01",
				"--test",
				"true",
			]);
			expect(done.status).toBe(2);

			const unrelated = runKernel(root, [
				"new",
				"unrelated",
				"--no-spec-required",
				"--reason",
				"independent fixture",
				"--json",
			]);
			expect(unrelated.status).toBe(0);

			const pending = runKernel(root, ["governance", "pending", "--json"]);
			expect(pending.status).toBe(0);
			const pendingEnvelope = parseEnvelope(pending.stdout as string);
			const pendingData = pendingEnvelope.data as {
				total: number;
				entries: Array<{ session_id: string; status: string }>;
			};
			expect(pendingData.total).toBe(1);
			expect(pendingData.entries[0]?.session_id).toBe(session);
			expect(pendingData.entries[0]?.status).toBe("open");

			const resolved = runKernel(root, [
				"governance",
				"resolve-spec",
				"--session",
				session,
				"--no-spec-required",
				"--reason",
				"pending fixture waiver",
				"--json",
			]);
			expect(resolved.status).toBe(0);
			const resolvedEnvelope = parseEnvelope(resolved.stdout as string);
			expect((resolvedEnvelope.data as Record<string, unknown>).status).toBe(
				"waived",
			);

			const next = runKernel(root, [
				"new",
				"after resolve",
				"--feature-id",
				"F-02",
				"--parent-spec",
				"spec-02",
				"--json",
			]);
			expect(next.status).toBe(0);
			const nextEnvelope = parseEnvelope(next.stdout as string);
			expect((nextEnvelope.data as Record<string, unknown>).status).toBe(
				"created",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("quick-task requires explicit governance and never creates pending_spec", () => {
		const root = mkRoot("quick-task-pending-spec");
		try {
			writeCliProjectContract(root);
			const missingCommand = runKernel(root, [
				"quick-task",
				"missing command",
				"--no-spec-required",
				"--reason",
				"test",
			]);
			expect(missingCommand.status).toBe(2);
			expect(existsSync(join(root, ".afol", "wb"))).toBe(false);

			const quickTask = runKernel(root, [
				"quick-task",
				"quick missing spec",
				"--command",
				"true",
				"--no-spec-required",
				"--reason",
				"quick fixture waiver",
				"--json",
			]);
			expect(quickTask.status).toBe(0);
			const quickTaskEnvelope = parseEnvelope(quickTask.stdout as string);
			const quickTaskData = quickTaskEnvelope.data as Record<string, unknown>;
			expect(quickTaskData.governance_status).toBe("unbound");
			expect(quickTaskData.pending_spec).toBe(false);

			const next = runKernel(root, [
				"new",
				"after quick-task",
				"--no-spec-required",
				"--reason",
				"independent fixture",
			]);
			expect(next.status).toBe(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("emits json for evidence command", () => {
		const root = mkRoot("evidence-json");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "evidence-json");
			const proc = runKernel(root, [
				"evidence",
				"--session",
				created.session,
				"--task-id",
				"T-01",
				"--command",
				"bun test",
				"--result",
				"passed",
				"--json",
			]);

			expect(proc.status).toBe(0);
			expect(proc.stderr as string).toBe("");
			const envelope = parseEnvelope(proc.stdout as string);
			expect(envelope).toMatchObject({
				schema: "afol.result/v1",
				ok: true,
				action: "workbench.evidence",
			});
			expect(envelope.data).toMatchObject({
				session: created.session,
				task: "T-01",
				result: "passed",
			});
			expect((envelope.data as Record<string, unknown>).evidence_id).toMatch(
				/^E-/,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("done json emits failure envelope for spec conflict", () => {
		const root = mkRoot("done-spec-conflict");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "done-spec-conflict", {
				parentSpec: "missing-spec",
			});
			writeFileSync(
				created.taskPath,
				[
					"---",
					'parent_spec: "missing-spec"',
					"---",
					"",
					"# Tasks",
					"",
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | pending | worker | conflict |",
					"",
				].join("\n"),
				"utf8",
			);
			const proc = runKernel(root, [
				"done",
				"--session",
				created.session,
				"--task-id",
				"T-01",
				"--require-spec-check",
				"--json",
			]);

			expect(proc.status).toBe(1);
			const payload = parseEnvelope(proc.stdout as string);
			expect(payload).toMatchObject({
				schema: "afol.result/v1",
				ok: false,
				action: "workbench.done",
				exit_code: 1,
			});
			expect((payload.error as Record<string, unknown>).message).toContain(
				"spec check failed",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("done json emits failure envelope for test failure", () => {
		const root = mkRoot("done-test-failure");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "done-test-failure");
			const proc = runKernel(root, [
				"done",
				"--session",
				created.session,
				"--task-id",
				"T-01",
				"--test",
				'bun -e "process.exit(3)"',
				"--json",
			]);

			expect(proc.status).toBe(1);
			const payload = parseEnvelope(proc.stdout as string);
			expect(payload).toMatchObject({
				schema: "afol.result/v1",
				ok: false,
				action: "workbench.done",
				exit_code: 1,
			});
			expect((payload.error as Record<string, unknown>).message).toContain(
				"--test failed",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("done uses shell execution when --test-shell is set", () => {
		const root = mkRoot("done-test-shell");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "done-test-shell");
			const proc = runKernel(root, [
				"done",
				"--session",
				created.session,
				"--task-id",
				"T-01",
				"--test-shell",
				"true && false",
				"--json",
			]);

			expect(proc.status).toBe(1);
			const payload = parseEnvelope(proc.stdout as string);
			expect(payload).toMatchObject({
				schema: "afol.result/v1",
				ok: false,
				action: "workbench.done",
				exit_code: 1,
			});
			expect((payload.error as Record<string, unknown>).message).toContain(
				"--test-shell failed",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("done keeps --test non-shell", () => {
		const root = mkRoot("done-test-non-shell");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "done-test-non-shell");
			startTask(root, { session: created.session, taskId: "T-01" });
			const proc = runKernel(root, [
				"done",
				"--session",
				created.session,
				"--task-id",
				"T-01",
				"--test",
				"true && false",
				"--json",
			]);

			expect(proc.status).toBe(0);
			const payload = parseEnvelope(proc.stdout as string);
			expect(payload).toMatchObject({
				schema: "afol.result/v1",
				ok: true,
				action: "workbench.done",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("done command records observed provenance for test evidence", () => {
		const root = mkRoot("done-test-provenance");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "done-test-provenance");
			startTask(root, { session: created.session, taskId: "T-01" });
			const proc = runKernel(root, [
				"done",
				"--session",
				created.session,
				"--task-id",
				"T-01",
				"--test",
				"bun -e \"console.log('ok')\"",
				"--json",
			]);

			expect(proc.status).toBe(0);
			const evidence = readFileSync(
				join(root, ".afol", "wb", created.session, ".evidence.jsonl"),
				"utf8",
			)
				.trim()
				.split("\n")
				.at(-1);
			expect(evidence).toBeTruthy();
			const entry = JSON.parse(evidence as string) as {
				provenance?: string;
			};
			expect(entry.provenance).toBe("observed");
			const toolEvents = readTelemetryEvents(root).filter(
				(event) => event.event_type === "tool_exec",
			);
			expect(toolEvents).toHaveLength(1);
			expect(toolEvents[0]).toMatchObject({
				task_id: "T-01",
				cmd_type: "bun",
				provenance: "observed",
				outcome: "success",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("startTask marks row in_progress", () => {
		const root = mkRoot("start");
		try {
			const created = newWorkstream(root, "start-task", {
				noSpecRequiredReason: "briefing fixture",
			});
			startTask(root, { session: created.session, taskId: "T-01" });

			const taskDoc = readFileSync(created.taskPath, "utf8");
			expect(taskDoc).toContain("| T-01 | in_progress | worker |");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("startTask auto-selection still fails when multiple pending tasks exist", () => {
		const root = mkRoot("start-multi-pending");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "start-task", {
				tasks: ["Investigate parser state", "Patch lifecycle renderer"],
			});
			const proc = runKernel(root, [
				"start",
				"--session",
				created.session,
				"--json",
			]);

			expect(proc.status).toBe(2);
			expect(proc.stdout as string).toContain(
				`multiple pending tasks found in ${created.session}: T-01, T-02`,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol start defaults to compact output", () => {
		const root = mkRoot("start-human");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "start-task", {
				noSpecRequiredReason: "compact output fixture",
			});
			const proc = runKernel(root, ["start", "--session", created.session]);

			expect(proc.status).toBe(0);
			expect((proc.stdout as string).trim()).toBe("task started: T-01");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol start --brief shows human briefing", () => {
		const root = mkRoot("start-human-brief");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "start-task", {
				noSpecRequiredReason: "briefing fixture",
			});
			const proc = runKernel(root, [
				"start",
				"--session",
				created.session,
				"--brief",
			]);

			expect(proc.status).toBe(0);
			const lines = (proc.stdout as string).trim().split("\n");
			expect(lines[0]).toBe("task started: T-01");
			expect(lines.some((line) => line.startsWith("briefing:"))).toBe(true);
			expect(lines.some((line) => line.startsWith("resume:"))).toBe(true);
			expect(lines.some((line) => line.startsWith("tasks:"))).toBe(true);
			expect(lines.some((line) => line.startsWith("warnings:"))).toBe(true);
			expect(lines.some((line) => line.startsWith("questions:"))).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol start --brief full shows full human briefing payload", () => {
		const root = mkRoot("start-human-brief-full");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "start-task", {
				noSpecRequiredReason: "full briefing fixture",
			});
			const proc = runKernel(root, [
				"start",
				"--session",
				created.session,
				"--brief",
				"full",
			]);

			expect(proc.status).toBe(0);
			const lines = (proc.stdout as string).trim().split("\n");
			expect(lines[0]).toBe("task started: T-01");
			const briefing = JSON.parse(lines.slice(1).join("\n")) as {
				schema: string;
				warnings: unknown[];
				questions: unknown[];
			};
			expect(briefing.schema).toBe("afol_start_briefing_v1");
			expect(Array.isArray(briefing.warnings)).toBe(true);
			expect(Array.isArray(briefing.questions)).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol st keeps task start output compact", () => {
		const root = mkRoot("start-compact");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "start-task", {
				noSpecRequiredReason: "compact alias fixture",
			});
			const proc = runKernel(root, ["st", "-S", created.session]);

			expect(proc.status).toBe(0);
			expect((proc.stdout as string).trim()).toBe("task started: T-01");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol start human output reports briefing fallback reason", () => {
		const root = mkRoot("start-human-briefing-fallback");
		try {
			writeCliProjectContract(root);
			const roadmapPath = join(
				root,
				".afol",
				"adm",
				"roadmap",
				"GENERAL-ROADMAP.md",
			);
			mkdirSync(roadmapPath, { recursive: true });
			const created = newWorkstream(root, "start-task", {
				noSpecRequiredReason: "briefing fallback fixture",
			});
			const proc = runKernel(root, [
				"start",
				"--session",
				created.session,
				"--brief",
			]);

			expect(proc.status).toBe(0);
			const lines = (proc.stdout as string).trim().split("\n");
			expect(lines[0]).toBe("task started: T-01");
			expect(
				lines.some((line) =>
					line.startsWith("briefing: briefing_unavailable reason="),
				),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol start json reports briefing fallback reason", () => {
		const root = mkRoot("start-json-briefing-fallback");
		try {
			writeCliProjectContract(root);
			const roadmapPath = join(
				root,
				".afol",
				"adm",
				"roadmap",
				"GENERAL-ROADMAP.md",
			);
			mkdirSync(roadmapPath, { recursive: true });
			const created = newWorkstream(root, "start-task", {
				noSpecRequiredReason: "briefing fallback fixture",
			});
			const proc = runKernel(root, [
				"start",
				"--session",
				created.session,
				"--brief",
				"--json",
			]);

			expect(proc.status).toBe(0);
			const envelope = parseEnvelope(proc.stdout as string);
			const briefing = (envelope.data as Record<string, unknown>).briefing as {
				status: string;
				reason: string;
			};
			expect(briefing.status).toBe("briefing_unavailable");
			expect(briefing.reason).not.toBe("");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("briefingUnavailableFor emits bounded diagnostic reason", () => {
		const briefing = briefingUnavailableFor(
			new Error(`${"stale index\n".repeat(40)}tail`),
		);

		expect(briefing.schema).toBe("afol_start_briefing_v1");
		expect(briefing.status).toBe("briefing_unavailable");
		expect(briefing.reason).toContain("stale index");
		expect(briefing.reason).not.toContain("\n");
		expect(briefing.reason.length).toBeLessThanOrEqual(160);
	});

	test("buildStartBriefing summarizes roadmap and legacy warnings", () => {
		const root = mkRoot("start-briefing");
		try {
			writeCliProjectContract(root);
			mkdirSync(join(root, "docs"), { recursive: true });
			mkdirSync(join(root, ".agents", "skills"), { recursive: true });
			mkdirSync(join(root, ".afol", "adm", "roadmap"), { recursive: true });
			writeFileSync(
				join(root, "docs", "readme.md"),
				"Legacy note: .agents/wb should stay retired.\n",
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "adm", "roadmap", "GENERAL-ROADMAP.md"),
				[
					"# General Roadmap",
					"",
					"### F-01 Briefing",
					"- Status: final",
					"",
					"### F-02 Radar",
					"- Status: in_progress",
				].join("\n"),
				"utf8",
			);
			const created = newWorkstream(root, "briefing-service");
			startTask(root, { session: created.session, taskId: "T-01" });

			const briefing = buildStartBriefing(root, {
				session: created.session,
				taskId: "T-01",
			});

			expect(briefing.roadmap).toEqual({
				total: 2,
				fulfilled: 1,
				by_status: {
					final: 1,
					in_progress: 1,
				},
			});
			expect(briefing.tasks.open_total).toBeGreaterThanOrEqual(1);
			expect(
				briefing.warnings.some((warning) =>
					warning.startsWith("maintenance review overdue: rules"),
				),
			).toBe(true);
			expect(
				briefing.warnings.some((warning) =>
					warning.startsWith(
						"legacy references in active docs/skills/memory/library:",
					),
				),
			).toBe(true);
			expect(
				briefing.questions.some((question) =>
					question.includes("Legacy references remain"),
				),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("buildStartBriefing warns when maintenance review store is malformed", () => {
		const root = mkRoot("start-briefing-malformed-maintenance");
		try {
			writeCliProjectContract(root);
			const reviewDir = join(root, ".afol", "data", "maintenance");
			mkdirSync(reviewDir, { recursive: true });
			writeFileSync(join(reviewDir, "reviews.json"), "{bad-json", "utf8");
			const created = newWorkstream(root, "briefing-malformed-maintenance");
			startTask(root, { session: created.session, taskId: "T-01" });

			const briefing = buildStartBriefing(root, {
				session: created.session,
				taskId: "T-01",
			});

			expect(
				briefing.warnings.some((warning) =>
					warning.startsWith("maintenance review store malformed:"),
				),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("recordEvidence appends JSONL entry", () => {
		const root = mkRoot("evidence");
		try {
			const created = newWorkstream(root, "record-evidence");
			const entry = recordEvidenceRaw(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});

			expect(entry.id).toMatch(/^E-\d{17}-[a-f0-9]{6}$/);
			const lines = readFileSync(created.evidencePath, "utf8")
				.trim()
				.split("\n");
			expect(lines.length).toBe(1);
			const firstLine = lines[0];
			expect(typeof firstLine).toBe("string");
			const parsed = JSON.parse(firstLine as string) as {
				task_id: string;
				command: string;
				result: string;
				provenance?: string;
			};
			expect(parsed.task_id).toBe("T-01");
			expect(parsed.command).toBe("bun test");
			expect(parsed.result).toBe("passed");
			expect(parsed.provenance).toBe("declared");
			expect(
				readLocalStateEvents(root).find(
					(event) => event.type === "workbench.record_evidence",
				),
			).toMatchObject({ detail: { provenance: "declared" } });
			expect(
				readTelemetryEvents(root).filter(
					(event) => event.event_type === "tool_exec",
				),
			).toHaveLength(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("doneTask rejects legacy evidence without provenance", () => {
		const root = mkRoot("legacy-evidence-provenance");
		try {
			const created = newWorkstream(root, "legacy-evidence-provenance");
			writeFileSync(
				created.evidencePath,
				`${JSON.stringify({
					id: "E-legacy",
					task_id: "T-01",
					created_at: new Date().toISOString(),
					command: "bun test",
					result: "passed",
				})}\n`,
				"utf8",
			);

			expect(() =>
				doneTask(root, { session: created.session, taskId: "T-01" }),
			).toThrow("authorization must be observed with exit_code 0");
			expect(readFileSync(created.taskPath, "utf8")).toContain(
				"| T-01 | pending | worker |",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("recordEvidence rejects missing tasks without appending evidence", () => {
		const root = mkRoot("evidence-missing-task");
		try {
			const created = newWorkstream(root, "record-evidence-missing-task");

			expect(() =>
				recordObservedCompletion(root, {
					session: created.session,
					taskId: "T-02",
					command: "bun test",
					result: "passed",
				}),
			).toThrow("Task T-02 not found in");
			expect(readFileSync(created.evidencePath, "utf8")).toBe("");
			expect(
				readLocalStateEvents(root).filter(
					(event) => event.type === "workbench.record_evidence",
				),
			).toHaveLength(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("quick-task command runs lifecycle end to end", () => {
		const root = mkRoot("quick-task");
		try {
			writeCliProjectContract(root);
			const proc = runKernel(root, [
				"quick-task",
				"quick task parity",
				"--command",
				"bun --version",
				"--no-spec-required",
				"--reason",
				"quick task fixture",
				"--json",
			]);
			expect(proc.status).toBe(0);
			const payload = parseEnvelope(proc.stdout as string);
			expect(payload).toMatchObject({
				schema: "afol.result/v1",
				ok: true,
				action: "quick-task",
			});
			expect(payload.data).toMatchObject({ status: "closed" });
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("quick-task records failed evidence when command fails", () => {
		const root = mkRoot("quick-task-failed");
		try {
			writeCliProjectContract(root);
			const proc = runKernel(root, [
				"quick-task",
				"quick task failed",
				"--command",
				"false",
				"--no-spec-required",
				"--reason",
				"quick task failure fixture",
				"--json",
			]);
			expect(proc.status).toBe(1);
			const payload = parseEnvelope(proc.stdout as string) as {
				error: { message: string };
			};
			expect(payload.error.message).toContain("failed_step=verification");
			expect(payload.error.message).toContain(
				"--command failed with exit code",
			);
			const session = payload.error.message.match(/session=([^ ]+)/)?.[1];
			expect(session).toBeTruthy();
			const evidence = readFileSync(
				join(root, ".afol", "wb", session as string, ".evidence.jsonl"),
				"utf8",
			).trim();
			const entry = JSON.parse(evidence) as {
				result: string;
				exit_code: number;
				provenance?: string;
			};
			expect(entry.result).toBe("failed");
			expect(entry.exit_code).not.toBe(0);
			expect(entry.provenance).toBe("observed");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("recordEvidence serializes concurrent evidence and event JSONL appends", async () => {
		const root = mkRoot("evidence-concurrency");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "evidence-concurrency");
			const processes = Array.from({ length: 8 }, (_, index) =>
				spawn(
					"bun",
					[
						kernelPath,
						"evidence",
						"--session",
						created.session,
						"--task-id",
						"T-01",
						"--command",
						`bun test shard-${index}`,
						"--result",
						"passed",
					],
					{
						cwd: root,
						stdio: ["ignore", "pipe", "pipe"],
					},
				),
			);

			const results = await Promise.all(processes.map(waitForExit));
			for (const result of results) {
				expect(result.code).toBe(0);
				expect(result.stderr).toBe("");
			}

			const evidenceRows = readFileSync(created.evidencePath, "utf8")
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line) as Record<string, unknown>);
			expect(evidenceRows).toHaveLength(8);
			expect(new Set(evidenceRows.map((row) => row.id)).size).toBe(8);
			expect(evidenceRows.every((row) => row.provenance === "declared")).toBe(
				true,
			);
			expect(
				new Set(
					evidenceRows.map(
						(row) => `${row.command}:${row.result}:${row.task_id}`,
					),
				).size,
			).toBe(8);

			const eventRows = readLocalStateEvents(root);
			// 9 workbench events + session_start telemetry; declared evidence is not execution.
			expect(eventRows).toHaveLength(10);
			expect(
				eventRows.filter((row) => row.type === "workbench.record_evidence"),
			).toHaveLength(8);
			expect(
				eventRows.filter(
					(row) => row.source === "afol-cli" && row.event_type === "tool_exec",
				),
			).toHaveLength(0);
			expect(
				existsSync(
					join(root, ".afol", "wb", ".locks", `${created.session}.lock`),
				),
			).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("appendTimelineEntry writes to the session log", () => {
		const root = mkRoot("timeline");
		try {
			const created = newWorkstream(root, "timeline");

			const result = appendTimelineEntry(
				root,
				created.session,
				"native timeline event",
			);

			expect(result.logPath).toBe(created.logPath);
			const logDoc = readFileSync(created.logPath, "utf8");
			expect(logDoc).toContain("## Timeline");
			expect(logDoc).toContain("native timeline event");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("workbench lifecycle updates local state events and index snapshot", () => {
		const root = mkRoot("local-state");
		try {
			const created = newWorkstream(root, "local-state");
			startTask(root, { session: created.session, taskId: "T-01" });
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });
			appendTimelineEntry(root, created.session, "local-state event");

			const events = readLocalStateEvents(root);
			expect(events.map((entry) => entry.type)).toEqual(
				expect.arrayContaining([
					"workbench.new",
					"workbench.start_task",
					"workbench.record_evidence",
					"workbench.mark_done",
					"workbench.append_log",
				]),
			);

			const indexPath = join(root, ".afol", "data", "index", "workbench.json");
			const indexPayload = JSON.parse(readFileSync(indexPath, "utf8")) as {
				sessions: Array<{
					session: string;
					completed: number;
					task_count: number;
				}>;
				tasks: Array<{ session: string; task_id: string; state: string }>;
			};
			const sessionEntry = indexPayload.sessions.find(
				(entry) => entry.session === created.session,
			);
			expect(sessionEntry).toBeDefined();
			expect(sessionEntry?.completed).toBe(1);
			expect(sessionEntry?.task_count).toBe(1);
			expect(
				indexPayload.tasks.find(
					(task) => task.session === created.session && task.task_id === "T-01",
				),
			).toMatchObject({
				state: "done",
			});
			expect(validateWorkBenchIndex(root).ok).toBe(true);
			expect(validateFilesIndex(root).ok).toBe(true);
			expect(
				existsSync(join(root, ".afol", "data", "index", "files.json")),
			).toBe(true);

			const second = newWorkstream(root, "local-state-second");
			startTask(root, { session: second.session, taskId: "T-01" });
			recordObservedCompletion(root, {
				session: second.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: second.session, taskId: "T-01" });
			closeSession(root, second.session);

			expect(validateWorkBenchIndex(root).ok).toBe(true);
			expect(validateFilesIndex(root).ok).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("newWorkstream honors provider-compatible mutable paths", () => {
		const root = mkRoot("provider-paths");
		try {
			writeProviderCompatibleConfig(root);

			const created = newWorkstream(root, "provider paths");
			startTask(root, { session: created.session, taskId: "T-01" });

			expect(created.sessionDir).toContain("/.afol/wb/");
			expect(created.activeSessionPath).toBe(
				join(root, ".afol", "wb", ".active_session"),
			);
			expect(existsSync(join(root, ".afol", "wb", created.session))).toBe(true);
			expect(
				existsSync(join(root, ".afol", "data", "events", "events.jsonl")),
			).toBe(true);
			expect(
				existsSync(join(root, ".afol", "data", "index", "workbench.json")),
			).toBe(true);
			expect(existsSync(join(root, ".agents", "wb"))).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("doneTask requires success evidence for task and accepts verifier aliases", () => {
		const root = mkRoot("done");
		try {
			const created = newWorkstream(root, "done-task");

			expect(() =>
				doneTask(root, { session: created.session, taskId: "T-01" }),
			).toThrow("requires passed evidence");

			recordRawEvidence(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "failed",
				exitCode: 1,
				provenance: "observed",
			});
			expect(() =>
				doneTask(root, { session: created.session, taskId: "T-01" }),
			).toThrow("requires passed evidence");

			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "green",
				exitCode: 0,
				provenance: "observed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });

			const taskDoc = readFileSync(created.taskPath, "utf8");
			expect(taskDoc).toContain("| T-01 | done | worker |");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("doneTask rejects latest-failed evidence after successful evidence", () => {
		const root = mkRoot("done-latest-failed");
		try {
			const created = newWorkstream(root, "done-task-latest-failed");

			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test --flag flaky",
				result: "failed",
				exitCode: 1,
				provenance: "observed",
			});

			expect(() =>
				doneTask(root, { session: created.session, taskId: "T-01" }),
			).toThrow("requires passed evidence");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("doneTask rejects passed evidence with failing exit code", () => {
		const root = mkRoot("done-exit-code");
		try {
			const created = newWorkstream(root, "done-task-exit-code");
			recordEvidenceRaw(root, {
				session: created.session,
				taskId: "T-01",
				command: 'bun -e "process.exit(1)"',
				result: "passed",
				exitCode: 1,
			});
			expect(
				readTelemetryEvents(root).filter(
					(event) => event.event_type === "tool_exec",
				),
			).toHaveLength(0);

			expect(() =>
				doneTask(root, { session: created.session, taskId: "T-01" }),
			).toThrow("requires passed evidence");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("doneTask rejects descriptive results that only contain success words", () => {
		for (const [index, result] of [
			"not passed",
			"test did not pass",
			"passed with warnings",
		].entries()) {
			const root = mkRoot(`done-descriptive-result-${index}`);
			try {
				const created = newWorkstream(root, "done descriptive result");
				recordRawEvidence(root, {
					session: created.session,
					taskId: "T-01",
					command: "bun test",
					result,
					exitCode: 0,
					provenance: "observed",
				});

				expect(() =>
					doneTask(root, { session: created.session, taskId: "T-01" }),
				).toThrow("requires passed evidence");
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		}
	});

	test("doneTask reports malformed evidence ledger lines", () => {
		const root = mkRoot("done-malformed-evidence");
		try {
			const created = newWorkstream(root, "done malformed evidence");
			writeFileSync(created.evidencePath, "{not-json\n", "utf8");

			expect(() =>
				doneTask(root, { session: created.session, taskId: "T-01" }),
			).toThrow("Malformed evidence ledger");
			expect(() =>
				doneTask(root, { session: created.session, taskId: "T-01" }),
			).toThrow(`${created.evidencePath}:1`);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("closeSession blocks pending/in_progress/problem and clears active pointer on success", () => {
		const root = mkRoot("close");
		try {
			const created = newWorkstream(root, "close-session");

			expect(() => closeSession(root, created.session)).toThrow(
				"blocking tasks",
			);

			startTask(root, { session: created.session, taskId: "T-01" });
			expect(() => closeSession(root, created.session)).toThrow(
				"blocking tasks",
			);

			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });
			closeSession(root, created.session);
			expect(existsSync(created.activeSessionPath)).toBe(false);

			writeFileSync(
				created.taskPath,
				readFileSync(created.taskPath, "utf8").replace(
					"| T-01 | done |",
					"| T-01 | problem |",
				),
				"utf8",
			);
			expect(() => closeSession(root, created.session)).not.toThrow();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("closed sessions reject additional lifecycle mutations", () => {
		const root = mkRoot("closed-mutation");
		try {
			const created = newWorkstream(root, "closed-session-mutation");

			startTask(root, { session: created.session, taskId: "T-01" });
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });
			writeFileSync(
				join(
					root,
					".afol",
					"wb",
					created.session,
					`${created.session}_report_01.md`,
				),
				"# Report\n",
			);
			closeSession(root, created.session);
			const closedMessage = `Session ${created.session} is closed.`;
			const stateAfterClose = {
				task: readFileSync(created.taskPath, "utf8"),
				log: readFileSync(created.logPath, "utf8"),
				evidence: readFileSync(created.evidencePath, "utf8"),
				events: readFileSync(resolveWorkbenchEventLogPath(root), "utf8"),
			};
			const closeEventCountAfterClose = readLocalStateEvents(root).filter(
				(event) =>
					event.type === "workbench.close" && event.session === created.session,
			).length;
			const sessionEndCountAfterClose = readTelemetryEvents(root).filter(
				(event) =>
					event.event_type === "session_end" &&
					event.session_id === created.session,
			).length;
			const closedAt = stateAfterClose.task.match(
				/^closed_at: "([^"]+)"$/m,
			)?.[1];
			expect(stateAfterClose.task).toContain('status: "closed"');
			expect(closedAt).toBeTruthy();
			expect(stateAfterClose.task).toContain(
				`updated_at: ${JSON.stringify(closedAt)}`,
			);

			expect(() =>
				startTask(root, { session: created.session, taskId: "T-01" }),
			).toThrow(closedMessage);
			expect(() =>
				recordObservedCompletion(root, {
					session: created.session,
					taskId: "T-01",
					command: "bun test",
					result: "passed",
				}),
			).toThrow(closedMessage);
			expect(() =>
				doneTask(root, { session: created.session, taskId: "T-01" }),
			).toThrow(closedMessage);
			expect(() =>
				appendTimelineEntry(root, created.session, "post-close mutation"),
			).toThrow(closedMessage);
			expect(() => closeSession(root, created.session)).not.toThrow();

			expect(readFileSync(created.taskPath, "utf8")).toBe(stateAfterClose.task);
			expect(readFileSync(created.logPath, "utf8")).toBe(stateAfterClose.log);
			expect(readFileSync(created.evidencePath, "utf8")).toBe(
				stateAfterClose.evidence,
			);
			expect(readFileSync(resolveWorkbenchEventLogPath(root), "utf8")).toBe(
				stateAfterClose.events,
			);
			expect(closeEventCountAfterClose).toBe(1);
			expect(
				readLocalStateEvents(root).filter(
					(event) =>
						event.type === "workbench.close" &&
						event.session === created.session,
				).length,
			).toBe(closeEventCountAfterClose);
			expect(sessionEndCountAfterClose).toBe(1);
			expect(
				readTelemetryEvents(root).filter(
					(event) =>
						event.event_type === "session_end" &&
						event.session_id === created.session,
				).length,
			).toBe(sessionEndCountAfterClose);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("durable task metadata keeps a closed session immutable without event files", () => {
		const root = mkRoot("closed-without-events");
		try {
			const created = newWorkstream(root, "closed without events");
			startTask(root, { session: created.session, taskId: "T-01" });
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });
			closeSession(root, created.session);
			rmSync(join(root, ".afol", "data", "events"), {
				recursive: true,
				force: true,
			});

			const closedMessage = `Session ${created.session} is closed.`;
			expect(() =>
				startTask(root, { session: created.session, taskId: "T-01" }),
			).toThrow(closedMessage);
			expect(() =>
				recordObservedCompletion(root, {
					session: created.session,
					taskId: "T-01",
					command: "bun test --rerun",
					result: "passed",
				}),
			).toThrow(closedMessage);
			expect(() => closeSession(root, created.session)).not.toThrow();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("closeSession reconciles a committed close after interruption", () => {
		const root = mkRoot("close-recovery");
		try {
			const created = newWorkstream(root, "close recovery");
			startTask(root, { session: created.session, taskId: "T-01" });
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });

			const closedAt = "2026-07-09T22:30:00.000Z";
			const interrupted = readFileSync(created.taskPath, "utf8")
				.replace('status: "active"', 'status: "closed"')
				.replace(
					/^updated_at: .*$/m,
					`updated_at: ${JSON.stringify(closedAt)}\nclosed_at: ${JSON.stringify(closedAt)}`,
				);
			writeFileSync(created.taskPath, interrupted, "utf8");
			expect(existsSync(created.activeSessionPath)).toBe(true);

			expect(closeSession(root, created.session)).toEqual(
				expect.arrayContaining(["log summary section is missing"]),
			);
			expect(existsSync(created.activeSessionPath)).toBe(false);
			expect(readFileSync(created.taskPath, "utf8")).toContain(
				`closed_at: ${JSON.stringify(closedAt)}`,
			);
			expect(() => closeSession(root, created.session)).not.toThrow();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("closeSession is idempotent without an active pointer and preserves closed_at", () => {
		const root = mkRoot("close-idempotent-no-pointer");
		try {
			const created = newWorkstream(root, "close idempotent no pointer");
			startTask(root, { session: created.session, taskId: "T-01" });
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });
			closeSession(root, created.session);

			const firstClosedTask = readFileSync(created.taskPath, "utf8");
			const closedAt =
				firstClosedTask.match(/^closed_at: "([^"]+)"$/m)?.[1] ?? "";
			expect(closedAt).not.toBe("");
			expect(existsSync(created.activeSessionPath)).toBe(false);

			expect(() => closeSession(root, created.session)).not.toThrow();
			expect(readFileSync(created.taskPath, "utf8")).toContain(
				`closed_at: ${JSON.stringify(closedAt)}`,
			);
			expect(existsSync(created.activeSessionPath)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("closeSession idempotence preserves another active session pointer", () => {
		const root = mkRoot("close-idempotent-other-active");
		try {
			const closed = newWorkstream(root, "closed session");
			startTask(root, { session: closed.session, taskId: "T-01" });
			recordObservedCompletion(root, {
				session: closed.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: closed.session, taskId: "T-01" });
			closeSession(root, closed.session);
			const closedAt =
				readFileSync(closed.taskPath, "utf8").match(
					/^closed_at: "([^"]+)"$/m,
				)?.[1] ?? "";
			expect(closedAt).not.toBe("");

			const active = newWorkstream(root, "active session");
			expect(readFileSync(active.activeSessionPath, "utf8")).toBe(
				`${active.session}\n`,
			);

			expect(() => closeSession(root, closed.session)).not.toThrow();
			expect(readFileSync(active.activeSessionPath, "utf8")).toBe(
				`${active.session}\n`,
			);
			expect(readFileSync(closed.taskPath, "utf8")).toContain(
				`closed_at: ${JSON.stringify(closedAt)}`,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("closeSession recovery reconciles stale local-state indexes", () => {
		const root = mkRoot("close-recovery-local-state");
		try {
			const created = newWorkstream(root, "close recovery local state");
			startTask(root, { session: created.session, taskId: "T-01" });
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });

			const closedAt = "2026-07-09T22:30:00.000Z";
			writeFileSync(
				created.taskPath,
				readFileSync(created.taskPath, "utf8")
					.replace('status: "active"', 'status: "closed"')
					.replace(
						/^updated_at: .*$/m,
						`updated_at: ${JSON.stringify(closedAt)}\nclosed_at: ${JSON.stringify(closedAt)}`,
					),
				"utf8",
			);
			const workbenchIndexPath = join(
				root,
				".afol",
				"data",
				"index",
				"workbench.json",
			);
			const staleIndex = JSON.parse(
				readFileSync(workbenchIndexPath, "utf8"),
			) as Record<string, unknown>;
			staleIndex.generated_at = new Date(0).toISOString();
			writeFileSync(
				workbenchIndexPath,
				`${JSON.stringify(staleIndex)}\n`,
				"utf8",
			);
			expect(validateWorkBenchIndex(root).ok).toBe(false);

			expect(() => closeSession(root, created.session)).not.toThrow();
			expect(validateWorkBenchIndex(root).ok).toBe(true);
			expect(validateFilesIndex(root).ok).toBe(true);
			expect(readFileSync(created.taskPath, "utf8")).toContain(
				`closed_at: ${JSON.stringify(closedAt)}`,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("missing canonical task file blocks every lifecycle mutation", () => {
		const root = mkRoot("missing-task-lifecycle-guard");
		try {
			const created = newWorkstream(root, "missing task lifecycle guard");
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			rmSync(created.taskPath);
			expect(isSessionClosed(root, created.session)).toBe(false);
			const before = {
				evidence: readFileSync(created.evidencePath, "utf8"),
				log: readFileSync(created.logPath, "utf8"),
				events: readFileSync(resolveWorkbenchEventLogPath(root), "utf8"),
			};

			expect(() =>
				startTask(root, { session: created.session, taskId: "T-01" }),
			).toThrow();
			expect(() =>
				recordObservedCompletion(root, {
					session: created.session,
					taskId: "T-01",
					command: "bun test --rerun",
					result: "passed",
				}),
			).toThrow();
			expect(() =>
				doneTask(root, { session: created.session, taskId: "T-01" }),
			).toThrow();
			expect(() =>
				appendTimelineEntry(root, created.session, "must not be appended"),
			).toThrow();

			expect(readFileSync(created.evidencePath, "utf8")).toBe(before.evidence);
			expect(readFileSync(created.logPath, "utf8")).toBe(before.log);
			expect(readFileSync(resolveWorkbenchEventLogPath(root), "utf8")).toBe(
				before.events,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("closed lifecycle metadata accepts an ISO timestamp without milliseconds", () => {
		const root = mkRoot("close-timestamp-no-milliseconds");
		try {
			const created = newWorkstream(root, "close timestamp no milliseconds");
			const closedAt = "2026-07-09T22:30:00Z";
			writeFileSync(
				created.taskPath,
				readFileSync(created.taskPath, "utf8")
					.replace('status: "active"', 'status: "closed"')
					.replace(
						/^updated_at: .*$/m,
						`updated_at: ${JSON.stringify(closedAt)}\nclosed_at: ${JSON.stringify(closedAt)}`,
					),
				"utf8",
			);

			expect(isSessionClosed(root, created.session)).toBe(true);
			expect(() => closeSession(root, created.session)).not.toThrow();
			expect(readFileSync(created.taskPath, "utf8")).toContain(
				`closed_at: ${JSON.stringify(closedAt)}`,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("closed sessions remain durable after post-close governance resolution", () => {
		for (const resolution of ["resolved", "waived"] as const) {
			const root = mkRoot(`closed-governance-${resolution}`);
			try {
				const created = newWorkstream(root, `closed governance ${resolution}`);
				startTask(root, { session: created.session, taskId: "T-01" });
				recordObservedCompletion(root, {
					session: created.session,
					taskId: "T-01",
					command: "bun test",
					result: "passed",
				});
				doneTask(root, { session: created.session, taskId: "T-01" });
				writeFileSync(
					join(
						root,
						".afol",
						"wb",
						created.session,
						`${created.session}_report_01.md`,
					),
					"# Report\n",
					"utf8",
				);
				closeSession(root, created.session);

				const closedBefore = readFileSync(created.taskPath, "utf8");
				const closedAt =
					closedBefore.match(/^closed_at: "([^"]+)"$/m)?.[1] ?? "";
				expect(closedAt).not.toBe("");
				expect(isSessionClosed(root, created.session)).toBe(true);
				if (resolution === "resolved") {
					mkdirSync(join(root, ".afol", "adm", "roadmap"), { recursive: true });
					mkdirSync(join(root, ".afol", "adm", "specs"), { recursive: true });
					writeFileSync(
						join(root, ".afol", "adm", "roadmap", "GENERAL-ROADMAP.md"),
						"# Roadmap\n\n### F-01 Test feature\n\n- Status: active\n- Governing spec: .afol/adm/specs/spec-01.md\n",
						"utf8",
					);
					writeFileSync(
						join(root, ".afol", "adm", "specs", "spec-01.md"),
						"---\nid: spec-01\nstatus: active\nroadmap_feature: F-01\n---\n\n# Spec\n",
						"utf8",
					);
				}

				Bun.sleepSync(5);
				const entry = resolvePendingSpec(
					root,
					resolution === "resolved"
						? {
								session: created.session,
								featureId: "F-01",
								parentSpec: "spec-01",
							}
						: {
								session: created.session,
								noSpecRequiredReason: "post-close governance waiver",
							},
				);
				expect(entry.status).toBe(resolution);

				const closedAfter = readFileSync(created.taskPath, "utf8");
				const updatedAt =
					closedAfter.match(/^updated_at: "([^"]+)"$/m)?.[1] ?? "";
				expect(closedAfter).not.toBe(closedBefore);
				expect(closedAfter).toContain(
					resolution === "resolved"
						? 'governance_status: "governed"'
						: 'governance_status: "unbound"',
				);
				expect(closedAfter).toContain(`closed_at: ${JSON.stringify(closedAt)}`);
				expect(Date.parse(updatedAt)).toBeGreaterThan(Date.parse(closedAt));
				expect(isSessionClosed(root, created.session)).toBe(true);
				expect(() => closeSession(root, created.session)).not.toThrow();
				expect(() =>
					recordEvidenceRaw(root, {
						session: created.session,
						taskId: "T-01",
						command: "bun test --rerun",
						result: "passed",
					}),
				).toThrow(`Session ${created.session} is closed.`);
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		}
	});

	test("closeSession stays committed when diagnostic writes fail", () => {
		const root = mkRoot("close-diagnostic-failure");
		try {
			const created = newWorkstream(root, "close diagnostic failure");
			startTask(root, { session: created.session, taskId: "T-01" });
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });
			const eventPath = resolveWorkbenchEventLogPath(root);
			rmSync(eventPath, { force: true });
			mkdirSync(eventPath, { recursive: true });

			const warnings = closeSession(root, created.session);
			expect(warnings).toContain(
				"workbench close event failed after the durable close commit; the durable task metadata remains authoritative.",
			);
			expect(warnings).toContain(
				"session-end telemetry failed after the durable close commit; the durable task metadata remains authoritative.",
			);
			expect(existsSync(created.activeSessionPath)).toBe(false);
			expect(readFileSync(created.taskPath, "utf8")).toContain(
				'status: "closed"',
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("closeSession prepends canonical metadata to a legacy task without changing its body", () => {
		const root = mkRoot("close-legacy-task");
		try {
			const created = newWorkstream(root, "close legacy task");
			startTask(root, { session: created.session, taskId: "T-01" });
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });
			const task = readFileSync(created.taskPath, "utf8");
			const legacyBody = task.slice(task.indexOf("# Tasks:"));
			writeFileSync(created.taskPath, legacyBody, "utf8");

			closeSession(root, created.session);
			const closedTask = readFileSync(created.taskPath, "utf8");
			expect(closedTask).toContain('doc_type: "workbench_task"');
			expect(closedTask).toContain('status: "closed"');
			expect(closedTask.endsWith(legacyBody)).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("corrupt close metadata blocks lifecycle mutation before commit", () => {
		const root = mkRoot("corrupt-close-metadata");
		try {
			const created = newWorkstream(root, "corrupt close metadata");
			writeFileSync(
				created.taskPath,
				readFileSync(created.taskPath, "utf8").replace(
					'status: "active"',
					'status: "closed"',
				),
				"utf8",
			);

			expect(() =>
				startTask(root, { session: created.session, taskId: "T-01" }),
			).toThrow("corrupt lifecycle metadata");
			expect(() => closeSession(root, created.session)).toThrow(
				"corrupt lifecycle metadata",
			);
			expect(existsSync(created.activeSessionPath)).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("terminal task state does not imply an explicit session close", () => {
		const root = mkRoot("terminal-before-close");
		try {
			const created = newWorkstream(root, "terminal-before-close");

			startTask(root, { session: created.session, taskId: "T-01" });
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });

			expect(() =>
				recordObservedCompletion(root, {
					session: created.session,
					taskId: "T-01",
					command: "bun test --rerun",
					result: "passed",
				}),
			).not.toThrow();
			expect(() =>
				appendTimelineEntry(root, created.session, "pre-close report note"),
			).not.toThrow();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("terminal task rows without durable close metadata remain bindable", () => {
		for (const state of ["done", "moved", "completed", "skipped"] as const) {
			const root = mkRoot(`legacy-close-${state}`);
			try {
				writeCliProjectContract(root);
				const created = newWorkstream(root, `legacy close ${state}`);
				writeFileSync(
					created.taskPath,
					readFileSync(created.taskPath, "utf8").replace(
						"| T-01 | pending |",
						`| T-01 | ${state} |`,
					),
					"utf8",
				);

				expect(isSessionClosed(root, created.session)).toBe(false);
				const bind = runKernel(root, [
					"session",
					"bind",
					"--session",
					created.session,
					"--dry-run",
					"--json",
				]);
				expect(bind.status).toBe(0);
				expect(parseEnvelope(bind.stdout as string)).toMatchObject({
					ok: true,
					action: "session.bind",
					data: {
						dry_run: true,
						session: created.session,
					},
				});
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		}
	});

	test("a close event for another session does not block lifecycle mutations", () => {
		const root = mkRoot("unrelated-close-event");
		try {
			const closed = newWorkstream(root, "closed event owner");
			startTask(root, { session: closed.session, taskId: "T-01" });
			recordObservedCompletion(root, {
				session: closed.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: closed.session, taskId: "T-01" });
			writeFileSync(
				join(
					root,
					".afol",
					"wb",
					closed.session,
					`${closed.session}_report_01.md`,
				),
				"# Report\n",
			);
			closeSession(root, closed.session);

			const open = newWorkstream(root, "open event peer");
			expect(() =>
				startTask(root, { session: open.session, taskId: "T-01" }),
			).not.toThrow();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("closeSession creates missing final report unless explicitly waived", () => {
		const root = mkRoot("close-warnings");
		try {
			const created = newWorkstream(root, "close-session-warnings", {
				tasks: ["first task", "second task"],
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
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-02",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-02" });

			const result = closeSession(root, created.session);
			expect(result.report.status).toBe("created");
			expect(
				existsSync(
					join(
						root,
						".afol",
						"wb",
						created.session,
						`${created.session}_report_01.md`,
					),
				),
			).toBe(true);
			expect(existsSync(created.activeSessionPath)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("closeSession creates a deterministic report and one summary section", () => {
		const root = mkRoot("close-autoreport");
		try {
			const created = newWorkstream(root, "close auto report");
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });

			const result = closeSession(root, created.session, {
				summary: "close verified\n## Summary",
			});
			const reportPath = join(
				root,
				".afol",
				"wb",
				created.session,
				`${created.session}_report_01.md`,
			);
			expect(result.report).toMatchObject({
				status: "created",
				path: `.afol/wb/${created.session}/${created.session}_report_01.md`,
				summary_source: "flag",
			});
			expect(readFileSync(reportPath, "utf8")).toContain("close verified");
			expect(
				readFileSync(created.logPath, "utf8").match(/^## Summary$/gm) ?? [],
			).toHaveLength(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("closeSession records an explicit report waiver idempotently", () => {
		const root = mkRoot("close-waiver-artifact");
		try {
			const created = newWorkstream(root, "close waiver artifact");
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });

			const result = closeSession(root, created.session, {
				allowNoReport: true,
				reason: "no report needed",
			});
			expect(result.report).toMatchObject({
				status: "waived",
				path: null,
				summary_source: "waiver",
			});
			expect(
				existsSync(
					join(
						root,
						".afol",
						"wb",
						created.session,
						`${created.session}_report_01.md`,
					),
				),
			).toBe(false);
			const firstLog = readFileSync(created.logPath, "utf8");
			expect(firstLog).toContain("Report waived: no report needed");
			expect((firstLog.match(/^## Summary$/gm) ?? []).length).toBe(1);
			expect(closeSession(root, created.session).report.status).toBe("waived");
			expect(readFileSync(created.logPath, "utf8")).toBe(firstLog);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("closeSession preserves existing report bytes", () => {
		const root = mkRoot("close-existing-report");
		try {
			const created = newWorkstream(root, "close existing report");
			const reportPath = join(
				root,
				".afol",
				"wb",
				created.session,
				`${created.session}_report_01.md`,
			);
			const report = "# Human-authored report\n\nKeep this byte-for-byte.\n";
			writeFileSync(reportPath, report, "utf8");
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });
			expect(closeSession(root, created.session).report.status).toBe(
				"existing",
			);
			expect(readFileSync(reportPath, "utf8")).toBe(report);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("closeSession canonicalizes duplicate log summaries and persists explicit summary", () => {
		const root = mkRoot("close-summary-canonical");
		try {
			const created = newWorkstream(root, "close summary canonical");
			writeFileSync(
				created.logPath,
				"# Log\n\n## Summary\nold\n\n## Summary\nsecond\n\n## Notes\nkeep\n",
				"utf8",
			);
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });

			closeSession(root, created.session, { summary: "new summary" });
			const log = readFileSync(created.logPath, "utf8");
			expect((log.match(/^## Summary$/gm) ?? []).length).toBe(1);
			expect(log).toContain("new summary");
			expect(log).not.toContain("old");
			expect(log).not.toContain("second");
			expect(log).toContain("## Notes");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("closeSession rolls back generated report when log write fails", () => {
		const root = mkRoot("close-rollback");
		try {
			const created = newWorkstream(root, "close rollback");
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });
			rmSync(created.logPath);
			mkdirSync(created.logPath);
			expect(() => closeSession(root, created.session)).toThrow();
			expect(readFileSync(created.taskPath, "utf8")).toContain(
				'status: "active"',
			);
			expect(
				existsSync(
					join(
						root,
						".afol",
						"wb",
						created.session,
						`${created.session}_report_01.md`,
					),
				),
			).toBe(false);
			rmSync(created.logPath, { recursive: true, force: true });
			expect(closeSession(root, created.session).report.status).toBe("created");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("single high-impact task gets an auto-generated report", () => {
		const root = mkRoot("impact-report");
		try {
			const created = newWorkstream(root, "impact report", {
				noSpecRequiredReason: "fixture",
			});
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });
			const original = readFileSync(created.taskPath, "utf8");
			writeFileSync(
				created.taskPath,
				original.replace(
					/^(\| T-01 \| done \| [^|]+ \|)(.*)$/m,
					"$1 impact=high $2",
				),
			);
			expect(closeSession(root, created.session).report.status).toBe("created");
			writeFileSync(
				created.taskPath,
				readFileSync(created.taskPath, "utf8").replace(
					"impact=high",
					"impact=trivial",
				),
			);
			expect(closeSession(root, created.session)).toEqual(expect.any(Array));
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("closeSession accepts a log summary section after the title", () => {
		const root = mkRoot("close-summary-section");
		try {
			const created = newWorkstream(root, "close-session-summary");
			writeFileSync(
				join(
					root,
					".afol",
					"wb",
					created.session,
					`${created.session}_log_01.md`,
				),
				"# Log\n\n## Summary\n\n- done\n",
			);
			writeFileSync(
				join(
					root,
					".afol",
					"wb",
					created.session,
					`${created.session}_report_01.md`,
				),
				"# Report\n",
			);

			startTask(root, { session: created.session, taskId: "T-01" });
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });

			expect(closeSession(root, created.session)).toHaveLength(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("close command includes close warnings in json envelope with override", () => {
		const root = mkRoot("close-warnings-json");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "close-command-warnings-json");
			startTask(root, { session: created.session, taskId: "T-01" });
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });

			const proc = runKernel(root, [
				"close",
				"--session",
				created.session,
				"--allow-no-report",
				"--reason",
				"research-only session",
				"--json",
			]);
			expect(proc.status).toBe(0);
			const payload = parseEnvelope(proc.stdout as string);
			expect(payload).toMatchObject({
				schema: "afol.result/v1",
				ok: true,
				action: "workbench.close",
				warnings: ["final report artifact is missing"],
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("closeSession blocks multi-task sessions until every task is done", () => {
		const root = mkRoot("close-multi-task");
		try {
			const created = newWorkstream(root, "close-session", {
				tasks: ["Patch lifecycle renderer", "Verify multi-task closure"],
			});

			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });
			expect(() => closeSession(root, created.session)).toThrow(
				"blocking tasks",
			);

			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-02",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-02" });
			writeFileSync(
				join(
					root,
					".afol",
					"wb",
					created.session,
					`${created.session}_report_01.md`,
				),
				"# Report\n",
			);
			closeSession(root, created.session);
			expect(existsSync(created.activeSessionPath)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("closeSession refuses done tasks that fail strict evidence verification", () => {
		const root = mkRoot("close-strict");
		try {
			const created = newWorkstream(root, "close-strict");

			writeFileSync(
				created.taskPath,
				[
					"# Tasks: close-strict",
					"",
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | done | worker | forced done without evidence |",
					"",
				].join("\n"),
				"utf8",
			);

			expect(() => closeSession(root, created.session)).toThrow(
				"failed strict verification",
			);
			expect(existsSync(created.activeSessionPath)).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("lifecycle emits telemetry events alongside workbench events", () => {
		const root = mkRoot("telemetry");
		try {
			const created = newWorkstream(root, "telemetry-lifecycle");

			startTask(root, { session: created.session, taskId: "T-01" });

			recordObservedSuccess(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test --filter foo",
				result: "passed",
				provenance: "observed",
				exitCode: 0,
			});
			transitionTask(root, {
				session: created.session,
				taskId: "T-01",
				state: "implemented_untested",
			});
			transitionTask(root, {
				session: created.session,
				taskId: "T-01",
				state: "tested_needs_spec_validation",
			});

			doneTask(root, { session: created.session, taskId: "T-01" });

			closeSession(root, created.session);

			const telemetry = readTelemetryEvents(root);
			const eventMap = new Map(
				telemetry.map((entry) => [entry.event_type, entry]),
			);

			// All 5 telemetry event types present
			expect(eventMap.has("session_start")).toBe(true);
			expect(eventMap.has("task_start")).toBe(true);
			expect(eventMap.has("tool_exec")).toBe(true);
			expect(eventMap.has("task_complete")).toBe(true);
			expect(eventMap.has("session_end")).toBe(true);

			// schema_version is always "1"
			for (const entry of telemetry) {
				expect(entry.schema_version).toBe("1");
				expect(entry.source).toBe("afol-cli");
				expect(entry.session_id).toBe(created.session);
			}

			// Command sanitized to first token only
			const toolEvent = eventMap.get("tool_exec");
			expect(toolEvent?.cmd_type).toBe("bun");
			expect(toolEvent?.task_id).toBe("T-01");
			expect(toolEvent?.outcome).toBe("success");
			expect(toolEvent?.provenance).toBe("observed");

			// Task events carry correct task_id
			expect(eventMap.get("task_start")?.task_id).toBe("T-01");
			expect(eventMap.get("task_complete")?.task_id).toBe("T-01");

			// Session events do not have task_id
			expect(eventMap.get("session_start")?.task_id).toBeUndefined();
			expect(eventMap.get("session_end")?.task_id).toBeUndefined();

			// Workbench events still present alongside telemetry
			const wbEventPath = resolveWorkbenchEventLogPath(root);
			const wbContent = readFileSync(wbEventPath, "utf8");
			const wbEvents = wbContent
				.split("\n")
				.filter((line) => line.trim().length > 0)
				.map((line) => JSON.parse(line));
			const wbTypes = new Set(wbEvents.map((e: { type: string }) => e.type));
			expect(wbTypes.has("workbench.new")).toBe(true);
			expect(wbTypes.has("workbench.start_task")).toBe(true);
			expect(wbTypes.has("workbench.record_evidence")).toBe(true);
			expect(wbTypes.has("workbench.mark_done")).toBe(true);
			expect(wbTypes.has("workbench.close")).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("task completion authorization and transitions", () => {
	test("observed success before problem and restart cannot authorize done", () => {
		const root = mkRoot("stale-after-restart");
		try {
			const created = newWorkstream(root, "stale evidence", {
				noSpecRequiredReason: "test fixture",
			});
			startTask(root, { session: created.session, taskId: "T-01" });
			recordEvidenceRaw(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
				exitCode: 0,
				provenance: "observed",
			});
			transitionTask(root, {
				session: created.session,
				taskId: "T-01",
				state: "problem",
			});
			transitionTask(root, {
				session: created.session,
				taskId: "T-01",
				state: "in_progress",
			});
			advanceTaskAfterObservedTest(root, {
				session: created.session,
				taskId: "T-01",
			});
			expect(() =>
				doneTask(root, { session: created.session, taskId: "T-01" }),
			).toThrow("after the latest problem/restart");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("observed test advancement follows only the remaining legal edges", () => {
		for (const initial of [
			"in_progress",
			"implemented_untested",
			"tested_needs_spec_validation",
		] as const) {
			const root = mkRoot(`test-advance-${initial}`);
			try {
				const created = newWorkstream(root, initial, {
					noSpecRequiredReason: "fixture",
				});
				startTask(root, { session: created.session, taskId: "T-01" });
				if (initial !== "in_progress")
					transitionTask(root, {
						session: created.session,
						taskId: "T-01",
						state: "implemented_untested",
					});
				if (initial === "tested_needs_spec_validation")
					transitionTask(root, {
						session: created.session,
						taskId: "T-01",
						state: "tested_needs_spec_validation",
					});
				advanceTaskAfterObservedTest(root, {
					session: created.session,
					taskId: "T-01",
				});
				const task = readFileSync(created.taskPath, "utf8");
				expect(task).toContain("| T-01 | tested_needs_spec_validation |");
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		}
	});
	test("artifact policy stores a hash and blocks completion after artifact drift", () => {
		const root = mkRoot("artifact-policy");
		try {
			const created = newWorkstream(root, "artifact policy", {
				noSpecRequiredReason: "test fixture",
			});
			const artifactPath = join(root, "result.txt");
			writeFileSync(artifactPath, "v1\n");
			startTask(root, { session: created.session, taskId: "T-01" });
			transitionTask(root, {
				session: created.session,
				taskId: "T-01",
				state: "implemented_untested",
				completionPolicy: "artifact",
			});
			const evidence = recordEvidenceRaw(root, {
				session: created.session,
				taskId: "T-01",
				command: "artifact review",
				result: "passed",
				artifact: "result.txt",
				provenance: "declared",
			});
			expect(evidence.artifact_sha256).toMatch(/^[a-f0-9]{64}$/);
			transitionTask(root, {
				session: created.session,
				taskId: "T-01",
				state: "tested_needs_spec_validation",
			});
			writeFileSync(artifactPath, "v2\n");
			expect(() =>
				doneTask(root, { session: created.session, taskId: "T-01" }),
			).toThrow("changed after evidence");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("waiver policy requires reason and explicit local approval audit metadata", () => {
		const root = mkRoot("waiver-policy");
		try {
			const created = newWorkstream(root, "waiver policy", {
				noSpecRequiredReason: "test fixture",
			});
			startTask(root, { session: created.session, taskId: "T-01" });
			transitionTask(root, {
				session: created.session,
				taskId: "T-01",
				state: "implemented_untested",
				completionPolicy: "waiver",
			});
			expect(() =>
				recordEvidenceRaw(root, {
					session: created.session,
					taskId: "T-01",
					command: "waiver",
					result: "passed",
					note: "not executable",
				}),
			).toThrow("trusted local context");
			const evidence = recordEvidenceRaw(root, {
				session: created.session,
				taskId: "T-01",
				command: "waiver",
				result: "passed",
				note: "not executable",
				approvalContext: defaultOperationContext(),
			});
			expect(evidence.waiver_reason).toBe("not executable");
			expect(evidence.approved_by).toBe("local:interactive");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("restricted callers cannot self-approve waiver evidence", () => {
		const root = mkRoot("waiver-restricted");
		try {
			const created = newWorkstream(root, "waiver restricted", {
				noSpecRequiredReason: "test fixture",
			});
			startTask(root, { session: created.session, taskId: "T-01" });
			transitionTask(root, {
				session: created.session,
				taskId: "T-01",
				state: "implemented_untested",
				completionPolicy: "waiver",
			});
			expect(() =>
				recordEvidenceRaw(root, {
					session: created.session,
					taskId: "T-01",
					command: "waiver",
					result: "passed",
					note: "not executable",
					approvalContext: agentOperationContext(),
				}),
			).toThrow("trusted local context");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("committed problem transition invalidates evidence when its event fails", () => {
		const root = mkRoot("attempt-event-failure");
		try {
			const created = newWorkstream(root, "attempt event failure", {
				noSpecRequiredReason: "test fixture",
			});
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			const warnings = transitionTask(
				root,
				{ session: created.session, taskId: "T-01", state: "problem" },
				{
					beforeAuxiliary(label) {
						if (label === "workbench transition event")
							throw new Error("disk full");
					},
				},
			);
			expect(warnings.join("\n")).toContain("disk full");
			transitionTask(
				root,
				{ session: created.session, taskId: "T-01", state: "in_progress" },
				{
					beforeAuxiliary(label) {
						if (label === "workbench transition event")
							throw new Error("disk full");
					},
				},
			);
			transitionTask(root, {
				session: created.session,
				taskId: "T-01",
				state: "implemented_untested",
			});
			transitionTask(root, {
				session: created.session,
				taskId: "T-01",
				state: "tested_needs_spec_validation",
			});
			expect(() =>
				doneTask(root, { session: created.session, taskId: "T-01" }),
			).toThrow("latest problem/restart transition");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
	test("transition command emits JSON and uses the formal boundary", () => {
		const root = mkRoot("transition-json");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "transition json");
			startTask(root, { session: created.session, taskId: "T-01" });
			const proc = runKernel(root, [
				"transition",
				"--session",
				created.session,
				"--task-id",
				"T-01",
				"--state",
				"implemented_untested",
				"--json",
			]);
			expect(proc.status).toBe(0);
			expect(parseEnvelope(proc.stdout as string)).toMatchObject({
				ok: true,
				action: "workbench.transition",
				data: {
					session: created.session,
					task: "T-01",
					state: "implemented_untested",
				},
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("transition preserves explicit session without a completion policy", async () => {
		const root = mkRoot("transition-explicit-session");
		try {
			const first = newWorkstream(root, "first transition session", {
				noSpecRequiredReason: "fixture",
			});
			startTask(root, { session: first.session, taskId: "T-01" });
			newWorkstream(root, "active transition session", {
				noSpecRequiredReason: "fixture",
			});
			expect(
				await runTransitionCommand(
					[
						"--session",
						first.session,
						"--task-id",
						"T-01",
						"--state",
						"implemented_untested",
					],
					root,
				),
			).toBe(0);
			expect(readFileSync(first.taskPath, "utf8")).toContain(
				"| T-01 | implemented_untested |",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("transition rejects completion-policy without a value", async () => {
		const root = mkRoot("transition-missing-policy");
		try {
			const created = newWorkstream(root, "missing transition policy", {
				noSpecRequiredReason: "fixture",
			});
			startTask(root, { session: created.session, taskId: "T-01" });
			expect(
				await runTransitionCommand(
					[
						"--session",
						created.session,
						"--task-id",
						"T-01",
						"--state",
						"implemented_untested",
						"--completion-policy",
					],
					root,
				),
			).toBe(2);
			expect(readFileSync(created.taskPath, "utf8")).toContain(
				"| T-01 | in_progress |",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("start command surfaces durable warnings in every output mode", async () => {
		for (const mode of ["default", "compact", "json", "brief"] as const) {
			const root = mkRoot(`start-warning-${mode}`);
			const output: string[] = [];
			const originalLog = console.log;
			try {
				const created = newWorkstream(root, `start warning ${mode}`, {
					noSpecRequiredReason: "fixture",
				});
				console.log = (...values: unknown[]) => output.push(values.join(" "));
				const args = ["--session", created.session, "--task-id", "T-01"];
				if (mode === "compact") args.push("--compact");
				if (mode === "json") args.push("--json");
				if (mode === "brief") args.push("--brief");
				expect(
					await runStartCommand(args, root, undefined, {
						beforeAuxiliary: (label) => {
							if (label === "workbench start event")
								throw new Error("injected");
						},
					}),
				).toBe(0);
				expect(output.join("\n")).toContain(
					"workbench start event failed after durable commit: injected",
				);
			} finally {
				console.log = originalLog;
				rmSync(root, { recursive: true, force: true });
			}
		}
	});

	test("transition reports auxiliary failure as a committed warning", async () => {
		const root = mkRoot("transition-aux-warning");
		const output: string[] = [];
		const originalLog = console.log;
		try {
			const created = newWorkstream(root, "transition aux warning", {
				noSpecRequiredReason: "fixture",
			});
			startTask(root, { session: created.session, taskId: "T-01" });
			console.log = (...values: unknown[]) => output.push(values.join(" "));
			expect(
				await runTransitionCommand(
					[
						"--session",
						created.session,
						"--task-id",
						"T-01",
						"--state",
						"implemented_untested",
					],
					root,
					undefined,
					{
						beforeAuxiliary: (label) => {
							if (label === "workbench transition event")
								throw new Error("injected");
						},
					},
				),
			).toBe(0);
			expect(output.join("\n")).toContain(
				"workbench transition event failed after durable commit: injected",
			);
			expect(readFileSync(created.taskPath, "utf8")).toContain(
				"| T-01 | implemented_untested |",
			);
		} finally {
			console.log = originalLog;
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("forbids shortcut transitions in a table", () => {
		for (const [source, target] of [
			["pending", "tested_needs_spec_validation"],
			["in_progress", "tested_needs_spec_validation"],
			["implemented_untested", "moved"],
		] as const) {
			const root = mkRoot(`forbidden-${source}-${target}`);
			try {
				const created = newWorkstream(root, `forbidden ${source} ${target}`);
				if (source !== "pending")
					startTask(root, { session: created.session, taskId: "T-01" });
				if (source === "implemented_untested")
					transitionTask(root, {
						session: created.session,
						taskId: "T-01",
						state: "implemented_untested",
					});
				expect(() =>
					transitionTask(root, {
						session: created.session,
						taskId: "T-01",
						state: target,
					}),
				).toThrow(`${source} -> ${target}`);
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		}
	});

	test("allows every non-done edge in a table", () => {
		const edges = [
			["pending", "in_progress"],
			["pending", "moved"],
			["in_progress", "implemented_untested"],
			["in_progress", "problem"],
			["in_progress", "moved"],
			["implemented_untested", "tested_needs_spec_validation"],
			["implemented_untested", "problem"],
			["tested_needs_spec_validation", "problem"],
			["problem", "in_progress"],
			["problem", "moved"],
		] as const;
		for (const [index, [source, target]] of edges.entries()) {
			const root = mkRoot(`allowed-edge-${index}`);
			try {
				const created = newWorkstream(root, `allowed edge ${index}`);
				if (source !== "pending")
					startTask(root, { session: created.session, taskId: "T-01" });
				if (
					source === "implemented_untested" ||
					source === "tested_needs_spec_validation"
				)
					transitionTask(root, {
						session: created.session,
						taskId: "T-01",
						state: "implemented_untested",
					});
				if (source === "tested_needs_spec_validation")
					transitionTask(root, {
						session: created.session,
						taskId: "T-01",
						state: "tested_needs_spec_validation",
					});
				if (source === "problem")
					transitionTask(root, {
						session: created.session,
						taskId: "T-01",
						state: "problem",
					});
				expect(() =>
					transitionTask(root, {
						session: created.session,
						taskId: "T-01",
						state: target,
					}),
				).not.toThrow();
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		}
	});

	test("done JSON identifies the authorizing evidence", () => {
		const root = mkRoot("done-authorization-json");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "done authorization json");
			startTask(root, { session: created.session, taskId: "T-01" });
			const proc = runKernel(root, [
				"done",
				"--session",
				created.session,
				"--task-id",
				"T-01",
				"--test",
				"true",
				"--json",
			]);
			expect(proc.status).toBe(0);
			const envelope = parseEnvelope(proc.stdout as string) as {
				data?: { authorizing_evidence_id?: string };
			};
			expect(envelope.data?.authorizing_evidence_id).toMatch(/^E-/);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("done retry is idempotent after the durable state commit", () => {
		const root = mkRoot("done-idempotent-retry");
		try {
			const created = newWorkstream(root, "done retry");
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			const first = doneTask(root, {
				session: created.session,
				taskId: "T-01",
			});
			const retried = doneTask(root, {
				session: created.session,
				taskId: "T-01",
			});
			expect(retried.authorizingEvidenceId).toBe(first.authorizingEvidenceId);
			expect(() =>
				advanceTaskAfterObservedTest(root, {
					session: created.session,
					taskId: "T-01",
				}),
			).not.toThrow();
			expect(readFileSync(created.taskPath, "utf8")).toContain(
				"| T-01 | done |",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("requires an observed zero-exit success and returns its evidence id", () => {
		const root = mkRoot("observed-completion-authorization");
		try {
			const created = newWorkstream(root, "observed completion authorization");
			startTask(root, { session: created.session, taskId: "T-01" });
			recordEvidenceRaw(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			expect(() =>
				doneTask(root, { session: created.session, taskId: "T-01" }),
			).toThrow("authorization must be observed with exit_code 0");

			const observed = recordObservedSuccess(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
				exitCode: 0,
				provenance: "observed",
			});
			transitionTask(root, {
				session: created.session,
				taskId: "T-01",
				state: "implemented_untested",
			});
			transitionTask(root, {
				session: created.session,
				taskId: "T-01",
				state: "tested_needs_spec_validation",
			});
			expect(
				doneTask(root, { session: created.session, taskId: "T-01" }),
			).toEqual({ authorizingEvidenceId: observed.id });
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("later observed success supersedes a failure", () => {
		const root = mkRoot("later-observed-success");
		try {
			const created = newWorkstream(root, "later observed success");
			startTask(root, { session: created.session, taskId: "T-01" });
			recordObservedSuccess(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "failed",
				exitCode: 1,
				provenance: "observed",
			});
			const observed = recordObservedSuccess(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
				exitCode: 0,
				provenance: "observed",
			});
			transitionTask(root, {
				session: created.session,
				taskId: "T-01",
				state: "implemented_untested",
			});
			transitionTask(root, {
				session: created.session,
				taskId: "T-01",
				state: "tested_needs_spec_validation",
			});
			expect(
				doneTask(root, { session: created.session, taskId: "T-01" }),
			).toEqual({ authorizingEvidenceId: observed.id });
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects direct done and terminal restart transitions", () => {
		const root = mkRoot("formal-transitions");
		try {
			const created = newWorkstream(root, "formal transitions");
			recordObservedSuccess(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
				exitCode: 0,
				provenance: "observed",
			});
			expect(() =>
				doneTask(root, { session: created.session, taskId: "T-01" }),
			).toThrow("pending -> done");
			startTask(root, { session: created.session, taskId: "T-01" });
			recordObservedSuccess(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test after start",
				result: "passed",
				exitCode: 0,
				provenance: "observed",
			});
			transitionTask(root, {
				session: created.session,
				taskId: "T-01",
				state: "implemented_untested",
			});
			transitionTask(root, {
				session: created.session,
				taskId: "T-01",
				state: "tested_needs_spec_validation",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });
			expect(() =>
				startTask(root, { session: created.session, taskId: "T-01" }),
			).toThrow("done -> in_progress");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("durable lifecycle auxiliary failures", () => {
	const failAuxiliary = (target: string) => ({
		beforeAuxiliary: (label: string) => {
			if (label === target) throw new Error(`injected ${label}`);
		},
	});
	const expectWarning = (warnings: string[] | undefined, label: string) => {
		expect(warnings).toEqual([
			expect.stringContaining(`${label} failed after durable commit`),
		]);
	};

	test("new preserves created artifacts when auxiliary writes fail", () => {
		for (const label of [
			"workbench new event",
			"session-start telemetry",
			"pending-spec registration",
			"local-state refresh",
		]) {
			const root = mkRoot(`new-aux-${label.replaceAll(" ", "-")}`);
			try {
				const created = newWorkstream(
					root,
					"durable new",
					{ noSpecRequiredReason: "fixture" },
					failAuxiliary(label),
				);
				expectWarning(created.warnings, label);
				expect(existsSync(created.planPath)).toBe(true);
				expect(existsSync(created.taskPath)).toBe(true);
				expect(readFileSync(created.activeSessionPath, "utf8").trim()).toBe(
					created.session,
				);
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		}
	});

	test("start preserves in_progress and rejects a duplicate retry", () => {
		for (const label of [
			"workbench start event",
			"task-start telemetry",
			"local-state refresh",
		]) {
			const root = mkRoot(`start-aux-${label.replaceAll(" ", "-")}`);
			try {
				const created = newWorkstream(root, "durable start", {
					noSpecRequiredReason: "fixture",
				});
				const warnings = startTask(
					root,
					{ session: created.session, taskId: "T-01" },
					failAuxiliary(label),
				);
				expectWarning(warnings, label);
				expect(readFileSync(created.taskPath, "utf8")).toContain(
					"| T-01 | in_progress |",
				);
				expect(() =>
					startTask(root, { session: created.session, taskId: "T-01" }),
				).toThrow("in_progress -> in_progress");
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		}
	});

	test("evidence preserves exactly one ledger row when auxiliary writes fail", () => {
		for (const label of [
			"workbench evidence event",
			"tool-exec telemetry",
			"local-state refresh",
		]) {
			const root = mkRoot(`evidence-aux-${label.replaceAll(" ", "-")}`);
			try {
				const created = newWorkstream(root, "durable evidence", {
					noSpecRequiredReason: "fixture",
				});
				startTask(root, { session: created.session, taskId: "T-01" });
				const evidence = recordEvidenceRaw(
					root,
					{
						session: created.session,
						taskId: "T-01",
						command: "bun test",
						result: "passed",
						provenance: "observed",
						exitCode: 0,
					},
					failAuxiliary(label),
				);
				expectWarning(evidence.warnings, label);
				const rows = readFileSync(created.evidencePath, "utf8")
					.trim()
					.split("\n");
				expect(rows).toHaveLength(1);
				expect(JSON.parse(rows[0] ?? "{}").id).toBe(evidence.id);
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		}
	});

	test("done preserves completion and accepts an idempotent retry", () => {
		for (const label of [
			"workbench done event",
			"task-complete telemetry",
			"local-state refresh",
		]) {
			const root = mkRoot(`done-aux-${label.replaceAll(" ", "-")}`);
			try {
				const created = newWorkstream(root, "durable done", {
					noSpecRequiredReason: "fixture",
				});
				startTask(root, { session: created.session, taskId: "T-01" });
				const evidence = recordObservedSuccess(root, {
					session: created.session,
					taskId: "T-01",
					command: "bun test",
					result: "passed",
				});
				transitionTask(root, {
					session: created.session,
					taskId: "T-01",
					state: "implemented_untested",
				});
				transitionTask(root, {
					session: created.session,
					taskId: "T-01",
					state: "tested_needs_spec_validation",
				});
				const result = doneTask(
					root,
					{ session: created.session, taskId: "T-01" },
					failAuxiliary(label),
				);
				expect(result.authorizingEvidenceId).toBe(evidence.id);
				expectWarning(result.warnings, label);
				expect(readFileSync(created.taskPath, "utf8")).toContain(
					"| T-01 | done |",
				);
				const retried = doneTask(root, {
					session: created.session,
					taskId: "T-01",
				});
				expect(retried.authorizingEvidenceId).toBe(evidence.id);
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		}
	});
});
