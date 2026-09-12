import { describe, expect, test } from "bun:test";
import { parseObserveArgs, runEvolveCommand } from "../commands/evolve";

describe("evolve parser compatibility", () => {
	test("observe keeps aliases, empty tokens, and last supplied values", () => {
		expect(
			parseObserveArgs([
				"",
				"-S",
				"first",
				"--session",
				"last",
				"-F",
				"feedback",
				"-j",
			]),
		).toEqual({ session: "last", feedbackId: "feedback", json: true });
		expect(parseObserveArgs(["-S", "session"])).toEqual({
			session: "session",
			json: false,
		});
	});

	test.each([
		[[], "evolve observe requires --session <id>"],
		[["-S", ""], "--session requires a value"],
		[["-S", "-j"], "--session requires a value"],
		[["-S", "session", "-F"], "--feedback-id requires a value"],
		[["-S", "a\nb"], "session identifier is invalid"],
		[["--unknown"], "Unknown evolve observe argument: --unknown"],
	] as const)("observe rejects %j with the original error", (args, message) => {
		expect(() => parseObserveArgs(args)).toThrow(message);
	});

	test.each([
		["import", ["other"], "evolve import requires codex or pi"],
		["import", ["codex"], "evolve import requires --source <path>"],
		[
			"import",
			["pi", "--source", "-x"],
			"evolve import --source requires a value",
		],
		[
			"import",
			["pi", "--source", "ok", "--source", ""],
			"evolve import --source requires a value",
		],
		["import", ["codex", ""], "Unknown evolve import argument: "],
		["external", [], "evolve external requires list"],
		["external", ["list", ""], "Unknown evolve external argument: "],
		["suggest", [], "evolve suggest requires --first-session"],
		["suggest", ["--claimed-by", ""], "--claimed-by requires a value"],
		["suggest", ["--claimed-by", "-j"], "Unsupported suggestion provider: -j"],
		["skip", [], "suggestion decision requires a suggestion id"],
		["skip", ["id", "--reason", ""], "--reason requires a value"],
		["skip", ["id", "--reason", "-x"], "--reason requires a value"],
		["skip", ["id", "extra"], "Unknown evolve decision argument: extra"],
		["skip", ["--unknown", "extra"], "Unknown evolve decision argument: extra"],
		["status", [""], "Unknown evolve argument: "],
	] as const)("%s rejects %j before project access", async (action, args, message) => {
		const stdout: string[] = [];
		const stderr: string[] = [];
		const code = await runEvolveCommand(
			action,
			[...args, "-j"],
			"/nonexistent-evolve-parser-contract",
			{
				stdout: (value) => stdout.push(value),
				stderr: (value) => stderr.push(value),
			},
		);
		expect(code).toBe(2);
		expect(stderr).toEqual([]);
		expect(JSON.parse(stdout[0] ?? "{}").error.message).toBe(message);
	});
});
