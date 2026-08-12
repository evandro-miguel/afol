import { dirname } from "node:path";
import { findProjectBenchmarkMisplacedOutputs } from "./generate";
import {
	PROJECT_BENCHMARK_SCHEMA_VERSION,
	type ProjectBenchmarkCatalog,
	type ProjectBenchmarkIssue,
	type ProjectBenchmarkValidationResult,
} from "./types";

export type { ProjectBenchmarkValidationResult } from "./types";

import {
	type ProjectBenchmarkAxes,
	validateAxisScores,
	validateCollectionProperties,
	validateProjectIdentity,
	validateProjectWarnings,
	validateSimilarities,
	validateSourceRefs,
} from "./validate-project-relations";
import {
	readProjectCollections,
	validateProjectShape,
} from "./validate-project-shape";
import { pushProjectBenchmarkIssue as push } from "./validation-utils";

function validateRuntimeBenchmarkSeparation(
	catalog: ProjectBenchmarkCatalog,
	issues: ProjectBenchmarkIssue[],
): void {
	const projectRoot = dirname(dirname(dirname(catalog.paths.admDir)));
	for (const file of findProjectBenchmarkMisplacedOutputs(projectRoot, {
		catalogDir: catalog.paths.admDir,
		runtimeBenchmarkCatalogDir: catalog.paths.runtimeBenchmarkCatalogDir,
	})) {
		push(
			issues,
			"error",
			"runtime-benchmark-catalog-contamination",
			file.path,
			"project-benchmark generated output cannot live outside .afol/data/project-benchmarks",
		);
	}
}

function validateAxesFile(
	catalog: ProjectBenchmarkCatalog,
	issues: ProjectBenchmarkIssue[],
): ProjectBenchmarkAxes {
	const axes = catalog.axes?.axes ?? {};
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
	return axes;
}

export function validateProjectBenchmarkCatalog(
	catalog: ProjectBenchmarkCatalog,
	now = new Date(),
): ProjectBenchmarkValidationResult {
	const issues: ProjectBenchmarkIssue[] = [...catalog.loadIssues];
	const axes = validateAxesFile(catalog, issues);
	const seenIds = new Map<string, string>();

	for (const entry of catalog.projects) {
		const { file, fileNameId, project } = entry;
		const projectRecord = validateProjectShape(project, file, issues);
		if (!projectRecord) {
			continue;
		}
		const collections = readProjectCollections(projectRecord);
		const projectId =
			typeof projectRecord.id === "string" ? projectRecord.id : null;
		validateProjectIdentity(projectId, fileNameId, file, seenIds, issues);
		const refs = validateSourceRefs(collections.sourceRefs, axes, file, issues);
		validateAxisScores(collections.similarityAxes, axes, refs, file, issues);
		validateSimilarities(
			collections.similarities,
			axes,
			refs.sourceIds,
			file,
			issues,
		);
		validateCollectionProperties(collections, axes, file, issues);
		validateProjectWarnings(projectRecord, file, now, issues);
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
