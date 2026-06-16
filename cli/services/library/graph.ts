import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveProjectPaths } from "../project/paths";
import { getTopic, listTopics } from "./crud";

export type LibraryGraphEdge = {
	from: string;
	to: string;
	type: "wikilink" | "topic-source" | "claim-source";
};

export type LibraryGraphSnapshot = {
	kind: "library_graph_v1";
	version: 1;
	generated_at: string;
	nodes: string[];
	edges: LibraryGraphEdge[];
};

const WIKILINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;

function uniqueSorted(values: string[]): string[] {
	return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function topicIndexPath(root: string, slug: string): string {
	return join(
		resolveProjectPaths(root).abs.libraryDir,
		"topics",
		slug,
		"INDEX.md",
	);
}

function wikilinksFrom(content: string): string[] {
	const links: string[] = [];
	for (const match of content.matchAll(WIKILINK_RE)) {
		const target = match[1]?.trim();
		if (target) {
			links.push(target.replace(/^\.afol\//, ""));
		}
	}
	return uniqueSorted(links);
}

export function buildLibraryGraph(
	root: string,
	opts: { slugs?: ReadonlySet<string> } = {},
): LibraryGraphSnapshot {
	const nodes: string[] = [];
	const edges: LibraryGraphEdge[] = [];

	for (const slug of listTopics(root)) {
		if (opts.slugs && !opts.slugs.has(slug)) {
			continue;
		}
		const topic = getTopic(root, slug);
		if (!topic) {
			continue;
		}
		const topicNode = `library:${topic.slug}`;
		nodes.push(topicNode);
		for (const source of topic.sources) {
			const sourceNode = `source:${topic.slug}#${source.id}`;
			nodes.push(sourceNode);
			edges.push({ from: topicNode, to: sourceNode, type: "topic-source" });
		}
		for (const claim of topic.claims) {
			const claimNode = `claim:${topic.slug}#${claim.id}`;
			nodes.push(claimNode);
			for (const sourceId of claim.source_ids) {
				const sourceNode = `source:${topic.slug}#${sourceId}`;
				nodes.push(sourceNode);
				edges.push({ from: claimNode, to: sourceNode, type: "claim-source" });
			}
		}
		const path = topicIndexPath(root, topic.slug);
		if (existsSync(path)) {
			for (const target of wikilinksFrom(readFileSync(path, "utf8"))) {
				const to = target.startsWith("library:")
					? target
					: `wikilink:${target}`;
				nodes.push(to);
				edges.push({ from: topicNode, to, type: "wikilink" });
			}
		}
	}

	return {
		kind: "library_graph_v1",
		version: 1,
		generated_at: new Date().toISOString(),
		nodes: uniqueSorted(nodes),
		edges: edges.sort(
			(a, b) =>
				a.from.localeCompare(b.from) ||
				a.to.localeCompare(b.to) ||
				a.type.localeCompare(b.type),
		),
	};
}
