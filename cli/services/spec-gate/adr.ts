import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { resolveAdmPaths } from "../adm";
import { atomicWriteText } from "../io/atomic";

type Frontmatter = Record<string, unknown>;

type AdrFrontmatter = {
	doc_type: "adr";
	id: string;
	title: string;
	status: string;
	created_at: string;
	updated_at: string;
	decision_type: string;
	supersedes: string;
	superseded_by: string;
	affected_specs: string[];
	affected_rules: string[];
	affected_skills: string[];
	affected_commands: string[];
	archive_reason: string;
};

function now(): string {
	return new Date().toISOString();
}

function slugify(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function titleCase(value: string): string {
	return value
		.trim()
		.replace(/[-_]+/g, " ")
		.split(/\s+/)
		.filter(Boolean)
		.map((word) => word[0]?.toUpperCase() + word.slice(1).toLowerCase())
		.join(" ");
}

function parseFrontmatter(content: string): Frontmatter | null {
	const match = /^---\n([\s\S]*?)\n---\n?/.exec(content);
	if (!match?.[1]) {
		return null;
	}
	try {
		const parsed = Bun.YAML.parse(match[1]);
		return parsed !== null &&
			typeof parsed === "object" &&
			!Array.isArray(parsed)
			? (parsed as Frontmatter)
			: null;
	} catch {
		return null;
	}
}

function readString(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function yamlScalar(value: string): string {
	return JSON.stringify(value);
}

function renderList(key: string, values: readonly string[]): string[] {
	if (values.length === 0) {
		return [`${key}: []`];
	}
	return [`${key}:`, ...values.map((value) => `- ${yamlScalar(value)}`)];
}

function renderFrontmatter(frontmatter: AdrFrontmatter): string {
	return [
		"---",
		`doc_type: ${frontmatter.doc_type}`,
		`id: ${yamlScalar(frontmatter.id)}`,
		`title: ${yamlScalar(frontmatter.title)}`,
		`status: ${frontmatter.status}`,
		`created_at: ${yamlScalar(frontmatter.created_at)}`,
		`updated_at: ${yamlScalar(frontmatter.updated_at)}`,
		`decision_type: ${yamlScalar(frontmatter.decision_type)}`,
		`supersedes: ${yamlScalar(frontmatter.supersedes)}`,
		`superseded_by: ${yamlScalar(frontmatter.superseded_by)}`,
		...renderList("affected_specs", frontmatter.affected_specs),
		...renderList("affected_rules", frontmatter.affected_rules),
		...renderList("affected_skills", frontmatter.affected_skills),
		...renderList("affected_commands", frontmatter.affected_commands),
		`archive_reason: ${yamlScalar(frontmatter.archive_reason)}`,
		"---",
	].join("\n");
}

function collectMarkdownFiles(rootDir: string): string[] {
	const out: string[] = [];
	const stack = [rootDir];
	while (stack.length > 0) {
		const dir = stack.pop();
		if (!dir || !existsSync(dir)) {
			continue;
		}
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const entryPath = join(dir, entry.name);
			if (entry.isSymbolicLink()) {
				continue;
			}
			if (entry.isDirectory()) {
				stack.push(entryPath);
				continue;
			}
			if (entry.isFile() && entry.name.endsWith(".md")) {
				out.push(entryPath);
			}
		}
	}
	return out;
}

function adrDir(root: string): string {
	return resolveAdmPaths(root).decisionsDir;
}

function adrPath(root: string, id: string): string | null {
	for (const filePath of collectMarkdownFiles(adrDir(root))) {
		const parsed = parseFrontmatter(readFileSync(filePath, "utf8"));
		if (!parsed) {
			continue;
		}
		if (readString(parsed.id) === id) {
			return filePath;
		}
		if (basename(filePath).startsWith(`${id}-`)) {
			return filePath;
		}
	}
	return null;
}

function nextAdrId(root: string): string {
	let max = 0;
	for (const filePath of collectMarkdownFiles(adrDir(root))) {
		const parsed = parseFrontmatter(readFileSync(filePath, "utf8"));
		const id = parsed ? readString(parsed.id) : "";
		const match =
			/^ADR-(\d{3})$/.exec(id) ?? /^ADR-(\d{3})-/.exec(basename(filePath));
		const number = match?.[1] ? Number(match[1]) : 0;
		if (number > max) {
			max = number;
		}
	}
	return `ADR-${String(max + 1).padStart(3, "0")}`;
}

function updateAdrFile(
	root: string,
	id: string,
	updater: (frontmatter: AdrFrontmatter) => AdrFrontmatter,
): string {
	const path = adrPath(root, id);
	if (!path) {
		throw new Error(`ADR not found: ${id}`);
	}
	const content = readFileSync(path, "utf8");
	const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/m.exec(content);
	if (!match?.[1]) {
		throw new Error(`Invalid ADR frontmatter: ${path}`);
	}
	const parsed = parseFrontmatter(content);
	if (!parsed) {
		throw new Error(`Invalid ADR frontmatter: ${path}`);
	}
	const current: AdrFrontmatter = {
		doc_type: "adr",
		id: readString(parsed.id) || id,
		title: readString(parsed.title) || id,
		status: readString(parsed.status) || "proposed",
		created_at: readString(parsed.created_at) || now(),
		updated_at: now(),
		decision_type: readString(parsed.decision_type) || "architecture",
		supersedes: readString(parsed.supersedes),
		superseded_by: readString(parsed.superseded_by),
		affected_specs: Array.isArray(parsed.affected_specs)
			? parsed.affected_specs.map((value) => readString(value)).filter(Boolean)
			: [],
		affected_rules: Array.isArray(parsed.affected_rules)
			? parsed.affected_rules.map((value) => readString(value)).filter(Boolean)
			: [],
		affected_skills: Array.isArray(parsed.affected_skills)
			? parsed.affected_skills.map((value) => readString(value)).filter(Boolean)
			: [],
		affected_commands: Array.isArray(parsed.affected_commands)
			? parsed.affected_commands
					.map((value) => readString(value))
					.filter(Boolean)
			: [],
		archive_reason: readString(parsed.archive_reason),
	};
	const next = updater(current);
	atomicWriteText(path, `${renderFrontmatter(next)}\n${match[2] ?? ""}`);
	return path;
}

export function createAdr(root: string, topic: string): string {
	const id = nextAdrId(root);
	const title = titleCase(topic) || topic.trim();
	const slug = slugify(topic) || "adr";
	const path = join(adrDir(root), `${id}-${slug}.md`);
	mkdirSync(dirname(path), { recursive: true });
	const frontmatter: AdrFrontmatter = {
		doc_type: "adr",
		id,
		title,
		status: "proposed",
		created_at: now(),
		updated_at: now(),
		decision_type: "architecture",
		supersedes: "",
		superseded_by: "",
		affected_specs: [],
		affected_rules: [],
		affected_skills: [],
		affected_commands: [],
		archive_reason: "",
	};
	atomicWriteText(
		path,
		[
			renderFrontmatter(frontmatter),
			"",
			`# ADR-${id.slice(4)}: ${title}`,
			"",
			"## Context",
			"",
			"-",
			"",
			"## Decision",
			"",
			"-",
			"",
			"## Consequences",
			"",
			"Positive:",
			"",
			"-",
			"",
			"Negative:",
			"",
			"-",
			"",
			"## Verification",
			"",
			"-",
			"",
			"## Status",
			"",
			"proposed",
		].join("\n"),
	);
	return path;
}

export function acceptAdr(root: string, id: string): string {
	return updateAdrFile(root, id, (frontmatter) => ({
		...frontmatter,
		status: "accepted",
		updated_at: now(),
	}));
}

export function supersedeAdr(
	root: string,
	oldId: string,
	newId: string,
): string {
	return updateAdrFile(root, oldId, (frontmatter) => ({
		...frontmatter,
		status: "superseded",
		superseded_by: newId,
		updated_at: now(),
	}));
}

export function abandonAdr(root: string, id: string, reason: string): string {
	return updateAdrFile(root, id, (frontmatter) => ({
		...frontmatter,
		status: "abandoned",
		archive_reason: reason.trim(),
		updated_at: now(),
	}));
}

export function archiveAdr(root: string, id: string, reason: string): string {
	return updateAdrFile(root, id, (frontmatter) => ({
		...frontmatter,
		status: "archived",
		archive_reason: reason.trim(),
		updated_at: now(),
	}));
}
