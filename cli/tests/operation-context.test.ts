import { describe, expect, test } from "bun:test";
import {
	agentOperationContext,
	defaultOperationContext,
	isActionAllowed,
	remoteOperationContext,
	requiresApproval,
	resolveCanonicalAction,
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

	test("non-interactive local CLI context cannot apply evolution mutations", () => {
		const { ctx } = resolveOperationContext([], {}, false);
		expect(ctx).toMatchObject({
			callerType: "local",
			interactive: false,
			trustLevel: "trusted",
		});
		expect(
			isActionAllowed(ctx, { action: "evolve.apply", sideEffect: "write" }),
		).toBe(false);
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
		expect(
			isActionAllowed(ctx, { action: "file.read", sideEffect: "read" }),
		).toBe(true);
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

	test("evolve observe resolves as a write action and is denied when restricted", () => {
		const policy = resolveCanonicalAction({
			kind: "subcommand",
			group: "evolve",
			action: "observe",
			args: ["--session", "S-01"],
		});
		expect(policy).toEqual({ action: "evolve.observe", sideEffect: "write" });
		expect(isActionAllowed(agentOperationContext(), policy)).toBe(false);
	});

	test("closed evidence repair keeps preview readable and mutations approval-gated", () => {
		const reverify = resolveCanonicalAction({
			kind: "evidence",
			args: ["reverify", "-S", "S-01", "-T", "T-01", "-x", "bun test"],
		});
		const preview = resolveCanonicalAction({
			kind: "evidence",
			args: ["transition-admit", "-S", "S-01", "-T", "T-01"],
		});
		const confirm = resolveCanonicalAction({
			kind: "evidence",
			args: ["transition-admit", "--confirm"],
		});
		expect(reverify).toEqual({
			action: "workbench.evidence.reverify",
			sideEffect: "write",
		});
		expect(preview).toEqual({
			action: "workbench.evidence.transition_admit.preview",
			sideEffect: "preview",
		});
		expect(confirm).toEqual({
			action: "workbench.evidence.transition_admit",
			sideEffect: "write",
		});
		expect(isActionAllowed(agentOperationContext(), reverify)).toBe(false);
		expect(isActionAllowed(agentOperationContext(), preview)).toBe(true);
		expect(isActionAllowed(agentOperationContext(), confirm)).toBe(false);
	});

	test.each([
		["note", "annotate"],
		["clear", "purge"],
	] as const)("feedback alias %s keeps restricted write policy", (alias, action) => {
		expect(resolveCanonicalAction({ kind: "feedback", args: [alias] })).toEqual(
			{ action: `feedback.${action}`, sideEffect: "write" },
		);
		expect(
			isActionAllowed(
				agentOperationContext(),
				resolveCanonicalAction({ kind: "feedback", args: [alias] }),
			),
		).toBe(false);
	});

	test.each([
		agentOperationContext(),
		remoteOperationContext(),
		defaultOperationContext(),
	])("undefined policy is allowed regardless of context", (ctx) => {
		expect(isActionAllowed(ctx, undefined)).toBe(true);
	});

	test.each([
		"status",
		"analyze",
		"weekly",
		"after-merge",
		"review",
		"candidates",
		"backfill",
	])("evolve %s is explicitly read-only", (action) => {
		const policy = resolveCanonicalAction({
			kind: "subcommand",
			group: "evolve",
			action,
			args: [],
		});
		expect(policy).toEqual({
			action: `evolve.${action}`,
			sideEffect: "read",
		});
		expect(isActionAllowed(agentOperationContext(), policy)).toBe(true);
		expect(isActionAllowed(remoteOperationContext(), policy)).toBe(true);
	});

	test("session archive candidates is read-only while archive and restore mutations require approval", () => {
		const candidates = resolveCanonicalAction({
			kind: "subcommand",
			group: "session",
			action: "archive",
			args: ["--candidates"],
		});
		const archive = resolveCanonicalAction({
			kind: "subcommand",
			group: "session",
			action: "archive",
			args: ["S-01", "--reason", "retention"],
		});
		const restorePreview = resolveCanonicalAction({
			kind: "subcommand",
			group: "session",
			action: "restore",
			args: ["S-01", "--reason", "review", "--dry-run"],
		});

		expect(candidates).toEqual({
			action: "session.archive.candidates",
			sideEffect: "read",
		});
		expect(archive).toEqual({
			action: "session.archive.apply",
			sideEffect: "write",
		});
		expect(restorePreview).toEqual({
			action: "session.restore.preview",
			sideEffect: "preview",
		});
		expect(isActionAllowed(agentOperationContext(), candidates)).toBe(true);
		expect(isActionAllowed(agentOperationContext(), archive)).toBe(false);
		expect(isActionAllowed(agentOperationContext(), restorePreview)).toBe(true);
	});

	test("evolve candidate discovery is read-only while review is approval-gated", () => {
		const discovery = resolveCanonicalAction({
			kind: "subcommand",
			group: "evolve",
			action: "candidates",
			args: ["--session", "S-01"],
		});
		const review = resolveCanonicalAction({
			kind: "subcommand",
			group: "evolve",
			action: "candidates",
			args: ["review", "--session", "S-01"],
		});

		expect(discovery).toEqual({
			action: "evolve.candidates",
			sideEffect: "read",
		});
		expect(review).toEqual({
			action: "evolve.candidates.review",
			sideEffect: "write",
		});
		expect(isActionAllowed(agentOperationContext(), discovery)).toBe(true);
		expect(isActionAllowed(agentOperationContext(), review)).toBe(false);
	});

	test.each([
		"apply",
		"rollback",
	] as const)("evolve %s is local-interactive only", (action) => {
		const policy = resolveCanonicalAction({
			kind: "subcommand",
			group: "evolve",
			action,
			args: ["EVO-1", "--json"],
		});
		expect(policy).toEqual({
			action: `evolve.${action}`,
			sideEffect: "write",
		});
		expect(isActionAllowed(defaultOperationContext(), policy)).toBe(false);
		expect(
			isActionAllowed(resolveOperationContext([], {}, true).ctx, policy),
		).toBe(true);
		expect(isActionAllowed(agentOperationContext(), policy)).toBe(false);
		expect(isActionAllowed(remoteOperationContext(), policy)).toBe(false);
	});

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

	test("does not consume --agent after delimiter", () => {
		const { ctx, remainingArgs } = resolveOperationContext(
			["d", "T-01", "--", "some-tool", "--agent"],
			{},
		);
		expect(ctx.callerType).toBe("local");
		expect(remainingArgs).toEqual(["d", "T-01", "--", "some-tool", "--agent"]);
	});

	test("does not consume -A after delimiter", () => {
		const { remainingArgs } = resolveOperationContext(
			["d", "T-01", "--", "-A"],
			{},
		);
		expect(remainingArgs).toEqual(["d", "T-01", "--", "-A"]);
	});

	test("consumes --remote from remaining args", () => {
		const { remainingArgs } = resolveOperationContext(
			["--remote", "pstr", "rebuild"],
			{},
		);
		expect(remainingArgs).toEqual(["pstr", "rebuild"]);
	});

	test("does not consume --remote after delimiter", () => {
		const { ctx, remainingArgs } = resolveOperationContext(
			["d", "T-01", "--", "--remote"],
			{},
		);
		expect(ctx.callerType).toBe("local");
		expect(remainingArgs).toEqual(["d", "T-01", "--", "--remote"]);
	});

	test("does not consume -R after delimiter", () => {
		const { remainingArgs } = resolveOperationContext(
			["d", "T-01", "--", "-R"],
			{},
		);
		expect(remainingArgs).toEqual(["d", "T-01", "--", "-R"]);
	});

	test("keeps restricted outer context and preserves verifier flags", () => {
		const { ctx, remainingArgs } = resolveOperationContext(
			["--remote", "d", "T-01", "--", "some-tool", "--agent"],
			{},
		);
		expect(ctx.callerType).toBe("remote");
		expect(remainingArgs).toEqual(["d", "T-01", "--", "some-tool", "--agent"]);
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
