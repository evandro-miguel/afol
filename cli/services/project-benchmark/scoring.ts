import type {
	ProjectBenchmarkAxesFile,
	ProjectBenchmarkProject,
	ProjectBenchmarkRecommendation,
	ProjectBenchmarkScore,
} from "./types";

const MAX_AXIS_SCORE = 5;

type RecommendationRiskFlag =
	| "stale"
	| "low_confidence"
	| "docs_only"
	| "closed_source"
	| "adjacent_reference";

type RankedProjectBenchmarkRecommendation = ProjectBenchmarkRecommendation & {
	risk_flags: RecommendationRiskFlag[];
	risk_level: "low" | "medium" | "high";
	do_not_copy: string[];
};

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
	let focusedMax = 0;
	const axisScores: Record<string, number> = {};
	const totalMax = Object.values(axes.axes).reduce(
		(sum, axis) => sum + MAX_AXIS_SCORE * axis.weight,
		0,
	);

	for (const [axisId, axisScore] of Object.entries(project.similarity_axes)) {
		const axis = axes.axes[axisId];
		if (!axis || axisScore.evidence_refs.length === 0) {
			continue;
		}
		weighted += axisScore.score * axis.weight;
		focusedMax += MAX_AXIS_SCORE * axis.weight;
		axisScores[axisId] = axisScore.score;
	}
	const focusedScore =
		focusedMax > 0 ? Math.round((weighted / focusedMax) * 100) : 0;
	const overallScore =
		totalMax > 0 ? Math.round((weighted / totalMax) * 100) : 0;

	return {
		id: project.id,
		name: project.name,
		category: project.category,
		status: project.status,
		confidence: project.confidence,
		score: focusedScore,
		overall_score: overallScore,
		focused_score: focusedScore,
		coverage_weight:
			totalMax > 0 ? Math.round((focusedMax / totalMax) * 100) : 0,
		stale: isProjectBenchmarkStale(project, now),
		axis_count: Object.keys(axisScores).length,
		axes: axisScores,
	};
}

export function compareProjectBenchmarkScores(
	left: ProjectBenchmarkScore,
	right: ProjectBenchmarkScore,
): number {
	return (
		right.overall_score - left.overall_score ||
		right.focused_score - left.focused_score ||
		left.id.localeCompare(right.id)
	);
}

export function scoreProjectBenchmarks(
	projects: ProjectBenchmarkProject[],
	axes: ProjectBenchmarkAxesFile,
	now = new Date(),
): ProjectBenchmarkScore[] {
	return projects
		.map((project) => scoreProjectBenchmark(project, axes, now))
		.sort(compareProjectBenchmarkScores);
}

function confidenceFactor(confidence: string): number {
	switch (confidence) {
		case "high":
			return 1;
		case "medium":
			return 0.85;
		case "low":
			return 0.65;
		default:
			return 0.5;
	}
}

function sourceAccessFactor(sourceAccess: string): number {
	switch (sourceAccess) {
		case "open_source":
			return 1;
		case "official_docs":
			return 0.9;
		case "docs_only":
			return 0.75;
		case "closed_source":
			return 0.6;
		default:
			return 0.5;
	}
}

function categoryFactor(category: string): number {
	switch (category) {
		case "direct_comparable":
			return 1;
		case "protocol_reference":
			return 0.9;
		case "adjacent_reference":
			return 0.8;
		default:
			return 0.5;
	}
}

function recommendationWarnings(
	project: ProjectBenchmarkProject,
	stale: boolean,
): string[] {
	const warnings: string[] = [];
	if (stale) {
		warnings.push("stale");
	}
	if (project.confidence !== "high") {
		warnings.push(`confidence=${project.confidence}`);
	}
	if (
		project.source_access === "docs_only" ||
		project.source_access === "closed_source"
	) {
		warnings.push(`source_access=${project.source_access}`);
	}
	if (project.category === "adjacent_reference") {
		warnings.push("category=adjacent_reference");
	}
	return warnings;
}

function recommendationRiskFlags(
	project: ProjectBenchmarkProject,
	stale: boolean,
): RecommendationRiskFlag[] {
	const flags: RecommendationRiskFlag[] = [];
	if (stale) {
		flags.push("stale");
	}
	if (project.confidence === "low") {
		flags.push("low_confidence");
	}
	if (project.source_access === "docs_only") {
		flags.push("docs_only");
	}
	if (project.source_access === "closed_source") {
		flags.push("closed_source");
	}
	if (project.category === "adjacent_reference") {
		flags.push("adjacent_reference");
	}
	return flags;
}

function recommendationRiskLevel(
	flags: RecommendationRiskFlag[],
): "low" | "medium" | "high" {
	if (
		flags.includes("stale") ||
		flags.includes("low_confidence") ||
		flags.includes("closed_source")
	) {
		return "high";
	}
	if (flags.length > 0) {
		return "medium";
	}
	return "low";
}

export function rankProjectBenchmarkRecommendations(
	axis: string,
	projects: ProjectBenchmarkProject[],
	now = new Date(),
): ProjectBenchmarkRecommendation[] {
	return projects
		.map((project) => {
			const axisScore = project.similarity_axes[axis]?.score ?? 0;
			if (axisScore <= 0) {
				return null;
			}
			const stale = isProjectBenchmarkStale(project, now);
			const riskFlags = recommendationRiskFlags(project, stale);
			const staleFactor = stale ? 0.75 : 1;
			const recommendationScore = Math.round(
				axisScore *
					20 *
					confidenceFactor(project.confidence) *
					sourceAccessFactor(project.source_access) *
					categoryFactor(project.category) *
					staleFactor,
			);
			const recommendation: RankedProjectBenchmarkRecommendation = {
				id: project.id,
				name: project.name,
				axis_score: axisScore,
				recommendation_score: recommendationScore,
				confidence: project.confidence,
				source_access: project.source_access,
				category: project.category,
				stale,
				warnings: recommendationWarnings(project, stale),
				risk_flags: riskFlags,
				risk_level: recommendationRiskLevel(riskFlags),
				do_not_copy: (project.do_not_copy ?? []).map((entry) => entry.reason),
				lesson:
					(project.lessons_for_afol ?? []).find((entry) => entry.axis === axis)
						?.lesson ?? null,
			};
			return recommendation;
		})
		.filter(
			(entry): entry is RankedProjectBenchmarkRecommendation => entry !== null,
		)
		.sort(
			(left, right) =>
				right.recommendation_score - left.recommendation_score ||
				left.risk_flags.length - right.risk_flags.length ||
				right.axis_score - left.axis_score ||
				left.id.localeCompare(right.id),
		);
}
