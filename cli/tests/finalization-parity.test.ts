import { describe, expect, spyOn, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runQuickTaskCommand } from "../commands/quick-task";
import { runStatusCommand } from "../commands/status";
import { runDoneCommand } from "../commands/workbench";
import { parseDoneArgs, parseVerifyArgs } from "../commands/workbench/args";
import { removeEvolutionTestRoot } from "./evolution-test-support";

function fixture(): string {
	const root = mkdtempSync(join(tmpdir(), "finalization-parity-"));
	mkdirSync(join(root, ".afol/wb"), { recursive: true });
	writeFileSync(
		join(root, ".afol/config.json"),
		JSON.stringify({ schema_version: 1, project: { name: "parity" } }),
	);
	mkdirSync(join(root, ".agents"));
	writeFileSync(
		join(root, ".agents/lock.json"),
		JSON.stringify({
			schema_version: 1,
			revision: "abc123",
			project: "parity",
			locked: true,
		}),
	);
	return root;
}

function session(root: string, id: string, state: "pending" | "closed"): void {
	const directory = join(root, ".afol/wb", id);
	mkdirSync(directory);
	writeFileSync(
		join(directory, `${id}_task_01.md`),
		`---\ndoc_type: "workbench_task"\nid: "${id}_task_01"\nsession_id: "${id}"\nstatus: "${state === "closed" ? "closed" : "open"}"\nupdated_at: "2026-09-30T12:00:00.000Z"\n${state === "closed" ? 'closed_at: "2026-09-30T12:00:00.000Z"\n' : ""}---\n\n## State Board\n\n| Task | State | Owner | Notes |\n| --- | --- | --- | --- |\n| T-01 | ${state === "closed" ? "done" : "pending"} | agent | test |\n`,
	);
}

describe("finalization product parity", () => {
	test("done JSON recovery preserves the requested task after parse failure", async () => {
		const root = fixture();
		const output: string[] = [];
		const log = spyOn(console, "log").mockImplementation((value) => {
			output.push(String(value));
		});
		try {
			const before = readdirSync(root, { recursive: true });
			expect(
				await runDoneCommand(["T-07", "--test", "true", "--json"], root),
			).toBe(2);
			const result = JSON.parse(output.at(-1) ?? "{}");
			expect(result.data.task_id).toBe("T-07");
			expect(result.data.task_ids).toEqual(["T-07"]);
			expect(result.data.failed_step).toBe("parse");
			expect(result.data.next_command).toBe('afol d T-07 -x "<cmd>"');
			expect(readdirSync(root, { recursive: true })).toEqual(before);
		} finally {
			log.mockRestore();
			removeEvolutionTestRoot(root);
		}
	});
	test("quick-task rejects no-op before creating lifecycle state", async () => {
		const root = fixture();
		try {
			const before = readdirSync(root, { recursive: true });
			expect(
				await runQuickTaskCommand(
					["probe", "--command", "true", "--json"],
					root,
				),
			).toBe(2);
			expect(readdirSync(root, { recursive: true })).toEqual(before);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("done rejects shell and argv no-ops without writing state", () => {
		const root = fixture();
		try {
			for (const flag of ["--test", "--test-shell"]) {
				expect(() =>
					parseDoneArgs(
						["--session", "260930_1200_parity", "T-01", flag, "true"],
						root,
					),
				).toThrow("shell no-op");
			}
			expect(() =>
				parseDoneArgs(
					["--session", "260930_1200_parity", "T-01", "--", "true"],
					root,
				),
			).toThrow("shell no-op");
			expect(existsSync(join(root, ".afol/state"))).toBe(false);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("omitted verify targets the bound session and fails without one", () => {
		const root = fixture();
		try {
			expect(() => parseVerifyArgs([], root)).toThrow("Missing --session");
			const id = "260930_1200_parity";
			session(root, id, "pending");
			writeFileSync(join(root, ".afol/wb/.active_session"), `${id}\n`);
			expect(parseVerifyArgs([], root).sessionPath).toBe(
				join(root, ".afol/wb", id),
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	for (const openCount of [0, 1, 2]) {
		test(`unbound status recommends using ${openCount} open sessions independently of history`, () => {
			const root = fixture();
			try {
				session(root, "260930_1000_history", "closed");
				for (let i = 0; i < openCount; i++)
					session(root, `260930_120${i}_parity`, "pending");
				const stdout: string[] = [];
				expect(
					runStatusCommand(root, ["--json"], {
						stdout: (text) => stdout.push(text),
						stderr: () => {},
					}),
				).toBe(0);
				const payload = JSON.parse(stdout.join("\n"));
				expect(payload.status).toBe("none");
				expect(payload.safe_next_action).toBe(
					openCount === 0
						? 'afol qt <theme> -t "<task>" -c "<cmd>"'
						: openCount === 1
							? "afol ss switch 260930_1200_parity"
							: "afol ss list",
				);
				expect(
					readFileSync(
						join(
							root,
							".afol/wb/260930_1000_history/260930_1000_history_task_01.md",
						),
						"utf8",
					),
				).toContain('status: "closed"');
			} finally {
				removeEvolutionTestRoot(root);
			}
		});
	}
});
