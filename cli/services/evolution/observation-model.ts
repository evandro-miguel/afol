import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";

export const OBSERVATION_FINGERPRINT_VERSION = 2;
export const RECURRENCE_MINIMUM_OCCURRENCES = 3;
export const RECURRENCE_MINIMUM_SESSIONS = 2;
export const RECURRENCE_MINIMUM_PRODUCTION_DAYS = 2;
export const MAX_OBSERVATION_SOURCE_REFS = 16;
export const MAX_OBSERVATION_TEXT_BYTES = 4_000;
export const MAX_NORMALIZED_FIELDS_BYTES = 4_096;

export type ObservationFingerprintFields = {
	kind: string;
	error_code: string;
	test: string;
	command: string;
	path_module: string;
	operation: string;
	workflow_step: string;
	stack_digest: string;
	provider: string;
};

export type ObservationInput = {
	project_id?: string;
	projectId?: string;
	id: string;
	kind?: string;
	observation_kind?: string;
	observationKind?: string;
	session_id?: string;
	sessionId?: string;
	production_day_sequence?: number;
	productionDaySequence?: number;
	task_type?: string;
	taskType?: string;
	impact?: string;
	created_at?: string;
	createdAt?: string;
	journal_event_id?: string;
	journalEventId?: string;
	journal_sequence?: number;
	journalSequence?: number;
	source_refs?: Array<Record<string, string>>;
	sourceRefs?: Array<Record<string, string>>;
	error_code?: string;
	errorCode?: string;
	test?: string;
	command?: string;
	path_module?: string;
	pathModule?: string;
	operation?: string;
	workflow_step?: string;
	workflowStep?: string;
	stack_digest?: string;
	stackDigest?: string;
	provider?: string;
};

export type ObservationRecord = {
	project_id: string;
	id: string;
	kind: string;
	fingerprint: string;
	fingerprint_version: number;
	occurrence_identity: string;
	session_id: string;
	production_day_sequence: number;
	task_type: string;
	impact: string;
	normalized_fields: ObservationFingerprintFields;
	source_refs: Array<Record<string, string>>;
	created_at: string;
	journal_sequence: number;
	journal_event_id: string;
};

export type RecurrenceState = "observed" | "candidate" | "recurring";
export type RecurrenceThresholds = {
	minimum_occurrences: number;
	minimum_distinct_sessions: number;
	minimum_distinct_production_days: number;
};
export type RecurrenceDecision = {
	fingerprint: string;
	state: RecurrenceState;
	occurrence_count: number;
	distinct_session_count: number;
	distinct_production_day_count: number;
	trusted_confirmation: boolean;
	reason: string;
};

export type ScorecardMetric = {
	value: number | null;
	better: "lower" | "higher";
};
export type ScorecardDimension = Readonly<Record<string, ScorecardMetric>>;
export type Scorecard = {
	rework: ScorecardDimension;
	regressions: ScorecardDimension;
	user_load: ScorecardDimension;
	outcome: ScorecardDimension;
	efficiency: ScorecardDimension;
};

export type ScorecardComparison = {
	comparable: boolean;
	accepted: boolean;
	reason: string;
	deltas: Record<keyof Scorecard, Readonly<Record<string, number | null>>>;
};

export type ComparableCohort = {
	task_type: string;
	observations: ObservationRecord[];
	minimum_data: number;
	distinct_production_days: number;
	comparable: boolean;
};

function text(value: unknown): string {
	return typeof value === "string" ? value : value == null ? "" : String(value);
}

export function redactSensitiveText(
	value: unknown,
	options: { redactPaths?: boolean } = {},
): string {
	let redacted = text(value)
		.replace(
			/(?:["']?)(authorization|api[_ -]?key|access[_ -]?token|password|secret|token)(?:["']?)\s*[:=]\s*(?:"(?:bearer\s+)?[^"]*"|'(?:bearer\s+)?[^']*'|(?:bearer\s+)?[^\s,;}]+)/gi,
			"$1=<redacted>",
		)
		.replace(/\b(bearer)\s+[^\s,;"'}]+/gi, "$1 <redacted>")
		.replace(
			/(--(?:api[_-]?key|access[_-]?token|authorization|password|secret|token))\s+[^\s,;]+/gi,
			"$1 <redacted>",
		)
		.replace(
			/([?&](?:api[_-]?key|access[_-]?token|authorization|password|secret|token)=)[^&#\s]+/gi,
			"$1<redacted>",
		)
		.replace(
			/(api[_ -]?key|access[_ -]?token|auth(?:orization)?|bearer|password|secret|token)\s*[:=]\s*[^\s,;]+/gi,
			"$1=<redacted>",
		)
		.replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "<redacted>");
	if (options.redactPaths) {
		redacted = redacted
			.replace(
				/(?<![A-Za-z0-9:])\/(?:[^/\s"'<>]+\/)*[^/\s"'<>]+/g,
				"<redacted-path>",
			)
			.replace(/(?:[A-Za-z]:[\\/]|\\\\)[^\s"'<>]+/g, "<redacted-path>");
	}
	return redacted.replace(/\s+/g, " ").trim().toLowerCase();
}

function redact(value: unknown): string {
	return redactSensitiveText(value);
}

function normalizePath(value: unknown): string {
	return redact(value).replaceAll("\\", "/");
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value && typeof value === "object")
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
			.join(",")}}`;
	return JSON.stringify(value);
}

function digest(value: unknown): string {
	return createHash("sha256").update(stableJson(value)).digest("hex");
}

function boundedText(value: string, field: string): string {
	if (Buffer.byteLength(value, "utf8") > MAX_OBSERVATION_TEXT_BYTES)
		throw new Error(`observation ${field} exceeds the text limit`);
	return value;
}

function required(value: unknown, field: string): string {
	const normalized = text(value).trim();
	if (!normalized) throw new Error(`observation ${field} must be non-empty`);
	return boundedText(normalized, field);
}

function projectId(input: ObservationInput): string {
	return required(input.project_id ?? input.projectId, "project id");
}

function sessionId(input: ObservationInput): string {
	return required(input.session_id ?? input.sessionId, "session id");
}

export function normalizeObservation(
	input: ObservationInput,
): ObservationFingerprintFields {
	const normalized = {
		kind: redact(input.kind ?? input.observation_kind ?? input.observationKind),
		error_code: redact(input.error_code ?? input.errorCode),
		test: redact(input.test),
		command: redact(input.command),
		path_module: normalizePath(input.path_module ?? input.pathModule),
		operation: redact(input.operation),
		workflow_step: redact(input.workflow_step ?? input.workflowStep),
		stack_digest: redact(input.stack_digest ?? input.stackDigest),
		provider: redact(input.provider),
	};
	for (const [field, value] of Object.entries(normalized))
		boundedText(value, field);
	return normalized;
}

export function observationFingerprint(
	fields: ObservationFingerprintFields | ObservationInput,
	version = OBSERVATION_FINGERPRINT_VERSION,
): string {
	const normalized = "id" in fields ? normalizeObservation(fields) : fields;
	return digest({
		version,
		fields: normalized,
	});
}

export function occurrenceIdentity(input: ObservationInput): string {
	const refs = input.source_refs ?? input.sourceRefs ?? [];
	return digest({
		version: 1,
		project_id: projectId(input),
		session_id: sessionId(input),
		id: required(input.id, "id"),
		source_refs: refs
			.map((ref) =>
				Object.fromEntries(
					Object.entries(ref)
						.sort(([left], [right]) => left.localeCompare(right))
						.map(([key, value]) => [key, text(value)]),
				),
			)
			.sort((left, right) => stableJson(left).localeCompare(stableJson(right))),
	});
}

export function normalizeObservationRecord(
	input: ObservationInput,
): ObservationRecord {
	const project_id = projectId(input);
	const session_id = sessionId(input);
	const production_day_sequence = Number(
		input.production_day_sequence ?? input.productionDaySequence ?? 0,
	);
	if (!Number.isInteger(production_day_sequence) || production_day_sequence < 0)
		throw new Error(
			"observation production day must be a non-negative integer",
		);
	const source_refs = input.source_refs ?? input.sourceRefs ?? [];
	if (!Array.isArray(source_refs))
		throw new Error("observation source refs must be an array");
	if (source_refs.length > MAX_OBSERVATION_SOURCE_REFS)
		throw new Error("observation source refs exceed the limit");
	for (const ref of source_refs) {
		if (
			ref === null ||
			typeof ref !== "object" ||
			Array.isArray(ref) ||
			!Object.values(ref).every((value) => typeof value === "string")
		)
			throw new Error("observation source ref is invalid");
		for (const [field, value] of Object.entries(ref))
			boundedText(value, `source ref ${field}`);
	}
	const normalized_fields = normalizeObservation(input);
	if (
		Buffer.byteLength(JSON.stringify(normalized_fields), "utf8") >
		MAX_NORMALIZED_FIELDS_BYTES
	)
		throw new Error("observation normalized fields exceed the limit");
	const journal_sequence = Number(
		input.journal_sequence ?? input.journalSequence ?? 1,
	);
	if (!Number.isInteger(journal_sequence) || journal_sequence < 1)
		throw new Error("observation journal sequence must be a positive integer");
	return {
		project_id,
		id: required(input.id, "id"),
		kind: required(
			input.kind ?? input.observation_kind ?? input.observationKind,
			"kind",
		),
		fingerprint: observationFingerprint(normalized_fields),
		fingerprint_version: OBSERVATION_FINGERPRINT_VERSION,
		occurrence_identity: occurrenceIdentity(input),
		session_id,
		production_day_sequence,
		task_type: required(input.task_type ?? input.taskType, "task type"),
		impact: required(input.impact, "impact"),
		normalized_fields,
		source_refs,
		created_at: required(input.created_at ?? input.createdAt, "created at"),
		journal_sequence,
		journal_event_id: required(
			input.journal_event_id ?? input.journalEventId,
			"journal event id",
		),
	};
}

export function deriveRecurrenceDecision(
	observations: readonly ObservationRecord[],
	trustedConfirmation = false,
	thresholds: RecurrenceThresholds = {
		minimum_occurrences: RECURRENCE_MINIMUM_OCCURRENCES,
		minimum_distinct_sessions: RECURRENCE_MINIMUM_SESSIONS,
		minimum_distinct_production_days: RECURRENCE_MINIMUM_PRODUCTION_DAYS,
	},
): RecurrenceDecision {
	if (observations.length === 0)
		throw new Error("recurrence needs an observation");
	const fingerprints = new Set(observations.map((row) => row.fingerprint));
	if (fingerprints.size !== 1)
		throw new Error("recurrence observations must share a fingerprint");
	for (const [name, value] of Object.entries(thresholds))
		if (!Number.isInteger(value) || value < 1)
			throw new Error(
				`recurrence threshold ${name} must be a positive integer`,
			);
	const sessions = new Set(observations.map((row) => row.session_id));
	const productionDays = new Set(
		observations
			.map((row) => row.production_day_sequence)
			.filter((day) => day > 0),
	);
	const occurrence_count = observations.length;
	const distinct_session_count = sessions.size;
	const distinct_production_day_count = productionDays.size;
	const recurring =
		trustedConfirmation ||
		(occurrence_count >= thresholds.minimum_occurrences &&
			distinct_session_count >= thresholds.minimum_distinct_sessions &&
			distinct_production_day_count >=
				thresholds.minimum_distinct_production_days);
	const state: RecurrenceState = recurring
		? "recurring"
		: occurrence_count >= 2
			? "candidate"
			: "observed";
	return {
		fingerprint: observations[0]?.fingerprint ?? "",
		state,
		occurrence_count,
		distinct_session_count,
		distinct_production_day_count,
		trusted_confirmation: trustedConfirmation,
		reason: trustedConfirmation
			? "trusted user confirmation"
			: state === "recurring"
				? `minimum ${thresholds.minimum_occurrences} occurrences across ${thresholds.minimum_distinct_sessions} sessions and ${thresholds.minimum_distinct_production_days} production days`
				: state === "candidate"
					? "repeated evidence below recurrence threshold"
					: "first observed occurrence",
	};
}

export function comparableCohort(
	observations: readonly ObservationRecord[],
	taskType: string,
	minimumData = 3,
): ComparableCohort {
	if (!Number.isInteger(minimumData) || minimumData < 1)
		throw new Error("minimum comparable data must be a positive integer");
	const filtered = observations.filter((row) => row.task_type === taskType);
	const distinct_production_days = new Set(
		filtered.map((row) => row.production_day_sequence).filter((day) => day > 0),
	).size;
	return {
		task_type: taskType,
		observations: filtered,
		minimum_data: minimumData,
		distinct_production_days,
		comparable: filtered.length >= minimumData && distinct_production_days >= 2,
	};
}

export function compareScorecards(
	baseline: Scorecard,
	current: Scorecard,
	cohort: ComparableCohort | { comparable: boolean },
): ScorecardComparison {
	const delta = (
		before: ScorecardDimension,
		after: ScorecardDimension,
	): Readonly<Record<string, number | null>> => {
		const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
		return Object.fromEntries(
			[...keys].sort().map((key) => {
				const baselineMetric = before[key];
				const currentMetric = after[key];
				if (
					!baselineMetric ||
					!currentMetric ||
					baselineMetric.value === null ||
					currentMetric.value === null
				)
					return [key, null];
				if (baselineMetric.better !== currentMetric.better)
					throw new Error(`scorecard metric direction changed for ${key}`);
				return [key, currentMetric.value - baselineMetric.value];
			}),
		);
	};
	const deltas = {
		rework: delta(baseline.rework, current.rework),
		regressions: delta(baseline.regressions, current.regressions),
		user_load: delta(baseline.user_load, current.user_load),
		outcome: delta(baseline.outcome, current.outcome),
		efficiency: delta(baseline.efficiency, current.efficiency),
	};
	if (!cohort.comparable)
		return {
			comparable: false,
			accepted: false,
			reason: "insufficient comparable cohort data",
			deltas,
		};
	const dimensions = Object.keys(deltas) as Array<keyof Scorecard>;
	const missing = dimensions.some((dimension) =>
		Object.values(deltas[dimension]).some((value) => value === null),
	);
	if (missing)
		return {
			comparable: false,
			accepted: false,
			reason: "scorecard has explicit missing metric data",
			deltas,
		};
	const metricWorsened = (dimension: keyof Scorecard): boolean =>
		Object.entries(deltas[dimension]).some(([key, value]) => {
			const metric = baseline[dimension][key];
			return metric?.better === "lower" ? Number(value) > 0 : Number(value) < 0;
		});
	const metricImproved = (dimension: keyof Scorecard): boolean =>
		Object.entries(deltas[dimension]).some(([key, value]) => {
			const metric = baseline[dimension][key];
			return metric?.better === "lower" ? Number(value) < 0 : Number(value) > 0;
		});
	const worsened = (
		["rework", "regressions", "user_load", "outcome"] as const
	).some(metricWorsened);
	const efficiencyWorsened = metricWorsened("efficiency");
	const improved = dimensions.some(metricImproved);
	return {
		comparable: true,
		accepted: !worsened && !efficiencyWorsened && improved,
		reason: worsened
			? "efficiency gain cannot offset worsened safety, rework, quality, or user load"
			: efficiencyWorsened
				? "efficiency metrics conflict or regress"
				: !improved
					? "proposal has no measured improvement"
					: "safety, rework, quality, user load, and efficiency are non-worsening with a measured improvement",
		deltas,
	};
}

export function observationRecordFromRow(
	row: Record<string, unknown>,
): ObservationRecord {
	const record: ObservationRecord = {
		project_id: String(row.project_id),
		id: String(row.id),
		kind: String(row.kind),
		fingerprint: String(row.fingerprint),
		fingerprint_version: Number(
			row.fingerprint_version,
		) as typeof OBSERVATION_FINGERPRINT_VERSION,
		occurrence_identity: String(row.occurrence_identity),
		session_id: String(row.session_id),
		production_day_sequence: Number(row.production_day_sequence),
		task_type: String(row.task_type),
		impact: String(row.impact),
		normalized_fields: JSON.parse(
			String(row.normalized_fields),
		) as ObservationFingerprintFields,
		source_refs: JSON.parse(String(row.source_refs)) as Array<
			Record<string, string>
		>,
		created_at: String(row.created_at),
		journal_sequence: Number(row.journal_sequence),
		journal_event_id: String(row.journal_event_id),
	};
	assertObservationRecordBounds(record);
	return record;
}

export function projectObservation(
	db: Database,
	observation: ObservationRecord,
): ObservationRecord {
	const existing = db
		.query("SELECT * FROM observations WHERE project_id = ? AND id = ?")
		.get(observation.project_id, observation.id) as Record<
		string,
		unknown
	> | null;
	if (existing) {
		const existingRecord = observationRecordFromRow(existing);
		if (stableJson(existingRecord) !== stableJson(observation))
			throw new Error("observation id already exists with different content");
		return observation;
	}
	db.prepare(
		`INSERT INTO observations(project_id,id,kind,fingerprint,fingerprint_version,occurrence_identity,session_id,production_day_sequence,task_type,impact,normalized_fields,source_refs,created_at,journal_sequence,journal_event_id)
		VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
	).run(
		observation.project_id,
		observation.id,
		observation.kind,
		observation.fingerprint,
		observation.fingerprint_version,
		observation.occurrence_identity,
		observation.session_id,
		observation.production_day_sequence,
		observation.task_type,
		observation.impact,
		JSON.stringify(observation.normalized_fields),
		JSON.stringify(observation.source_refs),
		observation.created_at,
		observation.journal_sequence,
		observation.journal_event_id,
	);
	return observation;
}

export function projectObservations(
	db: Database,
	projectId: string,
): ObservationRecord[] {
	return db
		.query(
			"SELECT * FROM observations WHERE project_id = ? ORDER BY created_at, id",
		)
		.all(projectId)
		.map((row) => observationRecordFromRow(row as Record<string, unknown>));
}

export function assertObservationRecordBounds(record: ObservationRecord): void {
	for (const [field, value] of Object.entries(record)) {
		if (typeof value === "string") boundedText(value, field);
	}
	if (record.source_refs.length > MAX_OBSERVATION_SOURCE_REFS)
		throw new Error("observation source refs exceed the limit");
	for (const ref of record.source_refs) {
		if (
			ref === null ||
			typeof ref !== "object" ||
			Array.isArray(ref) ||
			!Object.values(ref).every((value) => typeof value === "string")
		)
			throw new Error("observation source ref is invalid");
		for (const [field, value] of Object.entries(ref))
			boundedText(value, `source ref ${field}`);
	}
	if (
		Buffer.byteLength(JSON.stringify(record.normalized_fields), "utf8") >
		MAX_NORMALIZED_FIELDS_BYTES
	)
		throw new Error("observation normalized fields exceed the limit");
}
