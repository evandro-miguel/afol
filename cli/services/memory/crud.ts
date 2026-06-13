import { existsSync, readFileSync } from "node:fs";
import { atomicWriteText } from "../io/atomic";
import { resolveProjectPaths } from "../project/paths";
import type { MemoryEntry, MemoryFile } from "./types";

const STATUS_ORDER: MemoryEntry["status"][] = ["active", "archived", "invalidated"];
const MEMORY_ENTRY_ID_RE = /^[A-Za-z0-9._-]+$/;

type MemoryFrontmatter = {
	doc_type?: unknown;
	updated_at?: unknown;
	entries?: unknown;
};

function memoryPath(root: string): string {
	return resolveProjectPaths(root).abs.memoryFile;
}

function isStatus(value: string): value is MemoryEntry["status"] {
	return STATUS_ORDER.includes(value as MemoryEntry["status"]);
}

function parseFrontmatter(content: string): { frontmatter: MemoryFrontmatter; body: string } | null {
	const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/m.exec(content);
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
	const metadata: Partial<Pick<MemoryEntry, "created_at" | "updated_at" | "tags">> = {};
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

function parseEntryHeading(value: string): { id: string; title: string } | null {
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
	if (typeof parsed.frontmatter.updated_at !== "string" || !parsed.frontmatter.updated_at.trim()) {
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

function formatMemoryEntry(entry: MemoryEntry): string {
	return [
		`### ${entry.id}: ${entry.title}`,
		"<!--",
		`created_at: ${entry.created_at}`,
		`updated_at: ${entry.updated_at}`,
		`tags: ${formatTags(entry.tags)}`,
		"-->",
		entry.body,
	].filter((line, index) => index < 5 || line.length > 0).join("\n");
}

function groupEntries(entries: readonly MemoryEntry[]): MemoryEntry[][] {
	return STATUS_ORDER.map((status) => entries.filter((entry) => entry.status === status));
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

export function getEntry(root: string, id: string): MemoryEntry | null {
	const memory = readMemory(root);
	if (!memory) {
		return null;
	}
	const needle = id.trim().toLowerCase();
	return memory.entries.find((entry) => entry.id.toLowerCase() === needle) ?? null;
}

export function addEntry(root: string, entry: MemoryEntry): void {
	if (!MEMORY_ENTRY_ID_RE.test(entry.id)) {
		throw new Error(`Invalid memory entry identifier: ${entry.id}`);
	}
	const memory = readMemory(root) ?? { entries: [], updated_at: entry.updated_at };
	writeMemory(root, {
		updated_at: entry.updated_at,
		entries: [...memory.entries, entry],
	});
}

export type MemoryPatch = Partial<Pick<MemoryEntry, "title" | "body" | "status" | "tags">>;

export function updateEntry(root: string, id: string, patch: MemoryPatch): void {
	if (!MEMORY_ENTRY_ID_RE.test(id)) {
		throw new Error(`Invalid memory entry identifier: ${id}`);
	}
	const memory = readMemory(root);
	if (!memory) {
		return;
	}
	const needle = id.trim().toLowerCase();
	const now = new Date().toISOString();
	let found = false;
	const entries = memory.entries.map((entry) => {
		if (entry.id.toLowerCase() !== needle) {
			return entry;
		}
		found = true;
		return {
			...entry,
			...(typeof patch.title === "string" ? { title: patch.title } : {}),
			...(typeof patch.body === "string" ? { body: patch.body } : {}),
			...(patch.status ? { status: patch.status } : {}),
			...(patch.tags ? { tags: [...patch.tags] } : {}),
			updated_at: now,
		};
	});
	if (!found) {
		return;
	}
	writeMemory(root, { updated_at: now, entries });
}

export function archiveEntry(root: string, id: string): void {
	updateEntry(root, id, { status: "archived" });
}

export function invalidateEntry(root: string, id: string, reason: string): void {
	const current = getEntry(root, id);
	if (!current) {
		return;
	}
	updateEntry(root, id, {
		status: "invalidated",
		body: current.body
			? `${current.body}\n\nReason: ${reason.replace(/^###\s/gm, "> ### ")}`
			: `Reason: ${reason.replace(/^###\s/gm, "> ### ")}`,
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
		const haystack = [entry.id, entry.title, entry.body, entry.status, ...entry.tags].join(" ").toLowerCase();
		return haystack.includes(needle);
	});
}
