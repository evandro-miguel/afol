import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	addEntry,
	invalidateEntry,
	promoteEntry,
	proposeEntry,
	recallEntries,
	rejectEntry,
	renderMemory,
	updateEntry,
	writeMemory,
} from "../services/memory/crud";
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
			const memory = readFileSync(
				join(root, ".afol", "memory", "memory.md"),
				"utf8",
			);
			expect(memory).toContain("> ### heading");
			expect(memory).not.toContain("\n### heading");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("proposes, promotes, rejects, renders, and recalls entries", () => {
		const root = createRoot();
		try {
			const proposed: MemoryEntry = {
				id: "MEM-002",
				title: "Proposal",
				body: "Proposed body.",
				status: "proposed",
				created_at: "2026-06-13T00:00:00.000Z",
				updated_at: "2026-06-13T00:00:00.000Z",
				tags: ["draft"],
			};
			writeMemory(root, {
				updated_at: proposed.updated_at,
				entries: [proposed],
			});

			proposeEntry(root, {
				id: "MEM-004",
				title: "Kept Proposal",
				body: "Kept body.",
				created_at: "2026-06-13T00:00:00.000Z",
				updated_at: "2026-06-13T00:00:00.000Z",
				tags: ["draft"],
			});

			proposeEntry(root, {
				id: "MEM-003",
				title: "New Proposal",
				body: "Fresh body.",
				created_at: "2026-06-13T00:00:00.000Z",
				updated_at: "2026-06-13T00:00:00.000Z",
				tags: ["one"],
			});
			promoteEntry(root, "MEM-002");
			rejectEntry(root, "MEM-003", "### heading\nreason");

			const rendered = renderMemory(root);
			expect(rendered).toContain("## active");
			expect(rendered).toContain("## proposed");
			expect(rendered).toContain("## rejected");
			expect(rendered).toContain("> ### heading");

			const recalled = recallEntries(root, "proposal");
			expect(recalled).toHaveLength(1);
			expect(recalled[0]).toMatchObject({ id: "MEM-002", status: "active" });

			invalidateEntry(root, "MEM-002", "bad");
			const excluded = recallEntries(root, "proposal");
			expect(excluded).toHaveLength(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
