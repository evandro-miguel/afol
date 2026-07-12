import { describe, expect, test } from "bun:test";
import {
	agentOperationContext,
	defaultOperationContext,
	isActionAllowed,
	remoteOperationContext,
	requiresApproval,
	resolveOperationContext,
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

	test.each([
		["read", { action: "file.read", sideEffect: "read" }],
		["preview", { action: "file.patch.preview", sideEffect: "preview" }],
	] as const)("restricted agent allows %s policies", (_name, policy) => {
		expect(isActionAllowed(agentOperationContext(), policy)).toBe(true);
	});

	test.each([
		["read", { action: "file.read", sideEffect: "read" }],
		["preview", { action: "file.patch.preview", sideEffect: "preview" }],
	] as const)("restricted remote allows %s policies", (_name, policy) => {
		expect(isActionAllowed(remoteOperationContext(), policy)).toBe(true);
	});

	test.each([
		["append", { action: "file.patch.apply", sideEffect: "write" }],
		["mutate", { action: "file.move.apply", sideEffect: "write" }],
	] as const)("restricted agent denies %s policies", (_name, policy) => {
		expect(isActionAllowed(agentOperationContext(), policy)).toBe(false);
	});

	test.each([
		["append", { action: "file.patch.apply", sideEffect: "write" }],
		["mutate", { action: "file.move.apply", sideEffect: "write" }],
	] as const)("restricted remote denies %s policies", (_name, policy) => {
		expect(isActionAllowed(remoteOperationContext(), policy)).toBe(false);
	});

	test("trusted local allows read, preview, and mutation policies", () => {
		const ctx = defaultOperationContext();
		expect(isActionAllowed(ctx, { action: "file.read", sideEffect: "read" })).toBe(
			true,
		);
		expect(
			isActionAllowed(ctx, {
				action: "file.patch.preview",
				sideEffect: "preview",
			}),
		).toBe(true);
		expect(
			isActionAllowed(ctx, { action: "file.patch.apply", sideEffect: "write" }),
		).toBe(true);
	});

	test.each([agentOperationContext(), remoteOperationContext(), defaultOperationContext()])(
		"undefined policy is allowed regardless of context",
		(ctx) => {
			expect(isActionAllowed(ctx, undefined)).toBe(true);
		},
	);

	test("resolveOperationContext defaults to local", () => {
		const { ctx, remainingArgs } = resolveOperationContext(["status"], {});
		expect(ctx.callerType).toBe("local");
		expect(ctx.interactive).toBe(true);
		expect(ctx.trustLevel).toBe("trusted");
		expect(remainingArgs).toEqual(["status"]);
	});

	test("resolveOperationContext --agent flag produces agent context", () => {
		const { ctx, remainingArgs } = resolveOperationContext(
			["--agent", "pstr", "rebuild"],
			{},
		);
		expect(ctx.callerType).toBe("agent");
		expect(ctx.trustLevel).toBe("restricted");
		expect(remainingArgs).toEqual(["pstr", "rebuild"]);
	});

	test("resolveOperationContext --remote flag produces remote context", () => {
		const { ctx, remainingArgs } = resolveOperationContext(
			["--remote", "schema", "apply"],
			{},
		);
		expect(ctx.callerType).toBe("remote");
		expect(ctx.trustLevel).toBe("restricted");
		expect(remainingArgs).toEqual(["schema", "apply"]);
	});

	test("resolveOperationContext -A shorthand for agent", () => {
		const { ctx } = resolveOperationContext(["-A", "schema"], {});
		expect(ctx.callerType).toBe("agent");
	});

	test("resolveOperationContext -R shorthand for remote", () => {
		const { ctx } = resolveOperationContext(["-R", "status"], {});
		expect(ctx.callerType).toBe("remote");
	});

	test("resolveOperationContext AFOL_AGENT env produces agent context", () => {
		const { ctx, remainingArgs } = resolveOperationContext(
			["pstr", "rebuild"],
			{ AFOL_AGENT: "true" },
		);
		expect(ctx.callerType).toBe("agent");
		expect(ctx.trustLevel).toBe("restricted");
		expect(remainingArgs).toEqual(["pstr", "rebuild"]);
	});

	test("resolveOperationContext AFOL_REMOTE env produces remote context", () => {
		const { ctx, remainingArgs } = resolveOperationContext(["file", "pt"], {
			AFOL_REMOTE: "1",
		});
		expect(ctx.callerType).toBe("remote");
		expect(ctx.trustLevel).toBe("restricted");
		expect(remainingArgs).toEqual(["file", "pt"]);
	});

	test("resolveOperationContext CLI flag overrides env", () => {
		const { ctx } = resolveOperationContext(["--agent"], {
			AFOL_REMOTE: "true",
		});
		expect(ctx.callerType).toBe("agent");
	});

	test("resolveOperationContext preserves args when no flags consumed", () => {
		const { remainingArgs } = resolveOperationContext(["status", "--json"], {});
		expect(remainingArgs).toEqual(["status", "--json"]);
	});

	// ── Env truthiness fail-safe ──────────────────────────────────────

	test("AFOL_AGENT=1 is restricted", () => {
		const { ctx } = resolveOperationContext([], { AFOL_AGENT: "1" });
		expect(ctx.callerType).toBe("agent");
	});

	test("AFOL_REMOTE=1 is restricted", () => {
		const { ctx } = resolveOperationContext([], { AFOL_REMOTE: "1" });
		expect(ctx.callerType).toBe("remote");
	});

	test("AFOL_AGENT alone (truthy) is restricted", () => {
		const { ctx } = resolveOperationContext([], { AFOL_AGENT: "yes" });
		expect(ctx.callerType).toBe("agent");
	});

	test("AFOL_AGENT=false is not restricted", () => {
		const { ctx } = resolveOperationContext([], { AFOL_AGENT: "false" });
		expect(ctx.callerType).toBe("local");
	});

	test("AFOL_AGENT=0 is not restricted", () => {
		const { ctx } = resolveOperationContext([], { AFOL_AGENT: "0" });
		expect(ctx.callerType).toBe("local");
	});

	test("AFOL_AGENT=no is not restricted", () => {
		const { ctx } = resolveOperationContext([], { AFOL_AGENT: "no" });
		expect(ctx.callerType).toBe("local");
	});

	test("AFOL_AGENT=off is not restricted", () => {
		const { ctx } = resolveOperationContext([], { AFOL_AGENT: "off" });
		expect(ctx.callerType).toBe("local");
	});

	test("AFOL_AGENT empty string is not restricted", () => {
		const { ctx } = resolveOperationContext([], { AFOL_AGENT: "" });
		expect(ctx.callerType).toBe("local");
	});

	test("AFOL_REMOTE=false is not restricted", () => {
		const { ctx } = resolveOperationContext([], { AFOL_REMOTE: "false" });
		expect(ctx.callerType).toBe("local");
	});

	// ── Consume all flags ────────────────────────────────────────────

	test("consumes --agent from remaining args", () => {
		const { remainingArgs } = resolveOperationContext(
			["--agent", "schema", "apply"],
			{},
		);
		expect(remainingArgs).toEqual(["schema", "apply"]);
	});

	test("consumes -A from remaining args", () => {
		const { remainingArgs } = resolveOperationContext(["-A", "status"], {});
		expect(remainingArgs).toEqual(["status"]);
	});

	test("consumes --remote from remaining args", () => {
		const { remainingArgs } = resolveOperationContext(
			["--remote", "pstr", "rebuild"],
			{},
		);
		expect(remainingArgs).toEqual(["pstr", "rebuild"]);
	});

	test("consumes -R from remaining args", () => {
		const { remainingArgs } = resolveOperationContext(
			["pstr", "-R", "rebuild"],
			{},
		);
		expect(remainingArgs).toEqual(["pstr", "rebuild"]);
	});

	test("agent flag takes precedence when both --agent and --remote present", () => {
		const { ctx, remainingArgs } = resolveOperationContext(
			["--agent", "--remote", "cmd"],
			{},
		);
		expect(ctx.callerType).toBe("agent");
		expect(remainingArgs).toEqual(["cmd"]);
	});

	test("consumes both flags when both present in any order", () => {
		const { remainingArgs } = resolveOperationContext(
			["--remote", "--agent", "cmd"],
			{},
		);
		expect(remainingArgs).toEqual(["cmd"]);
	});
});
