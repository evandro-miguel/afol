import {
	addClaim,
	addSource,
	getTopic,
	invalidateClaim,
	listTopics,
	proposeTopic,
	rebuildLibraryIndex,
	searchLibrary,
} from "../services/library";
import type { LibraryClaim, LibrarySource } from "../services/library";

type CommandIo = {
	stdout: (message: string) => void;
	stderr: (message: string) => void;
};

const DEFAULT_IO: CommandIo = {
	stdout: (message) => console.log(message),
	stderr: (message) => console.error(message),
};

type LibraryAction = "list" | "topic" | "propose" | "add-source" | "add-claim" | "invalidate" | "search" | "rebuild-index";

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
	throw new Error(`Unknown library action: ${value}`);
}

function splitCsv(value: string): string[] {
	return value.split(",").map((item) => item.trim()).filter(Boolean);
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
	return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
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

export async function runLibraryCommand(
	action: string,
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	try {
		const libraryAction = normalizeAction(action);
		const parsed = parseArgs(args);
		const topicSlug = parsed.topic || parsed.positional[0] || "";

		if (libraryAction === "list") {
			const topics = listTopics(projectRoot);
			io.stdout(parsed.json ? JSON.stringify({ ok: true, topics }) : [`library topics: ${topics.length}`, ...topics].join("\n"));
			return 0;
		}

		if (libraryAction === "topic") {
			const slug = topicSlug.trim();
			if (!slug) {
				throw new Error("Missing --topic for library topic.");
			}
			const topic = getTopic(projectRoot, slug);
			if (!topic) {
				io.stderr(`Library topic not found: ${slug}`);
				return 1;
			}
			io.stdout(parsed.json ? JSON.stringify({ ok: true, topic }) : [
				`topic: ${topic.slug}`,
				`title: ${topic.title}`,
				`sources: ${topic.sources.length}`,
				`claims: ${topic.claims.length}`,
				`tags: ${topic.tags.join(", ") || "none"}`,
				...topic.sources.map(formatSource),
				...topic.claims.map(formatClaim),
			].join("\n"));
			return 0;
		}

		if (libraryAction === "search") {
			const query = parsed.query || parsed.positional.join(" ").trim();
			if (!query) {
				throw new Error("Missing --query for library search.");
			}
			const matches = searchLibrary(projectRoot, query);
			io.stdout(parsed.json ? JSON.stringify({ ok: true, matches }) : [`library matches: ${matches.length}`, ...matches.map((match) => `${match.topic.slug} ${match.topic.title}`),].join("\n"));
			return 0;
		}

		if (libraryAction === "rebuild-index") {
			const snapshot = rebuildLibraryIndex(projectRoot);
			io.stdout(parsed.json ? JSON.stringify({ ok: true, snapshot }) : `library rebuild-index: ok topics=${snapshot.topics.length}`);
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
				? [{ id: parsed.source[0] || sourceIdFrom(parsed.url, parsed.title), url: parsed.url, title: parsed.title, accessed_at: currentTime() }]
				: [];
			const topic = proposeTopic(projectRoot, slug, parsed.title, sources);
			io.stdout(parsed.json ? JSON.stringify({ ok: true, topic }) : `library propose: ${topic.slug}`);
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
			io.stdout(parsed.json ? JSON.stringify({ ok: true, topic, source }) : `library add-source: ${source.id}`);
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
			io.stdout(parsed.json ? JSON.stringify({ ok: true, topic, claim }) : `library add-claim: ${claim.id}`);
			return 0;
		}

		if (libraryAction === "invalidate") {
			const slug = topicSlug.trim();
			const claimId = parsed.claim || parsed.positional[1] || parsed.positional[0] || "";
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
			io.stdout(parsed.json ? JSON.stringify({ ok: true, topic }) : `library invalidate: ${claimId}`);
			return 0;
		}

		throw new Error(`Unknown library action: ${libraryAction}`);
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}
}
