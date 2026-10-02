import type { OperationContext } from "./core/operation-context";
import type { SubCommandResolution } from "./router";

type SubcommandHandler = (
	resolution: SubCommandResolution,
	root: string,
	operationCtx: OperationContext,
) => Promise<number>;

const SUBCOMMAND_HANDLERS = {
	adm: async (resolution, root, _operationCtx) => {
		const { runAdmCommand } = await import("./commands/adm");
		return runAdmCommand(resolution.action, resolution.args, root);
	},
	governance: async (resolution, root, operationCtx) => {
		const { runGovernanceCommand } = await import("./commands/governance");
		return runGovernanceCommand(
			resolution.action,
			resolution.args,
			root,
			undefined,
			operationCtx,
		);
	},
	health: async (resolution, root, _operationCtx) => {
		const { runHealthCommand } = await import("./commands/health");
		return runHealthCommand(
			[resolution.action, ...resolution.args].filter(Boolean),
			root,
		);
	},
	db: async (resolution, root, _operationCtx) => {
		const { runDbCommand } = await import("./commands/db");
		return runDbCommand(resolution.action, resolution.args, root);
	},
	doctor: async (resolution, root, _operationCtx) => {
		const { runDoctorCommand } = await import("./commands/doctor");
		return runDoctorCommand(
			[resolution.action, ...resolution.args].filter(Boolean),
			root,
		);
	},
	maintenance: async (resolution, root, operationCtx) => {
		const { runMaintenanceCommand } = await import("./commands/maintenance");
		return runMaintenanceCommand(
			[resolution.action, ...resolution.args].filter(Boolean),
			root,
			undefined,
			operationCtx,
		);
	},
	pstr: async (resolution, root, operationCtx) => {
		const { runPstrCommand } = await import("./commands/pstr");
		return runPstrCommand(
			resolution.action,
			resolution.args,
			root,
			undefined,
			operationCtx,
		);
	},
	schema: async (resolution, root, operationCtx) => {
		const { runSchemaCommand } = await import("./commands/schema-cmd");
		return runSchemaCommand(
			resolution.action,
			resolution.args,
			root,
			undefined,
			operationCtx,
		);
	},
	session: async (resolution, root, operationCtx) => {
		const { runSessionCommand } = await import("./commands/session");
		return runSessionCommand(
			resolution.action,
			resolution.args,
			root,
			undefined,
			operationCtx,
		);
	},
	bench: async (resolution, root, _operationCtx) => {
		if (resolution.action === "" && resolution.args.includes("--pack")) {
			const { runValidationCommand } = await import("./validate/command");
			return runValidationCommand(root, ["bench", ...resolution.args]);
		}
		const { runBenchCommand } = await import("./commands/bench");
		return runBenchCommand(resolution.action, resolution.args, root);
	},
	projectBenchmark: async (resolution, root, operationCtx) => {
		const { runProjectBenchmarkCommand } = await import(
			"./commands/project-benchmark"
		);
		return runProjectBenchmarkCommand(
			resolution.action,
			resolution.args,
			root,
			undefined,
			operationCtx,
		);
	},
	sweep: async (resolution, root, _operationCtx) => {
		const { runSweepCommand } = await import("./commands/sweep");
		return runSweepCommand(resolution.action, resolution.args, root);
	},
	spec: async (resolution, root, _operationCtx) => {
		const { runSpecCommand } = await import("./commands/spec");
		return runSpecCommand(resolution.action, resolution.args, root);
	},
	ux: async (resolution, root, operationCtx) => {
		const { runUxCommand } = await import("./commands/ux");
		return runUxCommand(
			resolution.action,
			resolution.args,
			root,
			undefined,
			operationCtx,
		);
	},
	adr: async (resolution, root, _operationCtx) => {
		const { runAdrCommand } = await import("./commands/adr");
		return runAdrCommand(resolution.action, resolution.args, root);
	},
	changelog: async (resolution, root, _operationCtx) => {
		const { runChangelogCommand } = await import("./commands/changelog");
		return runChangelogCommand(resolution.action, resolution.args, root);
	},
	ctx: async (resolution, root, operationCtx) => {
		const { runContextCommand } = await import("./commands/context");
		return runContextCommand(
			resolution.action,
			resolution.args,
			root,
			undefined,
			operationCtx,
		);
	},
	library: async (resolution, root, operationCtx) => {
		const { runLibraryCommand } = await import("./commands/library");
		return runLibraryCommand(
			resolution.action,
			resolution.args,
			root,
			undefined,
			operationCtx,
		);
	},
	memory: async (resolution, root, operationCtx) => {
		const { runMemoryCommand } = await import("./commands/memory");
		return runMemoryCommand(
			resolution.action,
			resolution.args,
			root,
			undefined,
			operationCtx,
		);
	},
	evolve: async (resolution, root, operationCtx) => {
		const { runEvolveCommand } = await import("./commands/evolve");
		return runEvolveCommand(
			resolution.action,
			resolution.args,
			root,
			undefined,
			operationCtx,
		);
	},
	state: async (resolution, root, _operationCtx) => {
		const { runStateCommand } = await import("./commands/state");
		return runStateCommand(resolution.action, resolution.args, root);
	},
	adapter: async (resolution, root, _operationCtx) => {
		const { runAdapterCommand } = await import("./commands/adapter");
		return runAdapterCommand(resolution.action, resolution.args, root);
	},
	telemetry: async (resolution, root, _operationCtx) => {
		const { runTelemetryCommand } = await import("./commands/telemetry");
		return runTelemetryCommand(resolution.action, resolution.args, root);
	},
	receipt: async (resolution, root, _operationCtx) => {
		const { runReceiptCommand } = await import("./commands/receipt");
		return runReceiptCommand(resolution.action, resolution.args, root);
	},
	artifact: async (resolution, root, operationCtx) => {
		const { runArtifactCommand } = await import("./commands/artifact");
		return runArtifactCommand(
			resolution.action,
			resolution.args,
			root,
			undefined,
			operationCtx,
		);
	},
	hydrate: async (resolution, root, _operationCtx) => {
		const { runHydrateCommand } = await import("./commands/hydrate");
		const hydrateArgs = resolution.action
			? [resolution.action, ...resolution.args]
			: resolution.args;
		return runHydrateCommand("hydrate", hydrateArgs, root);
	},
} satisfies Record<string, SubcommandHandler>;

export const SUBCOMMAND_DISPATCH_GROUPS = Object.freeze(
	Object.keys(SUBCOMMAND_HANDLERS),
);

export function dispatchSubcommand(
	resolution: SubCommandResolution,
	root: string,
	operationCtx: OperationContext,
): Promise<number> | undefined {
	if (!Object.hasOwn(SUBCOMMAND_HANDLERS, resolution.group)) return undefined;
	return SUBCOMMAND_HANDLERS[
		resolution.group as keyof typeof SUBCOMMAND_HANDLERS
	](resolution, root, operationCtx);
}
