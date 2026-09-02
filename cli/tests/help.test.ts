import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildCommandCatalog,
	buildCommandHelpJson,
	formatCatalogJson,
	formatCommandHelp,
	formatHelpText,
} from "../help";
import { DIRECT_DISPATCH_KINDS, SUBCOMMAND_DISPATCH_GROUPS } from "../main";
import { kernelRegistry, requiresApprovalForSideEffect } from "../registry";

const repoRoot = join(import.meta.dir, "..", "..");
const ROOT_HELP_OUTPUT_TOKEN_BUDGET = 610;

function estimateOutputTokens(output: string): number {
	return Math.ceil(Buffer.byteLength(output, "utf8") / 4);
}

describe("help formatter", () => {
	test("formats compact deterministic help text", () => {
		const help = formatHelpText();
		const copy = formatHelpText({
			...kernelRegistry,
			commands: [...kernelRegistry.commands],
		});

		expect(help).toBe(copy);
		expect(help.split("\n").length).toBeLessThanOrEqual(71);
		expect(help).toContain("Usage: afol");
		expect(help).toContain("Agent fast path (active session)");
		expect(help).toContain(
			'afol st T-01 -> afol d T-01 -x "<check>" -> afol c',
		);
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
		expect(help).toContain("evolve[read] - evolution status");
		expect(help).toContain(
			"pb/project-benchmark[generated] - compare references",
		);
		expect(help).toContain("fleet[write] - fleet state");
		expect(help).toContain("Side effects");
		expect(help).toContain("read=none");
		expect(help).toContain("write=state");
		expect(help).toContain("  help --verbose|<command>");
		expect(help).toContain("a=afol");
		expect(help).not.toContain("do/doctor");
		expect(help).not.toContain("ma/maintenance");
	});

	test("keeps root help within the agent output token budget", () => {
		const output = `${formatHelpText()}\n`;

		expect(estimateOutputTokens(output)).toBeLessThanOrEqual(
			ROOT_HELP_OUTPUT_TOKEN_BUDGET,
		);
	});

	test("keeps compact help lines scan-friendly", () => {
		const lines = formatHelpText().split("\n");

		expect(lines.length).toBeLessThanOrEqual(71);
		expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(
			120,
		);
	});

	test("formats intent-filtered help", () => {
		const planning = formatHelpText(kernelRegistry, { intent: "planning" });
		const execution = formatHelpText(kernelRegistry, { intent: "execution" });
		const maintenance = formatHelpText(kernelRegistry, {
			intent: "maintenance",
		});

		expect(planning).toContain("Commands for planning");
		expect(planning).toContain("pf/preflight");
		expect(planning).toContain("pb/project-benchmark");
		expect(planning).toContain("evolve");
		expect(planning).not.toContain("qt/quick-task");
		expect(execution).toContain("Commands for execution");
		expect(execution).toContain("Agent fast path (active session)");
		expect(execution).toContain("n/new");
		expect(execution).toContain("qt/quick-task");
		expect(execution).not.toContain("ma/maintenance");
		expect(maintenance).toContain("Commands for maintenance");
		expect(maintenance).toContain("ht/health");
		expect(maintenance).toContain("mt/maintenance");
		expect(maintenance).not.toContain("n/new");
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
		expect(lines.length).toBeLessThanOrEqual(450);
		expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(
			120,
		);
		expect(help).toContain("  project-benchmark");
		expect(help).toContain("    aliases: pb");
		expect(help).toContain(
			"project-benchmark [generated] - Compare AFOL against curated reference projects",
		);
		expect(help).toContain("    subcommands:");
		expect(help).toContain("      generate --check [read]");
		expect(help).toContain("  --verbose  details");
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

	test("formats fleet command help", () => {
		const help = formatCommandHelp("fleet", kernelRegistry);

		expect(help).not.toBeNull();
		if (!help) {
			throw new Error("expected fleet command help");
		}
		expect(help).toContain("Command: fleet");
		expect(help).toContain("Aliases: none");
		expect(help).toContain("Category: ops");
		expect(help).toContain("Side effect: write");
		expect(help).toContain("check --root <path> [--root <path>...] [--json]");
		expect(help).toContain(
			"repair --derived --root <path> --reason <text> [--json]",
		);
	});

	test("advertises compact and verbose verify-task report options", () => {
		const help = formatCommandHelp("verify-tasks", kernelRegistry);

		expect(help).not.toBeNull();
		if (!help) {
			throw new Error("expected verify-tasks command help");
		}
		expect(help).toContain("Aliases: vt");
		expect(help).toContain("[session-path] [--strict] [--verbose] [read]");
		expect(help).toContain("--session <session-id> --json [read]");
	});

	test("routes command group help before subcommand parsers", () => {
		const helpGroups = SUBCOMMAND_DISPATCH_GROUPS.map((group) => ({
			group,
			spec:
				kernelRegistry.commands.find((spec) => spec.command === group) ??
				kernelRegistry.commands.find((spec) => spec.kind === group),
		}));
		expect(
			helpGroups
				.filter(({ spec }) => spec === undefined)
				.map(({ group }) => group),
		).toEqual([]);
		const tempRoot = mkdtempSync(join(tmpdir(), "afol-help-"));
		const cliPath = join(repoRoot, "cli/main.ts");

		try {
			for (const { spec } of helpGroups) {
				if (!spec) {
					continue;
				}
				const result = spawnSync("bun", [cliPath, spec.command, "--help"], {
					cwd: tempRoot,
					encoding: "utf8",
					shell: false,
				});

				expect(result.status).toBe(0);
				expect(result.stderr).toBe("");
				expect(result.stdout).toContain(`Command: ${spec.command}`);
			}
			for (const [args, expectedCommand] of [
				[["adr", "-h"], "adr"],
				[["adr", "--help", "--verbose"], "adr"],
				[["adr", "new", "--help"], "adr"],
				[["render", "--help"], "render"],
				[["render", "-h"], "render"],
				[["memory", "render", "--help"], "render"],
			] as const) {
				const result = spawnSync("bun", [cliPath, ...args], {
					cwd: tempRoot,
					encoding: "utf8",
					shell: false,
				});

				expect(result.status).toBe(0);
				expect(result.stderr).toBe("");
				expect(result.stdout).toContain(`Command: ${expectedCommand}`);
			}
			for (const args of [
				["help", "--help"],
				["help", "-h"],
			] as const) {
				const result = spawnSync("bun", [cliPath, ...args], {
					cwd: tempRoot,
					encoding: "utf8",
					shell: false,
				});

				expect(result.status).toBe(0);
				expect(result.stderr).toBe("");
				expect(result.stdout).toContain("Usage: afol");
			}
			const directHelpCommands: (typeof kernelRegistry.commands)[number][] = [];
			for (const kind of DIRECT_DISPATCH_KINDS) {
				const spec = kernelRegistry.commands.find(
					(entry) => entry.kind === kind,
				);
				if (
					spec &&
					spec.kind !== "verifyTasks" &&
					!["new", "start", "close"].includes(spec.command)
				) {
					directHelpCommands.push(spec);
				}
			}
			expect(directHelpCommands.length).toBe(DIRECT_DISPATCH_KINDS.length - 4);
			for (const spec of directHelpCommands) {
				const result = spawnSync("bun", [cliPath, spec.command, "--help"], {
					cwd: tempRoot,
					encoding: "utf8",
					shell: false,
				});

				expect(result.status).toBe(0);
				expect(result.stderr).toBe("");
				expect(result.stdout).toContain(`Command: ${spec.command}`);
			}
			const shortStartHelp = spawnSync("bun", [cliPath, "st", "--help"], {
				cwd: tempRoot,
				encoding: "utf8",
				shell: false,
			});
			expect(shortStartHelp.status).toBe(0);
			expect(shortStartHelp.stderr).toBe("");
			expect(shortStartHelp.stdout).toContain("Usage: afol start");
			const intentResult = spawnSync(
				"bun",
				[cliPath, "help", "--for", "planning"],
				{
					cwd: tempRoot,
					encoding: "utf8",
					shell: false,
				},
			);
			expect(intentResult.status).toBe(0);
			expect(intentResult.stderr).toBe("");
			expect(intentResult.stdout).toContain("Commands for planning");
			expect(intentResult.stdout).toContain("pf/preflight");

			const invalidIntent = spawnSync(
				"bun",
				[cliPath, "help", "--for", "unknown"],
				{
					cwd: tempRoot,
					encoding: "utf8",
					shell: false,
				},
			);
			expect(invalidIntent.status).toBe(2);
			expect(invalidIntent.stderr).toContain("err unknown-help-intent");
			expect(existsSync(join(tempRoot, ".afol"))).toBe(false);
		} finally {
			rmSync(tempRoot, { recursive: true, force: true });
		}
	}, 60_000);

	test("expands per-command help with tool-specific options and guidance", () => {
		const validateHelp = formatCommandHelp("validate", kernelRegistry);
		const updateHelp = formatCommandHelp("update", kernelRegistry);
		const initHelp = formatCommandHelp("init", kernelRegistry);
		const bootstrapHelp = formatCommandHelp("bootstrap", kernelRegistry);

		expect(validateHelp).not.toBeNull();
		expect(updateHelp).not.toBeNull();
		expect(initHelp).not.toBeNull();
		expect(bootstrapHelp).not.toBeNull();
		if (!validateHelp || !updateHelp || !initHelp || !bootstrapHelp) {
			throw new Error("expected command help");
		}

		expect(validateHelp).toContain("Guidance:");
		expect(validateHelp).toContain(
			"Use project validation for scaffold health before and after edits.",
		);
		expect(validateHelp).toContain("Subcommands:");
		expect(validateHelp).toContain("project --json [read]");
		expect(validateHelp).toContain("project --strict --json [read]");
		expect(validateHelp).toContain("bench --pack <pack-id> --json [read]");
		expect(validateHelp).toContain(
			"bench --pack governance-history --timing-mode observe --json [read]",
		);
		expect(validateHelp).toContain("Observe timing; non-timing gates block");
		expect(updateHelp).toContain("Guidance:");
		expect(updateHelp).toContain(
			"Prefer check, then preview, then apply --dry-run before real apply.",
		);
		expect(updateHelp).toContain("Subcommands:");
		expect(updateHelp).toContain("check [read]");
		expect(updateHelp).toContain("apply --dry-run [read]");
		expect(initHelp).toContain(
			"Read AGENTS.md and resolve .afol/adm/rules before applying changes.",
		);
		expect(initHelp).toContain(
			"Use afol help init for current flags; preserve existing history and migrations.",
		);
		expect(bootstrapHelp).toContain(
			"Read the target AGENTS.md and resolve its .afol/adm/rules when present.",
		);
		expect(bootstrapHelp).toContain(
			"Use afol help bootstrap for current flags; preview first and preserve history and migrations.",
		);
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
			"Description: Safely append, move, archive, and undo files; supports dry-run",
		);
		expect(help).toContain("append|patch --path <path> --dry-run [read]");
		expect(help).toContain("append|patch --path <path> [write]");
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
			requires_approval: true,
			description:
				"Review schema state; apply and resolver --write can write files",
			category: "ops",
		});
		expect(help?.subcommands).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					usage: "apply --dry-run",
					sideEffect: "read",
					requires_approval: false,
					description: "Preview schema apply without writing",
				}),
				expect.objectContaining({
					usage: "apply",
					sideEffect: "write",
					requires_approval: true,
					description: "Write the detected schema pack for local callers",
				}),
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
		expect(help).toContain("bundle [read]");
		expect(help).toContain("bundle --persist-rule-injection [generated]");
		expect(help).toContain("section --ref <ref> [generated]");
		expect(help).toContain("explain [--full] [read]");
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

	test("documents local-operator shell verification without a catalog subcommand", () => {
		const help = formatCommandHelp("done", kernelRegistry);
		const done = buildCommandCatalog(kernelRegistry).find(
			(entry) => entry.command === "done",
		);

		expect(help).not.toBeNull();
		expect(help).toContain(
			'Use --test-shell "<cmd>" for one shell verification (local operator only).',
		);
		expect(done?.subcommands?.map((entry) => entry.usage)).not.toContain(
			'--test-shell "<cmd>"',
		);
	});

	test("formats state help with every supported action", () => {
		const help = formatCommandHelp("state", kernelRegistry);

		expect(help).not.toBeNull();
		if (!help) {
			throw new Error("expected state command help");
		}
		expect(help).toContain("Command: state");
		expect(help).toContain("show|sh [--session <session-id>] [--json] [read]");
		expect(help).toContain(
			"validate|v [--session <session-id>] [--json] [read]",
		);
		expect(help).toContain(
			"sync|sy [--session <session-id>] [--json] [generated]",
		);
		expect(help).toContain(
			"export|ex [--session <session-id>] [--json] [read]",
		);
	});

	test("builds catalog json without fake aliases", () => {
		const catalog = buildCommandCatalog(kernelRegistry);
		const parsed = JSON.parse(formatCatalogJson(kernelRegistry)) as Array<{
			command: string;
			aliases: string[];
			kind: string;
			sideEffect: string;
			requires_approval: boolean;
			description: string;
			capabilities?: string[];
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
				"evolve",
			]),
		);
		expect(parsed.find((entry) => entry.command === "status")?.aliases).toEqual(
			["s"],
		);
		expect(parsed.find((entry) => entry.command === "adm")?.aliases).toEqual([
			"ad",
		]);
		expect(
			parsed.find((entry) => entry.command === "status")?.requires_approval,
		).toBe(false);
		expect(
			parsed.find((entry) => entry.command === "maintenance")
				?.requires_approval,
		).toBe(true);
		expect(
			parsed.every((entry) => typeof entry.requires_approval === "boolean"),
		).toBe(true);
		expect(
			parsed.every((entry) => !entry.aliases.includes(entry.command)),
		).toBe(true);
		expect(
			parsed.find((entry) => entry.command === "evolve")?.capabilities,
		).toEqual([
			"evolution.suggest.first-session/v1",
			"evolution.candidates/v1",
		]);
		expect(
			parsed.find((entry) => entry.command === "status"),
		).not.toHaveProperty("capabilities");
	});

	test("projects optional capabilities without sharing registry arrays", () => {
		const catalog = buildCommandCatalog(kernelRegistry);
		const evolve = catalog.find((entry) => entry.command === "evolve");

		expect(evolve?.capabilities).toEqual([
			"evolution.suggest.first-session/v1",
			"evolution.candidates/v1",
		]);
		evolve?.capabilities?.push("test-only");
		expect(
			kernelRegistry.commands.find((entry) => entry.command === "evolve")
				?.capabilities,
		).toEqual([
			"evolution.suggest.first-session/v1",
			"evolution.candidates/v1",
		]);
	});

	test("builds intent-filtered catalog json", () => {
		const parsed = JSON.parse(
			formatCatalogJson(kernelRegistry, { intent: "maintenance" }),
		) as Array<{ command: string }>;
		const commands = parsed.map((entry) => entry.command);

		expect(commands).toContain("maintenance");
		expect(commands).toContain("health");
		expect(commands).not.toContain("new");
	});

	test("builds single command json from registry metadata", () => {
		const help = buildCommandHelpJson("status", kernelRegistry);
		expect(help).not.toBeNull();
		expect(help).toEqual({
			command: "status",
			aliases: ["s"],
			kind: "status",
			sideEffect: "read",
			requires_approval: false,
			stability: "stable",
			description: "Show current project status",
			category: "core",
			subcommands: [
				{
					usage: "--json",
					sideEffect: "read",
					requires_approval: false,
					description: "Emit machine-readable project status",
				},
				{
					usage: "--health",
					sideEffect: "read",
					requires_approval: false,
					description: "Include global health findings",
				},
				{
					usage: "--session <session-id>",
					sideEffect: "read",
					requires_approval: false,
					description: "Resolve status around a specific session",
				},
				{
					usage: "--task-id <task-id>",
					sideEffect: "read",
					requires_approval: false,
					description: "Resolve a specific task in the selected session",
				},
			],
		});
		expect(buildCommandHelpJson("nope", kernelRegistry)).toBeNull();
	});

	test("projects evolve capabilities in single-command json only", () => {
		expect(buildCommandHelpJson("evolve", kernelRegistry)).toMatchObject({
			command: "evolve",
			capabilities: [
				"evolution.suggest.first-session/v1",
				"evolution.candidates/v1",
			],
		});
		expect(buildCommandHelpJson("status", kernelRegistry)).not.toHaveProperty(
			"capabilities",
		);
	});

	test("advertises init json preview output", () => {
		const help = buildCommandHelpJson("init", kernelRegistry);

		expect(help).not.toBeNull();
		expect(help?.subcommands).toEqual([
			{
				usage: "--dry-run [--json]",
				sideEffect: "read",
				requires_approval: false,
				description:
					"Preview scaffold install without writing; --json emits a result envelope",
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

	test("builds ctx json with generated subcommand metadata", () => {
		const help = buildCommandHelpJson("ctx", kernelRegistry);
		expect(help).not.toBeNull();
		expect(help).toEqual({
			command: "ctx",
			aliases: ["cx"],
			kind: "ctx",
			sideEffect: "generated",
			requires_approval: true,
			stability: "stable",
			description: "Inspect context bundles",
			category: "inspect",
			subcommands: [
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
			],
		});
	});

	test("every subcommand in catalog json has correct requires_approval per sideEffect", () => {
		const catalog = buildCommandCatalog(kernelRegistry);
		for (const entry of catalog) {
			if (!entry.subcommands?.length) continue;
			for (const sub of entry.subcommands) {
				expect(typeof sub.requires_approval).toBe("boolean");
				expect(sub.requires_approval).toBe(
					requiresApprovalForSideEffect(sub.sideEffect),
				);
			}
		}
	});

	test("every per-command json subcommand has correct requires_approval", () => {
		for (const spec of kernelRegistry.commands) {
			const help = buildCommandHelpJson(spec.command, kernelRegistry);
			if (!help?.subcommands?.length) continue;
			for (const sub of help.subcommands) {
				expect(typeof sub.requires_approval).toBe("boolean");
				expect(sub.requires_approval).toBe(
					requiresApprovalForSideEffect(sub.sideEffect),
				);
			}
		}
	});

	test("builds local-state json with subcommand metadata", () => {
		const help = buildCommandHelpJson("local-state", kernelRegistry);
		expect(help).not.toBeNull();
		expect(help).toEqual({
			command: "local-state",
			aliases: ["ls"],
			kind: "localState",
			sideEffect: "generated",
			requires_approval: true,
			stability: "stable",
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
			],
		});
	});
});
