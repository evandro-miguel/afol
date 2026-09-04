import { describe, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	runDoneCommand,
	runStartCommand,
	runTransitionCommand,
} from "../commands/workbench";
import {
	agentOperationContext,
	defaultOperationContext,
} from "../core/operation-context";
import { readTelemetryEvents } from "../services/events/telemetry";
import { resolvePendingSpec } from "../services/governance/pending-specs";
import {
	readHotPathCountersForTests,
	readHotPathMeasurementsForTests,
	resetHotPathCountersForTests,
} from "../services/hot-path/instrumentation";
import {
	rebuildFilesIndex,
	validateFilesIndex,
} from "../services/local-state/project-indexes";
import { resolveWorkbenchEventLogPath } from "../services/local-state/workbench-events";
import {
	rebuildWorkBenchIndex,
	validateWorkBenchIndex,
} from "../services/local-state/workbench-index";
import {
	admitsEvidenceTransitionIssue,
	transitionAdmitEvidence,
} from "../services/project/evidence-transition-admission";
import { resolveProjectPaths } from "../services/project/paths";
import { archiveSessions } from "../services/workbench/archive";
import { resolveTaskCompletionLockPath } from "../services/workbench/completion-lock";
import {
	advanceTaskAfterObservedTest,
	appendTimelineEntry,
	closeSession,
	completeObservedTask,
	completeObservedTasks,
	doneTask,
	isSessionClosed,
	loadEvidenceEntries,
	newWorkstream,
	prepareVerificationRun,
	type RecordEvidenceInput,
	recordClosedTaskReverification,
	recordEvidence as recordEvidenceRaw,
	recordVerificationRunStep,
	sanitizeEvidenceText,
	sessionPaths,
	startTask,
	taskAttemptSnapshot,
	transitionTask,
} from "../services/workbench/lifecycle";
import {
	bindSession,
	compensateCarriedContinuationBinding,
	readSessionContext,
	resolveSession,
} from "../services/workbench/session-context";
import {
	briefingUnavailableFor,
	buildStartBriefing,
} from "../services/workbench/start-briefing";
import { appendVerificationRunTerminal } from "../services/workbench/verification-runs";
import { verifyWorkbenchTasks } from "../services/workbench/verify";

type WorkbenchChildMode =
	| "diagnostic"
	| "preflight"
	| "skipped"
	| "signal"
	| "sequence"
	| "fencing"
	| "stale"
	| "batch-fencing";
const WORKBENCH_CHILD = "--afol-workbench-child";

if (process.argv[2] === WORKBENCH_CHILD) {
	const root = process.cwd();
	switch (process.argv[3] as WorkbenchChildMode) {
		case "diagnostic": {
			const diagnostic = `I008_CHILD_DIAGNOSTIC_${"secret".repeat(120)}`;
			process.stdout.write(diagnostic);
			process.stderr.write(diagnostic);
			process.exit(7);
			break;
		}
		case "preflight":
			writeFileSync(join(root, "should-not-run"), "bad");
			break;
		case "skipped":
			writeFileSync(join(root, "skipped-step.txt"), "bad");
			break;
		case "signal": {
			const output = "RAW_CHILD_OUTPUT_SHOULD_NOT_PERSIST";
			process.stdout.write(output);
			process.stderr.write(output);
			process.kill(process.pid, "SIGTERM");
			break;
		}
		case "sequence":
			writeFileSync(join(root, "first-verification-started"), "started");
			Bun.sleepSync(300);
			break;
		case "fencing":
			writeFileSync(join(root, "fenced-child.pid"), String(process.pid));
			Bun.sleepSync(5_000);
			break;
		case "stale":
			writeFileSync(join(root, "stale-verification-started"), "started");
			Bun.sleepSync(300);
			break;
		case "batch-fencing":
			writeFileSync(join(root, "batch-fenced-child.pid"), String(process.pid));
			Bun.sleepSync(5_000);
			break;
		default:
			throw new Error(`unknown workbench child mode: ${process.argv[3]}`);
	}
	process.exit(0);
}

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
		const row = readFileSync(taskPath, "utf8")
			.split("\n")
			.find(
				(line) =>
					line.startsWith("|") && line.split("|")[1]?.trim() === input.taskId,
			);
		return row?.split("|")[2]?.trim() ?? "";
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

function workbenchChildCommand(mode: WorkbenchChildMode): string {
	return `${JSON.stringify(process.execPath)} ${JSON.stringify(import.meta.filename)} ${WORKBENCH_CHILD} ${mode}`;
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

function writeGovernanceCatalogFixture(
	root: string,
	featureId: string,
	featureStatus: string,
	specStatus: string,
): void {
	mkdirSync(join(root, ".afol", "adm", "roadmap"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "specs"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "adm", "roadmap", "GENERAL-ROADMAP.md"),
		`# Roadmap\n\n### ${featureId} Fixture\n\n- Status: ${featureStatus}\n- Governing spec: .afol/adm/specs/${featureId}.md\n`,
		"utf8",
	);
	writeFileSync(
		join(root, ".afol", "adm", "specs", `${featureId}.md`),
		`---\ndoc_type: spec\nid: ${featureId}\nstatus: ${specStatus}\nroadmap_feature: ${featureId}\n---\n\n# Spec\n`,
		"utf8",
	);
}

function writeEvolutionConfig(root: string, enabled: boolean | string): void {
	mkdirSync(join(root, ".afol"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "config.json"),
		JSON.stringify({
			schema_version: 1,
			project: {
				id: "6b7d91ca-496f-4f0c-8537-5c4993810d15",
				name: "fixture",
				timezone: "UTC",
			},
			paths: {
				external_dir: ".afol/external",
				evolution_db: ".afol/state/evolution.db",
				evolution_data_dir: ".afol/data/evolution",
				evolution_events_dir: ".afol/data/events/evolution",
			},
			evolution: {
				enabled,
				suggestions: {
					first_session_of_day: true,
					dedupe_scope: "project",
					max_visible_per_day: 1,
					remind_skipped_next_day: true,
					deep_review_after_production_days: 5,
				},
				preferences: {
					soft_decay_after_production_days: 7,
					stop_guiding_after_production_days: 20,
					minimum_effective_confidence: 0.65,
					decay_curve: "linear",
				},
				recurrence: {
					minimum_occurrences: 3,
					minimum_distinct_sessions: 2,
					minimum_distinct_production_days: 2,
				},
				large_change: {
					changed_files: 20,
					changed_lines: 1000,
					critical_paths_trigger: true,
				},
				external: {
					mode: "explicit_import_only",
					storage: "normalized_sections",
					store_raw: false,
					redact_before_persist: true,
				},
				autonomy: {
					auto_observe: true,
					auto_refresh_preference_projections: true,
					auto_clean_derived_state: true,
					auto_apply_mode: "none",
				},
			},
		}),
		"utf8",
	);
}

function parseEnvelope(stdout: string): Record<string, unknown> {
	return JSON.parse(stdout) as Record<string, unknown>;
}

describe("workbench lifecycle service", () => {
	test("new command selects the new session over an older open context binding", () => {
		const root = mkRoot("new-selects-current-context");
		try {
			writeCliProjectContract(root);
			initGitRepo(root);
			const old = newWorkstream(root, "old context", {
				noSpecRequiredReason: "test fixture",
			});
			const branch = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
				cwd: root,
				encoding: "utf8",
			}).stdout.trim();
			bindSession(root, {
				session: old.session,
				branch,
				worktree: root,
			});

			const proc = runKernel(root, [
				"new",
				"new context",
				"--no-spec-required",
				"--reason",
				"test fixture",
				"--json",
			]);
			expect(proc.status).toBe(0);
			const envelope = JSON.parse(proc.stdout as string) as {
				data: { session: string };
			};
			expect(resolveSession(root, {})).toEqual({
				session: envelope.data.session,
				source: "context",
			});
			expect(readSessionContext(root).bindings).toEqual([
				expect.objectContaining({ session: envelope.data.session }),
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("new command warns when AFOL_SESSION intentionally overrides selection", () => {
		const root = mkRoot("new-env-override");
		try {
			writeCliProjectContract(root);
			initGitRepo(root);
			const proc = spawnSync(
				"bun",
				[
					kernelPath,
					"new",
					"env override",
					"--no-spec-required",
					"--reason",
					"test fixture",
					"--json",
				],
				{
					cwd: root,
					encoding: "utf8",
					stdio: ["ignore", "pipe", "pipe"],
					env: { ...process.env, AFOL_SESSION: "PINNED" },
				},
			);
			expect(proc.status).toBe(0);
			const envelope = JSON.parse(proc.stdout as string) as {
				data: { session: string; status: string; warnings: string[] };
				warnings?: string[];
			};
			expect(envelope.data.status).toBe("created_with_warnings");
			expect(proc.stdout as string).toContain(
				"AFOL_SESSION still selects PINNED",
			);
			expect(proc.stdout as string).toContain(`-S ${envelope.data.session}`);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("new repairs malformed context and preserves the implicit short path", () => {
		const root = mkRoot("new-binding-recovery");
		try {
			writeCliProjectContract(root);
			initGitRepo(root);
			mkdirSync(join(root, ".afol", "wb"), { recursive: true });
			writeFileSync(
				join(root, ".afol", "wb", "session-context.json"),
				"{broken",
				"utf8",
			);
			const proc = runKernel(root, [
				"new",
				"binding warning",
				"--no-spec-required",
				"--reason",
				"test fixture",
				"--json",
			]);
			expect(proc.status).toBe(0);
			const envelope = JSON.parse(proc.stdout as string) as {
				data: { session: string; status: string; warnings: string[] };
			};
			expect(envelope.data.status).toBe("created");
			expect(envelope.data.warnings).toEqual([]);
			expect(readSessionContext(root).bindings[0]?.session).toBe(
				envelope.data.session,
			);
			const started = runKernel(root, ["start", "T-01"]);
			expect(started.status).toBe(0);
			expect(started.stdout as string).toContain("task started: T-01");
			expect(
				existsSync(
					join(
						root,
						".afol",
						"wb",
						envelope.data.session,
						`${envelope.data.session}_task_01.md`,
					),
				),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("concurrent new commands leave active and context selectors aligned", async () => {
		const root = mkRoot("new-selector-concurrency");
		try {
			writeCliProjectContract(root);
			initGitRepo(root);
			const procs = Array.from({ length: 6 }, (_value, index) =>
				spawn(
					"bun",
					[
						kernelPath,
						"new",
						`parallel ${index}`,
						"--no-spec-required",
						"--reason",
						"test fixture",
						"--json",
					],
					{
						cwd: root,
						stdio: ["ignore", "pipe", "pipe"],
					},
				),
			);
			const results = await Promise.all(procs.map(waitForExit));
			expect(results.every((result) => result.code === 0)).toBe(true);
			const sessions = results.map((result) => {
				const envelope = JSON.parse(result.stdout) as {
					data: { session: string };
				};
				return envelope.data.session;
			});
			expect(new Set(sessions).size).toBe(6);
			const active = readFileSync(
				join(root, ".afol", "wb", ".active_session"),
				"utf8",
			).trim();
			expect(resolveSession(root, {})).toEqual({
				session: active,
				source: "context",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

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

	test("recordObservedCompletion ignores non-canonical task-like lines", () => {
		const root = mkRoot("completion-canonical-row");
		try {
			const created = newWorkstream(root, "canonical task row");
			const taskDoc = readFileSync(created.taskPath, "utf8");
			writeFileSync(
				created.taskPath,
				`not a task row | T-01 | done | misleading |\n${taskDoc}`,
				"utf8",
			);

			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});

			expect(readFileSync(created.taskPath, "utf8")).toContain(
				"| T-01 | tested_needs_spec_validation |",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("cli workbench lifecycle json envelopes", () => {
		const root = mkRoot("cli-json");
		try {
			writeCliProjectContract(root);
			mkdirSync(join(root, ".afol", "adm", "roadmap"), { recursive: true });
			mkdirSync(join(root, ".afol", "adm", "specs"), { recursive: true });
			writeFileSync(
				join(root, ".afol", "adm", "roadmap", "GENERAL-ROADMAP.md"),
				"# Roadmap\n\n### F-01 CLI lifecycle\n\n- Status: active\n- Governing spec: .afol/adm/specs/spec-01.md\n",
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "adm", "specs", "spec-01.md"),
				"---\ndoc_type: spec\nid: spec-01\nstatus: active\nroadmap_feature: F-01\n---\n\n# Spec\n",
				"utf8",
			);

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
			const waivedWithBindings = runKernel(root, [
				"new",
				"waived with ignored bindings",
				"--no-spec-required",
				"--reason",
				"explicit test waiver",
				"--feature-id",
				"F-404",
				"--parent-spec",
				"missing-spec",
				"--json",
			]);
			expect(waivedWithBindings.status).toBe(2);
			expect(waivedWithBindings.stdout as string).toContain(
				"new governance binding and waiver are mutually exclusive",
			);

			const invalidGovernedNew = runKernel(root, [
				"new",
				"invalid governed",
				"--feature-id",
				"F-404",
				"--parent-spec",
				"missing-spec",
				"--json",
			]);
			expect(invalidGovernedNew.status).toBe(0);
			expect(
				parseEnvelope(invalidGovernedNew.stdout as string).data,
			).toMatchObject({
				governance_status: "pending_spec",
				pending_spec: true,
			});

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

	test("cli pending_spec allows start with warning while unrelated new remains allowed", () => {
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
			expect(start.status).toBe(0);
			expect(start.stdout as string).toContain("warning: pending_spec");

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
				"bun --version",
			]);
			expect(done.status).toBe(0);

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
			mkdirSync(join(root, ".afol", "adm", "roadmap"), { recursive: true });
			mkdirSync(join(root, ".afol", "adm", "specs"), { recursive: true });
			writeFileSync(
				join(root, ".afol", "adm", "roadmap", "GENERAL-ROADMAP.md"),
				"# Roadmap\n\n### F-02 After resolve\n\n- Status: active\n- Governing spec: .afol/adm/specs/spec-02.md\n",
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "adm", "specs", "spec-02.md"),
				"---\ndoc_type: spec\nid: spec-02\nstatus: active\nroadmap_feature: F-02\n---\n\n# Spec\n",
				"utf8",
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

	test("new defers known planned features and inactive specs into pending_spec", () => {
		for (const fixture of [
			{ feature: "F-31", featureStatus: "planned", specStatus: "active" },
			{ feature: "F-32", featureStatus: "active", specStatus: "draft" },
		] as const) {
			const root = mkRoot(`new-catalog-deferred-${fixture.feature}`);
			try {
				writeCliProjectContract(root);
				writeGovernanceCatalogFixture(
					root,
					fixture.feature,
					fixture.featureStatus,
					fixture.specStatus,
				);
				const created = runKernel(root, [
					"new",
					"deferred catalog",
					"--feature-id",
					fixture.feature,
					"--parent-spec",
					fixture.feature,
					"--json",
				]);
				expect(created.status).toBe(0);
				const envelope = parseEnvelope(created.stdout as string);
				expect(envelope.data).toMatchObject({
					governance_status: "pending_spec",
					pending_spec: true,
				});
				const session = String(
					(envelope.data as Record<string, unknown>).session,
				);
				const task = readFileSync(
					join(root, ".afol", "wb", session, `${session}_task_01.md`),
					"utf8",
				);
				expect(task).toContain('governance_status: "pending_spec"');
				expect(task).toContain('pending_spec_status: "open"');
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		}
	});

	test("quick-task permits a closed pending_spec lifecycle", () => {
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
				"bun --version",
				"--json",
			]);
			expect(quickTask.status).toBe(0);
			const quickTaskEnvelope = parseEnvelope(quickTask.stdout as string);
			const quickTaskData = quickTaskEnvelope.data as Record<string, unknown>;
			expect(quickTaskData.governance_status).toBe("pending_spec");
			expect(quickTaskData.pending_spec).toBe(true);
			expect(quickTaskData.pending_spec_question).toBe(
				"Which roadmap feature and parent spec govern this session?",
			);
			expect(quickTaskData.next_command).toContain("afol gov rs");

			const human = runKernel(root, [
				"quick-task",
				"human pending spec",
				"--command",
				"bun --version",
			]);
			expect(human.status).toBe(0);
			expect(human.stdout as string).toContain(
				"question: Which roadmap feature and parent spec govern this session?",
			);
			expect(human.stdout as string).toContain("next: run afol gov rs");
			expect(human.stdout as string).not.toContain('hint="');

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
			expect((payload.error as Record<string, unknown>).code).toBe(
				"workbench.verification_failed",
			);
			expect(payload.data).toMatchObject({
				session: created.session,
				task_id: "T-01",
				task_ids: ["T-01"],
				failed_step: "verification",
				status: "spec_conflict",
				evidence_ids: [],
				next_command: expect.any(String),
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("done json emits failure envelope for test failure", () => {
		const root = mkRoot("done-test-failure");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "done-test-failure");
			startTask(root, { session: created.session, taskId: "T-01" });
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
			expect(payload.error).toMatchObject({
				code: "workbench.verification_failed",
				message: "--test failed with exit code 3",
			});
			expect(payload.data).toMatchObject({
				session: created.session,
				task_id: "T-01",
				task_ids: ["T-01"],
				failed_step: "verification",
				status: "failed",
				evidence_ids: expect.any(Array),
				next_command: expect.any(String),
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("done parser diagnostics are classified, bounded, and sanitized", () => {
		const root = mkRoot("done-parser-diagnostic");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "done parser diagnostic");
			const invalidTaskSelector = `I008_PARSE_CANARY_${"x".repeat(800)}`;
			const proc = runKernel(root, [
				"done",
				"--session",
				created.session,
				"--task-id",
				invalidTaskSelector,
				"--json",
			]);

			expect(proc.status).toBe(2);
			const payload = parseEnvelope(proc.stdout as string);
			const error = payload.error as {
				code?: unknown;
				message?: unknown;
			};
			const message = typeof error?.message === "string" ? error.message : "";
			expect({
				generic_code: error?.code === "workbench.error",
				bounded_utf8: Buffer.byteLength(message, "utf8") <= 512,
				raw_input_reflected: message.includes(invalidTaskSelector),
				failed_step: (payload.data as Record<string, unknown> | undefined)
					?.failed_step,
			}).toEqual({
				generic_code: false,
				bounded_utf8: true,
				raw_input_reflected: false,
				failed_step: "parse",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("done child failures retain a bounded classification without child output", () => {
		const root = mkRoot("done-child-diagnostic");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "done child diagnostic");
			startTask(root, { session: created.session, taskId: "T-01" });
			const rawChildDiagnostic = `I008_CHILD_DIAGNOSTIC_${"secret".repeat(120)}`;
			const proc = runKernel(root, [
				"done",
				"--session",
				created.session,
				"--task-id",
				"T-01",
				"--test",
				workbenchChildCommand("diagnostic"),
				"--json",
			]);

			expect(proc.status).toBe(1);
			const payload = parseEnvelope(proc.stdout as string);
			const error = payload.error as {
				code?: unknown;
				message?: unknown;
			};
			const data = payload.data as Record<string, unknown>;
			const message = typeof error?.message === "string" ? error.message : "";
			const persistedEvidence = readFileSync(created.evidencePath, "utf8");
			expect({
				classified: error?.code === "workbench.verification_failed",
				bounded_utf8: Buffer.byteLength(message, "utf8") <= 512,
				status: data?.status,
				raw_child_output_reflected:
					message.includes(rawChildDiagnostic) ||
					String(data?.diagnostic ?? "").includes(rawChildDiagnostic) ||
					persistedEvidence.includes(rawChildDiagnostic) ||
					String(proc.stdout).includes(rawChildDiagnostic) ||
					String(proc.stderr).includes(rawChildDiagnostic),
			}).toEqual({
				classified: true,
				bounded_utf8: true,
				status: "failed",
				raw_child_output_reflected: false,
			});
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
			expect(payload.error).toMatchObject({
				code: "workbench.verification_failed",
				message: "--test-shell failed with exit code 1",
			});
			expect(payload.data).toMatchObject({
				session: created.session,
				task_id: "T-01",
				task_ids: ["T-01"],
				failed_step: "verification",
				status: "failed",
				evidence_ids: expect.any(Array),
				next_command: expect.any(String),
			});
			expect(
				existsSync(join(created.sessionDir, ".verification-runs.jsonl")),
			).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("done positional argv failure keeps the legacy JSON envelope", () => {
		const root = mkRoot("done-positional-failure");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "done-positional-failure");
			startTask(root, { session: created.session, taskId: "T-01" });
			const proc = runKernel(root, [
				"done",
				"-S",
				created.session,
				"-T",
				"T-01",
				"--json",
				"--",
				"bun",
				"-e",
				"process.exit(4)",
			]);
			expect(proc.status).toBe(1);
			const payload = parseEnvelope(proc.stdout as string);
			expect(payload).toMatchObject({
				schema: "afol.result/v1",
				ok: false,
				action: "workbench.done",
				exit_code: 1,
			});
			expect(payload.error).toMatchObject({
				code: "workbench.verification_failed",
				message: "--test failed with exit code 4",
			});
			expect(payload.data).toMatchObject({
				session: created.session,
				task_id: "T-01",
				task_ids: ["T-01"],
				failed_step: "verification",
				status: "failed",
				evidence_ids: expect.any(Array),
				next_command: expect.any(String),
			});
			expect(
				existsSync(join(created.sessionDir, ".verification-runs.jsonl")),
			).toBe(false);
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
			expect(toolEvents).toHaveLength(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("declared evidence retries do not duplicate no-exit rows", () => {
		const root = mkRoot("declared-evidence-retry");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "declared evidence retry");
			startTask(root, { session: created.session, taskId: "T-01" });
			const args = [
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
			];

			const first = runKernel(root, args);
			const second = runKernel(root, args);

			expect(first.status).toBe(0);
			expect(second.status).toBe(0);
			const evidence = loadEvidenceEntries(created.evidencePath);
			expect(evidence).toHaveLength(1);
			expect(evidence[0]).toMatchObject({
				task_id: "T-01",
				command: "bun test",
				result: "passed",
				provenance: "declared",
			});
			expect(evidence[0]?.exit_code).toBeUndefined();
			expect(
				readLocalStateEvents(root).filter(
					(event) => event.type === "workbench.record_evidence",
				),
			).toHaveLength(1);

			const completion = runKernel(root, [
				"done",
				"--session",
				created.session,
				"--task-id",
				"T-01",
				"--test",
				"bun --version",
				"--json",
			]);
			expect(completion.status).toBe(0);
			const close = runKernel(root, [
				"close",
				"--session",
				created.session,
				"--json",
			]);
			expect(close.status).toBe(0);
			const report = readFileSync(
				join(
					root,
					".afol",
					"wb",
					created.session,
					`${created.session}_report_01.md`,
				),
				"utf8",
			);
			expect(
				report.match(/declared passed \(bun test; exit_code=n\/a\)/g) ?? [],
			).toHaveLength(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("done preserves argv boundaries in recorded evidence", () => {
		const root = mkRoot("done-argv-evidence");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "done-argv-evidence");
			startTask(root, { session: created.session, taskId: "T-01" });
			const proc = runKernel(root, [
				"done",
				"--session",
				created.session,
				"--task-id",
				"T-01",
				"--json",
				"--",
				"printf",
				"%s",
				"a b;$HOME",
			]);

			expect(proc.status).toBe(0);
			const evidence = readFileSync(
				join(root, ".afol", "wb", created.session, ".evidence.jsonl"),
				"utf8",
			)
				.trim()
				.split("\n")
				.at(-1);
			const entry = JSON.parse(evidence as string) as { command?: string };
			expect(entry.command).toBe("printf %s 'a b;$HOME'");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("completeObservedTask commits canonical events without derived refresh", () => {
		const root = mkRoot("complete-observed");
		try {
			const created = newWorkstream(root, "complete observed", {
				noSpecRequiredReason: "fixture",
			});
			startTask(root, { session: created.session, taskId: "T-01" });
			const result = completeObservedTask(root, {
				session: created.session,
				taskId: "T-01",
				command: "echo ok",
				exitCode: 0,
			});
			expect(result.done?.authorizingEvidenceId).toBeTruthy();
			expect(result.warnings).toEqual([]);
			expect(readFileSync(created.taskPath, "utf8")).toContain(
				"| T-01 | done |",
			);
			expect(
				readFileSync(created.evidencePath, "utf8").trim().split("\n"),
			).toHaveLength(1);
			const completionEvents = readFileSync(
				resolveWorkbenchEventLogPath(root),
				"utf8",
			)
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line) as Record<string, unknown>)
				.map((event) => event.type ?? event.event_type);
			expect(completionEvents).toEqual(
				expect.arrayContaining([
					"workbench.record_evidence",
					"workbench.transition_task",
					"workbench.transition_task",
					"workbench.mark_done",
				]),
			);
			expect(completionEvents).not.toContain("tool_exec");
			expect(completionEvents).not.toContain("task_complete");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("completeObservedTask refreshes after a failed observed test", () => {
		const root = mkRoot("complete-observed-failure");
		try {
			const created = newWorkstream(root, "complete observed failure", {
				noSpecRequiredReason: "fixture",
			});
			startTask(root, { session: created.session, taskId: "T-01" });
			const result = completeObservedTask(root, {
				session: created.session,
				taskId: "T-01",
				command: "false",
				exitCode: 1,
			});
			expect(result.done).toBeUndefined();
			expect(readFileSync(created.taskPath, "utf8")).toContain(
				"| T-01 | in_progress |",
			);
			expect(
				readFileSync(created.evidencePath, "utf8").trim().split("\n"),
			).toHaveLength(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("completeObservedTask does not refresh derived state after durable evidence", () => {
		const root = mkRoot("complete-observed-refresh-warning");
		try {
			const created = newWorkstream(root, "complete observed warning", {
				noSpecRequiredReason: "fixture",
			});
			startTask(root, { session: created.session, taskId: "T-01" });
			const result = completeObservedTask(
				root,
				{
					session: created.session,
					taskId: "T-01",
					command: "echo ok",
					exitCode: 0,
				},
				{
					beforeAuxiliary: (label) => {
						if (label === "local-state refresh") {
							throw new Error("injected refresh");
						}
					},
				},
			);
			expect(result.done?.authorizingEvidenceId).toBeTruthy();
			expect(result.warnings).toEqual([]);
			expect(
				readFileSync(created.evidencePath, "utf8").trim().split("\n"),
			).toHaveLength(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("observer failure after durable completion returns warning but task stays done", () => {
		const root = mkRoot("observer-failure");
		try {
			// Seed evolution config so the observer path is reached.
			mkdirSync(join(root, ".afol"), { recursive: true });
			writeFileSync(
				join(root, ".afol", "config.json"),
				JSON.stringify({
					schema_version: 1,
					project: {
						name: "observer-test",
						id: "6b7d91ca-496b-4f0c-8537-5c4993810d15",
						timezone: "UTC",
					},
					paths: {
						external_dir: ".afol/external",
						evolution_db: ".afol/state/evolution.db",
						evolution_data_dir: ".afol/data/evolution",
						evolution_events_dir: ".afol/data/events/evolution",
					},
					evolution: {
						enabled: true,
						suggestions: {
							first_session_of_day: true,
							dedupe_scope: "project",
							max_visible_per_day: 1,
							remind_skipped_next_day: true,
							deep_review_after_production_days: 5,
						},
						preferences: {
							soft_decay_after_production_days: 7,
							stop_guiding_after_production_days: 20,
							minimum_effective_confidence: 0.65,
							decay_curve: "linear",
						},
						recurrence: {
							minimum_occurrences: 3,
							minimum_distinct_sessions: 2,
							minimum_distinct_production_days: 2,
						},
						large_change: {
							changed_files: 20,
							changed_lines: 1000,
							critical_paths_trigger: true,
						},
						external: {
							mode: "explicit_import_only",
							storage: "normalized_sections",
							store_raw: false,
							redact_before_persist: true,
						},
						autonomy: {
							auto_observe: true,
							auto_refresh_preference_projections: true,
							auto_clean_derived_state: true,
							auto_apply_mode: "none",
						},
					},
				}),
				"utf8",
			);
			const created = newWorkstream(root, "observer failure", {
				noSpecRequiredReason: "fixture",
			});
			startTask(root, { session: created.session, taskId: "T-01" });
			let productionDayCalls = 0;
			const completion = completeObservedTask(
				root,
				{
					session: created.session,
					taskId: "T-01",
					command: "echo ok",
					exitCode: 0,
				},
				{
					observerSeam: () => {
						productionDayCalls += 1;
						return {
							appended: 0,
							duplicates: 0,
							skipped: 0,
							warnings: [],
							observation_ids: [],
						};
					},
				},
			);
			// Task is still done.
			expect(completion.done?.authorizingEvidenceId).toBeTruthy();
			expect(productionDayCalls).toBe(0);
			expect(readFileSync(created.taskPath, "utf8")).toContain(
				"| T-01 | done |",
			);
			// Evidence was written exactly once.
			const evidenceLines = readFileSync(created.evidencePath, "utf8")
				.trim()
				.split("\n");
			expect(evidenceLines).toHaveLength(1);
			expect(JSON.parse(evidenceLines[0] ?? "{}")).toMatchObject({
				project_id: "6b7d91ca-496b-4f0c-8537-5c4993810d15",
				session_id: created.session,
				provenance: "observed",
			});
			const closeResult = closeSession(
				root,
				created.session,
				{},
				{
					observerSeam: ({ mode }) => {
						expect(mode).toBe("full");
						throw new Error("injected observer failure");
					},
				},
			);
			// Observer failure is captured after the durable close.
			expect(closeResult).toContain(
				"observer observation ingest failed after durable commit: injected observer failure",
			);
			let retryCalls = 0;
			const retryResult = closeSession(
				root,
				created.session,
				{},
				{
					observerSeam: () => {
						retryCalls += 1;
						return {
							appended: 0,
							duplicates: 1,
							skipped: 0,
							warnings: [],
							observation_ids: [],
						};
					},
				},
			);
			expect(retryCalls).toBe(0);
			expect(retryResult).not.toContain(
				expect.stringContaining("observer failed"),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("redacts every persisted caller-controlled evidence field", () => {
		const root = mkRoot("evidence-full-redaction");
		try {
			const created = newWorkstream(root, "evidence full redaction", {
				noSpecRequiredReason: "fixture",
			});
			const commandCanary = "REDACTION_COMMAND_CANARY_123456";
			const resultCanary = "ghp_REDACTION_RESULT_CANARY_12345678901234567890";
			const artifactCanary = "REDACTION_ARTIFACT_CANARY_123456";
			const noteCanary = "REDACTION_NOTE_CANARY_123456";
			recordEvidenceRaw(root, {
				session: created.session,
				taskId: "T-01",
				command: `tool '{"apiKey":"${commandCanary}"}'`,
				result: `{"github_token":"${resultCanary}"}`,
				artifact: `artifact?client_secret=${artifactCanary}`,
				note: `Authorization: Bearer "${noteCanary}"`,
			});
			const persisted = readFileSync(created.evidencePath, "utf8");
			for (const canary of [
				commandCanary,
				resultCanary,
				artifactCanary,
				noteCanary,
			]) {
				expect(persisted).not.toContain(canary);
			}
			expect(persisted).toContain("[REDACTED]");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("redacts curl user credentials without redacting user-agent options", () => {
		for (const [command, expected] of [
			[
				"curl -u alice:REDACTION_CURL_SHORT_CANARY https://example.test",
				"curl -u [REDACTED] https://example.test",
			],
			[
				"curl --user alice:REDACTION_CURL_LONG_CANARY https://example.test",
				"curl --user [REDACTED] https://example.test",
			],
			[
				"curl --user=alice:REDACTION_CURL_EQUALS_CANARY https://example.test",
				"curl --user=[REDACTED] https://example.test",
			],
			[
				"curl -ualice:REDACTION_CURL_ATTACHED_CANARY https://example.test",
				"curl -u[REDACTED] https://example.test",
			],
			[
				"curl -u alice:REDACTION_CURL_FIRST_CANARY --user=alice:REDACTION_CURL_SECOND_CANARY https://example.test",
				"curl -u [REDACTED] --user=[REDACTED] https://example.test",
			],
		] as const) {
			expect(sanitizeEvidenceText(command)).toBe(expected);
		}
		expect(
			sanitizeEvidenceText(
				"curl --user-agent 'AFOL test client' https://example.test",
			),
		).toBe("curl --user-agent 'AFOL test client' https://example.test");
	});

	test("automatic observation requires autonomy.auto_observe", () => {
		const root = mkRoot("observer-disabled");
		try {
			mkdirSync(join(root, ".afol"), { recursive: true });
			writeFileSync(
				join(root, ".afol", "config.json"),
				JSON.stringify({
					schema_version: 1,
					project: {
						name: "observer-disabled",
						id: "6b7d91ca-496b-4f0c-8537-5c4993810d15",
						timezone: "UTC",
					},
					paths: {
						external_dir: ".afol/external",
						evolution_db: ".afol/state/evolution.db",
						evolution_data_dir: ".afol/data/evolution",
						evolution_events_dir: ".afol/data/events/evolution",
					},
					evolution: {
						enabled: true,
						suggestions: {
							first_session_of_day: true,
							dedupe_scope: "project",
							max_visible_per_day: 1,
							remind_skipped_next_day: true,
							deep_review_after_production_days: 5,
						},
						preferences: {
							soft_decay_after_production_days: 7,
							stop_guiding_after_production_days: 20,
							minimum_effective_confidence: 0.65,
							decay_curve: "linear",
						},
						recurrence: {
							minimum_occurrences: 3,
							minimum_distinct_sessions: 2,
							minimum_distinct_production_days: 2,
						},
						large_change: {
							changed_files: 20,
							changed_lines: 1000,
							critical_paths_trigger: true,
						},
						external: {
							mode: "explicit_import_only",
							storage: "normalized_sections",
							store_raw: false,
							redact_before_persist: true,
						},
						autonomy: {
							auto_observe: false,
							auto_refresh_preference_projections: true,
							auto_clean_derived_state: true,
							auto_apply_mode: "none",
						},
					},
				}),
				"utf8",
			);
			const created = newWorkstream(root, "observer disabled", {
				noSpecRequiredReason: "fixture",
			});
			startTask(root, { session: created.session, taskId: "T-01" });
			let called = false;
			completeObservedTask(
				root,
				{
					session: created.session,
					taskId: "T-01",
					command: "echo ok",
					exitCode: 0,
				},
				{
					observerSeam: () => {
						called = true;
						throw new Error("must not run");
					},
				},
			);
			closeSession(
				root,
				created.session,
				{},
				{
					observerSeam: () => {
						called = true;
						throw new Error("must not run");
					},
				},
			);
			expect(called).toBe(false);
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

	test("buildStartBriefing keeps evolution additive and reports disabled state", () => {
		const root = mkRoot("start-briefing-evolution-disabled");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "briefing-evolution-disabled");
			startTask(root, { session: created.session, taskId: "T-01" });
			writeEvolutionConfig(root, false);

			const briefing = buildStartBriefing(root, {
				session: created.session,
				taskId: "T-01",
			});

			expect(briefing.evolution).toMatchObject({
				daily_status: "disabled",
				suggestion: null,
				pending_count: 0,
				critical_alerts: [],
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("buildStartBriefing safely falls back when evolution config is malformed", () => {
		const root = mkRoot("start-briefing-evolution-malformed");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "briefing-evolution-malformed");
			startTask(root, { session: created.session, taskId: "T-01" });
			writeEvolutionConfig(root, "yes");

			const briefing = buildStartBriefing(root, {
				session: created.session,
				taskId: "T-01",
			});

			expect(briefing.evolution).toMatchObject({
				daily_status: "unavailable",
				suggestion: null,
				pending_count: 0,
				critical_alerts: [],
			});
			expect(briefing.warnings).toContain(
				"evolution suggestion unavailable: local state requires review",
			);
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

	test("workbench lifecycle refreshes its index without rebuilding excluded files", () => {
		const root = mkRoot("local-state");
		try {
			rebuildFilesIndex(root);
			const filesIndexPath = join(root, ".afol", "data", "index", "files.json");
			const filesIndexBefore = readFileSync(filesIndexPath, "utf8");
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
			expect(readFileSync(filesIndexPath, "utf8")).toBe(filesIndexBefore);

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

			const indexValidation = validateWorkBenchIndex(root);
			if (!indexValidation.ok) throw new Error(indexValidation.message);
			expect(validateFilesIndex(root).ok).toBe(true);
			expect(readFileSync(filesIndexPath, "utf8")).toBe(filesIndexBefore);
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

			expect(created.sessionDir.replaceAll("\\", "/")).toContain("/.afol/wb/");
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

	test(
		"no-op evidence cannot authorize task completion or session closure",
		() => {
			const root = mkRoot("no-op-evidence");
			try {
				for (const command of [
					"env true # verification",
					"/usr/bin/env true",
					"env -C /tmp true",
					"env --chdir=/tmp true",
					"command -p true",
					"command -v true",
					"command -V true",
					"exec -c true",
					"exec -l true",
					"exec -cl true",
					"exec -a afol true",
					"exec -- true",
					"sh -c true",
					"bash -lc 'true'",
					"zsh -c ':'",
					"sh -n",
					"bash -n",
					"sh -n --",
					"bash -n --",
					"/bin/sh -c true",
					"/usr/bin/bash -lc true",
					"/usr/bin/zsh -c :",
					"/bin/dash -c true",
					"bash -c",
					"eval true",
					"true && :",
					"true || :",
					"true; :",
					"true | :",
					"true & :",
				]) {
					const created = newWorkstream(root, "no-op evidence");
					recordObservedCompletion(root, {
						session: created.session,
						taskId: "T-01",
						command,
						result: "passed",
					});

					expect(() =>
						doneTask(root, { session: created.session, taskId: "T-01" }),
					).toThrow("requires passed evidence");

					writeFileSync(
						created.taskPath,
						readFileSync(created.taskPath, "utf8").replace(
							"| T-01 | tested_needs_spec_validation |",
							"| T-01 | done |",
						),
						"utf8",
					);
					expect(() => closeSession(root, created.session)).toThrow(
						"failed strict verification",
					);
				}
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		},
		{ timeout: 60_000 },
	);

	test("shell syntax-check evidence can authorize done task completion and closure", () => {
		const root = mkRoot("sh-n-closure");
		try {
			const created = newWorkstream(root, "sh -n evidence");
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "sh -n session-task.sh",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });
			expect(() => closeSession(root, created.session)).not.toThrow();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("close treats open checklist items as non-blocking warnings", () => {
		const root = mkRoot("checklist-close");
		try {
			const created = newWorkstream(root, "checklist close");
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "sh -n session-task.sh",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });
			writeFileSync(
				created.taskPath,
				`${readFileSync(created.taskPath, "utf8")}\n## Sub-task Checklist (T-01)\n\n- [ ] Run final gate\n`,
				"utf8",
			);
			const result = closeSession(root, created.session);
			expect(result.join("\n")).toContain("open checklist item(s)");
			expect(existsSync(created.activeSessionPath)).toBe(false);
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

			let message = "";
			try {
				doneTask(root, { session: created.session, taskId: "T-01" });
			} catch (error) {
				message = (error as Error).message;
			}
			expect(message).toContain("Malformed evidence ledger line 1");
			expect(message).not.toContain(root);
			expect(message).not.toContain(created.evidencePath);
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
			expect(readFileSync(created.planPath, "utf8")).toContain(
				'status: "closed"',
			);
			writeFileSync(
				created.planPath,
				readFileSync(created.planPath, "utf8").replace(
					'status: "closed"',
					'status: "active"',
				),
				"utf8",
			);
			closeSession(root, created.session);
			expect(readFileSync(created.planPath, "utf8")).toContain(
				'status: "closed"',
			);

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
			const source = readFileSync(created.taskPath, "utf8").replace(
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

	test("close command cleans matching context only after durable close", () => {
		const root = mkRoot("close-context-cleanup");
		try {
			writeCliProjectContract(root);
			initGitRepo(root);
			const created = newWorkstream(root, "close context cleanup", {
				noSpecRequiredReason: "test fixture",
			});
			const branch = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
				cwd: root,
				encoding: "utf8",
			}).stdout.trim();
			bindSession(root, {
				session: created.session,
				branch,
				worktree: root,
			});

			const blocked = runKernel(root, ["close", "--session", created.session]);
			expect(blocked.status).toBe(2);
			expect(readSessionContext(root).bindings).toHaveLength(1);

			startTask(root, { session: created.session, taskId: "T-01" });
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });
			const closed = runKernel(root, ["close", "--session", created.session]);
			expect(closed.status).toBe(0);
			expect(readSessionContext(root).bindings).toHaveLength(0);

			bindSession(root, {
				session: created.session,
				branch,
				worktree: root,
			});
			const repaired = runKernel(root, ["close", "--session", created.session]);
			expect(repaired.status).toBe(0);
			expect(readSessionContext(root).bindings).toHaveLength(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("close command keeps durable close when context cleanup fails", () => {
		const root = mkRoot("close-context-warning");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "close context warning", {
				noSpecRequiredReason: "test fixture",
			});
			startTask(root, { session: created.session, taskId: "T-01" });
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });
			writeFileSync(
				join(root, ".afol", "wb", "session-context.json"),
				"{broken",
				"utf8",
			);

			const proc = runKernel(root, [
				"close",
				"--session",
				created.session,
				"--json",
			]);
			expect(proc.status).toBe(0);
			expect(isSessionClosed(root, created.session)).toBe(true);
			expect(proc.stdout as string).toContain(
				"session context cleanup failed after the durable close commit",
			);
			expect(proc.stdout as string).toContain(
				`afol ss unbind ${created.session}`,
			);
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
			expect(sessionEndCountAfterClose).toBe(0);
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

	test("does not recover a close event from incoherent durable task state", () => {
		const root = mkRoot("incoherent-close-without-event");
		try {
			const created = newWorkstream(root, "incoherent close without event");
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

			expect(() => closeSession(root, created.session)).toThrow(
				"incoherent durable close state",
			);
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

	test("closeSession repairs workbench state without bootstrapping the files index", () => {
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
			expect(validateFilesIndex(root).ok).toBe(false);
			rebuildFilesIndex(root);
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
			startTask(root, { session: created.session, taskId: "T-01" });
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });
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
						"---\ndoc_type: spec\nid: spec-01\nstatus: active\nroadmap_feature: F-01\n---\n\n# Spec\n",
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

	test("closeSession fails before commit when the shared event ledger is unreadable", () => {
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
			const taskBefore = readFileSync(created.taskPath, "utf8");

			expect(() => closeSession(root, created.session)).toThrow(
				"EVENT_LEDGER_UNREADABLE",
			);
			expect(existsSync(created.activeSessionPath)).toBe(true);
			expect(readFileSync(created.taskPath, "utf8")).toBe(taskBefore);
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
			const report = readFileSync(
				join(
					root,
					".afol",
					"wb",
					created.session,
					`${created.session}_report_01.md`,
				),
				"utf8",
			);
			expect(result.report.status).toBe("created");
			expect(report).toContain(
				"closed: 2 tasks; evidence: 2 observed, 0 failed",
			);
			expect(report).not.toContain("first task");
			expect(report).not.toContain("second task");
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
			const report = readFileSync(reportPath, "utf8");
			expect(report).toContain("declared: close verified");
			expect(report).toMatch(
				/- T-01 attempt=\d+ evidence_id=E-[^ ]+ authorizing: passed \(bun test; exit_code=0\)/,
			);
			expect(report).not.toContain("close auto report");
			expect(
				readFileSync(created.logPath, "utf8").match(/^## Summary$/gm) ?? [],
			).toHaveLength(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("closeSession keeps generated reports factual and cheaper than the legacy shape", () => {
		const root = mkRoot("close-factual-benchmark");
		const taskIntent =
			"Design and implement a dependency graph with blocked_by edges, cycle detection, start guards, migration compatibility, focused parser coverage, and integration guidance.";
		try {
			const created = newWorkstream(root, "close factual benchmark", {
				tasks: [taskIntent],
			});
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun --version",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });

			closeSession(root, created.session);
			const reportPath = join(
				root,
				".afol",
				"wb",
				created.session,
				`${created.session}_report_01.md`,
			);
			const report = readFileSync(reportPath, "utf8");
			expect(report).not.toContain(taskIntent);
			expect(report).not.toContain("Strict verification passed");
			expect(report).toContain(
				"closed: 1 task; evidence: 1 observed, 0 failed",
			);
			expect(report).toContain("- T-01: done");
			expect(report).toMatch(
				/- T-01 attempt=\d+ evidence_id=E-[^ ]+ authorizing: passed \(bun --version; exit_code=0\)/,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("closeSession reports observed failures without claiming closure proof", () => {
		const root = mkRoot("close-factual-failure-count");
		try {
			const created = newWorkstream(root, "close factual failure count");
			const declared = recordRawEvidence(root, {
				session: created.session,
				taskId: "T-01",
				command: "manual review",
				result: "passed",
				provenance: "declared",
			});
			const failed = recordRawEvidence(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "blocked",
				exitCode: 0,
				provenance: "observed",
			});
			const passed = recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });

			closeSession(root, created.session);
			const report = readFileSync(
				join(
					root,
					".afol",
					"wb",
					created.session,
					`${created.session}_report_01.md`,
				),
				"utf8",
			);

			expect(report).toContain(
				"closed: 1 task; evidence: 2 observed, 1 failed",
			);
			expect(report).toContain("- T-01 attempt=");
			expect(report).toContain(`evidence_id=${declared.id}`);
			expect(report).toContain(`evidence_id=${failed.id}`);
			expect(report).toContain(`evidence_id=${passed.id} authorizing`);
			expect(report).toContain(
				"declared passed (manual review; exit_code=n/a)",
			);
			expect(report).toContain("blocked (bun test; exit_code=0)");
			expect(report).toMatch(
				/- T-01 attempt=\d+ evidence_id=E-[^ ]+ authorizing: passed \(bun test; exit_code=0\)/,
			);
			expect(report).not.toContain("verified");
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

	test("closed session with a missing report is not mislabeled as waived", () => {
		const root = mkRoot("close-missing-report");
		try {
			const created = newWorkstream(root, "close missing report");
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });
			const first = closeSession(root, created.session);
			expect(first.report.status).toBe("created");
			unlinkSync(
				join(
					root,
					".afol",
					"wb",
					created.session,
					`${created.session}_report_01.md`,
				),
			);

			const repeated = closeSession(root, created.session);
			expect(repeated.report.status).toBe("missing");
			expect(repeated.report.path).toBeNull();
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
			startTask(root, { session: created.session, taskId: "T-01" });
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });

			const result = closeSession(root, created.session);
			const report = readFileSync(
				join(
					root,
					".afol",
					"wb",
					created.session,
					`${created.session}_report_01.md`,
				),
				"utf8",
			);
			expect(result).toHaveLength(0);
			expect(result.report).toMatchObject({
				status: "created",
				summary_source: "log",
			});
			expect(report).toContain("declared: - done");
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

	test("lifecycle preserves canonical workbench events without hot-path telemetry", () => {
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

			// Session creation remains observable; hot lifecycle completions avoid
			// synchronous telemetry writes.
			expect(eventMap.has("session_start")).toBe(true);
			expect(eventMap.has("task_start")).toBe(false);
			expect(eventMap.has("tool_exec")).toBe(true);
			expect(eventMap.has("task_complete")).toBe(false);
			expect(eventMap.has("session_end")).toBe(false);

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

			// Session events do not have task_id.
			expect(eventMap.get("session_start")?.task_id).toBeUndefined();

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

	test("start, observed done, and close keep the scoped workbench index current without derived refresh", () => {
		const root = mkRoot("hot-path-no-derived-work");
		try {
			const created = newWorkstream(root, "hot path", {
				noSpecRequiredReason: "fixture",
			});
			resetHotPathCountersForTests();
			startTask(root, { session: created.session, taskId: "T-01" });
			completeObservedTask(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				exitCode: 0,
			});
			closeSession(root, created.session);

			expect(readHotPathCountersForTests()).toMatchObject({
				"workbench.local_state_refresh": 0,
				"workbench.telemetry": 0,
			});
			expect(validateWorkBenchIndex(root)).toMatchObject({ ok: true });
			for (const operation of ["start", "close"] as const) {
				expect(readHotPathMeasurementsForTests()[operation]).toMatchObject({
					calls: 1,
					duration_ms: expect.any(Number),
					output_bytes: expect.any(Number),
				});
			}
			expect(readFileSync(created.taskPath, "utf8")).toContain(
				'status: "closed"',
			);
			expect(readFileSync(created.evidencePath, "utf8").trim()).not.toBe("");
			expect(
				readFileSync(resolveWorkbenchEventLogPath(root), "utf8"),
			).toContain("workbench.close");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("observed done preserves canonical evidence when a malformed ledger record rejects append", () => {
		const root = mkRoot("observed-done-event-tail");
		try {
			const created = newWorkstream(root, "event tail", {
				noSpecRequiredReason: "fixture",
			});
			startTask(root, { session: created.session, taskId: "T-01" });
			const eventPath = resolveWorkbenchEventLogPath(root);
			writeFileSync(eventPath, '{"truncated"\n', { flag: "a" });
			const invalidLedger = readFileSync(eventPath, "utf8");

			const result = completeObservedTask(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				exitCode: 0,
			});

			expect(result.warnings).toEqual([
				"workbench event commit failed after durable commit; repair the event ledger, then run afol local-state rebuild.",
			]);
			expect(readFileSync(created.taskPath, "utf8")).toContain(
				"| T-01 | done |",
			);
			expect(readFileSync(created.evidencePath, "utf8").trim()).not.toBe("");
			expect(readFileSync(eventPath, "utf8")).toBe(invalidLedger);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("done command records one metric for failed observed completion", async () => {
		const root = mkRoot("done-command-failed-metric");
		const originalError = console.error;
		const output: string[] = [];
		try {
			const created = newWorkstream(root, "failed done metric", {
				noSpecRequiredReason: "fixture",
			});
			startTask(root, { session: created.session, taskId: "T-01" });
			resetHotPathCountersForTests();
			console.error = (...values: unknown[]) => output.push(values.join(" "));
			expect(
				await runDoneCommand(
					[
						"--session",
						created.session,
						"T-01",
						"--test",
						'bun -e "process.exit(1)"',
					],
					root,
				),
			).toBe(1);
			expect(readHotPathMeasurementsForTests().done).toMatchObject({
				calls: 1,
				duration_ms: expect.any(Number),
				output_bytes: Buffer.byteLength(output.join("\n"), "utf8"),
			});
			expect(
				readHotPathMeasurementsForTests().done.output_bytes,
			).toBeGreaterThan(0);
		} finally {
			console.error = originalError;
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("batch done command records one metric for all tasks", async () => {
		const root = mkRoot("done-command-batch-metric");
		const originalLog = console.log;
		const output: string[] = [];
		try {
			const created = newWorkstream(root, "batch done metric", {
				tasks: ["first", "second"],
				noSpecRequiredReason: "fixture",
			});
			startTask(root, { session: created.session, taskId: "T-01" });
			startTask(root, { session: created.session, taskId: "T-02" });
			resetHotPathCountersForTests();
			console.log = (...values: unknown[]) => output.push(values.join(" "));
			expect(
				await runDoneCommand(
					[
						"--session",
						created.session,
						"T-01..T-02",
						"--test",
						'bun -e "process.exit(0)"',
					],
					root,
				),
			).toBe(0);
			expect(readHotPathMeasurementsForTests().done).toMatchObject({
				calls: 1,
				output_bytes: Buffer.byteLength(output.join("\n"), "utf8"),
			});
		} finally {
			console.log = originalLog;
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("done command records the emitted success output", async () => {
		const root = mkRoot("done-command-success-metric");
		const originalLog = console.log;
		const output: string[] = [];
		try {
			const created = newWorkstream(root, "success done metric", {
				noSpecRequiredReason: "fixture",
			});
			startTask(root, { session: created.session, taskId: "T-01" });
			resetHotPathCountersForTests();
			console.log = (...values: unknown[]) => output.push(values.join(" "));
			expect(
				await runDoneCommand(
					[
						"--session",
						created.session,
						"T-01",
						"--test",
						'bun -e "process.exit(0)"',
					],
					root,
				),
			).toBe(0);
			expect(readHotPathMeasurementsForTests().done).toMatchObject({
				calls: 1,
				output_bytes: Buffer.byteLength(output.join("\n"), "utf8"),
			});
		} finally {
			console.log = originalLog;
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("deferred event failures warn once without retrying observed done or batch completion", () => {
		const root = mkRoot("deferred-event-failure");
		try {
			const created = newWorkstream(root, "event failure", {
				tasks: ["first", "second", "third"],
				noSpecRequiredReason: "fixture",
			});
			let eventCommitAttempts = 0;
			const injectedFailure = {
				beforeAuxiliary: (label: string) => {
					if (label === "workbench event commit") {
						eventCommitAttempts += 1;
						throw new Error("injected event commit");
					}
				},
			};
			startTask(root, { session: created.session, taskId: "T-01" });
			const single = completeObservedTask(
				root,
				{
					session: created.session,
					taskId: "T-01",
					command: "bun test",
					exitCode: 0,
				},
				injectedFailure,
			);
			expect(single.warnings).toEqual([
				"workbench event commit failed after durable commit; repair the event ledger, then run afol local-state rebuild.",
			]);
			expect(eventCommitAttempts).toBe(1);

			startTask(root, { session: created.session, taskId: "T-02" });
			startTask(root, { session: created.session, taskId: "T-03" });
			const batch = completeObservedTasks(
				root,
				{
					session: created.session,
					taskIds: ["T-02", "T-03"],
					command: "bun test",
					exitCode: 0,
				},
				injectedFailure,
			);
			expect(batch.warnings).toEqual([
				"workbench event commit failed after durable commit; repair the event ledger, then run afol local-state rebuild.",
			]);
			expect(eventCommitAttempts).toBe(2);
			expect(readFileSync(created.taskPath, "utf8")).toContain(
				"| T-03 | done |",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("close returns the bounded recovery warning when event commit fails", () => {
		const root = mkRoot("close-event-failure");
		try {
			const created = newWorkstream(root, "close event failure", {
				noSpecRequiredReason: "fixture",
			});
			startTask(root, { session: created.session, taskId: "T-01" });
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });
			let eventCommitAttempts = 0;
			const result = closeSession(
				root,
				created.session,
				{},
				{
					beforeAuxiliary: (label) => {
						if (label === "workbench event commit") {
							eventCommitAttempts += 1;
							throw new Error("injected event commit");
						}
					},
				},
			);

			expect([...result]).toEqual([
				"workbench event commit failed after durable commit; repair the event ledger, then run afol local-state rebuild.",
			]);
			expect(eventCommitAttempts).toBe(1);
			expect(readFileSync(created.taskPath, "utf8")).toContain(
				'status: "closed"',
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("close keeps durable state when local-state refresh fails", () => {
		const root = mkRoot("close-refresh-failure");
		try {
			const created = newWorkstream(root, "close refresh failure", {
				noSpecRequiredReason: "fixture",
			});
			startTask(root, { session: created.session, taskId: "T-01" });
			recordObservedCompletion(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});
			doneTask(root, { session: created.session, taskId: "T-01" });

			const result = closeSession(
				root,
				created.session,
				{},
				{
					beforeAuxiliary: (label) => {
						if (label === "local-state refresh") {
							throw new Error("injected refresh");
						}
					},
				},
			);

			expect(result).toContain(
				"local-state refresh failed after durable commit: injected refresh",
			);
			expect(isSessionClosed(root, created.session)).toBe(true);
			expect(readFileSync(created.taskPath, "utf8")).toContain(
				'status: "closed"',
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("sequential done verification runs", () => {
	test("rejects an ineligible task before spawning step one", () => {
		const root = mkRoot("done-sequence-preflight-state");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "done sequence preflight state");
			const marker = join(root, "should-not-run");
			const proc = runKernel(root, [
				"done",
				"-S",
				created.session,
				"-T",
				"T-01",
				"-x",
				workbenchChildCommand("preflight"),
				"-x",
				"bun --version",
				"--json",
			]);
			expect(proc.status).toBe(2);
			expect(existsSync(marker)).toBe(false);
			expect(
				existsSync(join(created.sessionDir, ".verification-runs.jsonl")),
			).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("keeps single --test on legacy evidence without run metadata", () => {
		const root = mkRoot("done-single-legacy-evidence");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "done single legacy evidence");
			startTask(root, { session: created.session, taskId: "T-01" });
			const proc = runKernel(root, [
				"done",
				"-S",
				created.session,
				"-T",
				"T-01",
				"-x",
				"bun --version",
				"--json",
			]);
			expect(proc.status).toBe(0);
			const envelope = parseEnvelope(proc.stdout as string);
			expect(envelope.data).not.toHaveProperty("verification_run_id");
			expect(envelope.data).not.toHaveProperty("step_count");
			expect(
				existsSync(join(created.sessionDir, ".verification-runs.jsonl")),
			).toBe(false);
			const evidence = JSON.parse(
				readFileSync(created.evidencePath, "utf8").trim(),
			) as Record<string, unknown>;
			expect(evidence).toMatchObject({
				command: "bun --version",
				result: "passed",
				provenance: "observed",
				exit_code: 0,
			});
			expect(evidence).not.toHaveProperty("verification_run_id");
			expect(evidence).not.toHaveProperty("step_index");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("keeps positional argv on legacy evidence without a run ledger", () => {
		const root = mkRoot("done-positional-legacy-evidence");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "done positional legacy evidence");
			startTask(root, { session: created.session, taskId: "T-01" });
			const proc = runKernel(root, [
				"done",
				"-S",
				created.session,
				"-T",
				"T-01",
				"--json",
				"--",
				"bun",
				"--version",
			]);
			expect(proc.status).toBe(0);
			expect(
				existsSync(join(created.sessionDir, ".verification-runs.jsonl")),
			).toBe(false);
			const evidence = JSON.parse(
				readFileSync(created.evidencePath, "utf8").trim(),
			) as Record<string, unknown>;
			expect(evidence).not.toHaveProperty("verification_run_id");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("preserves one-step revalidation for a legacy task already done", () => {
		const root = mkRoot("done-sequence-legacy-done");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "done sequence legacy done");
			startTask(root, { session: created.session, taskId: "T-01" });
			const legacyCompletion = completeObservedTask(root, {
				session: created.session,
				taskId: "T-01",
				command: "legacy-check",
				exitCode: 0,
			});
			expect(legacyCompletion.done).toBeDefined();
			const ledgerPath = join(created.sessionDir, ".verification-runs.jsonl");
			expect(existsSync(ledgerPath)).toBe(false);

			const proc = runKernel(root, [
				"done",
				"-S",
				created.session,
				"-T",
				"T-01",
				"-x",
				"bun --version",
				"--json",
			]);
			expect(proc.status).toBe(0);
			expect(existsSync(ledgerPath)).toBe(false);
			const evidence = readFileSync(created.evidencePath, "utf8")
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line) as Record<string, unknown>);
			expect(evidence).toHaveLength(2);
			expect(evidence.at(-1)).toMatchObject({
				command: "bun --version",
				provenance: "observed",
				exit_code: 0,
			});
			expect(evidence.at(-1)).not.toHaveProperty("verification_run_id");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("records ordered evidence and one terminal for repeated --test", () => {
		const root = mkRoot("done-sequence-success");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "done sequence success");
			startTask(root, { session: created.session, taskId: "T-01" });
			const verificationArgs = Array.from({ length: 8 }, () => [
				"--test",
				'bun -e "process.exit(0)"',
			]).flat();
			const proc = runKernel(root, [
				"done",
				"--session",
				created.session,
				"--task-id",
				"T-01",
				...verificationArgs,
				"--json",
			]);

			expect(proc.status).toBe(0);
			const envelope = parseEnvelope(proc.stdout as string);
			const data = envelope.data as Record<string, unknown>;
			expect(data.step_count).toBe(8);
			expect(data.evidence_count).toBe(8);
			expect(Array.isArray(data.evidence_ids)).toBe(true);
			expect((proc.stdout as string).length / 4).toBeLessThanOrEqual(500);

			const runRecords = readFileSync(
				join(created.sessionDir, ".verification-runs.jsonl"),
				"utf8",
			)
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line) as Record<string, unknown>);
			expect(
				runRecords.filter((record) => record.record_type === "start"),
			).toHaveLength(1);
			expect(
				runRecords.filter((record) => record.record_type === "step"),
			).toHaveLength(8);
			expect(
				runRecords.filter((record) => record.record_type === "terminal"),
			).toHaveLength(1);
			const evidence = readFileSync(created.evidencePath, "utf8")
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line) as Record<string, unknown>);
			expect(evidence.map((entry) => entry.step_index)).toEqual([
				1, 2, 3, 4, 5, 6, 7, 8,
			]);
			expect(evidence.every((entry) => entry.command_digest)).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fails fast at a middle step and skips later commands", () => {
		const root = mkRoot("done-sequence-failure");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "done sequence failure");
			startTask(root, { session: created.session, taskId: "T-01" });
			const skippedPath = join(root, "skipped-step.txt");
			const proc = runKernel(root, [
				"done",
				"--session",
				created.session,
				"--task-id",
				"T-01",
				"--test",
				'bun -e "process.exit(0)"',
				"--test",
				'bun -e "process.exit(3)"',
				"--test",
				workbenchChildCommand("skipped"),
				"--json",
			]);

			expect(proc.status).toBe(1);
			const envelope = parseEnvelope(proc.stdout as string);
			expect(envelope.error).toMatchObject({
				code: "workbench.verification_failed",
			});
			const data = envelope.data as Record<string, unknown>;
			expect(data).toMatchObject({
				status: "failed",
				step_index: 2,
				step_count: 3,
				evidence_count: 2,
			});
			expect(data).not.toHaveProperty("authorizing_evidence_id");
			expect(existsSync(skippedPath)).toBe(false);
			const records = readFileSync(
				join(created.sessionDir, ".verification-runs.jsonl"),
				"utf8",
			)
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line) as Record<string, unknown>);
			expect(
				records.filter((record) => record.record_type === "step"),
			).toHaveLength(2);
			expect(
				records.find((record) => record.record_type === "terminal"),
			).toMatchObject({ status: "failed", failed_step: 2 });
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("records a child signal without persisting child output", () => {
		if (process.platform === "win32") return;
		const root = mkRoot("done-sequence-signal");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "done sequence signal");
			startTask(root, { session: created.session, taskId: "T-01" });
			const rawOutput = "RAW_CHILD_OUTPUT_SHOULD_NOT_PERSIST";
			const proc = runKernel(root, [
				"done",
				"-S",
				created.session,
				"-T",
				"T-01",
				"-x",
				workbenchChildCommand("signal"),
				"-x",
				"bun --version",
				"--json",
			]);
			expect(proc.status).toBe(1);
			const envelope = parseEnvelope(proc.stdout as string);
			expect(envelope.data).toMatchObject({ status: "signaled" });
			const evidenceBody = readFileSync(created.evidencePath, "utf8");
			const ledgerBody = readFileSync(
				join(created.sessionDir, ".verification-runs.jsonl"),
				"utf8",
			);
			const evidence = JSON.parse(evidenceBody.trim()) as Record<
				string,
				unknown
			>;
			const step = ledgerBody
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line) as Record<string, unknown>)
				.find((record) => record.record_type === "step");
			expect(evidence).toMatchObject({
				verification_status: "signaled",
				signal: "SIGTERM",
			});
			expect(step).toMatchObject({ status: "signaled", signal: "SIGTERM" });
			expect(evidenceBody).not.toContain(rawOutput);
			expect(ledgerBody).not.toContain(rawOutput);
			expect(proc.stdout as string).not.toContain(rawOutput);
			expect(proc.stderr as string).not.toContain(rawOutput);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("uses a new verification attempt without changing the task attempt", () => {
		const root = mkRoot("done-sequence-retry");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "done sequence retry");
			startTask(root, { session: created.session, taskId: "T-01" });
			const first = runKernel(root, [
				"done",
				"-S",
				created.session,
				"-T",
				"T-01",
				"-x",
				'bun -e "process.exit(4)"',
				"-x",
				"bun --version",
				"--json",
			]);
			expect(first.status).toBe(1);
			const second = runKernel(root, [
				"done",
				"-S",
				created.session,
				"-T",
				"T-01",
				"-x",
				'bun -e "process.exit(0)"',
				"-x",
				"bun --version",
				"--json",
			]);
			expect(second.status).toBe(0);

			const starts = readFileSync(
				join(created.sessionDir, ".verification-runs.jsonl"),
				"utf8",
			)
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line) as Record<string, unknown>)
				.filter((record) => record.record_type === "start");
			expect(starts).toHaveLength(2);
			expect(starts.map((record) => record.verification_attempt)).toEqual([
				1, 2,
			]);
			expect(new Set(starts.map((record) => record.task_attempt)).size).toBe(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("recovers a terminal passed run before the task transition", () => {
		const root = mkRoot("done-sequence-terminal-recovery");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "done sequence terminal recovery");
			startTask(root, { session: created.session, taskId: "T-01" });
			const command = 'bun -e "process.exit(0)"';
			const prepared = prepareVerificationRun(
				root,
				{
					session: created.session,
					taskId: "T-01",
					taskAttemptSnapshot: taskAttemptSnapshot(root, {
						session: created.session,
						taskId: "T-01",
					}),
					commands: [command, command],
				},
				{ fencingCheck: () => {} },
			);
			expect(prepared.kind).toBe("new");
			if (prepared.kind !== "new") throw new Error("expected new run");
			const firstEvidence = recordVerificationRunStep(
				root,
				{
					session: created.session,
					taskId: "T-01",
					run: prepared.run,
					stepIndex: 1,
					command,
					status: "passed",
					exitCode: 0,
					durationMs: 1,
				},
				{ fencingCheck: () => {} },
			);
			const secondEvidence = recordVerificationRunStep(
				root,
				{
					session: created.session,
					taskId: "T-01",
					run: prepared.run,
					stepIndex: 2,
					command,
					status: "passed",
					exitCode: 0,
					durationMs: 1,
				},
				{ fencingCheck: () => {} },
			);
			appendVerificationRunTerminal(
				root,
				created.session,
				{
					record_type: "terminal",
					verification_run_id: prepared.run.verification_run_id,
					task_id: "T-01",
					task_attempt: prepared.run.task_attempt,
					verification_attempt: prepared.run.verification_attempt,
					status: "passed",
					evidence_ids: [firstEvidence.id, secondEvidence.id],
					evidence_count: 2,
					authorizing_evidence_id: secondEvidence.id,
					created_at: new Date().toISOString(),
				},
				() => {},
			);

			const recovered = runKernel(root, [
				"done",
				"-S",
				created.session,
				"-T",
				"T-01",
				"-x",
				command,
				"-x",
				command,
				"--json",
			]);
			expect(recovered.status).toBe(0);
			const records = readFileSync(
				join(created.sessionDir, ".verification-runs.jsonl"),
				"utf8",
			)
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line) as Record<string, unknown>);
			expect(
				records.filter((record) => record.record_type === "start"),
			).toHaveLength(1);
			expect(
				records.filter((record) => record.record_type === "terminal"),
			).toHaveLength(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("serializes two kernel processes without duplicate completion", async () => {
		const root = mkRoot("done-sequence-process-race");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "done sequence process race");
			startTask(root, { session: created.session, taskId: "T-01" });
			const marker = join(root, "first-verification-started");
			const baseArgs = [
				kernelPath,
				"done",
				"-S",
				created.session,
				"-T",
				"T-01",
			];
			const first = spawn(
				"bun",
				[
					...baseArgs,
					"-x",
					workbenchChildCommand("sequence"),
					"-x",
					"bun --version",
					"--json",
				],
				{ cwd: root, stdio: ["ignore", "pipe", "pipe"] },
			);
			for (
				let attempts = 0;
				attempts < 100 && !existsSync(marker);
				attempts += 1
			) {
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
			expect(existsSync(marker)).toBe(true);
			const second = spawn(
				"bun",
				[
					...baseArgs,
					"-x",
					workbenchChildCommand("sequence"),
					"-x",
					"bun --version",
					"--json",
				],
				{ cwd: root, stdio: ["ignore", "pipe", "pipe"] },
			);
			const [firstResult, secondResult] = await Promise.all([
				waitForExit(first),
				waitForExit(second),
			]);
			expect(firstResult.code).toBe(0);
			expect(secondResult.code).toBe(0);
			const firstEnvelope = parseEnvelope(firstResult.stdout);
			const secondEnvelope = parseEnvelope(secondResult.stdout);
			expect(secondEnvelope.data).toMatchObject({
				verification_run_id: (firstEnvelope.data as Record<string, unknown>)
					.verification_run_id,
				evidence_ids: (firstEnvelope.data as Record<string, unknown>)
					.evidence_ids,
			});

			const runRecords = readFileSync(
				join(created.sessionDir, ".verification-runs.jsonl"),
				"utf8",
			)
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line) as Record<string, unknown>);
			expect(
				runRecords.filter((record) => record.record_type === "start"),
			).toHaveLength(1);
			expect(
				runRecords.filter((record) => record.record_type === "terminal"),
			).toHaveLength(1);
			const evidence = readFileSync(created.evidencePath, "utf8")
				.trim()
				.split("\n")
				.filter(Boolean);
			expect(evidence).toHaveLength(2);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("terminates a running child and fails closed after fencing loss", async () => {
		if (process.platform === "win32") return;
		const root = mkRoot("done-sequence-fencing-loss");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "done sequence fencing loss");
			startTask(root, { session: created.session, taskId: "T-01" });
			const marker = join(root, "fenced-child.pid");
			const child = spawn(
				"bun",
				[
					kernelPath,
					"done",
					"-S",
					created.session,
					"-T",
					"T-01",
					"-x",
					workbenchChildCommand("fencing"),
					"-x",
					"bun --version",
					"--json",
				],
				{ cwd: root, stdio: ["ignore", "pipe", "pipe"] },
			);
			for (
				let attempts = 0;
				attempts < 200 && !existsSync(marker);
				attempts += 1
			) {
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
			expect(existsSync(marker)).toBe(true);
			const verificationPid = Number.parseInt(readFileSync(marker, "utf8"), 10);
			const lockPath = resolveTaskCompletionLockPath(
				root,
				created.session,
				"T-01",
			);
			const fencePath = `${lockPath}.fence`;
			const generation = Number.parseInt(readFileSync(fencePath, "utf8"), 10);
			const fencedAt = Date.now();
			writeFileSync(fencePath, `${generation + 1}\n`, "utf8");

			const result = await waitForExit(child);
			expect(Date.now() - fencedAt).toBeLessThan(3_000);
			expect(result.code).toBe(1);
			const envelope = parseEnvelope(result.stdout);
			expect(envelope.error).toMatchObject({
				code: "workbench.verification_failed",
			});
			expect(envelope.data).toMatchObject({
				status: "lock_lost",
				step_index: 1,
				step_count: 2,
				evidence_count: 0,
			});
			let verificationAlive = true;
			try {
				process.kill(verificationPid, 0);
			} catch {
				verificationAlive = false;
			}
			expect(verificationAlive).toBe(false);
			expect(readFileSync(created.evidencePath, "utf8").trim()).toBe("");
			expect(readFileSync(created.taskPath, "utf8")).toContain(
				"| T-01 | in_progress |",
			);
			const records = readFileSync(
				join(created.sessionDir, ".verification-runs.jsonl"),
				"utf8",
			)
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line) as Record<string, unknown>);
			expect(
				records.filter((record) => record.record_type === "step"),
			).toHaveLength(0);
			// The lost fence makes terminal persistence unauthorized; the stale-state
			// integration below covers the persistable interrupted-terminal branch.
			expect(
				records.filter((record) => record.record_type === "terminal"),
			).toHaveLength(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("reports a typed stale conflict when task state changes during a child", async () => {
		const root = mkRoot("done-sequence-stale-conflict");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "done sequence stale conflict");
			startTask(root, { session: created.session, taskId: "T-01" });
			const marker = join(root, "stale-verification-started");
			const child = spawn(
				"bun",
				[
					kernelPath,
					"done",
					"-S",
					created.session,
					"-T",
					"T-01",
					"-x",
					workbenchChildCommand("stale"),
					"-x",
					"bun --version",
					"--json",
				],
				{ cwd: root, stdio: ["ignore", "pipe", "pipe"] },
			);
			for (
				let attempts = 0;
				attempts < 100 && !existsSync(marker);
				attempts += 1
			) {
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
			expect(existsSync(marker)).toBe(true);
			transitionTask(root, {
				session: created.session,
				taskId: "T-01",
				state: "moved",
			});
			const result = await waitForExit(child);
			expect(result.code).toBe(1);
			const envelope = parseEnvelope(result.stdout);
			expect(envelope.data).toMatchObject({ status: "stale_conflict" });
			const records = readFileSync(
				join(created.sessionDir, ".verification-runs.jsonl"),
				"utf8",
			)
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line) as Record<string, unknown>);
			expect(
				records.find((record) => record.record_type === "terminal"),
			).toMatchObject({ status: "interrupted", evidence_count: 0 });
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("terminalizes an evidence persistence failure as interrupted", () => {
		if (process.platform === "win32") return;
		const root = mkRoot("done-sequence-evidence-write-failure");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "done sequence evidence failure");
			startTask(root, { session: created.session, taskId: "T-01" });
			chmodSync(created.evidencePath, 0o444);
			const proc = runKernel(root, [
				"done",
				"-S",
				created.session,
				"-T",
				"T-01",
				"-x",
				'bun -e "process.exit(0)"',
				"-x",
				"bun --version",
				"--json",
			]);
			expect(proc.status).toBe(1);
			const envelope = parseEnvelope(proc.stdout as string);
			expect(envelope.data).toMatchObject({
				status: "persistence_failed",
				evidence_count: 0,
			});
			const records = readFileSync(
				join(created.sessionDir, ".verification-runs.jsonl"),
				"utf8",
			)
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line) as Record<string, unknown>);
			expect(
				records.find((record) => record.record_type === "terminal"),
			).toMatchObject({ status: "interrupted", evidence_count: 0 });
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

	test("transition to problem requires and persists a blocker reason", async () => {
		const root = mkRoot("transition-problem-reason");
		try {
			writeCliProjectContract(root);
			initGitRepo(root);
			const created = newWorkstream(root, "transition problem reason", {
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
						"problem",
						"--reason",
						"hosted preview requires external credentials",
					],
					root,
				),
			).toBe(0);
			expect(readFileSync(created.taskPath, "utf8")).toContain(
				"| T-01 | problem |",
			);
			expect(readLocalStateEvents(root)).toContainEqual(
				expect.objectContaining({
					type: "workbench.transition_task",
					session: created.session,
					taskId: "T-01",
					detail: expect.objectContaining({
						to: "problem",
						reason: "hosted preview requires external credentials",
					}),
				}),
			);
			const status = runKernel(root, ["status", "--json"]);
			expect(status.status).toBe(0);
			expect(parseEnvelope(status.stdout as string).data).toMatchObject({
				problem_reason: "hosted preview requires external credentials",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("transition rejects problem without a blocker reason", async () => {
		const root = mkRoot("transition-problem-no-reason");
		const originalError = console.error;
		try {
			const created = newWorkstream(root, "transition problem no reason", {
				noSpecRequiredReason: "fixture",
			});
			startTask(root, { session: created.session, taskId: "T-01" });
			console.error = () => {};
			expect(
				await runTransitionCommand(
					[
						"--session",
						created.session,
						"--task-id",
						"T-01",
						"--state",
						"problem",
					],
					root,
				),
			).toBe(2);
			expect(readFileSync(created.taskPath, "utf8")).toContain(
				"| T-01 | in_progress |",
			);
		} finally {
			console.error = originalError;
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("transition rejects a batch selector without partial mutation", async () => {
		const root = mkRoot("transition-batch-rejected");
		const originalError = console.error;
		try {
			const created = newWorkstream(root, "transition batch rejected", {
				tasks: ["first", "second"],
				noSpecRequiredReason: "fixture",
			});
			console.error = () => {};
			expect(
				await runTransitionCommand(
					[
						"--session",
						created.session,
						"T-01..T-02",
						"--state",
						"in_progress",
					],
					root,
				),
			).toBe(2);
			const task = readFileSync(created.taskPath, "utf8");
			expect(task).toContain("| T-01 | pending |");
			expect(task).toContain("| T-02 | pending |");
		} finally {
			console.error = originalError;
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

	test("batch start is atomic when one selected task is missing", async () => {
		const root = mkRoot("batch-start-preflight");
		const originalError = console.error;
		try {
			const created = newWorkstream(root, "batch start preflight", {
				tasks: ["first", "second"],
				noSpecRequiredReason: "fixture",
			});
			console.error = () => {};
			expect(
				await runStartCommand(
					["--session", created.session, "T-01,T-99"],
					root,
				),
			).toBe(2);
			const task = readFileSync(created.taskPath, "utf8");
			expect(task).toContain("| T-01 | pending |");
			expect(task).toContain("| T-02 | pending |");
		} finally {
			console.error = originalError;
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("batch start is atomic when one selected task already started", async () => {
		const root = mkRoot("batch-start-state-preflight");
		const originalError = console.error;
		try {
			const created = newWorkstream(root, "batch start state preflight", {
				tasks: ["first", "second"],
				noSpecRequiredReason: "fixture",
			});
			startTask(root, { session: created.session, taskId: "T-02" });
			console.error = () => {};
			expect(
				await runStartCommand(
					["--session", created.session, "T-01..T-02"],
					root,
				),
			).toBe(2);
			const task = readFileSync(created.taskPath, "utf8");
			expect(task).toContain("| T-01 | pending |");
			expect(task).toContain("| T-02 | in_progress |");
		} finally {
			console.error = originalError;
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("batch done executes one shared check and records evidence per task", async () => {
		const root = mkRoot("batch-done-shared-check");
		const output: string[] = [];
		const originalLog = console.log;
		try {
			const created = newWorkstream(root, "batch done shared check", {
				tasks: ["first", "second", "third"],
				noSpecRequiredReason: "fixture",
			});
			const counterPath = join(root, "verification-count.txt");
			const verifierPath = join(root, "verify-once.ts");
			writeFileSync(
				verifierPath,
				[
					'import { existsSync, readFileSync, writeFileSync } from "node:fs";',
					`const path = ${JSON.stringify(counterPath)};`,
					'const count = existsSync(path) ? Number(readFileSync(path, "utf8")) : 0;',
					'writeFileSync(path, String(count + 1), "utf8");',
				].join("\n"),
			);
			console.log = (...values: unknown[]) => output.push(values.join(" "));

			expect(
				await runStartCommand(
					["--session", created.session, "T-01..T-03"],
					root,
				),
			).toBe(0);
			expect(
				await runDoneCommand(
					[
						"--session",
						created.session,
						"T-01..T-03",
						"--test",
						`bun ${verifierPath}`,
					],
					root,
				),
			).toBe(0);

			expect(readFileSync(counterPath, "utf8")).toBe("1");
			const task = readFileSync(created.taskPath, "utf8");
			expect(task.match(/\| T-0[1-3] \| done \|/g)).toHaveLength(3);
			const evidence = loadEvidenceEntries(created.evidencePath);
			expect(evidence).toHaveLength(3);
			expect(evidence.every((entry) => entry.provenance === "observed")).toBe(
				true,
			);
			expect(new Set(evidence.map((entry) => entry.id)).size).toBe(3);
			const renderedOutput = output.join("\n");
			expect(renderedOutput).toContain("tasks started: 3 (T-01..T-03)");
			expect(renderedOutput).toContain("tasks done: 3 (T-01..T-03)");
			expect(Buffer.byteLength(renderedOutput, "utf8")).toBeLessThan(160);
		} finally {
			console.log = originalLog;
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("batch start and done expose compact JSON contracts", async () => {
		const root = mkRoot("batch-json-success");
		const output: string[] = [];
		const originalLog = console.log;
		try {
			const created = newWorkstream(root, "batch json success", {
				tasks: ["first", "second"],
				noSpecRequiredReason: "fixture",
			});
			console.log = (...values: unknown[]) => output.push(values.join(" "));
			expect(
				await runStartCommand(
					["--session", created.session, "T-01..T-02", "--json"],
					root,
				),
			).toBe(0);
			expect(parseEnvelope(output.at(-1) ?? "")).toMatchObject({
				ok: true,
				action: "workbench.start",
				data: {
					session: created.session,
					task: "T-01",
					tasks: ["T-01", "T-02"],
					status: "in_progress",
				},
			});

			output.length = 0;
			expect(
				await runDoneCommand(
					[
						"--session",
						created.session,
						"T-01..T-02",
						"--test",
						'bun -e "process.exit(0)"',
						"--json",
					],
					root,
				),
			).toBe(0);
			const envelope = parseEnvelope(output.at(-1) ?? "");
			expect(envelope).toMatchObject({
				ok: true,
				action: "workbench.done",
				data: {
					session: created.session,
					tasks: ["T-01", "T-02"],
					status: "done",
					evidence_count: 2,
				},
			});
			const data = envelope.data as { evidence_ids: string[] };
			expect(data.evidence_ids).toHaveLength(2);
			expect(new Set(data.evidence_ids).size).toBe(2);
			expect(Buffer.byteLength(output.at(-1) ?? "", "utf8")).toBeLessThan(
				1_000,
			);
		} finally {
			console.log = originalLog;
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("batch done runs a failing shared check once and leaves every task open", async () => {
		const root = mkRoot("batch-done-shared-failure");
		const originalError = console.error;
		const originalLog = console.log;
		try {
			const created = newWorkstream(root, "batch done shared failure", {
				tasks: ["first", "second"],
				noSpecRequiredReason: "fixture",
			});
			const counterPath = join(root, "verification-count.txt");
			const verifierPath = join(root, "verify-failure.ts");
			writeFileSync(
				verifierPath,
				[
					'import { existsSync, readFileSync, writeFileSync } from "node:fs";',
					`const path = ${JSON.stringify(counterPath)};`,
					'const count = existsSync(path) ? Number(readFileSync(path, "utf8")) : 0;',
					'writeFileSync(path, String(count + 1), "utf8");',
					"process.exit(1);",
				].join("\n"),
			);
			console.error = () => {};
			console.log = () => {};
			expect(
				await runStartCommand(
					["--session", created.session, "T-01..T-02"],
					root,
				),
			).toBe(0);
			expect(
				await runDoneCommand(
					[
						"--session",
						created.session,
						"T-01..T-02",
						"--test",
						`bun ${verifierPath}`,
					],
					root,
				),
			).toBe(1);

			expect(readFileSync(counterPath, "utf8")).toBe("1");
			const task = readFileSync(created.taskPath, "utf8");
			expect(task.match(/\| T-0[1-2] \| in_progress \|/g)).toHaveLength(2);
			const evidence = loadEvidenceEntries(created.evidencePath);
			expect(evidence).toHaveLength(2);
			expect(evidence.every((entry) => entry.result === "failed")).toBe(true);
		} finally {
			console.error = originalError;
			console.log = originalLog;
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("batch done failure JSON reports every failed evidence record", async () => {
		const root = mkRoot("batch-json-failure");
		const output: string[] = [];
		const originalLog = console.log;
		try {
			const created = newWorkstream(root, "batch json failure", {
				tasks: ["first", "second"],
				noSpecRequiredReason: "fixture",
			});
			console.log = (...values: unknown[]) => output.push(values.join(" "));
			expect(
				await runStartCommand(
					["--session", created.session, "T-01..T-02"],
					root,
				),
			).toBe(0);
			output.length = 0;
			expect(
				await runDoneCommand(
					[
						"--session",
						created.session,
						"T-01..T-02",
						"--test",
						'bun -e "process.exit(7)"',
						"--json",
					],
					root,
				),
			).toBe(1);
			const envelope = parseEnvelope(output.at(-1) ?? "");
			expect(envelope).toMatchObject({
				ok: false,
				action: "workbench.done",
				data: {
					session: created.session,
					task_ids: ["T-01", "T-02"],
					failed_step: "verification",
					status: "failed",
					evidence_count: 2,
					next_command: expect.any(String),
				},
			});
			const data = envelope.data as { evidence_ids: string[] };
			expect(data.evidence_ids).toHaveLength(2);
			expect(new Set(data.evidence_ids).size).toBe(2);
			expect(
				loadEvidenceEntries(created.evidencePath).every(
					(entry) => entry.result === "failed",
				),
			).toBe(true);
		} finally {
			console.log = originalLog;
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("batch done rejects an unready task before running the shared check", async () => {
		const root = mkRoot("batch-done-preflight");
		const originalError = console.error;
		const originalLog = console.log;
		try {
			const created = newWorkstream(root, "batch done preflight", {
				tasks: ["first", "second"],
				noSpecRequiredReason: "fixture",
			});
			const markerPath = join(root, "unexpected-verification.txt");
			const verifierPath = join(root, "must-not-run.ts");
			writeFileSync(
				verifierPath,
				`await Bun.write(${JSON.stringify(markerPath)}, "ran");`,
			);
			console.error = () => {};
			console.log = () => {};
			expect(
				await runStartCommand(["--session", created.session, "T-01"], root),
			).toBe(0);
			expect(
				await runDoneCommand(
					[
						"--session",
						created.session,
						"T-01..T-02",
						"--test",
						`bun ${verifierPath}`,
					],
					root,
				),
			).toBe(2);
			expect(existsSync(markerPath)).toBe(false);
			expect(loadEvidenceEntries(created.evidencePath)).toHaveLength(0);
		} finally {
			console.error = originalError;
			console.log = originalLog;
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("batch done rejects a mixed completion policy before verification", async () => {
		const root = mkRoot("batch-done-policy-preflight");
		const originalError = console.error;
		const originalLog = console.log;
		try {
			const created = newWorkstream(root, "batch done policy preflight", {
				tasks: ["first", "second"],
				noSpecRequiredReason: "fixture",
			});
			const markerPath = join(root, "unexpected-verification.txt");
			const verifierPath = join(root, "must-not-run.ts");
			writeFileSync(
				verifierPath,
				`await Bun.write(${JSON.stringify(markerPath)}, "ran");`,
			);
			startTask(root, { session: created.session, taskId: "T-01" });
			startTask(root, { session: created.session, taskId: "T-02" });
			transitionTask(root, {
				session: created.session,
				taskId: "T-02",
				state: "implemented_untested",
				completionPolicy: "artifact",
			});
			console.error = () => {};
			console.log = () => {};
			expect(
				await runDoneCommand(
					[
						"--session",
						created.session,
						"T-01..T-02",
						"--test",
						`bun ${verifierPath}`,
					],
					root,
				),
			).toBe(2);
			expect(existsSync(markerPath)).toBe(false);
			expect(loadEvidenceEntries(created.evidencePath)).toHaveLength(0);
			const task = readFileSync(created.taskPath, "utf8");
			expect(task).toContain("| T-01 | in_progress |");
			expect(task).toContain("| T-02 | implemented_untested |");
		} finally {
			console.error = originalError;
			console.log = originalLog;
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("batch done rejects a changed task attempt after shared verification", async () => {
		const root = mkRoot("batch-done-attempt-fence");
		const originalError = console.error;
		const originalLog = console.log;
		const errors: string[] = [];
		try {
			const created = newWorkstream(root, "batch done attempt fence", {
				tasks: ["first", "second"],
				noSpecRequiredReason: "fixture",
			});
			const markerPath = join(root, "verification-started.txt");
			const verifierPath = join(root, "slow-verifier.ts");
			writeFileSync(
				verifierPath,
				`await Bun.write(${JSON.stringify(markerPath)}, "started"); await Bun.sleep(300);`,
			);
			startTask(root, { session: created.session, taskId: "T-01" });
			startTask(root, { session: created.session, taskId: "T-02" });
			console.error = (...values: unknown[]) =>
				errors.push(values.map(String).join(" "));
			console.log = () => {};
			const completion = runDoneCommand(
				[
					"--session",
					created.session,
					"T-01..T-02",
					"--test",
					`bun ${verifierPath}`,
				],
				root,
			);
			for (
				let attempts = 0;
				attempts < 100 && !existsSync(markerPath);
				attempts += 1
			) {
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
			expect(existsSync(markerPath)).toBe(true);
			transitionTask(root, {
				session: created.session,
				taskId: "T-02",
				state: "problem",
			});
			transitionTask(root, {
				session: created.session,
				taskId: "T-02",
				state: "in_progress",
			});
			expect(await completion).toBe(2);
			expect(errors.join("\n")).toContain(
				"Task T-02 attempt changed during shared verification.",
			);
			expect(loadEvidenceEntries(created.evidencePath)).toHaveLength(0);
			const task = readFileSync(created.taskPath, "utf8");
			expect(task).toContain("| T-01 | in_progress |");
			expect(task).toContain("| T-02 | in_progress |");
		} finally {
			console.error = originalError;
			console.log = originalLog;
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("single-task done rejects a changed task attempt after verification", async () => {
		const root = mkRoot("single-done-attempt-fence");
		const originalError = console.error;
		const originalLog = console.log;
		const errors: string[] = [];
		try {
			const created = newWorkstream(root, "single done attempt fence", {
				tasks: ["only task"],
				noSpecRequiredReason: "fixture",
			});
			const markerPath = join(root, "verification-started.txt");
			const verifierPath = join(root, "slow-verifier.ts");
			writeFileSync(
				verifierPath,
				`await Bun.write(${JSON.stringify(markerPath)}, "started"); await Bun.sleep(300);`,
			);
			startTask(root, { session: created.session, taskId: "T-01" });
			console.error = (...values: unknown[]) =>
				errors.push(values.map(String).join(" "));
			console.log = () => {};
			const completion = runDoneCommand(
				["--session", created.session, "T-01", "--test", `bun ${verifierPath}`],
				root,
			);
			for (
				let attempts = 0;
				attempts < 100 && !existsSync(markerPath);
				attempts += 1
			) {
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
			expect(existsSync(markerPath)).toBe(true);
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
			expect(await completion).toBe(2);
			expect(errors.join("\n")).toContain(
				"Task T-01 attempt changed during verification.",
			);
			expect(loadEvidenceEntries(created.evidencePath)).toHaveLength(0);
		} finally {
			console.error = originalError;
			console.log = originalLog;
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("batch done does not attach stale failed evidence after restart", async () => {
		const root = mkRoot("batch-done-failed-attempt-fence");
		const originalError = console.error;
		const originalLog = console.log;
		try {
			const created = newWorkstream(root, "batch failed attempt fence", {
				tasks: ["first", "second"],
				noSpecRequiredReason: "fixture",
			});
			const markerPath = join(root, "failed-verification-started.txt");
			const verifierPath = join(root, "slow-failing-verifier.ts");
			writeFileSync(
				verifierPath,
				`await Bun.write(${JSON.stringify(markerPath)}, "started"); await Bun.sleep(300); process.exit(1);`,
			);
			startTask(root, { session: created.session, taskId: "T-01" });
			startTask(root, { session: created.session, taskId: "T-02" });
			console.error = () => {};
			console.log = () => {};
			const completion = runDoneCommand(
				[
					"--session",
					created.session,
					"T-01..T-02",
					"--test",
					`bun ${verifierPath}`,
				],
				root,
			);
			for (
				let attempts = 0;
				attempts < 100 && !existsSync(markerPath);
				attempts += 1
			) {
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
			expect(existsSync(markerPath)).toBe(true);
			transitionTask(root, {
				session: created.session,
				taskId: "T-02",
				state: "problem",
			});
			transitionTask(root, {
				session: created.session,
				taskId: "T-02",
				state: "in_progress",
			});
			expect(await completion).toBe(2);
			expect(loadEvidenceEntries(created.evidencePath)).toHaveLength(0);
		} finally {
			console.error = originalError;
			console.log = originalLog;
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("batch done aborts when any selected task loses its lease", async () => {
		if (process.platform === "win32") return;
		const root = mkRoot("batch-done-lease-loss");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "batch done lease loss", {
				tasks: ["first", "second"],
				noSpecRequiredReason: "fixture",
			});
			startTask(root, { session: created.session, taskId: "T-01" });
			startTask(root, { session: created.session, taskId: "T-02" });
			const marker = join(root, "batch-fenced-child.pid");
			const child = spawn(
				"bun",
				[
					kernelPath,
					"done",
					"-S",
					created.session,
					"-T",
					"T-01..T-02",
					"-x",
					workbenchChildCommand("batch-fencing"),
					"--json",
				],
				{ cwd: root, stdio: ["ignore", "pipe", "pipe"] },
			);
			for (
				let attempts = 0;
				attempts < 200 && !existsSync(marker);
				attempts += 1
			) {
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
			expect(existsSync(marker)).toBe(true);
			const verificationPid = Number.parseInt(readFileSync(marker, "utf8"), 10);
			const lockPath = resolveTaskCompletionLockPath(
				root,
				created.session,
				"T-02",
			);
			const fencePath = `${lockPath}.fence`;
			const generation = Number.parseInt(readFileSync(fencePath, "utf8"), 10);
			const fencedAt = Date.now();
			writeFileSync(fencePath, `${generation + 1}\n`, "utf8");

			const result = await waitForExit(child);
			expect(Date.now() - fencedAt).toBeLessThan(3_000);
			expect(result.code).toBe(2);
			expect(loadEvidenceEntries(created.evidencePath)).toHaveLength(0);
			let verificationAlive = true;
			try {
				process.kill(verificationPid, 0);
			} catch {
				verificationAlive = false;
			}
			expect(verificationAlive).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("batch completion uses one fencing point before atomic mutation", () => {
		const root = mkRoot("batch-atomic-fencing");
		try {
			const created = newWorkstream(root, "batch atomic fencing", {
				tasks: ["first", "second"],
				noSpecRequiredReason: "fixture",
			});
			startTask(root, { session: created.session, taskId: "T-01" });
			startTask(root, { session: created.session, taskId: "T-02" });
			const taskAttemptSnapshots = {
				"T-01": taskAttemptSnapshot(root, {
					session: created.session,
					taskId: "T-01",
				}),
				"T-02": taskAttemptSnapshot(root, {
					session: created.session,
					taskId: "T-02",
				}),
			};
			let fencingChecks = 0;
			const completion = completeObservedTasks(
				root,
				{
					session: created.session,
					taskIds: ["T-01", "T-02"],
					taskAttemptSnapshots,
					command: "bun --version",
					exitCode: 0,
					approvalContext: defaultOperationContext(),
				},
				{
					fencingCheck: () => {
						fencingChecks += 1;
						if (fencingChecks > 1) {
							throw new Error("late lease loss");
						}
					},
				},
			);

			expect(fencingChecks).toBe(1);
			expect(completion.evidence).toHaveLength(2);
			expect(completion.done).toHaveLength(2);
			const task = readFileSync(created.taskPath, "utf8");
			expect(task).toContain("| T-01 | done |");
			expect(task).toContain("| T-02 | done |");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("batch lifecycle handles the 100-task selector limit in one check", async () => {
		const root = mkRoot("batch-boundary-100");
		const output: string[] = [];
		const originalLog = console.log;
		try {
			const created = newWorkstream(root, "batch boundary 100", {
				tasks: Array.from({ length: 100 }, (_, index) => `task ${index + 1}`),
				noSpecRequiredReason: "fixture",
			});
			const counterPath = join(root, "verification-count.txt");
			const verifierPath = join(root, "verify-once.ts");
			writeFileSync(
				verifierPath,
				[
					'import { existsSync, readFileSync, writeFileSync } from "node:fs";',
					`const path = ${JSON.stringify(counterPath)};`,
					'const count = existsSync(path) ? Number(readFileSync(path, "utf8")) : 0;',
					'writeFileSync(path, String(count + 1), "utf8");',
				].join("\n"),
			);
			console.log = (...values: unknown[]) => output.push(values.join(" "));
			expect(
				await runStartCommand(
					["--session", created.session, "T-01..T-100"],
					root,
				),
			).toBe(0);
			expect(
				await runDoneCommand(
					[
						"--session",
						created.session,
						"T-01..T-100",
						"--test",
						`bun ${verifierPath}`,
					],
					root,
				),
			).toBe(0);

			expect(readFileSync(counterPath, "utf8")).toBe("1");
			const task = readFileSync(created.taskPath, "utf8");
			expect(task.match(/\| T-\d{2,3} \| done \|/g)).toHaveLength(100);
			const evidence = loadEvidenceEntries(created.evidencePath);
			expect(evidence).toHaveLength(100);
			expect(new Set(evidence.map((entry) => entry.id)).size).toBe(100);
			const telemetry = readTelemetryEvents(root).filter(
				(entry) => entry.session_id === created.session,
			);
			expect(
				telemetry.filter((entry) => entry.event_type === "task_start"),
			).toHaveLength(0);
			expect(
				telemetry.filter((entry) => entry.event_type === "task_complete"),
			).toHaveLength(0);
			expect(Buffer.byteLength(output.join("\n"), "utf8")).toBeLessThan(200);
		} finally {
			console.log = originalLog;
			rmSync(root, { recursive: true, force: true });
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
				"bun --version",
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
		for (const label of ["workbench start event"]) {
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
		for (const label of ["workbench done event"]) {
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

	test("appends observed reverification to a closed terminal task without reopening it", () => {
		const root = mkRoot("closed-reverify");
		try {
			const created = newWorkstream(root, "closed reverify", {
				noSpecRequiredReason: "fixture",
			});
			startTask(root, { session: created.session, taskId: "T-01" });
			recordObservedSuccess(root, {
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
			doneTask(root, { session: created.session, taskId: "T-01" });
			closeSession(root, created.session);
			unlinkSync(created.evidencePath);
			const appended = recordClosedTaskReverification(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
				exitCode: 0,
			});
			expect(appended.provenance).toBe("observed");
			expect(isSessionClosed(root, created.session)).toBe(true);
			expect(loadEvidenceEntries(created.evidencePath)).toHaveLength(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("appends observed reverification when existing evidence already passes", () => {
		const root = mkRoot("closed-reverify-existing-evidence");
		try {
			const created = newWorkstream(root, "closed reverify existing evidence", {
				noSpecRequiredReason: "fixture",
			});
			startTask(root, { session: created.session, taskId: "T-01" });
			recordObservedSuccess(root, {
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
			doneTask(root, { session: created.session, taskId: "T-01" });
			closeSession(root, created.session);
			const before = loadEvidenceEntries(created.evidencePath);

			const appended = recordClosedTaskReverification(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test -- closed-reverify-existing-evidence",
				result: "passed",
				exitCode: 0,
			});

			expect(appended.provenance).toBe("observed");
			expect(loadEvidenceEntries(created.evidencePath)).toHaveLength(
				before.length + 1,
			);
			expect(isSessionClosed(root, created.session)).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("refuses reverification for an open task", () => {
		const root = mkRoot("open-reverify");
		try {
			const created = newWorkstream(root, "open reverify", {
				noSpecRequiredReason: "fixture",
			});
			expect(() =>
				recordClosedTaskReverification(root, {
					session: created.session,
					taskId: "T-01",
					command: "bun test",
					result: "passed",
					exitCode: 0,
				}),
			).toThrow("not closed");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("refuses reverification for an archived closed task until restore", () => {
		const root = mkRoot("archived-closed-reverify");
		try {
			const created = newWorkstream(root, "archived closed reverify", {
				noSpecRequiredReason: "fixture",
			});
			startTask(root, { session: created.session, taskId: "T-01" });
			recordObservedSuccess(root, {
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
			doneTask(root, { session: created.session, taskId: "T-01" });
			closeSession(root, created.session);
			unlinkSync(created.evidencePath);
			archiveSessions(root, [created.session], "retention boundary test");

			expect(() =>
				recordClosedTaskReverification(root, {
					session: created.session,
					taskId: "T-01",
					command: "bun test",
					result: "passed",
					exitCode: 0,
				}),
			).toThrow("archived; restore it before reverify");
			expect(existsSync(created.evidencePath)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("refuses a no-op command before closed-task reverification", () => {
		const root = mkRoot("closed-reverify-noop");
		try {
			const created = newWorkstream(root, "closed reverify noop", {
				noSpecRequiredReason: "fixture",
			});
			startTask(root, { session: created.session, taskId: "T-01" });
			recordObservedSuccess(root, {
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
			doneTask(root, { session: created.session, taskId: "T-01" });
			closeSession(root, created.session);
			unlinkSync(created.evidencePath);
			expect(() =>
				recordClosedTaskReverification(root, {
					session: created.session,
					taskId: "T-01",
					command: "true",
					result: "passed",
					exitCode: 0,
				}),
			).toThrow("shell no-op");
			expect(existsSync(created.evidencePath)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("transition admission is policy-bound and stale hashes stop admitting debt", () => {
		const root = mkRoot("transition-admit");
		try {
			const created = newWorkstream(root, "transition admission", {
				noSpecRequiredReason: "fixture",
			});
			startTask(root, { session: created.session, taskId: "T-01" });
			recordObservedSuccess(root, {
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
			doneTask(root, { session: created.session, taskId: "T-01" });
			closeSession(root, created.session);
			const original = loadEvidenceEntries(created.evidencePath)[0];
			writeFileSync(
				created.evidencePath,
				`${JSON.stringify({
					...original,
					id: `${original?.id}-noop`,
					command: "true",
					result: "passed",
					exit_code: 0,
					provenance: "observed",
				})}\n`,
			);
			expect(() =>
				transitionAdmitEvidence(root, {
					sessionId: created.session,
					taskId: "T-01",
					policy: "generic-waiver",
					issue: "https://example.invalid/issues/1",
					approval: "trusted review",
					confirm: false,
				}),
			).toThrow("Unsupported transition policy");
			const admitted = transitionAdmitEvidence(root, {
				sessionId: created.session,
				taskId: "T-01",
				policy: "no-op-evidence-v1",
				issue: "https://example.invalid/issues/1",
				approval: "trusted review",
				confirm: true,
			});
			expect(admitted.written).toBe(true);
			expect(admitted.admission.issue_type).toBe("missing_evidence");
			const issue = verifyWorkbenchTasks(created.sessionDir, true).issues[0];
			if (!issue) throw new Error("fixture must retain missing_evidence");
			expect(
				admitsEvidenceTransitionIssue(root, created.sessionDir, issue, false),
			).toBe(true);
			writeFileSync(
				created.taskPath,
				readFileSync(created.taskPath, "utf8").replace(
					"| T-01 | done |",
					"| T-01 | done | worker | changed |",
				),
			);
			expect(
				admitsEvidenceTransitionIssue(root, created.sessionDir, issue, false),
			).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("transition admission close is opt-in while normal close stays strict", () => {
		const root = mkRoot("transition-admit-close");
		try {
			const created = newWorkstream(root, "transition admission close", {
				noSpecRequiredReason: "fixture",
			});
			startTask(root, { session: created.session, taskId: "T-01" });
			recordObservedSuccess(root, {
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
			doneTask(root, { session: created.session, taskId: "T-01" });
			const originalTask = readFileSync(created.taskPath, "utf8");
			const original = loadEvidenceEntries(created.evidencePath)[0];
			writeFileSync(
				created.evidencePath,
				`${JSON.stringify({
					...original,
					command: "true",
					result: "passed",
					exit_code: 0,
					provenance: "observed",
				})}\n`,
			);

			expect(() => closeSession(root, created.session)).toThrow(
				"failed strict verification",
			);
			const admission = transitionAdmitEvidence(
				root,
				{
					sessionId: created.session,
					taskId: "T-01",
					policy: "no-op-evidence-v1",
					issue: "AFOL-96",
					approval: "approved transition close",
					confirm: true,
				},
				{ allowOpen: true },
			);
			expect(admission.written).toBe(true);
			expect(() => closeSession(root, created.session)).toThrow(
				"failed strict verification",
			);
			const mutatedTask = originalTask.replace(
				"Execute requested lifecycle work.",
				"mutated after admission; Execute requested lifecycle work.",
			);
			expect(mutatedTask).not.toBe(originalTask);
			writeFileSync(created.taskPath, mutatedTask);
			expect(() =>
				closeSession(root, created.session, {
					admitTransitionAdmission: true,
				}),
			).toThrow("failed strict verification");
			writeFileSync(created.taskPath, originalTask);
			closeSession(root, created.session, {
				admitTransitionAdmission: true,
			});
			expect(isSessionClosed(root, created.session)).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
