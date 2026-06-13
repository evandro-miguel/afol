import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMemoryCommand } from "../commands/memory";

function capture() {
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

function createRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "memory-command-"));
	mkdirSync(join(root, ".afol", "memory"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "memory", "memory.md"),
		[
			"---",
			"doc_type: project_memory",
			"updated_at: 2026-06-13T00:00:00Z",
			"entries: 2",
			"---",
			"",
			"# Project Memory",
			"",
			"## active",
			"",
			"### MEM-001: Alpha",
			"Alpha body.",
			"",
			"## archived",
			"",
			"### MEM-002: Beta",
			"Beta body.",
			"",
		].join("\n"),
		"utf8",
	);
	return root;
}

describe("memory command", () => {
	test("lists, shows, searches, and updates entries", async () => {
		const root = createRoot();
		try {
			const list = capture();
			expect(await runMemoryCommand("list", [], root, list.io)).toBe(0);
			expect(list.stdout.join("\n")).toContain("memory entries: 2");

			const show = capture();
			expect(await runMemoryCommand("show", ["--id", "MEM-001"], root, show.io)).toBe(0);
			expect(show.stdout.join("\n")).toContain("MEM-001 active Alpha");

			const search = capture();
			expect(await runMemoryCommand("search", ["--query", "beta"], root, search.io)).toBe(0);
			expect(search.stdout.join("\n")).toContain("memory matches: 1");

			const update = capture();
			expect(
				await runMemoryCommand(
					"update",
					["--id", "MEM-001", "--title", "Alpha 2", "--body", "Updated body."],
					root,
					update.io,
				),
			).toBe(0);
			expect(update.stdout.join("\n")).toContain("memory update: MEM-001");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("adds and archives entries", async () => {
		const root = createRoot();
		try {
			const add = capture();
			expect(
				await runMemoryCommand(
					"add",
					["--id", "MEM-003", "--title", "Gamma", "--body", "Gamma body.", "--tags", "one,two"],
					root,
					add.io,
				),
			).toBe(0);
			expect(add.stdout.join("\n")).toContain("memory add: MEM-003");

			const archive = capture();
			expect(await runMemoryCommand("archive", ["--id", "MEM-001"], root, archive.io)).toBe(0);
			expect(archive.stdout.join("\n")).toContain("memory archive: MEM-001");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
