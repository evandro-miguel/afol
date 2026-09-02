import {
	PROJECT_ID_PATTERN,
	validateProjectBenchmarkProjectSchema,
} from "./schema";
import {
	PROJECT_BENCHMARK_SCHEMA_VERSION,
	type ProjectBenchmarkIssue,
} from "./types";
import {
	hasDateShape,
	isRecord,
	pushProjectBenchmarkIssue as push,
	pushUnexpectedProperties,
	validateEnum,
} from "./validation-utils";

export type ProjectBenchmarkProjectRecord = Record<string, unknown> & {
	schema_version?: unknown;
	id?: unknown;
	name?: unknown;
	category?: unknown;
	status?: unknown;
	source_access?: unknown;
	last_reviewed_at?: unknown;
	stale_after_days?: unknown;
	confidence?: unknown;
	similarity_axes?: unknown;
	similarities?: unknown;
	differences?: unknown;
	lessons_for_afol?: unknown;
	do_not_copy?: unknown;
	source_refs?: unknown;
};

export type ProjectBenchmarkCollections = {
	sourceRefs: unknown[];
	similarityAxes: Record<string, unknown>;
	similarities: unknown[];
	differences: unknown[];
	lessons: unknown[];
	doNotCopy: unknown[];
};

const PROJECT_KEYS = [
	"schema_version",
	"id",
	"name",
	"category",
	"status",
	"source_access",
	"last_reviewed_at",
	"stale_after_days",
	"confidence",
	"similarity_axes",
	"similarities",
	"differences",
	"lessons_for_afol",
	"do_not_copy",
	"source_refs",
] as const;

export function validateProjectShape(
	project: unknown,
	file: string,
	issues: ProjectBenchmarkIssue[],
): ProjectBenchmarkProjectRecord | null {
	const startingIssueCount = issues.length;
	if (!isRecord(project)) {
		push(issues, "error", "invalid-project", file, "Project must be an object");
		return null;
	}
	pushUnexpectedProperties(
		issues,
		file,
		project,
		PROJECT_KEYS,
		"unexpected-project-property",
		"project",
	);
	if (project.schema_version !== PROJECT_BENCHMARK_SCHEMA_VERSION) {
		push(
			issues,
			"error",
			"missing-schema-version",
			file,
			"Missing or invalid schema_version",
		);
	}
	if (!project.id || typeof project.id !== "string") {
		push(issues, "error", "missing-id", file, "Missing project id");
	} else if (!PROJECT_ID_PATTERN.test(project.id)) {
		push(
			issues,
			"error",
			"invalid-id-format",
			file,
			`Invalid project id format: ${project.id}`,
		);
	}
	if (!project.name || typeof project.name !== "string") {
		push(issues, "error", "missing-name", file, "Missing project name");
	}
	validateEnum(
		issues,
		project.category,
		["direct_comparable", "protocol_reference", "adjacent_reference"],
		"invalid-category",
		file,
		"category",
	);
	validateEnum(
		issues,
		project.status,
		["active", "paused", "archived"],
		"invalid-status",
		file,
		"status",
	);
	validateEnum(
		issues,
		project.source_access,
		["open_source", "official_docs", "docs_only", "closed_source"],
		"invalid-source-access",
		file,
		"source_access",
	);
	validateEnum(
		issues,
		project.confidence,
		["low", "medium", "high"],
		"invalid-confidence",
		file,
		"confidence",
	);
	if (!hasDateShape(project.last_reviewed_at)) {
		push(
			issues,
			"error",
			"invalid-last-reviewed-at",
			file,
			"Invalid last_reviewed_at date",
		);
	}
	const staleAfterDays = project.stale_after_days;
	if (
		typeof staleAfterDays !== "number" ||
		!Number.isInteger(staleAfterDays) ||
		staleAfterDays < 1
	) {
		push(
			issues,
			"error",
			"invalid-stale-after-days",
			file,
			"stale_after_days must be a positive integer",
		);
	}
	if (!isRecord(project.similarity_axes)) {
		push(
			issues,
			"error",
			"missing-similarity-axes",
			file,
			"Missing similarity_axes object",
		);
	} else if (Object.keys(project.similarity_axes).length === 0) {
		push(
			issues,
			"error",
			"empty-similarity-axes",
			file,
			"similarity_axes must include at least one axis",
		);
	}
	if (!Array.isArray(project.source_refs) || project.source_refs.length === 0) {
		push(
			issues,
			"error",
			"missing-source-refs",
			file,
			"Project must include source_refs",
		);
	}
	if (
		!Array.isArray(project.similarities) ||
		project.similarities.length === 0
	) {
		push(
			issues,
			"error",
			"missing-similarities",
			file,
			"Project must include at least one similarity",
		);
	}
	if (!Array.isArray(project.differences) || project.differences.length === 0) {
		push(
			issues,
			"error",
			"missing-differences",
			file,
			"Project must include at least one difference",
		);
	}
	if (
		!Array.isArray(project.lessons_for_afol) ||
		project.lessons_for_afol.length === 0
	) {
		push(
			issues,
			"error",
			"missing-lessons",
			file,
			"Project must include lessons_for_afol",
		);
	}
	if (!Array.isArray(project.do_not_copy) || project.do_not_copy.length === 0) {
		push(
			issues,
			"error",
			"missing-do-not-copy",
			file,
			"Project must include do_not_copy",
		);
	}
	const schemaResult = validateProjectBenchmarkProjectSchema(project);
	if (!schemaResult.success && issues.length === startingIssueCount) {
		push(
			issues,
			"error",
			"invalid-project-schema",
			file,
			"Project does not match project-benchmark schema",
		);
	}
	return project;
}

export function readProjectCollections(
	project: ProjectBenchmarkProjectRecord,
): ProjectBenchmarkCollections {
	return {
		sourceRefs: Array.isArray(project.source_refs) ? project.source_refs : [],
		similarityAxes: isRecord(project.similarity_axes)
			? project.similarity_axes
			: {},
		similarities: Array.isArray(project.similarities)
			? project.similarities
			: [],
		differences: Array.isArray(project.differences) ? project.differences : [],
		lessons: Array.isArray(project.lessons_for_afol)
			? project.lessons_for_afol
			: [],
		doNotCopy: Array.isArray(project.do_not_copy) ? project.do_not_copy : [],
	};
}
