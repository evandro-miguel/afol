import { describe, expect, test } from "bun:test";
import { kernelRegistry } from "../registry";

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
		expect(byCommand.get("validate")?.sideEffect).toBe("read");
		expect(byCommand.get("init")?.sideEffect).toBe("write");
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
		expect(byCommand.get("adm")?.sideEffect).toBe("read");
		expect(byCommand.get("bench")?.sideEffect).toBe("read");
		expect(byCommand.get("project-benchmark")?.sideEffect).toBe("generated");
		expect(byCommand.get("spec")?.sideEffect).toBe("read");
		expect(byCommand.get("adr")?.sideEffect).toBe("read");
		expect(byCommand.get("changelog")?.sideEffect).toBe("read");
		expect(byCommand.get("health")?.sideEffect).toBe("read");
		expect(byCommand.get("db")?.sideEffect).toBe("read");
		expect(byCommand.get("doctor")?.sideEffect).toBe("read");
		expect(byCommand.get("maintenance")?.sideEffect).toBe("write");
		expect(byCommand.get("sweep")?.sideEffect).toBe("read");
		expect(byCommand.get("schema")?.sideEffect).toBe("write");
		expect(byCommand.get("preflight")?.sideEffect).toBe("read");

		for (const entry of kernelRegistry.commands) {
			expect(["read", "write", "append", "generated"]).toContain(
				entry.sideEffect,
			);
			expect(entry.command.length).toBeGreaterThan(0);
			expect(entry.description.length).toBeGreaterThan(0);
			expect(entry.description.length).toBeLessThanOrEqual(80);
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

	test("publishes maintenance review subcommand metadata", () => {
		const maintenance = kernelRegistry.commands.find(
			(entry) => entry.command === "maintenance",
		);

		expect(maintenance?.subcommands).toEqual([
			{
				usage: "weekly --dry-run",
				sideEffect: "read",
				description: "Preview weekly maintenance actions",
			},
			{
				usage: "monthly --dry-run",
				sideEffect: "read",
				description: "Preview monthly maintenance actions",
			},
			{
				usage: "review --area <area> --dry-run",
				sideEffect: "read",
				description:
					"Preview rules, skills, docs, commands, memory, library, organization",
			},
			{
				usage: "review --area <area> --note <text>",
				sideEffect: "write",
				description: "Record maintenance review freshness",
			},
		]);
	});

	test("publishes project-benchmark subcommand metadata", () => {
		const projectBenchmark = kernelRegistry.commands.find(
			(entry) => entry.command === "project-benchmark",
		);

		expect(projectBenchmark?.subcommands).toEqual([
			{
				usage: "list",
				sideEffect: "read",
				description: "List scored reference projects",
			},
			{
				usage: "show <project-id>",
				sideEffect: "read",
				description: "Inspect one reference project by id or name",
			},
			{
				usage: "matrix --for <axis>",
				sideEffect: "read",
				description:
					"Filter the score matrix by axis; omit --for for the full matrix",
			},
			{
				usage: "recommend --for <axis>",
				sideEffect: "read",
				description: "Rank the best reference projects for one axis",
			},
			{
				usage: "validate --strict",
				sideEffect: "read",
				description:
					"Fail validation on warnings; omit --strict for standard validation",
			},
			{
				usage: "generate --check",
				sideEffect: "read",
				description: "Check generated outputs without writing files",
			},
			{
				usage: "generate",
				sideEffect: "generated",
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
				description: "Rebuild the section index",
			},
			{
				usage: "bundle",
				sideEffect: "read",
				description: "Build a context bundle without persisting rule state",
			},
			{
				usage: "bundle --persist-rule-injection",
				sideEffect: "generated",
				description:
					"Persist first-use rule injection state with local approval",
			},
			{
				usage: "section --ref <ref>",
				sideEffect: "generated",
				description: "Read one section and refresh sections if needed",
			},
			{
				usage: "explain [--full]",
				sideEffect: "read",
				description:
					"Explain bundle inputs; pass --full to include the complete bundle",
			},
			{
				usage: "tools",
				sideEffect: "generated",
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
				description: "Check whether local-state indexes are fresh",
			},
			{
				usage: "rebuild|rb --json",
				sideEffect: "generated",
				description: "Refresh indexes and emit compact counts",
			},
			{
				usage: "rebuild|rb --json --verbose",
				sideEffect: "generated",
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
				description: "Show recent telemetry events; defaults to latest 10",
			},
			{
				usage: "report --limit <n>",
				sideEffect: "read",
				description: "Summarize telemetry counts by session, type, and outcome",
			},
			{
				usage: "export --format jsonl",
				sideEffect: "read",
				description: "Export filtered telemetry events",
			},
		]);
	});
});
