import {
	compareProjectBenchmarkScores,
	scoreProjectBenchmark,
} from "./scoring";
import type {
	ProjectBenchmarkAxesFile,
	ProjectBenchmarkProject,
	ProjectBenchmarkScore,
} from "./types";

export type ProjectBenchmarkMatrix = {
	schema_version: "1.0.0";
	generated_by: "afol pb matrix";
	projects: ProjectBenchmarkScore[];
};

export function buildProjectBenchmarkMatrix(
	projects: ProjectBenchmarkProject[],
	axes: ProjectBenchmarkAxesFile,
	now = new Date(),
): ProjectBenchmarkMatrix {
	return {
		schema_version: "1.0.0",
		generated_by: "afol pb matrix",
		projects: projects
			.map((project) => scoreProjectBenchmark(project, axes, now))
			.sort(compareProjectBenchmarkScores),
	};
}
