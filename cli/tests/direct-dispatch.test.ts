import { expect, spyOn, test } from "bun:test";
import * as catchup from "../commands/catchup";
import {
	agentOperationContext,
	defaultOperationContext,
} from "../core/operation-context";
import {
	DIRECT_DISPATCH_KINDS,
	dispatchProjectDirect,
	dispatchRootFreeDirect,
} from "../direct-dispatch";
import type { LoadedProjectRoot } from "../services/project/root";

test("direct dispatch ignores inherited object names", () => {
	for (const kind of ["toString", "constructor", "__proto__", "missing"]) {
		expect(DIRECT_DISPATCH_KINDS).not.toContain(kind);
		expect(
			dispatchRootFreeDirect({ kind, args: [] }, defaultOperationContext()),
		).toBeUndefined();
	}
});

test("catchup dispatch preserves the admitted operation context", async () => {
	const ctx = agentOperationContext();
	const run = spyOn(catchup, "runCatchupCommand").mockResolvedValue(2);
	try {
		const project = { root: "/unused" } as LoadedProjectRoot;
		expect(
			await dispatchProjectDirect(
				{ kind: "catchup", args: ["--fix"] },
				project,
				ctx,
			),
		).toBe(2);
		expect(run).toHaveBeenCalledWith(["--fix"], project.root, undefined, ctx);
	} finally {
		run.mockRestore();
	}
});
