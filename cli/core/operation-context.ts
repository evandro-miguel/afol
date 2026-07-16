export type CallerType = "local" | "agent" | "remote";

export type TrustLevel = "trusted" | "restricted";

export type OperationContext = {
	callerType: CallerType;
	interactive: boolean;
	trustLevel: TrustLevel;
};

export function defaultOperationContext(): OperationContext {
	return {
		callerType: "local",
		interactive: true,
		trustLevel: "trusted",
	};
}

export function agentOperationContext(): OperationContext {
	return {
		callerType: "agent",
		interactive: false,
		trustLevel: "restricted",
	};
}

export function remoteOperationContext(): OperationContext {
	return {
		callerType: "remote",
		interactive: false,
		trustLevel: "restricted",
	};
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
		if (group === "hydrate") {
			return { action: "hydrate.run", sideEffect: "write" };
		}
	}

	return undefined;
}

export function isActionAllowed(
	ctx: OperationContext,
	policy: ActionPolicy | undefined,
): boolean {
	if (!policy || !requiresApproval(ctx)) return true;
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

	return { ctx: defaultOperationContext(), remainingArgs: args };
}
