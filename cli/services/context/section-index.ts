import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { atomicWriteText } from "../io/atomic";
import { resolveProjectPaths } from "../project/paths";
import type { SectionEntry, SectionIndex } from "./types";

type Frontmatter = Record<string, unknown>;

type Heading = {
	title: string;
	level: number;
	line_start: number;
};

type DocMeta = {
	ref: string;
	path: string;
};

const INDEX_FILE = "sections.json";

function now(): string {
	return new Date().toISOString();
}

function indexPath(root: string): string {
	return join(resolveProjectPaths(root).abs.dataIndexDir, INDEX_FILE);
}

function readJsonFile<T>(path: string): T | null {
	try {
		return JSON.parse(readFileSync(path, "utf8")) as T;
	} catch {
		return null;
	}
}

function frontmatter(content: string): Frontmatter {
	const match = /^---\n([\s\S]*?)\n---\n?/.exec(content);
	if (!match?.[1]) {
		return {};
	}
	try {
		const parsed = Bun.YAML.parse(match[1]);
		return parsed !== null &&
			typeof parsed === "object" &&
			!Array.isArray(parsed)
			? (parsed as Frontmatter)
			: {};
	} catch {
		return {};
	}
}

function normalizeRefPart(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function docMetaForPath(root: string, filePath: string): DocMeta {
	const content = readFileSync(filePath, "utf8");
	const meta = frontmatter(content);
	const relPath = relative(root, filePath).replace(/\\/g, "/");
	if (relPath.includes("/SPECS/")) {
		const feature =
			typeof meta.roadmap_feature === "string"
				? meta.roadmap_feature.trim()
				: "";
		const id = typeof meta.id === "string" ? meta.id.trim() : filePath;
		return { ref: `spec:${normalizeRefPart(feature || id)}`, path: relPath };
	}
	const id = typeof meta.id === "string" ? meta.id.trim() : filePath;
	return { ref: `adr:${normalizeRefPart(id)}`, path: relPath };
}

function slugify(title: string): string {
	return title
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function collectDocs(root: string): string[] {
	const docsRoot = join(root, "docs", "arc");
	const docs: string[] = [];
	for (const dir of [join(docsRoot, "SPECS"), join(docsRoot, "DECISIONS")]) {
		if (!existsSync(dir)) {
			continue;
		}
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (entry.isFile() && entry.name.endsWith(".md")) {
				docs.push(join(dir, entry.name));
			}
		}
	}
	return docs.sort((a, b) =>
		relative(root, a).localeCompare(relative(root, b)),
	);
}

function parseHeadings(content: string): Heading[] {
	const headings: Heading[] = [];
	const lines = content.split(/\r?\n/);
	let insideCodeBlock = false;
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		if (line.trim().startsWith("```")) {
			insideCodeBlock = !insideCodeBlock;
			continue;
		}
		if (insideCodeBlock) {
			continue;
		}
		const match = /^(##|###)\s+(.*?)\s*$/.exec(line.trim());
		if (!match?.[1] || !match[2]) {
			continue;
		}
		headings.push({
			title: match[2].replace(/#+\s*$/, "").trim(),
			level: match[1].length,
			line_start: index + 1,
		});
	}
	return headings;
}

function sectionsForDoc(root: string, filePath: string): SectionEntry[] {
	const content = readFileSync(filePath, "utf8");
	const meta = docMetaForPath(root, filePath);
	const headings = parseHeadings(content);
	const lines = content.split(/\r?\n/);

	return headings.map((heading, index) => {
		let lineEnd = lines.length;
		for (let next = index + 1; next < headings.length; next += 1) {
			const nextHeading = headings[next];
			if (!nextHeading) {
				continue;
			}
			if (nextHeading.level <= heading.level) {
				lineEnd = Math.max(heading.line_start, nextHeading.line_start - 1);
				break;
			}
		}
		return {
			ref: `${meta.ref}#${slugify(heading.title) || `line-${heading.line_start}`}`,
			title: heading.title,
			level: heading.level,
			line_start: heading.line_start,
			line_end: lineEnd,
			source_path: meta.path,
		};
	});
}

function isValidIndex(value: unknown): value is SectionIndex {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}
	const snapshot = value as Partial<SectionIndex>;
	return (
		snapshot.kind === "sections_index_v1" &&
		snapshot.version === 1 &&
		typeof snapshot.generated_at === "string" &&
		Array.isArray(snapshot.sections) &&
		snapshot.sections.every(
			(entry) =>
				typeof entry?.ref === "string" &&
				typeof entry.title === "string" &&
				typeof entry.level === "number" &&
				typeof entry.line_start === "number" &&
				typeof entry.line_end === "number" &&
				typeof entry.source_path === "string",
		)
	);
}

export function buildSectionIndexSnapshot(root: string): SectionIndex {
	const sections = collectDocs(root)
		.flatMap((filePath) => sectionsForDoc(root, filePath))
		.sort(
			(a, b) =>
				a.source_path.localeCompare(b.source_path) ||
				a.line_start - b.line_start,
		);
	return {
		kind: "sections_index_v1",
		version: 1,
		generated_at: now(),
		sections,
	};
}

function writeIndex(root: string, snapshot: SectionIndex): SectionIndex {
	mkdirSync(resolveProjectPaths(root).abs.dataIndexDir, { recursive: true });
	atomicWriteText(indexPath(root), `${JSON.stringify(snapshot)}\n`);
	return snapshot;
}

export function rebuildSectionIndex(root: string): SectionIndex {
	return writeIndex(root, buildSectionIndexSnapshot(root));
}

export function getSectionIndex(root: string): SectionIndex | null {
	const path = indexPath(root);
	if (!existsSync(path)) {
		return null;
	}
	const parsed = readJsonFile<SectionIndex>(path);
	return isValidIndex(parsed) ? parsed : null;
}

export function resolveSection(root: string, ref: string): SectionEntry | null {
	const needle = ref.trim().toLowerCase();
	if (!needle) {
		return null;
	}
	const index = getSectionIndex(root) ?? buildSectionIndexSnapshot(root);
	return (
		index.sections.find((entry) => entry.ref.toLowerCase() === needle) ??
		index.sections.find((entry) =>
			entry.ref.toLowerCase().startsWith(`${needle}#`),
		) ??
		index.sections.find((entry) =>
			entry.ref.toLowerCase().startsWith(needle),
		) ??
		null
	);
}
