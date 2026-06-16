import type { ProjectBenchmarkGeneratedFile } from "./generate";
import type {
	ProjectBenchmarkAxesFile,
	ProjectBenchmarkProject,
	ProjectBenchmarkScore,
} from "./types";
import type { ProjectBenchmarkValidationResult } from "./validate";

export function formatProjectBenchmarkList(
	scores: ProjectBenchmarkScore[],
): string {
	return [
		`project-benchmark: ${scores.length} projects`,
		...scores.map(
			(project) =>
				`${project.id.padEnd(18)} score=${project.score} category=${project.category} status=${project.status} stale=${project.stale}`,
		),
	].join("\n");
}

export function formatProjectBenchmarkShow(
	project: ProjectBenchmarkProject,
	score: ProjectBenchmarkScore,
): string {
	const topAxes = Object.entries(score.axes)
		.sort((left, right) => right[1] - left[1])
		.slice(0, 4)
		.map(([axis, value]) => `${axis}=${value}`)
		.join(", ");
	const lessons = project.lessons_for_afol
		.slice(0, 2)
		.map((lesson) => `- ${lesson.axis}: ${lesson.lesson}`);
	return [
		`${project.id}: ${project.name}`,
		`score=${score.score} category=${project.category} status=${project.status} confidence=${project.confidence} stale=${score.stale}`,
		`axes: ${topAxes || "none"}`,
		`sources: ${project.source_refs.length}`,
		"lessons:",
		...(lessons.length > 0 ? lessons : ["- none"]),
	].join("\n");
}

export function formatProjectBenchmarkMatrix(
	scores: ProjectBenchmarkScore[],
): string {
	return [
		`project-benchmark matrix: ${scores.length} projects`,
		...scores.map((project) => {
			const axes = Object.entries(project.axes)
				.map(([axis, value]) => `${axis}:${value}`)
				.join(",");
			return `${project.id} score=${project.score} axes=${axes}`;
		}),
	].join("\n");
}

export function formatProjectBenchmarkRecommend(
	axis: string,
	projects: ProjectBenchmarkProject[],
	axes: ProjectBenchmarkAxesFile,
): string {
	const references = projects
		.map((project) => ({
			project,
			score: project.similarity_axes[axis]?.score ?? 0,
			lesson: project.lessons_for_afol.find((entry) => entry.axis === axis)
				?.lesson,
		}))
		.filter((entry) => entry.score > 0)
		.sort(
			(left, right) =>
				right.score - left.score ||
				left.project.id.localeCompare(right.project.id),
		)
		.slice(0, 5);
	const recommendations = references
		.map((entry) => entry.lesson)
		.filter((lesson): lesson is string => Boolean(lesson));
	return [
		`axis: ${axis}`,
		`description: ${axes.axes[axis]?.description ?? "unknown"}`,
		"top references:",
		...references.map(
			(entry) =>
				`- ${entry.project.id}: score=${entry.score}${entry.lesson ? ` - ${entry.lesson}` : ""}`,
		),
		"recommendations:",
		...(recommendations.length > 0
			? recommendations.slice(0, 5).map((lesson) => `- ${lesson}`)
			: ["- none"]),
	].join("\n");
}

export function formatProjectBenchmarkValidation(
	result: ProjectBenchmarkValidationResult,
): string {
	if (result.ok) {
		return `project-benchmark validate: ok projects=${result.project_count} warnings=${result.warning_count}`;
	}
	return [
		`project-benchmark validate: failed errors=${result.error_count} warnings=${result.warning_count}`,
		...result.issues
			.filter((issue) => issue.severity === "error")
			.slice(0, 12)
			.map(
				(issue) =>
					`${issue.severity} ${issue.code} ${issue.file}: ${issue.message}`,
			),
	].join("\n");
}

export function formatProjectBenchmarkGeneration(
	projectCount: number,
	files: ProjectBenchmarkGeneratedFile[],
): string {
	return [
		`project-benchmark generate: ok projects=${projectCount} files=${files.length}`,
		...files.map((file) => `${file.kind}: ${file.path}`),
	].join("\n");
}
