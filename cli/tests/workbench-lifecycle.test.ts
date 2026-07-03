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
import { readTelemetryEvents } from "../services/events/telemetry";
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
import {
	briefingUnavailableFor,
	buildStartBriefing,
} from "../services/workbench/start-briefing";
import { verifyWorkbenchTasks } from "../services/workbench/verify";

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

			recordEvidence(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			recordEvidence(root, {
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

			const newProc = runKernel(root, ["new", "cli json", "--json"]);
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
			expect(
				(startEnvelope.data as Record<string, unknown>).briefing,
			).toBeUndefined();

			const startBriefProc = runKernel(root, [
				"start",
				"--session",
				created.session,
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
					session: created.session,
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
			const created = newWorkstream(root, "start-task");
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
			const created = newWorkstream(root, "start-task");
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
			const created = newWorkstream(root, "start-task");
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
			const created = newWorkstream(root, "start-task");
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
			const created = newWorkstream(root, "start-task");
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
			const created = newWorkstream(root, "start-task");
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

	test("recordEvidence rejects missing tasks without appending evidence", () => {
		const root = mkRoot("evidence-missing-task");
		try {
			const created = newWorkstream(root, "record-evidence-missing-task");

			expect(() =>
				recordEvidence(root, {
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
				"--json",
			]);
			expect(proc.status).toBe(1);
			const payload = parseEnvelope(proc.stdout as string) as {
				error: { message: string };
			};
			expect(payload.error.message).toContain("failed_step=verification");
			expect(payload.error.message).toContain(
				"--result passed was downgraded to failed",
			);
			const session = payload.error.message.match(/session=([^ ]+)/)?.[1];
			expect(session).toBeTruthy();
			const evidence = readFileSync(
				join(root, ".afol", "wb", session as string, ".evidence.jsonl"),
				"utf8",
			).trim();
			const entry = JSON.parse(evidence) as Record<string, unknown>;
			expect(entry.result).toBe("failed");
			expect(entry.exit_code).not.toBe(0);
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
			// 9 workbench events + telemetry events (session_start + 8 tool_exec)
			expect(eventRows).toHaveLength(18);
			expect(
				eventRows.filter((row) => row.type === "workbench.record_evidence"),
			).toHaveLength(8);
			expect(
				eventRows.filter(
					(row) => row.source === "afol-cli" && row.event_type === "tool_exec",
				),
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

	test("closeSession blocks missing final report unless override is provided", () => {
		const root = mkRoot("close-warnings");
		try {
			const created = newWorkstream(root, "close-session-warnings", {
				tasks: ["first task", "second task"],
			});

			startTask(root, { session: created.session, taskId: "T-01" });
			recordEvidence(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });
			startTask(root, { session: created.session, taskId: "T-02" });
			recordEvidence(root, {
				session: created.session,
				taskId: "T-02",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-02" });

			expect(() => closeSession(root, created.session)).toThrow(
				"requires a final report artifact",
			);
			expect(() =>
				closeSession(root, created.session, { allowNoReport: true }),
			).toThrow("Missing --reason for close allow-no-report override.");

			const warnings = closeSession(root, created.session, {
				allowNoReport: true,
				reason: "research-only session",
			});
			expect(warnings).toContain("final report artifact is missing");
			expect(warnings).toContain("log summary section is missing");
			expect(existsSync(created.activeSessionPath)).toBe(false);
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
			recordEvidence(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });

			expect(closeSession(root, created.session)).toEqual([]);
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
			recordEvidence(root, {
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
				warnings: [
					"final report artifact is missing",
					"log summary section is missing",
				],
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

			recordEvidence(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });
			expect(() => closeSession(root, created.session)).toThrow(
				"blocking tasks",
			);

			recordEvidence(root, {
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

			recordEvidence(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test --filter foo",
				result: "passed",
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
