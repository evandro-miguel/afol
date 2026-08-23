import type { CommandSpec } from "../../registry";

export type ToolProfileId =
	| "orchestrator"
	| "planner"
	| "researcher"
	| "coder"
	| "tester"
	| "reviewer";

export type ToolCatalog = {
	version: "2.2.0";
	generated_from: "cli/registry.ts";
	description: string;
	tool_profiles: {
		kind: "harness_metadata";
		enforcement: "none";
		profiles: Array<{
			id: ToolProfileId;
			description: string;
			tool_ids: string[];
		}>;
	};
	tools: Array<{
		id: string;
		name: string;
		tool: "afol";
		wrapper_command: string;
		aliases: string[];
		stability: CommandSpec["stability"];
		category: NonNullable<CommandSpec["category"]>;
		type: NonNullable<CommandSpec["category"]>;
		side_effect: CommandSpec["sideEffect"];
		execution_mode: "read-only" | "on-demand";
		description: string;
		subcommands: Array<{
			usage: string;
			side_effect: CommandSpec["sideEffect"];
			description: string;
		}>;
	}>;
};

function titleCase(value: string): string {
	return value
		.split("-")
		.map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
		.join(" ");
}

function isStrictlyReadOnly(spec: CommandSpec): boolean {
	return (
		spec.sideEffect === "read" &&
		(spec.subcommands ?? []).every(
			(subcommand) => subcommand.sideEffect === "read",
		)
	);
}

function profileToolIds(
	commands: readonly CommandSpec[],
	profile: ToolProfileId,
): string[] {
	switch (profile) {
		case "orchestrator":
			return commands.map((command) => command.command);
		case "planner":
		case "researcher":
		case "reviewer":
			return commands
				.filter(isStrictlyReadOnly)
				.map((command) => command.command);
		case "coder":
			return commands
				.filter(
					(command) =>
						command.category === "core" || command.category === "workflow",
				)
				.map((command) => command.command);
		case "tester":
			return commands
				.filter((command) =>
					[
						"status",
						"validate",
						"verify-tasks",
						"health",
						"bench",
						"project-benchmark",
						"preflight",
					].includes(command.command),
				)
				.map((command) => command.command);
	}
}

const PROFILE_DESCRIPTIONS: Record<ToolProfileId, string> = {
	orchestrator:
		"External harness-facing coordination toolset; AFOL does not orchestrate, select, invoke, retry, or supervise agents or models.",
	planner:
		"Read-only orientation and planning; excludes commands with mutable subcommands.",
	researcher:
		"Read-only investigation; excludes commands with mutable subcommands.",
	coder: "Implement through core and workflow commands.",
	tester: "Run focused validation and verification commands.",
	reviewer: "Read-only review; excludes commands with mutable subcommands.",
};

export function buildToolCatalog(
	commands: readonly CommandSpec[],
): ToolCatalog {
	const profiles = (
		[
			"orchestrator",
			"planner",
			"researcher",
			"coder",
			"tester",
			"reviewer",
		] as const
	).map((id) => ({
		id,
		description: PROFILE_DESCRIPTIONS[id],
		tool_ids: profileToolIds(commands, id),
	}));

	return {
		version: "2.2.0",
		generated_from: "cli/registry.ts",
		description:
			"Static AFOL-only command catalog derived from the registry-backed help surface.",
		tool_profiles: {
			kind: "harness_metadata",
			enforcement: "none",
			profiles,
		},
		tools: commands.map((spec) => ({
			id: spec.command,
			name: `AFOL ${titleCase(spec.command)}`,
			tool: "afol",
			wrapper_command: `afol ${spec.command}`,
			aliases: [...spec.aliases],
			stability: spec.stability,
			category: spec.category ?? "core",
			type: spec.category ?? "core",
			side_effect: spec.sideEffect,
			execution_mode: isStrictlyReadOnly(spec) ? "read-only" : "on-demand",
			description: spec.description,
			subcommands: (spec.subcommands ?? []).map((subcommand) => ({
				usage: subcommand.usage,
				side_effect: subcommand.sideEffect,
				description: subcommand.description,
			})),
		})),
	};
}
