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

type PolicySideEffect = ActionPolicy["sideEffect"];

function hasFlag(args: readonly string[], flag: string): boolean {
	return args.includes(flag);
}

/**
 * Declarative canonical-action rules.
 *
 * - `static`: resolves to a fixed action/side-effect pair.
 * - `dry-run`: appends `.apply` (with `applySideEffect`) or `.preview` (with
 *   `previewSideEffect`, defaulting to `preview`) to the action template based
 *   on the `--dry-run` flag.
 * - `confirm`: promotes the action template to a write only with `--confirm`
 *   and without `--dry-run`; otherwise the template gains `.preview`.
 */
type CanonicalActionRule =
	| {
			readonly mode: "static";
			readonly action: string;
			readonly sideEffect: PolicySideEffect;
	  }
	| {
			readonly mode: "dry-run";
			readonly action: string;
			readonly applySideEffect?: PolicySideEffect;
			readonly previewSideEffect?: PolicySideEffect;
	  }
	| {
			readonly mode: "confirm";
			readonly action: string;
	  };

const CANONICAL_ACTION_RULES: Readonly<
	Record<string, Readonly<Record<string, CanonicalActionRule>>>
> = {
	file: {
		patch: { mode: "dry-run", action: "file.patch" },
		append: { mode: "dry-run", action: "file.patch" },
		move: { mode: "dry-run", action: "file.move" },
		mv: { mode: "dry-run", action: "file.move" },
		archive: { mode: "dry-run", action: "file.archive" },
		ar: { mode: "dry-run", action: "file.archive" },
		undo: {
			mode: "dry-run",
			action: "file.undo",
			previewSideEffect: "write",
		},
		ud: { mode: "dry-run", action: "file.undo", previewSideEffect: "write" },
	},
	evidence: {
		reverify: {
			mode: "static",
			action: "workbench.evidence.reverify",
			sideEffect: "write",
		},
		"transition-admit": {
			mode: "confirm",
			action: "workbench.evidence.transition_admit",
		},
		admit: { mode: "confirm", action: "workbench.evidence.admit" },
	},
	legacy: {
		reconcile: { mode: "confirm", action: "legacy.reconcile" },
	},
	done: {
		"test-shell": {
			mode: "static",
			action: "workbench.done.test-shell",
			sideEffect: "write",
		},
		test: {
			mode: "static",
			action: "workbench.done.verify",
			sideEffect: "write",
		},
		record: {
			mode: "static",
			action: "workbench.done.record",
			sideEffect: "write",
		},
	},
	subcommand: {
		"evolve/candidates+review": {
			mode: "static",
			action: "evolve.candidates.review",
			sideEffect: "write",
		},
		"session/archive+--candidates": {
			mode: "static",
			action: "session.archive.candidates",
			sideEffect: "read",
		},
		"evolve/import+--confirm": {
			mode: "static",
			action: "evolve.import.confirm",
			sideEffect: "write",
		},
		"evolve/observe": {
			mode: "static",
			action: "evolve.observe",
			sideEffect: "write",
		},
		"evolve/evaluate+--record": {
			mode: "static",
			action: "evolve.evaluate",
			sideEffect: "write",
		},
		"evolve/evaluate": {
			mode: "static",
			action: "evolve.evaluate",
			sideEffect: "preview",
		},
		"evolve/status": {
			mode: "static",
			action: "evolve.status",
			sideEffect: "read",
		},
		"evolve/analyze": {
			mode: "static",
			action: "evolve.analyze",
			sideEffect: "read",
		},
		"evolve/weekly": {
			mode: "static",
			action: "evolve.weekly",
			sideEffect: "read",
		},
		"evolve/after-merge": {
			mode: "static",
			action: "evolve.after-merge",
			sideEffect: "read",
		},
		"evolve/review": {
			mode: "static",
			action: "evolve.review",
			sideEffect: "read",
		},
		"evolve/candidates": {
			mode: "static",
			action: "evolve.candidates",
			sideEffect: "read",
		},
		"evolve/backfill": {
			mode: "static",
			action: "evolve.backfill",
			sideEffect: "read",
		},
		"session/archive": { mode: "dry-run", action: "session.archive" },
		"session/restore": { mode: "dry-run", action: "session.restore" },
		"evolve/suggest": {
			mode: "static",
			action: "evolve.suggest",
			sideEffect: "write",
		},
		"evolve/skip": {
			mode: "static",
			action: "evolve.skip",
			sideEffect: "write",
		},
		"evolve/accept": {
			mode: "static",
			action: "evolve.accept",
			sideEffect: "write",
		},
		"evolve/reject": {
			mode: "static",
			action: "evolve.reject",
			sideEffect: "write",
		},
		"evolve/decision": {
			mode: "static",
			action: "evolve.decision",
			sideEffect: "write",
		},
		"evolve/repair": {
			mode: "static",
			action: "evolve.repair",
			sideEffect: "write",
		},
		"evolve/apply": {
			mode: "static",
			action: "evolve.apply",
			sideEffect: "write",
		},
		"evolve/rollback": {
			mode: "static",
			action: "evolve.rollback",
			sideEffect: "write",
		},
		"adm/migrate": { mode: "dry-run", action: "adm.migrate" },
		"adapter/enable": { mode: "dry-run", action: "adapter.enable" },
		"adapter/disable": { mode: "dry-run", action: "adapter.disable" },
		"adapter/sync": { mode: "dry-run", action: "adapter.sync" },
		"adr/new": { mode: "static", action: "adr.new", sideEffect: "write" },
		"adr/accept": { mode: "static", action: "adr.accept", sideEffect: "write" },
		"adr/supersede": {
			mode: "static",
			action: "adr.supersede",
			sideEffect: "write",
		},
		"adr/abandon": {
			mode: "static",
			action: "adr.abandon",
			sideEffect: "write",
		},
		"adr/archive": {
			mode: "static",
			action: "adr.archive",
			sideEffect: "write",
		},
		"spec/waive": { mode: "static", action: "spec.waive", sideEffect: "write" },
		"changelog/add": {
			mode: "static",
			action: "changelog.add",
			sideEffect: "write",
		},
		"state/sync": { mode: "static", action: "state.sync", sideEffect: "write" },
		"evolve/import": {
			mode: "static",
			action: "evolve.import.preview",
			sideEffect: "preview",
		},
		"evolve/external": {
			mode: "static",
			action: "evolve.external.list",
			sideEffect: "read",
		},
		"hydrate/*": { mode: "static", action: "hydrate.run", sideEffect: "write" },
	},
};

/** Fallback rule applied when a kind's key has no direct table entry. */
const KIND_DEFAULT_RULES: Readonly<Record<string, CanonicalActionRule>> = {
	evidence: {
		mode: "static",
		action: "workbench.evidence.record",
		sideEffect: "write",
	},
	legacy: {
		mode: "static",
		action: "legacy.reconcile.preview",
		sideEffect: "preview",
	},
};

/** Ordered `done` flag selectors; first match wins, then the record default. */
const DONE_FLAG_KEYS: readonly (readonly [flag: string, key: string])[] = [
	["--test-shell", "test-shell"],
	["--test", "test"],
];

const SUBCOMMAND_RULES = CANONICAL_ACTION_RULES.subcommand;

/** Subcommand entries whose key carries an argument or flag discriminator. */
const DISCRIMINATED_SUBCOMMAND_RULES = Object.entries(SUBCOMMAND_RULES ?? {})
	.filter(([key]) => key.includes("+"))
	.map(([key, rule]) => {
		const separator = key.indexOf("+");
		const base = key.slice(0, separator);
		const discriminator = key.slice(separator + 1);
		return {
			base,
			discriminator,
			isFlag: discriminator.startsWith("-"),
			rule,
		};
	});

function lookupSubcommandRule(
	group: string,
	action: string,
	args: readonly string[],
): CanonicalActionRule | undefined {
	const base = `${group}/${action}`;
	for (const entry of DISCRIMINATED_SUBCOMMAND_RULES) {
		if (entry.base !== base) continue;
		if (
			entry.isFlag
				? hasFlag(args, entry.discriminator)
				: args[0] === entry.discriminator
		) {
			return entry.rule;
		}
	}
	return SUBCOMMAND_RULES?.[base] ?? SUBCOMMAND_RULES?.[`${group}/*`];
}

function lookupCanonicalRule(
	resolution: ActionResolution,
	args: readonly string[],
): CanonicalActionRule | undefined {
	const { kind } = resolution;
	if (kind === "done") {
		const key =
			DONE_FLAG_KEYS.find(([flag]) => hasFlag(args, flag))?.[1] ?? "record";
		return CANONICAL_ACTION_RULES.done?.[key];
	}
	if (kind === "subcommand") {
		return lookupSubcommandRule(
			resolution.group ?? "",
			resolution.action ?? "",
			args,
		);
	}
	const direct = CANONICAL_ACTION_RULES[kind]?.[args[0] ?? ""];
	return direct ?? KIND_DEFAULT_RULES[kind];
}

function applyCanonicalRule(
	rule: CanonicalActionRule,
	args: readonly string[],
): ActionPolicy {
	switch (rule.mode) {
		case "dry-run":
			return hasFlag(args, "--dry-run")
				? {
						action: `${rule.action}.preview`,
						sideEffect: rule.previewSideEffect ?? "preview",
					}
				: {
						action: `${rule.action}.apply`,
						sideEffect: rule.applySideEffect ?? "write",
					};
		case "confirm":
			return hasFlag(args, "--confirm") && !hasFlag(args, "--dry-run")
				? { action: rule.action, sideEffect: "write" }
				: { action: `${rule.action}.preview`, sideEffect: "preview" };
		default:
			return { action: rule.action, sideEffect: rule.sideEffect };
	}
}

const FEEDBACK_ACTION_ALIASES: Readonly<Record<string, string>> = Object.freeze(
	{ note: "annotate", clear: "purge" },
);
const FEEDBACK_WRITE_ACTIONS: ReadonlySet<string> = new Set([
	"annotate",
	"purge",
	"last",
]);

function feedbackPolicy(args: readonly string[]): ActionPolicy {
	const requested = args[0] ?? "status";
	const canonicalAction = FEEDBACK_ACTION_ALIASES[requested] ?? requested;
	if (canonicalAction === "preview") {
		return { action: "feedback.preview", sideEffect: "preview" };
	}
	return {
		action: `feedback.${canonicalAction}`,
		sideEffect: FEEDBACK_WRITE_ACTIONS.has(canonicalAction) ? "write" : "read",
	};
}

/** Resolve the C01 canonical action before dispatching a command handler. */
export function resolveCanonicalAction(
	resolution: ActionResolution,
): ActionPolicy | undefined {
	const args = resolution.args;
	if (resolution.kind === "feedback") return feedbackPolicy(args);
	const rule = lookupCanonicalRule(resolution, args);
	return rule ? applyCanonicalRule(rule, args) : undefined;
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
		(policy.action === "evolve.apply" ||
			policy.action === "evolve.rollback" ||
			policy.action === "evolve.evaluate")
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
