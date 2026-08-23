import { describe, expect, test } from "bun:test";
import { fullTestArgs, fullTestBatches } from "../dev/full-test";

describe("full test runner", () => {
	test("serializes Windows tests with the platform timeout", () => {
		expect(fullTestArgs("win32", ["cli/tests/a.test.ts"])).toEqual([
			"test",
			"--only-failures",
			"cli/tests/a.test.ts",
			"--timeout",
			"360000",
			"--max-concurrency",
			"1",
		]);
	});

	test("preserves the existing POSIX invocation", () => {
		expect(fullTestArgs("linux")).toEqual(["test", "--only-failures"]);
	});

	test("sorts and partitions the full suite into bounded processes", () => {
		expect(fullTestBatches(["c", "a", "b"], 2)).toEqual([["a", "b"], ["c"]]);
		expect(() => fullTestBatches(["a"], 0)).toThrow("positive integer");
	});
});
