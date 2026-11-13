import { afterEach, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSessionCommand } from "../commands/session";
import type { OperationContext } from "../core/operation-context";
import { loadCoordinationRadar } from "../services/local-state/coordination-radar";
import {
	collectWorkBenchSnapshot,
	loadWorkBenchIndexSnapshot,
	rebuildWorkBenchIndex,
	validateWorkBenchIndex,
} from "../services/local-state/workbench-index";

import { registerTaskIntent } from "../services/workbench/lifecycle";
import {
	normalizeTaskIntentPaths,
	renderTaskIntentBlock,
} from "../services/workbench/task-intent";

const NOW = new Date("2026-11-13T20:00:00.000Z");
const kernelPath = `${process.cwd()}/cli/main.ts`;
const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

function createProject(name: string): string {
	const root = mkdtempSync(join(tmpdir(), `session-intent-${name}-`));
	roots.push(root);
	mkdirSync(join(root, ".agents"), { recursive: true });
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	writeFileSync(
		join(root, ".agents", "config.json"),
		JSON.stringify({
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
		}),
		"utf8",
	);
	writeFileSync(
		join(root, ".agents", "lock.json"),
		JSON.stringify({ schema_version: 1, locked: true }),
		"utf8",
	);
	return root;
}

function taskPath(root: string, session: string): string {
	return join(root, ".afol", "wb", session, `${session}_task_01.md`);
}

function indexPath(root: string): string {
	return join(root, ".afol", "data", "index", "workbench.json");
}

function writeSession(
	root: string,
	session: string,
	rows: string[],
	options: { status?: string; body?: string[] } = {},
): void {
	mkdirSync(join(root, ".afol", "wb", session), { recursive: true });
	writeFileSync(
		taskPath(root, session),
		[
			"---",
			'doc_type: "workbench_task"',
			`id: "${session}_task_01"`,
			`session_id: "${session}"`,
			`status: "${options.status ?? "active"}"`,
			...(options.status === "closed"
				? [
						'updated_at: "2026-11-13T00:00:00.000Z"',
						'closed_at: "2026-11-13T00:00:00.000Z"',
					]
				: []),
			"---",
			"",
			`# Tasks: ${session}`,
			"",
			"## State Board",
			"",
			"| Task | State | Owner | Notes |",
			"|------|-------|-------|-------|",
			...rows,
			"",
			...(options.body ?? []),
		].join("\n"),
		"utf8",
	);
}

function captureIo() {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		stdout,
		stderr,
		io: {
			stdout: (message: string) => {
				stdout.push(message);
			},
			stderr: (message: string) => {
				stderr.push(message);
			},
		},
	};
}

type Envelope = {
	ok: boolean;
	exit_code: number;
	data?: Record<string, unknown> & {
		changed?: boolean;
		file_intent?: string | null;
		write_paths?: string[];
		read_paths?: string[];
		owner?: string;
	};
	error?: { code: string; message: string };
};

async function intent(
	root: string,
	args: string[],
	ctx?: OperationContext,
): Promise<{ code: number; envelope: Envelope }> {
	const io = captureIo();
	const code = await runSessionCommand(
		"intent",
		[...args, "--json"],
		root,
		io.io,
		ctx,
	);
	return { code, envelope: JSON.parse(io.stdout.join("\n")) as Envelope };
}

function radarWarnings(root: string, id?: string) {
	const radar = loadCoordinationRadar(root, { now: NOW });
	return id
		? radar.warnings.filter((warning) => warning.id === id)
		: radar.warnings;
}

const OVERLAP_IDS = new Set([
	"path_overlap_planned",
	"path_overlap_touched",
	"mutation_overlap",
	"touched_overlap",
]);

function overlapWarnings(root: string) {
	return radarWarnings(root).filter((warning) => OVERLAP_IDS.has(warning.id));
}

function snapshotFiles(root: string, sessions: string[]): string[] {
	return [
		...sessions.map((session) => readFileSync(taskPath(root, session), "utf8")),
		existsSync(indexPath(root)) ? readFileSync(indexPath(root), "utf8") : "",
	];
}

describe("session intent registration", () => {
	test("owner, write and read register under the task and refresh the index", async () => {
		const root = createProject("flow");
		writeSession(root, "261113_alpha", [
			"| T-01 | in_progress | worker | a attempt=1 |",
			"| T-02 | pending | worker | b |",
		]);
		rebuildWorkBenchIndex(root);
		const { code, envelope } = await intent(root, [
			"-S",
			"261113_alpha",
			"T-01",
			"--owner",
			"codex-terra",
			"--write",
			"cli/a.ts",
			"--write",
			"src/**/*.ts",
			"--read",
			"docs/b.md",
		]);
		expect(code).toBe(0);
		expect(envelope.data).toMatchObject({
			changed: true,
			owner: "codex-terra",
			previous_owner: "worker",
			file_intent: "write",
			previous_file_intent: null,
			write_paths: ["cli/a.ts", "src/**/*.ts"],
			read_paths: ["docs/b.md"],
			warnings: [],
		});
		const content = readFileSync(taskPath(root, "261113_alpha"), "utf8");
		expect(content).toContain(
			"| T-01 | in_progress | codex-terra | a attempt=1 |",
		);
		expect(content).toContain("| T-02 | pending | worker | b |");
		expect(content).toContain("## T-01 file intent");
		expect(content).toContain("- File intent: write");

		expect(validateWorkBenchIndex(root).ok).toBe(true);
		const indexed = loadWorkBenchIndexSnapshot(root)?.tasks.find(
			(task) => task.task_id === "T-01",
		);
		expect(indexed?.planned_files.map((claim) => claim.path)).toEqual([
			"cli/a.ts",
			"src/**/*.ts",
		]);
		expect(indexed?.read_files?.map((claim) => claim.path)).toEqual([
			"docs/b.md",
		]);
		expect(indexed?.file_intent).toBe("write");

		const radar = loadCoordinationRadar(root, { now: NOW });
		expect(radar.source.workbench_status).toBe("fresh");
		expect(radar.source.workbench_data).toBe("persisted_index");
		const t01 = radar.open_tasks.find((task) => task.task_id === "T-01");
		expect(t01?.read_files?.map((path) => path.source)).toEqual(["read"]);
		expect(t01?.warning_ids).not.toContain("missing_owner");
		expect(t01?.warning_ids).not.toContain("missing_file_intent");
	});

	test("read-only tasks do not emit missing_file_intent and never claim writes", async () => {
		const root = createProject("read-only");
		writeSession(root, "261113_alpha", [
			"| T-01 | in_progress | reviewer-a | review attempt=1 |",
			"| T-02 | in_progress | reviewer-b | control attempt=1 |",
			"| T-03 | in_progress | reader-c | reads only attempt=1 |",
		]);
		const readOnly = await intent(root, [
			"-S",
			"261113_alpha",
			"T-01",
			"--read-only",
			"--read",
			"cli/shared.ts",
		]);
		expect(readOnly.code).toBe(0);
		expect(readOnly.envelope.data?.file_intent).toBe("read_only");
		const readsOnly = await intent(root, [
			"-S",
			"261113_alpha",
			"T-03",
			"--read",
			"cli/shared.ts",
		]);
		expect(readsOnly.code).toBe(0);

		const missing = radarWarnings(root, "missing_file_intent");
		const flagged = missing.flatMap((warning) =>
			warning.affected_tasks.map((task) => task.task_id),
		);
		// Undeclared control and a reader that never said it will not write.
		expect(flagged.sort()).toEqual(["T-02", "T-03"]);
		const t01 = loadCoordinationRadar(root, { now: NOW }).open_tasks.find(
			(task) => task.task_id === "T-01",
		);
		expect(t01?.planned_files).toEqual([]);
		expect(t01?.touched_files).toEqual([]);
		expect(t01?.read_files?.map((path) => path.path)).toEqual([
			"cli/shared.ts",
		]);
	});

	test("overlapping writers warn, disjoint writers and readers do not", async () => {
		const root = createProject("overlap");
		writeSession(root, "261113_alpha", [
			"| T-01 | in_progress | writer-a | x attempt=1 |",
		]);
		writeSession(root, "261113_beta", [
			"| T-01 | in_progress | writer-b | y attempt=1 |",
			"| T-02 | in_progress | reader-c | z attempt=1 |",
		]);
		await intent(root, ["-S", "261113_alpha", "T-01", "--write", "cli/a.ts"]);
		await intent(root, ["-S", "261113_beta", "T-01", "--write", "cli/b.ts"]);
		await intent(root, [
			"-S",
			"261113_beta",
			"T-02",
			"--read-only",
			"--read",
			"cli/a.ts",
			"--read",
			"cli/b.ts",
		]);
		expect(overlapWarnings(root)).toEqual([]);

		await intent(root, [
			"-S",
			"261113_beta",
			"T-01",
			"--write",
			"cli/b.ts",
			"--write",
			"cli/a.ts",
		]);
		const overlaps = overlapWarnings(root);
		expect(overlaps.map((warning) => warning.id)).toEqual([
			"path_overlap_planned",
		]);
		expect(overlaps[0]?.affected_paths).toEqual(["cli/a.ts"]);
		expect(
			overlaps[0]?.affected_tasks.map(
				(task) => `${task.session}:${task.task_id}`,
			),
		).toEqual(["261113_alpha:T-01", "261113_beta:T-01"]);

		const radarIo = captureIo();
		expect(await runSessionCommand("radar", [], root, radarIo.io)).toBe(0);
		expect(radarIo.stdout.join("\n")).toContain("intent=read_only");
		expect(
			await runSessionCommand("radar", ["--strict"], root, captureIo().io),
		).toBe(0);
	});

	test("replace, clear and idempotent repeats have defined results", async () => {
		const root = createProject("replace");
		writeSession(root, "261113_alpha", [
			"| T-01 | in_progress | worker | x attempt=1 |",
		]);
		const S = ["-S", "261113_alpha", "T-01"];
		await intent(root, [...S, "--write", "cli/a.ts", "--read", "docs/a.md"]);
		const replaced = await intent(root, [...S, "--write", "cli/b.ts"]);
		expect(replaced.envelope.data?.write_paths).toEqual(["cli/b.ts"]);
		expect(replaced.envelope.data?.read_paths).toEqual(["docs/a.md"]);

		const before = readFileSync(taskPath(root, "261113_alpha"), "utf8");
		const repeat = await intent(root, [...S, "--write", "cli/b.ts"]);
		expect(repeat.code).toBe(0);
		expect(repeat.envelope.data?.changed).toBe(false);
		expect(readFileSync(taskPath(root, "261113_alpha"), "utf8")).toBe(before);

		const cleared = await intent(root, [...S, "--clear-write"]);
		expect(cleared.envelope.data).toMatchObject({
			file_intent: null,
			previous_file_intent: "write",
			write_paths: [],
			read_paths: ["docs/a.md"],
		});
		const emptied = await intent(root, [...S, "--clear-read"]);
		expect(emptied.envelope.data?.changed).toBe(true);
		const content = readFileSync(taskPath(root, "261113_alpha"), "utf8");
		expect(content).not.toContain("file intent");
		expect(content).not.toContain("afol:task-intent");
		expect(
			content.endsWith("| T-01 | in_progress | worker | x attempt=1 |\n"),
		).toBe(true);
		expect(loadWorkBenchIndexSnapshot(root)?.tasks[0]?.planned_files).toEqual(
			[],
		);
	});

	test("contradictory declarations are rejected or resolved toward writing", async () => {
		const root = createProject("contradiction");
		writeSession(
			root,
			"261113_alpha",
			[
				"| T-01 | in_progress | owner-a | x attempt=1 |",
				"| T-02 | in_progress | owner-b | y attempt=1 |",
			],
			{ body: ["## T-02 notes", "", "- Files planned:", "  - `cli/hand.ts`"] },
		);
		const S1 = ["-S", "261113_alpha", "T-01"];
		const both = await intent(root, [...S1, "--read-only", "--write", "a.ts"]);
		expect(both.code).toBe(2);
		expect(both.envelope.error?.code).toBe("SESSION_INTENT_CONFLICT");

		await intent(root, [...S1, "--write", "cli/a.ts"]);
		const blocked = await intent(root, [...S1, "--read-only"]);
		expect(blocked.code).toBe(2);
		expect(blocked.envelope.error?.code).toBe("SESSION_INTENT_CONFLICT");
		const allowed = await intent(root, [...S1, "--read-only", "--clear-write"]);
		expect(allowed.code).toBe(0);
		expect(allowed.envelope.data?.file_intent).toBe("read_only");
		const back = await intent(root, [...S1, "--write", "cli/a.ts"]);
		expect(back.envelope.data).toMatchObject({
			file_intent: "write",
			previous_file_intent: "read_only",
		});

		const sameFile = await intent(root, [...S1, "--read", "./cli/a.ts"]);
		expect(sameFile.code).toBe(2);
		expect(sameFile.envelope.error?.code).toBe("SESSION_INTENT_CONFLICT");

		const outside = await intent(root, [
			"-S",
			"261113_alpha",
			"T-02",
			"--read-only",
		]);
		expect(outside.code).toBe(2);
		expect(outside.envelope.error?.message).toContain(
			"outside the managed block",
		);
	});

	test("a hand-edited read-only contradiction stays a writer with a warning", () => {
		const root = createProject("hand-contradiction");
		writeSession(
			root,
			"261113_alpha",
			["| T-01 | in_progress | owner-a | x attempt=1 |"],
			{
				body: [
					"## T-01 notes",
					"",
					"- File intent: read-only",
					"- Files planned:",
					"  - `cli/shared.ts`",
				],
			},
		);
		writeSession(
			root,
			"261113_beta",
			["| T-01 | in_progress | owner-b | y attempt=1 |"],
			{ body: ["## T-01 work", "", "- Files planned:", "  - `cli/shared.ts`"] },
		);
		const warnings = radarWarnings(root);
		expect(
			warnings.some((warning) => warning.id === "contradictory_file_intent"),
		).toBe(true);
		expect(
			warnings.some((warning) => warning.id === "path_overlap_planned"),
		).toBe(true);
		expect(
			warnings.some((warning) => warning.id === "missing_file_intent"),
		).toBe(false);
	});

	test("mixed hand-written intent lines never read as read-only", () => {
		const root = createProject("mixed");
		writeSession(
			root,
			"261113_alpha",
			["| T-01 | in_progress | owner-a | x |"],
			{
				body: [
					"## T-01",
					"",
					"- File intent: read-only",
					"- File intent: write",
				],
			},
		);
		const task = collectWorkBenchSnapshot(root).tasks[0];
		expect(task?.file_intent).toBe("write");
		expect(radarWarnings(root, "missing_file_intent")).toHaveLength(1);
	});
});

describe("session intent rejects invalid input without partial mutation", () => {
	const invalidCases: Array<[string, string[], string]> = [
		["generic owner", ["T-01", "--owner", "worker"], "SESSION_INTENT_INVALID"],
		["owner with space", ["T-01", "--owner", "a b"], "SESSION_INTENT_INVALID"],
		["owner with pipe", ["T-01", "--owner", "a|b"], "SESSION_INTENT_INVALID"],
		["empty owner value", ["T-01", "--owner", ""], "SESSION_PARSE_ERROR"],
		["missing write value", ["T-01", "--write"], "SESSION_PARSE_ERROR"],
		[
			"malformed class",
			["T-01", "--write", "src/[abc"],
			"SESSION_INTENT_INVALID",
		],
		[
			"unbalanced brace",
			["T-01", "--write", "src/{a,b"],
			"SESSION_INTENT_INVALID",
		],
		["extglob", ["T-01", "--write", "src/@(a|b).ts"], "SESSION_INTENT_INVALID"],
		["negation", ["T-01", "--read", "!src/a.ts"], "SESSION_INTENT_INVALID"],
		["bare word", ["T-01", "--write", "Makefile"], "SESSION_INTENT_INVALID"],
		[
			"trailing dot",
			["T-01", "--write", "cli/a.ts."],
			"SESSION_INTENT_INVALID",
		],
		["backtick", ["T-01", "--write", "cli/`a`.ts"], "SESSION_INTENT_INVALID"],
		["newline", ["T-01", "--write", "cli/a.ts\n- x"], "SESSION_INTENT_INVALID"],
		["whitespace", ["T-01", "--write", " cli/a.ts"], "SESSION_INTENT_INVALID"],
		[
			"duplicate spelling",
			["T-01", "--write", "cli/a.ts", "--write", "./cli/a.ts"],
			"SESSION_INTENT_INVALID",
		],
		[
			"duplicate read",
			["T-01", "--read", "docs/", "--read", "docs/"],
			"SESSION_INTENT_INVALID",
		],
		[
			"write and clear",
			["T-01", "--write", "cli/a.ts", "--clear-write"],
			"SESSION_INTENT_INVALID",
		],
		[
			"read and clear",
			["T-01", "--read", "a.md", "--clear-read"],
			"SESSION_INTENT_INVALID",
		],
		["nothing requested", ["T-01"], "SESSION_INTENT_INVALID"],
		["unknown flag", ["T-01", "--writes", "cli/a.ts"], "SESSION_PARSE_ERROR"],
		["two task ids", ["T-01", "T-02", "--owner", "a1"], "SESSION_PARSE_ERROR"],
		["task range", ["T-01..T-02", "--owner", "a1"], "SESSION_PARSE_ERROR"],
		["no task id", ["--owner", "a1"], "SESSION_PARSE_ERROR"],
		["unknown task", ["T-09", "--owner", "a1"], "SESSION_TASK_NOT_FOUND"],
		["done task", ["T-02", "--owner", "a1"], "SESSION_TASK_NOT_OPEN"],
		["moved task", ["T-03", "--write", "cli/a.ts"], "SESSION_TASK_NOT_OPEN"],
	];

	for (const [name, args, code] of invalidCases) {
		test(name, async () => {
			const root = createProject("invalid");
			writeSession(root, "261113_alpha", [
				"| T-01 | in_progress | worker | x attempt=1 |",
				"| T-02 | done | owner-b | finished |",
				"| T-03 | moved | owner-c | moved |",
			]);
			rebuildWorkBenchIndex(root);
			const before = snapshotFiles(root, ["261113_alpha"]);
			const result = await intent(root, ["-S", "261113_alpha", ...args]);
			expect(result.code).toBe(2);
			expect(result.envelope.ok).toBe(false);
			expect(result.envelope.error?.code).toBe(code);
			expect(snapshotFiles(root, ["261113_alpha"])).toEqual(before);
		});
	}

	test("too many paths", async () => {
		const root = createProject("limit");
		writeSession(root, "261113_alpha", ["| T-01 | in_progress | a1 | x |"]);
		const many = Array.from({ length: 101 }, (_v, index) => [
			"--write",
			`cli/f${index}.ts`,
		]).flat();
		const before = snapshotFiles(root, ["261113_alpha"]);
		const result = await intent(root, ["-S", "261113_alpha", "T-01", ...many]);
		expect(result.envelope.error?.code).toBe("SESSION_INTENT_INVALID");
		expect(snapshotFiles(root, ["261113_alpha"])).toEqual(before);
	});

	test("session errors: missing, unknown, unsafe and closed", async () => {
		const root = createProject("sessions");
		writeSession(root, "261113_closed", ["| T-01 | pending | a1 | x |"], {
			status: "closed",
		});
		const before = snapshotFiles(root, ["261113_closed"]);
		const cases: Array<[string[], string]> = [
			[["T-01", "--owner", "a1"], "SESSION_MISSING_ARG"],
			[["-S", "261113_nope", "T-01", "--owner", "a1"], "SESSION_NOT_FOUND"],
			[["-S", "../escape", "T-01", "--owner", "a1"], "SESSION_PARSE_ERROR"],
			[["-S", "261113_closed", "T-01", "--owner", "a1"], "SESSION_CLOSED"],
		];
		for (const [args, code] of cases) {
			const result = await intent(root, args);
			expect(result.code).toBe(2);
			expect(result.envelope.error?.code).toBe(code);
		}
		expect(snapshotFiles(root, ["261113_closed"])).toEqual(before);
		expect(existsSync(join(root, ".afol", "wb", "261113_nope"))).toBe(false);
	});

	test("a damaged managed block is reported, never rewritten", async () => {
		const root = createProject("damaged");
		writeSession(root, "261113_alpha", ["| T-01 | in_progress | a1 | x |"], {
			body: ["## T-01 file intent", "", "- Files planned:", "  - `cli/a.ts`"],
		});
		const before = snapshotFiles(root, ["261113_alpha"]);
		const result = await intent(root, [
			"-S",
			"261113_alpha",
			"T-01",
			"--write",
			"b.ts",
		]);
		expect(result.envelope.error?.code).toBe("SESSION_INTENT_MALFORMED");
		expect(snapshotFiles(root, ["261113_alpha"])).toEqual(before);
	});

	test("restricted callers need local approval", async () => {
		const root = createProject("approval");
		writeSession(root, "261113_alpha", ["| T-01 | in_progress | worker | x |"]);
		const before = snapshotFiles(root, ["261113_alpha"]);
		const result = await intent(
			root,
			["-S", "261113_alpha", "T-01", "--owner", "a1"],
			{
				callerType: "agent",
				interactive: false,
				trustLevel: "restricted",
			},
		);
		expect(result.envelope.error?.code).toBe("SESSION_APPROVAL_REQUIRED");
		expect(snapshotFiles(root, ["261113_alpha"])).toEqual(before);
	});
});

describe("session intent index compatibility", () => {
	test("undeclared tasks keep the previous index task shape", () => {
		const root = createProject("shape");
		writeSession(root, "261113_alpha", ["| T-01 | in_progress | a1 | x |"], {
			body: ["## T-01", "", "- Files planned:", "  - `cli/a.ts`"],
		});
		const task = collectWorkBenchSnapshot(root).tasks[0] ?? {};
		expect(Object.keys(task)).toEqual([
			"session",
			"task_id",
			"state",
			"owner",
			"notes",
			"file",
			"line",
			"touched_at",
			"planned_files",
			"touched_files",
		]);
	});

	test("an index without the new fields stays fresh when nothing is declared", () => {
		const root = createProject("old-fresh");
		writeSession(root, "261113_alpha", ["| T-01 | in_progress | a1 | x |"]);
		rebuildWorkBenchIndex(root);
		expect(readFileSync(indexPath(root), "utf8")).not.toContain("read_files");
		expect(validateWorkBenchIndex(root).ok).toBe(true);
	});

	test("an older index for a declared task reads as stale, not complete", async () => {
		const root = createProject("old-stale");
		writeSession(root, "261113_alpha", ["| T-01 | in_progress | a1 | x |"]);
		await intent(root, [
			"-S",
			"261113_alpha",
			"T-01",
			"--read-only",
			"--read",
			"docs/a.md",
		]);
		// Emulate an index written by a version that drops the new fields.
		const index = JSON.parse(readFileSync(indexPath(root), "utf8")) as {
			tasks: Record<string, unknown>[];
		};
		for (const task of index.tasks) {
			delete task.read_files;
			delete task.file_intent;
		}
		writeFileSync(indexPath(root), `${JSON.stringify(index)}\n`, "utf8");
		expect(validateWorkBenchIndex(root).ok).toBe(false);
		const radar = loadCoordinationRadar(root, { now: NOW });
		expect(radar.source.workbench_status).toBe("stale");
		expect(radar.source.workbench_data).toBe("live_collection");
		expect(radar.open_tasks[0]?.file_intent).toBe("read_only");
		expect(
			radar.warnings.some((warning) => warning.id === "missing_file_intent"),
		).toBe(false);
	});

	test("malformed new fields invalidate the index instead of being trusted", async () => {
		const root = createProject("bad-fields");
		writeSession(root, "261113_alpha", ["| T-01 | in_progress | a1 | x |"]);
		await intent(root, ["-S", "261113_alpha", "T-01", "--read", "docs/a.md"]);
		const original = readFileSync(indexPath(root), "utf8");
		for (const mutate of [
			(text: string) => text.replace('"source":"read"', '"source":"planned"'),
			(text: string) =>
				text.replace('"read_files":[', '"file_intent":"maybe","read_files":['),
		]) {
			writeFileSync(indexPath(root), mutate(original), "utf8");
			expect(loadWorkBenchIndexSnapshot(root)).toBeNull();
			expect(
				loadCoordinationRadar(root, { now: NOW }).source.workbench_status,
			).toBe("invalid");
		}
	});
});

type ProcResult = { code: number | null; stdout: string; stderr: string };

function run(cwd: string, args: string[]): Promise<ProcResult> {
	return new Promise((resolve, reject) => {
		const proc = spawn("bun", [kernelPath, ...args], {
			cwd,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		proc.stdout.setEncoding("utf8");
		proc.stderr.setEncoding("utf8");
		proc.stdout.on("data", (chunk: string) => {
			stdout += chunk;
		});
		proc.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});
		proc.on("error", reject);
		proc.on("close", (code) => resolve({ code, stdout, stderr }));
	});
}

function boardState(root: string, session: string, taskId: string): string[] {
	const row = readFileSync(taskPath(root, session), "utf8")
		.split("\n")
		.find((line) => line.startsWith(`| ${taskId} |`));
	return (row ?? "").split("|").map((cell) => cell.trim());
}

describe("session intent CLI end to end", () => {
	test("real CLI registers, radar sees it, and errors exit 2", async () => {
		const root = createProject("cli");
		writeSession(root, "261113_alpha", [
			"| T-01 | in_progress | worker | x attempt=1 |",
			"| T-02 | in_progress | worker | y attempt=1 |",
		]);
		const write = await run(root, [
			"session",
			"intent",
			"-S",
			"261113_alpha",
			"T-01",
			"--owner",
			"terra-1",
			"--write",
			"cli/a.ts",
		]);
		expect(write.code).toBe(0);
		expect(write.stdout).toContain("task intent registered: 261113_alpha T-01");
		expect(write.stdout).toContain("grant no authority");
		const read = await run(root, [
			"session",
			"intent",
			"--session",
			"261113_alpha",
			"--task-id",
			"T-02",
			"--owner",
			"sol-2",
			"--read-only",
			"--read",
			"cli/a.ts",
			"--json",
		]);
		expect(read.code).toBe(0);
		expect((JSON.parse(read.stdout) as Envelope).data?.file_intent).toBe(
			"read_only",
		);
		const radar = await run(root, ["session", "radar", "--json"]);
		expect(radar.code).toBe(0);
		const parsed = JSON.parse(radar.stdout) as {
			data: {
				warnings: { id: string }[];
				tasks: { task_id: string; file_intent?: string; owner: string }[];
			};
		};
		expect(parsed.data.warnings.map((warning) => warning.id)).toEqual([]);
		expect(
			parsed.data.tasks.map((task) => [
				task.task_id,
				task.owner,
				task.file_intent,
			]),
		).toEqual([
			["T-01", "terra-1", "write"],
			["T-02", "sol-2", "read_only"],
		]);
		const bad = await run(root, [
			"session",
			"intent",
			"-S",
			"261113_alpha",
			"T-01",
			"--owner",
			"agent",
		]);
		expect(bad.code).toBe(2);
		expect(bad.stderr).toContain("generic defaults are not concrete owners");
	});

	test("concurrent registration, lifecycle transitions and rebuilds keep every change", async () => {
		const root = createProject("concurrency");
		const session = "261113_alpha";
		writeSession(root, session, [
			"| T-01 | in_progress | worker | one attempt=1 |",
			"| T-02 | pending | worker | two |",
			"| T-03 | in_progress | worker | three attempt=1 |",
		]);
		rebuildWorkBenchIndex(root);
		const rounds = 20;
		for (let round = 0; round < rounds; round += 1) {
			const lifecycle =
				round % 2 === 0
					? ["st", "-S", session, "T-02"]
					: [
							"tr",
							"-S",
							session,
							"T-02",
							"--state",
							"problem",
							"--reason",
							`round ${round}`,
						];
			const results = await Promise.all([
				run(root, [
					"session",
					"intent",
					"-S",
					session,
					"T-01",
					"--owner",
					`writer-${round}`,
					"--write",
					`cli/round-${round}.ts`,
				]),
				run(root, lifecycle),
				run(root, [
					"session",
					"intent",
					"-S",
					session,
					"T-03",
					"--read-only",
					"--read",
					`docs/round-${round}.md`,
				]),
				run(root, ["local-state", "rebuild"]),
			]);
			for (const result of results) {
				expect({ code: result.code, stderr: result.stderr }).toEqual({
					code: 0,
					stderr: "",
				});
			}
			expect(boardState(root, session, "T-01")[3]).toBe(`writer-${round}`);
			expect(boardState(root, session, "T-02")[2]).toBe(
				round % 2 === 0 ? "in_progress" : "problem",
			);
			const content = readFileSync(taskPath(root, session), "utf8");
			expect(content).toContain(`  - \`cli/round-${round}.ts\``);
			expect(content).toContain(`  - \`docs/round-${round}.md\``);
			expect(content).not.toContain(`round-${round - 1}.`);
			const indexed = loadWorkBenchIndexSnapshot(root)?.tasks ?? [];
			expect(
				indexed
					.find((task) => task.task_id === "T-01")
					?.planned_files.map((claim) => claim.path),
			).toEqual([`cli/round-${round}.ts`]);
			expect(
				indexed
					.find((task) => task.task_id === "T-03")
					?.read_files?.map((claim) => claim.path),
			).toEqual([`docs/round-${round}.md`]);
			const radar = loadCoordinationRadar(root, { now: NOW });
			expect(
				radar.open_tasks
					.find((task) => task.task_id === "T-01")
					?.planned_files.map((path) => path.path),
			).toEqual([`cli/round-${round}.ts`]);
			expect(
				radar.open_tasks.find((task) => task.task_id === "T-02")?.state,
			).toBe(round % 2 === 0 ? "in_progress" : "problem");
		}
		const attempts = boardState(root, session, "T-02")[4] ?? "";
		expect(attempts).toContain(`attempt=${rounds}`);
	}, 240_000);
});

describe("session intent r3 review regressions", () => {
	const S = "261113_alpha";
	const row = "| T-01 | in_progress | original-owner | x attempt=1 |";
	const block = () =>
		renderTaskIntentBlock("T-01", {
			file_intent: "write",
			write: ["src/old.ts"],
			read: [],
		});
	for (const [name, opening, closing] of [
		["backtick", "```markdown", "```"],
		["tilde", "~~~markdown", "~~~"],
		["long backtick", "````markdown", "`````"],
		["long tilde", "~~~~markdown", "~~~~~"],
		["indented", "   ```markdown", "   ```   "],
		["indented tilde", "  ~~~~markdown", " ~~~~\t"],
		["short inner closer", "````markdown", "```\n~~~\n````"],
		["nonclosing suffix", "~~~markdown", "~~~not-close\n~~~"],
	] as const) {
		test(`preserves fenced example and indexes real claims: ${name}`, async () => {
			const root = createProject("r3-fence");
			const example = [opening, ...block(), closing].join("\n");
			writeSession(root, S, [row], { body: ["## T-01 usage", example] });
			const r = await intent(root, [
				"-S",
				S,
				"T-01",
				"--owner",
				"updated-owner",
				"--write",
				"src/new.ts",
				"--read",
				"docs/read.md",
			]);
			expect(r.code).toBe(0);
			expect(readFileSync(taskPath(root, S), "utf8")).toContain(example);
			const t = collectWorkBenchSnapshot(root).tasks[0];
			expect(t?.owner).toBe("updated-owner");
			expect(t?.planned_files.map((c) => c.path)).toEqual(["src/new.ts"]);
			expect(t?.read_files?.map((c) => c.path)).toEqual(["docs/read.md"]);
			expect(validateWorkBenchIndex(root).ok).toBe(true);
		});
	}
	for (const opening of ["```markdown", "~~~", "````\n```", "   ~~~~\n~~~"]) {
		test(`unclosed fence rejects unreadable intent without owner/index mutation: ${JSON.stringify(opening)}`, async () => {
			const root = createProject("r3-unclosed");
			writeSession(root, S, [row], { body: [opening, ...block()] });
			rebuildWorkBenchIndex(root);
			const before = snapshotFiles(root, [S]);
			const r = await intent(root, [
				"-S",
				S,
				"T-01",
				"--owner",
				"updated-owner",
				"--write",
				"src/new.ts",
			]);
			expect(r.envelope.error?.code).toBe("SESSION_INTENT_MALFORMED");
			expect(snapshotFiles(root, [S])).toEqual(before);
		});
	}
	for (const [name, body] of [
		["orphan begin", block().slice(2, -1)],
		["orphan end", [block().at(-1) ?? ""]],
		["extra begin", [...block(), block()[2] ?? ""]],
		["extra end", [...block(), block().at(-1) ?? ""]],
		["preceding begin", [block()[2] ?? "", ...block()]],
		["preceding end", [block().at(-1) ?? "", ...block()]],
		["duplicate", [...block(), ...block()]],
		[
			"damaged marker",
			block().map((l) => l.replace("written by afol", "edited by afol")),
		],
	] as const) {
		test(`validates all markers before owner-only mutation: ${name}`, async () => {
			const root = createProject("r3-marker");
			writeSession(root, S, [row], { body: [...body] });
			rebuildWorkBenchIndex(root);
			const before = snapshotFiles(root, [S]);
			const r = await intent(root, [
				"-S",
				S,
				"T-01",
				"--owner",
				"updated-owner",
			]);
			expect(r.envelope.error?.code).toBe("SESSION_INTENT_MALFORMED");
			expect(snapshotFiles(root, [S])).toEqual(before);
		});
	}
	test("fenced orphan markers and unrelated prose survive replacement", async () => {
		const root = createProject("r3-unrelated");
		const prose = [
			"A prose mention: <!-- afol:task-intent T-01 -->",
			"~~~",
			block()[2] ?? "",
			"~~~",
			"<!-- afol:task-intent T-02: other task -->",
		].join("\n");
		writeSession(root, S, [row], { body: [...block(), prose] });
		const r = await intent(root, ["-S", S, "T-01", "--write", "src/new.ts"]);
		expect(r.code).toBe(0);
		expect(readFileSync(taskPath(root, S), "utf8")).toContain(prose);
	});
	for (const [root, paths] of [
		["/workspace/project", ["D:/Repo/src/A.ts", "/mnt/d/repo/src/a.ts"]],
		["/mnt/x/Repo", ["src/A.ts", "X:/repo/src/a.ts"]],
	] as const) {
		test(`canonical duplicate identity: ${root}`, () => {
			expect(() => normalizeTaskIntentPaths(root, paths, "--write")).toThrow(
				"Duplicate",
			);
		});
	}
	test("Linux case stays distinct and display spelling survives", async () => {
		const root = createProject("r3-case");
		writeSession(root, S, [row]);
		const paths = ["src/A.ts", "src/a.ts", "D:/Repo/Other.ts"];
		const r = await intent(root, [
			"-S",
			S,
			"T-01",
			...paths.flatMap((p) => ["--write", p]),
		]);
		expect(r.code).toBe(0);
		expect(r.envelope.data?.write_paths).toEqual(paths);
	});
	test("drive read/write conflict rejects before any persistent mutation", async () => {
		const root = createProject("r3-alias-conflict");
		writeSession(root, S, [row]);
		rebuildWorkBenchIndex(root);
		const before = snapshotFiles(root, [S]);
		const r = await intent(root, [
			"-S",
			S,
			"T-01",
			"--owner",
			"updated-owner",
			"--write",
			"D:/Repo/A.ts",
			"--read",
			"/mnt/d/repo/a.ts",
		]);
		expect(r.envelope.error?.code).toBe("SESSION_INTENT_CONFLICT");
		expect(snapshotFiles(root, [S])).toEqual(before);
	});
	test("refresh failure repeats warn; recovery refreshes without task write; fresh retry changes no digests", () => {
		const root = createProject("r3-refresh");
		writeSession(root, S, [row]);
		rebuildWorkBenchIndex(root);
		const request = {
			session: S,
			taskId: "T-01",
			owner: "updated-owner",
			write: ["src/new.ts"],
		};
		const fail = {
			beforeAuxiliary: () => {
				throw Error("r3 injected refresh failure");
			},
		};
		const first = registerTaskIntent(root, request, fail);
		expect(first.changed).toBe(true);
		expect(first.warnings).toHaveLength(1);
		const before = snapshotFiles(root, [S]);
		const taskStat = statSync(taskPath(root, S));
		const repeat = registerTaskIntent(root, request, fail);
		expect(repeat.changed).toBe(false);
		expect(repeat.warnings).toHaveLength(1);
		expect(validateWorkBenchIndex(root).ok).toBe(false);
		expect(snapshotFiles(root, [S])).toEqual(before);
		const recovered = registerTaskIntent(root, request);
		expect(recovered.changed).toBe(false);
		expect(recovered.warnings).toEqual([]);
		expect(validateWorkBenchIndex(root).ok).toBe(true);
		expect(statSync(taskPath(root, S)).mtimeMs).toBe(taskStat.mtimeMs);
		const fresh = snapshotFiles(root, [S]);
		expect(registerTaskIntent(root, request).changed).toBe(false);
		expect(snapshotFiles(root, [S])).toEqual(fresh);
	});
	test("extensionless recovery hint gives proven absolute workaround", async () => {
		const root = createProject("r3-makefile");
		writeSession(root, S, [row]);
		const bad = await intent(root, ["-S", S, "T-01", "--write", "Makefile"]);
		expect(bad.envelope.error?.message).not.toContain("./name");
		expect(bad.envelope.error?.message).toContain("absolute path");
		const r = await intent(root, [
			"-S",
			S,
			"T-01",
			"--write",
			join(root, "Makefile"),
		]);
		expect(r.code).toBe(0);
		expect(
			collectWorkBenchSnapshot(root).tasks[0]?.planned_files[0]?.path,
		).toBe(join(root, "Makefile"));
	});
});
