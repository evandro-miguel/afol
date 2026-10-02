import { describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	closeSession,
	newWorkstream,
	startTask,
} from "../services/workbench/lifecycle";
import { verifyTaskText } from "../services/workbench/verify";

function mkRoot(name: string): string {
	return mkdtempSync(join(tmpdir(), `wb-state-board-${name}-`));
}

function writeCliProjectContract(root: string): void {
	const agentsDir = join(root, ".agents");
	mkdirSync(agentsDir, { recursive: true });
	writeFileSync(
		join(root, ".agents", "config.json"),
		JSON.stringify(
			{
				schema_version: 1,
				paths: {
					agents_dir: ".agents",
					mutable_dir: ".afol",
					wb_dir: ".afol/wb",
					active_session_file: ".afol/wb/.active_session",
					data_dir: ".afol/data",
					data_index_dir: ".afol/data/index",
					events_file: ".afol/data/events/events.jsonl",
				},
			},
			null,
			2,
		),
		"utf8",
	);
	writeFileSync(
		join(root, ".agents", "lock.json"),
		JSON.stringify({ schema_version: 1, locked: true }),
		"utf8",
	);
}

describe("workbench State Board task mutations", () => {
	test.each(["start", "carry-open", "repeat-close"])(
		"rejects %s before mutating a State Board without Notes",
		(operation) => {
			const root = mkRoot("missing-notes");
			try {
				writeCliProjectContract(root);
				const created = newWorkstream(root, "missing-notes", {
					tasks: ["retain attempt and destination metadata"],
					featureId: "F-04",
					parentSpec: "notes-column-fixture",
				});
				let before = readFileSync(created.taskPath, "utf8").replace(
					/^(\|[^|\n]+\|[^|\n]+\|[^|\n]+\|)[^|\n]*\|$/gm,
					"$1",
				);
				if (operation === "repeat-close") {
					const closedAt = new Date().toISOString();
					before = before
						.replace(
							/^status: .*$/m,
							`status: "closed"\nclosed_at: "${closedAt}"`,
						)
						.replace(/^updated_at: .*$/m, `updated_at: "${closedAt}"`);
				}
				writeFileSync(created.taskPath, before);
				const planBefore = readFileSync(created.planPath, "utf8");
				expect(verifyTaskText(before, created.taskPath).totalTasks).toBe(1);
				const mutate = () =>
					operation === "start"
						? startTask(root, { session: created.session, taskId: "T-01" })
						: closeSession(root, created.session, {
								carryOpen: true,
								reason: "defer work",
							});
				expect(mutate).toThrow("State Board requires a Notes column");
				expect(readFileSync(created.taskPath, "utf8")).toBe(before);
				expect(readFileSync(created.planPath, "utf8")).toBe(planBefore);
				expect(readFileSync(created.activeSessionPath, "utf8").trim()).toBe(
					created.session,
				);
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		},
	);

	test("keeps legacy headingless task tables when a fenced example contains a State Board heading", () => {
		const root = mkRoot("legacy-fenced-heading");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "legacy-fenced-heading", {
				tasks: ["legacy task"],
				noSpecRequiredReason: "parser fixture",
			});
			const example =
				"~~~md\n## State Board\n| Task | State | Owner | Notes |\n| --- | --- | --- | --- |\n| T-01 | problem | example | decoy |\n~~~\n";
			const content = readFileSync(created.taskPath, "utf8").replace(
				"## State Board",
				"",
			);
			writeFileSync(created.taskPath, `${content}\n${example}`);
			startTask(root, { session: created.session, taskId: "T-01" });
			const updated = readFileSync(created.taskPath, "utf8");
			expect(updated).toContain(
				"| T-01 | in_progress | worker | legacy task attempt=1 |",
			);
			expect(updated).toContain(example);
			expect(verifyTaskText(updated, created.taskPath).totalTasks).toBe(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("start reads and mutates only the canonical State Board table", () => {
		const root = mkRoot("canonical-only");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "canonical-only", {
				tasks: ["first task", "second task"],
				noSpecRequiredReason: "parser fixture",
			});
			const taskDocument = readFileSync(created.taskPath, "utf8");
			const decoys = [
				"## Examples",
				"",
				"~~~md",
				"## State Board",
				"| Task | State | Owner | Notes |",
				"|------|-------|-------|-------|",
				"| T-01 | problem | example | reason=tilde-fenced-decoy |",
				"```",
				"| T-01 | problem | example | reason=mismatched-fence-decoy |",
				"~~~~",
				"",
				"    ## State Board",
				"    | Task | State | Owner | Notes |",
				"    |------|-------|-------|-------|",
				"    | T-01 | problem | example | reason=indented-code-decoy |",
				"",
				"````md",
				"## State Board",
				"| Task | State | Owner | Notes |",
				"|------|-------|-------|-------|",
				"| T-02 | problem | example | reason=long-backtick-fenced-decoy |",
				"```",
				"| T-02 | problem | example | reason=short-close-decoy |",
				"`````",
				"",
				"```md",
				"| Task | State | Owner | Notes |",
				"|------|-------|-------|-------|",
				"| T-01 | problem | example | reason=fenced-decoy |",
				"```",
				"",
				"## Reference table",
				"",
				"| Task | State | Owner | Notes |",
				"|------|-------|-------|-------|",
				"| T-02 | problem | reference | reason=unrelated-decoy |",
			].join("\n");
			writeFileSync(
				created.taskPath,
				taskDocument.replace("## State Board", `${decoys}\n\n## State Board`),
				"utf8",
			);

			startTask(root, { session: created.session, taskId: "T-01" });
			startTask(root, { session: created.session, taskId: "T-02" });

			const updated = readFileSync(created.taskPath, "utf8");
			expect(updated).toContain(
				"| T-01 | in_progress | worker | first task attempt=1 |",
			);
			expect(updated).toContain(
				"| T-02 | in_progress | worker | second task attempt=1 |",
			);
			expect(updated).toContain(
				"| T-01 | problem | example | reason=fenced-decoy |",
			);
			expect(updated).toContain(
				"| T-01 | problem | example | reason=tilde-fenced-decoy |",
			);
			expect(updated).toContain(
				"| T-01 | problem | example | reason=mismatched-fence-decoy |",
			);
			expect(updated).toContain(
				"| T-01 | problem | example | reason=indented-code-decoy |",
			);
			expect(updated).toContain(
				"| T-02 | problem | example | reason=short-close-decoy |",
			);
			expect(updated).toContain(
				"| T-02 | problem | reference | reason=unrelated-decoy |",
			);
			const verification = verifyTaskText(updated, created.taskPath);
			expect(verification.totalTasks).toBe(2);
			expect(verification.issues.map((issue) => issue.type)).not.toContain(
				"duplicate_task_id",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("duplicate canonical task ids fail before start or strict close writes", () => {
		const root = mkRoot("duplicate-canonical");
		try {
			writeCliProjectContract(root);
			const created = newWorkstream(root, "duplicate-canonical", {
				tasks: ["first task", "second task"],
				noSpecRequiredReason: "parser fixture",
			});
			const taskDocument = readFileSync(created.taskPath, "utf8");
			const duplicate = "| T-01 | pending | worker | duplicate canonical id |";
			const brokenDocument = taskDocument.replace(
				"| T-02 | pending | worker | second task |",
				`| T-02 | pending | worker | second task |\n${duplicate}`,
			);
			writeFileSync(created.taskPath, brokenDocument, "utf8");

			expect(() =>
				startTask(root, { session: created.session, taskId: "T-02" }),
			).toThrow("Duplicate task id T-01");
			expect(readFileSync(created.taskPath, "utf8")).toBe(brokenDocument);
			const verification = verifyTaskText(brokenDocument, created.taskPath);
			expect(verification.issues.map((issue) => issue.type)).toContain(
				"duplicate_task_id",
			);
			const error = (() => {
				try {
					closeSession(root, created.session, {
						carryOpen: true,
						reason: "duplicate board rows",
					});
				} catch (caught) {
					return caught as Error;
				}
				return undefined;
			})();
			expect(error?.message).toContain("Duplicate task id T-01");
			expect(readFileSync(created.taskPath, "utf8")).toBe(brokenDocument);
			expect(readFileSync(created.activeSessionPath, "utf8").trim()).toBe(
				created.session,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
