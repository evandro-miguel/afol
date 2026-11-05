import type { OperationContext } from "./core/operation-context";
import type { LoadedProjectRoot } from "./services/project/root";

type RootFreeHandler = (
	args: string[],
	operationCtx: OperationContext,
) => Promise<number>;
type ProjectHandler = (
	args: string[],
	project: LoadedProjectRoot,
	operationCtx: OperationContext,
) => Promise<number>;
type DirectDispatchEntry =
	| { requiresProject: false; run: RootFreeHandler }
	| { requiresProject: true; run: ProjectHandler };

const DIRECT_DISPATCH_TABLE: Record<string, DirectDispatchEntry> = {
	bootstrap: {
		requiresProject: false,
		run: async (args, ctx) => {
			const { runBootstrapCommand } = await import("./commands/bootstrap");
			return runBootstrapCommand(args, {}, ctx);
		},
	},
	init: {
		requiresProject: false,
		run: async (args, ctx) => {
			const { runInitCommand } = await import("./commands/init");
			return runInitCommand(args, ctx);
		},
	},
	validate: {
		requiresProject: true,
		run: async (args, project) => {
			const { resolveValidateInvocation, runValidationCommand } = await import(
				"./validate/command"
			);
			const invocation = resolveValidateInvocation(args);
			if (invocation.kind === "benchmark")
				return runValidationCommand(project.root, invocation.args);
			const { runValidateCommand } = await import("./commands/validate");
			return runValidateCommand(project.root, invocation.args);
		},
	},
	status: {
		requiresProject: true,
		run: async (args, project) => {
			const { runStatusCommand } = await import("./commands/status");
			return runStatusCommand(project.root, args, undefined, project);
		},
	},
	feedback: {
		requiresProject: false,
		run: async (args) => {
			const { runFeedbackCommand } = await import("./commands/feedback");
			const [action = "status", ...feedbackArgs] = args;
			return runFeedbackCommand(action, feedbackArgs);
		},
	},
	new: {
		requiresProject: true,
		run: async (args, project, ctx) => {
			const { runNewCommand } = await import("./commands/workbench");
			return runNewCommand(args, project.root, ctx);
		},
	},
	start: {
		requiresProject: true,
		run: async (args, project, ctx) => {
			const { runStartCommand } = await import("./commands/workbench");
			return runStartCommand(args, project.root, ctx);
		},
	},
	evidence: {
		requiresProject: true,
		run: async (args, project, ctx) => {
			const { runEvidenceCommand } = await import("./commands/workbench");
			return runEvidenceCommand(args, project.root, ctx);
		},
	},
	legacy: {
		requiresProject: true,
		run: async (args, project, ctx) => {
			const { runLegacyCommand } = await import("./commands/legacy");
			return runLegacyCommand(args, project.root, ctx);
		},
	},
	done: {
		requiresProject: true,
		run: async (args, project, ctx) => {
			const { runDoneCommand } = await import("./commands/workbench");
			return runDoneCommand(args, project.root, ctx);
		},
	},
	transition: {
		requiresProject: true,
		run: async (args, project, ctx) => {
			const { runTransitionCommand } = await import("./commands/workbench");
			return runTransitionCommand(args, project.root, ctx);
		},
	},
	log: {
		requiresProject: true,
		run: async (args, project, ctx) => {
			const { runLogCommand } = await import("./commands/workbench");
			return runLogCommand(args, project.root, ctx);
		},
	},
	quickTask: {
		requiresProject: true,
		run: async (args, project, ctx) => {
			const { runQuickTaskCommand } = await import("./commands/quick-task");
			return runQuickTaskCommand(args, project.root, ctx);
		},
	},
	verifyTasks: {
		requiresProject: true,
		run: async (args, project) => {
			const { runVerifyTasksCommand } = await import("./commands/workbench");
			return runVerifyTasksCommand(args, project.root);
		},
	},
	hook: {
		requiresProject: true,
		run: async (args, project) => {
			const { runHookCommand } = await import("./commands/catalog");
			return runHookCommand(args, project.root);
		},
	},
	rule: {
		requiresProject: true,
		run: async (args, project) => {
			const { runRuleCommand } = await import("./commands/catalog");
			return runRuleCommand(args, project.root);
		},
	},
	skill: {
		requiresProject: true,
		run: async (args, project) => {
			const { runSkillCommand } = await import("./commands/catalog");
			return runSkillCommand(args, project.root);
		},
	},
	update: {
		requiresProject: true,
		run: async (args, project, ctx) => {
			const { runUpdateCommand } = await import("./commands/update");
			return runUpdateCommand(args, project.root, undefined, undefined, ctx);
		},
	},
	fleet: {
		requiresProject: false,
		run: async (args, ctx) => {
			const { runFleetCommand } = await import("./commands/fleet");
			return runFleetCommand(args, process.cwd(), undefined, ctx);
		},
	},
	close: {
		requiresProject: true,
		run: async (args, project, ctx) => {
			const { runCloseCommand } = await import("./commands/close");
			return runCloseCommand(args, project.root, ctx);
		},
	},
	file: {
		requiresProject: true,
		run: async (args, project, ctx) => {
			const { runFileCommand } = await import("./commands/file");
			return runFileCommand(args, project.root, undefined, ctx);
		},
	},
	localState: {
		requiresProject: true,
		run: async (args, project, ctx) => {
			const { runLocalStateCommand } = await import("./commands/local-state");
			return runLocalStateCommand(args, project.root, undefined, ctx);
		},
	},
	catchup: {
		requiresProject: true,
		run: async (args, project, ctx) => {
			const { runCatchupCommand } = await import("./commands/catchup");
			return runCatchupCommand(args, project.root, undefined, ctx);
		},
	},
	preflight: {
		requiresProject: true,
		run: async (args, project) => {
			const { runPreflightCommand } = await import("./commands/preflight");
			return runPreflightCommand(args, project.root);
		},
	},
};

export const DIRECT_DISPATCH_KINDS = Object.freeze(
	Object.keys(DIRECT_DISPATCH_TABLE),
);

function directEntry(kind: string): DirectDispatchEntry | undefined {
	return Object.hasOwn(DIRECT_DISPATCH_TABLE, kind)
		? DIRECT_DISPATCH_TABLE[kind]
		: undefined;
}

export function dispatchRootFreeDirect(
	resolution: { kind: string; args: string[] },
	operationCtx: OperationContext,
): Promise<number> | undefined {
	const entry = directEntry(resolution.kind);
	if (!entry || entry.requiresProject) return undefined;
	return entry.run(resolution.args, operationCtx);
}

export function dispatchProjectDirect(
	resolution: { kind: string; args: string[] },
	project: LoadedProjectRoot,
	operationCtx: OperationContext,
): Promise<number> | undefined {
	const entry = directEntry(resolution.kind);
	if (!entry?.requiresProject) return undefined;
	return entry.run(resolution.args, project, operationCtx);
}
