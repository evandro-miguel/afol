import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runHydrateCommand } from "../commands/hydrate";
import { runStateCommand } from "../commands/state";
import { removeTestRoot } from "./windows-test-support";

function createFixture(): string {
	const root = mkdtempSync(join(tmpdir(), "state-command-"));
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
		["# Plan", "", "test plan"].join("\n"),
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

function captureIo() {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		stdout,
		stderr,
		io: {
			stdout: (message: string) => stdout.push(message),
			stderr: (message: string) => stderr.push(message),
		},
	};
}

function parseEnvelope(output: string[]): Record<string, unknown> {
	return JSON.parse(output[0] ?? "{}") as Record<string, unknown>;
}

describe("state commands", () => {
	test("afol hydrate -S test-session returns 0 and prints ok", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			expect(
				await runHydrateCommand(
					"hydrate",
					["-S", "test-session"],
					root,
					captured.io,
				),
			).toBe(0);
			expect(captured.stdout.join("\n")).toContain("hydrate: ok");
			expect(captured.stdout.join("\n")).toContain("test-session");
			expect(captured.stderr).toEqual([]);
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol hydrate -S test-session --json returns envelope with legacy keys", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			expect(
				await runHydrateCommand(
					"hydrate",
					["-S", "test-session", "--json"],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = parseEnvelope(captured.stdout);
			expect(payload).toMatchObject({
				schema: "afol.result/v1",
				ok: true,
				exit_code: 0,
				action: "hydrate",
			});
			expect((payload.snapshot as { sessionId: string }).sessionId).toBe(
				"test-session",
			);
			expect(payload.session as string).toBe("test-session");
			expect(
				(payload.data as { snapshot: { sessionId: string }; session: string })
					.snapshot.sessionId,
			).toBe("test-session");
			expect(
				(payload.data as { snapshot: { sessionId: string }; session: string })
					.session,
			).toBe("test-session");
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol hydrate --all uses canonical workbench session discovery", async () => {
		const root = createFixture();
		try {
			mkdirSync(join(root, ".afol", "wb", "custom-session"), {
				recursive: true,
			});
			mkdirSync(join(root, ".afol", "wb", ".hidden-session"), {
				recursive: true,
			});
			mkdirSync(join(root, ".afol", "wb", "_archive"), { recursive: true });
			mkdirSync(join(root, ".afol", "wb", "screenshots"), { recursive: true });

			const captured = captureIo();
			expect(
				await runHydrateCommand(
					"hydrate",
					["--all", "--json"],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = parseEnvelope(captured.stdout);
			expect(payload).toMatchObject({
				schema: "afol.result/v1",
				ok: true,
				exit_code: 0,
				action: "hydrate.all",
				session_count: 2,
			});

			const db = new Database(join(root, ".afol", "state", "afol.db"), {
				readonly: true,
			});
			try {
				const sessions = db
					.query("SELECT session_id FROM sessions ORDER BY session_id")
					.all() as Array<{ session_id: string }>;
				expect(sessions.map((row) => row.session_id)).toEqual([
					"custom-session",
					"test-session",
				]);
			} finally {
				db.close();
			}
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol hydrate --all reports failures with the aggregate action", async () => {
		const root = createFixture();
		try {
			mkdirSync(join(root, ".afol", "wb", "bad session"), { recursive: true });
			const captured = captureIo();
			expect(
				await runHydrateCommand(
					"hydrate",
					["--all", "--json"],
					root,
					captured.io,
				),
			).toBe(1);
			const payload = parseEnvelope(captured.stdout);
			expect(payload).toMatchObject({
				schema: "afol.result/v1",
				ok: false,
				exit_code: 1,
				action: "hydrate.all",
				session: "bad session",
			});
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol hydrate rejects --all with --session", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			expect(
				await runHydrateCommand(
					"hydrate",
					["--all", "--session", "test-session"],
					root,
					captured.io,
				),
			).toBe(2);
			expect(captured.stderr.join("\n")).toContain(
				"Use either --all or --session for hydrate, not both.",
			);
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol state validate -S test-session returns 0", async () => {
		const root = createFixture();
		try {
			const hydrated = captureIo();
			expect(
				await runHydrateCommand(
					"hydrate",
					["-S", "test-session"],
					root,
					hydrated.io,
				),
			).toBe(0);
			const captured = captureIo();
			expect(
				await runStateCommand(
					"validate",
					["-S", "test-session"],
					root,
					captured.io,
				),
			).toBe(0);
			expect(captured.stdout.join("\n")).toContain("state validate: ok");
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol state validate -S test-session --json returns envelope with legacy keys", async () => {
		const root = createFixture();
		try {
			const hydrated = captureIo();
			expect(
				await runHydrateCommand(
					"hydrate",
					["-S", "test-session"],
					root,
					hydrated.io,
				),
			).toBe(0);
			const captured = captureIo();
			expect(
				await runStateCommand(
					"validate",
					["-S", "test-session", "--json"],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = parseEnvelope(captured.stdout);
			expect(payload).toMatchObject({
				schema: "afol.result/v1",
				ok: true,
				exit_code: 0,
				action: "state.validate",
			});
			expect((payload.result as { sessionId: string }).sessionId).toBe(
				"test-session",
			);
			expect(payload.session as string).toBe("test-session");
			expect(
				(payload.data as { result: { sessionId: string }; session: string })
					.result.sessionId,
			).toBe("test-session");
			expect(
				(payload.data as { result: { sessionId: string }; session: string })
					.session,
			).toBe("test-session");
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol state show -S test-session --json returns JSON with session data", async () => {
		const root = createFixture();
		try {
			const hydrated = captureIo();
			expect(
				await runHydrateCommand(
					"hydrate",
					["-S", "test-session"],
					root,
					hydrated.io,
				),
			).toBe(0);
			const captured = captureIo();
			expect(
				await runStateCommand(
					"show",
					["-S", "test-session", "--json"],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = parseEnvelope(captured.stdout);
			expect(payload).toMatchObject({
				schema: "afol.result/v1",
				ok: true,
				exit_code: 0,
				action: "state.show",
			});
			expect(
				(
					payload.snapshot as {
						sessionId: string;
						summary: { taskRows: number; evidenceEntries: number };
					}
				).sessionId,
			).toBe("test-session");
			expect(payload.session as string).toBe("test-session");
			expect(
				(
					payload.data as {
						snapshot: {
							sessionId: string;
							summary: { taskRows: number; evidenceEntries: number };
						};
						session: string;
					}
				).snapshot.summary.taskRows,
			).toBe(1);
			expect(
				(
					payload.data as {
						snapshot: {
							sessionId: string;
							summary: { taskRows: number; evidenceEntries: number };
						};
						session: string;
					}
				).snapshot.summary.evidenceEntries,
			).toBe(1);
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol state show -S test-session --json includes generated task files", async () => {
		const root = createFixture();
		try {
			seedGeneratedTaskFiles(root);
			const hydrated = captureIo();
			expect(
				await runHydrateCommand(
					"hydrate",
					["-S", "test-session"],
					root,
					hydrated.io,
				),
			).toBe(0);
			const captured = captureIo();
			expect(
				await runStateCommand(
					"show",
					["-S", "test-session", "--json"],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = parseEnvelope(captured.stdout);
			expect(
				(
					payload.snapshot as {
						sessionId: string;
						sourceFiles: unknown[];
						summary: { taskFiles: number; taskRows: number };
					}
				).sessionId,
			).toBe("test-session");
			expect(
				(
					payload.data as {
						snapshot: {
							sessionId: string;
							sourceFiles: unknown[];
							summary: { taskFiles: number; taskRows: number };
						};
						session: string;
					}
				).snapshot.sourceFiles,
			).toHaveLength(4);
			expect(
				(
					payload.data as {
						snapshot: {
							sessionId: string;
							sourceFiles: unknown[];
							summary: { taskFiles: number; taskRows: number };
						};
						session: string;
					}
				).snapshot.summary,
			).toMatchObject({
				taskFiles: 2,
				taskRows: 2,
			});
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol state export -S test-session --json returns full export", async () => {
		const root = createFixture();
		try {
			const hydrated = captureIo();
			expect(
				await runHydrateCommand(
					"hydrate",
					["-S", "test-session"],
					root,
					hydrated.io,
				),
			).toBe(0);
			const captured = captureIo();
			expect(
				await runStateCommand(
					"export",
					["-S", "test-session", "--json"],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = parseEnvelope(captured.stdout);
			expect(payload).toMatchObject({
				schema: "afol.result/v1",
				ok: true,
				exit_code: 0,
				action: "state.export",
			});
			expect(
				(payload.snapshot as { sessionId: string; sourceFiles: unknown[] })
					.sessionId,
			).toBe("test-session");
			expect(payload.session as string).toBe("test-session");
			expect(
				(
					payload.data as {
						snapshot: {
							sessionId: string;
							sourceFiles: unknown[];
							summary: { taskRows: number };
						};
						session: string;
					}
				).snapshot.sourceFiles,
			).toHaveLength(3);
			expect(
				(
					payload.data as {
						snapshot: {
							sessionId: string;
							sourceFiles: unknown[];
							summary: { taskRows: number };
						};
						session: string;
					}
				).snapshot.summary.taskRows,
			).toBe(1);
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol hydrate without session returns error", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			expect(await runHydrateCommand("hydrate", [], root, captured.io)).toBe(2);
			expect(captured.stderr.join("\n")).toContain(
				"Missing --session or --all for hydrate.",
			);
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol state export --json without hydration returns failure envelope", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			expect(
				await runStateCommand(
					"export",
					["-S", "test-session", "--json"],
					root,
					captured.io,
				),
			).toBe(1);
			const payload = parseEnvelope(captured.stdout);
			expect(payload).toMatchObject({
				schema: "afol.result/v1",
				ok: false,
				exit_code: 1,
				action: "state.export",
			});
			expect(payload.session as string).toBe("test-session");
			expect((payload.data as { session: string }).session).toBe(
				"test-session",
			);
			expect(payload.snapshot).toBeUndefined();
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol state show returns human output after hydrate", async () => {
		const root = createFixture();
		try {
			const hydrated = captureIo();
			expect(
				await runHydrateCommand(
					"hydrate",
					["-S", "test-session"],
					root,
					hydrated.io,
				),
			).toBe(0);
			const captured = captureIo();
			expect(
				await runStateCommand(
					"show",
					["-S", "test-session"],
					root,
					captured.io,
				),
			).toBe(0);
			expect(captured.stdout.join("\n")).toContain("state: test-session");
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol state defaults to active session when session is omitted", async () => {
		const root = createFixture();
		try {
			seedGeneratedTaskFiles(root);
			const hydrated = captureIo();
			expect(
				await runHydrateCommand(
					"hydrate",
					["-S", "test-session"],
					root,
					hydrated.io,
				),
			).toBe(0);
			writeFileSync(
				join(root, ".afol", "wb", ".active_session"),
				"test-session\n",
				"utf8",
			);
			const captured = captureIo();
			expect(await runStateCommand("", [], root, captured.io)).toBe(0);
			expect(captured.stdout.join("\n")).toContain("state: test-session");
			expect(captured.stderr).toEqual([]);
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol state without session or active session returns actionable error", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			expect(await runStateCommand("", [], root, captured.io)).toBe(2);
			expect(captured.stderr.join("\n")).toContain(
				"Missing usable session for state",
			);
			expect(captured.stderr.join("\n")).toContain("afol ss list");
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol state sync --json returns hydrated snapshot", async () => {
		const root = createFixture();
		try {
			const hydrated = captureIo();
			expect(
				await runHydrateCommand(
					"hydrate",
					["-S", "test-session"],
					root,
					hydrated.io,
				),
			).toBe(0);
			const captured = captureIo();
			expect(
				await runStateCommand(
					"sync",
					["-S", "test-session", "--json"],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = parseEnvelope(captured.stdout);
			expect(payload).toMatchObject({
				schema: "afol.result/v1",
				ok: true,
				exit_code: 0,
				action: "state.sync",
			});
			expect((payload.snapshot as { sessionId: string }).sessionId).toBe(
				"test-session",
			);
			expect(payload.session as string).toBe("test-session");
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol state validate returns drift when task changes", async () => {
		const root = createFixture();
		try {
			const hydrated = captureIo();
			expect(
				await runHydrateCommand(
					"hydrate",
					["-S", "test-session"],
					root,
					hydrated.io,
				),
			).toBe(0);
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
			const captured = captureIo();
			expect(
				await runStateCommand(
					"validate",
					["-S", "test-session"],
					root,
					captured.io,
				),
			).toBe(1);
			expect(captured.stdout.join("\n")).toContain("state validate: fail");
			const shown = captureIo();
			expect(
				await runStateCommand(
					"show",
					["-S", "test-session", "--json"],
					root,
					shown.io,
				),
			).toBe(0);
			const shownPayload = parseEnvelope(shown.stdout);
			expect(shownPayload.stale).toBe(true);
			expect((shownPayload.data as { stale: boolean }).stale).toBe(true);
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol state export without hydration returns error", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			expect(
				await runStateCommand(
					"export",
					["-S", "test-session"],
					root,
					captured.io,
				),
			).toBe(1);
			expect(captured.stderr.join("\n")).toContain(
				"no hydrated state for test-session",
			);
		} finally {
			removeTestRoot(root);
		}
	});
});
