import { describe, expect, test } from "bun:test";
import { fullTestArgs } from "../dev/full-test";

describe("full test runner", () => {
	test("serializes Windows tests with the platform timeout", () => {
		expect(fullTestArgs("win32")).toEqual([
			"test",
			"--only-failures",
			"--timeout",
			"120000",
			"--max-concurrency",
			"1",
		]);
	});

	test("preserves the existing POSIX invocation", () => {
		expect(fullTestArgs("linux")).toEqual(["test", "--only-failures"]);
	});
});
