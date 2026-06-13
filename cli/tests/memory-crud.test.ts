import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addEntry, invalidateEntry, updateEntry, writeMemory } from "../services/memory/crud";
import type { MemoryEntry } from "../services/memory/types";

function createRoot(): string {
	return mkdtempSync(join(tmpdir(), "memory-crud-"));
}

describe("memory crud", () => {
	test("rejects invalid ids and sanitizes invalidation reasons", () => {
		const root = createRoot();
		try {
			const entry: MemoryEntry = {
				id: "MEM-001",
				title: "Alpha",
				body: "Body",
				status: "active",
				created_at: "2026-06-13T00:00:00.000Z",
				updated_at: "2026-06-13T00:00:00.000Z",
				tags: [],
			};
			writeMemory(root, { updated_at: entry.updated_at, entries: [entry] });

			expect(() => addEntry(root, { ...entry, id: "../bad" })).toThrow(
				"Invalid memory entry identifier",
			);
			expect(() => updateEntry(root, "../bad", { title: "Beta" })).toThrow(
				"Invalid memory entry identifier",
			);

			invalidateEntry(root, "MEM-001", "### heading\nkept");
			const memory = readFileSync(join(root, ".afol", "memory", "memory.md"), "utf8");
			expect(memory).toContain("> ### heading");
			expect(memory).not.toContain("\n### heading");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
