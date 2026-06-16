import { describe, expect, test } from "bun:test";
import { parseNewArgs } from "../commands/workbench/args";

describe("workbench parseNewArgs", () => {
	test("preserves repeated --task values in order", () => {
		const parsed = parseNewArgs([
			"alpha",
			"--task",
			"first task",
			"--task",
			"second task",
		]);

		expect(parsed.theme).toBe("alpha");
		expect(parsed.metadata.task).toBe("first task");
		expect(parsed.metadata.tasks).toEqual(["first task", "second task"]);
		expect(parsed.json).toBe(false);
	});
});
