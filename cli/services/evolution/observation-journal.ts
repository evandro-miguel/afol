import { Database } from "bun:sqlite";
import { createHash, randomUUID } from "node:crypto";
import {
	chmodSync,
	closeSync,
	constants as fsConstants,
	fstatSync,
	fsyncSync,
	ftruncateSync,
	mkdirSync,
	openSync,
	readFileSync,
	writeSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { withSessionLock } from "../io/session-lock";
import { readProjectConfig } from "../project/paths";
import { resolveProjectWritePath } from "../project/root";
import {
	DEFAULT_EVOLUTION_TIMEZONE,
	recurrenceThresholdsFromSettings,
} from "./config";
import {
	assertSafeEvolutionProjectRoot,
	assertSafeEvolutionTarget,
} from "./db";
import { validateProductionDayProjection } from "./journal";
import { applyMigrations } from "./migrations";
import {
	deriveRecurrenceDecision,
	type ObservationRecord,
	observationFingerprint,
	occurrenceIdentity,
	projectObservation,
	type RecurrenceThresholds,
} from "./observation-model";
import { writeEvolutionProjectionCheckpoint } from "./projection-checkpoint";
import {
	clearProjectionWatermark,
	writeProjectionWatermark,
} from "./projection-watermark";
import {
	assertRecurrenceAuthority,
	type RecurrenceAuthorityCapability,
	recurrenceDecisionDigest,
	recurrenceDecisionForAuthority,
	recurrenceObservationMembershipDigest,
} from "./recurrence-authority";
import { resolveEvolutionConfig } from "./runtime-config";

const GENESIS = "GENESIS";
const LOCK = "__evolution-journal__";
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const REF_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DIGEST_RE = /^[a-f0-9]{64}$/;
const LOCAL_SOURCE_KINDS = new Set([
	"commit",
	"decision",
	"evidence",
	"feedback",
	"session",
	"telemetry",
	"test",
	"workbench",
]);
const EXTERNAL_SOURCE_KINDS = new Set(["external_session", "import"]);

export type ObservationJournalEvent = {
	sequence: number;
	event_id: string;
	event_type: "observation" | "recurrence_decision";
	action: "record" | "confirm" | "dismiss" | "reopen";
	authority_kind: "system_observer" | "explicit_project_user";
	actor: string;
	caller_type: "system" | "project_user";
	trust_level: "local_trusted";
	origin_ref: string;
	subject_id: string;
	timestamp: string;
	command: string;
	previous_event_digest: string;
	payload: Record<string, unknown>;
	payload_digest: string;
	event_digest: string;
	source_refs: Array<Record<string, string>>;
};

export type ObservationJournalContext = {
	root: string;
	projectId: string;
	timezone?: string;
	evolutionEventsDir?: string;
	recurrenceThresholds?: RecurrenceThresholds;
};

function resolvedJournalContext(
	root: string,
	projectId: string,
	values: {
		timezone?: string;
		evolutionEventsDir?: string;
		recurrenceThresholds?: RecurrenceThresholds;
	},
): {
	timezone: string;
	evolutionEventsDir: string;
	recurrenceThresholds: RecurrenceThresholds;
} {
	if (
		values.timezone !== undefined &&
		values.evolutionEventsDir !== undefined &&
		values.recurrenceThresholds !== undefined
	)
		return {
			timezone: values.timezone,
			evolutionEventsDir: values.evolutionEventsDir,
			recurrenceThresholds: values.recurrenceThresholds,
		};
	const resolved = resolveEvolutionConfig(readProjectConfig(root));
	if (resolved.projectId && resolved.projectId !== projectId)
		throw new Error(
			"evolution project identity does not match journal project",
		);
	return {
		timezone:
			values.timezone ?? resolved.timezone ?? DEFAULT_EVOLUTION_TIMEZONE,
		evolutionEventsDir:
			values.evolutionEventsDir ?? resolved.paths.evolutionEventsDir,
		recurrenceThresholds:
			values.recurrenceThresholds ??
			recurrenceThresholdsFromSettings(resolved.settings),
	};
}

export function observationJournalPath(
	root: string,
	eventsDir = ".afol/data/events/evolution",
): string {
	assertSafeEvolutionProjectRoot(root);
	const resolved = resolveProjectWritePath(root, eventsDir);
	if (!resolved.ok) throw new Error(resolved.error);
	return join(resolved.value.path, "observations.jsonl");
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value && typeof value === "object")
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
			.join(",")}}`;
	return JSON.stringify(value);
}

export function observationDigest(value: unknown): string {
	return createHash("sha256").update(stableJson(value)).digest("hex");
}

function openFlags(flags: number): number {
	return process.platform === "win32"
		? flags
		: flags | (fsConstants.O_NOFOLLOW ?? 0);
}

function readText(path: string): string | null {
	const before = assertSafeEvolutionTarget(path, "observation journal target");
	if (!before) return null;
	const fd = openSync(path, openFlags(fsConstants.O_RDONLY));
	try {
		const opened = fstatSync(fd);
		if (!opened.isFile() || opened.nlink !== 1)
			throw new Error("observation journal target must be a regular file");
		const text = readFileSync(fd, "utf8");
		const after = assertSafeEvolutionTarget(
			path,
			"observation journal target",
			false,
		);
		if (!after || after.ino !== before.ino || after.size !== before.size)
			throw new Error("observation journal changed during read");
		return text;
	} finally {
		closeSync(fd);
	}
}

function truncate(path: string, size: number): void {
	const target = assertSafeEvolutionTarget(path, "observation journal target");
	if (!target) return;
	const fd = openSync(path, openFlags(fsConstants.O_WRONLY));
	try {
		const opened = fstatSync(fd);
		if (!opened.isFile() || opened.nlink !== 1)
			throw new Error("observation journal target must be a regular file");
		ftruncateSync(fd, size);
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
}

function assertWritableAppendFd(
	fd: number,
	path: string,
	previous: ReturnType<typeof assertSafeEvolutionTarget>,
): void {
	const opened = fstatSync(fd);
	if (!opened.isFile() || opened.nlink !== 1)
		throw new Error("observation journal target must be a regular file");
	const current = assertSafeEvolutionTarget(path, "observation journal target");
	if (
		!current ||
		(previous &&
			(String(current.dev) !== String(previous.dev) ||
				String(current.ino) !== String(previous.ino)))
	)
		throw new Error("observation journal target changed before append");
}

function syncParentDirectory(path: string): void {
	if (process.platform === "win32") return;
	const fd = openSync(dirname(path), "r");
	try {
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
}

function validateEvent(
	event: ObservationJournalEvent,
	index: number,
	previous: string,
	projectId: string,
): void {
	if (
		event.sequence !== index + 1 ||
		!ID_RE.test(event.event_id) ||
		!ID_RE.test(event.subject_id) ||
		(event.event_type !== "observation" &&
			event.event_type !== "recurrence_decision") ||
		event.previous_event_digest !== previous ||
		event.trust_level !== "local_trusted" ||
		Number.isNaN(Date.parse(event.timestamp))
	)
		throw new Error(`invalid observation journal event at line ${index + 1}`);
	sourceRefs(event.source_refs, event.authority_kind);
	if (event.payload.project_id !== projectId)
		throw new Error("observation journal belongs to another project");
	if (event.event_type === "observation") {
		if (
			event.action !== "record" ||
			event.authority_kind !== "system_observer" ||
			event.caller_type !== "system"
		)
			throw new Error("observation record authority is invalid");
		const observation = event.payload.observation as
			| Record<string, unknown>
			| undefined;
		if (
			!observation ||
			observation.id !== event.subject_id ||
			observation.project_id !== projectId ||
			(observation.fingerprint_version !== 1 &&
				observation.fingerprint_version !== 2) ||
			observation.journal_event_id !== event.event_id ||
			observation.fingerprint !==
				observationFingerprint(
					observation.normalized_fields as ObservationRecord["normalized_fields"],
					Number(observation.fingerprint_version),
				) ||
			observation.occurrence_identity !==
				occurrenceIdentity(observation as never) ||
			stableJson(observation.source_refs) !== stableJson(event.source_refs)
		)
			throw new Error("observation record payload is invalid");
	}
	if (
		event.event_type === "recurrence_decision" &&
		!["confirm", "dismiss", "reopen"].includes(event.action)
	)
		throw new Error("recurrence decision action is invalid");
	if (
		event.event_type === "recurrence_decision" &&
		(event.authority_kind !== "explicit_project_user" ||
			event.caller_type !== "project_user")
	)
		throw new Error("recurrence decisions require project-user authority");
	if (event.event_type === "recurrence_decision") {
		const decision = event.payload.decision as
			| Record<string, unknown>
			| undefined;
		if (
			!decision ||
			decision.id !== event.subject_id ||
			decision.projectId !== projectId ||
			decision.fingerprint !== event.payload.fingerprint ||
			(decision.fingerprintVersion !== 1 &&
				decision.fingerprintVersion !== 2) ||
			decision.action !== event.action ||
			!Array.isArray(decision.observationIds) ||
			decision.observationMembershipDigest !==
				recurrenceObservationMembershipDigest(
					decision.observationIds as string[],
				) ||
			String(event.payload.decision_digest) !==
				recurrenceDecisionDigest(decision as never) ||
			!event.source_refs.some(
				(ref) =>
					ref.kind === "decision" && ref.id === decision.sourceDecisionRef,
			)
		)
			throw new Error("recurrence decision receipt binding is invalid");
	}
	if (event.payload_digest !== observationDigest(event.payload))
		throw new Error(`observation payload digest mismatch at line ${index + 1}`);
	const { event_digest: _digest, ...withoutDigest } = event;
	if (event.event_digest !== observationDigest(withoutDigest))
		throw new Error(`observation event digest mismatch at line ${index + 1}`);
}

/**
 * Validate and parse one already-captured journal snapshot. Callers that
 * impose their own source bounds must use this instead of reopening the path.
 */
export function parseObservationJournalText(
	text: string | null,
	projectId: string,
): ObservationJournalEvent[] {
	if (text === null || text.trim() === "") return [];
	const events: ObservationJournalEvent[] = [];
	const eventIds = new Set<string>();
	const observationIds = new Set<string>();
	const occurrenceIds = new Set<string>();
	const decisionIds = new Set<string>();
	let previous = GENESIS;
	for (const [index, line] of text.split(/\r?\n/).filter(Boolean).entries()) {
		let event: ObservationJournalEvent;
		try {
			event = JSON.parse(line) as ObservationJournalEvent;
		} catch {
			throw new Error(`invalid observation journal JSON at line ${index + 1}`);
		}
		validateEvent(event, index, previous, projectId);
		if (eventIds.has(event.event_id))
			throw new Error(
				`duplicate observation journal event id at line ${index + 1}`,
			);
		eventIds.add(event.event_id);
		if (event.event_type === "observation") {
			const observation = event.payload.observation as Record<string, unknown>;
			if (observationIds.has(String(observation.id)))
				throw new Error(`duplicate observation id at line ${index + 1}`);
			if (occurrenceIds.has(String(observation.occurrence_identity)))
				throw new Error(
					`duplicate observation occurrence at line ${index + 1}`,
				);
			observationIds.add(String(observation.id));
			occurrenceIds.add(String(observation.occurrence_identity));
		}
		if (event.event_type === "recurrence_decision") {
			const decision = event.payload.decision as Record<string, unknown>;
			if (decisionIds.has(String(decision.id)))
				throw new Error(
					`duplicate recurrence decision id at line ${index + 1}`,
				);
			decisionIds.add(String(decision.id));
		}
		events.push(event);
		previous = event.event_digest;
	}
	return events;
}

export function readObservationJournal(
	root: string,
	projectId: string,
	eventsDir?: string,
): ObservationJournalEvent[] {
	const path = observationJournalPath(root, eventsDir);
	return parseObservationJournalText(readText(path), projectId);
}

function validateObservationProductionDays(
	db: Database,
	projectId: string,
	events: readonly ObservationJournalEvent[],
): void {
	const days = new Set(
		events
			.filter((event) => event.event_type === "observation")
			.map((event) =>
				Number(
					(event.payload.observation as Record<string, unknown>)
						.production_day_sequence ?? 0,
				),
			)
			.filter((day) => day > 0),
	);
	for (const day of days) {
		const found = db
			.query(
				"SELECT 1 AS found FROM production_days WHERE project_id = ? AND ordinal_sequence = ?",
			)
			.get(projectId, day);
		if (!found)
			throw new Error(
				`observation references missing production ordinal ${day}`,
			);
	}
}

function sourceRefs(
	value: unknown,
	authorityKind: ObservationJournalEvent["authority_kind"] = "explicit_project_user",
): Array<Record<string, string>> {
	if (!Array.isArray(value) || value.length === 0)
		throw new Error("observation source refs are required");
	return value.map((item) => {
		if (!item || typeof item !== "object")
			throw new Error("observation source ref is invalid");
		const ref = item as Record<string, unknown>;
		const keys = Object.keys(ref).sort();
		if (
			keys.some((key) => !["digest", "id", "kind"].includes(key)) ||
			typeof ref.id !== "string" ||
			typeof ref.kind !== "string" ||
			!REF_ID_RE.test(ref.id) ||
			(!LOCAL_SOURCE_KINDS.has(ref.kind) &&
				!EXTERNAL_SOURCE_KINDS.has(ref.kind)) ||
			(authorityKind === "system_observer" &&
				EXTERNAL_SOURCE_KINDS.has(ref.kind)) ||
			(ref.digest !== undefined &&
				(typeof ref.digest !== "string" || !DIGEST_RE.test(ref.digest)))
		)
			throw new Error("observation source ref is invalid");
		return Object.fromEntries(
			Object.entries(ref).map(([k, v]) => [k, String(v)]),
		);
	});
}

function observationContentDigest(value: Record<string, unknown>): string {
	const {
		journal_event_id: _eventId,
		journal_sequence: _sequence,
		...content
	} = value;
	return observationDigest(content);
}

export type AppendObservationJournalInput = {
	root: string;
	db?: Database;
	projectId: string;
	timezone?: string;
	observation: ObservationRecord;
	sourceRefs?: Array<Record<string, string>>;
	eventId?: string;
	now?: Date;
	evolutionEventsDir?: string;
	recurrenceThresholds?: RecurrenceThresholds;
	syncDirectory?: (directory: string) => void;
	checkpointWriter?: typeof writeEvolutionProjectionCheckpoint;
};

export type AppendRecurrenceDecisionInput = {
	root: string;
	db?: Database;
	projectId: string;
	timezone?: string;
	clusterId: string;
	action: "confirm" | "dismiss" | "reopen";
	authority: RecurrenceAuthorityCapability;
	fingerprintVersion: number;
	observationIds: readonly string[];
	sourceDecisionRef: string;
	sourceRefs: Array<Record<string, string>>;
	eventId?: string;
	now?: Date;
	evolutionEventsDir?: string;
	recurrenceThresholds?: RecurrenceThresholds;
	checkpointWriter?: typeof writeEvolutionProjectionCheckpoint;
};

function insertEvent(
	db: Database,
	event: ObservationJournalEvent,
	thresholds?: RecurrenceThresholds,
): void {
	const payload = event.payload;
	if (event.event_type === "observation") {
		const observation = (payload.observation ?? payload) as Record<
			string,
			unknown
		>;
		projectObservation(db, {
			project_id: String(payload.project_id),
			id: String(observation.id),
			kind: String(observation.kind),
			fingerprint: String(observation.fingerprint),
			fingerprint_version: Number(observation.fingerprint_version),
			occurrence_identity: String(observation.occurrence_identity),
			session_id: String(observation.session_id),
			production_day_sequence: Number(observation.production_day_sequence ?? 0),
			task_type: String(observation.task_type),
			impact: String(observation.impact),
			normalized_fields:
				observation.normalized_fields as ObservationRecord["normalized_fields"],
			source_refs: observation.source_refs as ObservationRecord["source_refs"],
			created_at: String(observation.created_at),
			journal_sequence: event.sequence,
			journal_event_id: event.event_id,
		});
		refreshCluster(
			db,
			String(payload.project_id),
			String(observation.fingerprint),
			Number(observation.fingerprint_version),
			event.timestamp,
			thresholds,
		);
	} else {
		const fingerprint = String(payload.fingerprint ?? payload.cluster_id);
		const receipt = payload.decision as Record<string, unknown>;
		const projectedIds = (
			db
				.query(
					"SELECT id FROM observations WHERE project_id = ? AND fingerprint_version = ? AND fingerprint = ? ORDER BY id",
				)
				.all(
					String(payload.project_id),
					Number(receipt.fingerprintVersion),
					fingerprint,
				) as Array<{ id: string }>
		).map((row) => row.id);
		const receiptIds = [...(receipt.observationIds as string[])].sort();
		if (stableJson(projectedIds) !== stableJson(receiptIds))
			throw new Error(
				"recurrence decision membership differs from projected observations",
			);
		db.query(
			`INSERT INTO recurrence_decisions
			(project_id,id,fingerprint_version,fingerprint,action,observation_ids,observation_membership_digest,source_decision_ref,decision_digest,source_refs,created_at,journal_sequence,journal_event_id)
			VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		).run(
			String(payload.project_id),
			String(receipt.id),
			Number(receipt.fingerprintVersion),
			fingerprint,
			event.action,
			JSON.stringify(receipt.observationIds),
			String(receipt.observationMembershipDigest),
			String(receipt.sourceDecisionRef),
			String(payload.decision_digest),
			JSON.stringify(event.source_refs),
			event.timestamp,
			event.sequence,
			event.event_id,
		);
		refreshCluster(
			db,
			String(payload.project_id),
			fingerprint,
			Number(receipt.fingerprintVersion),
			event.timestamp,
			thresholds,
		);
	}
}

function rowToObservation(row: Record<string, unknown>): ObservationRecord {
	return {
		project_id: String(row.project_id),
		id: String(row.id),
		kind: String(row.kind),
		fingerprint: String(row.fingerprint),
		fingerprint_version: Number(row.fingerprint_version),
		occurrence_identity: String(row.occurrence_identity),
		session_id: String(row.session_id),
		production_day_sequence: Number(row.production_day_sequence),
		task_type: String(row.task_type),
		impact: String(row.impact),
		normalized_fields: JSON.parse(String(row.normalized_fields)),
		source_refs: JSON.parse(String(row.source_refs)),
		created_at: String(row.created_at),
		journal_sequence: Number(row.journal_sequence),
		journal_event_id: String(row.journal_event_id),
	};
}

function refreshCluster(
	db: Database,
	projectId: string,
	fingerprint: string,
	fingerprintVersion: number,
	now: string,
	thresholds?: RecurrenceThresholds,
): void {
	const rows = db
		.query(
			"SELECT * FROM observations WHERE project_id = ? AND fingerprint_version = ? AND fingerprint = ? ORDER BY journal_sequence",
		)
		.all(projectId, fingerprintVersion, fingerprint)
		.map((row) => rowToObservation(row as Record<string, unknown>));
	if (rows.length === 0) return;
	const automatic = deriveRecurrenceDecision(rows, false, thresholds);
	const latestObservation = rows.at(-1);
	const latestDecision = db
		.query(
			"SELECT action, journal_event_id, journal_sequence FROM recurrence_decisions WHERE project_id = ? AND fingerprint_version = ? AND fingerprint = ? ORDER BY journal_sequence DESC LIMIT 1",
		)
		.get(projectId, fingerprintVersion, fingerprint) as {
		action?: unknown;
		journal_event_id?: unknown;
		journal_sequence?: unknown;
	} | null;
	const action = String(latestDecision?.action ?? "");
	const latestObservationSequence = Number(
		latestObservation?.journal_sequence ?? 0,
	);
	const latestDecisionSequence = Number(latestDecision?.journal_sequence ?? 0);
	const reopenedAfterDismiss =
		action === "dismiss" && latestObservationSequence > latestDecisionSequence;
	const state =
		action === "dismiss"
			? reopenedAfterDismiss
				? "reopened"
				: "dismissed"
			: action === "reopen"
				? "reopened"
				: action === "confirm"
					? "recurring"
					: automatic.state;
	const userConfirmed =
		(action === "confirm" || action === "reopen") && !reopenedAfterDismiss;
	const priority =
		state === "dismissed"
			? 0
			: state === "reopened"
				? 2
				: userConfirmed
					? 3
					: state === "recurring"
						? 2
						: state === "candidate"
							? 1
							: 0;
	db.query(
		`INSERT INTO issue_clusters
		(project_id,fingerprint_version,fingerprint,state,occurrence_count,distinct_session_count,distinct_production_day_count,user_confirmed_recurrence,first_seen_at,last_seen_at,priority,source_refs,updated_at,journal_event_id)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
		ON CONFLICT(project_id,fingerprint_version,fingerprint) DO UPDATE SET
		state=excluded.state, occurrence_count=excluded.occurrence_count,
		distinct_session_count=excluded.distinct_session_count,
		distinct_production_day_count=excluded.distinct_production_day_count,
		user_confirmed_recurrence=excluded.user_confirmed_recurrence,
		first_seen_at=excluded.first_seen_at, last_seen_at=excluded.last_seen_at,
		priority=excluded.priority, source_refs=excluded.source_refs,
		updated_at=excluded.updated_at, journal_event_id=excluded.journal_event_id`,
	).run(
		projectId,
		fingerprintVersion,
		fingerprint,
		state,
		automatic.occurrence_count,
		automatic.distinct_session_count,
		automatic.distinct_production_day_count,
		userConfirmed ? 1 : 0,
		rows[0]?.created_at ?? now,
		latestObservation?.created_at ?? now,
		priority,
		JSON.stringify(rows.flatMap((row) => row.source_refs)),
		now,
		String(
			reopenedAfterDismiss
				? latestObservation?.journal_event_id
				: (latestDecision?.journal_event_id ??
						latestObservation?.journal_event_id),
		),
	);
}

function projectionSnapshot(
	db: Database,
	projectId: string,
): Record<string, unknown[]> {
	return Object.fromEntries(
		["observations", "recurrence_decisions", "issue_clusters"].map((table) => [
			table,
			db
				.query(`SELECT * FROM ${table} WHERE project_id = ? ORDER BY 1, 2`)
				.all(projectId),
		]),
	);
}

function replayObservationProjection(
	db: Database,
	projectId: string,
	events: readonly ObservationJournalEvent[],
	thresholds: RecurrenceThresholds,
	path: string,
): void {
	validateObservationProductionDays(db, projectId, events);
	applyMigrations(db);
	db.exec("BEGIN IMMEDIATE");
	try {
		db.query("DELETE FROM recurrence_decisions WHERE project_id = ?").run(
			projectId,
		);
		db.query("DELETE FROM issue_clusters WHERE project_id = ?").run(projectId);
		db.query("DELETE FROM observations WHERE project_id = ?").run(projectId);
		for (const event of events) insertEvent(db, event, thresholds);
		if (events.length > 0) writeProjectionWatermark(db, "observation", path);
		else clearProjectionWatermark(db, "observation");
		db.exec("COMMIT");
	} catch (error) {
		try {
			db.exec("ROLLBACK");
		} catch {}
		throw error;
	}
}

function appendUnlocked(input: AppendObservationJournalInput): {
	event: ObservationJournalEvent;
	appended: boolean;
} {
	const context = resolvedJournalContext(input.root, input.projectId, input);
	if (input.observation.project_id !== input.projectId)
		throw new Error("observation belongs to another project");
	if (input.db)
		validateProductionDayProjection({
			root: input.root,
			projectId: input.projectId,
			timezone: context.timezone,
			db: input.db,
			evolutionEventsDir: context.evolutionEventsDir,
		});
	if (input.db && input.observation.production_day_sequence > 0) {
		const found = input.db
			.query(
				"SELECT 1 AS found FROM production_days WHERE project_id = ? AND ordinal_sequence = ?",
			)
			.get(input.projectId, input.observation.production_day_sequence);
		if (!found)
			throw new Error(
				`observation references missing production ordinal ${input.observation.production_day_sequence}`,
			);
	}
	const refs = sourceRefs(
		input.sourceRefs ?? input.observation.source_refs,
		"system_observer",
	);
	const path = observationJournalPath(input.root, context.evolutionEventsDir);
	const events = readObservationJournal(
		input.root,
		input.projectId,
		context.evolutionEventsDir,
	);
	if (input.db)
		replayObservationProjection(
			input.db,
			input.projectId,
			events,
			context.recurrenceThresholds,
			path,
		);
	const observation = {
		...input.observation,
		journal_sequence: events.length + 1,
		journal_event_id:
			input.eventId ??
			input.observation.journal_event_id ??
			`OBS-${randomUUID()}`,
		source_refs: refs,
	};
	const eventId = observation.journal_event_id;
	const duplicate = events.find(
		(event) =>
			event.event_type === "observation" &&
			String(
				(event.payload.observation as Record<string, unknown>)
					?.occurrence_identity,
			) === String(observation.occurrence_identity),
	);
	const duplicateEvent = events.find((event) => event.event_id === eventId);
	const duplicateObservationId = events.find(
		(event) =>
			event.event_type === "observation" &&
			String((event.payload.observation as Record<string, unknown>)?.id) ===
				String(observation.id),
	);
	if (duplicateEvent && !duplicate)
		throw new Error("observation journal event id already exists");
	if (duplicateObservationId && !duplicate)
		throw new Error("observation id already exists with different content");
	if (duplicate) {
		const duplicateObservation = duplicate.payload.observation as Record<
			string,
			unknown
		>;
		if (
			observationContentDigest(duplicateObservation) !==
			observationContentDigest(observation)
		)
			throw new Error(
				"observation occurrence already exists with different content",
			);
		return { event: duplicate, appended: false };
	}
	const payload = { project_id: input.projectId, observation };
	const base = {
		sequence: events.length + 1,
		event_id: eventId,
		event_type: "observation" as const,
		action: "record" as const,
		authority_kind: "system_observer" as const,
		actor: "afol",
		caller_type: "system" as const,
		trust_level: "local_trusted" as const,
		origin_ref: relative(input.root, path).replaceAll("\\", "/"),
		subject_id: String(observation.id),
		timestamp: (input.now ?? new Date()).toISOString(),
		command: "afol evolution observation record",
		previous_event_digest: events.at(-1)?.event_digest ?? GENESIS,
		payload,
		payload_digest: observationDigest(payload),
		source_refs: refs,
	};
	const event = {
		...base,
		event_digest: observationDigest(base),
	} as ObservationJournalEvent;
	validateEvent(
		event,
		events.length,
		events.at(-1)?.event_digest ?? GENESIS,
		input.projectId,
	);
	const target = assertSafeEvolutionTarget(path, "observation journal target");
	const previousSize = Number(target?.size ?? 0);
	mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
	if (process.platform !== "win32") chmodSync(dirname(path), 0o700);
	try {
		const fd = openSync(
			path,
			openFlags(
				fsConstants.O_WRONLY | fsConstants.O_APPEND | fsConstants.O_CREAT,
			),
			0o600,
		);
		try {
			assertWritableAppendFd(fd, path, target);
			writeSync(fd, `${JSON.stringify(event)}\n`, null, "utf8");
			fsyncSync(fd);
		} finally {
			closeSync(fd);
		}
		if (process.platform !== "win32") chmodSync(path, 0o600);
		syncParentDirectory(path);
		input.syncDirectory?.(dirname(path));
		if (input.db) {
			input.db.exec("BEGIN IMMEDIATE");
			try {
				insertEvent(input.db, event, context.recurrenceThresholds);
				writeProjectionWatermark(input.db, "observation", path);
				input.db.exec("COMMIT");
			} catch (error) {
				try {
					input.db.exec("ROLLBACK");
				} catch {}
				truncate(path, previousSize);
				throw error;
			}
			try {
				(input.checkpointWriter ?? writeEvolutionProjectionCheckpoint)({
					root: input.root,
					db: input.db,
					projectId: input.projectId,
					eventsDir: context.evolutionEventsDir,
					...(input.now ? { now: input.now } : {}),
				});
			} catch (checkpointError) {
				truncate(path, previousSize);
				try {
					replayObservationProjection(
						input.db,
						input.projectId,
						events,
						context.recurrenceThresholds,
						path,
					);
				} catch (restoreError) {
					throw new AggregateError(
						[checkpointError, restoreError],
						"observation checkpoint failed and projection rollback failed",
					);
				}
				throw checkpointError;
			}
		}
		return { event, appended: true };
	} catch (error) {
		try {
			truncate(path, previousSize);
		} catch {}
		throw error;
	}
}

export function appendObservationJournalEvent(
	input: AppendObservationJournalInput,
): ObservationJournalEvent {
	return appendObservationJournalEventWithStatus(input).event;
}

export function appendObservationJournalEventWithStatus(
	input: AppendObservationJournalInput,
): { event: ObservationJournalEvent; appended: boolean } {
	return withSessionLock(input.root, LOCK, () => appendUnlocked(input));
}

export function appendRecurrenceDecisionReceipt(
	input: AppendRecurrenceDecisionInput,
): ObservationJournalEvent {
	return withSessionLock(input.root, LOCK, () => {
		const context = resolvedJournalContext(input.root, input.projectId, input);
		if (input.db)
			validateProductionDayProjection({
				root: input.root,
				projectId: input.projectId,
				timezone: context.timezone,
				db: input.db,
				evolutionEventsDir: context.evolutionEventsDir,
			});
		const path = observationJournalPath(input.root, context.evolutionEventsDir);
		const events = readObservationJournal(
			input.root,
			input.projectId,
			context.evolutionEventsDir,
		);
		if (input.db)
			replayObservationProjection(
				input.db,
				input.projectId,
				events,
				context.recurrenceThresholds,
				path,
			);
		const eventId = input.eventId ?? `REC-${randomUUID()}`;
		const refs = sourceRefs(input.sourceRefs, "explicit_project_user");
		const decision = recurrenceDecisionForAuthority(input.authority);
		assertRecurrenceAuthority(
			input.authority,
			input.projectId,
			"project_user",
			{
				fingerprintVersion: input.fingerprintVersion,
				fingerprint: input.clusterId,
				action: input.action,
				observationIds: input.observationIds,
				sourceDecisionRef: input.sourceDecisionRef,
				observationMembershipDigest: decision.observationMembershipDigest,
			},
		);
		const journalObservationIds = events
			.filter((event) => event.event_type === "observation")
			.filter(
				(event) =>
					String(
						(event.payload.observation as Record<string, unknown>)?.fingerprint,
					) === input.clusterId,
			)
			.map((event) =>
				String((event.payload.observation as Record<string, unknown>).id),
			)
			.sort();
		const receiptObservationIds = [...input.observationIds].map(String).sort();
		if (stableJson(journalObservationIds) !== stableJson(receiptObservationIds))
			throw new Error(
				"recurrence decision membership differs from canonical observations",
			);
		const payload = {
			project_id: input.projectId,
			cluster_id: input.clusterId,
			fingerprint: input.clusterId,
			action: input.action,
			decision_digest: recurrenceDecisionDigest(decision),
			decision,
		};
		const duplicateDecision = events.find(
			(event) =>
				event.event_type === "recurrence_decision" &&
				(event.payload.decision as Record<string, unknown> | undefined)?.id ===
					decision.id,
		);
		if (duplicateDecision) {
			if (
				observationDigest(duplicateDecision.payload) !==
				observationDigest(payload)
			)
				throw new Error(
					"recurrence decision already exists with different content",
				);
			return duplicateDecision;
		}
		const duplicateEvent = events.find((event) => event.event_id === eventId);
		if (duplicateEvent) {
			if (
				duplicateEvent.event_type !== "recurrence_decision" ||
				observationDigest(duplicateEvent.payload) !== observationDigest(payload)
			)
				throw new Error("observation journal event id already exists");
			return duplicateEvent;
		}
		const base = {
			sequence: events.length + 1,
			event_id: eventId,
			event_type: "recurrence_decision" as const,
			action: input.action,
			authority_kind: "explicit_project_user" as const,
			actor: "project_user",
			caller_type: "project_user" as const,
			trust_level: "local_trusted" as const,
			origin_ref: relative(input.root, path).replaceAll("\\", "/"),
			subject_id: decision.id,
			timestamp: (input.now ?? new Date()).toISOString(),
			command: `afol evolution recurrence ${input.action}`,
			previous_event_digest: events.at(-1)?.event_digest ?? GENESIS,
			payload,
			payload_digest: observationDigest(payload),
			source_refs: refs,
		};
		const event = {
			...base,
			event_digest: observationDigest(base),
		} as ObservationJournalEvent;
		validateEvent(
			event,
			events.length,
			events.at(-1)?.event_digest ?? GENESIS,
			input.projectId,
		);
		const previousTarget = assertSafeEvolutionTarget(
			path,
			"observation journal target",
		);
		const previousSize = Number(previousTarget?.size ?? 0);
		mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
		try {
			const fd = openSync(
				path,
				openFlags(
					fsConstants.O_WRONLY | fsConstants.O_APPEND | fsConstants.O_CREAT,
				),
				0o600,
			);
			try {
				assertWritableAppendFd(fd, path, previousTarget);
				writeSync(fd, `${JSON.stringify(event)}\n`, null, "utf8");
				fsyncSync(fd);
			} finally {
				closeSync(fd);
			}
			syncParentDirectory(path);
			if (input.db) {
				input.db.exec("BEGIN IMMEDIATE");
				try {
					insertEvent(input.db, event, context.recurrenceThresholds);
					writeProjectionWatermark(input.db, "observation", path);
					input.db.exec("COMMIT");
				} catch (error) {
					try {
						input.db.exec("ROLLBACK");
					} catch {}
					truncate(path, previousSize);
					throw error;
				}
				try {
					(input.checkpointWriter ?? writeEvolutionProjectionCheckpoint)({
						root: input.root,
						db: input.db,
						projectId: input.projectId,
						eventsDir: context.evolutionEventsDir,
						...(input.now ? { now: input.now } : {}),
					});
				} catch (checkpointError) {
					truncate(path, previousSize);
					try {
						replayObservationProjection(
							input.db,
							input.projectId,
							events,
							context.recurrenceThresholds,
							path,
						);
					} catch (restoreError) {
						throw new AggregateError(
							[checkpointError, restoreError],
							"recurrence checkpoint failed and projection rollback failed",
						);
					}
					throw checkpointError;
				}
			}
			return event;
		} catch (error) {
			try {
				truncate(path, previousSize);
			} catch {}
			throw error;
		}
	});
}

export function validateObservationProjection(
	context: ObservationJournalContext & { db: Database },
): void {
	const resolved = resolvedJournalContext(
		context.root,
		context.projectId,
		context,
	);
	const events = readObservationJournal(
		context.root,
		context.projectId,
		resolved.evolutionEventsDir,
	);
	validateProductionDayProjection({
		root: context.root,
		projectId: context.projectId,
		timezone: resolved.timezone,
		db: context.db,
		evolutionEventsDir: resolved.evolutionEventsDir,
	});
	validateObservationProductionDays(context.db, context.projectId, events);
	const expected = new Database(":memory:");
	try {
		applyMigrations(expected);
		for (const event of events)
			insertEvent(expected, event, resolved.recurrenceThresholds);
		const actual = projectionSnapshot(context.db, context.projectId);
		const replayed = projectionSnapshot(expected, context.projectId);
		for (const table of Object.keys(replayed))
			if (
				observationDigest(actual[table]) !== observationDigest(replayed[table])
			) {
				const actualRows = (actual[table] ?? []) as Array<
					Record<string, unknown>
				>;
				const replayedRows = (replayed[table] ?? []) as Array<
					Record<string, unknown>
				>;
				const columns = new Set([
					...actualRows.flatMap((row) => Object.keys(row)),
					...replayedRows.flatMap((row) => Object.keys(row)),
				]);
				const differingColumns = [...columns].filter(
					(column) =>
						observationDigest(actualRows.map((row) => row[column])) !==
						observationDigest(replayedRows.map((row) => row[column])),
				);
				throw new Error(
					`evolution db ${table} projection differs from canonical journal (${differingColumns.join(",") || "row count"})`,
				);
			}
	} finally {
		expected.close();
	}
}

export function rebuildObservationProjection(
	context: ObservationJournalContext & { db: Database },
): void {
	withSessionLock(context.root, LOCK, () => {
		const resolved = resolvedJournalContext(
			context.root,
			context.projectId,
			context,
		);
		validateProductionDayProjection({
			root: context.root,
			projectId: context.projectId,
			timezone: resolved.timezone,
			db: context.db,
			evolutionEventsDir: resolved.evolutionEventsDir,
		});
		const events = readObservationJournal(
			context.root,
			context.projectId,
			resolved.evolutionEventsDir,
		);
		validateObservationProductionDays(context.db, context.projectId, events);
		applyMigrations(context.db);
		context.db.exec("BEGIN IMMEDIATE");
		try {
			context.db
				.query("DELETE FROM recurrence_decisions WHERE project_id = ?")
				.run(context.projectId);
			context.db
				.query("DELETE FROM issue_clusters WHERE project_id = ?")
				.run(context.projectId);
			context.db
				.query("DELETE FROM observations WHERE project_id = ?")
				.run(context.projectId);
			for (const event of events)
				insertEvent(context.db, event, resolved.recurrenceThresholds);
			if (events.length > 0)
				writeProjectionWatermark(
					context.db,
					"observation",
					observationJournalPath(context.root, resolved.evolutionEventsDir),
				);
			else clearProjectionWatermark(context.db, "observation");
			context.db.exec("COMMIT");
			writeEvolutionProjectionCheckpoint({
				root: context.root,
				db: context.db,
				projectId: context.projectId,
				eventsDir: resolved.evolutionEventsDir,
			});
		} catch (error) {
			try {
				context.db.exec("ROLLBACK");
			} catch {}
			throw error;
		}
	});
}

export { deriveRecurrenceDecision, observationFingerprint, occurrenceIdentity };
