import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../services/state/db";
import {
	hydrateSession,
	validateSessionState,
} from "../services/state/session-state";
import { isStale } from "../services/state/validate";
import { removeTestRoot } from "./windows-test-support";

function createFixture(): string {
	const root = mkdtempSync(join(tmpdir(), "state-sqlite-"));
	mkdirSync(join(root, ".agents"), { recursive: true });
	mkdirSync(join(root, ".afol", "wb", "test-session"), { recursive: true });
	writeFileSync(
		join(root, ".agents", "config.json"),
		JSON.stringify({ schema_version: 1 }),
		"utf8",
	);
	writeFileSync(
		join(root, ".agents", "lock.json"),
		JSON.stringify({ schema_version: 1, locked: true }),
		"utf8",
	);
	writeFileSync(
		join(root, ".afol", "wb", "test-session", "plan.md"),
		["# Plan", "", "plan body"].join("\n"),
		"utf8",
	);
	writeFileSync(
		join(root, ".afol", "wb", "test-session", "task.md"),
		[
			"# Tasks",
			"",
			"| Task | State | Owner | Notes |",
			"|------|-------|-------|-------|",
			"| T-01 | pending | worker | first task |",
			"| T-02 | done | worker | second task |",
			"",
		].join("\n"),
		"utf8",
	);
	writeFileSync(
		join(root, ".afol", "wb", "test-session", ".evidence.jsonl"),
		[
			JSON.stringify({
				id: "E-1",
				task_id: "T-01",
				created_at: "2026-06-12T00:00:00.000Z",
				command: "bun test",
				result: "passed",
			}),
			JSON.stringify({
				id: "E-2",
				task_id: "T-02",
				created_at: "2026-06-12T00:01:00.000Z",
				command: "bun run validate",
				result: "passed",
				note: "ok",
			}),
			"",
		].join("\n"),
		"utf8",
	);
	return root;
}

function seedGeneratedTaskFiles(
	root: string,
	sessionId = "test-session",
): void {
	const sessionDir = join(root, ".afol", "wb", sessionId);
	rmSync(join(sessionDir, "task.md"), { force: true });
	writeFileSync(
		join(sessionDir, `${sessionId}_task_01.md`),
		[
			"# Tasks",
			"",
			"## State Board",
			"",
			"| Task | State | Owner | Notes |",
			"|------|-------|-------|-------|",
			"| T-01 | pending | worker | first generated task |",
			"",
		].join("\n"),
		"utf8",
	);
	writeFileSync(
		join(sessionDir, `${sessionId}_task_02.md`),
		[
			"# Tasks",
			"",
			"## State Board",
			"",
			"| Task | State | Owner | Notes |",
			"|------|-------|-------|-------|",
			"| T-02 | done | worker | second generated task |",
			"",
		].join("\n"),
		"utf8",
	);
}

describe("state sqlite", () => {
	test("duplicate task ids abort hydration before replacing the snapshot", () => {
		const root = createFixture();
		try {
			hydrateSession(root, "test-session");
			writeFileSync(
				join(root, ".afol", "wb", "test-session", "duplicate_task_02.md"),
				[
					"# Tasks",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | pending | worker | duplicate |",
					"",
				].join("\n"),
			);
			expect(() => hydrateSession(root, "test-session")).toThrow(
				"Duplicate task id T-01",
			);
			const db = openDb(root);
			try {
				const rows = db
					.query(
						"SELECT task_id FROM tasks WHERE session_id = ? ORDER BY task_id",
					)
					.all("test-session") as Array<{ task_id: string }>;
				expect(rows.map((row) => row.task_id)).toEqual(["T-01", "T-02"]);
			} finally {
				db.close();
			}
		} finally {
			removeTestRoot(root);
		}
	});
	test("openDb creates DB and tables on first open", () => {
		const root = createFixture();
		try {
			const dbPath = join(root, ".afol", "state", "afol.db");
			expect(existsSync(dbPath)).toBe(false);
			const db = openDb(root);
			try {
				expect(existsSync(dbPath)).toBe(true);
				const tables = db
					.query(
						`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
					)
					.all() as Array<{ name: string }>;
				expect(tables.map((row) => row.name)).toEqual(
					expect.arrayContaining([
						"evidence",
						"sessions",
						"source_files",
						"tasks",
					]),
				);
				const journalMode = db.query(`PRAGMA journal_mode`).get() as {
					journal_mode: string;
				} | null;
				expect(journalMode?.journal_mode).toBe("wal");
			} finally {
				db.close();
			}
		} finally {
			removeTestRoot(root);
		}
	});

	test("openDb idempotent — opening twice doesn't error", () => {
		const root = createFixture();
		try {
			const first = openDb(root);
			const second = openDb(root);
			first.close();
			second.close();
			expect(true).toBe(true);
		} finally {
			removeTestRoot(root);
		}
	});

	test("hydrateSession inserts session row into DB", () => {
		const root = createFixture();
		try {
			hydrateSession(root, "test-session");
			const db = openDb(root);
			try {
				const row = db
					.query(
						`SELECT session_id, source_hash FROM sessions WHERE session_id = ?`,
					)
					.get("test-session") as {
					session_id: string;
					source_hash: string;
				} | null;
				expect(row?.session_id).toBe("test-session");
				expect(row?.source_hash).toMatch(/^[0-9a-f]{64}$/);
			} finally {
				db.close();
			}
		} finally {
			removeTestRoot(root);
		}
	});

	test("hydrateSession inserts task rows", () => {
		const root = createFixture();
		try {
			hydrateSession(root, "test-session");
			const db = openDb(root);
			try {
				const rows = db
					.query(
						`SELECT task_id, state, owner, notes FROM tasks WHERE session_id = ? ORDER BY task_id ASC`,
					)
					.all("test-session") as Array<{
					task_id: string;
					state: string;
					owner: string;
					notes: string;
				}>;
				expect(rows).toEqual([
					{
						task_id: "T-01",
						state: "pending",
						owner: "worker",
						notes: "first task",
					},
					{
						task_id: "T-02",
						state: "done",
						owner: "worker",
						notes: "second task",
					},
				]);
			} finally {
				db.close();
			}
		} finally {
			removeTestRoot(root);
		}
	});

	test("hydrateSession persists generated task files", () => {
		const root = createFixture();
		try {
			seedGeneratedTaskFiles(root);
			hydrateSession(root, "test-session");
			expect(validateSessionState(root, "test-session")).toMatchObject({
				ok: true,
				storedSourceCount: 4,
				currentSourceCount: 4,
			});
			const db = openDb(root);
			try {
				const rows = db
					.query(
						`SELECT task_id, state, owner, notes FROM tasks WHERE session_id = ? ORDER BY task_id ASC`,
					)
					.all("test-session") as Array<{
					task_id: string;
					state: string;
					owner: string;
					notes: string;
				}>;
				expect(rows).toEqual([
					{
						task_id: "T-01",
						state: "pending",
						owner: "worker",
						notes: "first generated task",
					},
					{
						task_id: "T-02",
						state: "done",
						owner: "worker",
						notes: "second generated task",
					},
				]);
			} finally {
				db.close();
			}
		} finally {
			removeTestRoot(root);
		}
	});

	test("hydrateSession inserts evidence rows", () => {
		const root = createFixture();
		try {
			hydrateSession(root, "test-session");
			const db = openDb(root);
			try {
				const rows = db
					.query(
						`SELECT evidence_id, task_id, command, result FROM evidence WHERE session_id = ? ORDER BY evidence_id ASC`,
					)
					.all("test-session") as Array<{
					evidence_id: string;
					task_id: string;
					command: string;
					result: string;
				}>;
				expect(rows).toEqual([
					{
						evidence_id: "E-1",
						task_id: "T-01",
						command: "bun test",
						result: "passed",
					},
					{
						evidence_id: "E-2",
						task_id: "T-02",
						command: "bun run validate",
						result: "passed",
					},
				]);
			} finally {
				db.close();
			}
		} finally {
			removeTestRoot(root);
		}
	});

	test("hydrateSession streams evidence larger than the read buffer", () => {
		const root = createFixture();
		try {
			const evidencePath = join(
				root,
				".afol",
				"wb",
				"test-session",
				".evidence.jsonl",
			);
			const entries = Array.from({ length: 2_000 }, (_, index) =>
				JSON.stringify({
					id: `E-${index}`,
					task_id: "T-01",
					created_at: "2026-08-30T00:00:00Z",
					command: "bun test",
					result: "passed",
				}),
			);
			writeFileSync(evidencePath, `${entries.join("\n")}\n`, "utf8");

			const snapshot = hydrateSession(root, "test-session");
			expect(snapshot.summary.evidenceEntries).toBe(2_000);
			const db = openDb(root);
			try {
				const row = db
					.query("SELECT COUNT(*) AS count FROM evidence WHERE session_id = ?")
					.get("test-session") as { count: number };
				expect(row.count).toBe(2_000);
			} finally {
				db.close();
			}
		} finally {
			removeTestRoot(root);
		}
	});

	test("hydrateSession rejects an unbounded evidence line", () => {
		const root = createFixture();
		try {
			writeFileSync(
				join(root, ".afol", "wb", "test-session", ".evidence.jsonl"),
				"x".repeat(1_000_001),
				"utf8",
			);
			expect(() => hydrateSession(root, "test-session")).toThrow(
				"State source line exceeds 1000000 characters",
			);
		} finally {
			removeTestRoot(root);
		}
	});

	test("hydrateSession computes and stores source hash", () => {
		const root = createFixture();
		try {
			hydrateSession(root, "test-session");
			const db = openDb(root);
			try {
				const row = db
					.query(`SELECT source_hash FROM sessions WHERE session_id = ?`)
					.get("test-session") as { source_hash: string } | null;
				expect(row?.source_hash).toMatch(/^[0-9a-f]{64}$/);
			} finally {
				db.close();
			}
		} finally {
			removeTestRoot(root);
		}
	});

	test("validateState returns ok for fresh hydration", () => {
		const root = createFixture();
		try {
			hydrateSession(root, "test-session");
			expect(validateSessionState(root, "test-session")).toMatchObject({
				ok: true,
			});
		} finally {
			removeTestRoot(root);
		}
	});

	test("validateState returns fail when source file changes after hydration", () => {
		const root = createFixture();
		try {
			hydrateSession(root, "test-session");
			writeFileSync(
				join(root, ".afol", "wb", "test-session", "task.md"),
				[
					"# Tasks",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | done | worker | changed |",
					"",
				].join("\n"),
				"utf8",
			);
			expect(validateSessionState(root, "test-session")).toMatchObject({
				ok: false,
			});
		} finally {
			removeTestRoot(root);
		}
	});

	test("isStale returns false for fresh, true after source change", () => {
		const root = createFixture();
		try {
			hydrateSession(root, "test-session");
			expect(isStale(root, "test-session")).toBe(false);
			writeFileSync(
				join(root, ".afol", "wb", "test-session", "plan.md"),
				["# Plan", "", "updated plan"].join("\n"),
				"utf8",
			);
			expect(isStale(root, "test-session")).toBe(true);
		} finally {
			removeTestRoot(root);
		}
	});

	test("malformed evidence aborts hydration and leaves prior snapshot stale", () => {
		const root = createFixture();
		try {
			hydrateSession(root, "test-session");
			writeFileSync(
				join(root, ".afol", "wb", "test-session", ".evidence.jsonl"),
				"{broken\n",
				"utf8",
			);
			expect(() => hydrateSession(root, "test-session")).toThrow(
				"Invalid evidence JSON",
			);
			expect(isStale(root, "test-session")).toBe(true);
		} finally {
			removeTestRoot(root);
		}
	});
});
