import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { atomicWriteText } from "../io/atomic";
import { resolveProjectPaths } from "../project/paths";
import { loadProjectRoot } from "../project/root";

export const MAINTENANCE_REVIEW_AREAS = [
	"rules",
	"skills",
	"docs",
	"commands",
] as const;

export type MaintenanceReviewArea = (typeof MAINTENANCE_REVIEW_AREAS)[number];
export type MaintenanceReviewAreaSelection = MaintenanceReviewArea | "all";

type MaintenanceReviewEntry = {
	reviewed_at: string;
	note?: string;
};

type MaintenanceReviewStore = {
	version: 1;
	areas: Partial<Record<MaintenanceReviewArea, MaintenanceReviewEntry>>;
};

export type MaintenanceReviewAreaStatus = {
	area: MaintenanceReviewArea;
	due: boolean;
	reviewed_at: string | null;
	note: string | null;
};

export type MaintenanceReviewSummary = {
	review_interval_days: number;
	areas: MaintenanceReviewAreaStatus[];
	due_areas: MaintenanceReviewArea[];
};

export type MaintenanceReviewRecord = {
	area: MaintenanceReviewAreaSelection;
	reviewed_areas: MaintenanceReviewArea[];
	recorded_at: string;
	note: string | null;
	dry_run: boolean;
	summary: MaintenanceReviewSummary;
};

const DEFAULT_REVIEW_INTERVAL_DAYS = 7;
const MIN_REVIEW_INTERVAL_DAYS = 1;
const MAX_REVIEW_INTERVAL_DAYS = 365;
const EXCLUDED_DIRS = new Set([
	".git",
	"node_modules",
	"archive",
	"archives",
	"generated",
	"cache",
	".cache",
]);
const LEGACY_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
	{ label: ".agents/wb", pattern: /\.agents\/wb\b/ },
	{ label: ".agents/scripts", pattern: /\.agents\/scripts\b/ },
	{ label: ".agents/runtime", pattern: /\.agents\/runtime\b/ },
	{ label: "agents.config", pattern: /\bagents\.config\b/ },
	{ label: "legacy:", pattern: /\blegacy:/ },
];

function normalizeInterval(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return DEFAULT_REVIEW_INTERVAL_DAYS;
	}
	const normalized = Math.trunc(value);
	if (normalized < MIN_REVIEW_INTERVAL_DAYS) {
		return MIN_REVIEW_INTERVAL_DAYS;
	}
	if (normalized > MAX_REVIEW_INTERVAL_DAYS) {
		return MAX_REVIEW_INTERVAL_DAYS;
	}
	return normalized;
}

function readReviewIntervalDays(root: string): number {
	const loaded = loadProjectRoot(root);
	if (!loaded.ok) {
		return DEFAULT_REVIEW_INTERVAL_DAYS;
	}
	const maintenance = loaded.value.config.maintenance;
	if (
		maintenance === null ||
		typeof maintenance !== "object" ||
		Array.isArray(maintenance)
	) {
		return DEFAULT_REVIEW_INTERVAL_DAYS;
	}
	return normalizeInterval(
		(maintenance as Record<string, unknown>).review_interval_days,
	);
}

function storePath(root: string): string {
	return join(
		resolveProjectPaths(root).abs.dataIndexDir,
		"..",
		"maintenance",
		"reviews.json",
	);
}

function readStore(root: string): MaintenanceReviewStore {
	const path = storePath(root);
	if (!existsSync(path)) {
		return { version: 1, areas: {} };
	}
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
		if (
			parsed !== null &&
			typeof parsed === "object" &&
			!Array.isArray(parsed) &&
			(parsed as { version?: unknown }).version === 1 &&
			(parsed as { areas?: unknown }).areas !== null &&
			typeof (parsed as { areas?: unknown }).areas === "object" &&
			!Array.isArray((parsed as { areas?: unknown }).areas)
		) {
			return parsed as MaintenanceReviewStore;
		}
	} catch {
		// Ignore malformed state and rebuild from empty.
	}
	return { version: 1, areas: {} };
}

function writeStore(root: string, store: MaintenanceReviewStore): void {
	const path = storePath(root);
	mkdirSync(dirname(path), { recursive: true });
	atomicWriteText(path, `${JSON.stringify(store, null, 2)}\n`);
}

function ageInDays(value: string): number | null {
	const parsed = Date.parse(value);
	if (!Number.isFinite(parsed)) {
		return null;
	}
	return (Date.now() - parsed) / (24 * 60 * 60 * 1000);
}

function selectedAreas(
	area: MaintenanceReviewAreaSelection,
): MaintenanceReviewArea[] {
	return area === "all" ? [...MAINTENANCE_REVIEW_AREAS] : [area];
}

export function readMaintenanceReviewSummary(
	root: string,
): MaintenanceReviewSummary {
	const intervalDays = readReviewIntervalDays(root);
	const store = readStore(root);
	const areas = MAINTENANCE_REVIEW_AREAS.map((area) => {
		const entry = store.areas[area];
		const age = entry?.reviewed_at ? ageInDays(entry.reviewed_at) : null;
		const due = age === null || age >= intervalDays;
		return {
			area,
			due,
			reviewed_at: entry?.reviewed_at ?? null,
			note: entry?.note ?? null,
		};
	});
	return {
		review_interval_days: intervalDays,
		areas,
		due_areas: areas.filter((entry) => entry.due).map((entry) => entry.area),
	};
}

export function recordMaintenanceReview(
	root: string,
	input: {
		area: MaintenanceReviewAreaSelection;
		note?: string;
		dryRun?: boolean;
	},
): MaintenanceReviewRecord {
	const reviewedAreas = selectedAreas(input.area);
	const recordedAt = new Date().toISOString();
	const note = input.note?.trim() || null;
	const dryRun = input.dryRun === true;
	if (!dryRun) {
		const store = readStore(root);
		for (const area of reviewedAreas) {
			store.areas[area] = note
				? { reviewed_at: recordedAt, note }
				: { reviewed_at: recordedAt };
		}
		writeStore(root, store);
	}
	return {
		area: input.area,
		reviewed_areas: reviewedAreas,
		recorded_at: recordedAt,
		note,
		dry_run: dryRun,
		summary: readMaintenanceReviewSummary(root),
	};
}

export function summarizeMaintenanceReviewDue(root: string): {
	intervalDays: number;
	dueAreas: MaintenanceReviewArea[];
} {
	const summary = readMaintenanceReviewSummary(root);
	return {
		intervalDays: summary.review_interval_days,
		dueAreas: summary.due_areas,
	};
}

function collectFiles(root: string, current: string, files: string[]): void {
	if (!existsSync(current)) {
		return;
	}
	for (const entry of readdirSync(current, { withFileTypes: true })) {
		if (EXCLUDED_DIRS.has(entry.name)) {
			continue;
		}
		const absolute = join(current, entry.name);
		if (entry.isDirectory()) {
			collectFiles(root, absolute, files);
			continue;
		}
		if (!entry.isFile()) {
			continue;
		}
		if (!/\.(md|markdown|txt|json|ya?ml)$/i.test(entry.name)) {
			continue;
		}
		files.push(relative(root, absolute).replace(/\\/g, "/"));
	}
}

export function scanLegacyReferences(root: string): {
	count: number;
	files: string[];
	patterns: string[];
} {
	const files: string[] = [];
	const scanRoots = [
		join(root, ".afol", "adm"),
		join(root, "docs"),
		join(root, ".agents", "skills"),
	];
	const seen = new Set<string>();
	for (const scanRoot of scanRoots) {
		collectFiles(root, scanRoot, files);
	}
	const matchedFiles: string[] = [];
	const matchedPatterns = new Set<string>();
	for (const file of files.sort((left, right) => left.localeCompare(right))) {
		if (seen.has(file)) {
			continue;
		}
		seen.add(file);
		const absolute = join(root, file);
		let content = "";
		try {
			content = readFileSync(absolute, "utf8");
		} catch {
			continue;
		}
		let matched = false;
		for (const entry of LEGACY_PATTERNS) {
			if (!entry.pattern.test(content)) {
				continue;
			}
			matchedPatterns.add(entry.label);
			matched = true;
		}
		if (matched) {
			matchedFiles.push(file);
		}
	}
	return {
		count: matchedFiles.length,
		files: matchedFiles,
		patterns: [...matchedPatterns].sort((left, right) =>
			left.localeCompare(right),
		),
	};
}
