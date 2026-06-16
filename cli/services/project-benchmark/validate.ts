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

function hasDateShape(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return false;
	}
	const timestamp = Date.parse(`${value}T00:00:00.000Z`);
	return !Number.isNaN(timestamp);
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
	project: ProjectBenchmarkProject,
	file: string,
	issues: ProjectBenchmarkIssue[],
): void {
	const record = project as unknown;
	if (!isRecord(record)) {
		push(issues, "error", "invalid-project", file, "Project must be an object");
		return;
	}
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
	if (
		!Number.isInteger(project.stale_after_days) ||
		project.stale_after_days < 1
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
	project: ProjectBenchmarkProject,
	file: string,
	issues: ProjectBenchmarkIssue[],
): void {
	for (const source of project.source_refs ?? []) {
		validateEnum(
			issues,
			source.source_type,
			["official_doc", "official_repo", "spec", "paper", "article"],
			"invalid-source-type",
			file,
			`source_type for source_ref ${source.id ?? "unknown"}`,
		);
	}
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
		validateProjectShape(project, file, issues);

		if (project.id !== fileNameId) {
			push(
				issues,
				"error",
				"id-filename-mismatch",
				file,
				`Project id does not match filename: ${project.id} != ${fileNameId}`,
			);
		}
		const duplicate = seenIds.get(project.id);
		if (duplicate) {
			push(
				issues,
				"error",
				"duplicate-id",
				file,
				`Duplicate project id: ${project.id}; first seen in ${duplicate}`,
			);
		} else if (project.id) {
			seenIds.set(project.id, file);
		}

		const sourceIds = new Set(
			(project.source_refs ?? []).map((source) => source.id),
		);
		validateSourceRefEnums(project, file, issues);
		for (const source of project.source_refs ?? []) {
			if (!source.id || !source.title || !source.url || !source.source_type) {
				push(
					issues,
					"error",
					"invalid-source-ref",
					file,
					`Invalid source_ref: ${source.id ?? "unknown"}`,
				);
			}
			if (!source.claim) {
				push(
					issues,
					"error",
					"missing-source-claim",
					file,
					`source_ref missing claim: ${source.id ?? "unknown"}`,
				);
			}
		}

		for (const [axisId, axisScore] of Object.entries(
			project.similarity_axes ?? {},
		)) {
			if (!axes[axisId]) {
				push(issues, "error", "unknown-axis", file, `Unknown axis: ${axisId}`);
			}
			if (
				!Number.isInteger(axisScore.score) ||
				axisScore.score < 0 ||
				axisScore.score > 5
			) {
				push(
					issues,
					"error",
					"invalid-score",
					file,
					`Score out of range for axis: ${axisId}`,
				);
			}
			if (
				!Array.isArray(axisScore.evidence_refs) ||
				axisScore.evidence_refs.length === 0
			) {
				push(
					issues,
					"error",
					"score-without-evidence",
					file,
					`Score without evidence_refs for axis: ${axisId}`,
				);
			}
			for (const ref of axisScore.evidence_refs ?? []) {
				if (!sourceIds.has(ref)) {
					push(
						issues,
						"error",
						"unknown-evidence-ref",
						file,
						`Unknown evidence ref for axis ${axisId}: ${ref}`,
					);
				}
			}
		}

		for (const similarity of project.similarities ?? []) {
			if (!similarity.axis) {
				push(
					issues,
					"error",
					"similarity-without-axis",
					file,
					"Similarity missing axis",
				);
			} else if (!axes[similarity.axis]) {
				push(
					issues,
					"error",
					"unknown-axis",
					file,
					`Unknown similarity axis: ${similarity.axis}`,
				);
			}
			if (
				!Array.isArray(similarity.evidence_refs) ||
				similarity.evidence_refs.length === 0
			) {
				push(
					issues,
					"error",
					"similarity-without-evidence",
					file,
					"Similarity missing evidence_refs",
				);
			}
			for (const ref of similarity.evidence_refs ?? []) {
				if (!sourceIds.has(ref)) {
					push(
						issues,
						"error",
						"unknown-evidence-ref",
						file,
						`Unknown similarity evidence ref: ${ref}`,
					);
				}
			}
		}

		for (const lesson of project.lessons_for_afol ?? []) {
			if (!lesson.axis) {
				push(
					issues,
					"error",
					"lesson-without-axis",
					file,
					"Lesson missing axis",
				);
			} else if (!axes[lesson.axis]) {
				push(
					issues,
					"error",
					"unknown-axis",
					file,
					`Unknown lesson axis: ${lesson.axis}`,
				);
			}
		}

		if (
			project.source_access === "docs_only" &&
			project.confidence === "high"
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
			project.source_access === "closed_source" &&
			project.confidence === "high"
		) {
			push(
				issues,
				"warning",
				"closed-source-high-confidence",
				file,
				"closed_source project should not claim high confidence without stronger evidence",
			);
		}
		if (project.status === "active" && isProjectBenchmarkStale(project, now)) {
			push(
				issues,
				"warning",
				"stale-review",
				file,
				`Active project review is stale: ${project.last_reviewed_at}`,
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
