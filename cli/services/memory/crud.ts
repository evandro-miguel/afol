import { existsSync, readFileSync } from "node:fs";
import { atomicWriteText } from "../io/atomic";
import { resolveProjectPaths } from "../project/paths";
import type { MemoryEntry, MemoryFile } from "./types";

const STATUS_ORDER: MemoryEntry["status"][] = [
	"active",
	"proposed",
	"rejected",
	"archived",
	"invalidated",
];
const MEMORY_ENTRY_ID_RE = /^[A-Za-z0-9._-]+$/;

type MemoryFrontmatter = {
	doc_type?: unknown;
	updated_at?: unknown;
	entries?: unknown;
};

function memoryPath(root: string): string {
	return resolveProjectPaths(root).abs.memoryFile;
}

function assertValidId(id: string): void {
	if (!MEMORY_ENTRY_ID_RE.test(id)) {
		throw new Error(`Invalid memory entry identifier: ${id}`);
	}
}

function isStatus(value: string): value is MemoryEntry["status"] {
	return STATUS_ORDER.includes(value as MemoryEntry["status"]);
}

function parseFrontmatter(
	content: string,
): { frontmatter: MemoryFrontmatter; body: string } | null {
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/m.exec(content);
	if (!match?.[1]) {
		return null;
	}
	let parsed: unknown;
	try {
		parsed = Bun.YAML.parse(match[1]);
	} catch {
		return null;
	}
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
		return null;
	}
	return {
		frontmatter: parsed as MemoryFrontmatter,
		body: match[2] ?? "",
	};
}

function parseEntryMetadata(lines: string[]): {
	metadata: Partial<Pick<MemoryEntry, "created_at" | "updated_at" | "tags">>;
	bodyLines: string[];
} {
	if (lines[0] !== "<!--") {
		return { metadata: {}, bodyLines: lines };
	}
	const endIndex = lines.indexOf("-->");
	if (endIndex === -1) {
		return { metadata: {}, bodyLines: lines };
	}
	const metadata: Partial<
		Pick<MemoryEntry, "created_at" | "updated_at" | "tags">
	> = {};
	for (const line of lines.slice(1, endIndex)) {
		const match = /^([a-z_]+):\s*(.*)$/.exec(line.trim());
		if (!match?.[1]) {
			continue;
		}
		const key = match[1];
		const value = match[2] ?? "";
		if (key === "created_at" && value.trim()) {
			metadata.created_at = value.trim();
			continue;
		}
		if (key === "updated_at" && value.trim()) {
			metadata.updated_at = value.trim();
			continue;
		}
		if (key === "tags") {
			metadata.tags = value
				.split(",")
				.map((item) => item.trim())
				.filter(Boolean);
		}
	}
	return { metadata, bodyLines: lines.slice(endIndex + 1) };
}

function parseSectionHeading(value: string): MemoryEntry["status"] | null {
	const heading = value.trim().toLowerCase();
	return isStatus(heading) ? heading : null;
}

function parseEntryHeading(
	value: string,
): { id: string; title: string } | null {
	const match = /^###\s+([^:]+):\s*(.+)$/.exec(value.trim());
	if (!match?.[1] || !match[2]) {
		return null;
	}
	const id = match[1].trim();
	const title = match[2].trim();
	return id && title ? { id, title } : null;
}

function normalizeBody(lines: string[]): string {
	return lines.join("\n").replace(/^\n+|\n+$/g, "");
}

function parseBody(body: string): MemoryEntry[] | null {
	const lines = body.split(/\r?\n/);
	const entries: MemoryEntry[] = [];
	let currentStatus: MemoryEntry["status"] | null = null;
	let hasValidSection = false;

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		if (line.trim() === "# Project Memory") {
			continue;
		}
		if (line.startsWith("## ")) {
			currentStatus = parseSectionHeading(line.slice(3));
			if (!currentStatus) {
				continue;
			}
			hasValidSection = true;
			continue;
		}
		if (!line.startsWith("### ")) {
			continue;
		}
		const block: string[] = [];
		let cursor = index + 1;
		for (; cursor < lines.length; cursor += 1) {
			const nextLine = lines[cursor] ?? "";
			if (nextLine.startsWith("## ") || nextLine.startsWith("### ")) {
				break;
			}
			block.push(nextLine);
		}
		if (!currentStatus) {
			index = cursor - 1;
			continue;
		}
		const heading = parseEntryHeading(line);
		if (!heading) {
			index = cursor - 1;
			continue;
		}
		const { metadata, bodyLines } = parseEntryMetadata(block);
		const now = new Date().toISOString();
		entries.push(
			hydrateEntryMetadata(
				{
					id: heading.id,
					title: heading.title,
					body: normalizeBody(bodyLines),
					status: currentStatus,
					created_at: now,
					updated_at: now,
					tags: [],
				},
				metadata,
				now,
			),
		);
		index = cursor - 1;
	}
	return hasValidSection ? entries : null;
}

function hydrateEntryMetadata(
	entry: MemoryEntry,
	metadata: Partial<Pick<MemoryEntry, "created_at" | "updated_at" | "tags">>,
	fallbackUpdatedAt: string,
): MemoryEntry {
	return {
		...entry,
		created_at: metadata.created_at ?? entry.created_at ?? fallbackUpdatedAt,
		updated_at: metadata.updated_at ?? entry.updated_at ?? fallbackUpdatedAt,
		tags: metadata.tags ?? entry.tags ?? [],
	};
}

function parseMemoryContent(content: string): MemoryFile | null {
	const parsed = parseFrontmatter(content);
	if (!parsed) {
		return null;
	}
	if (parsed.frontmatter.doc_type !== "project_memory") {
		return null;
	}
	if (
		typeof parsed.frontmatter.updated_at !== "string" ||
		!parsed.frontmatter.updated_at.trim()
	) {
		return null;
	}
	const updatedAt = parsed.frontmatter.updated_at.trim();
	const entries = parseBody(parsed.body);
	if (entries === null) {
		return null;
	}
	return {
		updated_at: updatedAt,
		entries: entries.map((entry) => hydrateEntryMetadata(entry, {}, updatedAt)),
	};
}

function formatTags(tags: readonly string[]): string {
	return tags.length > 0 ? tags.join(", ") : "";
}

function sanitizeReason(reason: string): string {
	return reason
		.split(/\r?\n/)
		.map((line) =>
			line.startsWith("#") || line === "---" ? `> ${line}` : line,
		)
		.join("\n")
		.trim();
}

function formatMemoryEntry(entry: MemoryEntry): string {
	return [
		`### ${entry.id}: ${entry.title}`,
		"<!--",
		`created_at: ${entry.created_at}`,
		`updated_at: ${entry.updated_at}`,
		`tags: ${formatTags(entry.tags)}`,
		"-->",
		entry.body,
	]
		.filter((line, index) => index < 5 || line.length > 0)
		.join("\n");
}

function groupEntries(entries: readonly MemoryEntry[]): MemoryEntry[][] {
	return STATUS_ORDER.map((status) =>
		entries.filter((entry) => entry.status === status),
	);
}

function memoryText(memory: MemoryFile): string {
	const sections: string[] = [];
	for (const [index, entries] of groupEntries(memory.entries).entries()) {
		if (entries.length === 0) {
			continue;
		}
		const status = STATUS_ORDER[index];
		sections.push(`## ${status}`);
		for (const entry of entries) {
			sections.push(formatMemoryEntry(entry));
			sections.push("");
		}
	}
	return [
		"---",
		"doc_type: project_memory",
		`updated_at: ${memory.updated_at}`,
		`entries: ${memory.entries.length}`,
		"---",
		"",
		"# Project Memory",
		"",
		...sections,
	].join("\n");
}

export function renderMemory(root: string): string {
	const memory = readMemory(root);
	return memory
		? memoryText(memory)
		: memoryText({ entries: [], updated_at: new Date().toISOString() });
}

export function readMemory(root: string): MemoryFile | null {
	const path = memoryPath(root);
	if (!existsSync(path)) {
		return null;
	}
	const content = readFileSync(path, "utf8");
	return parseMemoryContent(content);
}

export function writeMemory(root: string, memory: MemoryFile): void {
	const path = memoryPath(root);
	atomicWriteText(path, memoryText(memory));
}

function findEntriesById(memory: MemoryFile, id: string): MemoryEntry[] {
	const needle = id.trim().toLowerCase();
	return memory.entries.filter((entry) => entry.id.toLowerCase() === needle);
}

function getUniqueEntry(memory: MemoryFile, id: string): MemoryEntry | null {
	const matches = findEntriesById(memory, id);
	if (matches.length > 1) {
		throw new Error(`Duplicate memory entry id: ${id}`);
	}
	return matches[0] ?? null;
}

export function getEntry(root: string, id: string): MemoryEntry | null {
	const memory = readMemory(root);
	if (!memory) {
		return null;
	}
	return getUniqueEntry(memory, id);
}

export function addEntry(root: string, entry: MemoryEntry): void {
	assertValidId(entry.id);
	const memory = readMemory(root) ?? {
		entries: [],
		updated_at: entry.updated_at,
	};
	if (findEntriesById(memory, entry.id).length > 0) {
		throw new Error(`Memory entry already exists: ${entry.id}`);
	}
	writeMemory(root, {
		updated_at: entry.updated_at,
		entries: [...memory.entries, entry],
	});
}

export type MemoryPatch = Partial<
	Pick<MemoryEntry, "title" | "body" | "status" | "tags">
>;

export function updateEntry(
	root: string,
	id: string,
	patch: MemoryPatch,
): void {
	assertValidId(id);
	const memory = readMemory(root);
	if (!memory) {
		return;
	}
	const current = getUniqueEntry(memory, id);
	if (!current) {
		return;
	}
	const needle = id.trim().toLowerCase();
	const now = new Date().toISOString();
	const entries = memory.entries.map((entry) => {
		if (entry.id.toLowerCase() !== needle) {
			return entry;
		}
		return {
			...current,
			...(typeof patch.title === "string" ? { title: patch.title } : {}),
			...(typeof patch.body === "string" ? { body: patch.body } : {}),
			...(patch.status ? { status: patch.status } : {}),
			...(patch.tags ? { tags: [...patch.tags] } : {}),
			updated_at: now,
		};
	});
	writeMemory(root, { updated_at: now, entries });
}

export function archiveEntry(root: string, id: string): void {
	updateEntry(root, id, { status: "archived" });
}

export function proposeEntry(
	root: string,
	entry: Pick<
		MemoryEntry,
		"id" | "title" | "body" | "tags" | "created_at" | "updated_at"
	>,
): void {
	addEntry(root, { ...entry, status: "proposed" });
}

export function promoteEntry(root: string, id: string): void {
	assertValidId(id);
	const current = getEntry(root, id);
	if (!current) {
		return;
	}
	if (current.status !== "proposed" && current.status !== "rejected") {
		throw new Error(
			`Memory entry ${current.id} cannot be promoted from status ${current.status}.`,
		);
	}
	updateEntry(root, id, { status: "active" });
}

export function rejectEntry(root: string, id: string, reason: string): void {
	assertValidId(id);
	const current = getEntry(root, id);
	if (!current) {
		return;
	}
	const safeReason = sanitizeReason(reason);
	updateEntry(root, id, {
		status: "rejected",
		body: current.body
			? `${current.body}\n\nReason: ${safeReason}`
			: `Reason: ${safeReason}`,
	});
}

export function invalidateEntry(
	root: string,
	id: string,
	reason: string,
): void {
	const current = getEntry(root, id);
	if (!current) {
		return;
	}
	const safeReason = sanitizeReason(reason);
	updateEntry(root, id, {
		status: "invalidated",
		body: current.body
			? `${current.body}\n\nReason: ${safeReason}`
			: `Reason: ${safeReason}`,
	});
}

export function searchEntries(root: string, query: string): MemoryEntry[] {
	const memory = readMemory(root);
	if (!memory) {
		return [];
	}
	const needle = query.trim().toLowerCase();
	if (!needle) {
		return [];
	}
	return memory.entries.filter((entry) => {
		const haystack = [
			entry.id,
			entry.title,
			entry.body,
			entry.status,
			...entry.tags,
		]
			.join(" ")
			.toLowerCase();
		return haystack.includes(needle);
	});
}

export type MemoryRecallEntry = Pick<
	MemoryEntry,
	"id" | "title" | "status" | "tags"
>;

export type RecallOptions = {
	limit?: number;
	statuses?: readonly MemoryEntry["status"][];
};

export function recallEntries(
	root: string,
	query: string,
	opts: RecallOptions = {},
): MemoryRecallEntry[] {
	const memory = readMemory(root);
	if (!memory) {
		return [];
	}
	const needle = query.trim().toLowerCase();
	if (!needle) {
		return [];
	}
	const statuses = opts.statuses ?? ["active"];
	const limit = Math.max(0, Math.min(opts.limit ?? 5, 5));
	return memory.entries
		.filter((entry) => statuses.includes(entry.status))
		.filter((entry) => {
			const haystack = [
				entry.id,
				entry.title,
				entry.body,
				entry.status,
				...entry.tags,
			]
				.join(" ")
				.toLowerCase();
			return haystack.includes(needle);
		})
		.slice(0, limit)
		.map((entry) => ({
			id: entry.id,
			title: entry.title,
			status: entry.status,
			tags: [...entry.tags],
		}));
}
