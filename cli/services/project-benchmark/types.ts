export const PROJECT_BENCHMARK_SCHEMA_VERSION = "1.0.0";

export type ProjectBenchmarkAxis = {
	weight: number;
	description: string;
};

export type ProjectBenchmarkAxesFile = {
	schema_version: string;
	axes: Record<string, ProjectBenchmarkAxis>;
};

export type ProjectBenchmarkSourceRef = {
	id: string;
	title: string;
	url: string;
	source_type: "official_doc" | "official_repo" | "spec" | "paper" | "article";
	claim: string;
	axes: string[];
};

export type ProjectBenchmarkAxisScore = {
	score: number;
	evidence_refs: string[];
};

export type ProjectBenchmarkSimilarity = {
	axis: string;
	claim: string;
	evidence_refs: string[];
};

export type ProjectBenchmarkDifference = {
	claim: string;
};

export type ProjectBenchmarkLesson = {
	axis: string;
	lesson: string;
};

export type ProjectBenchmarkDoNotCopy = {
	reason: string;
};

export type ProjectBenchmarkProject = {
	schema_version: string;
	id: string;
	name: string;
	category: "direct_comparable" | "protocol_reference" | "adjacent_reference";
	status: "active" | "paused" | "archived";
	source_access:
		| "open_source"
		| "official_docs"
		| "docs_only"
		| "closed_source";
	last_reviewed_at: string;
	stale_after_days: number;
	confidence: "low" | "medium" | "high";
	similarity_axes: Record<string, ProjectBenchmarkAxisScore>;
	similarities: ProjectBenchmarkSimilarity[];
	differences: ProjectBenchmarkDifference[];
	lessons_for_afol: ProjectBenchmarkLesson[];
	do_not_copy: ProjectBenchmarkDoNotCopy[];
	source_refs: ProjectBenchmarkSourceRef[];
};

export type ProjectBenchmarkIssue = {
	severity: "error" | "warning";
	code: string;
	file: string;
	message: string;
};

export type ProjectBenchmarkValidationResult = {
	ok: boolean;
	issues: ProjectBenchmarkIssue[];
	error_count: number;
	warning_count: number;
	project_count: number;
};

export type ProjectBenchmarkPaths = {
	admDir: string;
	axesFile: string;
	schemaFile: string;
	projectsDir: string;
	dataDir: string;
	runtimeBenchmarkCatalogDir: string;
};

export type ProjectBenchmarkCatalog = {
	source: "project" | "builtin";
	paths: ProjectBenchmarkPaths;
	axes: ProjectBenchmarkAxesFile | null;
	projects: Array<{
		file: string;
		fileNameId: string;
		project: ProjectBenchmarkProject;
	}>;
	loadIssues: ProjectBenchmarkIssue[];
};

export type ProjectBenchmarkScore = {
	id: string;
	name: string;
	category: string;
	status: string;
	confidence: string;
	score: number;
	overall_score: number;
	focused_score: number;
	coverage_weight: number;
	stale: boolean;
	axis_count: number;
	axes: Record<string, number>;
};

export type ProjectBenchmarkRecommendation = {
	id: string;
	name: string;
	axis_score: number;
	recommendation_score: number;
	confidence: ProjectBenchmarkProject["confidence"];
	source_access: ProjectBenchmarkProject["source_access"];
	category: ProjectBenchmarkProject["category"];
	stale: boolean;
	warnings: string[];
	lesson: string | null;
};
