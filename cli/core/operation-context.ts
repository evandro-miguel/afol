export type CallerType = "local" | "agent" | "remote";

export type TrustLevel = "trusted" | "restricted";

export type OperationContext = {
	callerType: CallerType;
	interactive: boolean;
	trustLevel: TrustLevel;
};

const ADMITTED_OPERATION_CONTEXTS = new WeakSet<object>();
const LOCAL_OPERATOR_CONTEXTS = new WeakSet<object>();

function admitOperationContext(context: OperationContext): OperationContext {
	const admitted = Object.freeze(context);
	ADMITTED_OPERATION_CONTEXTS.add(admitted);
	return admitted;
}

export function assertAdmittedOperationContext(
	context: OperationContext | undefined,
): asserts context is OperationContext {
	if (!context || !ADMITTED_OPERATION_CONTEXTS.has(context))
		throw new Error("operation context was not admitted by the CLI boundary");
}

export function defaultOperationContext(): OperationContext {
	return admitOperationContext({
		callerType: "local",
		interactive: true,
		trustLevel: "trusted",
	});
}

function localOperatorOperationContext(): OperationContext {
	const context = defaultOperationContext();
	LOCAL_OPERATOR_CONTEXTS.add(context);
	return context;
}

export function localNonInteractiveOperationContext(): OperationContext {
	return admitOperationContext({
		callerType: "local",
		interactive: false,
		trustLevel: "trusted",
	});
}

export function agentOperationContext(): OperationContext {
	return admitOperationContext({
		callerType: "agent",
		interactive: false,
		trustLevel: "restricted",
	});
}

export function remoteOperationContext(): OperationContext {
	return admitOperationContext({
		callerType: "remote",
		interactive: false,
		trustLevel: "restricted",
	});
}

export function requiresApproval(ctx: OperationContext): boolean {
	if (ctx.callerType === "local" && ctx.interactive) return false;
	return ctx.trustLevel === "restricted";
}

export type ActionResolution = {
	kind: string;
	args: readonly string[];
	group?: string;
	action?: string;
};

export type ActionPolicy = {
	action: string;
	sideEffect: "read" | "preview" | "write";
};

function hasFlag(args: readonly string[], flag: string): boolean {
	return args.includes(flag);
}

/** Resolve the C01 canonical action before dispatching a command handler. */
export function resolveCanonicalAction(
	resolution: ActionResolution,
): ActionPolicy | undefined {
	const args = resolution.args;
	const dryRun = hasFlag(args, "--dry-run");

	if (resolution.kind === "file") {
		const command = args[0] ?? "";
		if (command === "patch" || command === "append") {
			return {
				action: dryRun ? "file.patch.preview" : "file.patch.apply",
				sideEffect: dryRun ? "preview" : "write",
			};
		}
		if (command === "move" || command === "mv") {
			return {
				action: dryRun ? "file.move.preview" : "file.move.apply",
				sideEffect: dryRun ? "preview" : "write",
			};
		}
		if (command === "archive" || command === "ar") {
			return {
				action: dryRun ? "file.archive.preview" : "file.archive.apply",
				sideEffect: dryRun ? "preview" : "write",
			};
		}
		if (command === "undo" || command === "ud") {
			return {
				action: dryRun ? "file.undo.preview" : "file.undo.apply",
				sideEffect: "write",
			};
		}
	}

	if (resolution.kind === "evidence") {
		return { action: "workbench.evidence.record", sideEffect: "write" };
	}
	if (resolution.kind === "done") {
		if (hasFlag(args, "--test-shell")) {
			return { action: "workbench.done.test-shell", sideEffect: "write" };
		}
		if (hasFlag(args, "--test")) {
			return { action: "workbench.done.verify", sideEffect: "write" };
		}
		return { action: "workbench.done.record", sideEffect: "write" };
	}
	if (resolution.kind === "feedback") {
		const action = args[0] ?? "status";
		const canonicalAction =
			action === "note" ? "annotate" : action === "clear" ? "purge" : action;
		if (
			canonicalAction === "annotate" ||
			canonicalAction === "purge" ||
			canonicalAction === "last"
		) {
			return { action: `feedback.${canonicalAction}`, sideEffect: "write" };
		}
		if (canonicalAction === "preview") {
			return { action: "feedback.preview", sideEffect: "preview" };
		}
		return { action: `feedback.${canonicalAction}`, sideEffect: "read" };
	}

	if (resolution.kind === "subcommand") {
		const group = resolution.group ?? "";
		const action = resolution.action ?? "";
		if (group === "evolve" && action === "observe") {
			return { action: "evolve.observe", sideEffect: "write" };
		}
		if (
			group === "evolve" &&
			["status", "analyze", "weekly", "after-merge", "review"].includes(action)
		) {
			return { action: `evolve.${action}`, sideEffect: "read" };
		}
		if (
			group === "evolve" &&
			[
				"suggest",
				"skip",
				"accept",
				"reject",
				"decision",
				"repair",
				"apply",
				"rollback",
			].includes(action)
		) {
			return { action: `evolve.${action}`, sideEffect: "write" };
		}
		if (group === "adm" && action === "migrate") {
			return {
				action: dryRun ? "adm.migrate.preview" : "adm.migrate.apply",
				sideEffect: dryRun ? "preview" : "write",
			};
		}
		if (group === "adapter" && (action === "enable" || action === "disable")) {
			return {
				action: `adapter.${action}.${dryRun ? "preview" : "apply"}`,
				sideEffect: dryRun ? "preview" : "write",
			};
		}
		if (
			group === "adr" &&
			["new", "accept", "supersede", "abandon", "archive"].includes(action)
		) {
			return { action: `adr.${action}`, sideEffect: "write" };
		}
		if (group === "spec" && action === "waive") {
			return { action: "spec.waive", sideEffect: "write" };
		}
		if (group === "changelog" && action === "add") {
			return { action: "changelog.add", sideEffect: "write" };
		}
		if (group === "state" && action === "sync") {
			return { action: "state.sync", sideEffect: "write" };
		}
		if (group === "evolve" && action === "import") {
			return hasFlag(args, "--confirm")
				? { action: "evolve.import.confirm", sideEffect: "write" }
				: { action: "evolve.import.preview", sideEffect: "preview" };
		}
		if (group === "evolve" && action === "external") {
			return { action: "evolve.external.list", sideEffect: "read" };
		}
		if (group === "hydrate") {
			return { action: "hydrate.run", sideEffect: "write" };
		}
	}

	return undefined;
}

export function isTrustedLocalInteractive(context: OperationContext): boolean {
	assertAdmittedOperationContext(context);
	return (
		context.callerType === "local" &&
		context.interactive &&
		context.trustLevel === "trusted"
	);
}

export function isActionAllowed(
	ctx: OperationContext,
	policy: ActionPolicy | undefined,
): boolean {
	if (
		policy &&
		(policy.action === "evolve.apply" || policy.action === "evolve.rollback")
	) {
		return (
			ctx.callerType === "local" &&
			ctx.interactive &&
			LOCAL_OPERATOR_CONTEXTS.has(ctx)
		);
	}
	if (!policy || !requiresApproval(ctx)) return true;
	// Daily suggestion claim/show is a fenced derived-state receipt. Agents may
	// perform this narrow operation; user decisions remain local-only.
	if (policy.action === "evolve.suggest" && ctx.callerType === "agent")
		return true;
	return policy.sideEffect === "read" || policy.sideEffect === "preview";
}

const AGENT_FLAGS = new Set(["--agent", "-A"]);
const REMOTE_FLAGS = new Set(["--remote", "-R"]);

const FALSY_VALUES = new Set(["false", "0", "no", "off"]);

/**
 * Resolve an OperationContext from CLI flags and environment variables.
 *
 * Priority (highest wins):
 *   1. Explicit CLI flags (`--agent`, `-A`, `--remote`, `-R`)
 *   2. Environment variables (`AFOL_AGENT`, `AFOL_REMOTE`)
 *   3. Default local interactive context
 *
 * All matching flags are consumed from `remainingArgs`. If both agent and
 * remote flags are present, agent takes precedence (most explicit).
 *
 * Env truthiness: presence of `AFOL_AGENT` or `AFOL_REMOTE` is treated as
 * restricted UNLESS the value is an explicit falsy string
 * (`false`, `0`, `no`, `off` — case-insensitive).
 *
 * Restricted (agent/remote) contexts reach existing mutation gates for
 * `schema`, `pstr`, `library`, `memory`, `file` without writing.
 */
export function resolveOperationContext(
	args: string[],
	env: Record<string, string | undefined> = process.env,
	terminalInteractive = true,
): { ctx: OperationContext; remainingArgs: string[] } {
	const consumed = new Set<number>();
	let foundAgent = false;
	let foundRemote = false;
	const delimiterIndex = args.indexOf("--");
	const scanLimit = delimiterIndex === -1 ? args.length : delimiterIndex;

	for (let index = 0; index < scanLimit; index++) {
		const arg = args[index];
		if (!arg) continue;

		if (AGENT_FLAGS.has(arg)) {
			consumed.add(index);
			foundAgent = true;
		} else if (REMOTE_FLAGS.has(arg)) {
			consumed.add(index);
			foundRemote = true;
		}
	}

	if (foundAgent) {
		return {
			ctx: agentOperationContext(),
			remainingArgs: args.filter((_, i) => !consumed.has(i)),
		};
	}
	if (foundRemote) {
		return {
			ctx: remoteOperationContext(),
			remainingArgs: args.filter((_, i) => !consumed.has(i)),
		};
	}

	const agentEnv = env.AFOL_AGENT;
	if (
		agentEnv !== undefined &&
		agentEnv !== "" &&
		!FALSY_VALUES.has(agentEnv.toLowerCase())
	) {
		return { ctx: agentOperationContext(), remainingArgs: args };
	}

	const remoteEnv = env.AFOL_REMOTE;
	if (
		remoteEnv !== undefined &&
		remoteEnv !== "" &&
		!FALSY_VALUES.has(remoteEnv.toLowerCase())
	) {
		return { ctx: remoteOperationContext(), remainingArgs: args };
	}

	return {
		ctx: terminalInteractive
			? localOperatorOperationContext()
			: localNonInteractiveOperationContext(),
		remainingArgs: args,
	};
}
