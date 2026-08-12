import { Database } from "bun:sqlite";
import { createHash, randomUUID } from "node:crypto";
import {
	closeSync,
	constants as fsConstants,
	fstatSync,
	fsyncSync,
	ftruncateSync,
	type lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	writeSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { withSessionLock } from "../io/session-lock";
import { resolveProjectWritePath } from "../project/root";
import { localDateForTimezone, validateEvolutionIdentity } from "./config";
import {
	assertSafeEvolutionProjectRoot,
	assertSafeEvolutionTarget,
} from "./db";
import { applyMigrations } from "./migrations";
import { refreshPreferenceDecayProjection } from "./preference-decay";
import { preferenceReinforcementExceedsProductionOrdinal } from "./preference-reinforcement-reader";
import {
	type ProductionDayProjectionValidationDependencies,
	validateProductionDayProjection as validateProductionDayProjectionLeaf,
} from "./production-day-validation";
import {
	allocateProductionDay,
	allocateProductionDayInTransaction,
	type ObservedProductionEvidence,
	type ProductionDay,
	readObservedProductionEvidence,
	verifyObservedProductionEvidence,
} from "./production-days";

const GENESIS_DIGEST = "GENESIS";
const JOURNAL_LOCK = "__evolution-journal__";
const READ_RETRIES = 3;
function assertWalEnabled(db: Database): void {
	const row = db.query("PRAGMA journal_mode").get() as Record<
		string,
		unknown
	> | null;
	const mode = Object.values(row ?? {}).find(
		(value) => typeof value === "string",
	);
	if (String(mode ?? "").toLowerCase() !== "wal") {
		throw new Error("evolution db requires WAL journal mode");
	}
}
export type ProductionDayJournalPayload = {
	project_id: string;
	timezone: string;
	local_date: string;
	qualifying_events: string[];
	evidence: ObservedProductionEvidence;
};
export type ProductionDayJournalEvent = {
	sequence: number;
	event_id: string;
	timestamp: string;
	previous_event_digest: string;
	payload: ProductionDayJournalPayload;
	payload_digest: string;
	event_digest: string;
	source_refs: Array<Record<string, string>>;
	[key: string]: unknown;
};
export type AppendProductionDayAllocationInput = {
	root: string;
	db: Database;
	projectId: string;
	timezone: string;
	sessionId: string;
	evidenceId: string;
	evolutionEventsDir?: string;
	workbenchDir?: string;
	expectedLocalDate?: string;
	now?: Date;
};
export type RebuildProductionDayProjectionInput = Pick<
	AppendProductionDayAllocationInput,
	"root" | "db" | "projectId" | "timezone" | "evolutionEventsDir"
>;
export type EvolutionJournalContext = {
	root: string;
	projectId: string;
	timezone: string;
	evolutionEventsDir?: string;
};

export type ProductionDayReceipt = {
	evidence_id: string;
	local_date: string;
	ordinal_sequence: number;
	journal_event_id: string;
};
function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value && typeof value === "object") {
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}
function digest(value: unknown): string {
	return createHash("sha256").update(stableJson(value)).digest("hex");
}
const journalError = (prefix: string, index: number): never => {
	throw new Error(`${prefix} at line ${index + 1}`);
};
export function productionDayJournalPath(
	root: string,
	eventsDir = ".afol/data/events/evolution",
): string {
	assertSafeEvolutionProjectRoot(root);
	const resolved = resolveProjectWritePath(root, eventsDir);
	if (!resolved.ok) throw new Error(resolved.error);
	return join(resolved.value.path, "production-day-allocations.jsonl");
}
function journalOpenFlags(flags: number): number {
	return process.platform === "win32"
		? flags
		: flags | (fsConstants.O_NOFOLLOW ?? 0);
}
function inspectJournalTarget(
	path: string,
): NonNullable<ReturnType<typeof lstatSync>> | null {
	return assertSafeEvolutionTarget(path, "production-day journal target");
}
type JournalFingerprint = {
	dev: number | bigint;
	ino: number | bigint;
	size: number;
	mtimeMs: number;
	ctimeMs: number;
};
function journalFingerprint(
	stat: NonNullable<ReturnType<typeof lstatSync>>,
): JournalFingerprint {
	return {
		dev: stat.dev,
		ino: stat.ino,
		size: Number(stat.size),
		mtimeMs: Number(stat.mtimeMs),
		ctimeMs: Number(stat.ctimeMs),
	};
}
function sameJournalFingerprint(
	left: JournalFingerprint,
	right: JournalFingerprint,
): boolean {
	return (
		left.dev === right.dev &&
		left.ino === right.ino &&
		left.size === right.size &&
		left.mtimeMs === right.mtimeMs &&
		left.ctimeMs === right.ctimeMs
	);
}
function readJournalText(path: string): string | null {
	const before = inspectJournalTarget(path);
	if (!before) return null;
	const beforeFingerprint = journalFingerprint(before);
	const fd = openSync(path, journalOpenFlags(fsConstants.O_RDONLY));
	try {
		const opened = fstatSync(fd);
		if (
			!opened.isFile() ||
			opened.nlink !== 1 ||
			!sameJournalFingerprint(beforeFingerprint, journalFingerprint(opened))
		)
			throw new Error("production-day journal target must be a regular file");
		const text = readFileSync(fd, "utf8");
		const after = inspectJournalTarget(path);
		if (
			!after ||
			!sameJournalFingerprint(beforeFingerprint, journalFingerprint(after))
		)
			throw new Error("production-day journal changed during read");
		return text;
	} finally {
		closeSync(fd);
	}
}
function truncateJournal(path: string, size: number): void {
	const before = inspectJournalTarget(path);
	if (!before) return;
	const beforeFingerprint = journalFingerprint(before);
	const fd = openSync(path, journalOpenFlags(fsConstants.O_WRONLY));
	try {
		const opened = fstatSync(fd);
		if (
			!opened.isFile() ||
			opened.nlink !== 1 ||
			!sameJournalFingerprint(beforeFingerprint, journalFingerprint(opened))
		)
			throw new Error("production-day journal target must be a regular file");
		ftruncateSync(fd, size);
		fsyncSync(fd);
		assertSafeEvolutionTarget(path, "production-day journal target", false);
	} finally {
		closeSync(fd);
	}
}
function validateEvent(
	root: string,
	event: ProductionDayJournalEvent,
	index: number,
	previousDigest: string,
	projectId: string,
	timezone: string,
): void {
	const fields = event as Record<string, unknown>;
	if (
		event.sequence !== index + 1 ||
		`${fields.event_type}:${fields.action}:${fields.authority_kind}:${fields.actor}:${fields.caller_type}:${fields.trust_level}` !==
			"production_day_allocation:allocate:system_observer:afol:local_agent:local_trusted"
	)
		journalError("invalid production-day journal sequence", index);
	if (event.previous_event_digest !== previousDigest)
		journalError("broken production-day journal hash chain", index);
	if (event.payload.project_id !== projectId)
		throw new Error("production-day journal belongs to another project");
	if (event.payload.timezone !== timezone)
		throw new Error("production-day journal timezone mismatch");
	const derivedDate = localDateForTimezone(
		new Date(event.payload.evidence.created_at),
		timezone,
	);
	if (event.payload.local_date !== derivedDate)
		throw new Error("production-day journal event-date mismatch");
	if (
		event.payload.evidence.project_id !== projectId ||
		event.payload.evidence.result !== "passed" ||
		event.payload.evidence.provenance !== "observed" ||
		event.payload.evidence.exit_code !== 0
	)
		throw new Error("production-day journal contains invalid evidence");
	const sourceRef = event.source_refs?.[0];
	if (
		event.source_refs?.length !== 1 ||
		!sourceRef?.path ||
		sourceRef.path.startsWith("/")
	)
		throw new Error("production-day journal evidence source is missing");
	if (
		`${sourceRef.id}:${sourceRef.kind}:${sourceRef.authority}` !==
		`${event.payload.evidence.id}:evidence:canonical`
	)
		throw new Error("production-day journal evidence source is invalid");
	verifyObservedProductionEvidence({
		root,
		projectId,
		sessionId: event.payload.evidence.session_id,
		evidenceId: event.payload.evidence.id,
		workbenchDir: dirname(dirname(sourceRef.path)),
		sourcePath: sourceRef.path,
		sourceDigest: event.payload.evidence.source_digest,
	});
	if (event.payload_digest !== digest(event.payload))
		journalError("production-day journal payload digest mismatch", index);
	const { event_digest: _stored, ...withoutDigest } = event;
	if (event.event_digest !== digest(withoutDigest))
		journalError("production-day journal event digest mismatch", index);
}
export function readProductionDayJournal(
	root: string,
	projectId: string,
	timezone: string,
	eventsDir?: string,
): ProductionDayJournalEvent[] {
	validateEvolutionIdentity({ projectId, timezone });
	const path = productionDayJournalPath(root, eventsDir);
	let lastError: unknown;
	for (let attempt = 0; attempt < READ_RETRIES; attempt += 1) {
		try {
			const text = readJournalText(path);
			if (text === null) return [];
			const events: ProductionDayJournalEvent[] = [];
			let previousDigest = GENESIS_DIGEST;
			for (const [index, line] of text
				.split(/\r?\n/)
				.filter(Boolean)
				.entries()) {
				const event = JSON.parse(line) as ProductionDayJournalEvent;
				validateEvent(root, event, index, previousDigest, projectId, timezone);
				events.push(event);
				previousDigest = event.event_digest;
			}
			return events;
		} catch (error) {
			lastError = error;
			if (
				!(
					error instanceof Error &&
					error.message.includes("changed during read")
				)
			)
				throw error;
		}
	}
	throw lastError;
}

export function resolveProductionDayReceipt(
	context: EvolutionJournalContext & { evidenceId: string },
): ProductionDayReceipt | null {
	return withSessionLock(context.root, JOURNAL_LOCK, () => {
		const events = readProductionDayJournal(
			context.root,
			context.projectId,
			context.timezone,
			context.evolutionEventsDir,
		);
		const ordinalByDate = new Map<string, number>();
		for (const event of events) {
			if (!ordinalByDate.has(event.payload.local_date)) {
				ordinalByDate.set(event.payload.local_date, ordinalByDate.size + 1);
			}
			if (event.payload.evidence.id === context.evidenceId) {
				return {
					evidence_id: context.evidenceId,
					local_date: event.payload.local_date,
					ordinal_sequence: ordinalByDate.get(event.payload.local_date) ?? 0,
					journal_event_id: event.event_id,
				};
			}
		}
		return null;
	});
}

function projectEvents(
	db: Database,
	events: readonly ProductionDayJournalEvent[],
	inTransaction = false,
): ProductionDay | null {
	let latest: ProductionDay | null = null;
	for (const event of events) {
		const allocation = {
			projectId: event.payload.project_id,
			localDate: event.payload.local_date,
			qualifyingEvents: event.payload.qualifying_events,
			journalEventId: event.event_id,
			createdAt: event.timestamp,
		};
		latest = inTransaction
			? allocateProductionDayInTransaction(db, allocation)
			: allocateProductionDay(db, allocation);
	}
	return latest;
}
function projectionRows(db: Database, projectId: string): ProductionDay[] {
	return db
		.query(
			"SELECT * FROM production_days WHERE project_id = ? ORDER BY ordinal_sequence",
		)
		.all(projectId)
		.map((row) => {
			const value = row as Record<string, unknown>;
			return {
				project_id: String(value.project_id),
				local_date: String(value.local_date),
				ordinal_sequence: Number(value.ordinal_sequence),
				ordinal: String(value.ordinal),
				created_at: String(value.created_at),
				qualifying_events: JSON.parse(String(value.qualifying_events)),
				journal_event_id: String(value.journal_event_id),
			} as ProductionDay;
		});
}
function replayProjection(
	projectId: string,
	events: readonly ProductionDayJournalEvent[],
): ProductionDay[] {
	const db = new Database(":memory:");
	try {
		applyMigrations(db);
		projectEvents(db, events, true);
		return projectionRows(db, projectId);
	} finally {
		db.close();
	}
}
function validateProductionDayProjectionUnlocked(
	context: EvolutionJournalContext & { db: Database },
): void {
	const events = readProductionDayJournal(
		context.root,
		context.projectId,
		context.timezone,
		context.evolutionEventsDir,
	);
	const expected = replayProjection(context.projectId, events);
	const actual = projectionRows(context.db, context.projectId);
	if (digest(actual) !== digest(expected)) {
		throw new Error(
			"evolution db projection differs from canonical production-day journal",
		);
	}
}
export function validateProductionDayProjection(
	context: EvolutionJournalContext & { db: Database },
): void {
	validateProductionDayProjectionLeaf(
		context,
		productionDayValidationDependencies,
	);
}

export const productionDayValidationDependencies: ProductionDayProjectionValidationDependencies<
	ProductionDayJournalEvent,
	ProductionDay
> = {
	read: readProductionDayJournal,
	replay: replayProjection,
	rows: projectionRows,
	digest,
};
export function appendProductionDayAllocation(
	input: AppendProductionDayAllocationInput,
): ProductionDay {
	return withSessionLock(input.root, JOURNAL_LOCK, () =>
		appendProductionDayAllocationUnlocked(input),
	);
}
function appendProductionDayAllocationUnlocked(
	input: AppendProductionDayAllocationInput,
): ProductionDay {
	const evidence = readObservedProductionEvidence(input);
	const localDate = localDateForTimezone(
		new Date(evidence.snapshot.created_at),
		input.timezone,
	);
	if (input.expectedLocalDate && input.expectedLocalDate !== localDate)
		throw new Error("production-day event-date mismatch");
	const events = readProductionDayJournal(
		input.root,
		input.projectId,
		input.timezone,
		input.evolutionEventsDir,
	);
	assertWalEnabled(input.db);
	validateProductionDayProjectionUnlocked({
		root: input.root,
		db: input.db,
		projectId: input.projectId,
		timezone: input.timezone,
		...(input.evolutionEventsDir
			? { evolutionEventsDir: input.evolutionEventsDir }
			: {}),
	});
	const replay = events.find(
		(event) => event.payload.evidence.id === input.evidenceId,
	);
	if (replay) {
		if (
			replay.payload.evidence.source_digest !== evidence.snapshot.source_digest
		)
			throw new Error("production-day evidence source digest mismatch");
		projectEvents(input.db, events);
		return allocateProductionDay(input.db, {
			projectId: input.projectId,
			localDate: replay.payload.local_date,
			qualifyingEvents: replay.payload.qualifying_events,
			journalEventId: replay.event_id,
			createdAt: replay.timestamp,
		});
	}
	const previous = events.at(-1);
	const payload: ProductionDayJournalPayload = {
		project_id: input.projectId,
		timezone: input.timezone,
		local_date: localDate,
		qualifying_events: [input.evidenceId],
		evidence: evidence.snapshot,
	};
	const base = {
		sequence: events.length + 1,
		event_id: `EVO-${randomUUID()}`,
		event_type: "production_day_allocation" as const,
		action: "allocate" as const,
		authority_kind: "system_observer" as const,
		actor: "afol" as const,
		caller_type: "local_agent" as const,
		trust_level: "local_trusted" as const,
		origin_ref: relative(input.root, evidence.path).replaceAll("\\", "/"),
		subject_id: localDate,
		timestamp: (input.now ?? new Date()).toISOString(),
		command: "afol production-day allocation",
		previous_event_digest: previous?.event_digest ?? GENESIS_DIGEST,
		payload,
		payload_digest: digest(payload),
		source_refs: [
			{
				id: input.evidenceId,
				kind: "evidence" as const,
				path: relative(input.root, evidence.path).replaceAll("\\", "/"),
				authority: "canonical" as const,
			},
		],
	};
	const event: ProductionDayJournalEvent = {
		...base,
		event_digest: digest(base),
	};
	const path = productionDayJournalPath(input.root, input.evolutionEventsDir);
	mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
	assertSafeEvolutionTarget(path, "production-day journal");
	const previousTarget = inspectJournalTarget(path);
	assertSafeEvolutionTarget(path, "production-day journal");
	const existedBefore = previousTarget !== null;
	const previousSize = Number(previousTarget?.size ?? 0);
	let transactionStarted = false;
	try {
		const fd = openSync(
			path,
			journalOpenFlags(
				fsConstants.O_WRONLY | fsConstants.O_APPEND | fsConstants.O_CREAT,
			),
			0o600,
		);
		try {
			const opened = fstatSync(fd);
			if (!opened.isFile() || opened.nlink !== 1 || !inspectJournalTarget(path))
				throw new Error("production-day journal target must be a regular file");
			assertSafeEvolutionTarget(path, "production-day journal", false);
			writeSync(fd, `${JSON.stringify(event)}\n`, null, "utf8");
			fsyncSync(fd);
		} finally {
			closeSync(fd);
		}
		if (!existedBefore && process.platform !== "win32") {
			const directoryFd = openSync(dirname(path), "r");
			try {
				fsyncSync(directoryFd);
			} finally {
				closeSync(directoryFd);
			}
		}
		assertSafeEvolutionTarget(path, "production-day journal", false);
		input.db.exec("BEGIN IMMEDIATE");
		transactionStarted = true;
		const result = projectEvents(input.db, [...events, event], true);
		input.db.exec("COMMIT");
		return result as ProductionDay;
	} catch (error) {
		if (transactionStarted) {
			try {
				input.db.exec("ROLLBACK");
			} catch {}
		}
		try {
			truncateJournal(path, previousSize);
		} catch {
			/* preserve the original allocation failure */
		}
		throw error;
	}
}
export function rebuildProductionDayProjection(
	input: RebuildProductionDayProjectionInput,
): ProductionDay[] {
	return withSessionLock(input.root, JOURNAL_LOCK, () =>
		rebuildProductionDayProjectionUnlocked(input),
	);
}
function rebuildProductionDayProjectionUnlocked(
	input: RebuildProductionDayProjectionInput,
): ProductionDay[] {
	const events = readProductionDayJournal(
		input.root,
		input.projectId,
		input.timezone,
		input.evolutionEventsDir,
	);
	const canonicalProjection = replayProjection(input.projectId, events);
	const canonicalMax = canonicalProjection.at(-1)?.ordinal_sequence ?? 0;
	const reinforcementBeyondCanonical =
		preferenceReinforcementExceedsProductionOrdinal(
			input.root,
			input.projectId,
			canonicalMax,
			input.evolutionEventsDir,
		);
	if (reinforcementBeyondCanonical) {
		throw new Error(
			`preference reinforcement ordinal exceeds canonical production ordinal: ${reinforcementBeyondCanonical}`,
		);
	}
	assertWalEnabled(input.db);
	input.db.exec("BEGIN IMMEDIATE");
	try {
		input.db
			.query("DELETE FROM production_days WHERE project_id = ?")
			.run(input.projectId);
		input.db
			.query("DELETE FROM evolution_metadata WHERE key = 'project_id'")
			.run();
		input.db
			.prepare(
				"INSERT INTO evolution_metadata(key, value) VALUES ('project_id', ?)",
			)
			.run(input.projectId);
		projectEvents(input.db, events, true);
		const latest = input.db
			.query(
				"SELECT MAX(ordinal_sequence) AS sequence FROM production_days WHERE project_id = ?",
			)
			.get(input.projectId) as { sequence?: number } | null;
		refreshPreferenceDecayProjection(
			input.db,
			input.projectId,
			Number(latest?.sequence ?? 0),
		);
		input.db.exec("COMMIT");
	} catch (error) {
		try {
			input.db.exec("ROLLBACK");
		} catch {}
		throw error;
	}
	return projectionRows(input.db, input.projectId);
}
