import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteText } from "../io/atomic";
import { resolveProjectPaths } from "../project/paths";
import type { LibraryClaim, LibrarySource, LibraryTopic } from "./types";

type LibraryFrontmatter = {
	doc_type?: unknown;
	slug?: unknown;
	title?: unknown;
	updated_at?: unknown;
	tags?: unknown;
	sources?: unknown;
	claims?: unknown;
};

type LibraryIndexEntry = {
	slug: string;
	title: string;
	source_count: number;
	claim_count: number;
	updated_at: string;
	tags: string[];
};

type LibraryIndexSnapshot = {
	kind: "library_index_v1";
	version: 1;
	generated_at: string;
	topics: LibraryIndexEntry[];
};

export type LibrarySearchResult = {
	topic: LibraryTopic;
	matching_claims: LibraryClaim[];
};

function libraryDir(root: string): string {
	return resolveProjectPaths(root).abs.libraryDir;
}

function topicsDir(root: string): string {
	return join(libraryDir(root), "topics");
}

function topicDir(root: string, slug: string): string {
	return join(topicsDir(root), slug);
}

function topicIndexPath(root: string, slug: string): string {
	return join(topicDir(root, slug), "INDEX.md");
}

function libraryIndexPath(root: string): string {
	return join(libraryDir(root), "INDEX.json");
}

function now(): string {
	return new Date().toISOString();
}

function trimOrNull(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringArray(value: unknown): string[] | null {
	if (!Array.isArray(value)) {
		return null;
	}
	const result: string[] = [];
	for (const item of value) {
		if (typeof item !== "string" || !item.trim()) {
			return null;
		}
		result.push(item.trim());
	}
	return result;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function isSlug(value: string): boolean {
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function normalizeSlug(value: string): string {
	const slug = value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	if (!slug || !isSlug(slug)) {
		throw new Error(`Invalid library topic slug: ${value}`);
	}
	return slug;
}

function assertSource(source: LibrarySource): LibrarySource {
	if (
		!trimOrNull(source.id) ||
		!trimOrNull(source.url) ||
		!trimOrNull(source.title) ||
		!trimOrNull(source.accessed_at)
	) {
		throw new Error("Every source requires id, url, title, and accessed_at.");
	}
	return {
		id: source.id.trim(),
		url: source.url.trim(),
		title: source.title.trim(),
		accessed_at: source.accessed_at.trim(),
	};
}

function assertClaim(claim: LibraryClaim): LibraryClaim {
	if (
		!trimOrNull(claim.id) ||
		!trimOrNull(claim.text) ||
		!trimOrNull(claim.created_at)
	) {
		throw new Error("Every claim requires id, text, and created_at.");
	}
	const sourceIds = claim.source_ids
		.map((sourceId) => sourceId.trim())
		.filter(Boolean);
	if (sourceIds.length === 0) {
		throw new Error("Every claim requires at least one source.");
	}
	return {
		id: claim.id.trim(),
		text: claim.text.trim(),
		source_ids: sourceIds,
		status: claim.status,
		...(claim.invalidated_reason
			? { invalidated_reason: claim.invalidated_reason.trim() }
			: {}),
		created_at: claim.created_at.trim(),
	};
}

function parseFrontmatter(content: string): LibraryFrontmatter | null {
	const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(content);
	if (!match?.[1]) {
		return null;
	}
	let parsed: unknown;
	try {
		parsed = Bun.YAML.parse(match[1]);
	} catch {
		return null;
	}
	return asRecord(parsed) as LibraryFrontmatter | null;
}

function parseTopicContent(content: string): LibraryTopic | null {
	const frontmatter = parseFrontmatter(content);
	if (frontmatter?.doc_type !== "library_topic") {
		return null;
	}
	const slug = trimOrNull(frontmatter.slug);
	const title = trimOrNull(frontmatter.title);
	const updatedAt = trimOrNull(frontmatter.updated_at);
	const tags = asStringArray(frontmatter.tags) ?? [];
	const sourcesRaw = Array.isArray(frontmatter.sources)
		? frontmatter.sources
		: [];
	const claimsRaw = Array.isArray(frontmatter.claims) ? frontmatter.claims : [];
	if (!slug || !title || !updatedAt || !isSlug(slug)) {
		return null;
	}
	const sources: LibrarySource[] = [];
	for (const rawSource of sourcesRaw) {
		const record = asRecord(rawSource);
		if (!record) {
			return null;
		}
		const source = assertSource({
			id: String(record.id ?? ""),
			url: String(record.url ?? ""),
			title: String(record.title ?? ""),
			accessed_at: String(record.accessed_at ?? ""),
		});
		sources.push(source);
	}
	const claims: LibraryClaim[] = [];
	for (const rawClaim of claimsRaw) {
		const record = asRecord(rawClaim);
		if (!record) {
			return null;
		}
		const sourceIds = asStringArray(record.source_ids);
		const status =
			record.status === "invalidated"
				? "invalidated"
				: record.status === "current"
					? "current"
					: null;
		const claim = assertClaim({
			id: String(record.id ?? ""),
			text: String(record.text ?? ""),
			source_ids: sourceIds ?? [],
			status: status ?? "current",
			...(typeof record.invalidated_reason === "string" &&
			record.invalidated_reason.trim()
				? { invalidated_reason: record.invalidated_reason.trim() }
				: {}),
			created_at: String(record.created_at ?? ""),
		});
		claims.push(claim);
	}
	return { slug, title, sources, claims, tags, updated_at: updatedAt };
}

function renderString(value: string): string {
	return JSON.stringify(value);
}

function renderTags(tags: readonly string[]): string[] {
	if (tags.length === 0) {
		return ["tags: []"];
	}
	return ["tags:", ...tags.map((tag) => `  - ${renderString(tag)}`)];
}

function renderSources(sources: readonly LibrarySource[]): string[] {
	if (sources.length === 0) {
		return ["sources: []"];
	}
	const lines: string[] = ["sources:"];
	for (const source of sources) {
		lines.push(`  - id: ${renderString(source.id)}`);
		lines.push(`    url: ${renderString(source.url)}`);
		lines.push(`    title: ${renderString(source.title)}`);
		lines.push(`    accessed_at: ${renderString(source.accessed_at)}`);
	}
	return lines;
}

function renderClaims(claims: readonly LibraryClaim[]): string[] {
	if (claims.length === 0) {
		return ["claims: []"];
	}
	const lines: string[] = ["claims:"];
	for (const claim of claims) {
		lines.push(`  - id: ${renderString(claim.id)}`);
		lines.push(`    text: ${renderString(claim.text)}`);
		lines.push("    source_ids:");
		for (const sourceId of claim.source_ids) {
			lines.push(`      - ${renderString(sourceId)}`);
		}
		lines.push(`    status: ${claim.status}`);
		if (claim.invalidated_reason) {
			lines.push(
				`    invalidated_reason: ${renderString(claim.invalidated_reason)}`,
			);
		}
		lines.push(`    created_at: ${renderString(claim.created_at)}`);
	}
	return lines;
}

function topicFrontmatter(topic: LibraryTopic): string {
	return [
		"---",
		"doc_type: library_topic",
		`slug: ${renderString(topic.slug)}`,
		`title: ${renderString(topic.title)}`,
		`updated_at: ${renderString(topic.updated_at)}`,
		...renderTags(topic.tags),
		...renderSources(topic.sources),
		...renderClaims(topic.claims),
		"---",
	].join("\n");
}

function topicBody(topic: LibraryTopic): string {
	return [
		`# ${topic.title}`,
		"",
		"## Sources",
		...(topic.sources.length > 0
			? topic.sources.map(
					(source) =>
						`- ${source.id}: ${source.title} (${source.url}) [${source.accessed_at}]`,
				)
			: ["- none"]),
		"",
		"## Claims",
		...(topic.claims.length > 0
			? topic.claims.map(
					(claim) =>
						`- ${claim.id}: ${claim.text} [${claim.status}]${claim.invalidated_reason ? ` (${claim.invalidated_reason})` : ""}`,
				)
			: ["- none"]),
		"",
		"## Tags",
		...(topic.tags.length > 0
			? topic.tags.map((tag) => `- ${tag}`)
			: ["- none"]),
		"",
		"> Read-only curated research. Do not use this to replace specs.",
	].join("\n");
}

function writeTopic(root: string, topic: LibraryTopic): void {
	const path = topicIndexPath(root, topic.slug);
	atomicWriteText(path, `${topicFrontmatter(topic)}\n\n${topicBody(topic)}\n`);
}

function cloneTopic(topic: LibraryTopic): LibraryTopic {
	return {
		slug: topic.slug,
		title: topic.title,
		sources: topic.sources.map((source) => ({ ...source })),
		claims: topic.claims.map((claim) => ({
			...claim,
			source_ids: [...claim.source_ids],
		})),
		tags: [...topic.tags],
		updated_at: topic.updated_at,
	};
}

function requireTopic(root: string, slug: string): LibraryTopic {
	const topic = getTopic(root, slug);
	if (!topic) {
		throw new Error(`Library topic not found: ${slug}`);
	}
	return topic;
}

function ensureSourceIdsExist(
	topic: LibraryTopic,
	sourceIds: readonly string[],
): void {
	const available = new Set(topic.sources.map((source) => source.id));
	for (const sourceId of sourceIds) {
		if (!available.has(sourceId)) {
			throw new Error(`Unknown source id for ${topic.slug}: ${sourceId}`);
		}
	}
}

function upsertById<T extends { id: string }>(
	items: readonly T[],
	item: T,
): T[] {
	const next = items.map((entry) => (entry.id === item.id ? item : entry));
	return next.some((entry) => entry.id === item.id) ? next : [...next, item];
}

export function listTopics(root: string): string[] {
	const dir = topicsDir(root);
	if (!existsSync(dir)) {
		return [];
	}
	return readdirSync(dir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.filter(isSlug)
		.sort((a, b) => a.localeCompare(b));
}

export function getTopic(root: string, slug: string): LibraryTopic | null {
	const normalized = normalizeSlug(slug);
	const path = topicIndexPath(root, normalized);
	if (!existsSync(path)) {
		return null;
	}
	return parseTopicContent(readFileSync(path, "utf8"));
}

export function proposeTopic(
	root: string,
	slug: string,
	title: string,
	sources: readonly LibrarySource[],
): LibraryTopic {
	const normalized = normalizeSlug(slug);
	const trimmedTitle = trimOrNull(title);
	if (!trimmedTitle) {
		throw new Error("Missing library topic title.");
	}
	if (existsSync(topicDir(root, normalized))) {
		throw new Error(`Library topic already exists: ${normalized}`);
	}
	const validatedSources = sources.map(assertSource);
	const topic: LibraryTopic = {
		slug: normalized,
		title: trimmedTitle,
		sources: validatedSources,
		claims: [],
		tags: [],
		updated_at: now(),
	};
	mkdirSync(topicDir(root, normalized), { recursive: true });
	writeTopic(root, topic);
	return topic;
}

export function addSource(
	root: string,
	slug: string,
	source: LibrarySource,
): LibraryTopic {
	const topic = cloneTopic(requireTopic(root, slug));
	const validated = assertSource(source);
	topic.sources = upsertById(topic.sources, validated);
	topic.updated_at = now();
	writeTopic(root, topic);
	return topic;
}

export function addClaim(
	root: string,
	slug: string,
	claim: LibraryClaim,
): LibraryTopic {
	const topic = cloneTopic(requireTopic(root, slug));
	const validated = assertClaim(claim);
	ensureSourceIdsExist(topic, validated.source_ids);
	topic.claims = upsertById(topic.claims, validated);
	topic.updated_at = now();
	writeTopic(root, topic);
	return topic;
}

export function invalidateClaim(
	root: string,
	slug: string,
	claimId: string,
	reason: string,
): LibraryTopic {
	const topic = cloneTopic(requireTopic(root, slug));
	const needle = claimId.trim();
	const invalidatedReason = reason.trim();
	if (!needle) {
		throw new Error("Missing claim id.");
	}
	if (!invalidatedReason) {
		throw new Error("Missing invalidation reason.");
	}
	let found = false;
	topic.claims = topic.claims.map((claim) => {
		if (claim.id !== needle) {
			return claim;
		}
		found = true;
		return {
			...claim,
			status: "invalidated",
			invalidated_reason: invalidatedReason,
		};
	});
	if (!found) {
		throw new Error(`Claim not found: ${needle}`);
	}
	topic.updated_at = now();
	writeTopic(root, topic);
	return topic;
}

export function searchLibrary(
	root: string,
	query: string,
): LibrarySearchResult[] {
	const needle = query.trim().toLowerCase();
	if (!needle) {
		return [];
	}
	return listTopics(root)
		.map((slug) => getTopic(root, slug))
		.filter((topic): topic is LibraryTopic => topic !== null)
		.map((topic) => {
			const matchingClaims = topic.claims.filter((claim) => {
				if (claim.status !== "current") {
					return false;
				}
				const haystack = [
					topic.slug,
					topic.title,
					...topic.tags,
					...topic.sources.flatMap((source) => [
						source.id,
						source.url,
						source.title,
						source.accessed_at,
					]),
					claim.id,
					claim.text,
					...claim.source_ids,
				]
					.join(" ")
					.toLowerCase();
				return haystack.includes(needle);
			});
			return matchingClaims.length > 0
				? { topic, matching_claims: matchingClaims }
				: null;
		})
		.filter((entry): entry is LibrarySearchResult => entry !== null);
}

export function rebuildLibraryIndex(root: string): LibraryIndexSnapshot {
	const topics = listTopics(root)
		.map((slug) => getTopic(root, slug))
		.filter((topic): topic is LibraryTopic => topic !== null)
		.map((topic) => ({
			slug: topic.slug,
			title: topic.title,
			source_count: topic.sources.length,
			claim_count: topic.claims.length,
			updated_at: topic.updated_at,
			tags: [...topic.tags],
		}))
		.sort((a, b) => a.slug.localeCompare(b.slug));
	const snapshot: LibraryIndexSnapshot = {
		kind: "library_index_v1",
		version: 1,
		generated_at: now(),
		topics,
	};
	mkdirSync(libraryDir(root), { recursive: true });
	atomicWriteText(
		libraryIndexPath(root),
		`${JSON.stringify(snapshot, null, 2)}\n`,
	);
	return snapshot;
}
