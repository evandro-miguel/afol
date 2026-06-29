import { describe, expect, test } from "bun:test";
import {
	buildCommandCatalog,
	buildCommandHelpJson,
	formatCatalogJson,
	formatCommandHelp,
	formatHelpText,
} from "../help";
import { kernelRegistry } from "../registry";

describe("help formatter", () => {
	test("formats compact deterministic help text", () => {
		const help = formatHelpText();
		const copy = formatHelpText({
			...kernelRegistry,
			commands: [...kernelRegistry.commands],
		});

		expect(help).toBe(copy);
		expect(help.split("\n").length).toBeLessThanOrEqual(70);
		expect(help).toContain("Usage: afol");
		expect(help).toContain("Commands");
		expect(help).toContain("\n  s/status");
		expect(help).toContain("s/status");
		expect(help).toContain("s/status[read] - project status");
		expect(help).toContain("v/validate");
		expect(help).toContain("v/validate[read] - validation gates");
		expect(help).toContain("n/new");
		expect(help).toContain("hk/hook");
		expect(help).toContain("bench");
		expect(help).toContain("pb/project-benchmark");
		expect(help).toContain(
			"pb/project-benchmark[generated] - compare references",
		);
		expect(help).toContain("Side effects");
		expect(help).toContain("write=changes files/state");
		expect(help).toContain("afol help <command>");
		expect(help).toContain("afol help --verbose");
		expect(help).toContain("a=afol");
		expect(help).not.toContain("do/doctor");
		expect(help).not.toContain("ma/maintenance");
	});

	test("keeps compact help lines scan-friendly", () => {
		const lines = formatHelpText().split("\n");

		expect(lines.length).toBeLessThanOrEqual(70);
		expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(
			120,
		);
	});

	test("lists every top-level command with a short compact description", () => {
		const help = formatHelpText(kernelRegistry);

		for (const spec of kernelRegistry.commands) {
			const alias = spec.aliases[0];
			const name = alias ? `${alias}/${spec.command}` : spec.command;
			expect(help).toContain(`${name}[${spec.sideEffect}] - `);
		}
	});

	test("formats verbose help with subcommand detail", () => {
		const help = formatHelpText(kernelRegistry, { verbose: true });
		const lines = help.split("\n");

		expect(lines.length).toBeGreaterThan(formatHelpText().split("\n").length);
		expect(lines.length).toBeLessThanOrEqual(330);
		expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(
			120,
		);
		expect(help).toContain("  project-benchmark");
		expect(help).toContain("    aliases: pb");
		expect(help).toContain("    effect: generated");
		expect(help).toContain(
			"    description: Compare AFOL against curated reference projects",
		);
		expect(help).toContain("    subcommands:");
		expect(help).toContain("      generate --check [read]");
		expect(help).toContain(
			"  --verbose  Expanded human catalog with subcommands",
		);
	});

	test("formats per-command help from registry metadata", () => {
		const help = formatCommandHelp("s", kernelRegistry);
		const unknown = formatCommandHelp("nope", kernelRegistry);

		expect(help).not.toBeNull();
		if (!help) {
			throw new Error("expected command help");
		}
		expect(help).toContain("Command: status");
		expect(help).toContain("Aliases: s");
		expect(help).toContain("Category: core");
		expect(help).toContain("Side effect: read");
		expect(help).toContain("Description: Show current project status");
		expect(unknown).toBeNull();
	});

	test("expands per-command help with tool-specific options and guidance", () => {
		const validateHelp = formatCommandHelp("validate", kernelRegistry);
		const updateHelp = formatCommandHelp("update", kernelRegistry);

		expect(validateHelp).not.toBeNull();
		expect(updateHelp).not.toBeNull();
		if (!validateHelp || !updateHelp) {
			throw new Error("expected command help");
		}

		expect(validateHelp).toContain("Guidance:");
		expect(validateHelp).toContain(
			"Use project validation for scaffold health before and after edits.",
		);
		expect(validateHelp).toContain("Subcommands:");
		expect(validateHelp).toContain("project --json [read]");
		expect(validateHelp).toContain("bench --pack <pack-id> --json [read]");
		expect(updateHelp).toContain("Guidance:");
		expect(updateHelp).toContain(
			"Prefer check, then preview, then apply --dry-run before real apply.",
		);
		expect(updateHelp).toContain("Subcommands:");
		expect(updateHelp).toContain("check [read]");
		expect(updateHelp).toContain("apply --dry-run [read]");
	});

	test("lists session radar in per-command help", () => {
		const help = formatCommandHelp("session", kernelRegistry);

		expect(help).not.toBeNull();
		expect(help).toContain("radar --json [read]");
	});

	test("makes risky file operations explicit in command help", () => {
		const help = formatCommandHelp("file", kernelRegistry);

		expect(help).not.toBeNull();
		if (!help) {
			throw new Error("expected file command help");
		}
		expect(help).toContain("Command: file");
		expect(help).toContain("Category: ops");
		expect(help).toContain("Side effect: write");
		expect(help).toContain(
			"Description: Safely patch, move, archive, and undo files; supports dry-run",
		);
		expect(help).toContain("pt|patch --path <path> --dry-run [read]");
		expect(help).toContain("pt|patch --path <path> [write]");
		expect(help).toContain("ud|undo --mutation-id <id> [write]");
	});

	test("documents maintenance review modes in command help", () => {
		const help = formatCommandHelp("maintenance", kernelRegistry);

		expect(help).not.toBeNull();
		if (!help) {
			throw new Error("expected maintenance command help");
		}
		expect(help).toContain("Command: maintenance");
		expect(help).toContain("Side effect: write");
		expect(help).toContain("Subcommands:");
		expect(help).toContain("weekly --dry-run [read]");
		expect(help).toContain("monthly --dry-run [read]");
		expect(help).toContain("review --area <area> --dry-run [read]");
		expect(help).toContain("review --area <area> --note <text> [write]");
	});

	test("publishes write-risk metadata for schema apply flows", () => {
		const help = buildCommandHelpJson("schema", kernelRegistry);

		expect(help).not.toBeNull();
		expect(help).toMatchObject({
			command: "schema",
			sideEffect: "write",
			description:
				"Review schema state; apply and resolver --write can write files",
			category: "ops",
		});
		expect(help?.subcommands).toEqual(
			expect.arrayContaining([
				{
					usage: "apply --dry-run",
					sideEffect: "read",
					description: "Preview schema apply without writing",
				},
				{
					usage: "apply",
					sideEffect: "write",
					description: "Write the detected schema pack for local callers",
				},
			]),
		);
	});

	test("formats project-benchmark help with safe and generated subcommands", () => {
		const help = formatCommandHelp("pb", kernelRegistry);

		expect(help).not.toBeNull();
		if (!help) {
			throw new Error("expected pb command help");
		}
		expect(help).toContain("Command: project-benchmark");
		expect(help).toContain("Aliases: pb");
		expect(help).toContain("Subcommands:");
		expect(help).toContain("list [read]");
		expect(help).toContain("show <project-id> [read]");
		expect(help).toContain("matrix --for <axis> [read]");
		expect(help).toContain("recommend --for <axis> [read]");
		expect(help).toContain("validate --strict [read]");
		expect(help).toContain("generate --check [read]");
		expect(help).toContain("generate [generated]");
	});

	test("formats ctx help with generated subcommands", () => {
		const help = formatCommandHelp("ctx", kernelRegistry);

		expect(help).not.toBeNull();
		if (!help) {
			throw new Error("expected ctx command help");
		}
		expect(help).toContain("Command: ctx");
		expect(help).toContain("Aliases: cx");
		expect(help).toContain("Side effect: generated");
		expect(help).toContain("Subcommands:");
		expect(help).toContain("build [generated]");
		expect(help).toContain("bundle [generated]");
		expect(help).toContain("section --ref <ref> [generated]");
		expect(help).toContain("explain [generated]");
		expect(help).toContain("tools [generated]");
	});

	test("formats telemetry help with read-only subcommands", () => {
		const help = formatCommandHelp("telemetry", kernelRegistry);

		expect(help).not.toBeNull();
		if (!help) {
			throw new Error("expected telemetry command help");
		}
		expect(help).toContain("Command: telemetry");
		expect(help).toContain("Subcommands:");
		expect(help).toContain("query --limit <n> [read]");
		expect(help).toContain("report --limit <n> [read]");
		expect(help).toContain("export --format jsonl [read]");
	});

	test("formats local-state help with freshness and rebuild discovery", () => {
		const help = formatCommandHelp("local-state", kernelRegistry);

		expect(help).not.toBeNull();
		if (!help) {
			throw new Error("expected local-state command help");
		}
		expect(help).toContain("Command: local-state");
		expect(help).toContain("Aliases: ls");
		expect(help).toContain("Guidance:");
		expect(help).toContain("Subcommands:");
		expect(help).toContain("freshness|fs --json [read]");
		expect(help).toContain("rebuild|rb --json [generated]");
		expect(help).toContain("rebuild|rb --json --verbose [generated]");
	});

	test("builds catalog json without fake aliases", () => {
		const catalog = buildCommandCatalog(kernelRegistry);
		const parsed = JSON.parse(formatCatalogJson(kernelRegistry)) as Array<{
			command: string;
			aliases: string[];
			kind: string;
			sideEffect: string;
			description: string;
			category?: string;
		}>;

		expect(parsed).toEqual(catalog);
		expect(parsed.map((entry) => entry.command)).toEqual(
			expect.arrayContaining([
				"status",
				"hook",
				"pstr",
				"adm",
				"project-benchmark",
			]),
		);
		expect(parsed.find((entry) => entry.command === "status")?.aliases).toEqual(
			["s"],
		);
		expect(parsed.find((entry) => entry.command === "adm")?.aliases).toEqual([
			"ad",
		]);
		expect(
			parsed.every((entry) => !entry.aliases.includes(entry.command)),
		).toBe(true);
	});

	test("builds single command json from registry metadata", () => {
		const help = buildCommandHelpJson("status", kernelRegistry);
		expect(help).not.toBeNull();
		expect(help).toEqual({
			command: "status",
			aliases: ["s"],
			kind: "status",
			sideEffect: "read",
			description: "Show current project status",
			category: "core",
			subcommands: [
				{
					usage: "--json",
					sideEffect: "read",
					description: "Emit machine-readable project status",
				},
				{
					usage: "--session <session-id>",
					sideEffect: "read",
					description: "Resolve status around a specific session",
				},
			],
		});
		expect(buildCommandHelpJson("nope", kernelRegistry)).toBeNull();
	});

	test("does not advertise unsupported init json output", () => {
		const help = buildCommandHelpJson("init", kernelRegistry);

		expect(help).not.toBeNull();
		expect(help?.subcommands).toEqual([
			{
				usage: "--dry-run",
				sideEffect: "read",
				description: "Preview scaffold install without writing",
			},
		]);
	});

	test("builds project-benchmark json with subcommand metadata", () => {
		const help = buildCommandHelpJson("pb", kernelRegistry);
		expect(help).not.toBeNull();
		expect(help?.subcommands).toEqual([
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

	test("builds ctx json with generated subcommand metadata", () => {
		const help = buildCommandHelpJson("ctx", kernelRegistry);
		expect(help).not.toBeNull();
		expect(help).toEqual({
			command: "ctx",
			aliases: ["cx"],
			kind: "ctx",
			sideEffect: "generated",
			description: "Inspect context bundles",
			category: "inspect",
			subcommands: [
				{
					usage: "build",
					sideEffect: "generated",
					description: "Rebuild the section index",
				},
				{
					usage: "bundle",
					sideEffect: "generated",
					description: "Build a context bundle and refresh sections if needed",
				},
				{
					usage: "section --ref <ref>",
					sideEffect: "generated",
					description: "Read one section and refresh sections if needed",
				},
				{
					usage: "explain",
					sideEffect: "generated",
					description: "Explain bundle inputs and refresh sections if needed",
				},
				{
					usage: "tools",
					sideEffect: "generated",
					description: "List context helpers and refresh sections if needed",
				},
			],
		});
	});

	test("builds local-state json with subcommand metadata", () => {
		const help = buildCommandHelpJson("local-state", kernelRegistry);
		expect(help).not.toBeNull();
		expect(help).toEqual({
			command: "local-state",
			aliases: ["ls"],
			kind: "localState",
			sideEffect: "generated",
			description: "Inspect local project indexes",
			category: "inspect",
			guidance: [
				"Run rebuild before validation when indexes may be stale.",
				"Use --verbose only when the full index snapshot is needed.",
			],
			subcommands: [
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
			],
		});
	});
});
