import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isProjectBenchmarkStale } from "./scoring";
import {
	PROJECT_BENCHMARK_SCHEMA_VERSION,
	type ProjectBenchmarkCatalog,
	type ProjectBenchmarkIssue,
	type ProjectBenchmarkProject,
} from "./types";

export type ProjectBenchmarkValidationResult = {
	ok: boolean;
	issues: ProjectBenchmarkIssue[];
	error_count: number;
	warning_count: number;
	project_count: number;
};

const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
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
const AXIS_SCORE_KEYS = ["score", "evidence_refs"] as const;
const SIMILARITY_KEYS = ["axis", "claim", "evidence_refs"] as const;
const DIFFERENCE_KEYS = ["claim"] as const;
const LESSON_KEYS = ["axis", "lesson"] as const;
const DO_NOT_COPY_KEYS = ["reason"] as const;
const SOURCE_REF_KEYS = [
	"id",
	"title",
	"url",
	"source_type",
	"claim",
	"axes",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function push(
	issues: ProjectBenchmarkIssue[],
	severity: ProjectBenchmarkIssue["severity"],
	code: string,
	file: string,
	message: string,
): void {
	issues.push({ severity, code, file, message });
}

function hasDateShape(value: unknown): boolean {
	if (typeof value !== "string") {
		return false;
	}
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) {
		return false;
	}
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(Date.UTC(year, month - 1, day));
	return (
		date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
	);
}

function hasAbsoluteUriShape(value: unknown): boolean {
	if (typeof value !== "string" || value.length === 0) {
		return false;
	}
	try {
		const url = new URL(value);
		return url.protocol.length > 0;
	} catch {
		return false;
	}
}

function pushUnexpectedProperties(
	issues: ProjectBenchmarkIssue[],
	file: string,
	record: Record<string, unknown>,
	allowed: readonly string[],
	code: string,
	label: string,
): void {
	const allowedKeys = new Set<string>(allowed);
	for (const key of Object.keys(record)) {
		if (!allowedKeys.has(key)) {
			push(issues, "error", code, file, `Unexpected ${label} property: ${key}`);
		}
	}
}

function validateEnum(
	issues: ProjectBenchmarkIssue[],
	value: unknown,
	allowed: readonly string[],
	code: string,
	file: string,
	field: string,
): void {
	if (typeof value !== "string" || !allowed.includes(value)) {
		push(
			issues,
			"error",
			code,
			file,
			`Invalid ${field}: ${String(value ?? "missing")}`,
		);
	}
}

function validateProjectShape(
	project: unknown,
	file: string,
	issues: ProjectBenchmarkIssue[],
): Record<string, unknown> | null {
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
	return project;
}

function hasProjectBenchmarkGeneratedMarker(path: string): boolean {
	if (!path.endsWith(".json")) {
		return false;
	}
	try {
		const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
		if (!isRecord(value)) {
			return false;
		}
		return (
			value.generated_by === "afol pb generate" ||
			(typeof value.command === "string" &&
				value.command.startsWith("project-benchmark."))
		);
	} catch {
		return false;
	}
}

function validateRuntimeBenchmarkSeparation(
	catalog: ProjectBenchmarkCatalog,
	issues: ProjectBenchmarkIssue[],
): void {
	const runtimeDir = catalog.paths.runtimeBenchmarkCatalogDir;
	if (!existsSync(runtimeDir)) {
		return;
	}
	const scan = (dir: string, relativeParts: string[]): void => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const entryPath = join(dir, entry.name);
			const relativePath = join(
				".afol/data/benchmarks/catalog",
				...relativeParts,
				entry.name,
			);
			const looksLikeProjectBenchmark =
				/^project-benchmarks?(\.json)?$/.test(entry.name) ||
				hasProjectBenchmarkGeneratedMarker(entryPath);
			if (looksLikeProjectBenchmark) {
				push(
					issues,
					"error",
					"runtime-benchmark-catalog-contamination",
					relativePath,
					"project-benchmark data cannot live under runtime benchmark catalog",
				);
			}
			if (entry.isDirectory()) {
				scan(entryPath, [...relativeParts, entry.name]);
			}
		}
	};
	scan(runtimeDir, []);
}

function validateSourceRefEnums(
	sourceRefs: unknown[],
	file: string,
	issues: ProjectBenchmarkIssue[],
): void {
	for (const source of sourceRefs) {
		if (!isRecord(source)) {
			continue;
		}
		validateEnum(
			issues,
			source.source_type,
			["official_doc", "official_repo", "spec", "paper", "article"],
			"invalid-source-type",
			file,
			`source_type for source_ref ${
				typeof source.id === "string" ? source.id : "unknown"
			}`,
		);
	}
}

function readSupportedAxes(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter(
		(axis): axis is string => typeof axis === "string" && axis.length > 0,
	);
}

export function validateProjectBenchmarkCatalog(
	catalog: ProjectBenchmarkCatalog,
	now = new Date(),
): ProjectBenchmarkValidationResult {
	const issues: ProjectBenchmarkIssue[] = [...catalog.loadIssues];
	const axes = catalog.axes?.axes ?? {};
	const seenIds = new Map<string, string>();

	if (catalog.axes?.schema_version !== PROJECT_BENCHMARK_SCHEMA_VERSION) {
		push(
			issues,
			"error",
			"invalid-axes-schema-version",
			"axes.json",
			"Missing or invalid axes schema_version",
		);
	}

	for (const [axisId, axis] of Object.entries(axes)) {
		if (!Number.isFinite(axis.weight) || axis.weight <= 0) {
			push(
				issues,
				"error",
				"invalid-axis-weight",
				"axes.json",
				`Invalid weight for axis: ${axisId}`,
			);
		}
		if (!axis.description) {
			push(
				issues,
				"error",
				"missing-axis-description",
				"axes.json",
				`Missing description for axis: ${axisId}`,
			);
		}
	}

	for (const entry of catalog.projects) {
		const { file, fileNameId, project } = entry;
		const projectRecord = validateProjectShape(project, file, issues);
		if (!projectRecord) {
			continue;
		}
		const projectId =
			typeof projectRecord.id === "string" ? projectRecord.id : null;
		const projectSourceRefs = Array.isArray(projectRecord.source_refs)
			? projectRecord.source_refs
			: [];
		const projectSimilarityAxes = isRecord(projectRecord.similarity_axes)
			? projectRecord.similarity_axes
			: {};
		const projectSimilarities = Array.isArray(projectRecord.similarities)
			? projectRecord.similarities
			: [];
		const projectDifferences = Array.isArray(projectRecord.differences)
			? projectRecord.differences
			: [];
		const projectLessons = Array.isArray(projectRecord.lessons_for_afol)
			? projectRecord.lessons_for_afol
			: [];
		const projectDoNotCopy = Array.isArray(projectRecord.do_not_copy)
			? projectRecord.do_not_copy
			: [];

		if (projectId !== null && projectId !== fileNameId) {
			push(
				issues,
				"error",
				"id-filename-mismatch",
				file,
				`Project id does not match filename: ${projectId} != ${fileNameId}`,
			);
		}
		const duplicate = projectId === null ? undefined : seenIds.get(projectId);
		if (duplicate) {
			push(
				issues,
				"error",
				"duplicate-id",
				file,
				`Duplicate project id: ${projectId}; first seen in ${duplicate}`,
			);
		} else if (projectId !== null) {
			seenIds.set(projectId, file);
		}

		const sourceIds = new Set<string>();
		const sourceAxes = new Map<string, Set<string>>();
		validateSourceRefEnums(projectSourceRefs, file, issues);
		for (const sourceValue of projectSourceRefs) {
			if (!isRecord(sourceValue)) {
				push(
					issues,
					"error",
					"invalid-source-ref",
					file,
					"Invalid source_ref: unknown",
				);
				continue;
			}
			pushUnexpectedProperties(
				issues,
				file,
				sourceValue,
				SOURCE_REF_KEYS,
				"unexpected-source-ref-property",
				"source_ref",
			);
			const sourceId =
				typeof sourceValue.id === "string" ? sourceValue.id : "unknown";
			if (
				!sourceValue.id ||
				!sourceValue.title ||
				!sourceValue.url ||
				!sourceValue.source_type
			) {
				push(
					issues,
					"error",
					"invalid-source-ref",
					file,
					`Invalid source_ref: ${sourceId}`,
				);
			}
			if (sourceValue.url && !hasAbsoluteUriShape(sourceValue.url)) {
				push(
					issues,
					"error",
					"invalid-source-url",
					file,
					`Invalid source_ref url: ${sourceId}`,
				);
			}
			if (!sourceValue.claim) {
				push(
					issues,
					"error",
					"missing-source-claim",
					file,
					`source_ref missing claim: ${sourceId}`,
				);
			}
			const supportedAxes = readSupportedAxes(sourceValue.axes);
			if (supportedAxes.length === 0) {
				push(
					issues,
					"error",
					"missing-source-ref-axes",
					file,
					`source_ref missing axes: ${sourceId}`,
				);
			}
			for (const supportedAxis of supportedAxes) {
				if (!axes[supportedAxis]) {
					push(
						issues,
						"error",
						"unknown-source-ref-axis",
						file,
						`Unknown source_ref axis for ${sourceId}: ${supportedAxis}`,
					);
				}
			}
			if (typeof sourceValue.id === "string" && sourceValue.id.length > 0) {
				if (sourceIds.has(sourceValue.id)) {
					push(
						issues,
						"error",
						"duplicate-source-ref-id",
						file,
						`Duplicate source_ref id: ${sourceValue.id}`,
					);
				} else {
					sourceIds.add(sourceValue.id);
					sourceAxes.set(sourceValue.id, new Set(supportedAxes));
				}
			}
		}

		for (const [axisId, axisScoreValue] of Object.entries(
			projectSimilarityAxes,
		)) {
			if (!axes[axisId]) {
				push(issues, "error", "unknown-axis", file, `Unknown axis: ${axisId}`);
			}
			const axisScore = isRecord(axisScoreValue) ? axisScoreValue : {};
			if (isRecord(axisScoreValue)) {
				pushUnexpectedProperties(
					issues,
					file,
					axisScoreValue,
					AXIS_SCORE_KEYS,
					"unexpected-axis-score-property",
					"similarity_axes entry",
				);
			}
			const score = axisScore.score;
			if (
				typeof score !== "number" ||
				!Number.isInteger(score) ||
				score < 0 ||
				score > 5
			) {
				push(
					issues,
					"error",
					"invalid-score",
					file,
					`Score out of range for axis: ${axisId}`,
				);
			}
			const evidenceRefs = Array.isArray(axisScore.evidence_refs)
				? axisScore.evidence_refs
				: [];
			if (
				!Array.isArray(axisScore.evidence_refs) ||
				evidenceRefs.length === 0
			) {
				push(
					issues,
					"error",
					"score-without-evidence",
					file,
					`Score without evidence_refs for axis: ${axisId}`,
				);
			}
			for (const ref of evidenceRefs) {
				if (typeof ref !== "string" || !sourceIds.has(ref)) {
					push(
						issues,
						"error",
						"unknown-evidence-ref",
						file,
						`Unknown evidence ref for axis ${axisId}: ${String(ref)}`,
					);
					continue;
				}
				if (!sourceAxes.get(ref)?.has(axisId)) {
					push(
						issues,
						"error",
						"unsupported-evidence-axis",
						file,
						`Evidence ref ${ref} does not support axis ${axisId}`,
					);
				}
			}
		}

		for (const similarityValue of projectSimilarities) {
			const similarity = isRecord(similarityValue) ? similarityValue : {};
			if (isRecord(similarityValue)) {
				pushUnexpectedProperties(
					issues,
					file,
					similarityValue,
					SIMILARITY_KEYS,
					"unexpected-similarity-property",
					"similarity",
				);
			}
			const similarityAxis = similarity.axis;
			if (typeof similarityAxis !== "string" || similarityAxis.length === 0) {
				push(
					issues,
					"error",
					"similarity-without-axis",
					file,
					"Similarity missing axis",
				);
			} else if (!axes[similarityAxis]) {
				push(
					issues,
					"error",
					"unknown-axis",
					file,
					`Unknown similarity axis: ${similarityAxis}`,
				);
			}
			const evidenceRefs = Array.isArray(similarity.evidence_refs)
				? similarity.evidence_refs
				: [];
			if (
				!Array.isArray(similarity.evidence_refs) ||
				evidenceRefs.length === 0
			) {
				push(
					issues,
					"error",
					"similarity-without-evidence",
					file,
					"Similarity missing evidence_refs",
				);
			}
			for (const ref of evidenceRefs) {
				if (typeof ref !== "string" || !sourceIds.has(ref)) {
					push(
						issues,
						"error",
						"unknown-evidence-ref",
						file,
						`Unknown similarity evidence ref: ${String(ref)}`,
					);
				}
			}
		}

		for (const differenceValue of projectDifferences) {
			if (!isRecord(differenceValue)) {
				continue;
			}
			pushUnexpectedProperties(
				issues,
				file,
				differenceValue,
				DIFFERENCE_KEYS,
				"unexpected-difference-property",
				"difference",
			);
		}

		for (const lessonValue of projectLessons) {
			const lesson = isRecord(lessonValue) ? lessonValue : {};
			if (isRecord(lessonValue)) {
				pushUnexpectedProperties(
					issues,
					file,
					lessonValue,
					LESSON_KEYS,
					"unexpected-lesson-property",
					"lesson",
				);
			}
			const lessonAxis = lesson.axis;
			if (typeof lessonAxis !== "string" || lessonAxis.length === 0) {
				push(
					issues,
					"error",
					"lesson-without-axis",
					file,
					"Lesson missing axis",
				);
			} else if (!axes[lessonAxis]) {
				push(
					issues,
					"error",
					"unknown-axis",
					file,
					`Unknown lesson axis: ${lessonAxis}`,
				);
			}
		}

		for (const itemValue of projectDoNotCopy) {
			if (!isRecord(itemValue)) {
				continue;
			}
			pushUnexpectedProperties(
				issues,
				file,
				itemValue,
				DO_NOT_COPY_KEYS,
				"unexpected-do-not-copy-property",
				"do_not_copy",
			);
		}

		if (
			projectRecord.source_access === "docs_only" &&
			projectRecord.confidence === "high"
		) {
			push(
				issues,
				"warning",
				"docs-only-high-confidence",
				file,
				"docs_only source access should not claim high confidence without stronger evidence",
			);
		}
		if (
			projectRecord.source_access === "closed_source" &&
			projectRecord.confidence === "high"
		) {
			push(
				issues,
				"warning",
				"closed-source-high-confidence",
				file,
				"closed_source project should not claim high confidence without stronger evidence",
			);
		}
		if (
			projectRecord.status === "active" &&
			typeof projectRecord.last_reviewed_at === "string" &&
			Number.isInteger(projectRecord.stale_after_days) &&
			hasDateShape(projectRecord.last_reviewed_at) &&
			isProjectBenchmarkStale(
				{
					last_reviewed_at: projectRecord.last_reviewed_at,
					stale_after_days: projectRecord.stale_after_days,
					status: projectRecord.status,
				} as ProjectBenchmarkProject,
				now,
			)
		) {
			push(
				issues,
				"warning",
				"stale-review",
				file,
				`Active project review is stale: ${projectRecord.last_reviewed_at}`,
			);
		}
	}

	validateRuntimeBenchmarkSeparation(catalog, issues);

	const error_count = issues.filter(
		(issue) => issue.severity === "error",
	).length;
	const warning_count = issues.filter(
		(issue) => issue.severity === "warning",
	).length;
	return {
		ok: error_count === 0,
		issues,
		error_count,
		warning_count,
		project_count: catalog.projects.length,
	};
}
