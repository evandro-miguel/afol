#!/usr/bin/env bun
/**
 * Slice-1 hop oracle: scripted policies against repo-local AFOL in isolated fixtures.
 * Does not patch cli/**. Marks M1–M6 are policy simulations.
 */
import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const oracleDir = dirname(fileURLToPath(import.meta.url));
const sessionDir = resolve(oracleDir, "..");
const repoRoot = resolve(sessionDir, "../../..");
const kernel = join(repoRoot, "cli/main.ts");
const fixturesRoot = join(repoRoot, "tmp/hop-count-ab/fixtures");
const tracesRoot = join(sessionDir, "traces");

const FIXTURES = [
	"A-dirty",
	"A-ambiguous",
	"A-help-flag",
	"A-evidence",
	"A-ls",
	"A-verify",
	"A-compact",
	"A-qt-pending",
	"A-happy",
] as const;
type FixtureId = (typeof FIXTURES)[number];
const MARKS = ["M0", "M1", "M2", "M3", "M4", "M5", "M6"] as const;
type Mark = (typeof MARKS)[number];

type Hop = {
	argv: string[];
	argv_chars: number;
	exit: number;
	ms: number;
	bytes: number;
	stdout: string;
	stderr: string;
};

type Trace = {
	fixture: FixtureId;
	mark: Mark;
	hops: number;
	retry_count: number;
	argv_chars_max: number;
	output_bytes_max: number;
	duration_ms: number;
	exits: number[];
	kill_switch: boolean;
	kill_reasons: string[];
	success: boolean;
	notes: string;
	commands: string[];
};

const HOP_CAP = 8;

function argvChars(argv: string[]): number {
	return Array.from(`afol ${argv.join(" ")}`).length;
}

function runAfol(cwd: string, argv: string[], env: NodeJS.ProcessEnv = {}): Hop {
	const started = performance.now();
	const proc = spawnSync("bun", [kernel, ...argv], {
		cwd,
		encoding: "utf8",
		env: { ...process.env, ...env, AFOL_EVOLUTION_DISABLE: "1" },
		stdio: ["ignore", "pipe", "pipe"],
	});
	const stdout = proc.stdout ?? "";
	const stderr = proc.stderr ?? "";
	return {
		argv,
		argv_chars: argvChars(argv),
		exit: proc.status ?? 1,
		ms: Math.round(performance.now() - started),
		bytes: Buffer.byteLength(stdout + stderr, "utf8"),
		stdout,
		stderr,
	};
}

function gitInit(root: string): void {
	for (const args of [
		["init", "-q"],
		["config", "user.email", "hop@example.test"],
		["config", "user.name", "Hop Oracle"],
	]) {
		spawnSync("git", args, { cwd: root, encoding: "utf8" });
	}
	writeFileSync(join(root, "README.md"), "hop-ab fixture\n");
	spawnSync("git", ["add", "README.md"], { cwd: root });
	spawnSync("git", ["commit", "-qm", "init"], { cwd: root });
}

function seedProject(root: string): void {
	rmSync(root, { recursive: true, force: true });
	mkdirSync(join(root, ".afol"), { recursive: true });
	mkdirSync(join(root, ".agents"), { recursive: true });
	mkdirSync(join(root, ".afol/wb"), { recursive: true });
	mkdirSync(join(root, ".afol/adm/specs"), { recursive: true });
	copyFileSync(
		join(repoRoot, "src/project-template/.afol/config.json"),
		join(root, ".afol/config.json"),
	);
	copyFileSync(
		join(repoRoot, "src/project-template/.agents/lock.json"),
		join(root, ".agents/lock.json"),
	);
	writeFileSync(
		join(root, "AGENTS.md"),
		"# hop-ab fixture\n\nUse afol st T-01 then afol d T-01 -x then afol c.\n",
	);
	gitInit(root);
}

function writeClosedStub(root: string, id: string): void {
	const dir = join(root, ".afol/wb", id);
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, `${id}_task_01.md`),
		`---
doc_type: "workbench_task"
id: "${id}_task_01"
session_id: "${id}"
status: "closed"
---

# Tasks: ${id}

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | stub |
`,
	);
}

function writeOpenSession(
	root: string,
	id: string,
	tasks: Array<{ id: string; state: string }>,
	status = "active",
): void {
	const dir = join(root, ".afol/wb", id);
	mkdirSync(dir, { recursive: true });
	const rows = tasks
		.map((t) => `| ${t.id} | ${t.state} | worker | hop |`)
		.join("\n");
	writeFileSync(
		join(dir, `${id}_task_01.md`),
		`---
doc_type: "workbench_task"
id: "${id}_task_01"
session_id: "${id}"
status: "${status}"
task_ids: "${tasks.map((t) => t.id).join(",")}"
---

# Tasks: ${id}

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
${rows}
`,
	);
	writeFileSync(join(dir, `${id}_plan_01.md`), `# Plan: ${id}\n`);
	writeFileSync(join(dir, `${id}_log_01.md`), "# Log\n\n## Timeline\n\n- seed\n");
	writeFileSync(join(dir, ".evidence.jsonl"), "");
}

function bind(root: string, session: string): void {
	writeFileSync(join(root, ".afol/wb/.active_session"), `${session}\n`);
	writeFileSync(
		join(root, ".afol/wb/session-context.json"),
		JSON.stringify({
			bindings: [
				{
					session,
					branch: "master",
					worktree: root,
					actor: "hop-oracle",
					last_touched: new Date().toISOString(),
				},
			],
		}),
	);
}

function unbind(root: string): void {
	rmSync(join(root, ".afol/wb/.active_session"), { force: true });
	writeFileSync(
		join(root, ".afol/wb/session-context.json"),
		JSON.stringify({ bindings: [] }),
	);
}

function liveSession(root: string, theme: string, extra: string[] = []): string {
	const hop = runAfol(root, [
		"n",
		theme,
		"-t",
		"hop task",
		"--no-spec-required",
		"--reason",
		"hop-ab fixture",
		...extra,
	]);
	const match = /session created:\s*(\S+)/.exec(hop.stdout + hop.stderr);
	if (!match?.[1]) {
		throw new Error(
			`n failed for ${theme}: exit=${hop.exit} ${hop.stdout} ${hop.stderr}`,
		);
	}
	return match[1];
}

function buildFixture(id: FixtureId): string {
	const root = join(fixturesRoot, id);
	seedProject(root);
	switch (id) {
		case "A-dirty": {
			for (let i = 0; i < 50; i += 1) {
				writeClosedStub(root, `260101_${String(i).padStart(4, "0")}_closed`);
			}
			unbind(root);
			break;
		}
		case "A-ambiguous": {
			const session = liveSession(root, "ambiguous", ["-t", "second pending"]);
			bind(root, session);
			break;
		}
		case "A-help-flag":
		case "A-happy": {
			const session = liveSession(root, id.toLowerCase());
			bind(root, session);
			break;
		}
		case "A-evidence":
		case "A-compact": {
			const session = liveSession(root, id.toLowerCase());
			bind(root, session);
			const st = runAfol(root, ["st", "T-01"]);
			if (st.exit !== 0) {
				throw new Error(`st T-01 failed: ${st.stderr || st.stdout}`);
			}
			break;
		}
		case "A-ls": {
			liveSession(root, "ls-hidden");
			unbind(root);
			break;
		}
		case "A-verify": {
			for (let i = 0; i < 5; i += 1) {
				liveSession(root, `open-${i}`);
			}
			unbind(root);
			break;
		}
		case "A-qt-pending":
			break;
	}
	writeFileSync(join(root, ".fixture-id"), `${id}\n`);
	return root;
}

function parseSession(text: string): string | null {
	return (
		/session created:\s*(\S+)/.exec(text)?.[1] ??
		/session[=: ]([0-9]{6}_[0-9]{4}_\S+)/.exec(text)?.[1] ??
		/quick-task complete:\s*(\S+)/.exec(text)?.[1] ??
		null
	);
}

function listOpenSessions(root: string): string[] {
	const wb = join(root, ".afol/wb");
	if (!existsSync(wb)) return [];
	return readdirSync(wb).filter(
		(name) =>
			!name.startsWith(".") &&
			name !== "_archive" &&
			existsSync(join(wb, name, `${name}_task_01.md`)),
	);
}

function nextFromOutput(hop: Hop): string[] | null {
	const text = `${hop.stdout}\n${hop.stderr}`;
	const hint = /hint="([^"]+)"/.exec(text)?.[1];
	if (hint?.startsWith("afol ")) {
		return hint.slice(5).trim().split(/\s+/);
	}
	const safe = /SAFE_NEXT_ACTION:\s*(.+)$/m.exec(text)?.[1]?.trim();
	if (safe?.startsWith("afol ")) {
		return safe.slice(5).trim().split(/\s+/);
	}
	const nextCmd = /next_command["\s:=]+(afol [^"\n]+)/.exec(text)?.[1];
	if (nextCmd) return nextCmd.slice(5).trim().split(/\s+/);
	return null;
}

function policyNext(
	mark: Mark,
	fixture: FixtureId,
	hops: Hop[],
	root: string,
): string[] | "done" {
	const last = hops.at(-1);
	const open = listOpenSessions(root);

	if (fixture === "A-happy") {
		if (hops.length === 0) return ["st", "T-01"];
		if (last && last.exit === 0 && last.argv[0] === "st")
			return ["d", "T-01", "-x", "echo hop-ok"];
		if (last && last.exit === 0 && last.argv[0] === "d") return ["c"];
		if (last && last.exit === 0 && last.argv[0] === "c") return "done";
		return "done";
	}

	if (fixture === "A-ambiguous") {
		if (hops.length === 0) return ["st"];
		if (last && last.argv[0] === "st" && last.argv.length === 1)
			return ["st", "T-01"];
		if (last && last.exit === 0 && last.argv[0] === "st")
			return ["d", "T-01", "-x", "echo hop-ok"];
		if (last && last.exit === 0 && last.argv[0] === "d") return ["c"];
		if (last && last.argv[0] === "c") return "done";
		return "done";
	}

	if (fixture === "A-help-flag") {
		if (hops.length === 0) return ["start", "--help"];
		if (last?.argv[0] === "st") return "done";
		if (last?.argv[0] === "start" && !last.argv.includes("--help"))
			return "done";
		if (mark === "M2") return ["st", "T-01"];
		if (last?.argv.join(" ") === "start --help") return ["s", "-j"];
		const blob = `${last?.stdout ?? ""}\n${last?.stderr ?? ""}`;
		const session =
			/"session"\s*:\s*"([^"]+)"/.exec(blob)?.[1] ??
			listOpenSessions(root)[0];
		if (session) return ["st", "-S", session, "-T", "T-01"];
		return ["st", "T-01"];
	}

	if (fixture === "A-evidence") {
		if (mark === "M3") {
			if (hops.length === 0) return ["d", "T-01", "-x", "echo hop-ok"];
			if (last?.argv[0] === "d" && last.exit === 0) return "done";
			return "done";
		}
		if (hops.length === 0) return ["e", "T-01", "-c", "true", "-o", "passed"];
		if (last?.argv[0] === "e") return ["d", "T-01"];
		if (last?.argv[0] === "d" && last.argv.length === 2)
			return ["d", "T-01", "-x", "echo hop-ok"];
		return "done";
	}

	if (fixture === "A-ls") {
		if (hops.length === 0) return ["ls"];
		if (last?.argv[0] === "ss") return "done";
		if (mark === "M6") return ["ss"];
		if (last?.argv[0] === "ls") return ["help"];
		if (last?.argv[0] === "help") return ["ss"];
		return "done";
	}

	if (fixture === "A-verify") {
		if (hops.length === 0) return ["vt", "--strict"];
		if (last?.argv.includes("-S")) return "done";
		const session = open[0];
		if (mark === "M5") {
			return session ? ["vt", "-S", session, "--strict"] : "done";
		}
		if (last?.argv[0] === "vt" && !last.argv.includes("-S"))
			return ["help", "verify"];
		if (last?.argv[0] === "help") {
			return session ? ["vt", "-S", session, "--strict"] : "done";
		}
		return "done";
	}

	if (fixture === "A-compact") {
		if (hops.length === 0) return ["s"];
		if (last?.argv[0] === "c") return "done";
		if (last?.argv[0] === "d" && last.exit === 0) return ["c"];
		if (last?.argv[0] === "d") return "done";
		if (mark === "M4" && last?.argv[0] === "s")
			return ["d", "T-01", "-x", "echo hop-ok"];
		if (last?.argv[0] === "s") return ["help"];
		if (last?.argv[0] === "help") return ["d", "T-01", "-x", "echo hop-ok"];
		return "done";
	}

	if (fixture === "A-qt-pending") {
		if (hops.length === 0)
			return ["qt", "micro", "-t", "one", "-c", "echo hop-ok"];
		if (last && last.exit === 0) {
			const hinted = nextFromOutput(last);
			if (hinted) return hinted;
			return "done";
		}
		return "done";
	}

	if (fixture === "A-dirty") {
		if (hops.length === 0) return ["s"];
		const newCmd = [
			"n",
			"dirty-work",
			"-t",
			"one",
			"--no-spec-required",
			"--reason",
			"fixture",
		];
		if (last?.argv[0] === "s" && !last.argv.includes("-j")) {
			return mark === "M4" ? newCmd : ["s", "-j"];
		}
		if (last?.argv[0] === "s" && last.argv.includes("-j")) return newCmd;
		if (last?.argv[0] === "n" && last.exit === 0) return ["st", "T-01"];
		if (last?.argv[0] === "st" && last.exit === 0)
			return ["d", "T-01", "-x", "echo hop-ok"];
		if (last?.argv[0] === "d" && last.exit === 0) return ["c"];
		if (last?.argv[0] === "c") return "done";
		if (last && last.exit !== 0) return "done";
		return "done";
	}

	return "done";
}

function successOf(fixture: FixtureId, hops: Hop[]): boolean {
	if (hops.length === 0 || hops.length > HOP_CAP) return false;
	switch (fixture) {
		case "A-happy":
			return hops.some((h) => h.argv[0] === "c" && h.exit === 0);
		case "A-ambiguous":
			return (
				hops.some((h) => h.argv[0] === "st" && h.argv.length === 1 && h.exit !== 0) &&
				hops.some((h) => h.argv[0] === "st" && h.argv.includes("T-01") && h.exit === 0) &&
				hops.some((h) => h.argv[0] === "d" && h.exit === 0)
			);
		case "A-help-flag":
			return (
				hops[0]?.argv.join(" ") === "start --help" &&
				hops.some(
					(h, i) =>
						i > 0 &&
						(h.argv[0] === "st" || h.argv[0] === "start") &&
						h.exit === 0,
				)
			);
		case "A-evidence":
			return hops.some(
				(h) => h.argv[0] === "d" && h.argv.includes("-x") && h.exit === 0,
			);
		case "A-ls":
			return hops.some((h) => h.argv[0] === "ss");
		case "A-verify":
			return hops.some((h) => h.argv[0] === "vt");
		case "A-compact":
			return (
				hops.every((h) => !h.argv.includes("-j") && !h.argv.includes("--json")) &&
				hops.some((h) => h.argv[0] === "d" && h.exit === 0)
			);
		case "A-qt-pending":
			return hops.some((h) => h.argv[0] === "qt" && h.exit === 0);
		case "A-dirty":
			return hops.some((h) => h.argv[0] === "c" && h.exit === 0);
	}
}

function runTrace(fixture: FixtureId, mark: Mark): Trace {
	const template = join(fixturesRoot, fixture);
	const work = join(tracesRoot, mark, `work-${fixture}`);
	rmSync(work, { recursive: true, force: true });
	spawnSync("cp", ["-a", template, work]);
	const hops: Hop[] = [];
	for (let i = 0; i < HOP_CAP; i += 1) {
		const next = policyNext(mark, fixture, hops, work);
		if (next === "done") break;
		if (hops.some((h) => h.argv.join(" ") === next.join(" ") && h.exit === 0))
			break;
		hops.push(runAfol(work, next));
	}
	const retry_count = hops.filter((h) => h.exit !== 0).length;
	const argv_chars_max = hops.reduce((m, h) => Math.max(m, h.argv_chars), 0);
	const output_bytes_max = hops.reduce((m, h) => Math.max(m, h.bytes), 0);
	const duration_ms = hops.reduce((m, h) => m + h.ms, 0);
	const success = successOf(fixture, hops);
	return {
		fixture,
		mark,
		hops: hops.length,
		retry_count,
		argv_chars_max,
		output_bytes_max,
		duration_ms,
		exits: hops.map((h) => h.exit),
		kill_switch: false,
		kill_reasons: [],
		success,
		notes: hops.map((h) => `${h.argv.join(" ")}=>${h.exit}/${h.ms}ms`).join("; "),
		commands: hops.map((h) => h.argv.join(" ")),
	};
}

function applyKillSwitch(traces: Trace[]): void {
	const m0 = traces.filter((t) => t.mark === "M0");
	const m0Happy = m0.find((t) => t.fixture === "A-happy");
	const m0Mean =
		m0.reduce((s, t) => s + t.hops, 0) / Math.max(m0.length, 1);
	for (const mark of MARKS) {
		if (mark === "M0") continue;
		const mine = traces.filter((t) => t.mark === mark);
		const happy = mine.find((t) => t.fixture === "A-happy");
		const mean = mine.reduce((s, t) => s + t.hops, 0) / Math.max(mine.length, 1);
		const reasons: string[] = [];
		if (m0Happy && happy && happy.hops > m0Happy.hops) {
			reasons.push("A-happy hops increased");
		}
		if (mean > m0Mean + 0.001) reasons.push("mean adverse hops increased");
		const m0Amb = m0.find((t) => t.fixture === "A-ambiguous");
		const ambiguous = mine.find((t) => t.fixture === "A-ambiguous");
		if (m0Amb && m0Amb.exits[0] !== 0 && ambiguous && ambiguous.exits[0] === 0) {
			reasons.push("ambiguous session no longer fail-closed");
		}
		for (const t of mine) {
			if (t.output_bytes_max > 40_000) reasons.push("output >10k tokens");
			t.kill_reasons = reasons;
			t.kill_switch = reasons.length > 0;
		}
	}
}

function writeWinner(traces: Trace[]): string {
	const lines = [
		"# Hop-count A/B winner table",
		"",
		"Slice 1: scripted policies, no cli/** patches.",
		"",
		"| Mark | mean hops | A-happy | kill | keep |",
		"| --- | ---: | ---: | --- | --- |",
	];
	const m0Happy =
		traces.find((t) => t.mark === "M0" && t.fixture === "A-happy")?.hops ?? 99;
	const keep: Record<Mark, boolean> = {
		M0: true,
		M1: false,
		M2: false,
		M3: false,
		M4: false,
		M5: false,
		M6: false,
	};
	for (const mark of MARKS) {
		const mine = traces.filter((t) => t.mark === mark);
		const mean = mine.reduce((s, t) => s + t.hops, 0) / Math.max(mine.length, 1);
		const happy = mine.find((t) => t.fixture === "A-happy")?.hops ?? 0;
		const killed = mine.some((t) => t.kill_switch);
		const m0Mean =
			traces
				.filter((t) => t.mark === "M0")
				.reduce((s, t) => s + t.hops, 0) /
			Math.max(FIXTURES.length, 1);
		const wins =
			mark !== "M0" && !killed && happy <= m0Happy && mean < m0Mean;
		keep[mark] = mark === "M0" ? true : wins;
		lines.push(
			`| ${mark} | ${mean.toFixed(2)} | ${happy} | ${killed ? "FAIL" : "pass"} | ${keep[mark] ? "keep" : "reject"} |`,
		);
	}
	lines.push("", "## Per fixture hops", "", "| Fixture | M0 | M1 | M2 | M3 | M4 | M5 | M6 |");
	lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
	for (const fixture of FIXTURES) {
		const cells = MARKS.map((mark) => {
			const t = traces.find((x) => x.mark === mark && x.fixture === fixture);
			return t ? String(t.hops) : "-";
		});
		lines.push(`| ${fixture} | ${cells.join(" | ")} |`);
	}
	lines.push(
		"",
		"Ties keep M0. No product patch in this slice; keep means candidate for a later residual.",
		"",
	);
	const path = join(tracesRoot, "winner.md");
	writeFileSync(path, `${lines.join("\n")}\n`);
	return path;
}

function main(): void {
	const arg = process.argv[2] ?? "all";
	mkdirSync(fixturesRoot, { recursive: true });
	mkdirSync(tracesRoot, { recursive: true });
	if (arg === "fixtures" || arg === "all") {
		for (const id of FIXTURES) {
			buildFixture(id);
			console.log(`fixture ${id} ok`);
		}
	}
	if (arg === "fixtures") return;
	if (arg === "winner") {
		const loaded: Trace[] = [];
		for (const mark of MARKS) {
			for (const fixture of FIXTURES) {
				loaded.push(
					JSON.parse(
						readFileSync(join(tracesRoot, mark, `${fixture}.json`), "utf8"),
					) as Trace,
				);
			}
		}
		applyKillSwitch(loaded);
		for (const t of loaded) {
			writeFileSync(
				join(tracesRoot, t.mark, `${t.fixture}.json`),
				`${JSON.stringify(t, null, 2)}\n`,
			);
		}
		writeWinner(loaded);
		console.log(`winner ${join(tracesRoot, "winner.md")}`);
		return;
	}
	const marks: Mark[] =
		arg === "all" || arg === "run"
			? [...MARKS]
			: MARKS.includes(arg as Mark)
				? [arg as Mark]
				: [...MARKS];
	const traces: Trace[] = [];
	for (const mark of marks) {
		mkdirSync(join(tracesRoot, mark), { recursive: true });
		for (const fixture of FIXTURES) {
			if (!existsSync(join(fixturesRoot, fixture))) buildFixture(fixture);
			const trace = runTrace(fixture, mark);
			writeFileSync(
				join(tracesRoot, mark, `${fixture}.json`),
				`${JSON.stringify(trace, null, 2)}\n`,
			);
			traces.push(trace);
			console.log(
				`${mark} ${fixture} hops=${trace.hops} success=${trace.success} ${trace.notes}`,
			);
		}
	}
	if (marks.length === MARKS.length) {
		applyKillSwitch(traces);
		for (const t of traces) {
			writeFileSync(
				join(tracesRoot, t.mark, `${t.fixture}.json`),
				`${JSON.stringify(t, null, 2)}\n`,
			);
		}
		writeWinner(traces);
		console.log(`winner ${join(tracesRoot, "winner.md")}`);
	}
}

main();
