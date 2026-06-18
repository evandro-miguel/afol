import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	addEntry,
	getEntry,
	invalidateEntry,
	promoteEntry,
	proposeEntry,
	readMemory,
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

	test("guards duplicate ids and rejects promote when status would not change", () => {
		const root = createRoot();
		try {
			writeMemory(root, {
				updated_at: "2026-06-13T00:00:00.000Z",
				entries: [
					{
						id: "MEM-001",
						title: "Alpha",
						body: "Alpha body.",
						status: "active",
						created_at: "2026-06-13T00:00:00.000Z",
						updated_at: "2026-06-13T00:00:00.000Z",
						tags: [],
					},
					{
						id: "MEM-DUP",
						title: "Duplicate one",
						body: "One.",
						status: "proposed",
						created_at: "2026-06-13T00:00:00.000Z",
						updated_at: "2026-06-13T00:00:00.000Z",
						tags: [],
					},
					{
						id: "MEM-DUP",
						title: "Duplicate two",
						body: "Two.",
						status: "proposed",
						created_at: "2026-06-13T00:00:00.000Z",
						updated_at: "2026-06-13T00:00:00.000Z",
						tags: [],
					},
				],
			});

			expect(() =>
				addEntry(root, {
					id: "MEM-001",
					title: "Again",
					body: "Again.",
					status: "active",
					created_at: "2026-06-13T00:00:00.000Z",
					updated_at: "2026-06-13T00:00:00.000Z",
					tags: [],
				}),
			).toThrow("Memory entry already exists: MEM-001");
			expect(() =>
				proposeEntry(root, {
					id: "MEM-001",
					title: "Again",
					body: "Again.",
					created_at: "2026-06-13T00:00:00.000Z",
					updated_at: "2026-06-13T00:00:00.000Z",
					tags: [],
				}),
			).toThrow("Memory entry already exists: MEM-001");
			expect(() => getEntry(root, "MEM-DUP")).toThrow(
				"Duplicate memory entry id: MEM-DUP",
			);
			expect(() => updateEntry(root, "MEM-DUP", { title: "Nope" })).toThrow(
				"Duplicate memory entry id: MEM-DUP",
			);
			expect(() => promoteEntry(root, "MEM-001")).toThrow(
				"Memory entry MEM-001 cannot be promoted from status active.",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("exportable template ships valid initial memory", () => {
		const templateRoot = join(process.cwd(), "src", "project-template");
		expect(readMemory(templateRoot)).toEqual({
			updated_at: "2026-06-18T00:00:00.000Z",
			entries: [],
		});
		expect(renderMemory(templateRoot)).toContain("doc_type: project_memory");
	});
});
