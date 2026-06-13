import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runHydrateCommand } from "../commands/hydrate";
import { runStateCommand } from "../commands/state";

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
			rmSync(root, { recursive: true, force: true });
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
			rmSync(root, { recursive: true, force: true });
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
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				ok: boolean;
				snapshot: {
					sessionId: string;
					summary: { taskRows: number; evidenceEntries: number };
				};
			};
			expect(payload.ok).toBe(true);
			expect(payload.snapshot.sessionId).toBe("test-session");
			expect(payload.snapshot.summary.taskRows).toBe(1);
			expect(payload.snapshot.summary.evidenceEntries).toBe(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
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
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				ok: boolean;
				snapshot: {
					sessionId: string;
					sourceFiles: unknown[];
					summary: { taskRows: number };
				};
			};
			expect(payload.ok).toBe(true);
			expect(payload.snapshot.sessionId).toBe("test-session");
			expect(payload.snapshot.sourceFiles).toHaveLength(3);
			expect(payload.snapshot.summary.taskRows).toBe(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol hydrate without session returns error", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			expect(await runHydrateCommand("hydrate", [], root, captured.io)).toBe(2);
			expect(captured.stderr.join("\n")).toContain(
				"Missing --session for hydrate.",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
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
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol state sync --json returns hydrated snapshot", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			expect(
				await runStateCommand(
					"sync",
					["-S", "test-session", "--json"],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload.action).toBe("sync");
			expect(payload.snapshot.sessionId).toBe("test-session");
		} finally {
			rmSync(root, { recursive: true, force: true });
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
		} finally {
			rmSync(root, { recursive: true, force: true });
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
			rmSync(root, { recursive: true, force: true });
		}
	});
});
