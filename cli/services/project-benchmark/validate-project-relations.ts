import { isProjectBenchmarkStale } from "./scoring";
import type {
	ProjectBenchmarkCatalog,
	ProjectBenchmarkIssue,
	ProjectBenchmarkProject,
} from "./types";
import type {
	ProjectBenchmarkCollections,
	ProjectBenchmarkProjectRecord,
} from "./validate-project-shape";
import {
	hasAbsoluteUriShape,
	hasDateShape,
	isRecord,
	pushProjectBenchmarkIssue as push,
	pushUnexpectedProperties,
	validateEnum,
} from "./validation-utils";

export type ProjectBenchmarkAxes = NonNullable<
	ProjectBenchmarkCatalog["axes"]
>["axes"];

type ProjectBenchmarkSourceRefRecord = Record<string, unknown> & {
	id?: unknown;
	title?: unknown;
	url?: unknown;
	source_type?: unknown;
	claim?: unknown;
	axes?: unknown;
};

type ProjectBenchmarkAxisScoreRecord = Record<string, unknown> & {
	score?: unknown;
	evidence_refs?: unknown;
};

type ProjectBenchmarkSimilarityRecord = Record<string, unknown> & {
	axis?: unknown;
	evidence_refs?: unknown;
};

type ProjectBenchmarkLessonRecord = Record<string, unknown> & {
	axis?: unknown;
};

type ValidatedSourceRefs = {
	sourceIds: Set<string>;
	sourceAxes: Map<string, Set<string>>;
};

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

function readEvidenceRefs(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function validateKnownEvidenceRefs(
	evidenceRefs: readonly unknown[],
	sourceIds: ReadonlySet<string>,
	file: string,
	issues: ProjectBenchmarkIssue[],
	messageForUnknownRef: (ref: unknown) => string,
): string[] {
	const knownRefs: string[] = [];
	for (const ref of evidenceRefs) {
		if (typeof ref !== "string" || !sourceIds.has(ref)) {
			push(
				issues,
				"error",
				"unknown-evidence-ref",
				file,
				messageForUnknownRef(ref),
			);
			continue;
		}
		knownRefs.push(ref);
	}
	return knownRefs;
}

export function validateProjectIdentity(
	projectId: string | null,
	fileNameId: string,
	file: string,
	seenIds: Map<string, string>,
	issues: ProjectBenchmarkIssue[],
): void {
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
}

export function validateSourceRefs(
	sourceRefs: unknown[],
	axes: ProjectBenchmarkAxes,
	file: string,
	issues: ProjectBenchmarkIssue[],
): ValidatedSourceRefs {
	const sourceIds = new Set<string>();
	const sourceAxes = new Map<string, Set<string>>();
	validateSourceRefEnums(sourceRefs, file, issues);

	for (const sourceValue of sourceRefs) {
		const sourceRecord: ProjectBenchmarkSourceRefRecord | null = isRecord(
			sourceValue,
		)
			? sourceValue
			: null;
		if (!sourceRecord) {
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
			sourceRecord,
			SOURCE_REF_KEYS,
			"unexpected-source-ref-property",
			"source_ref",
		);
		const sourceId =
			typeof sourceRecord.id === "string" ? sourceRecord.id : "unknown";
		if (
			!sourceRecord.id ||
			!sourceRecord.title ||
			!sourceRecord.url ||
			!sourceRecord.source_type
		) {
			push(
				issues,
				"error",
				"invalid-source-ref",
				file,
				`Invalid source_ref: ${sourceId}`,
			);
		}
		if (sourceRecord.url && !hasAbsoluteUriShape(sourceRecord.url)) {
			push(
				issues,
				"error",
				"invalid-source-url",
				file,
				`Invalid source_ref url: ${sourceId}`,
			);
		}
		if (!sourceRecord.claim) {
			push(
				issues,
				"error",
				"missing-source-claim",
				file,
				`source_ref missing claim: ${sourceId}`,
			);
		}
		const supportedAxes = readSupportedAxes(sourceRecord.axes);
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
		if (typeof sourceRecord.id === "string" && sourceRecord.id.length > 0) {
			if (sourceIds.has(sourceRecord.id)) {
				push(
					issues,
					"error",
					"duplicate-source-ref-id",
					file,
					`Duplicate source_ref id: ${sourceRecord.id}`,
				);
			} else {
				sourceIds.add(sourceRecord.id);
				sourceAxes.set(sourceRecord.id, new Set(supportedAxes));
			}
		}
	}

	return { sourceIds, sourceAxes };
}

export function validateAxisScores(
	similarityAxes: Record<string, unknown>,
	axes: ProjectBenchmarkAxes,
	refs: ValidatedSourceRefs,
	file: string,
	issues: ProjectBenchmarkIssue[],
): void {
	for (const [axisId, axisScoreValue] of Object.entries(similarityAxes)) {
		if (!axes[axisId]) {
			push(issues, "error", "unknown-axis", file, `Unknown axis: ${axisId}`);
		}
		const axisScore: ProjectBenchmarkAxisScoreRecord | null = isRecord(
			axisScoreValue,
		)
			? axisScoreValue
			: null;
		if (axisScore) {
			pushUnexpectedProperties(
				issues,
				file,
				axisScore,
				AXIS_SCORE_KEYS,
				"unexpected-axis-score-property",
				"similarity_axes entry",
			);
		}
		const score = axisScore?.score;
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
		const evidenceRefs = readEvidenceRefs(axisScore?.evidence_refs);
		if (evidenceRefs.length === 0) {
			push(
				issues,
				"error",
				"score-without-evidence",
				file,
				`Score without evidence_refs for axis: ${axisId}`,
			);
		}
		for (const ref of validateKnownEvidenceRefs(
			evidenceRefs,
			refs.sourceIds,
			file,
			issues,
			(ref) => `Unknown evidence ref for axis ${axisId}: ${String(ref)}`,
		)) {
			if (!refs.sourceAxes.get(ref)?.has(axisId)) {
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
}

export function validateSimilarities(
	similarities: unknown[],
	axes: ProjectBenchmarkAxes,
	sourceIds: Set<string>,
	file: string,
	issues: ProjectBenchmarkIssue[],
): void {
	for (const similarityValue of similarities) {
		const similarity: ProjectBenchmarkSimilarityRecord | null = isRecord(
			similarityValue,
		)
			? similarityValue
			: null;
		if (similarity) {
			pushUnexpectedProperties(
				issues,
				file,
				similarity,
				SIMILARITY_KEYS,
				"unexpected-similarity-property",
				"similarity",
			);
		}
		const similarityAxis = similarity?.axis;
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
		const evidenceRefs = readEvidenceRefs(similarity?.evidence_refs);
		if (evidenceRefs.length === 0) {
			push(
				issues,
				"error",
				"similarity-without-evidence",
				file,
				"Similarity missing evidence_refs",
			);
		}
		validateKnownEvidenceRefs(
			evidenceRefs,
			sourceIds,
			file,
			issues,
			(ref) => `Unknown similarity evidence ref: ${String(ref)}`,
		);
	}
}

export function validateCollectionProperties(
	collections: ProjectBenchmarkCollections,
	axes: ProjectBenchmarkAxes,
	file: string,
	issues: ProjectBenchmarkIssue[],
): void {
	for (const differenceValue of collections.differences) {
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

	for (const lessonValue of collections.lessons) {
		const lesson: ProjectBenchmarkLessonRecord | null = isRecord(lessonValue)
			? lessonValue
			: null;
		if (lesson) {
			pushUnexpectedProperties(
				issues,
				file,
				lesson,
				LESSON_KEYS,
				"unexpected-lesson-property",
				"lesson",
			);
		}
		const lessonAxis = lesson?.axis;
		if (typeof lessonAxis !== "string" || lessonAxis.length === 0) {
			push(issues, "error", "lesson-without-axis", file, "Lesson missing axis");
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

	for (const itemValue of collections.doNotCopy) {
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
}

export function validateProjectWarnings(
	projectRecord: ProjectBenchmarkProjectRecord,
	file: string,
	now: Date,
	issues: ProjectBenchmarkIssue[],
): void {
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
		typeof projectRecord.stale_after_days === "number" &&
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
