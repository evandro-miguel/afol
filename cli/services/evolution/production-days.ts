import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { resolveProjectWritePath } from "../project/root";
import { validateEvolutionIdentity } from "./config";
import { assertSafeEvolutionProjectRoot } from "./db";
import { refreshPreferenceDecayProjection } from "./preference-decay";

const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export type ProductionDay = {
	project_id: string;
	local_date: string;
	ordinal_sequence: number;
	ordinal: string;
	created_at: string;
	qualifying_events: string[];
	journal_event_id: string;
};
export type ProductionDayAllocation = {
	projectId: string;
	localDate: string;
	qualifyingEvents: string | readonly unknown[];
	journalEventId: string;
	createdAt?: string;
};

export type ObservedProductionEvidence = {
	id: string;
	project_id: string;
	session_id: string;
	created_at: string;
	result: "passed";
	provenance: "observed";
	exit_code: 0;
	source_digest: string;
};

export type ProductionEvidenceInput = {
	root: string;
	projectId: string;
	sessionId: string;
	evidenceId: string;
	workbenchDir?: string;
};

function scalarNumber(row: Record<string, unknown> | null): number {
	const value = row
		? Object.values(row).find((item) => typeof item === "number")
		: 0;
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function assertLocalDate(value: string): void {
	const match = LOCAL_DATE_RE.exec(value);
	if (!match) throw new Error(`invalid production local date: ${value}`);
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
	if (month < 1 || month > 12 || day < 1 || day > daysInMonth)
		throw new Error(`invalid production local date: ${value}`);
}

function rowToProductionDay(row: Record<string, unknown>): ProductionDay {
	return {
		project_id: String(row.project_id),
		local_date: String(row.local_date),
		ordinal_sequence: Number(row.ordinal_sequence),
		ordinal: String(row.ordinal),
		created_at: String(row.created_at),
		qualifying_events: normalizeQualifyingEvents(String(row.qualifying_events)),
		journal_event_id: String(row.journal_event_id),
	};
}

function recordProject(db: Database, projectId: string): void {
	const existing = db
		.query("SELECT value FROM evolution_metadata WHERE key = 'project_id'")
		.get() as { value?: unknown } | null;
	if (existing && existing.value !== projectId)
		throw new Error("evolution db project UUID does not match allocation");
	if (!existing)
		db.prepare(
			"INSERT INTO evolution_metadata(key, value) VALUES ('project_id', ?)",
		).run(projectId);
}

function normalizeQualifyingEvents(
	value: string | readonly unknown[],
): string[] {
	const serialized =
		typeof value === "string" ? value.trim() : JSON.stringify(value);
	if (!serialized) throw new Error("qualifying events must be non-empty JSON");
	let parsed: unknown;
	try {
		parsed = JSON.parse(serialized);
	} catch {
		throw new Error("qualifying events must be valid JSON");
	}
	if (!Array.isArray(parsed) || parsed.length === 0) {
		throw new Error("qualifying events must be a non-empty JSON array");
	}
	if (parsed.some((event) => typeof event !== "string" || !ID_RE.test(event))) {
		throw new Error("qualifying events contain an invalid reference");
	}
	return parsed;
}

function normalizeJournalEventId(value: string): string {
	const normalized = value.trim();
	if (!normalized) throw new Error("journal event id must be non-empty");
	if (!ID_RE.test(normalized)) throw new Error("journal event id is invalid");
	return normalized;
}

export function readObservedProductionEvidence(
	input: ProductionEvidenceInput,
): { snapshot: ObservedProductionEvidence; path: string } {
	assertSafeEvolutionProjectRoot(input.root);
	if (!ID_RE.test(input.sessionId) || !ID_RE.test(input.evidenceId)) {
		throw new Error("invalid workbench evidence reference");
	}
	const resolved = resolveProjectWritePath(
		input.root,
		join(input.workbenchDir ?? ".afol/wb", input.sessionId, ".evidence.jsonl"),
	);
	if (!resolved.ok) throw new Error(resolved.error);
	if (!existsSync(resolved.value.path)) {
		throw new Error(`workbench evidence does not exist: ${input.evidenceId}`);
	}
	const raw = readFileSync(resolved.value.path, "utf8");
	let match: Record<string, unknown> | null = null;
	let matchedSource = "";
	for (const [index, line] of raw.split(/\r?\n/).entries()) {
		if (!line.trim()) continue;
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch {
			throw new Error(`invalid workbench evidence JSON at line ${index + 1}`);
		}
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			const row = parsed as Record<string, unknown>;
			if (row.id === input.evidenceId) {
				if (match)
					throw new Error(
						`duplicate workbench evidence id: ${input.evidenceId}`,
					);
				match = row;
				matchedSource = line;
			}
		}
	}
	if (!match) {
		throw new Error(`workbench evidence does not exist: ${input.evidenceId}`);
	}
	if (
		typeof match.project_id !== "string" ||
		typeof match.session_id !== "string"
	) {
		throw new Error(
			"workbench evidence must include explicit project_id and session_id",
		);
	}
	if (match.project_id !== input.projectId) {
		throw new Error("workbench evidence belongs to another project");
	}
	if (match.session_id !== input.sessionId) {
		throw new Error("workbench evidence belongs to another session");
	}
	if (
		match.result !== "passed" ||
		match.provenance !== "observed" ||
		match.exit_code !== 0
	) {
		throw new Error("workbench evidence is not an observed passing result");
	}
	const createdAt =
		typeof match.created_at === "string" ? match.created_at : "";
	const date = new Date(createdAt);
	if (!createdAt || Number.isNaN(date.getTime())) {
		throw new Error("workbench evidence has invalid created_at");
	}
	return {
		path: resolved.value.path,
		snapshot: {
			id: input.evidenceId,
			project_id: input.projectId,
			session_id: input.sessionId,
			created_at: date.toISOString(),
			result: "passed",
			provenance: "observed",
			exit_code: 0,
			source_digest: createHash("sha256").update(matchedSource).digest("hex"),
		},
	};
}

export function verifyObservedProductionEvidence(
	input: ProductionEvidenceInput & {
		sourcePath: string;
		sourceDigest: string;
	},
): void {
	const source = readObservedProductionEvidence(input);
	if (
		relative(input.root, source.path).replaceAll("\\", "/") !== input.sourcePath
	)
		throw new Error("production-day journal evidence source path mismatch");
	if (source.snapshot.source_digest !== input.sourceDigest)
		throw new Error("production-day journal evidence source digest mismatch");
}

function allocateProductionDayUnsafe(
	db: Database,
	input: ProductionDayAllocation,
): ProductionDay {
	validateEvolutionIdentity({ projectId: input.projectId, timezone: "UTC" });
	assertLocalDate(input.localDate);
	const qualifyingEvents = normalizeQualifyingEvents(input.qualifyingEvents);
	const journalEventId = normalizeJournalEventId(input.journalEventId);
	recordProject(db, input.projectId);
	const existing = db
		.query(
			"SELECT * FROM production_days WHERE project_id = ? AND local_date = ?",
		)
		.get(input.projectId, input.localDate) as Record<string, unknown> | null;
	if (existing) {
		const existingEvents = normalizeQualifyingEvents(
			String(existing.qualifying_events),
		);
		const mergedEvents = [...new Set([...existingEvents, ...qualifyingEvents])];
		if (mergedEvents.length !== existingEvents.length) {
			const mergedEventsJson = JSON.stringify(mergedEvents);
			existing.qualifying_events = mergedEventsJson;
			db.prepare(
				"UPDATE production_days SET qualifying_events = ? WHERE project_id = ? AND local_date = ?",
			).run(mergedEventsJson, input.projectId, input.localDate);
		}
		const row = rowToProductionDay(existing);
		const latest = db
			.query(
				"SELECT MAX(ordinal_sequence) AS sequence FROM production_days WHERE project_id = ?",
			)
			.get(input.projectId) as Record<string, unknown> | null;
		refreshPreferenceDecayProjection(db, input.projectId, scalarNumber(latest));
		return row;
	}
	const last = db
		.query(
			"SELECT MAX(ordinal_sequence) AS sequence FROM production_days WHERE project_id = ?",
		)
		.get(input.projectId) as Record<string, unknown> | null;
	const sequence = scalarNumber(last) + 1;
	const row: ProductionDay = {
		project_id: input.projectId,
		local_date: input.localDate,
		ordinal_sequence: sequence,
		ordinal: `PD-${String(sequence).padStart(4, "0")}`,
		created_at: input.createdAt ?? new Date().toISOString(),
		qualifying_events: qualifyingEvents,
		journal_event_id: journalEventId,
	};
	db.prepare(
		"INSERT INTO production_days(project_id, local_date, ordinal_sequence, ordinal, created_at, qualifying_events, journal_event_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
	).run(
		row.project_id,
		row.local_date,
		row.ordinal_sequence,
		row.ordinal,
		row.created_at,
		JSON.stringify(row.qualifying_events),
		row.journal_event_id,
	);
	refreshPreferenceDecayProjection(db, input.projectId, sequence);
	return row;
}

export function allocateProductionDayInTransaction(
	db: Database,
	input: ProductionDayAllocation,
): ProductionDay {
	return allocateProductionDayUnsafe(db, input);
}

export function allocateProductionDay(
	db: Database,
	input: ProductionDayAllocation,
): ProductionDay {
	db.exec("BEGIN IMMEDIATE");
	try {
		const result = allocateProductionDayUnsafe(db, input);
		db.exec("COMMIT");
		return result;
	} catch (error) {
		try {
			db.exec("ROLLBACK");
		} catch {
			/* preserve allocation failure */
		}
		throw error;
	}
}
