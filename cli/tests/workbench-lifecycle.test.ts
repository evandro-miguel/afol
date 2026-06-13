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
import { validateFilesIndex } from "../services/local-state/project-indexes";
import { resolveWorkbenchEventLogPath } from "../services/local-state/workbench-events";
import { validateWorkBenchIndex } from "../services/local-state/workbench-index";
import {
	appendTimelineEntry,
	closeSession,
	doneTask,
	newWorkstream,
	recordEvidence,
	startTask,
} from "../services/workbench/lifecycle";

const kernelPath = `${process.cwd()}/cli/main.ts`;

function mkRoot(name: string): string {
	return mkdtempSync(join(tmpdir(), `wb-lifecycle-${name}-`));
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
				/^\d{6}_\d{4}_cli-native-command-parity(?:_\d{2})?$/,
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

	test("cli workbench lifecycle json envelopes", () => {
		const root = mkRoot("cli-json");
		try {
			writeCliProjectContract(root);

			const newProc = runKernel(root, ["new", "cli json", "--json"]);
			expect(newProc.status).toBe(0);
			const newEnvelope = parseEnvelope(newProc.stdout as string);
			expect(newEnvelope).toMatchObject({
				schema: "afol.result/v1",
				ok: true,
				action: "workbench.new",
			});
			expect((newEnvelope.data as Record<string, unknown>).session).toMatch(
				/^\d{6}_\d{4}_cli-json(?:_\d{2})?$/,
			);
			expect((newEnvelope.data as Record<string, unknown>).status).toBe(
				"created",
			);

			const created = newWorkstream(root, "cli done json");
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

			recordEvidence(root, {
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

			const closeProc = runKernel(root, ["close", "--session", created.session, "--json"]);
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

	test("rejects json for evidence command", () => {
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

			expect(proc.status).toBe(2);
			expect(proc.stdout as string).toBe("");
			expect(proc.stderr as string).toContain(
				"JSON output is not supported for evidence.",
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
				"bun -e \"process.exit(3)\"",
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

	test("startTask marks row in_progress", () => {
		const root = mkRoot("start");
		try {
			const created = newWorkstream(root, "start-task");
			startTask(root, { session: created.session, taskId: "T-01" });

			const taskDoc = readFileSync(created.taskPath, "utf8");
			expect(taskDoc).toContain("| T-01 | in_progress | worker |");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("recordEvidence appends JSONL entry", () => {
		const root = mkRoot("evidence");
		try {
			const created = newWorkstream(root, "record-evidence");
			const entry = recordEvidence(root, {
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
			};
			expect(parsed.task_id).toBe("T-01");
			expect(parsed.command).toBe("bun test");
			expect(parsed.result).toBe("passed");
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
			expect(
				new Set(
					evidenceRows.map(
						(row) => `${row.command}:${row.result}:${row.task_id}`,
					),
				).size,
			).toBe(8);

			const eventRows = readLocalStateEvents(root);
			expect(eventRows).toHaveLength(9);
			expect(
				eventRows.filter((row) => row.type === "workbench.record_evidence"),
			).toHaveLength(8);
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
			recordEvidence(root, {
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
			recordEvidence(root, {
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

			recordEvidence(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "failed",
			});
			expect(() =>
				doneTask(root, { session: created.session, taskId: "T-01" }),
			).toThrow("requires passed evidence");

			recordEvidence(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "green",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });

			const taskDoc = readFileSync(created.taskPath, "utf8");
			expect(taskDoc).toContain("| T-01 | done | worker |");
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

			recordEvidence(root, {
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
				[
					"# Tasks: close-session",
					"",
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | problem | worker | blocked |",
					"",
				].join("\n"),
				"utf8",
			);
			expect(() => closeSession(root, created.session)).toThrow(
				"blocking tasks",
			);
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
});
