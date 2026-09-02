import { describe, expect, test } from "bun:test";
import {
	nextCommandHint,
	repairHintForStep,
} from "../commands/workbench/hints";

describe("workbench hints", () => {
	test("nextCommandHint prefers d -x after start and c after done", () => {
		expect(nextCommandHint("start", { taskId: "T-02" })).toBe(
			'afol d T-02 -x "<cmd>"',
		);
		expect(nextCommandHint("done", { session: "s1" })).toBe("afol c");
		expect(nextCommandHint("log", { taskId: "T-03" })).toBe(
			'afol d T-03 -x "<cmd>"',
		);
	});

	test("repairHintForStep leads with short forms", () => {
		expect(repairHintForStep("start", { taskId: "T-01" })).toBe("afol st T-01");
		expect(repairHintForStep("done", { taskId: "T-01" })).toBe(
			'afol d T-01 -x "<cmd>"',
		);
		expect(repairHintForStep("quick-task")).toContain("afol qt");
		expect(repairHintForStep("quick-task")).toContain('-c "<cmd>"');
	});
});
