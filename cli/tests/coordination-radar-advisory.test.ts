import { afterEach, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	runSessionCommand,
	setCoordinationRadarReaderForTests,
} from "../commands/session";
import {
	buildCoordinationRadar,
	type CoordinationRadarSnapshot,
	type CoordinationWarning,
	compareCoordinationClaims,
	loadCoordinationRadar,
} from "../services/local-state/coordination-radar";
import { appendWorkbenchEvent } from "../services/local-state/workbench-events";
import {
	rebuildWorkBenchIndex,
	type WorkbenchIndexSnapshot,
	type WorkbenchIndexTask,
} from "../services/local-state/workbench-index";
import type { MutationRecord } from "../services/mutations/journal";

const NOW = new Date("2026-06-18T18:00:00.000Z");
const GLOB_TOKEN_RE = /[*?[\]{}]/;
const roots: string[] = [];

type TaskInput = {
	owner?: string;
	state?: string;
	planned?: string[];
	touched?: string[];
};

function tempRoot(name: string): string {
	const root = mkdtempSync(join(tmpdir(), `radar-advisory-${name}-`));
	roots.push(root);
	return root;
}

afterEach(() => {
	setCoordinationRadarReaderForTests(null);
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

function claims(
	paths: string[] | undefined,
	source: "planned" | "touched",
): WorkbenchIndexTask["planned_files"] {
	return (paths ?? []).map((path, index) => ({
		path,
		kind: GLOB_TOKEN_RE.test(path) ? "glob" : "exact",
		source,
		line: index + 1,
	}));
}

function task(
	session: string,
	taskId: string,
	input: TaskInput = {},
): WorkbenchIndexTask {
	return {
		session,
		task_id: taskId,
		state: input.state ?? "in_progress",
		owner: input.owner ?? `${session}-owner`,
		notes: "",
		file: `.afol/wb/${session}/${session}_task_01.md`,
		line: 1,
		touched_at: NOW.toISOString(),
		planned_files: claims(input.planned, "planned"),
		touched_files: claims(input.touched, "touched"),
	};
}

function snapshot(tasks: WorkbenchIndexTask[]): WorkbenchIndexSnapshot {
	const sessions = [...new Set(tasks.map((entry) => entry.session))];
	return {
		kind: "workbench_index_v1",
		version: 1,
		generated_at: NOW.toISOString(),
		source: { wb_dir: ".afol/wb", event_log: ".afol/data/events.jsonl" },
		sessions: sessions.map((session) => ({
			session,
			task_count: tasks.filter((entry) => entry.session === session).length,
			completed: 0,
			open: 1,
			problem: 0,
			touched_at: NOW.toISOString(),
		})),
		tasks,
	};
}

function radar(
	tasks: WorkbenchIndexTask[],
	options: { root?: string; mutations?: MutationRecord[] } = {},
): CoordinationRadarSnapshot {
	return buildCoordinationRadar(options.root ?? tempRoot("unit"), {
		now: NOW,
		workbench: snapshot(tasks),
		workbenchStatus: { ok: true, message: "ok workbench index snapshot" },
		mutations: options.mutations ?? [],
	});
}

function warningsWith(
	result: CoordinationRadarSnapshot,
	id: string,
): CoordinationWarning[] {
	return result.warnings.filter((warning) => warning.id === id);
}

function overlapWarnings(
	result: CoordinationRadarSnapshot,
): CoordinationWarning[] {
	return result.warnings.filter(
		(warning) =>
			warning.id.startsWith("path_overlap") ||
			warning.id === "mutation_overlap" ||
			warning.id === "touched_overlap",
	);
}

function mutation(
	session: string,
	taskId: string,
	sourcePath: string,
	id = `M-${session}-${taskId}`,
): MutationRecord {
	return {
		id,
		ts: NOW.toISOString(),
		kind: "patch",
		status: "applied",
		dryRun: false,
		session,
		taskId,
		reason: "fixture",
		sourcePath,
		afterHash: "after",
	};
}

function writeTaskFile(
	root: string,
	session: string,
	rows: string[],
	claimsBlock: string[] = [],
): void {
	const dir = join(root, ".afol", "wb", session);
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, `${session}_task_01.md`),
		[
			`# Tasks: ${session}`,
			"",
			"## State Board",
			"",
			"| Task | State | Owner | Notes |",
			"|------|-------|-------|-------|",
			...rows,
			"",
			...claimsBlock,
		].join("\n"),
		"utf8",
	);
}

function plannedBlock(taskId: string, paths: string[]): string[] {
	return [
		"## Coordination Claims",
		"",
		`### ${taskId} Work`,
		"",
		"- Files planned:",
		...paths.map((path) => `  - \`${path}\``),
	];
}

function createProjectRoot(name: string): string {
	const root = tempRoot(name);
	mkdirSync(join(root, ".agents"), { recursive: true });
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	writeFileSync(
		join(root, ".agents", "config.json"),
		JSON.stringify({ schema_version: 1, project: { name } }),
		"utf8",
	);
	writeFileSync(
		join(root, ".agents", "lock.json"),
		JSON.stringify({ schema_version: 1, locked: true }),
		"utf8",
	);
	return root;
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

describe("coordination radar overlap semantics", () => {
	test("disjoint writers produce no overlap warnings", () => {
		const result = radar([
			task("260618_a", "T-01", { planned: ["cli/a.ts"] }),
			task("260618_b", "T-01", {
				planned: ["cli/b.ts"],
				touched: ["cli/c.ts"],
			}),
		]);
		expect(overlapWarnings(result)).toEqual([]);
	});

	test("exact planned overlap is reported for both tasks", () => {
		const result = radar([
			task("260618_a", "T-01", { planned: ["cli/shared.ts"] }),
			task("260618_b", "T-01", { planned: ["cli/shared.ts"] }),
		]);
		const [warning] = warningsWith(result, "path_overlap_planned");
		expect(warning?.affected_tasks).toEqual([
			{ session: "260618_a", task_id: "T-01" },
			{ session: "260618_b", task_id: "T-01" },
		]);
		expect(warning?.affected_paths).toEqual(["cli/shared.ts"]);
	});

	test("planned versus another task's touched path stays critical", () => {
		const result = radar([
			task("260618_a", "T-01", { planned: ["cli/shared.ts"] }),
			task("260618_b", "T-01", { touched: ["cli/shared.ts"] }),
		]);
		expect(warningsWith(result, "path_overlap_touched")[0]?.severity).toBe(
			"critical",
		);
	});

	test("touched-only overlap between open tasks is reported", () => {
		const result = radar([
			task("260618_a", "T-01", { touched: ["cli/shared.ts"] }),
			task("260618_b", "T-01", { touched: ["cli/shared.ts"] }),
		]);
		const warnings = warningsWith(result, "touched_overlap");
		expect(warnings).toHaveLength(1);
		expect(warnings[0]?.severity).toBe("critical");
		expect(warnings[0]?.source).toBe("workbench");
	});

	test("mutation-only overlap between open tasks is reported", () => {
		const result = radar(
			[
				task("260618_a", "T-01", { planned: ["docs/a.md"] }),
				task("260618_b", "T-01", { planned: ["docs/b.md"] }),
			],
			{
				mutations: [
					mutation("260618_a", "T-01", "cli/shared.ts"),
					mutation("260618_b", "T-01", "cli/shared.ts"),
				],
			},
		);
		const warnings = warningsWith(result, "touched_overlap");
		expect(warnings).toHaveLength(1);
		expect(warnings[0]?.source).toBe("mutation_journal");
	});

	test("readers and non-writers never become overlap conflicts", () => {
		const result = radar([
			task("260618_a", "T-01", { planned: ["cli/shared.ts"] }),
			task("260618_review", "T-01", { state: "pending" }),
			task("260618_review", "T-02", { state: "in_progress" }),
		]);
		expect(overlapWarnings(result)).toEqual([]);
		expect(
			result.warnings.some((warning) => warning.severity === "critical"),
		).toBe(false);
		const intent = warningsWith(result, "missing_file_intent");
		expect(intent.map((warning) => warning.affected_tasks)).toEqual([
			[{ session: "260618_review", task_id: "T-02" }],
		]);
	});
});

describe("coordination radar path identity", () => {
	test("Windows drive and WSL mount aliases overlap", () => {
		const result = radar([
			task("260618_a", "T-01", {
				planned: ["D:/work/Game/Source/Hero.cpp"],
			}),
			task("260618_b", "T-01", {
				planned: ["/mnt/d/work/Game/Source/Hero.cpp"],
			}),
			task("260618_c", "T-01", {
				planned: ["D:\\work\\Game\\Source\\Hero.cpp"],
			}),
		]);
		const warnings = warningsWith(result, "path_overlap_planned");
		expect(warnings).toHaveLength(3);
		expect(warnings[0]?.affected_paths).toContain(
			"/mnt/d/work/Game/Source/Hero.cpp",
		);
	});

	test("drive paths fold case while Linux paths stay case-sensitive", () => {
		const result = radar([
			task("260618_a", "T-01", {
				planned: ["D:/Work/Game/Hero.cpp", "src/Foo.ts"],
			}),
			task("260618_b", "T-01", {
				planned: ["/mnt/d/work/game/hero.cpp", "src/foo.ts"],
			}),
		]);
		const warnings = warningsWith(result, "path_overlap_planned");
		expect(warnings).toHaveLength(1);
		expect(warnings[0]?.affected_paths).not.toContain("src/Foo.ts");
		expect(warnings[0]?.affected_paths).not.toContain("src/foo.ts");
	});

	test("distinct Linux absolute paths outside the project do not alias", () => {
		const result = radar([
			task("260618_a", "T-01", { planned: ["/srv/repo-a/Source/x.cpp"] }),
			task("260618_b", "T-01", { planned: ["/srv/repo-b/Source/x.cpp"] }),
			task("260618_c", "T-01", { planned: ["Source/x.cpp"] }),
		]);
		expect(overlapWarnings(result)).toEqual([]);
		const external = result.open_tasks.find(
			(entry) => entry.session === "260618_a",
		)?.planned_files[0];
		expect(external?.scope).toBe("external");
		const local = result.open_tasks.find(
			(entry) => entry.session === "260618_c",
		)?.planned_files[0];
		expect(local?.scope).toBe("project");
	});

	test("absolute in-project globs and parent-relative paths are normalized", () => {
		const root = tempRoot("normalize");
		const result = radar(
			[
				task("260618_a", "T-01", { planned: [`${root}/cli/**`] }),
				task("260618_b", "T-01", { planned: ["cli/deep/a.ts"] }),
				task("260618_c", "T-01", { planned: ["../sibling/x.ts"] }),
				task("260618_d", "T-01", {
					planned: [join(root, "..", "sibling", "x.ts")],
				}),
			],
			{ root },
		);
		const planned = warningsWith(result, "path_overlap_planned");
		expect(
			planned.map((warning) =>
				warning.affected_tasks.map((entry) => entry.session),
			),
		).toEqual([
			["260618_a", "260618_b"],
			["260618_c", "260618_d"],
		]);
	});
});

describe("coordination radar glob support", () => {
	test("brace, class and zero-depth globstar patterns match exact files", () => {
		const result = radar([
			task("260618_a", "T-01", { planned: ["src/{alpha,beta}.ts"] }),
			task("260618_b", "T-01", { planned: ["src/beta.ts"] }),
			task("260618_c", "T-01", { planned: ["lib/[xy].ts"] }),
			task("260618_d", "T-01", { planned: ["lib/y.ts"] }),
			task("260618_e", "T-01", { planned: ["docs/**/index.md"] }),
			task("260618_f", "T-01", { planned: ["docs/index.md"] }),
		]);
		const pairs = warningsWith(result, "path_overlap_planned").map((warning) =>
			warning.affected_tasks.map((entry) => entry.session).join("+"),
		);
		expect(pairs).toEqual([
			"260618_a+260618_b",
			"260618_c+260618_d",
			"260618_e+260618_f",
		]);
	});

	test("literal bracket paths still match themselves", () => {
		const result = radar([
			task("260618_a", "T-01", { planned: ["app/[id]/page.tsx"] }),
			task("260618_b", "T-01", { planned: ["app/[id]/page.tsx"] }),
		]);
		expect(warningsWith(result, "path_overlap_planned")).toHaveLength(1);
	});

	test("glob stems compare whole path segments", () => {
		const result = radar([
			task("260618_a", "T-01", { planned: ["cli/a/*.ts"] }),
			task("260618_b", "T-01", { planned: ["cli/ab/*.ts"] }),
		]);
		expect(overlapWarnings(result)).toEqual([]);
	});

	test("glob versus glob is a possible overlap that never escalates to critical", () => {
		const result = radar([
			task("260618_a", "T-01", { planned: ["cli/services/**/*.ts"] }),
			task("260618_b", "T-01", { touched: ["cli/services/local-state/*.ts"] }),
		]);
		const [warning] = warningsWith(result, "path_overlap_touched");
		expect(warning?.overlap).toBe("possible");
		expect(warning?.severity).toBe("warning");
	});

	test("confirmed glob versus exact overlap is labeled confirmed", () => {
		const result = radar([
			task("260618_a", "T-01", { planned: ["cli/services/**/*.ts"] }),
			task("260618_b", "T-01", { touched: ["cli/services/radar.ts"] }),
		]);
		const [warning] = warningsWith(result, "path_overlap_touched");
		expect(warning?.overlap).toBe("confirmed");
		expect(warning?.severity).toBe("critical");
	});

	test("directory claims with a trailing slash cover nested files", () => {
		const result = radar([
			task("260618_a", "T-01", { planned: ["cli/services/"] }),
			task("260618_b", "T-01", { planned: ["cli/services/radar.ts"] }),
			task("260618_c", "T-01", { planned: ["cli/servicesx.ts"] }),
		]);
		const warnings = warningsWith(result, "path_overlap_planned");
		expect(warnings).toHaveLength(1);
		expect(warnings[0]?.affected_paths).toEqual([
			"cli/services/",
			"cli/services/radar.ts",
		]);
	});

	test("globs and directory claims overlap by segment containment", () => {
		const result = radar([
			task("260618_a", "T-01", { planned: ["cli/"] }),
			task("260618_b", "T-01", { planned: ["cli/services/*.ts"] }),
			task("260618_c", "T-01", { planned: ["docs/guides/"] }),
			task("260618_d", "T-01", { planned: ["docs/*/index.md"] }),
		]);
		const byPair = new Map(
			warningsWith(result, "path_overlap_planned").map((warning) => [
				warning.affected_tasks.map((entry) => entry.session).join("+"),
				warning.overlap,
			]),
		);
		expect(byPair).toEqual(
			new Map([
				["260618_a+260618_b", "confirmed"],
				["260618_c+260618_d", "possible"],
			]),
		);
	});

	test("unsupported patterns are reported instead of silently compared", () => {
		const result = radar([
			task("260618_a", "T-01", { planned: ["src/@(alpha|beta).ts"] }),
			task("260618_b", "T-01", { planned: ["src/alpha.ts"] }),
			task("260618_c", "T-01", { planned: ["!src/*.ts"] }),
		]);
		expect(overlapWarnings(result)).toEqual([]);
		const [unsupported] = warningsWith(result, "unsupported_path_pattern");
		expect(unsupported?.severity).toBe("info");
		expect(unsupported?.affected_paths).toEqual([
			"!src/*.ts",
			"src/@(alpha|beta).ts",
		]);
		expect(
			result.open_tasks.find((entry) => entry.session === "260618_a")
				?.planned_files[0]?.kind,
		).toBe("unsupported");
	});
});

describe("coordination radar owner identity", () => {
	test("default worker owner is reported as missing identity without hand-edit advice", () => {
		const result = radar([
			task("260618_a", "T-01", { owner: "worker", planned: ["a.ts"] }),
			task("260618_b", "T-01", { owner: "agent", planned: ["b.ts"] }),
			task("260618_c", "T-01", { owner: "alice", planned: ["c.ts"] }),
		]);
		const warnings = warningsWith(result, "missing_owner");
		expect(warnings).toHaveLength(1);
		expect(warnings[0]?.affected_tasks.map((entry) => entry.session)).toEqual([
			"260618_a",
			"260618_b",
		]);
		expect(warnings[0]?.recovery_hint.toLowerCase()).toContain(
			"do not hand-edit",
		);
	});

	test("same generic owner does not suppress overlap", () => {
		const result = radar([
			task("260618_a", "T-01", { owner: "worker", planned: ["x.ts"] }),
			task("260618_b", "T-01", { owner: "worker", planned: ["x.ts"] }),
		]);
		expect(warningsWith(result, "path_overlap_planned")).toHaveLength(1);
	});
});

describe("coordination radar source freshness and coverage", () => {
	test("declares observed scope and that absence of warnings is not clearance", () => {
		const result = radar([task("260618_a", "T-01", { planned: ["a.ts"] })]);
		expect(result.coverage.observed_complete).toBe(true);
		expect(result.coverage.observed_sources).toEqual([
			"afol_workbench_tasks",
			"afol_mutation_journal",
		]);
		expect(result.coverage.unobserved.length).toBeGreaterThan(0);
		expect(result.coverage.unobserved.join(" ")).toContain("UNC");
		expect(result.coverage.unobserved.join(" ")).toContain(
			"not verified identities",
		);
		expect(result.coverage.no_warnings_means).toBe(
			"no_conflict_in_observed_sources_only",
		);
	});

	test("stale persisted snapshot is replaced by a read-only live collection", () => {
		const root = createProjectRoot("stale");
		writeTaskFile(
			root,
			"260618_alpha",
			["| T-01 | in_progress | alice | first |"],
			plannedBlock("T-01", ["cli/shared.ts"]),
		);
		rebuildWorkBenchIndex(root);
		const indexPath = join(root, ".afol", "data", "index", "workbench.json");
		const before = readFileSync(indexPath, "utf8");
		writeTaskFile(
			root,
			"260618_beta",
			["| T-01 | in_progress | bob | second |"],
			plannedBlock("T-01", ["cli/shared.ts"]),
		);
		const result = loadCoordinationRadar(root, { now: NOW });
		expect(result.source.workbench_status).toBe("stale");
		expect(result.source.workbench_data).toBe("live_collection");
		expect(
			result.open_tasks.some((entry) => entry.session === "260618_beta"),
		).toBe(true);
		expect(warningsWith(result, "path_overlap_planned")).toHaveLength(1);
		expect(warningsWith(result, "stale_coordination_index")).toHaveLength(1);
		expect(readFileSync(indexPath, "utf8")).toBe(before);
	});

	test("missing and malformed indexes use live collection and say so", () => {
		const root = createProjectRoot("missing");
		writeTaskFile(root, "260618_alpha", ["| T-01 | in_progress | alice | x |"]);
		const missing = loadCoordinationRadar(root, { now: NOW });
		expect(missing.source.workbench_status).toBe("missing");
		expect(missing.source.workbench_data).toBe("live_collection");
		expect(missing.open_tasks).toHaveLength(1);

		const indexDir = join(root, ".afol", "data", "index");
		mkdirSync(indexDir, { recursive: true });
		writeFileSync(join(indexDir, "workbench.json"), "{not json", "utf8");
		const malformed = loadCoordinationRadar(root, { now: NOW });
		expect(malformed.source.workbench_status).toBe("invalid");
		expect(malformed.source.workbench_data).toBe("live_collection");
		expect(malformed.open_tasks).toHaveLength(1);
		expect(readFileSync(join(indexDir, "workbench.json"), "utf8")).toBe(
			"{not json",
		);
	});

	test("sessions known only to a non-fresh index are kept and flagged", () => {
		const root = createProjectRoot("extras");
		writeTaskFile(
			root,
			"260618_alpha",
			["| T-01 | in_progress | alice | first |"],
			plannedBlock("T-01", ["cli/shared.ts"]),
		);
		writeTaskFile(
			root,
			"260618_gone",
			["| T-01 | in_progress | bob | second |"],
			plannedBlock("T-01", ["cli/shared.ts"]),
		);
		rebuildWorkBenchIndex(root);
		rmSync(join(root, ".afol", "wb", "260618_gone"), { recursive: true });
		const result = loadCoordinationRadar(root, { now: NOW });
		expect(result.source.workbench_data).toBe("live_collection");
		expect(result.open_tasks.map((entry) => entry.session)).toEqual([
			"260618_alpha",
			"260618_gone",
		]);
		expect(warningsWith(result, "path_overlap_planned")).toHaveLength(1);
		expect(result.coverage.observed_complete).toBe(false);
		expect(result.coverage.incomplete_reasons.join(" ")).toContain(
			"260618_gone",
		);
	});

	test("degraded session sources mark observed coverage incomplete", () => {
		const root = createProjectRoot("degraded");
		writeTaskFile(root, "260618_dup", [
			"| T-01 | done | alice | first |",
			"| T-01 | in_progress | bob | hidden duplicate |",
		]);
		rebuildWorkBenchIndex(root);
		const result = loadCoordinationRadar(root, { now: NOW });
		expect(result.source.workbench_status).toBe("degraded");
		expect(result.coverage.observed_complete).toBe(false);
		expect(result.coverage.incomplete_reasons.join(" ")).toContain(
			"260618_dup",
		);
	});

	test("malformed mutation journal makes the radar unavailable, not clear", async () => {
		const root = createProjectRoot("journal");
		writeTaskFile(root, "260618_alpha", ["| T-01 | in_progress | alice | x |"]);
		const journalDir = join(root, ".afol", "data", "mutations");
		mkdirSync(journalDir, { recursive: true });
		writeFileSync(join(journalDir, "mutations.jsonl"), "{broken\n", "utf8");
		expect(() => loadCoordinationRadar(root, { now: NOW })).toThrow(
			/Mutation journal corruption/,
		);
		const io = captureIo();
		const code = await runSessionCommand("radar", ["--json"], root, io.io);
		expect(code).toBe(2);
		const parsed = JSON.parse(io.stdout.join("\n")) as {
			ok: boolean;
			error: { code: string };
		};
		expect(parsed.ok).toBe(false);
		expect(parsed.error.code).toBe("SESSION_RADAR_UNAVAILABLE");
	});
});

type RadarJson = {
	ok: boolean;
	data: {
		exit_semantics: string;
		coverage: { observed_complete: boolean } | null;
		scope: { session: string | null; all: boolean };
		summary: { open_tasks: number; warnings: number; critical: number };
		tasks: Array<{
			session: string;
			task_id: string;
			planned_files: unknown[];
			touched_files: unknown[];
			warning_ids: string[];
			omitted: {
				planned_files: number;
				touched_files: number;
				warning_ids: number;
			};
		}>;
		warnings: Array<{ id: string }>;
		truncated: { sessions: boolean; tasks: boolean; warnings: boolean };
		omitted: { sessions: number; tasks: number; warnings: number };
		recovery_hint: string | null;
	};
};

function bigReport() {
	return {
		generated_at: NOW.toISOString(),
		source: { workbench_status: "fresh" },
		coverage: {
			observed_sources: ["afol_workbench_tasks", "afol_mutation_journal"],
			observed_complete: true,
			incomplete_reasons: [],
			unobserved: ["work outside AFOL sessions"],
			no_warnings_means: "no_conflict_in_observed_sources_only",
		},
		open_tasks: Array.from({ length: 30 }, (_, index) => ({
			session:
				index < 2
					? "260618_focus"
					: `260618_s${String(index).padStart(2, "0")}`,
			task_id: `T-${String(index + 1).padStart(2, "0")}`,
			state: "in_progress",
			owner: `owner-${index}`,
			touched_at: NOW.toISOString(),
			planned_files: Array.from({ length: 7 }, (__, pathIndex) => ({
				path: `cli/p-${index}-${pathIndex}.ts`,
			})),
			touched_files: Array.from({ length: 5 }, (__, pathIndex) => ({
				path: `cli/t-${index}-${pathIndex}.ts`,
			})),
			warning_ids: Array.from(
				{ length: 9 },
				(__, warningIndex) => `w-${warningIndex}`,
			),
		})),
		warnings: Array.from({ length: 14 }, (_, index) => ({
			id: `warning-${String(index).padStart(2, "0")}`,
			severity: index === 0 ? "critical" : "warning",
			reason: `warning ${index}`,
			affected_tasks:
				index < 2
					? [{ session: "260618_focus", task_id: "T-01" }]
					: [
							{
								session: `260618_s${String(index + 2).padStart(2, "0")}`,
								task_id: "T-09",
							},
						],
		})),
	};
}

describe("session radar command output", () => {
	test("bounded JSON reports per-list and top-level omitted counts with recovery", async () => {
		const root = createProjectRoot("bounded");
		setCoordinationRadarReaderForTests(() => bigReport());
		const io = captureIo();
		const code = await runSessionCommand("radar", ["--json"], root, io.io);
		expect(code).toBe(0);
		const parsed = JSON.parse(io.stdout.join("\n")) as RadarJson;
		expect(parsed.data.tasks).toHaveLength(25);
		expect(parsed.data.tasks[0]?.planned_files).toHaveLength(4);
		expect(parsed.data.tasks[0]?.omitted).toEqual({
			planned_files: 3,
			touched_files: 1,
			warning_ids: 3,
		});
		expect(parsed.data.omitted).toEqual({ sessions: 9, tasks: 5, warnings: 4 });
		expect(parsed.data.truncated.tasks).toBe(true);
		expect(parsed.data.recovery_hint).toContain("--all");
		expect(parsed.data.coverage?.observed_complete).toBe(true);
	});

	test("--all returns every list without truncation", async () => {
		const root = createProjectRoot("all");
		setCoordinationRadarReaderForTests(() => bigReport());
		const io = captureIo();
		const code = await runSessionCommand(
			"radar",
			["--json", "--all"],
			root,
			io.io,
		);
		expect(code).toBe(0);
		const parsed = JSON.parse(io.stdout.join("\n")) as RadarJson;
		expect(parsed.data.tasks).toHaveLength(30);
		expect(parsed.data.tasks[0]?.planned_files).toHaveLength(7);
		expect(parsed.data.warnings).toHaveLength(14);
		expect(parsed.data.omitted).toEqual({ sessions: 0, tasks: 0, warnings: 0 });
		expect(parsed.data.recovery_hint).toBeNull();
		expect(parsed.data.scope).toEqual({ session: null, all: true });
	});

	test("--session scopes tasks and warnings to one session", async () => {
		const root = createProjectRoot("scoped");
		setCoordinationRadarReaderForTests(() => bigReport());
		const io = captureIo();
		const code = await runSessionCommand(
			"radar",
			["--json", "--session", "260618_focus"],
			root,
			io.io,
		);
		expect(code).toBe(0);
		const parsed = JSON.parse(io.stdout.join("\n")) as RadarJson;
		expect(parsed.data.tasks.map((entry) => entry.task_id)).toEqual([
			"T-01",
			"T-02",
		]);
		expect(parsed.data.warnings.map((entry) => entry.id)).toEqual([
			"warning-00",
			"warning-01",
		]);
		expect(parsed.data.summary.open_tasks).toBe(2);
		expect(parsed.data.scope.session).toBe("260618_focus");
	});

	test("text output names hidden warnings and advisory exit semantics", async () => {
		const root = createProjectRoot("text");
		setCoordinationRadarReaderForTests(() => bigReport());
		const io = captureIo();
		const code = await runSessionCommand("radar", [], root, io.io);
		expect(code).toBe(0);
		const text = io.stdout.join("\n");
		expect(text).toContain("+11 more warnings");
		expect(text).toContain("exit 0 means the query ran");
		expect(text).toContain("coverage:");
	});

	test("exit codes: advisory success, strict critical, strict non-critical, unavailable", async () => {
		const root = createProjectRoot("exit");
		const critical = {
			open_tasks: [],
			warnings: [{ id: "touched_overlap", severity: "critical", reason: "x" }],
		};
		const nonCritical = {
			open_tasks: [],
			warnings: [{ id: "missing_owner", severity: "warning", reason: "x" }],
		};
		setCoordinationRadarReaderForTests(() => critical);
		const defaultIo = captureIo();
		expect(
			await runSessionCommand("radar", ["--json"], root, defaultIo.io),
		).toBe(0);
		const parsed = JSON.parse(defaultIo.stdout.join("\n")) as RadarJson;
		expect(parsed.data.exit_semantics).toContain("not proof");
		expect(
			await runSessionCommand("radar", ["--strict"], root, captureIo().io),
		).toBe(1);
		setCoordinationRadarReaderForTests(() => nonCritical);
		expect(
			await runSessionCommand("radar", ["--strict"], root, captureIo().io),
		).toBe(0);
		setCoordinationRadarReaderForTests(() => {
			throw new Error("index unreadable");
		});
		const errorIo = captureIo();
		expect(
			await runSessionCommand("radar", ["--strict"], root, errorIo.io),
		).toBe(2);
		expect(errorIo.stderr.join("\n")).toContain("session-radar-unavailable");
	});
});

describe("coordination radar v2 corrections", () => {
	test("identical touched globs are a possible, never critical, overlap", () => {
		const result = radar([
			task("260618_a", "T-01", { touched: ["src/*.ts"] }),
			task("260618_b", "T-01", { touched: ["src/*.ts"] }),
		]);
		const warnings = overlapWarnings(result);
		expect(warnings.map((entry) => [entry.id, entry.overlap])).toEqual([
			["touched_overlap", "possible"],
		]);
		expect(warnings[0]?.severity).toBe("warning");
	});

	test("identical unsupported claims never prove a critical overlap", () => {
		const result = radar([
			task("260618_a", "T-01", { touched: ["src/@(a|b).ts"] }),
			task("260618_b", "T-01", { touched: ["src/@(a|b).ts"] }),
		]);
		expect(
			overlapWarnings(result).every(
				(entry) =>
					entry.overlap === "possible" && entry.severity !== "critical",
			),
		).toBe(true);
		expect(warningsWith(result, "unsupported_path_pattern")).toHaveLength(1);
	});

	test("identical exact touched paths stay a confirmed critical overlap", () => {
		const result = radar([
			task("260618_a", "T-01", { touched: ["src/a.ts"] }),
			task("260618_b", "T-01", { touched: ["src/a.ts"] }),
		]);
		const [warning] = warningsWith(result, "touched_overlap");
		expect(warning?.overlap).toBe("confirmed");
		expect(warning?.severity).toBe("critical");
		expect(warning?.reason).toContain("not proof of simultaneous editing");
	});

	test("strict exit stays 0 for identical touched globs and 1 for exact paths", async () => {
		for (const [path, expected] of [
			["src/*.ts", 0],
			["src/a.ts", 1],
		] as const) {
			const root = createProjectRoot(`strict-${expected}`);
			for (const session of ["260618_alpha", "260618_beta"]) {
				writeTaskFile(
					root,
					session,
					["| T-01 | in_progress | alice | x |"],
					["### T-01 Work", "", "- Files touched:", `  - \`${path}\``],
				);
			}
			const code = await runSessionCommand(
				"radar",
				["--json", "--strict"],
				root,
				captureIo().io,
			);
			expect(code).toBe(expected);
		}
	});

	test("project root directory claims cover every project path", () => {
		const root = tempRoot("root-dir");
		for (const claim of [`${root}/`, root, "./", "."]) {
			expect(compareCoordinationClaims(root, claim, "src/a.ts")).toBe(
				"confirmed",
			);
			expect(compareCoordinationClaims(root, "src/**/*.ts", claim)).toBe(
				"confirmed",
			);
		}
		expect(compareCoordinationClaims(root, `${root}/`, `${root}x/a.ts`)).toBe(
			null,
		);
		expect(compareCoordinationClaims(root, `${root}/`, "/srv/other/a.ts")).toBe(
			null,
		);
		const result = radar(
			[
				task("260618_a", "T-01", { planned: [`${root}/`] }),
				task("260618_b", "T-01", { planned: ["src/a.ts"] }),
			],
			{ root },
		);
		expect(warningsWith(result, "path_overlap_planned")).toHaveLength(1);
		expect(result.open_tasks[0]?.planned_files[0]?.path).toBe("./");
	});

	test("ordinary directories keep segment boundaries", () => {
		const root = tempRoot("segments");
		expect(compareCoordinationClaims(root, "src/", "src/sub/a.ts")).toBe(
			"confirmed",
		);
		expect(compareCoordinationClaims(root, "src/", "srcx/a.ts")).toBe(null);
		expect(
			compareCoordinationClaims(root, "/outside/a/", "/outside/ab/a.ts"),
		).toBe(null);
	});

	test("a drive-mounted project root folds case for relative and absolute claims", () => {
		const root = "/mnt/x/Repo";
		for (const [left, right] of [
			["Source/A.cpp", "/mnt/x/Repo/source/a.cpp"],
			["Source/A.cpp", "X:/repo/Source/A.cpp"],
			["X:/Repo/Source/A.cpp", "/mnt/x/repo/source/a.cpp"],
			["Source/", "source/sub/a.cpp"],
			["Source/*.cpp", "source/a.CPP"],
		] as const) {
			expect(compareCoordinationClaims(root, left, right)).toBe("confirmed");
		}
		expect(
			compareCoordinationClaims(root, "Source/A.cpp", "Source/B.cpp"),
		).toBe(null);
	});

	test("a Linux project root stays case-sensitive", () => {
		const root = tempRoot("linux-case");
		expect(
			compareCoordinationClaims(root, "Source/A.cpp", "source/a.cpp"),
		).toBe(null);
		expect(
			compareCoordinationClaims(root, "Source/A.cpp", `${root}/source/a.cpp`),
		).toBe(null);
		expect(
			compareCoordinationClaims(root, "Source/A.cpp", `${root}/Source/A.cpp`),
		).toBe("confirmed");
	});

	test("malformed globs are unsupported and make coverage incomplete", () => {
		for (const pattern of [
			"src/[abc",
			"src/{a,b",
			"src/a}.ts",
			"src/a].ts",
			"src/[].ts",
			"src/[a/b].ts",
		]) {
			const result = radar([
				task("260618_a", "T-01", { planned: [pattern] }),
				task("260618_b", "T-01", { planned: ["src/a.ts"] }),
			]);
			expect(overlapWarnings(result)).toEqual([]);
			expect(warningsWith(result, "unsupported_path_pattern")).toHaveLength(1);
			expect(result.coverage.observed_complete).toBe(false);
		}
	});

	test("balanced globs still match after grammar validation", () => {
		const root = tempRoot("balanced");
		for (const pattern of [
			"src/{a,b}.ts",
			"src/{a,{b,c}}.ts",
			"src/[a-c].ts",
			"src/[!x].ts",
			"src/**/a.ts",
		]) {
			expect(compareCoordinationClaims(root, pattern, "src/a.ts")).toBe(
				"confirmed",
			);
		}
	});

	function indexedPair(name: string): string {
		const root = createProjectRoot(name);
		for (const session of ["260618_alpha", "260618_beta"]) {
			writeTaskFile(
				root,
				session,
				["| T-01 | in_progress | alice | x |"],
				plannedBlock("T-01", ["cli/shared.ts"]),
			);
		}
		rebuildWorkBenchIndex(root);
		writeTaskFile(
			root,
			"260618_alpha",
			["| T-01 | done | alice | x |"],
			plannedBlock("T-01", ["cli/shared.ts"]),
		);
		return root;
	}

	test("an archived session is not resurrected from a stale index", () => {
		const root = indexedPair("archived");
		const wb = join(root, ".afol", "wb");
		mkdirSync(join(wb, "_archive"), { recursive: true });
		renameSync(join(wb, "260618_alpha"), join(wb, "_archive", "260618_alpha"));
		const result = loadCoordinationRadar(root, { now: NOW });
		expect(result.open_tasks.map((entry) => entry.session)).toEqual([
			"260618_beta",
		]);
		expect(overlapWarnings(result)).toEqual([]);
		expect(result.coverage.terminal_sessions_excluded).toEqual([
			{ session: "260618_alpha", evidence: "archive_directory" },
		]);
		expect(result.known_sessions).toContain("260618_alpha");
	});

	test("a closed session in a valid ledger is not resurrected, a reopened one is kept", () => {
		const closed = indexedPair("closed");
		appendWorkbenchEvent(closed, {
			type: "workbench.close",
			session: "260618_alpha",
		});
		rmSync(join(closed, ".afol", "wb", "260618_alpha"), { recursive: true });
		const result = loadCoordinationRadar(closed, { now: NOW });
		expect(result.open_tasks.map((entry) => entry.session)).toEqual([
			"260618_beta",
		]);
		expect(result.coverage.terminal_sessions_excluded).toEqual([
			{ session: "260618_alpha", evidence: "ledger_close" },
		]);

		const reopened = indexedPair("reopened");
		appendWorkbenchEvent(reopened, {
			type: "workbench.close",
			session: "260618_alpha",
		});
		appendWorkbenchEvent(reopened, {
			type: "workbench.start_task",
			session: "260618_alpha",
			taskId: "T-01",
		});
		rmSync(join(reopened, ".afol", "wb", "260618_alpha"), { recursive: true });
		const kept = loadCoordinationRadar(reopened, { now: NOW });
		expect(kept.open_tasks.map((entry) => entry.session)).toEqual([
			"260618_alpha",
			"260618_beta",
		]);
		expect(kept.coverage.observed_complete).toBe(false);
		expect(kept.coverage.terminal_sessions_excluded).toEqual([]);
	});

	test("an unknown --session is an invalid scope, a real one with no open tasks is not", async () => {
		const root = createProjectRoot("scope");
		writeTaskFile(root, "260618_done", ["| T-01 | done | alice | x |"]);
		writeTaskFile(root, "260618_open", ["| T-01 | in_progress | bob | x |"]);
		const missingIo = captureIo();
		expect(
			await runSessionCommand(
				"radar",
				["--json", "--session", "260618_nope"],
				root,
				missingIo.io,
			),
		).toBe(2);
		const missing = JSON.parse(missingIo.stdout.join("\n")) as {
			ok: boolean;
			error: { code: string };
		};
		expect(missing.ok).toBe(false);
		expect(missing.error.code).toBe("SESSION_NOT_FOUND");

		const doneIo = captureIo();
		expect(
			await runSessionCommand(
				"radar",
				["--json", "--session", "260618_done"],
				root,
				doneIo.io,
			),
		).toBe(0);
		const done = JSON.parse(doneIo.stdout.join("\n")) as RadarJson & {
			data: { scope: { exists?: boolean } };
		};
		expect(done.data.tasks).toEqual([]);
		expect(done.data.scope).toEqual({
			session: "260618_done",
			all: false,
			exists: true,
		});
	});

	test("unknown radar arguments are rejected with exit 2", async () => {
		const root = createProjectRoot("args");
		writeTaskFile(root, "260618_alpha", ["| T-01 | in_progress | alice | x |"]);
		for (const args of [
			["--json", "--not-a-flag"],
			["--json", "--sesion", "260618_alpha"],
			["--json", "260618_alpha"],
		]) {
			const io = captureIo();
			expect(await runSessionCommand("radar", args, root, io.io)).toBe(2);
			const parsed = JSON.parse(io.stdout.join("\n")) as {
				error: { code: string; message: string };
			};
			expect(parsed.error.code).toBe("SESSION_PARSE_ERROR");
			expect(parsed.error.message).toContain("Unknown session radar argument");
		}
		expect(
			await runSessionCommand(
				"radar",
				["--json", "--all"],
				root,
				captureIo().io,
			),
		).toBe(0);
	});
});
