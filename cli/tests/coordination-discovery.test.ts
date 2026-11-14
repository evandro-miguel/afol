import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setCoordinationRadarReaderForTests } from "../commands/session";
import { runStatusCommand } from "../commands/status";
import { DEFAULT_TEMPLATE_FILES } from "../generated/template";
import { kernelRegistry } from "../registry";
import { buildToolCatalog } from "../services/manifest/tools";
import { loadRegistry, validateRegistryContract } from "../validate/registry";

const cli = resolve(import.meta.dir, "../main.ts");
const roots: string[] = [];
afterEach(() => {
	setCoordinationRadarReaderForTests(null);
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});
function freshProject(): string {
	const root = mkdtempSync(join(tmpdir(), "coordination-discovery-"));
	roots.push(root);
	for (const entry of Object.values(DEFAULT_TEMPLATE_FILES)) {
		const path = join(root, entry.path);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, Buffer.from(entry.contentBase64, "base64"));
	}
	return root;
}
function run(root: string, ...args: string[]) {
	const result = spawnSync(process.execPath, [cli, ...args], {
		cwd: root,
		encoding: "utf8",
		env: { ...process.env, AFOL_AGENT: "0", AFOL_REMOTE: "0" },
	});
	return { exit: result.status, out: result.stdout, err: result.stderr };
}
function session(root: string, id: string): void {
	const dir = join(root, ".afol/wb", id);
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, `${id}_task_01.md`),
		[
			"---",
			'doc_type: "workbench_task"',
			`id: "${id}_task_01"`,
			`session_id: "${id}"`,
			'status: "active"',
			"---",
			"",
			"## State Board",
			"",
			"| Task | State | Owner | Notes |",
			"|---|---|---|---|",
			"| T-01 | in_progress | unassigned | first |",
			"| T-02 | pending | unassigned | second |",
			"",
		].join("\n"),
	);
}
function radar(root: string, ...args: string[]) {
	const result = run(root, "session", "radar", "--json", ...args);
	return { ...result, json: JSON.parse(result.out) };
}

describe("coordination discovery through normal entry points", () => {
	test("help aliases, execution catalogs and session help expose owners/files and full contract", () => {
		const root = freshProject();
		for (const args of [
			["help", "session"],
			["session", "--help"],
			["ss", "-h"],
		]) {
			const result = run(root, ...args);
			expect(result.exit).toBe(0);
			for (const text of [
				"radar",
				"intent",
				"--all",
				"--session",
				"--strict",
				"Exit",
				"UNKNOWN",
				"absolute path",
				"./Makefile",
				"UNC",
				"globs",
				"metadata",
			])
				expect(result.out).toContain(text);
		}
		const execution = run(root, "help", "--for", "execution");
		expect(execution.exit).toBe(0);
		expect(execution.out).toContain("owners/files: radar, intent");
		for (const args of [
			["help", "--json", "--for", "execution"],
			["help", "--json", "--verbose", "--for", "execution"],
		]) {
			const result = run(root, ...args);
			expect(result.exit).toBe(0);
			const entry = JSON.parse(result.out).find(
				(x: { command: string }) => x.command === "session",
			);
			expect(entry.description).toContain("radar, intent");
		}
		const result = run(root, "help", "session", "--json");
		expect(result.exit).toBe(0);
		const spec = JSON.parse(result.out);
		expect(
			spec.subcommands.find((x: { usage: string }) =>
				x.usage.startsWith("radar "),
			),
		).toMatchObject({ sideEffect: "read", requires_approval: false });
		expect(
			spec.subcommands.find((x: { usage: string }) =>
				x.usage.startsWith("intent "),
			),
		).toMatchObject({ sideEffect: "write", requires_approval: true });
	});
	test("fresh generated project has matching catalog, coverage and coordinator recipe", () => {
		const root = freshProject();
		const catalog = JSON.parse(
			readFileSync(join(root, ".afol/adm/tools.json"), "utf8"),
		);
		expect(catalog).toEqual(buildToolCatalog(kernelRegistry.commands));
		expect(validateRegistryContract(loadRegistry(root))).toEqual([]);
		const guide = readFileSync(join(root, "AGENTS.md"), "utf8");
		expect(guide).toContain("afol session radar --json");
		expect(guide).toContain("afol session intent -S");
		expect(guide).toContain("Direct work stays session-optional");
		expect(run(root, "s").out).toContain("who writes what: afol session radar");
		const status = run(root, "status", "--json");
		expect(status.exit).toBe(0);
		expect(JSON.parse(status.out).data.coordination_hint).toContain(
			"afol help session",
		);
	});
	test("status discovery hint does not invoke the radar reader", () => {
		const root = freshProject();
		let calls = 0;
		setCoordinationRadarReaderForTests(() => {
			calls++;
			throw new Error("no global scan");
		});
		for (const args of [[], ["--json"]]) {
			const out: string[] = [];
			expect(
				runStatusCommand(root, args, {
					stdout: (x) => out.push(x),
					stderr: () => {},
				}),
			).toBe(0);
			expect(out.join("\n")).toContain("afol session radar");
		}
		expect(calls).toBe(0);
	});
	test("session entry hints include registration on unknown action", () => {
		const result = run(freshProject(), "session", "typo", "--json");
		expect(result.exit).toBe(2);
		expect(result.out).toContain("intent");
	});
	test("documented registration roundtrip, aliases, strict exits and scope filtering", () => {
		const root = freshProject();
		const id = "261113_0000_discovery";
		session(root, id);
		const first = run(
			root,
			"session",
			"intent",
			"-S",
			id,
			"T-01",
			"--owner",
			"coordinator-A",
			"--write",
			"src/shared.ts",
			"--json",
		);
		expect(first.exit).toBe(0);
		expect(JSON.parse(first.out).data.owner).toBe("coordinator-A");
		expect(
			run(
				root,
				"ss",
				"intent",
				"--session",
				id,
				"--task-id",
				"T-02",
				"--owner",
				"coordinator-B",
				"--write",
				"src/shared.ts",
				"--json",
			).exit,
		).toBe(0);
		const result = radar(root, "--all", "--session", id);
		expect(result.exit).toBe(0);
		expect(result.out).toContain("coordinator-A");
		expect(result.out).toContain("src/shared.ts");
		expect(result.json.data.summary.warning).toBeGreaterThan(0);
		expect(radar(root, "--strict").exit).toBe(0);
		expect(radar(root, "--session", "missing").exit).toBe(2);
		expect(
			run(root, "session", "intent", "T-01", "--write", "src/x.ts", "--json")
				.exit,
		).toBe(2);
	});
	test("help's extensionless workaround is accepted, rejected spellings preserve task bytes", () => {
		const root = freshProject();
		const id = "261113_0001_paths";
		session(root, id);
		const path = join(root, ".afol/wb", id, `${id}_task_01.md`);
		const before = readFileSync(path, "utf8");
		for (const spelling of ["Makefile", "./Makefile"]) {
			expect(
				run(
					root,
					"session",
					"intent",
					"-S",
					id,
					"T-01",
					"--write",
					spelling,
					"--json",
				).exit,
			).toBe(2);
			expect(readFileSync(path, "utf8")).toBe(before);
		}
		expect(
			run(
				root,
				"session",
				"intent",
				"-S",
				id,
				"T-01",
				"--write",
				join(root, "Makefile"),
				"--json",
			).exit,
		).toBe(0);
		expect(radar(root, "--all").out).toContain("Makefile");
		expect(
			run(
				root,
				"session",
				"intent",
				"-S",
				id,
				"T-01",
				"--clear-write",
				"--read-only",
				"--json",
			).exit,
		).toBe(0);
	});
});
