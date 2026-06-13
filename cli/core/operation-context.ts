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
