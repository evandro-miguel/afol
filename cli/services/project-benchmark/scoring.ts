import type {
	ProjectBenchmarkAxesFile,
	ProjectBenchmarkProject,
	ProjectBenchmarkScore,
} from "./types";

export function isProjectBenchmarkStale(
	project: ProjectBenchmarkProject,
	now = new Date(),
): boolean {
	const reviewedAt = Date.parse(`${project.last_reviewed_at}T00:00:00.000Z`);
	if (Number.isNaN(reviewedAt)) {
		return false;
	}
	const ageMs = now.getTime() - reviewedAt;
	const staleAfterMs = project.stale_after_days * 24 * 60 * 60 * 1000;
	return ageMs > staleAfterMs;
}

export function scoreProjectBenchmark(
	project: ProjectBenchmarkProject,
	axes: ProjectBenchmarkAxesFile,
	now = new Date(),
): ProjectBenchmarkScore {
	let weighted = 0;
	let max = 0;
	const axisScores: Record<string, number> = {};

	for (const [axisId, axisScore] of Object.entries(project.similarity_axes)) {
		const axis = axes.axes[axisId];
		if (!axis || axisScore.evidence_refs.length === 0) {
			continue;
		}
		weighted += axisScore.score * axis.weight;
		max += 5 * axis.weight;
		axisScores[axisId] = axisScore.score;
	}

	return {
		id: project.id,
		name: project.name,
		category: project.category,
		status: project.status,
		confidence: project.confidence,
		score: max > 0 ? Math.round((weighted / max) * 100) : 0,
		stale: isProjectBenchmarkStale(project, now),
		axis_count: Object.keys(axisScores).length,
		axes: axisScores,
	};
}

export function scoreProjectBenchmarks(
	projects: ProjectBenchmarkProject[],
	axes: ProjectBenchmarkAxesFile,
	now = new Date(),
): ProjectBenchmarkScore[] {
	return projects
		.map((project) => scoreProjectBenchmark(project, axes, now))
		.sort(
			(left, right) =>
				right.score - left.score || left.id.localeCompare(right.id),
		);
}
