import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { getSectionIndex } from "../context";
import { runDriftCheck } from "../drift";
import { listOpenPendingSpecs } from "../governance/pending-specs";
import { getTopic, listTopics } from "../library";
import {
	collectSessionIds,
	detectSessionHealth,
	validateWorkBenchIndex,
} from "../local-state/workbench-index";
import { readMemory } from "../memory";
import { resolveProjectPaths } from "../project/paths";
import { checkPstrStale, validatePstrIndex } from "../pstr";
import type { HealthArea, HealthFinding, HealthReport } from "./types";

const HEALTH_AREAS: readonly HealthArea[] = [
	"adm",
	"pstr",
	"wb",
	"memory",
	"library",
	"state",
	"ctx",
	"token_budget",
];
const CORE_HEALTH_AREAS: readonly HealthArea[] = ["wb"];
const MEMORY_STALE_AFTER_DAYS = 30;
const TOKEN_WARN_AT = 2000;
const TOKEN_FAIL_AT = 4000;

function nowIso(): string {
	return new Date().toISOString();
}

function makeFinding(
	area: HealthArea,
	severity: HealthFinding["severity"],
	message: string,
	hint?: string,
): HealthFinding {
	return { area, severity, message, ...(hint ? { hint } : {}) };
}

function addIf(
	findings: HealthFinding[],
	condition: boolean,
	finding: HealthFinding,
): void {
	if (condition) {
		findings.push(finding);
	}
}

function parseIsoDate(value: string): number | null {
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function ageInDays(value: string): number | null {
	const parsed = parseIsoDate(value);
	if (parsed === null) {
		return null;
	}
	return (Date.now() - parsed) / (24 * 60 * 60 * 1000);
}

function walkMarkdownFiles(root: string): string[] {
	if (!existsSync(root)) {
		return [];
	}
	const files: string[] = [];
	const stack: string[] = [root];
	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) {
			continue;
		}
		for (const entry of readdirSync(current, { withFileTypes: true }).sort(
			(a, b) => a.name.localeCompare(b.name),
		)) {
			const entryPath = join(current, entry.name);
			if (entry.isDirectory()) {
				stack.push(entryPath);
				continue;
			}
			if (entry.isFile() && entry.name.endsWith(".md")) {
				files.push(entryPath);
			}
		}
	}
	return files.sort((a, b) => a.localeCompare(b));
}

function latestSourceMtime(root: string): number {
	const docsRoot = join(root, "docs", "arc");
	let latest = 0;
	for (const file of walkMarkdownFiles(join(docsRoot, "SPECS"))) {
		latest = Math.max(latest, statSync(file).mtimeMs);
	}
	for (const file of walkMarkdownFiles(join(docsRoot, "DECISIONS"))) {
		latest = Math.max(latest, statSync(file).mtimeMs);
	}
	return latest;
}

function sectionIndexPath(root: string): string {
	return join(resolveProjectPaths(root).abs.dataIndexDir, "sections.json");
}

function estimateSectionTokens(
	sections: readonly { ref: string; title: string; source_path: string }[],
): number {
	return sections.reduce(
		(total, section) =>
			total +
			Math.max(
				1,
				Math.ceil(
					(section.ref.length +
						section.title.length +
						section.source_path.length) /
						4,
				),
			),
		0,
	);
}

function checkAdmHealth(root: string, deep: boolean): HealthFinding[] {
	const findings: HealthFinding[] = [];
	const admRoot = join(root, ".afol", "adm");
	if (!existsSync(admRoot)) {
		return [
			makeFinding(
				"adm",
				"fail",
				"missing .afol/adm directory",
				"restore AFOL administration files or run the project bootstrap/update flow",
			),
		];
	}

	const requiredDirs = ["roadmap", "specs", "decisions", "doctrine"];
	for (const dir of requiredDirs) {
		const path = join(admRoot, dir);
		if (!existsSync(path)) {
			findings.push(
				makeFinding(
					"adm",
					"warn",
					`missing .afol/adm/${dir} directory`,
					`create .afol/adm/${dir} or update project administration layout`,
				),
			);
		}
	}

	if (deep && findings.length === 0) {
		findings.push(
			makeFinding(
				"adm",
				"info",
				`adm structure present (${walkMarkdownFiles(admRoot).length} markdown files)`,
			),
		);
	}
	return findings;
}

function checkPstrHealth(root: string, deep: boolean): HealthFinding[] {
	const findings: HealthFinding[] = [];
	const validation = validatePstrIndex(root);
	if (!validation.ok) {
		findings.push(
			makeFinding("pstr", "fail", validation.message, "run afol pstr rebuild"),
		);
		return findings;
	}
	const stale = checkPstrStale(root);
	for (const entry of stale) {
		addIf(
			findings,
			entry.stale,
			makeFinding("pstr", "fail", entry.message, "run afol pstr rebuild"),
		);
	}
	if (deep && findings.length === 0) {
		findings.push(
			makeFinding(
				"pstr",
				"info",
				`pstr index is current (${stale.length} maps)`,
			),
		);
	}
	return findings;
}

function checkWorkbenchHealth(root: string, deep: boolean): HealthFinding[] {
	const findings: HealthFinding[] = [];
	const index = validateWorkBenchIndex(root);
	if (!index.ok) {
		findings.push(
			makeFinding("wb", "fail", index.message, "rebuild the workbench index"),
		);
	} else if (deep) {
		findings.push(makeFinding("wb", "info", index.message));
	}

	for (const warning of detectSessionHealth(root)) {
		if (warning.type === "stale_open_tasks") {
			findings.push(
				makeFinding(
					"wb",
					"fail",
					warning.message,
					"archive or close stale sessions",
				),
			);
			continue;
		}
		if (warning.type === "missing_session_directory") {
			findings.push(
				makeFinding(
					"wb",
					"warn",
					warning.message,
					"restore from archive, migration pack, or recreate the session directory",
				),
			);
			continue;
		}
		if (warning.type === "unreadable_session_directory") {
			findings.push(
				makeFinding(
					"wb",
					"fail",
					warning.message,
					"restore read access to the session directory",
				),
			);
			continue;
		}
		findings.push(
			makeFinding(
				"wb",
				"warn",
				warning.message,
				"dedupe or rename the sessions",
			),
		);
	}

	if (deep && findings.length === 0) {
		findings.push(
			makeFinding(
				"wb",
				"info",
				`wb sessions: ${collectSessionIds(root).length}`,
			),
		);
	}
	return findings;
}

function checkMemoryHealth(root: string, deep: boolean): HealthFinding[] {
	const memory = readMemory(root);
	if (!memory) {
		return [
			makeFinding(
				"memory",
				"fail",
				"missing or invalid project memory",
				"restore .afol/memory/memory.md",
			),
		];
	}

	const findings: HealthFinding[] = [];
	const ageDays = ageInDays(memory.updated_at);
	if (ageDays === null) {
		findings.push(
			makeFinding(
				"memory",
				"fail",
				`invalid memory updated_at: ${memory.updated_at}`,
				"fix the project memory frontmatter",
			),
		);
	} else if (ageDays > MEMORY_STALE_AFTER_DAYS) {
		findings.push(
			makeFinding(
				"memory",
				"warn",
				`stale project memory (${Math.floor(ageDays)}d old)`,
				"refresh updated_at when memory changes",
			),
		);
	} else if (deep) {
		findings.push(
			makeFinding(
				"memory",
				"info",
				`memory current (${memory.entries.length} entries)`,
			),
		);
	}
	return findings;
}

function checkLibraryHealth(root: string, deep: boolean): HealthFinding[] {
	const findings: HealthFinding[] = [];
	const topicsRoot = resolveProjectPaths(root).abs.libraryDir;
	if (!existsSync(topicsRoot)) {
		return deep
			? [makeFinding("library", "info", "library directory is missing")]
			: [];
	}

	const topicSlugs = listTopics(root);
	for (const slug of topicSlugs) {
		const topic = getTopic(root, slug);
		if (!topic) {
			findings.push(
				makeFinding(
					"library",
					"fail",
					`invalid library topic: ${slug}`,
					"check source metadata and claim references",
				),
			);
			continue;
		}
		const sourceIds = new Set(topic.sources.map((source) => source.id));
		for (const claim of topic.claims) {
			const missing = claim.source_ids.filter(
				(sourceId) => !sourceIds.has(sourceId),
			);
			if (missing.length > 0) {
				findings.push(
					makeFinding(
						"library",
						"fail",
						`orphaned claim ${claim.id} in ${topic.slug}: ${missing.join(", ")}`,
						"repair the claim source_ids",
					),
				);
			}
		}
	}

	if (deep && findings.length === 0) {
		findings.push(
			makeFinding("library", "info", `library topics: ${topicSlugs.length}`),
		);
	}
	return findings;
}

function checkStateHealth(root: string, deep: boolean): HealthFinding[] {
	const projectPaths = resolveProjectPaths(root);
	if (!existsSync(projectPaths.abs.stateDb)) {
		return [
			makeFinding(
				"state",
				"fail",
				`missing state db: ${projectPaths.abs.stateDb}`,
				"run afol hydrate for the affected session",
			),
		];
	}

	const findings = runDriftCheck(root, {
		adm: false,
		state: true,
		pstr: false,
		specs: false,
	}).findings.map((finding) =>
		makeFinding(
			"state",
			finding.severity === "fail"
				? "fail"
				: finding.severity === "warn"
					? "warn"
					: "info",
			finding.message,
			finding.hint,
		),
	);

	if (deep && findings.length === 0) {
		findings.push(
			makeFinding(
				"state",
				"info",
				`state db present: ${projectPaths.abs.stateDb}`,
			),
		);
	}
	return findings;
}

function checkCtxHealth(root: string, deep: boolean): HealthFinding[] {
	const index = getSectionIndex(root);
	if (!index) {
		return [
			makeFinding(
				"ctx",
				"fail",
				`missing section index: ${sectionIndexPath(root)}`,
				"rebuild the section index",
			),
		];
	}

	const latestSource = latestSourceMtime(root);
	const generatedAt = parseIsoDate(index.generated_at);
	if (generatedAt === null) {
		return [
			makeFinding(
				"ctx",
				"fail",
				`invalid section index generated_at: ${index.generated_at}`,
				"rebuild the section index",
			),
		];
	}
	if (latestSource > 0 && generatedAt < latestSource) {
		return [
			makeFinding(
				"ctx",
				"fail",
				`stale section index: ${sectionIndexPath(root)}`,
				"rebuild the section index",
			),
		];
	}
	return deep
		? [
				makeFinding(
					"ctx",
					"info",
					`section index current (${index.sections.length} sections)`,
				),
			]
		: [];
}

function checkTokenHealth(root: string, deep: boolean): HealthFinding[] {
	const index = getSectionIndex(root);
	if (!index) {
		return [
			makeFinding(
				"token_budget",
				"fail",
				`missing section index: ${sectionIndexPath(root)}`,
				"rebuild the section index",
			),
		];
	}

	const usedTokens = estimateSectionTokens(index.sections);
	if (usedTokens >= TOKEN_FAIL_AT) {
		return [
			makeFinding(
				"token_budget",
				"fail",
				`section index token budget exceeded (${usedTokens}/${TOKEN_FAIL_AT})`,
				"split or prune section sources",
			),
		];
	}
	if (usedTokens >= TOKEN_WARN_AT) {
		return [
			makeFinding(
				"token_budget",
				"warn",
				`section index token budget is high (${usedTokens}/${TOKEN_WARN_AT})`,
				"split or prune section sources",
			),
		];
	}
	return deep
		? [
				makeFinding(
					"token_budget",
					"info",
					`section index budget ${usedTokens}/${TOKEN_WARN_AT}`,
				),
			]
		: [];
}

const CHECKERS: Record<
	HealthArea,
	(root: string, deep: boolean) => HealthFinding[]
> = {
	adm: checkAdmHealth,
	pstr: checkPstrHealth,
	wb: checkWorkbenchHealth,
	memory: checkMemoryHealth,
	library: checkLibraryHealth,
	state: checkStateHealth,
	ctx: checkCtxHealth,
	token_budget: checkTokenHealth,
};

function summarize(
	findings: readonly HealthFinding[],
): HealthReport["summary"] {
	return findings.reduce(
		(summary, finding) => {
			summary[finding.severity] += 1;
			return summary;
		},
		{ fail: 0, warn: 0, info: 0 },
	);
}

export function checkAreaHealth(
	root: string,
	area: HealthArea,
	deep = false,
): HealthFinding[] {
	const checker = CHECKERS[area];
	return checker ? checker(root, deep) : [];
}

export function checkHealth(
	root: string,
	opts?: {
		area?: HealthArea;
		deep?: boolean;
		includeAuxiliary?: boolean;
		release?: boolean;
	},
): HealthReport {
	const areas = opts?.area
		? [opts.area]
		: opts?.deep || opts?.includeAuxiliary
			? [...HEALTH_AREAS]
			: [...CORE_HEALTH_AREAS];
	const findings = areas.flatMap((area) =>
		checkAreaHealth(root, area, opts?.deep ?? false),
	);
	if (areas.includes("wb")) {
		const openPendingSpecs = listOpenPendingSpecs(root);
		if (openPendingSpecs.length > 0) {
			findings.push(
				makeFinding(
					"wb",
					opts?.release ? "fail" : "warn",
					`open pending_spec entries: ${openPendingSpecs.length}`,
					"run afol governance pending and resolve or waive each entry",
				),
			);
		}
	}
	return {
		ok: findings.every((finding) => finding.severity !== "fail"),
		checked_at: nowIso(),
		findings,
		summary: summarize(findings),
	};
}
