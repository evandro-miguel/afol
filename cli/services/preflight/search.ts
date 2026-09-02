import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { loadUxRegistry } from "../ux/journeys";

export type PreflightSpecResult = {
	id: string;
	theme: string;
	status: string;
	score: number;
};

export type PreflightLessonResult = {
	path: string;
	title: string;
	score: number;
};

export type PreflightSystemResult = {
	path: string;
	kind: "code" | "spec" | "rule";
	score: number;
};

export type PreflightRuleResult = {
	path: string;
	title: string;
};

export type PreflightUxJourneyResult = {
	id: string;
	path: string;
	title: string;
	status: string;
	commands: string[];
	score: number;
};

export type PreflightReport = {
	query: string;
	specs: PreflightSpecResult[];
	lessons: PreflightLessonResult[];
	similar_systems: PreflightSystemResult[];
	rules: PreflightRuleResult[];
	ux_journeys: PreflightUxJourneyResult[];
	gaps: string[];
	summary: string;
	recommendations: string[];
	/** True when the query matched one or more lesson entries, suggesting this may be a recurring problem. Read-only advisory flag — never causes command failure. */
	recurrence_detected: boolean;
};

const STOP_WORDS = new Set([
	"a",
	"add",
	"an",
	"and",
	"are",
	"as",
	"at",
	"before",
	"bug",
	"build",
	"by",
	"change",
	"command",
	"create",
	"fix",
	"for",
	"from",
	"in",
	"into",
	"is",
	"it",
	"make",
	"new",
	"of",
	"on",
	"or",
	"plan",
	"query",
	"test",
	"tests",
	"the",
	"to",
	"with",
	"work",
	"workflow",
]);

const MAX_SPECS = 8;
const MAX_LESSONS = 5;
const MAX_SIMILAR = 8;
const MAX_RULES = 5;
const MAX_UX_JOURNEYS = 5;

function tokenize(value: string): string[] {
	const tokens = new Set<string>();
	for (const token of value.toLowerCase().split(/\W+/)) {
		for (const variant of expandToken(token)) {
			tokens.add(variant);
		}
	}
	return [...tokens];
}

function expandToken(token: string): string[] {
	if (!token || token.length < 2 || STOP_WORDS.has(token)) {
		return [];
	}
	const variants = new Set([token]);
	if (token.length > 4 && token.endsWith("s")) {
		variants.add(token.slice(0, -1));
	}
	if (token.length > 5 && token.endsWith("ed")) {
		variants.add(token.slice(0, -2));
	}
	if (token.length > 6 && token.endsWith("ing")) {
		variants.add(token.slice(0, -3));
	}
	if (token.length > 5 && token.endsWith("ies")) {
		variants.add(`${token.slice(0, -3)}y`);
	}
	return [...variants].filter(
		(variant) => variant.length >= 2 && !STOP_WORDS.has(variant),
	);
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsToken(text: string, token: string): boolean {
	if (!token) {
		return false;
	}
	return new RegExp(`\\b${escapeRegex(token)}\\b`, "i").test(text);
}

function countHits(text: string, tokens: readonly string[]): number {
	let score = 0;
	for (const token of tokens) {
		if (containsToken(text, token)) {
			score += 1;
		}
	}
	return score;
}

function readText(path: string): string {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return "";
	}
}

function splitFrontmatter(content: string): {
	frontmatter: string;
	body: string;
} {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!match?.[1]) {
		return { frontmatter: "", body: content };
	}
	return { frontmatter: match[1], body: match[2] ?? "" };
}

function parseFrontmatter(frontmatter: string): Record<string, string> {
	const values: Record<string, string> = {};
	for (const line of frontmatter.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) {
			continue;
		}
		const separator = trimmed.indexOf(":");
		if (separator < 0) {
			continue;
		}
		const key = trimmed.slice(0, separator).trim();
		let value = trimmed.slice(separator + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		values[key] = value;
	}
	return values;
}

function extractHeading(content: string): string {
	for (const line of content.split(/\r?\n/)) {
		const match = line.match(/^#\s+(.+?)\s*$/);
		if (match?.[1]) {
			return match[1].trim();
		}
	}
	return "";
}

function walkFiles(root: string, start: string, files: string[]): void {
	if (!existsSync(start)) {
		return;
	}
	for (const entry of readdirSync(start, { withFileTypes: true })) {
		const absolute = join(start, entry.name);
		if (entry.isDirectory()) {
			walkFiles(root, absolute, files);
			continue;
		}
		if (entry.isFile()) {
			files.push(relative(root, absolute).split("\\").join("/"));
		}
	}
}

function collectFiles(root: string, relativeDir: string): string[] {
	const files: string[] = [];
	walkFiles(root, join(root, relativeDir), files);
	return files;
}

function scoreText(text: string, tokens: readonly string[]): number {
	return countHits(text.toLowerCase(), tokens);
}

function scoreParts(
	parts: readonly string[],
	tokens: readonly string[],
): number {
	let score = 0;
	for (const part of parts) {
		score += scoreText(part, tokens);
	}
	return score;
}

function searchSpecs(
	root: string,
	tokens: readonly string[],
): PreflightSpecResult[] {
	const results: PreflightSpecResult[] = [];
	for (const relativePath of collectFiles(root, ".afol/adm/specs")) {
		if (!relativePath.endsWith(".md") || relativePath.endsWith("INDEX.md")) {
			continue;
		}
		const content = readText(join(root, relativePath));
		if (!content) {
			continue;
		}
		const { frontmatter, body } = splitFrontmatter(content);
		const parsed = parseFrontmatter(frontmatter);
		const id = parsed.id ?? basename(relativePath, ".md");
		const theme = parsed.theme ?? "";
		const status = parsed.status ?? "unknown";
		const heading = extractHeading(body);
		const score = scoreParts([id, theme, heading, body], tokens);
		if (score <= 0) {
			continue;
		}
		results.push({ id, theme, status, score });
	}
	return results
		.sort(
			(left, right) =>
				right.score - left.score || left.id.localeCompare(right.id),
		)
		.slice(0, MAX_SPECS);
}

function searchLessons(
	root: string,
	tokens: readonly string[],
): PreflightLessonResult[] {
	const results: PreflightLessonResult[] = [];
	for (const relativePath of collectFiles(root, "docs/lessons")) {
		if (!relativePath.endsWith(".md")) {
			continue;
		}
		if (basename(relativePath).toLowerCase() === "readme.md") {
			continue;
		}
		const content = readText(join(root, relativePath));
		if (!content) {
			continue;
		}
		const { frontmatter, body } = splitFrontmatter(content);
		const parsed = parseFrontmatter(frontmatter);
		const filename = basename(relativePath, ".md");
		const title = extractHeading(body) || filename;
		const score =
			scoreText(filename, tokens) * 3 +
			scoreText(title, tokens) * 2 +
			scoreParts([body, parsed.tags ?? ""], tokens);
		if (score <= 0) {
			continue;
		}
		results.push({ path: relativePath, title, score });
	}
	return results
		.sort(
			(left, right) =>
				right.score - left.score || left.path.localeCompare(right.path),
		)
		.slice(0, MAX_LESSONS);
}

function searchSimilarSystems(
	root: string,
	tokens: readonly string[],
): PreflightSystemResult[] {
	if (tokens.length === 0) {
		return [];
	}

	const scoreByPath = new Map<string, number>();
	const kindByPath = new Map<string, PreflightSystemResult["kind"]>();
	const searchRoots = ["cli", ".afol/adm/specs"].filter((dir) =>
		existsSync(join(root, dir)),
	);

	if (searchRoots.length > 0) {
		const rg = spawnSync(
			"rg",
			[
				"-n",
				"-i",
				"--no-heading",
				"--color",
				"never",
				...tokens.flatMap((token) => ["-e", token]),
				...searchRoots,
			],
			{
				cwd: root,
				encoding: "utf8",
			},
		);

		if (!rg.error && (rg.status === 0 || rg.status === 1)) {
			const stdout = typeof rg.stdout === "string" ? rg.stdout : "";
			for (const line of stdout.split(/\r?\n/)) {
				if (!line) {
					continue;
				}
				const firstSeparator = line.indexOf(":");
				const secondSeparator =
					firstSeparator >= 0 ? line.indexOf(":", firstSeparator + 1) : -1;
				if (firstSeparator < 0 || secondSeparator < 0) {
					continue;
				}
				const path = line.slice(0, firstSeparator);
				if (!path.startsWith("cli/") && !path.startsWith(".afol/adm/specs/")) {
					continue;
				}
				const text = line.slice(secondSeparator + 1);
				const kind: PreflightSystemResult["kind"] = path.startsWith(
					".afol/adm/specs/",
				)
					? "spec"
					: "code";
				kindByPath.set(path, kind);
				const score = 1 + scoreText(text, tokens);
				scoreByPath.set(path, (scoreByPath.get(path) ?? 0) + score);
			}
		}
	}

	for (const relativePath of [
		...collectFiles(root, "cli"),
		...collectFiles(root, ".afol/adm/specs"),
	]) {
		if (
			!relativePath.startsWith("cli/") &&
			!relativePath.startsWith(".afol/adm/specs/")
		) {
			continue;
		}
		const kind: PreflightSystemResult["kind"] = relativePath.startsWith(
			".afol/adm/specs/",
		)
			? "spec"
			: "code";
		kindByPath.set(relativePath, kindByPath.get(relativePath) ?? kind);
		if (
			!tokens.some((token) =>
				containsToken(basename(relativePath).toLowerCase(), token),
			)
		) {
			continue;
		}
		const boosted = 4 + scoreText(basename(relativePath), tokens);
		scoreByPath.set(
			relativePath,
			Math.max(scoreByPath.get(relativePath) ?? 0, boosted),
		);
	}

	const results: PreflightSystemResult[] = [];
	for (const [path, score] of scoreByPath.entries()) {
		if (score <= 0) {
			continue;
		}
		results.push({
			path,
			kind:
				kindByPath.get(path) ??
				(path.startsWith(".afol/adm/specs/") ? "spec" : "code"),
			score,
		});
	}

	return results
		.sort(
			(left, right) =>
				right.score - left.score || left.path.localeCompare(right.path),
		)
		.slice(0, MAX_SIMILAR);
}

function searchRules(
	root: string,
	tokens: readonly string[],
): PreflightRuleResult[] {
	const results: Array<PreflightRuleResult & { score: number }> = [];
	for (const relativePath of collectFiles(root, ".afol/adm/rules")) {
		if (!relativePath.endsWith(".md")) {
			continue;
		}
		if (basename(relativePath).toLowerCase() === "readme.md") {
			continue;
		}
		const content = readText(join(root, relativePath));
		if (!content) {
			continue;
		}
		const title = extractHeading(content) || basename(relativePath, ".md");
		const score =
			scoreText(basename(relativePath, ".md"), tokens) * 3 +
			scoreText(title, tokens) * 2 +
			scoreParts([content], tokens);
		if (score <= 0) {
			continue;
		}
		results.push({ path: relativePath, title, score });
	}
	return results
		.sort(
			(left, right) =>
				right.score - left.score || left.path.localeCompare(right.path),
		)
		.slice(0, MAX_RULES)
		.map((entry) => ({ path: entry.path, title: entry.title }));
}

function searchUxJourneys(
	root: string,
	tokens: readonly string[],
): PreflightUxJourneyResult[] {
	if (tokens.length === 0) {
		return [];
	}
	return loadUxRegistry(root)
		.entries.map((entry) => {
			const score = scoreParts(
				[
					entry.id,
					entry.path,
					entry.title,
					entry.status,
					entry.commands.join(" "),
				],
				tokens,
			);
			return {
				id: entry.id,
				path: entry.path,
				title: entry.title,
				status: entry.status,
				commands: entry.commands,
				score,
			};
		})
		.filter((entry) => entry.score > 0)
		.sort(
			(left, right) =>
				right.score - left.score || left.id.localeCompare(right.id),
		)
		.slice(0, MAX_UX_JOURNEYS);
}

function formatSummary(
	report: Pick<
		PreflightReport,
		"specs" | "lessons" | "similar_systems" | "rules" | "ux_journeys"
	>,
): string {
	if (report.specs.length === 0) {
		return "governance gap: no governing spec found — create or cite one before planning";
	}
	return `${[
		`${report.specs.length} spec${report.specs.length === 1 ? "" : "s"}`,
		`${report.lessons.length} lesson${report.lessons.length === 1 ? "" : "s"}`,
		`${report.similar_systems.length} similar system${report.similar_systems.length === 1 ? "" : "s"}`,
		`${report.rules.length} rule${report.rules.length === 1 ? "" : "s"}`,
		`${report.ux_journeys.length} ux journey${report.ux_journeys.length === 1 ? "" : "s"}`,
	].join(", ")} found`;
}

function buildRecommendations(recurrenceDetected: boolean): string[] {
	if (!recurrenceDetected) {
		return [
			"no recurrence detected: treat as a one-off fix unless new evidence emerges",
		];
	}
	return [
		"recurrence detected: run heavier verification before implementation",
		"propose a rule or lesson only after evidence confirms recurrence, then ask for approval before writing governance",
	];
}

export function runPreflight(root: string, query: string): PreflightReport {
	const tokens = tokenize(query);
	const specs = searchSpecs(root, tokens);
	const lessons = searchLessons(root, tokens);
	const similar_systems = searchSimilarSystems(root, tokens);
	const rules = searchRules(root, tokens);
	const ux_journeys = searchUxJourneys(root, tokens);
	const gaps: string[] = [];

	if (specs.length === 0) {
		gaps.push("no governing spec found");
	}

	const lessonsRoot = join(root, "docs", "lessons");
	if (
		!existsSync(lessonsRoot) ||
		collectFiles(root, "docs/lessons").every(
			(path) => basename(path).toLowerCase() === "readme.md",
		)
	) {
		gaps.push("docs/lessons missing or empty");
	} else if (lessons.length === 0) {
		gaps.push("no prior lessons found");
	}

	if (similar_systems.length === 0) {
		gaps.push("no similar system detected");
	}
	if (rules.length === 0) {
		gaps.push("no applicable rules found");
	}
	if (ux_journeys.length === 0) {
		gaps.push("no relevant UX journey found");
	}

	const report: Omit<
		PreflightReport,
		"summary" | "recurrence_detected" | "recommendations"
	> = {
		query,
		specs,
		lessons,
		similar_systems,
		rules,
		ux_journeys,
		gaps,
	};
	const recurrence_detected = lessons.length > 0;

	return {
		...report,
		summary: formatSummary(report),
		recommendations: buildRecommendations(recurrence_detected),
		recurrence_detected,
	};
}
