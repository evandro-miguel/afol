import { describe, expect, test } from "bun:test";
import {
	canonicalizeLogSummary,
	closeMarkdownText,
	readLogSummary,
	renderCloseReport,
} from "../services/workbench/close-report";
import type { TaskRow } from "../services/workbench/lifecycle";
import type { EvidenceEntry } from "../services/workbench/types";

const DUPLICATE_SUMMARY_LOG = [
	"# Log",
	"",
	"## Summary",
	"old",
	"",
	"## Summary",
	"second",
	"",
	"## Notes",
	"keep",
	"",
].join("\n");

function evidence(id: string, attempt: number): EvidenceEntry {
	return {
		id,
		task_id: "T-01",
		created_at: "2026-09-07T00:00:00.000Z",
		command: "bun test",
		result: "passed",
		provenance: "observed",
		exit_code: 0,
		attempt,
	};
}

describe("close report helpers", () => {
	test("reads the first summary and canonicalizes duplicate sections exactly", () => {
		expect(readLogSummary(DUPLICATE_SUMMARY_LOG)).toBe("old");
		expect(canonicalizeLogSummary(DUPLICATE_SUMMARY_LOG, "new summary")).toBe(
			"# Log\n## Summary\n\nnew summary\n\n## Notes\nkeep\n",
		);
	});

	test("renders only current-attempt evidence as authorizing", () => {
		const task: TaskRow = {
			line: "| T-01 | done | owner | attempt=2 |",
			taskId: "T-01",
			state: "done",
			owner: "owner",
			notes: "attempt=2",
			attempt: 2,
		};
		const report = renderCloseReport(
			"260907_0000_close-report",
			[task],
			[evidence("E-old", 1), evidence("E-current", 2)],
			"declared: close verified",
		);

		expect(report).toBe(
			"# Report: 260907_0000_close-report\n\n" +
				"## Summary\n" +
				"declared: close verified\n\n" +
				"## Tasks\n" +
				"- T-01: done\n\n" +
				"## Evidence\n" +
				"- T-01 attempt=1 evidence_id=E-old: passed (bun test; exit_code=0)\n" +
				"- T-01 attempt=2 evidence_id=E-current authorizing: passed (bun test; exit_code=0)\n",
		);
	});

	test("keeps close markdown normalization byte-stable", () => {
		expect(closeMarkdownText("## Heading\nbody\r\nnext")).toBe(
			"### Heading body next",
		);
	});
});
