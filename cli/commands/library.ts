import {
	defaultOperationContext,
	type OperationContext,
	requiresApproval,
} from "../core/operation-context";
import { checkAreaHealth } from "../services/health/checker";
import { runDoctor } from "../services/health/doctor";
import {
	addClaim,
	addSource,
	getTopic,
	invalidateClaim,
	listTopics,
	proposeTopic,
	rebuildLibraryIndex,
	searchLibrary,
} from "../services/library/crud";
import { buildLibraryGraph } from "../services/library/graph";
import type { LibraryClaim, LibrarySource } from "../services/library/types";
import { type CommandIo, createJsonWriters, DEFAULT_IO } from "./io";

const jsonOutput = createJsonWriters("library");

type LibraryAction =
	| "list"
	| "topic"
	| "propose"
	| "add-source"
	| "add-claim"
	| "invalidate"
	| "search"
	| "rebuild-index"
	| "graph"
	| "health"
	| "doctor";

type ParsedArgs = {
	json: boolean;
	topic: string;
	url: string;
	title: string;
	claim: string;
	source: string[];
	reason: string;
	query: string;
	positional: string[];
};

function normalizeAction(value: string | undefined): LibraryAction {
	if (!value || value === "list" || value === "ls") {
		return "list";
	}
	if (value === "topic") {
		return "topic";
	}
	if (value === "propose") {
		return "propose";
	}
	if (value === "add-source") {
		return "add-source";
	}
	if (value === "add-claim") {
		return "add-claim";
	}
	if (value === "invalidate") {
		return "invalidate";
	}
	if (value === "search") {
		return "search";
	}
	if (value === "rebuild-index") {
		return "rebuild-index";
	}
	if (value === "graph") {
		return "graph";
	}
	if (value === "health") {
		return "health";
	}
	if (value === "doctor") {
		return "doctor";
	}
	throw new Error(`Unknown library action: ${value}`);
}

function splitCsv(value: string): string[] {
	return value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

function parseArgs(args: string[]): ParsedArgs {
	const parsed: ParsedArgs = {
		json: false,
		topic: "",
		url: "",
		title: "",
		claim: "",
		source: [],
		reason: "",
		query: "",
		positional: [],
	};
	for (let index = 0; index < args.length; index += 1) {
		const value = args[index];
		if (typeof value !== "string") {
			continue;
		}
		if (value === "--json" || value === "-j") {
			parsed.json = true;
			continue;
		}
		if (value === "--topic") {
			const next = args[index + 1];
			if (!next) {
				throw new Error("Missing value for --topic.");
			}
			parsed.topic = next;
			index += 1;
			continue;
		}
		if (value === "--url") {
			const next = args[index + 1];
			if (!next) {
				throw new Error("Missing value for --url.");
			}
			parsed.url = next;
			index += 1;
			continue;
		}
		if (value === "--title") {
			const next = args[index + 1];
			if (!next) {
				throw new Error("Missing value for --title.");
			}
			parsed.title = next;
			index += 1;
			continue;
		}
		if (value === "--claim") {
			const next = args[index + 1];
			if (!next) {
				throw new Error("Missing value for --claim.");
			}
			parsed.claim = next;
			index += 1;
			continue;
		}
		if (value === "--source") {
			const next = args[index + 1];
			if (!next) {
				throw new Error("Missing value for --source.");
			}
			parsed.source.push(...splitCsv(next));
			index += 1;
			continue;
		}
		if (value === "--reason") {
			const next = args[index + 1];
			if (!next) {
				throw new Error("Missing value for --reason.");
			}
			parsed.reason = next;
			index += 1;
			continue;
		}
		if (value === "--query") {
			const next = args[index + 1];
			if (!next) {
				throw new Error("Missing value for --query.");
			}
			parsed.query = next;
			index += 1;
			continue;
		}
		if (value.startsWith("-")) {
			throw new Error(`Unknown library argument: ${value}`);
		}
		parsed.positional.push(value);
	}
	return parsed;
}

function currentTime(): string {
	return new Date().toISOString();
}

function slugify(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function sourceIdFrom(url: string, title: string): string {
	const base = slugify(title) || slugify(url);
	return base || `source-${Date.now()}`;
}

function claimIdFrom(text: string): string {
	const base = slugify(text.slice(0, 48));
	return base || `claim-${Date.now()}`;
}

function formatSource(source: LibrarySource): string {
	return `${source.id} ${source.title} ${source.url} (${source.accessed_at})`;
}

function formatClaim(claim: LibraryClaim): string {
	return `${claim.id} [${claim.status}] ${claim.text}`;
}

function isMutation(action: LibraryAction): boolean {
	return [
		"propose",
		"add-source",
		"add-claim",
		"invalidate",
		"rebuild-index",
	].includes(action);
}

function assertMutationAllowed(
	action: LibraryAction,
	ctx: OperationContext,
): void {
	if (isMutation(action) && requiresApproval(ctx)) {
		throw new Error(`library ${action} requires local interactive approval`);
	}
}

export async function runLibraryCommand(
	action: string,
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
	ctx: OperationContext = defaultOperationContext(),
): Promise<number> {
	const wantsJson = args.some((value) => value === "--json" || value === "-j");
	try {
		const libraryAction = normalizeAction(action);
		const parsed = parseArgs(args);
		assertMutationAllowed(libraryAction, ctx);
		const topicSlug = parsed.topic || parsed.positional[0] || "";

		if (libraryAction === "list") {
			const topics = listTopics(projectRoot);
			if (parsed.json) {
				jsonOutput.ok(io, libraryAction, { topics }, ["topics"]);
			} else {
				io.stdout([`library topics: ${topics.length}`, ...topics].join("\n"));
			}
			return 0;
		}

		if (libraryAction === "topic") {
			const slug = topicSlug.trim();
			if (!slug) {
				throw new Error("Missing --topic for library topic.");
			}
			const topic = getTopic(projectRoot, slug);
			if (!topic) {
				if (parsed.json) {
					jsonOutput.err(
						io,
						libraryAction,
						"library.topic.not_found",
						`Library topic not found: ${slug}`,
						1,
					);
				} else {
					io.stderr(`Library topic not found: ${slug}`);
				}
				return 1;
			}
			if (parsed.json) {
				jsonOutput.ok(io, libraryAction, { topic }, ["topic"]);
			} else {
				io.stdout(
					[
						`topic: ${topic.slug}`,
						`title: ${topic.title}`,
						`sources: ${topic.sources.length}`,
						`claims: ${topic.claims.length}`,
						`tags: ${topic.tags.join(", ") || "none"}`,
						...topic.sources.map(formatSource),
						...topic.claims.map(formatClaim),
					].join("\n"),
				);
			}
			return 0;
		}

		if (libraryAction === "search") {
			const query = parsed.query || parsed.positional.join(" ").trim();
			if (!query) {
				throw new Error("Missing --query for library search.");
			}
			const matches = searchLibrary(projectRoot, query);
			if (parsed.json) {
				jsonOutput.ok(io, libraryAction, { matches }, ["matches"]);
			} else {
				io.stdout(
					[
						`library matches: ${matches.length}`,
						...matches.map(
							(match) => `${match.topic.slug} ${match.topic.title}`,
						),
					].join("\n"),
				);
			}
			return 0;
		}

		if (libraryAction === "rebuild-index") {
			const snapshot = rebuildLibraryIndex(projectRoot);
			if (parsed.json) {
				jsonOutput.ok(io, libraryAction, { snapshot }, ["snapshot"]);
			} else {
				io.stdout(`library rebuild-index: ok topics=${snapshot.topics.length}`);
			}
			return 0;
		}

		if (libraryAction === "graph") {
			const graph = buildLibraryGraph(projectRoot);
			if (parsed.json) {
				jsonOutput.ok(io, libraryAction, { graph }, ["graph"]);
			} else {
				io.stdout(
					[
						`library graph: nodes=${graph.nodes.length} edges=${graph.edges.length}`,
						...graph.edges.map(
							(edge) => `${edge.from} -> ${edge.to} [${edge.type}]`,
						),
					].join("\n"),
				);
			}
			return 0;
		}

		if (libraryAction === "health") {
			const findings = checkAreaHealth(projectRoot, "library", true);
			if (parsed.json) {
				jsonOutput.ok(io, libraryAction, { findings }, ["findings"]);
			} else {
				io.stdout(
					[
						`library health: ${findings.some((finding) => finding.severity === "fail") ? "issues found" : "ok"}`,
						...findings.map(
							(finding) =>
								`${finding.severity.toUpperCase()} ${finding.message}${finding.hint ? ` hint=${finding.hint}` : ""}`,
						),
					].join("\n"),
				);
			}
			return findings.some((finding) => finding.severity === "fail") ? 1 : 0;
		}

		if (libraryAction === "doctor") {
			const remediation = runDoctor(projectRoot).remediation.filter(
				(step) => step.area === "library",
			);
			if (parsed.json) {
				jsonOutput.ok(io, libraryAction, { remediation }, ["remediation"]);
			} else {
				io.stdout(
					[
						`library doctor: ${remediation.length} remediation steps`,
						...remediation.map(
							(step) => `${step.step}. ${step.severity} ${step.action}`,
						),
					].join("\n"),
				);
			}
			return 0;
		}

		if (libraryAction === "propose") {
			const slug = topicSlug.trim();
			if (!slug) {
				throw new Error("Missing --topic for library propose.");
			}
			if (!parsed.title.trim()) {
				throw new Error("Missing --title for library propose.");
			}
			const sources: LibrarySource[] = parsed.url.trim()
				? [
						{
							id: parsed.source[0] || sourceIdFrom(parsed.url, parsed.title),
							url: parsed.url,
							title: parsed.title,
							accessed_at: currentTime(),
						},
					]
				: [];
			const topic = proposeTopic(projectRoot, slug, parsed.title, sources);
			if (parsed.json) {
				jsonOutput.ok(io, libraryAction, { topic }, ["topic"]);
			} else {
				io.stdout(`library propose: ${topic.slug}`);
			}
			return 0;
		}

		if (libraryAction === "add-source") {
			const slug = topicSlug.trim();
			if (!slug) {
				throw new Error("Missing --topic for library add-source.");
			}
			if (!parsed.url.trim()) {
				throw new Error("Missing --url for library add-source.");
			}
			const sourceTitle = parsed.title.trim() || parsed.url.trim();
			const source: LibrarySource = {
				id: parsed.source[0] || sourceIdFrom(parsed.url, sourceTitle),
				url: parsed.url.trim(),
				title: sourceTitle,
				accessed_at: currentTime(),
			};
			const topic = addSource(projectRoot, slug, source);
			if (parsed.json) {
				jsonOutput.ok(io, libraryAction, { topic, source }, [
					"topic",
					"source",
				]);
			} else {
				io.stdout(`library add-source: ${source.id}`);
			}
			return 0;
		}

		if (libraryAction === "add-claim") {
			const slug = topicSlug.trim();
			if (!slug) {
				throw new Error("Missing --topic for library add-claim.");
			}
			if (!parsed.claim.trim()) {
				throw new Error("Missing --claim for library add-claim.");
			}
			if (parsed.source.length === 0) {
				throw new Error("Missing --source for library add-claim.");
			}
			const claim: LibraryClaim = {
				id: claimIdFrom(parsed.claim),
				text: parsed.claim.trim(),
				source_ids: parsed.source,
				status: "current",
				created_at: currentTime(),
			};
			const topic = addClaim(projectRoot, slug, claim);
			if (parsed.json) {
				jsonOutput.ok(io, libraryAction, { topic, claim }, ["topic", "claim"]);
			} else {
				io.stdout(`library add-claim: ${claim.id}`);
			}
			return 0;
		}

		if (libraryAction === "invalidate") {
			const slug = topicSlug.trim();
			const claimId =
				parsed.claim || parsed.positional[1] || parsed.positional[0] || "";
			if (!slug) {
				throw new Error("Missing --topic for library invalidate.");
			}
			if (!claimId) {
				throw new Error("Missing claim id for library invalidate.");
			}
			if (!parsed.reason.trim()) {
				throw new Error("Missing --reason for library invalidate.");
			}
			const topic = invalidateClaim(projectRoot, slug, claimId, parsed.reason);
			if (parsed.json) {
				jsonOutput.ok(io, libraryAction, { topic }, ["topic"]);
			} else {
				io.stdout(`library invalidate: ${claimId}`);
			}
			return 0;
		}

		throw new Error(`Unknown library action: ${libraryAction}`);
	} catch (error) {
		if (wantsJson && error instanceof Error && error.message) {
			jsonOutput.err(io, action, "library.command.error", error.message, 2);
			return 2;
		}
		io.stderr((error as Error).message);
		return 2;
	}
}
