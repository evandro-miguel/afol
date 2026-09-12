import { describe, expect, test } from "bun:test";
import { parseSessionArgs } from "../commands/session-args";

describe("session argument compatibility", () => {
	test("keeps defaults, skipped empty tokens and permissive positionals", () => {
		expect(parseSessionArgs(["", "S-01", "--unknown", "--", "-j"])).toEqual({
			json: true,
			dryRun: false,
			debug: false,
			strict: false,
			branch: null,
			actor: null,
			reason: null,
			olderThanDays: 90,
			candidates: false,
			archiveOffset: 0,
			archiveLimit: 10,
			session: null,
			positional: ["S-01", "--unknown", "--"],
		});
	});

	test("keeps aliases, repeated values and all boolean flags", () => {
		expect(
			parseSessionArgs([
				"--session",
				"S-01",
				"--session",
				"S-02",
				"--branch",
				"topic",
				"--actor",
				"operator",
				"--reason",
				"review",
				"--json",
				"--dry-run",
				"--strict",
				"--debug",
				"--candidates",
			]),
		).toMatchObject({
			session: "S-02",
			branch: "topic",
			actor: "operator",
			reason: "review",
			json: true,
			dryRun: true,
			strict: true,
			debug: true,
			candidates: true,
		});
	});

	for (const flag of ["--session", "--branch", "--actor", "--reason"]) {
		test(`${flag} preserves missing and dash-prefixed value errors`, () => {
			for (const suffix of [[], [""], ["--json"], ["-name"]]) {
				expect(() => parseSessionArgs([flag, ...suffix])).toThrow(
					`Missing value for ${flag} in session.`,
				);
			}
		});
	}

	test("keeps Number conversion for supplied empty, fractional and hexadecimal values", () => {
		expect(
			parseSessionArgs([
				"--older-than-days",
				"",
				"--offset",
				"",
				"--limit",
				"0x10",
			]),
		).toMatchObject({ olderThanDays: 0, archiveOffset: 0, archiveLimit: 16 });
		expect(
			parseSessionArgs(["--older-than-days", "1.5", "--offset", "2e1"]),
		).toMatchObject({ olderThanDays: 1.5, archiveOffset: 20 });
	});

	for (const [flag, error, invalid] of [
		[
			"--older-than-days",
			"--older-than-days must be a non-negative number.",
			["-1", "NaN", "Infinity", "--json"],
		],
		[
			"--offset",
			"--offset must be a non-negative integer.",
			["-1", "1.5", "Infinity", "--json"],
		],
		[
			"--limit",
			"--limit must be a positive integer.",
			["", "0", "-1", "1.5", "--json"],
		],
	] as const) {
		test(`${flag} preserves numeric validation errors including absent values`, () => {
			expect(() => parseSessionArgs([flag])).toThrow(error);
			for (const value of invalid)
				expect(() => parseSessionArgs([flag, value])).toThrow(error);
		});
	}
});
