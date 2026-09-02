import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { kernelRegistry } from "../../registry";
import { resolveProjectPaths } from "../project/paths";

const UX_DOC_TYPES = new Set(["ux-journey"]);
const SPEC_DOC_TYPES = new Set(["spec", "spec-child", "spec-test"]);
const REGISTRY_DOC_TYPES = new Set([...UX_DOC_TYPES, ...SPEC_DOC_TYPES]);

const REQUIRED_STANDARD_PATHS = [
	"docs/standards/user-journey-registry.md",
	"docs/templates/ux-journey.md",
];

const RECOMMENDED_STANDARD_PATHS = [
	".afol/adm/benchmarks/afol-tool-scenario-coverage-plan.md",
];

const REQUIRED_UX_HEADINGS = [
	"## Purpose",
	"## Entry And Exit",
	"## Flow",
	"## Expected Result",
	"## States And Recovery",
	"## Evidence",
	"## Metrics",
	"## Acceptance",
];

const REQUIRED_UX_MARKERS = [
	"Success exit:",
	"Recovery exit:",
	"Output:",
	"Durable state change:",
	"Warning or review prompt:",
	"Token/output budget:",
];

const UX_RECOVERY_STATE_RE =
	/\b(?:blocked|empty|error|fail(?:ed|ure)?|invalid|partial|permission|rejected|stale|unavailable)\b/i;
const UX_RECOVERY_ACTION_RE =
	/`[^`]+`|\b(?:add|continue|correct|fix|inspect|investigate|keep|list|preserve|preview|refresh|repair|resume|retry|review|re-?run|restore|return|roll back|use|wait|waive)\b/i;

type Frontmatter = Record<string, string>;

export type UxJourneyEntry = {
	id: string;
	path: string;
	doc_type: string;
	title: string;
	status: string;
	roadmap_feature?: string;
	parent_spec?: string;
	commands: string[];
	missing_fields: string[];
	source: "spec" | "spec-test" | "ux-journey";
};

export type UxRegistryIssue = {
	path: string;
	message: string;
	severity: "error" | "warning";
};

export type UxRegistrySnapshot = {
	generated_at: string;
	entries: UxJourneyEntry[];
	issues: UxRegistryIssue[];
};

export type RegisterUxJourneyResult = {
	created: boolean;
	dry_run: boolean;
	path: string;
	entry: UxJourneyEntry;
	content: string;
};

type MarkdownDocument = {
	path: string;
	content: string;
	body: string;
	frontmatter: Frontmatter;
};

function unixPath(value: string): string {
	return value.replace(/\\/g, "/");
}

function walkMarkdownFiles(
	root: string,
	current: string,
	files: string[],
): void {
	if (!existsSync(current)) {
		return;
	}
	for (const entry of readdirSync(current, { withFileTypes: true }).sort(
		(left, right) => left.name.localeCompare(right.name),
	)) {
		const absolute = join(current, entry.name);
		if (entry.isDirectory()) {
			walkMarkdownFiles(root, absolute, files);
			continue;
		}
		if (entry.isFile() && entry.name.endsWith(".md")) {
			files.push(unixPath(relative(root, absolute)));
		}
	}
}

function candidateMarkdownPaths(root: string): string[] {
	const admDir = resolveProjectPaths(root).abs.admDir;
	const candidates = [
		join(admDir, "ux"),
		join(admDir, "specs"),
		join(root, "docs", "ux"),
	];
	const files: string[] = [];
	for (const candidate of candidates) {
		walkMarkdownFiles(root, candidate, files);
	}
	return [...new Set(files)].sort();
}

function stripQuotes(value: string): string {
	return value.trim().replace(/^['"]|['"]$/g, "");
}

function splitFrontmatter(content: string): {
	frontmatter: Frontmatter;
	body: string;
} {
	const normalized = content.replace(/\r\n/g, "\n");
	if (!normalized.startsWith("---\n")) {
		return { frontmatter: {}, body: normalized };
	}
	const end = normalized.indexOf("\n---", 4);
	if (end < 0) {
		return { frontmatter: {}, body: normalized };
	}
	const raw = normalized.slice(4, end).split("\n");
	const frontmatter: Frontmatter = {};
	for (const line of raw) {
		const separator = line.indexOf(":");
		if (separator < 0) {
			continue;
		}
		const key = line.slice(0, separator).trim();
		const value = stripQuotes(line.slice(separator + 1));
		if (key && value && !value.startsWith("[") && !value.startsWith("{")) {
			frontmatter[key] = value;
		}
	}
	return { frontmatter, body: normalized.slice(end + 4).trimStart() };
}

function readMarkdownDocument(root: string, path: string): MarkdownDocument {
	const content = readFileSync(join(root, path), "utf8");
	const { frontmatter, body } = splitFrontmatter(content);
	return { path, content, body, frontmatter };
}

function extractTitle(document: MarkdownDocument): string {
	const frontmatterTitle = document.frontmatter.title;
	if (frontmatterTitle) {
		return frontmatterTitle;
	}
	const heading = document.body
		.split("\n")
		.find((line) => line.startsWith("# "));
	return heading ? heading.slice(2).trim() : (document.frontmatter.theme ?? "");
}

const AFOL_COMMAND_RE =
	/(?<![\w./-])(?:afol|\.\/afol)\s+[a-z][a-z0-9-]*(?:\s+[a-z][a-z0-9-]*)?/g;

function codeContextSegments(content: string): string[] {
	const segments: string[] = [];
	let inFence = false;
	for (const line of content.split(/\r?\n/)) {
		if (/^\s{0,3}```/.test(line)) {
			inFence = !inFence;
			continue;
		}
		if (inFence) {
			segments.push(line);
			continue;
		}
		for (const match of line.matchAll(/`([^`\n]+)`/g)) {
			if (match[1] !== undefined) {
				segments.push(match[1]);
			}
		}
	}
	return segments;
}

function canonicalizeAfolCommandMention(command: string): string | null {
	const tokens = command.trim().split(/\s+/).filter(Boolean);
	const executable = tokens[0];
	if (tokens.length < 2 || (executable !== "afol" && executable !== "./afol")) {
		return null;
	}
	const canonicalCommand = kernelRegistry.canonicalize(tokens[1] ?? "");
	if (kernelRegistry.resolveKind(canonicalCommand) === null) {
		return null;
	}
	return ["afol", canonicalCommand, ...tokens.slice(2)].join(" ");
}

function extractAfolCommands(content: string): string[] {
	const commands = new Set<string>();
	for (const segment of codeContextSegments(content)) {
		for (const match of segment.matchAll(AFOL_COMMAND_RE)) {
			const canonical = canonicalizeAfolCommandMention(match[0]);
			if (canonical) {
				commands.add(canonical);
			}
		}
	}
	return [...commands].sort();
}

function sourceForDocType(
	docType: string,
): "spec" | "spec-test" | "ux-journey" {
	if (docType === "ux-journey") {
		return "ux-journey";
	}
	if (docType === "spec-test") {
		return "spec-test";
	}
	return "spec";
}

function extractMarkerValue(body: string, marker: string): string {
	const lines = body.split("\n");
	const index = lines.findIndex((line) => line.includes(marker));
	if (index < 0) return "";
	const inline = lines[index]?.split(marker, 2)[1]?.trim() ?? "";
	if (inline) return inline;
	for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
		const candidate = lines[cursor]?.trim() ?? "";
		if (!candidate) continue;
		if (candidate.startsWith("#") || candidate.startsWith("-")) return "";
		return candidate;
	}
	return "";
}

function extractSection(body: string, heading: string): string {
	const start = body.indexOf(heading);
	if (start < 0) return "";
	const contentStart = start + heading.length;
	const nextHeading = body.indexOf("\n## ", contentStart);
	return body.slice(contentStart, nextHeading < 0 ? body.length : nextHeading);
}

function requiredUxMissingFields(document: MarkdownDocument): string[] {
	if (document.frontmatter.doc_type !== "ux-journey") {
		return [];
	}
	const missing: string[] = [];
	for (const field of [
		"id",
		"doc_type",
		"theme",
		"status",
		"roadmap_feature",
		"parent_spec",
	]) {
		if (!document.frontmatter[field]) {
			missing.push(field);
		}
	}
	for (const heading of REQUIRED_UX_HEADINGS) {
		if (!document.body.includes(heading)) {
			missing.push(heading);
		}
	}
	for (const marker of REQUIRED_UX_MARKERS) {
		if (!extractMarkerValue(document.body, marker)) {
			missing.push(marker);
		}
	}
	const recoverySection = extractSection(
		document.body,
		"## States And Recovery",
	);
	if (
		!UX_RECOVERY_STATE_RE.test(recoverySection) ||
		!UX_RECOVERY_ACTION_RE.test(recoverySection)
	) {
		missing.push("States And Recovery: actionable transition");
	}
	return missing;
}

function isUxRelevant(document: MarkdownDocument): boolean {
	const docType = document.frontmatter.doc_type;
	if (docType === "ux-journey") {
		return true;
	}
	if (!SPEC_DOC_TYPES.has(docType ?? "")) {
		return false;
	}
	const lower = document.content.toLowerCase();
	return (
		lower.includes("ux") ||
		lower.includes("user journey") ||
		lower.includes("user flow") ||
		lower.includes("scenario coverage") ||
		lower.includes("afol ux")
	);
}

function toEntry(document: MarkdownDocument): UxJourneyEntry | null {
	const docType = document.frontmatter.doc_type;
	if (!docType || !REGISTRY_DOC_TYPES.has(docType)) {
		return null;
	}
	const id = document.frontmatter.id;
	if (!id) {
		return null;
	}
	const entry: UxJourneyEntry = {
		id,
		path: document.path,
		doc_type: docType,
		title: extractTitle(document),
		status: document.frontmatter.status ?? "",
		commands: extractAfolCommands(document.content),
		missing_fields: requiredUxMissingFields(document),
		source: sourceForDocType(docType),
	};
	if (document.frontmatter.roadmap_feature) {
		entry.roadmap_feature = document.frontmatter.roadmap_feature;
	}
	if (document.frontmatter.parent_spec) {
		entry.parent_spec = document.frontmatter.parent_spec;
	}
	return entry;
}

function loadCandidateDocuments(root: string): MarkdownDocument[] {
	return candidateMarkdownPaths(root).map((path) =>
		readMarkdownDocument(root, path),
	);
}

function standardIssues(root: string): UxRegistryIssue[] {
	const issues: UxRegistryIssue[] = [];
	for (const path of REQUIRED_STANDARD_PATHS) {
		if (!existsSync(join(root, path))) {
			issues.push({
				path,
				message: "missing required UX registry standard/template",
				severity: "error",
			});
		}
	}
	const recommendedPaths = [
		...RECOMMENDED_STANDARD_PATHS.filter(
			(path) => !path.startsWith(".afol/adm/"),
		),
		`${resolveProjectPaths(root).admDir}/benchmarks/afol-tool-scenario-coverage-plan.md`,
	];
	for (const path of recommendedPaths) {
		if (!existsSync(join(root, path))) {
			issues.push({
				path,
				message: "missing recommended UX benchmark coverage plan",
				severity: "warning",
			});
		}
	}
	return issues;
}

export function loadUxRegistry(root: string): UxRegistrySnapshot {
	const entries = loadCandidateDocuments(root)
		.filter(isUxRelevant)
		.map(toEntry)
		.filter((entry): entry is UxJourneyEntry => entry !== null)
		.sort((left, right) => left.id.localeCompare(right.id));
	const issues = [
		...standardIssues(root),
		...entries.flatMap((entry) =>
			entry.missing_fields.map(
				(field): UxRegistryIssue => ({
					path: entry.path,
					message: `missing UX journey field: ${field}`,
					severity: "error",
				}),
			),
		),
	];
	return {
		generated_at: new Date().toISOString(),
		entries,
		issues,
	};
}

export function findUxJourney(
	root: string,
	journeyId: string,
): UxJourneyEntry | null {
	return (
		loadUxRegistry(root).entries.find((entry) => entry.id === journeyId) ?? null
	);
}

export function coverageForTool(root: string, tool: string): UxJourneyEntry[] {
	const normalizedTool = tool
		.replace(/^(?:afol|a|\.\/afol)\s+/, "")
		.trim()
		.split(/\s+/)[0];
	if (!normalizedTool) {
		throw new Error("Missing --tool for ux coverage.");
	}
	const canonicalTool = kernelRegistry.canonicalize(normalizedTool);
	return loadUxRegistry(root).entries.filter((entry) =>
		entry.commands.some(
			(command) =>
				command === `afol ${canonicalTool}` ||
				command.startsWith(`afol ${canonicalTool} `),
		),
	);
}

function findSpecDocument(
	root: string,
	specId: string,
): MarkdownDocument | null {
	for (const document of loadCandidateDocuments(root)) {
		if (
			SPEC_DOC_TYPES.has(document.frontmatter.doc_type ?? "") &&
			document.frontmatter.id === specId
		) {
			return document;
		}
	}
	return null;
}

function generatedJourneyIdForSpec(specId: string): string {
	const id = `${specId.replace(/_spec(?:-child|-test)?_01$/, "")}_ux-journey_01`;
	if (id.includes("/") || id.includes("\\")) {
		throw new Error(`Spec id cannot be used as UX journey id: ${specId}`);
	}
	return id;
}

function renderRegisteredJourney(
	spec: UxJourneyEntry,
	id = generatedJourneyIdForSpec(spec.id),
): string {
	const title = spec.title || spec.id;
	return [
		"---",
		"doc_type: ux-journey",
		`id: ${id}`,
		`theme: ${spec.id}`,
		"status: draft",
		"owners:",
		"- orchestrator",
		`roadmap_feature: ${spec.roadmap_feature ?? "unassigned"}`,
		`parent_spec: ${spec.parent_spec ?? spec.id}`,
		`source_spec: ${spec.id}`,
		"---",
		"",
		`# UX Journey: ${title}`,
		"",
		"## Purpose",
		"",
		"- User or agent: operator or delegated agent",
		`- Goal: complete the flow governed by \`${spec.id}\` with visible output, durable state, and evidence.`,
		"- Context: a task or spec changes command behavior, state, warnings, or benchmark expectations.",
		"",
		"## Entry And Exit",
		"",
		"- Entry point: governing spec, workbench task, or benchmark scenario.",
		"- Success exit: scenario evidence records command output, state mutation, warnings, and validation result.",
		"- Recovery exit: failed validation names the missing journey field, scenario, or evidence path.",
		"",
		"## Flow",
		"",
		"1. Read the governing roadmap feature and spec.",
		"   - Information shown: objective, affected AFOL commands, and expected state.",
		"   - User or agent decision: choose scripted or live-agent scenario lane.",
		"   - AFOL command/tool: `afol ux validate`.",
		"   - System state: registry entries remain spec-linked.",
		"   - Possible failure: missing command journey.",
		"   - Recovery: register the journey or add benchmark coverage.",
		"2. Inspect coverage for an affected tool.",
		"   - Information shown: matching journeys and command mentions.",
		"   - User or agent decision: confirm that the tool path is tested.",
		"   - AFOL command/tool: `afol ux coverage --tool <afol-command>`.",
		"   - System state: no mutation unless registration is requested.",
		"   - Possible failure: no matching journey.",
		"   - Recovery: create a scenario and attach evidence.",
		"",
		"## Expected Result",
		"",
		"- Output: compact registry status with journey count, issues, and matching tools.",
		"- Durable state change: only `afol ux register --from-spec <spec-id>` writes a draft under the configured `adm_dir` UX registry.",
		"- Warning or review prompt: missing scenario, stale session, or maintenance review remains visible before claiming coverage.",
		"- Token/output budget: default output stays below 5k tokens.",
		"",
		"## States And Recovery",
		"",
		"- Default: show the governing flow and the narrowest safe command.",
		"- Loading or in-progress: preserve state and show what is being checked.",
		"- Empty or no results: explain why and name the first useful action.",
		"- Error: name the failed condition and an exact correction path.",
		"- Partial failure: keep successful evidence and retry only the failed lane.",
		"- Permission denied or approval required: keep preview available without mutation.",
		"- Stale state: name the rebuild or refresh command and preserve canonical state.",
		"- Success: show completion evidence and the next safe action.",
		"- First use: offer dry-run or inspection before mutation.",
		"- Returning user: resume from saved state without repeating completed writes.",
		"",
		"## Evidence",
		"",
		"- Scripted scenario: benchmark catalog scenario covering the relevant `afol ux` subcommand.",
		"- Live-agent scenario: required only when agent judgment selects tools, memory, maintenance, or research state.",
		"- Benchmark pack: governance-history or the affected tool-family pack.",
		"- Report or workbench evidence: AFOL workbench evidence command records validation output.",
		"",
		"## Metrics",
		"",
		"- Completion criterion: `afol ux validate` exits 0 and the benchmark scenario passes.",
		"- Error/retry criterion: invalid or missing journeys produce actionable validation issues.",
		"- User effort or latency criterion: operator can find the journey with `afol ux list` or `afol ux show <journey-id>`.",
		"",
		"## Acceptance",
		"",
		"- [ ] Primary actor and goal are explicit",
		"- [ ] Steps, states, failures, and recovery are explicit",
		"- [ ] Expected AFOL tools are named",
		"- [ ] Expected output and durable state change are explicit",
		"- [ ] Evidence path is explicit",
	].join("\n");
}

export function registerUxJourneyFromSpec(
	root: string,
	specId: string,
	options: { dryRun?: boolean } = {},
): RegisterUxJourneyResult {
	if (!specId.trim()) {
		throw new Error("Missing --from-spec for ux register.");
	}
	const specDocument = findSpecDocument(root, specId);
	if (!specDocument) {
		throw new Error(`Spec not found for UX registration: ${specId}`);
	}
	const specEntry = toEntry(specDocument);
	if (!specEntry) {
		throw new Error(`Spec cannot be registered as UX journey: ${specId}`);
	}
	const journeyId = generatedJourneyIdForSpec(specEntry.id);
	const content = renderRegisteredJourney(specEntry, journeyId);
	const targetDir = join(resolveProjectPaths(root).abs.admDir, "ux");
	const targetAbsolutePath = join(targetDir, `${journeyId}.md`);
	const targetPath = unixPath(relative(root, targetAbsolutePath));
	const exists = existsSync(targetAbsolutePath);
	if (!options.dryRun && !exists) {
		mkdirSync(targetDir, { recursive: true });
		writeFileSync(targetAbsolutePath, `${content}\n`, "utf8");
	}
	const entry = toEntry({
		path: targetPath,
		content,
		body: splitFrontmatter(content).body,
		frontmatter: splitFrontmatter(content).frontmatter,
	});
	if (!entry) {
		throw new Error("Generated UX journey could not be parsed.");
	}
	return {
		created: !exists && !options.dryRun,
		dry_run: options.dryRun ?? false,
		path: targetPath,
		entry,
		content,
	};
}
