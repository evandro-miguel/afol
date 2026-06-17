import type { ProjectBenchmarkGeneratedFile } from "./generate";
import type {
	ProjectBenchmarkAxesFile,
	ProjectBenchmarkProject,
	ProjectBenchmarkRecommendation,
	ProjectBenchmarkScore,
} from "./types";
import type { ProjectBenchmarkValidationResult } from "./validate";

type RenderableProjectBenchmarkRecommendation =
	ProjectBenchmarkRecommendation & {
		risk_flags?: string[];
		risk_level?: "low" | "medium" | "high";
		do_not_copy?: string[];
	};

export function formatProjectBenchmarkList(
	scores: ProjectBenchmarkScore[],
): string {
	return [
		`project-benchmark: ${scores.length} projects`,
		...scores.map(
			(project) =>
				`${project.id.padEnd(18)} overall=${project.overall_score} focused=${project.focused_score} axes=${project.axis_count} category=${project.category} status=${project.status} stale=${project.stale}`,
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
		`overall=${score.overall_score} focused=${score.focused_score} coverage_weight=${score.coverage_weight} category=${project.category} status=${project.status} confidence=${project.confidence} stale=${score.stale}`,
		`axes: ${topAxes || "none"}`,
		`sources: ${project.source_refs.length}`,
		"lessons:",
		...(lessons.length > 0 ? lessons : ["- none"]),
	].join("\n");
}

export function formatProjectBenchmarkMatrix(
	scores: ProjectBenchmarkScore[],
	axis?: string,
): string {
	return [
		axis
			? `project-benchmark matrix: ${scores.length} projects axis=${axis}`
			: `project-benchmark matrix: ${scores.length} projects`,
		...scores.map((project) => {
			const axes = axis
				? `${axis}:${project.axes[axis] ?? 0}`
				: Object.entries(project.axes)
						.map(([axisId, value]) => `${axisId}:${value}`)
						.join(",");
			return `${project.id} overall=${project.overall_score} focused=${project.focused_score} axes=${axes}`;
		}),
	].join("\n");
}

export function formatProjectBenchmarkRecommend(
	axis: string,
	references: ProjectBenchmarkRecommendation[],
	axes: ProjectBenchmarkAxesFile,
): string {
	const recommendations = references
		.map((entry) => entry.lesson)
		.filter((lesson): lesson is string => Boolean(lesson));
	return [
		`axis: ${axis}`,
		`description: ${axes.axes[axis]?.description ?? "unknown"}`,
		"top references:",
		...references.map((reference) => {
			const entry = reference as RenderableProjectBenchmarkRecommendation;
			const warningText =
				entry.warnings.length > 0
					? ` warnings=${entry.warnings.join(",")}`
					: "";
			const riskText = ` risk=${entry.risk_level ?? "unknown"}`;
			const doNotCopyText =
				entry.do_not_copy && entry.do_not_copy.length > 0
					? [`  do_not_copy: ${entry.do_not_copy.join(" | ")}`]
					: [];
			const riskFlagsText =
				entry.risk_flags && entry.risk_flags.length > 0
					? [`  risk_flags: ${entry.risk_flags.join(",")}`]
					: [];
			return [
				`- ${entry.id}: recommendation=${entry.recommendation_score} axis_score=${entry.axis_score} confidence=${entry.confidence} source=${entry.source_access} category=${entry.category} stale=${entry.stale}${riskText}${warningText}${entry.lesson ? ` - ${entry.lesson}` : ""}`,
				...riskFlagsText,
				...doNotCopyText,
			].join("\n");
		}),
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
