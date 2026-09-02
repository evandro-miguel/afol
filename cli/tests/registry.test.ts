import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { kernelRegistry } from "../registry";
import {
	buildManifestCommandStability,
	buildManifestCommands,
} from "../services/manifest/commands";
import { buildToolCatalog } from "../services/manifest/tools";

describe("kernel registry", () => {
	test("exports expected command kinds and alias resolution", () => {
		expect(kernelRegistry.resolveKind("status")).toBe("status");
		expect(kernelRegistry.resolveKind("s")).toBe("status");
		expect(kernelRegistry.resolveKind("validate")).toBe("validate");
		expect(kernelRegistry.resolveKind("v")).toBe("validate");
		expect(kernelRegistry.resolveKind("check")).toBe("validate");
		expect(kernelRegistry.resolveKind("ck")).toBe("validate");
		expect(kernelRegistry.resolveKind("init")).toBe("init");
		expect(kernelRegistry.resolveKind("i")).toBe("init");
		expect(kernelRegistry.resolveKind("bootstrap")).toBe("bootstrap");
		expect(kernelRegistry.resolveKind("b")).toBe("bootstrap");
		expect(kernelRegistry.resolveKind("start")).toBe("start");
		expect(kernelRegistry.resolveKind("st")).toBe("start");
		expect(kernelRegistry.resolveKind("new")).toBe("new");
		expect(kernelRegistry.resolveKind("n")).toBe("new");
		expect(kernelRegistry.resolveKind("evidence")).toBe("evidence");
		expect(kernelRegistry.resolveKind("e")).toBe("evidence");
		expect(kernelRegistry.resolveKind("done")).toBe("done");
		expect(kernelRegistry.resolveKind("d")).toBe("done");
		expect(kernelRegistry.resolveKind("log")).toBe("log");
		expect(kernelRegistry.resolveKind("l")).toBe("log");
		expect(kernelRegistry.resolveKind("quick-task")).toBe("quickTask");
		expect(kernelRegistry.resolveKind("qt")).toBe("quickTask");
		expect(kernelRegistry.resolveKind("verify")).toBe("verifyTasks");
		expect(kernelRegistry.resolveKind("vf")).toBe("verifyTasks");
		expect(kernelRegistry.resolveKind("verify-tasks")).toBe("verifyTasks");
		expect(kernelRegistry.resolveKind("vt")).toBe("verifyTasks");
		expect(kernelRegistry.resolveKind("rule")).toBe("rule");
		expect(kernelRegistry.resolveKind("r")).toBe("rule");
		expect(kernelRegistry.resolveKind("skill")).toBe("skill");
		expect(kernelRegistry.resolveKind("sk")).toBe("skill");
		expect(kernelRegistry.resolveKind("update")).toBe("update");
		expect(kernelRegistry.resolveKind("up")).toBe("update");
		expect(kernelRegistry.resolveKind("local-state")).toBe("localState");
		expect(kernelRegistry.resolveKind("ls")).toBe("localState");
		expect(kernelRegistry.resolveKind("pstr")).toBe("pstr");
		expect(kernelRegistry.resolveKind("ps")).toBe("pstr");
		expect(kernelRegistry.resolveKind("ctx")).toBe("ctx");
		expect(kernelRegistry.resolveKind("cx")).toBe("ctx");
		expect(kernelRegistry.resolveKind("state")).toBe("state");
		expect(kernelRegistry.resolveKind("stt")).toBe("state");
		expect(kernelRegistry.resolveKind("hydrate")).toBe("hydrate");
		expect(kernelRegistry.resolveKind("hy")).toBe("hydrate");
		expect(kernelRegistry.resolveKind("library")).toBe("library");
		expect(kernelRegistry.resolveKind("lb")).toBe("library");
		expect(kernelRegistry.resolveKind("evolve")).toBe("evolve");
		expect(kernelRegistry.resolveKind("adm")).toBe("adm");
		expect(kernelRegistry.resolveKind("ad")).toBe("adm");
		expect(kernelRegistry.resolveKind("spec")).toBe("spec");
		expect(kernelRegistry.resolveKind("sp")).toBe("spec");
		expect(kernelRegistry.resolveKind("changelog")).toBe("changelog");
		expect(kernelRegistry.resolveKind("cl")).toBe("changelog");
		expect(kernelRegistry.resolveKind("health")).toBe("health");
		expect(kernelRegistry.resolveKind("ht")).toBe("health");
		expect(kernelRegistry.resolveKind("db")).toBe("db");
		expect(kernelRegistry.resolveKind("doctor")).toBe("doctor");
		expect(kernelRegistry.resolveKind("dr")).toBe("doctor");
		expect(kernelRegistry.resolveKind("maintenance")).toBe("maintenance");
		expect(kernelRegistry.resolveKind("mt")).toBe("maintenance");
		expect(kernelRegistry.resolveKind("sweep")).toBe("sweep");
		expect(kernelRegistry.resolveKind("sw")).toBe("sweep");
		expect(kernelRegistry.resolveKind("schema")).toBe("schema");
		expect(kernelRegistry.resolveKind("sc")).toBe("schema");
		expect(kernelRegistry.resolveKind("bench")).toBe("bench");
		expect(kernelRegistry.resolveKind("be")).toBe("bench");
		expect(kernelRegistry.resolveKind("project-benchmark")).toBe(
			"projectBenchmark",
		);
		expect(kernelRegistry.resolveKind("pb")).toBe("projectBenchmark");
		expect(kernelRegistry.resolveKind("catchup")).toBe("catchup");
		expect(kernelRegistry.resolveKind("cu")).toBe("catchup");
		expect(kernelRegistry.resolveKind("close")).toBe("close");
		expect(kernelRegistry.resolveKind("c")).toBe("close");
		expect(kernelRegistry.resolveKind("preflight")).toBe("preflight");
		expect(kernelRegistry.resolveKind("pf")).toBe("preflight");
		expect(kernelRegistry.resolveKind("fleet")).toBe("fleet");
		expect(kernelRegistry.resolveKind("adapter")).toBe("adapter");
		expect(kernelRegistry.resolveKind("adp")).toBe("adapter");
		expect(kernelRegistry.resolveKind("session")).toBe("session");
		expect(kernelRegistry.resolveKind("ss")).toBe("session");
		expect(kernelRegistry.resolveKind("task")).toBeNull();
		expect(kernelRegistry.resolveKind("query")).toBeNull();
	});

	test("keeps helper flags and public aliases only", () => {
		expect(kernelRegistry.isHelpAlias("-h")).toBe(true);
		expect(kernelRegistry.isHelpAlias("--help")).toBe(true);
		expect(kernelRegistry.isJsonAlias("-j")).toBe(true);
		expect(kernelRegistry.isJsonAlias("--json")).toBe(true);
		expect(kernelRegistry.canonicalize("sk")).toBe("skill");
		expect(kernelRegistry.canonicalize("b")).toBe("bootstrap");
		expect(kernelRegistry.canonicalize("ix")).toBe("ix");
	});

	test("publishes command side-effect metadata", () => {
		expect(kernelRegistry.commands.length).toBeGreaterThan(10);
		const byCommand = new Map(
			kernelRegistry.commands.map((entry) => [entry.command, entry]),
		);
		expect(byCommand.get("status")?.sideEffect).toBe("read");
		expect(byCommand.get("status")?.requires_approval).toBe(false);
		expect(byCommand.get("validate")?.sideEffect).toBe("read");
		expect(byCommand.get("init")?.sideEffect).toBe("write");
		expect(byCommand.get("init")?.requires_approval).toBe(true);
		expect(byCommand.get("bootstrap")?.sideEffect).toBe("write");
		expect(byCommand.get("log")?.sideEffect).toBe("append");
		expect(byCommand.get("verify-tasks")?.sideEffect).toBe("read");
		expect(byCommand.get("rule")?.sideEffect).toBe("read");
		expect(byCommand.get("skill")?.sideEffect).toBe("read");
		expect(byCommand.get("update")?.sideEffect).toBe("write");
		expect(byCommand.get("file")?.sideEffect).toBe("write");
		expect(byCommand.get("evidence")?.sideEffect).toBe("append");
		expect(byCommand.get("local-state")?.sideEffect).toBe("generated");
		expect(byCommand.get("pstr")?.sideEffect).toBe("read");
		expect(byCommand.get("ctx")?.sideEffect).toBe("generated");
		expect(byCommand.get("state")?.sideEffect).toBe("read");
		expect(byCommand.get("hydrate")?.sideEffect).toBe("generated");
		expect(byCommand.get("library")?.sideEffect).toBe("read");
		expect(byCommand.get("memory")?.sideEffect).toBe("read");
		expect(byCommand.get("evolve")?.sideEffect).toBe("read");
		expect(byCommand.get("adm")?.sideEffect).toBe("read");
		expect(byCommand.get("bench")?.sideEffect).toBe("read");
		expect(byCommand.get("project-benchmark")?.sideEffect).toBe("generated");
		expect(byCommand.get("spec")?.sideEffect).toBe("read");
		expect(byCommand.get("adr")?.sideEffect).toBe("write");
		expect(byCommand.get("changelog")?.sideEffect).toBe("append");
		expect(byCommand.get("health")?.sideEffect).toBe("read");
		expect(byCommand.get("db")?.sideEffect).toBe("read");
		expect(byCommand.get("doctor")?.sideEffect).toBe("read");
		expect(byCommand.get("maintenance")?.sideEffect).toBe("write");
		expect(byCommand.get("maintenance")?.requires_approval).toBe(true);
		expect(byCommand.get("sweep")?.sideEffect).toBe("read");
		expect(byCommand.get("schema")?.sideEffect).toBe("write");
		expect(byCommand.get("preflight")?.sideEffect).toBe("read");
		expect(byCommand.get("fleet")?.sideEffect).toBe("write");

		const adr = byCommand.get("adr");
		expect(adr?.sideEffect).toBe("write");
		expect(adr?.subcommands?.map((entry) => entry.usage)).toEqual([
			"new|create <topic>",
			"accept|ac <id>",
			"supersede|sp <old-id> <new-id>",
			"abandon|ab <id> --reason <text>",
			"archive|ar <id> --reason <text>",
		]);
		expect(
			adr?.subcommands?.every((entry) => entry.sideEffect === "write"),
		).toBe(true);

		const changelog = byCommand.get("changelog");
		expect(changelog?.sideEffect).toBe("append");
		expect(changelog?.subcommands?.map((entry) => entry.usage)).toEqual([
			"add|a --type <type> --message <text>",
		]);
		expect(
			changelog?.subcommands?.every((entry) => entry.sideEffect === "append"),
		).toBe(true);

		for (const entry of kernelRegistry.commands) {
			expect(["read", "write", "append", "generated"]).toContain(
				entry.sideEffect,
			);
			expect(entry.command.length).toBeGreaterThan(0);
			expect(entry.description.length).toBeGreaterThan(0);
			expect(entry.description.length).toBeLessThanOrEqual(80);
			expect(["stable", "experimental", "compatibility"]).toContain(
				entry.stability,
			);
		}
		expect(byCommand.get("status")?.stability).toBe("stable");
		expect(byCommand.get("evolve")?.stability).toBe("experimental");
		expect(byCommand.get("legacy")?.stability).toBe("compatibility");
	});

	test("publishes strict project validation metadata", () => {
		const validate = kernelRegistry.commands.find(
			(entry) => entry.command === "validate",
		);
		expect(validate?.subcommands?.map((entry) => entry.usage)).toContain(
			"project --strict --json",
		);
	});

	test("publishes verify report flags while preserving aliases and JSON usage", () => {
		for (const command of ["verify", "verify-tasks"] as const) {
			const spec = kernelRegistry.commands.find(
				(entry) => entry.command === command,
			);
			expect(spec?.kind).toBe("verifyTasks");
			expect(spec?.aliases).toEqual(command === "verify" ? ["vf"] : ["vt"]);
			expect(spec?.subcommands?.map((entry) => entry.usage)).toEqual([
				"[session-path] [--strict] [--verbose]",
				"--session <session-id> --json",
			]);
		}
	});

	test("does not label write commands as simple inspection", () => {
		for (const entry of kernelRegistry.commands) {
			if (entry.sideEffect !== "write") {
				continue;
			}
			expect(entry.description).not.toMatch(/^Inspect /);
		}
	});

	test("does not publish duplicate top-level aliases", () => {
		const seen = new Map<string, string>();
		for (const spec of kernelRegistry.commands) {
			for (const token of [spec.command, ...spec.aliases]) {
				expect(seen.has(token)).toBe(false);
				seen.set(token, spec.command);
			}
		}
	});

	test("keeps static manifests synced from the command registry", () => {
		const expectedCommands = buildManifestCommands(kernelRegistry.commands);
		const expectedStability = buildManifestCommandStability(
			kernelRegistry.commands,
		);

		for (const relativePath of ["src/project-template/.agents/manifest.json"]) {
			const manifest = JSON.parse(
				readFileSync(join(process.cwd(), relativePath), "utf8"),
			) as { commands?: unknown; command_stability?: unknown };

			expect(manifest.commands).toEqual(expectedCommands);
			expect(manifest.command_stability).toEqual(expectedStability);
		}
	});

	test("derives fixed harness tool profiles from the command registry", () => {
		const catalog = buildToolCatalog(kernelRegistry.commands);
		expect(catalog.tools).toHaveLength(kernelRegistry.commands.length);
		expect(catalog.tool_profiles).toMatchObject({
			kind: "harness_metadata",
			enforcement: "none",
		});
		expect(catalog.tool_profiles.profiles.map((profile) => profile.id)).toEqual(
			["orchestrator", "planner", "researcher", "coder", "tester", "reviewer"],
		);
		const commandsById = new Map(
			kernelRegistry.commands.map((command) => [command.command, command]),
		);
		for (const profileId of ["planner", "researcher"] as const) {
			const profile = catalog.tool_profiles.profiles.find(
				(item) => item.id === profileId,
			);
			expect(profile?.tool_ids).not.toContain("feedback");
			for (const toolId of profile?.tool_ids ?? []) {
				const command = commandsById.get(toolId);
				expect(command?.sideEffect).toBe("read");
				expect(
					(command?.subcommands ?? []).every(
						(item) => item.sideEffect === "read",
					),
				).toBe(true);
			}
		}
		expect(
			catalog.tools.find((tool) => tool.id === "feedback")?.execution_mode,
		).toBe("on-demand");
	});

	test("publishes maintenance review subcommand metadata", () => {
		const maintenance = kernelRegistry.commands.find(
			(entry) => entry.command === "maintenance",
		);

		expect(maintenance?.subcommands).toEqual([
			{
				usage: "weekly --dry-run",
				sideEffect: "read",
				requires_approval: false,
				description: "Preview weekly maintenance actions",
			},
			{
				usage: "monthly --dry-run",
				sideEffect: "read",
				requires_approval: false,
				description: "Preview monthly maintenance actions",
			},
			{
				usage: "review --area <area> --dry-run",
				sideEffect: "read",
				requires_approval: false,
				description:
					"Preview rules, skills, docs, commands, memory, library, organization",
			},
			{
				usage: "review --area <area> --note <text>",
				sideEffect: "write",
				requires_approval: true,
				description: "Record maintenance review freshness",
			},
		]);
	});

	test("publishes all PSTR actions and separates review apply", () => {
		const pstr = kernelRegistry.commands.find(
			(entry) => entry.command === "pstr",
		);
		expect(pstr?.subcommands?.map((entry) => entry.usage)).toEqual([
			"show|sh --json",
			"rebuild|rb --json",
			"validate|v --json",
			"stale|st --json",
			"section|sec <id> --json",
			"diff --json",
			"watch --once --json",
			"detect|det --json",
			"suggest|sug --json",
			"review-candidates|review|rc --json",
			"review-candidates --apply <id> --json",
		]);
		const review = pstr?.subcommands?.find((entry) =>
			entry.usage.startsWith("review-candidates|"),
		);
		const apply = pstr?.subcommands?.find((entry) =>
			entry.usage.includes("--apply"),
		);
		expect(review?.sideEffect).toBe("read");
		expect(review?.requires_approval).toBe(false);
		expect(apply?.sideEffect).toBe("write");
		expect(apply?.requires_approval).toBe(true);
	});

	test("keeps the public PSTR benchmark subset aligned with the registry", () => {
		const expected = [
			"pstr show|sh --json",
			"pstr rebuild|rb --json",
			"pstr validate|v --json",
			"pstr stale|st --json",
		];
		const scenarios = {
			"pstr-show": "afol pstr show --json",
			"pstr-rebuild": "afol pstr rebuild --json",
			"pstr-validate": "afol pstr validate --json",
			"pstr-stale": "afol pstr stale --json",
		} as const;
		const covered = Object.entries(scenarios).flatMap(
			([scenarioId, command]) => {
				const scenario = JSON.parse(
					readFileSync(
						join(
							process.cwd(),
							`src/builtin-assets/benchmarks/catalog/scenarios/pstr-integrity/${scenarioId}.json`,
						),
						"utf8",
					),
				) as {
					command?: string;
					sandbox?: boolean;
					oracle?: string;
					coverage?: { subcommands?: string[] };
				};
				expect(scenario.command).toBe(command);
				expect(scenario.sandbox).toBe(true);
				expect(scenario.oracle).toBe("normalized-envelope-and-threshold-check");
				expect(scenario.coverage?.subcommands).toHaveLength(1);
				return scenario.coverage?.subcommands ?? [];
			},
		);

		expect([...new Set(covered)].sort()).toEqual([...expected].sort());
	});

	test("publishes project-benchmark subcommand metadata", () => {
		const projectBenchmark = kernelRegistry.commands.find(
			(entry) => entry.command === "project-benchmark",
		);

		expect(projectBenchmark?.subcommands).toEqual([
			{
				usage: "list",
				sideEffect: "read",
				requires_approval: false,
				description: "List scored reference projects",
			},
			{
				usage: "show <project-id>",
				sideEffect: "read",
				requires_approval: false,
				description: "Inspect one reference project by id or name",
			},
			{
				usage: "matrix --for <axis>",
				sideEffect: "read",
				requires_approval: false,
				description:
					"Filter the score matrix by axis; omit --for for the full matrix",
			},
			{
				usage: "recommend --for <axis>",
				sideEffect: "read",
				requires_approval: false,
				description: "Rank the best reference projects for one axis",
			},
			{
				usage: "validate --strict",
				sideEffect: "read",
				requires_approval: false,
				description:
					"Fail validation on warnings; omit --strict for standard validation",
			},
			{
				usage: "generate --check",
				sideEffect: "read",
				requires_approval: false,
				description: "Check generated outputs without writing files",
			},
			{
				usage: "generate",
				sideEffect: "generated",
				requires_approval: true,
				description: "Refresh generated outputs with local approval",
			},
		]);
	});

	test("publishes ctx subcommand metadata for lazy section generation", () => {
		const ctx = kernelRegistry.commands.find(
			(entry) => entry.command === "ctx",
		);

		expect(ctx?.subcommands).toEqual([
			{
				usage: "build",
				sideEffect: "generated",
				requires_approval: true,
				description: "Rebuild the section index",
			},
			{
				usage: "bundle",
				sideEffect: "read",
				requires_approval: false,
				description:
					"Build a context bundle; --json for compact output, --json --full for complete payload",
			},
			{
				usage: "bundle --json [--full]",
				sideEffect: "read",
				requires_approval: false,
				description:
					"Return compact JSON; pass --full to include the complete bundle",
			},
			{
				usage: "bundle --persist-rule-injection",
				sideEffect: "generated",
				requires_approval: true,
				description:
					"Persist first-use rule injection state with local approval",
			},
			{
				usage: "section --ref <ref>",
				sideEffect: "generated",
				requires_approval: true,
				description: "Read one section and refresh sections if needed",
			},
			{
				usage: "explain [--full]",
				sideEffect: "read",
				requires_approval: false,
				description:
					"Explain bundle inputs; pass --full to include the complete bundle",
			},
			{
				usage: "tools",
				sideEffect: "generated",
				requires_approval: true,
				description: "List context helpers and refresh sections if needed",
			},
		]);
	});

	test("publishes local-state subcommand metadata", () => {
		const localState = kernelRegistry.commands.find(
			(entry) => entry.command === "local-state",
		);

		expect(localState?.guidance).toEqual([
			"Run rebuild before validation when indexes may be stale.",
			"Use --verbose only when the full index snapshot is needed.",
		]);
		expect(localState?.subcommands).toEqual([
			{
				usage: "freshness|fs --json",
				sideEffect: "read",
				requires_approval: false,
				description: "Check whether local-state indexes are fresh",
			},
			{
				usage: "rebuild|rb --json",
				sideEffect: "generated",
				requires_approval: true,
				description: "Refresh indexes and emit compact counts",
			},
			{
				usage: "rebuild|rb --json --verbose",
				sideEffect: "generated",
				requires_approval: true,
				description: "Refresh indexes and include full snapshots",
			},
		]);
	});

	test("publishes telemetry subcommand metadata", () => {
		const telemetry = kernelRegistry.commands.find(
			(entry) => entry.command === "telemetry",
		);

		expect(telemetry?.subcommands).toEqual([
			{
				usage: "query --limit <n>",
				sideEffect: "read",
				requires_approval: false,
				description: "Show recent telemetry events; defaults to latest 10",
			},
			{
				usage: "report --limit <n>",
				sideEffect: "read",
				requires_approval: false,
				description: "Summarize telemetry counts by session, type, and outcome",
			},
			{
				usage: "export --format jsonl",
				sideEffect: "read",
				requires_approval: false,
				description: "Export filtered telemetry events",
			},
		]);
	});

	test("keeps library, memory, health, and preflight runtime actions represented", () => {
		const usages = (command: string): string[] =>
			kernelRegistry.commands
				.find((entry) => entry.command === command)
				?.subcommands?.map((entry) => entry.usage) ?? [];

		expect(usages("library")).toEqual([
			"list|ls [--json]",
			"topic <topic>|--topic <topic> [--json]",
			"search <query>|--query <query> [--json]",
			"graph [--json]",
			"health [--json]",
			"doctor [--json]",
			"propose --topic <topic> --title <title> [--url <url>] [--source <id>] [--json]",
			"add-source --topic <topic> --url <url> [--title <title>] [--source <id>] [--json]",
			"add-claim --topic <topic> --claim <text> --source <id>[,<id>...] [--json]",
			"invalidate --topic <topic> --claim <claim-id> --reason <text> [--json]",
			"rebuild-index [--json]",
		]);
		expect(usages("memory")).toEqual([
			"list|ls [--json]",
			"show|get --id <id> [--json]",
			"search|find --query <query> [--json]",
			"render [--json]",
			"recall --query <query> [--json]",
			"add --id <id> --title <title> --body <text> [--tags <tag>[,<tag>...]] [--json]",
			"update|set --id <id> [--title <title>] [--body <text>] [--tags <tag>[,<tag>...]] [--json]",
			"archive --id <id> [--json]",
			"propose --id <id> --title <title> --body <text> [--tags <tag>[,<tag>...]] [--json]",
			"promote --id <id> [--json]",
			"reject --id <id> --reason <text> [--json]",
		]);
		expect(usages("health")).toEqual([
			"[core] [--json]",
			"full [--json]",
			"release|--release [--json]",
			"--area <adm|pstr|wb|memory|library|state|ctx|evolution|token_budget> [--deep] [--json]",
			"--deep [--json]",
		]);
		expect(usages("preflight")).toEqual(["<intent query> [--json]"]);

		const byUsage = (command: string) =>
			new Map(
				(
					kernelRegistry.commands.find((entry) => entry.command === command)
						?.subcommands ?? []
				).map((entry) => [entry.usage, entry.sideEffect]),
			);
		expect(byUsage("library").get("rebuild-index [--json]")).toBe("generated");
		for (const usage of [
			"propose --topic <topic> --title <title> [--url <url>] [--source <id>] [--json]",
			"add-source --topic <topic> --url <url> [--title <title>] [--source <id>] [--json]",
			"add-claim --topic <topic> --claim <text> --source <id>[,<id>...] [--json]",
			"invalidate --topic <topic> --claim <claim-id> --reason <text> [--json]",
		]) {
			expect(byUsage("library").get(usage)).toBe("write");
		}
		for (const usage of usages("memory").slice(5)) {
			expect(byUsage("memory").get(usage)).toBe("write");
		}
	});

	test("publishes fleet command metadata and repair safety flags", () => {
		const byCommand = new Map(
			kernelRegistry.commands.map((entry) => [entry.command, entry]),
		);
		const fleet = byCommand.get("fleet");
		expect(fleet).toBeDefined();
		expect(fleet?.subcommands?.map((entry) => entry.usage)).toEqual([
			"check --root <path> [--root <path>...] [--json]",
			"repair --derived --dry-run --root <path> [--json]",
			"repair --derived --root <path> --reason <text> [--json]",
		]);
		expect(fleet?.subcommands?.some((entry) => entry.requires_approval)).toBe(
			true,
		);
		expect(
			fleet?.subcommands?.some((entry) => entry.sideEffect === "write"),
		).toBe(true);
	});
});
