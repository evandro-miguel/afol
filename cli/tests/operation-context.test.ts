import { describe, expect, test } from "bun:test";
import {
	agentOperationContext,
	defaultOperationContext,
	remoteOperationContext,
	requiresApproval,
} from "../core/operation-context";

describe("operation-context", () => {
	test("default is local interactive trusted", () => {
		const ctx = defaultOperationContext();
		expect(ctx.callerType).toBe("local");
		expect(ctx.interactive).toBe(true);
		expect(ctx.trustLevel).toBe("trusted");
		expect(requiresApproval(ctx)).toBe(false);
	});

	test("agent context requires approval", () => {
		const ctx = agentOperationContext();
		expect(ctx.callerType).toBe("agent");
		expect(ctx.interactive).toBe(false);
		expect(ctx.trustLevel).toBe("restricted");
		expect(requiresApproval(ctx)).toBe(true);
	});

	test("remote context requires approval", () => {
		const ctx = remoteOperationContext();
		expect(ctx.callerType).toBe("remote");
		expect(ctx.interactive).toBe(false);
		expect(ctx.trustLevel).toBe("restricted");
		expect(requiresApproval(ctx)).toBe(true);
	});
});
