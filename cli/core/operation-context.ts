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

	for (let index = 0; index < args.length; index++) {
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
