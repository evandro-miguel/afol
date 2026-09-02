import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMemoryCommand } from "../commands/memory";
import { agentOperationContext } from "../core/operation-context";

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
			"entries: 4",
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
			"## proposed",
			"",
			"### MEM-003: Gamma",
			"<!--",
			"created_at: 2026-06-13T00:00:00Z",
			"updated_at: 2026-06-13T00:00:00Z",
			"tags: draft",
			"-->",
			"Gamma body.",
			"",
			"## rejected",
			"",
			"### MEM-004: Delta",
			"<!--",
			"created_at: 2026-06-13T00:00:00Z",
			"updated_at: 2026-06-13T00:00:00Z",
			"tags: nope",
			"-->",
			"Delta body.",
			"",
		].join("\n"),
		"utf8",
	);
	return root;
}

describe("memory command", () => {
	test("empty list points agents at the memory path", async () => {
		const root = mkdtempSync(join(tmpdir(), "memory-command-empty-"));
		try {
			const list = capture();
			expect(await runMemoryCommand("list", [], root, list.io)).toBe(0);
			expect(list.stdout.join("\n")).toContain("memory entries: 0");
			expect(list.stdout.join("\n")).toContain(".afol/memory/memory.md");
			expect(list.stdout.join("\n")).toContain("afol memory add");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("lists, shows, searches, and updates entries", async () => {
		const root = createRoot();
		try {
			const listJson = capture();
			expect(
				await runMemoryCommand("list", ["--json"], root, listJson.io),
			).toBe(0);
			const listPayload = JSON.parse(listJson.stdout[0] ?? "{}") as Record<
				string,
				unknown
			>;
			const listData = listPayload.data as { entries: unknown[] };
			expect(listPayload.schema).toBe("afol.result/v1");
			expect(listPayload.ok).toBe(true);
			expect(listPayload.exit_code).toBe(0);
			expect(listPayload.entries).toEqual(listData.entries);

			const list = capture();
			expect(await runMemoryCommand("list", [], root, list.io)).toBe(0);
			expect(list.stdout.join("\n")).toContain("memory entries: 4");

			const show = capture();
			expect(
				await runMemoryCommand("show", ["--id", "MEM-001"], root, show.io),
			).toBe(0);
			expect(show.stdout.join("\n")).toContain("MEM-001 active Alpha");

			const search = capture();
			expect(
				await runMemoryCommand("search", ["--query", "beta"], root, search.io),
			).toBe(0);
			expect(search.stdout.join("\n")).toContain("memory matches: 1");

			const renderJson = capture();
			expect(
				await runMemoryCommand("render", ["--json"], root, renderJson.io),
			).toBe(0);
			const renderPayload = JSON.parse(renderJson.stdout[0] ?? "{}") as Record<
				string,
				unknown
			>;
			const renderData = renderPayload.data as { markdown: string };
			expect(renderPayload.schema).toBe("afol.result/v1");
			expect(renderPayload.exit_code).toBe(0);
			expect(renderPayload.markdown).toBe(renderData.markdown);

			const invalid = capture();
			expect(await runMemoryCommand("show", ["--json"], root, invalid.io)).toBe(
				2,
			);
			const invalidPayload = JSON.parse(invalid.stdout[0] ?? "{}") as Record<
				string,
				unknown
			>;
			expect(invalidPayload.schema).toBe("afol.result/v1");
			expect(invalidPayload.ok).toBe(false);
			expect(invalidPayload.exit_code).toBe(2);
			expect((invalidPayload.error as { code: string }).code).toBe(
				"memory.command.error",
			);

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

	test("adds, archives, proposes, promotes, rejects, renders, and recalls entries", async () => {
		const root = createRoot();
		try {
			const add = capture();
			expect(
				await runMemoryCommand(
					"add",
					[
						"--id",
						"MEM-006",
						"--title",
						"Gamma",
						"--body",
						"Gamma body.",
						"--tags",
						"one,two",
					],
					root,
					add.io,
				),
			).toBe(0);
			expect(add.stdout.join("\n")).toContain("memory add: MEM-006");

			const archive = capture();
			expect(
				await runMemoryCommand(
					"archive",
					["--id", "MEM-001"],
					root,
					archive.io,
				),
			).toBe(0);
			expect(archive.stdout.join("\n")).toContain("memory archive: MEM-001");

			const propose = capture();
			expect(
				await runMemoryCommand(
					"propose",
					[
						"--id",
						"MEM-005",
						"--title",
						"Epsilon",
						"--body",
						"Epsilon body.",
						"--tags",
						"x,y",
					],
					root,
					propose.io,
				),
			).toBe(0);
			expect(propose.stdout.join("\n")).toContain("memory propose: MEM-005");

			const promote = capture();
			expect(
				await runMemoryCommand(
					"promote",
					["--id", "MEM-003"],
					root,
					promote.io,
				),
			).toBe(0);
			expect(promote.stdout.join("\n")).toContain("memory promote: MEM-003");

			const reject = capture();
			expect(
				await runMemoryCommand(
					"reject",
					["--id", "MEM-005", "--reason", "### bad\nnope"],
					root,
					reject.io,
				),
			).toBe(0);
			expect(reject.stdout.join("\n")).toContain("memory reject: MEM-005");

			const render = capture();
			expect(await runMemoryCommand("render", [], root, render.io)).toBe(0);
			expect(render.stdout.join("\n")).toContain("## rejected");

			const recall = capture();
			expect(
				await runMemoryCommand("recall", ["--query", "body"], root, recall.io),
			).toBe(0);
			expect(recall.stdout.join("\n")).toContain("memory recall: 2");
			expect(recall.stdout.join("\n")).not.toContain("archived");
			expect(recall.stdout.join("\n")).not.toContain("rejected");

			const json = capture();
			expect(await runMemoryCommand("render", ["--json"], root, json.io)).toBe(
				0,
			);
			expect(json.stdout[0]).toContain('"markdown"');

			const invalid = capture();
			expect(
				await runMemoryCommand("promote", ["--id", "../bad"], root, invalid.io),
			).toBe(2);
			expect(invalid.stderr.join("\n")).toContain(
				"Invalid memory entry identifier",
			);

			const missing = capture();
			expect(
				await runMemoryCommand("reject", ["--id", "MEM-001"], root, missing.io),
			).toBe(2);
			expect(missing.stderr.join("\n")).toContain(
				"Missing --id or --reason for memory reject.",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("memory mutations are denied for restricted agent callers", async () => {
		const root = createRoot();
		try {
			const out = capture();
			expect(
				await runMemoryCommand(
					"add",
					["--id", "MEM-999", "--title", "Nope", "--body", "Nope"],
					root,
					out.io,
					agentOperationContext(),
				),
			).toBe(2);
			expect(out.stderr.join("\n")).toContain(
				"requires local interactive approval",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("memory commands fail on duplicate ids and no-op promote statuses", async () => {
		const root = createRoot();
		try {
			writeFileSync(
				join(root, ".afol", "memory", "memory.md"),
				[
					"---",
					"doc_type: project_memory",
					"updated_at: 2026-06-13T00:00:00Z",
					"entries: 3",
					"---",
					"",
					"# Project Memory",
					"",
					"## active",
					"",
					"### MEM-ACTIVE: Active",
					"Active body.",
					"",
					"## proposed",
					"",
					"### MEM-DUP: Duplicate one",
					"First body.",
					"",
					"### MEM-DUP: Duplicate two",
					"Second body.",
					"",
				].join("\n"),
				"utf8",
			);

			const show = capture();
			expect(
				await runMemoryCommand("show", ["--id", "MEM-DUP"], root, show.io),
			).toBe(2);
			expect(show.stderr.join("\n")).toContain(
				"Duplicate memory entry id: MEM-DUP",
			);

			const add = capture();
			expect(
				await runMemoryCommand(
					"add",
					["--id", "MEM-ACTIVE", "--title", "Again", "--body", "Again"],
					root,
					add.io,
				),
			).toBe(2);
			expect(add.stderr.join("\n")).toContain(
				"Memory entry already exists: MEM-ACTIVE",
			);

			const promote = capture();
			expect(
				await runMemoryCommand(
					"promote",
					["--id", "MEM-ACTIVE"],
					root,
					promote.io,
				),
			).toBe(2);
			expect(promote.stderr.join("\n")).toContain(
				"Memory entry MEM-ACTIVE cannot be promoted from status active.",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
