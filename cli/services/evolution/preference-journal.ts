import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import {
	chmodSync,
	closeSync,
	constants as fsConstants,
	fstatSync,
	fsyncSync,
	mkdirSync,
	openSync,
	writeSync,
} from "node:fs";
import { dirname, relative } from "node:path";
import { withSessionLock } from "../io/session-lock";
import { validateEvolutionIdentity } from "./config";
import { assertSafeEvolutionTarget } from "./db";
import { productionDayValidationDependencies } from "./journal";
import { applyMigrations } from "./migrations";
import {
	assertPreferenceAuthority,
	type PreferenceAuthorityCapability,
	preferenceDecisionDigest,
	preferenceDecisionForAuthority,
} from "./preference-authority";
import { refreshPreferenceDecayProjection } from "./preference-decay";
import { preferenceJournalPath } from "./preference-journal-path";
import {
	expectedAuthority,
	GENESIS_DIGEST,
	openFlags,
	preferenceDigest,
	READ_RETRIES,
	readPreferenceJournal,
	truncateJournal,
	validateEvent,
	validateSourceRefs,
} from "./preference-journal-reader";
import {
	applyPreferenceJournalEvent,
	projectPreferenceRows,
} from "./preference-projection";
import type {
	PreferenceEvidenceRecord,
	PreferenceJournalContext,
	PreferenceJournalEvent,
	PreferenceJournalPayload,
	PreferenceRecord,
} from "./preference-types";
import { validateProductionDayProjection } from "./production-day-validation";

export type {
	PreferenceJournalContext,
	PreferenceJournalEvent,
	PreferenceJournalPayload,
} from "./preference-types";

const JOURNAL_LOCK = "__evolution-journal__";

export { preferenceJournalPath } from "./preference-journal-path";
export {
	preferenceDigest,
	readPreferenceJournal,
} from "./preference-journal-reader";

type PreferenceProjectionSnapshot = {
	preferences: PreferenceRecord[];
	evidence: Array<Record<string, unknown>>;
};

function parseJson(value: unknown): unknown {
	try {
		return JSON.parse(String(value));
	} catch {
		return value;
	}
}

function preferenceProjectionSnapshot(
	db: Database,
	projectId: string,
): PreferenceProjectionSnapshot {
	const evidence = db
		.query(
			"SELECT project_id,id,preference_id,kind,trust,weight,production_day_sequence,created_at,journal_event_id,source_refs FROM preference_evidence WHERE project_id = ? ORDER BY id",
		)
		.all(projectId)
		.map((row) => {
			const value = row as Record<string, unknown>;
			return {
				...value,
				source_refs: parseJson(value.source_refs),
			};
		});
	return {
		preferences: projectPreferenceRows(db, projectId),
		evidence,
	};
}

function preferenceProjectIds(db: Database, projectId: string): string[] {
	const rows = db
		.query(
			"SELECT project_id FROM preferences WHERE project_id = ? UNION SELECT project_id FROM preference_evidence WHERE project_id = ?",
		)
		.all(projectId, projectId) as Array<{ project_id?: unknown }>;
	return rows.map((row) => String(row.project_id ?? ""));
}

/** Ensures the mutable preference tables are exactly the deterministic journal projection. */
export function validatePreferenceProjection(
	context: PreferenceJournalContext & { db: Database },
): void {
	let lastError: unknown;
	for (let attempt = 0; attempt < READ_RETRIES; attempt += 1) {
		try {
			const before = readPreferenceJournal(
				context.root,
				context.projectId,
				context.evolutionEventsDir,
			);
			const current = context.db
				.query(
					"SELECT MAX(ordinal_sequence) AS sequence FROM production_days WHERE project_id = ?",
				)
				.get(context.projectId) as { sequence?: number } | null;
			const currentProductionDay = Number(current?.sequence ?? 0);
			const expectedDb = new Database(":memory:");
			try {
				applyMigrations(expectedDb);
				for (const event of before)
					applyPreferenceJournalEvent(expectedDb, event, true);
				refreshPreferenceDecayProjection(
					expectedDb,
					context.projectId,
					currentProductionDay,
				);
				const expected = preferenceProjectionSnapshot(
					expectedDb,
					context.projectId,
				);
				const actual = preferenceProjectionSnapshot(
					context.db,
					context.projectId,
				);
				const after = readPreferenceJournal(
					context.root,
					context.projectId,
					context.evolutionEventsDir,
				);
				const actualAfter = preferenceProjectionSnapshot(
					context.db,
					context.projectId,
				);
				if (
					preferenceDigest(before) !== preferenceDigest(after) ||
					preferenceDigest(actual) !== preferenceDigest(actualAfter)
				) {
					lastError = new Error(
						"evolution preference state changed during read",
					);
					continue;
				}
				if (
					preferenceProjectIds(context.db, context.projectId).some(
						(projectId) => projectId !== context.projectId,
					) ||
					preferenceDigest(actual) !== preferenceDigest(expected)
				)
					throw new Error(
						"evolution db preference projection differs from canonical preference journal",
					);
				return;
			} finally {
				expectedDb.close();
			}
		} catch (error) {
			lastError = error;
			if (
				!(
					error instanceof Error &&
					error.message === "evolution preference state changed during read"
				)
			)
				throw error;
		}
	}
	throw lastError;
}

export type AppendPreferenceJournalInput = {
	root: string;
	db?: Database;
	projectId: string;
	authority: PreferenceAuthorityCapability;
	preference: PreferenceRecord;
	evidence?: PreferenceEvidenceRecord;
	action: PreferenceJournalEvent["action"];
	sourceRefs: Array<Record<string, string>>;
	eventId?: string;
	now?: Date;
	evolutionEventsDir?: string;
	/** Narrow fault-injection seam for durability tests. */
	syncDirectory?: (directory: string) => void;
};

export type LockedPreferenceAppender = (
	input: AppendPreferenceJournalInput,
) => PreferenceJournalEvent;

export function withPreferenceMutationLock<T>(
	root: string,
	operation: (append: LockedPreferenceAppender) => T,
): T {
	return withSessionLock(root, JOURNAL_LOCK, () => {
		let active = true;
		const append: LockedPreferenceAppender = (input) => {
			if (!active)
				throw new Error("preference mutation appender is no longer active");
			return appendPreferenceJournalEventUnlocked(input);
		};
		try {
			return operation(append);
		} finally {
			active = false;
		}
	});
}

export function appendPreferenceJournalEvent(
	input: AppendPreferenceJournalInput,
): PreferenceJournalEvent {
	return withPreferenceMutationLock(input.root, (append) => append(input));
}

function appendPreferenceJournalEventUnlocked(
	input: AppendPreferenceJournalInput,
): PreferenceJournalEvent {
	validateEvolutionIdentity({ projectId: input.projectId, timezone: "UTC" });
	if (input.preference.project_id !== input.projectId)
		throw new Error("preference belongs to another project");
	validateSourceRefs(input.sourceRefs, "preference journal source refs");
	const mutationKind = input.evidence?.kind ?? input.preference.provenance;
	if (mutationKind === "external")
		throw new Error("external evidence cannot mutate preferences directly");
	const expectedAction = input.action === "reopen" ? "reopen" : input.action;
	assertPreferenceAuthority(
		input.authority,
		input.projectId,
		mutationKind === "structural" ? "policy" : "project_user",
		{
			preferenceId: input.preference.id,
			action: expectedAction,
			provenance: input.preference.provenance,
		},
	);
	const path = preferenceJournalPath(input.root, input.evolutionEventsDir);
	const events = readPreferenceJournal(
		input.root,
		input.projectId,
		input.evolutionEventsDir,
	);
	const duplicate = input.evidence
		? events.find((event) => event.payload.evidence?.id === input.evidence?.id)
		: undefined;
	if (duplicate) {
		const duplicateEvidence = duplicate.payload.evidence;
		const comparableInput = input.evidence
			? { ...input.evidence, journal_event_id: "" }
			: undefined;
		const comparableStored = duplicateEvidence
			? { ...duplicateEvidence, journal_event_id: "" }
			: undefined;
		if (
			duplicate.payload.preference.id !== input.preference.id ||
			duplicate.payload.preference.statement !== input.preference.statement ||
			preferenceDigest(comparableStored) !== preferenceDigest(comparableInput)
		)
			throw new Error(
				"preference evidence id already exists with different content",
			);
		if (input.db) {
			input.db.exec("BEGIN IMMEDIATE");
			try {
				applyPreferenceJournalEvent(input.db, duplicate, true);
				input.db.exec("COMMIT");
			} catch (error) {
				try {
					input.db.exec("ROLLBACK");
				} catch {}
				throw error;
			}
		}
		return duplicate;
	}
	const previousTarget = assertSafeEvolutionTarget(
		path,
		"preference journal target",
	);
	const existedBefore = previousTarget !== null;
	const previousSize = Number(previousTarget?.size ?? 0);
	const eventId = input.eventId ?? `PREF-${randomUUID()}`;
	const decision = preferenceDecisionForAuthority(input.authority);
	const decisionDigest = preferenceDecisionDigest(decision);
	const originRef = relative(input.root, path).replaceAll("\\", "/");
	const decisionRef = {
		id: decision.id,
		kind: "decision",
		path: originRef,
		digest: decisionDigest,
		authority: "canonical",
	};
	const persistedSourceRefs = [
		...input.sourceRefs.filter((ref) => ref.kind !== "decision"),
		decisionRef,
	];
	const preference = {
		...input.preference,
		journal_event_id: eventId,
		source_refs: persistedSourceRefs,
	};
	const evidence = input.evidence
		? {
				...input.evidence,
				journal_event_id: eventId,
				source_refs: persistedSourceRefs,
			}
		: undefined;
	const payload: PreferenceJournalPayload = {
		project_id: input.projectId,
		preference,
		...(evidence ? { evidence } : {}),
	};
	const authority = expectedAuthority(mutationKind);
	const base = {
		sequence: events.length + 1,
		event_id: eventId,
		event_type: "preference" as const,
		action: input.action,
		authority_kind: authority.authority_kind,
		actor: "afol",
		caller_type: authority.caller_type,
		trust_level: "local_trusted" as const,
		origin_ref: originRef,
		subject_id: preference.id,
		timestamp: (input.now ?? new Date()).toISOString(),
		command: `afol evolution preference ${input.action}`,
		previous_event_digest: events.at(-1)?.event_digest ?? GENESIS_DIGEST,
		payload,
		payload_digest: preferenceDigest(payload),
		source_refs: persistedSourceRefs,
		decision,
		decision_digest: decisionDigest,
	};
	const event = {
		...base,
		event_digest: preferenceDigest(base),
	} as PreferenceJournalEvent;
	validateEvent(
		input.root,
		event,
		events.length,
		events.at(-1)?.event_digest ?? GENESIS_DIGEST,
		input.projectId,
	);
	mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
	if (process.platform !== "win32") chmodSync(dirname(path), 0o700);
	assertSafeEvolutionTarget(path, "preference journal target");
	try {
		const fd = openSync(
			path,
			openFlags(
				fsConstants.O_WRONLY | fsConstants.O_APPEND | fsConstants.O_CREAT,
			),
			0o600,
		);
		try {
			const opened = fstatSync(fd);
			if (!opened.isFile() || opened.nlink !== 1)
				throw new Error("preference journal target must be a regular file");
			writeSync(fd, `${JSON.stringify(event)}\n`, null, "utf8");
			fsyncSync(fd);
			if (process.platform !== "win32") chmodSync(path, 0o600);
		} finally {
			closeSync(fd);
		}
		if (!existedBefore) {
			if (process.platform !== "win32") {
				const directoryFd = openSync(dirname(path), "r");
				try {
					fsyncSync(directoryFd);
				} finally {
					closeSync(directoryFd);
				}
			}
			input.syncDirectory?.(dirname(path));
		}
		if (input.db) {
			input.db.exec("BEGIN IMMEDIATE");
			try {
				applyPreferenceJournalEvent(input.db, event, true);
				input.db.exec("COMMIT");
			} catch (error) {
				try {
					input.db.exec("ROLLBACK");
				} catch {}
				truncateJournal(path, previousSize);
				throw error;
			}
		}
		return event;
	} catch (error) {
		try {
			truncateJournal(path, previousSize);
		} catch {
			/* preserve original error */
		}
		throw error;
	}
}

export function rebuildPreferenceProjection(
	context: PreferenceJournalContext & { db: Database },
): PreferenceRecord[] {
	return withSessionLock(context.root, JOURNAL_LOCK, () => {
		validateProductionDayProjection(
			{
				root: context.root,
				projectId: context.projectId,
				timezone: context.timezone ?? "UTC",
				db: context.db,
				...(context.evolutionEventsDir
					? { evolutionEventsDir: context.evolutionEventsDir }
					: {}),
			},
			productionDayValidationDependencies,
		);
		const events = readPreferenceJournal(
			context.root,
			context.projectId,
			context.evolutionEventsDir,
		);
		applyMigrations(context.db);
		context.db.exec("BEGIN IMMEDIATE");
		try {
			context.db
				.prepare("DELETE FROM preference_evidence WHERE project_id = ?")
				.run(context.projectId);
			context.db
				.prepare("DELETE FROM preferences WHERE project_id = ?")
				.run(context.projectId);
			for (const event of events)
				applyPreferenceJournalEvent(context.db, event, true);
			const production = context.db
				.query(
					"SELECT MAX(ordinal_sequence) AS sequence FROM production_days WHERE project_id = ?",
				)
				.get(context.projectId) as { sequence?: number } | null;
			refreshPreferenceDecayProjection(
				context.db,
				context.projectId,
				Number(production?.sequence ?? 0),
			);
			context.db.exec("COMMIT");
		} catch (error) {
			try {
				context.db.exec("ROLLBACK");
			} catch {}
			throw error;
		}
		return projectPreferenceRows(context.db, context.projectId);
	});
}
