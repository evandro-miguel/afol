import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
	inspectSectionIndexCache,
	type SectionIndexCacheInspection,
} from "../context";
import { runDriftCheck } from "../drift";
import {
	checkEvolutionDbHealth,
	evolutionDbPath,
	resolveEvolutionConfig,
} from "../evolution";
import { listOpenPendingSpecs } from "../governance/pending-specs";
import { getTopic, listTopics } from "../library";
import { collectFreshnessReport } from "../local-state/freshness";
import {
	collectSessionIds,
	detectSessionHealth,
	validateWorkBenchIndex,
} from "../local-state/workbench-index";
import { readMemory } from "../memory";
import { readProjectConfig, resolveProjectPaths } from "../project/paths";
import { readMaintenanceReviewSummary } from "./maintenance-review";
import type { HealthArea, HealthFinding, HealthReport } from "./types";

const HEALTH_AREAS: readonly HealthArea[] = [
	"adm",
	"pstr",
	"wb",
	"memory",
	"library",
	"state",
	"ctx",
	"evolution",
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

function sectionIndexPath(root: string): string {
	return join(resolveProjectPaths(root).abs.dataIndexDir, "sections.json");
}

function estimateSelectableSectionTokens(
	sections: readonly {
		ref: string;
		title: string;
		level: number;
		line_start: number;
		line_end: number;
		source_path: string;
	}[],
): number {
	return sections
		.map((section) => {
			const domain = section.ref.startsWith("adr:") ? "adr" : "spec";
			const selectableMetadata = [
				domain,
				section.source_path,
				section.ref,
				section.title,
				section.level,
				section.line_start,
				section.line_end,
			].join(":");
			return Math.max(
				1,
				Math.ceil(new TextEncoder().encode(selectableMetadata).byteLength / 4),
			);
		})
		.sort((left, right) => right - left)
		.slice(0, 3)
		.reduce((total, tokens) => total + tokens, 0);
}

function checkAdmHealth(root: string, deep: boolean): HealthFinding[] {
	const findings: HealthFinding[] = [];
	const projectPaths = resolveProjectPaths(root);
	const admRoot = projectPaths.abs.admDir;
	const admLabel = projectPaths.admDir;
	if (!existsSync(admRoot)) {
		return [
			makeFinding(
				"adm",
				"warn",
				`missing ${admLabel} directory`,
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
					`missing ${admLabel}/${dir} directory`,
					`create ${admLabel}/${dir} or update project administration layout`,
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
	const report = collectFreshnessReport(root, {
		localState: false,
		pstr: true,
	});
	const pstrFindings = report.findings.filter(
		(finding) => finding.surface === "pstr",
	);
	const staleMaps = pstrFindings.filter((finding) =>
		finding.id.startsWith("pstr:map:"),
	);
	const findingsToReport = staleMaps.length > 0 ? staleMaps : pstrFindings;
	for (const finding of findingsToReport) {
		findings.push(
			makeFinding("pstr", "warn", finding.message, finding.remediation),
		);
	}
	if (deep && findings.length === 0) {
		const mapCount = report.checks.filter((finding) =>
			finding.id.startsWith("pstr:map:"),
		).length;
		findings.push(
			makeFinding("pstr", "info", `pstr index is current (${mapCount} maps)`),
		);
	}
	return findings;
}

function checkWorkbenchHealth(root: string, deep: boolean): HealthFinding[] {
	const findings: HealthFinding[] = [];
	const index = validateWorkBenchIndex(root);
	if (!index.ok) {
		findings.push(
			makeFinding("wb", "warn", index.message, "rebuild the workbench index"),
		);
	} else if (deep) {
		findings.push(makeFinding("wb", "info", index.message));
	}

	for (const warning of detectSessionHealth(root)) {
		if (warning.type === "stale_open_tasks") {
			findings.push(
				makeFinding(
					"wb",
					"warn",
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
		if (warning.type === "invalid_event_ledger") {
			findings.push(
				makeFinding(
					"wb",
					"fail",
					warning.message,
					"repair the shared event ledger explicitly before rebuilding state",
				),
			);
		}
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
				"warn",
				"missing or invalid project memory",
				"restore .afol/memory/memory.md",
			),
		];
	}

	const findings: HealthFinding[] = [];
	const ageDays = ageInDays(memory.updated_at);
	const maintenance =
		memory.entries.length === 0 ? readMaintenanceReviewSummary(root) : null;
	const hasFreshEmptyReview =
		maintenance?.store_status === "ok" &&
		!maintenance.due_areas.includes("memory");
	if (ageDays === null) {
		findings.push(
			makeFinding(
				"memory",
				"warn",
				`invalid memory updated_at: ${memory.updated_at}`,
				"fix the project memory frontmatter",
			),
		);
	} else if (ageDays > MEMORY_STALE_AFTER_DAYS && !hasFreshEmptyReview) {
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
					"warn",
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
						"warn",
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
				"warn",
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
			finding.severity === "info" ? "info" : "warn",
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

function checkCtxHealth(
	root: string,
	deep: boolean,
	inspection?: SectionIndexCacheInspection,
): HealthFinding[] {
	const inspected = inspection ?? inspectSectionIndexCache(root);
	if (inspected.status !== "current" || !inspected.index) {
		return [
			makeFinding(
				"ctx",
				"warn",
				`${inspected.status} section index: ${sectionIndexPath(root)} (${inspected.detail})`,
				"rebuild the section index",
			),
		];
	}
	const index = inspected.index;
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

function checkTokenHealth(
	root: string,
	deep: boolean,
	inspection?: SectionIndexCacheInspection,
): HealthFinding[] {
	const inspected = inspection ?? inspectSectionIndexCache(root);
	if (inspected.status !== "current" || !inspected.index) {
		return [
			makeFinding(
				"token_budget",
				"warn",
				`${inspected.status} section index: ${sectionIndexPath(root)} (${inspected.detail})`,
				"rebuild the section index",
			),
		];
	}
	const index = inspected.index;

	const usedTokens = estimateSelectableSectionTokens(index.sections);
	if (usedTokens >= TOKEN_FAIL_AT) {
		return [
			makeFinding(
				"token_budget",
				"warn",
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

function checkEvolutionHealth(root: string, deep: boolean): HealthFinding[] {
	try {
		const config = resolveEvolutionConfig(readProjectConfig(root));
		if (!config.configured) {
			return deep
				? [
						makeFinding(
							"evolution",
							"info",
							"legacy project config uses in-memory evolution defaults",
							"add project.id, project.timezone, evolution paths, and evolution config through an approved config change",
						),
					]
				: [];
		}
		if (!config.enabled) {
			return deep
				? [makeFinding("evolution", "info", "evolution is disabled")]
				: [];
		}
		if (!config.projectId) {
			return [
				makeFinding(
					"evolution",
					"warn",
					"evolution requires a stable project UUID",
					"add project.id through an approved config change",
				),
			];
		}
		const dbPath = evolutionDbPath(root, config.paths.evolutionDb);
		if (!existsSync(dbPath)) {
			return deep
				? [
						makeFinding(
							"evolution",
							"info",
							"evolution derived database is not initialized",
							"it will be created when a qualifying production event is projected",
						),
					]
				: [];
		}
		const health = checkEvolutionDbHealth(dbPath, config.projectId, {
			root,
			projectId: config.projectId,
			timezone: config.timezone,
			evolutionEventsDir: config.paths.evolutionEventsDir,
		});
		const findings = health.findings.map((finding) =>
			makeFinding(
				"evolution",
				finding.severity === "fail" ? "warn" : finding.severity,
				finding.message,
				finding.severity === "fail"
					? "rebuild the derived evolution database from canonical journal events"
					: undefined,
			),
		);
		if (deep && health.ok) {
			findings.push(
				makeFinding(
					"evolution",
					"info",
					`evolution schema current at version ${health.migration_version}`,
				),
			);
		}
		return findings;
	} catch (error) {
		return [
			makeFinding(
				"evolution",
				"warn",
				`invalid evolution configuration: ${(error as Error).message}`,
				"run afol validate project --json and correct the approved project config",
			),
		];
	}
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
	evolution: checkEvolutionHealth,
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
	const deep = opts?.deep ?? false;
	const sectionInspection = areas.some(
		(area) => area === "ctx" || area === "token_budget",
	)
		? inspectSectionIndexCache(root)
		: undefined;
	const findings = areas.flatMap((area) => {
		if (area === "ctx") {
			return checkCtxHealth(root, deep, sectionInspection);
		}
		if (area === "token_budget") {
			return checkTokenHealth(root, deep, sectionInspection);
		}
		return checkAreaHealth(root, area, deep);
	});
	if (areas.includes("wb")) {
		const openPendingSpecs = listOpenPendingSpecs(root);
		if (openPendingSpecs.length > 0) {
			findings.push(
				makeFinding(
					"wb",
					"warn",
					`open pending_spec entries: ${openPendingSpecs.length}`,
					"run afol governance pending and resolve or waive each entry",
				),
			);
		}
	}
	// Release scope promotes routine warnings so explicit release checks stay strict.
	const effectiveFindings: HealthFinding[] = opts?.release
		? findings.map((finding) =>
				finding.severity === "warn"
					? { ...finding, severity: "fail" }
					: finding,
			)
		: findings;
	return {
		ok: effectiveFindings.every((finding) => finding.severity !== "fail"),
		checked_at: nowIso(),
		findings: effectiveFindings,
		summary: summarize(effectiveFindings),
	};
}
