import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGovernanceCommand } from "../commands/governance";
import { remoteOperationContext } from "../core/operation-context";
import { writePendingSpecIndex } from "../services/governance/pending-specs";

const tempRoots: string[] = [];

afterEach(() => {
	for (const root of tempRoots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

function createFixture(): string {
	const root = mkdtempSync(join(tmpdir(), "afol-governance-command-"));
	tempRoots.push(root);
	writePendingSpecIndex(root, { schema_version: 1, entries: [] });
	return root;
}

describe("governance command", () => {
	test("returns the pending index through the command envelope", () => {
		const stdout: string[] = [];
		const stderr: string[] = [];
		const exitCode = runGovernanceCommand(
			"pending",
			["--json"],
			createFixture(),
			{
				stdout: (message) => stdout.push(message),
				stderr: (message) => stderr.push(message),
			},
		);

		expect(exitCode).toBe(0);
		expect(stderr).toEqual([]);
		expect(JSON.parse(stdout[0] ?? "{}")).toMatchObject({
			ok: true,
			action: "governance.pending",
			data: { status: "ok", total: 0, entries: [] },
		});
	});

	test("denies governance writes for restricted callers", () => {
		const stderr: string[] = [];
		const io = {
			stdout: () => undefined,
			stderr: (message: string) => stderr.push(message),
		};
		const root = createFixture();

		expect(
			runGovernanceCommand(
				"resolve-spec",
				[
					"--session",
					"fixture",
					"--feature-id",
					"F-11",
					"--parent-spec",
					"fixture-spec",
				],
				root,
				io,
				remoteOperationContext(),
			),
		).toBe(2);
		expect(
			runGovernanceCommand(
				"repair-index",
				[],
				root,
				io,
				remoteOperationContext(),
			),
		).toBe(2);
		expect(stderr).toEqual([
			"governance resolve-spec requires local interactive approval",
			"governance repair-index requires local interactive approval",
		]);
	});

	test("rejects unknown governance actions", () => {
		const stderr: string[] = [];
		const exitCode = runGovernanceCommand("unknown", [], createFixture(), {
			stdout: () => undefined,
			stderr: (message) => stderr.push(message),
		});

		expect(exitCode).toBe(2);
		expect(stderr).toEqual(["Unknown governance action: unknown"]);
	});
});
