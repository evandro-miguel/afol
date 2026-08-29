import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { resolveAdmPaths } from "../adm";

export type CanonicalSpecDocument = {
	path: string;
	relativePath: string;
	content: string;
	frontmatter: Record<string, unknown>;
	id: string;
	docType: string;
	status: string;
};

function stringValue(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function parseFrontmatter(content: string): Record<string, unknown> | null {
	const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
	if (!match?.[1]) return null;
	try {
		const parsed = Bun.YAML.parse(match[1].replaceAll("\r\n", "\n"));
		return parsed !== null &&
			typeof parsed === "object" &&
			!Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

export function listCanonicalSpecDocuments(
	root: string,
): CanonicalSpecDocument[] {
	const specsRoot = resolveAdmPaths(root).specsDir;
	if (!existsSync(specsRoot)) return [];
	const files: string[] = [];
	const pending = [specsRoot];
	while (pending.length > 0) {
		const directory = pending.pop();
		if (!directory) continue;
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			if (entry.isSymbolicLink()) continue;
			const entryPath = join(directory, entry.name);
			if (entry.isDirectory()) pending.push(entryPath);
			else if (entry.isFile() && entry.name.endsWith(".md"))
				files.push(entryPath);
		}
	}
	return files.sort().flatMap((path) => {
		const content = readFileSync(path, "utf8");
		const frontmatter = parseFrontmatter(content);
		if (!frontmatter) return [];
		return [
			{
				path,
				relativePath: relative(root, path).replaceAll("\\", "/"),
				content,
				frontmatter,
				id: stringValue(frontmatter.id),
				docType: stringValue(frontmatter.doc_type),
				status: stringValue(frontmatter.status).toLowerCase(),
			},
		];
	});
}

export function findCanonicalSpecDocuments(
	root: string,
	reference: string,
): CanonicalSpecDocument[] {
	const normalized = reference.replaceAll("\\", "/").replace(/^\.\//, "");
	const absolute = resolve(root, normalized);
	return listCanonicalSpecDocuments(root).filter(
		(document) =>
			document.id === reference ||
			basename(document.path) === `${reference}.md` ||
			document.relativePath === normalized ||
			document.path === absolute,
	);
}
