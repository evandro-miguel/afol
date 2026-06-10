import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { withSessionLock } from "../io/session-lock";
import { resolveProjectPaths } from "../project/paths";

export type MutationKind = "patch" | "move" | "archive";
export type MutationStatus = "applied" | "noop";
export type MutationSource = "afol-update";

const MUTATION_JOURNAL_LOCK_SESSION = "__mutation-journal__";

type MutationBase = {
	id: string;
	ts: string;
	kind: MutationKind;
	status: MutationStatus;
	dryRun: boolean;
	session: string;
	taskId: string;
	reason: string;
	sourcePath: string;
	destinationPath?: string | undefined;
	beforeHash?: string | null;
	afterHash?: string | null;
	backupPath?: string | null;
	overwrittenBackupPath?: string | null | undefined;
	beforeExisted?: boolean | undefined;
	destinationExisted?: boolean | undefined;
	diffPreview?: string | undefined;
	source?: MutationSource | undefined;
	batchId?: string | undefined;
};

type MutationUndoRecord = {
	id: string;
	ts: string;
	kind: "undo";
	status: MutationStatus;
	dryRun: boolean;
	session: string;
	taskId: string;
	reason: string;
	targetMutationId: string;
	sourcePath: string;
	destinationPath: string;
	source?: MutationSource | undefined;
	batchId?: string | undefined;
};

export type MutationRecord = MutationBase | MutationUndoRecord;

let mutationCounter = 0;

function resolveJournalPath(projectRoot: string): string {
	return `${resolveProjectPaths(resolve(projectRoot)).abs.mutationsDir}/mutations.jsonl`;
}

function generateMutationId(now = new Date()): string {
	mutationCounter = (mutationCounter + 1) % 1_000_000;
	return `M-${now.toISOString()}-${mutationCounter.toString().padStart(6, "0")}`;
}

function parseRecord(raw: string): MutationRecord | null {
	try {
		const value = JSON.parse(raw);
		if (value === null || typeof value !== "object" || Array.isArray(value)) {
			return null;
		}
		const record = value as Record<string, unknown>;

		const id = typeof record.id === "string" ? record.id : "";
		const ts = typeof record.ts === "string" ? record.ts : "";
		const kind = typeof record.kind === "string" ? record.kind : "";
		const statusValue =
			record.status === "applied" || record.status === "noop"
				? record.status
				: null;
		if (statusValue === null) {
			return null;
		}
		const dryRun =
			record.dryRun === true || record.dryRun === false ? record.dryRun : false;
		const session = typeof record.session === "string" ? record.session : "";
		const taskId = typeof record.taskId === "string" ? record.taskId : "";
		const reason = typeof record.reason === "string" ? record.reason : "";
		const sourcePath =
			typeof record.sourcePath === "string" ? record.sourcePath : "";
		const destinationPath =
			typeof record.destinationPath === "string"
				? record.destinationPath
				: undefined;
		const source = record.source === "afol-update" ? record.source : undefined;
		const batchId =
			typeof record.batchId === "string" ? record.batchId : undefined;

		if (
			id.length === 0 ||
			ts.length === 0 ||
			kind.length === 0 ||
			!statusValue ||
			session.length === 0 ||
			taskId.length === 0 ||
			sourcePath.length === 0
		) {
			return null;
		}

		if (
			kind === "undo" &&
			(statusValue === "applied" || statusValue === "noop")
		) {
			if (
				typeof record.targetMutationId !== "string" ||
				destinationPath === undefined
			) {
				return null;
			}
			return {
				id,
				ts,
				kind: "undo",
				status: statusValue,
				dryRun,
				session,
				taskId,
				reason,
				targetMutationId: record.targetMutationId,
				sourcePath,
				destinationPath,
				source,
				batchId,
			};
		}

		if (
			(kind === "patch" || kind === "move" || kind === "archive") &&
			(statusValue === "applied" || statusValue === "noop")
		) {
			return {
				id,
				ts,
				kind,
				status: statusValue,
				dryRun,
				session,
				taskId,
				reason,
				sourcePath,
				destinationPath,
				beforeHash:
					typeof record.beforeHash === "string" ? record.beforeHash : null,
				afterHash:
					typeof record.afterHash === "string" ? record.afterHash : null,
				backupPath:
					typeof record.backupPath === "string" ? record.backupPath : null,
				overwrittenBackupPath:
					typeof record.overwrittenBackupPath === "string"
						? record.overwrittenBackupPath
						: null,
				beforeExisted:
					record.beforeExisted === true || record.beforeExisted === false
						? record.beforeExisted
						: undefined,
				destinationExisted:
					record.destinationExisted === true ||
					record.destinationExisted === false
						? record.destinationExisted
						: undefined,
				diffPreview:
					typeof record.diffPreview === "string"
						? record.diffPreview
						: undefined,
				source,
				batchId,
			};
		}
	} catch {
		return null;
	}
	return null;
}

export function createMutationId(): string {
	return generateMutationId();
}

export function mutationJournalPath(projectRoot: string): string {
	return resolveJournalPath(projectRoot);
}

export function appendMutationRecords(
	projectRoot: string,
	records: MutationRecord[],
): void {
	if (records.length === 0) {
		return;
	}
	const path = resolveJournalPath(projectRoot);
	withSessionLock(projectRoot, MUTATION_JOURNAL_LOCK_SESSION, () => {
		mkdirSync(resolve(path, ".."), { recursive: true });
		const payload = records
			.map((record) =>
				JSON.stringify({
					...record,
					ts: record.ts || new Date().toISOString(),
				}),
			)
			.join("\n");
		appendFileSync(path, `${payload}\n`, { encoding: "utf8" });
	});
}

export function appendMutationRecord(
	projectRoot: string,
	record: MutationRecord,
): void {
	appendMutationRecords(projectRoot, [record]);
}

export function loadMutationJournal(projectRoot: string): MutationRecord[] {
	const path = resolveJournalPath(projectRoot);
	if (!existsSync(path)) {
		return [];
	}
	const rows = readFileSync(path, "utf8").split("\n");
	const records: MutationRecord[] = [];
	for (const row of rows) {
		const trimmed = row.trim();
		if (trimmed.length === 0) {
			continue;
		}
		const parsed = parseRecord(trimmed);
		if (parsed) {
			records.push(parsed);
		}
	}
	return records;
}

function isUndoRecord(record: MutationRecord): record is MutationUndoRecord {
	return record.kind === "undo";
}

export function findLatestSupportedMutation(
	projectRoot: string,
	session: string,
	taskId: string,
): MutationRecord | null {
	const records = loadMutationJournal(projectRoot);
	const undone = new Set<string>();

	for (const record of records) {
		if (isUndoRecord(record)) {
			undone.add(record.targetMutationId);
		}
	}

	for (let index = records.length - 1; index >= 0; index -= 1) {
		const record = records[index];
		if (!record || isUndoRecord(record) || record.status !== "applied") {
			continue;
		}
		if (record.session !== session || record.taskId !== taskId) {
			continue;
		}
		if (undone.has(record.id)) {
			continue;
		}
		return record;
	}

	return null;
}

export function findMutationById(
	projectRoot: string,
	mutationId: string,
): MutationRecord | null {
	const records = loadMutationJournal(projectRoot);
	for (let index = records.length - 1; index >= 0; index -= 1) {
		const record = records[index];
		if (!record) {
			continue;
		}
		if (isUndoRecord(record)) {
			continue;
		}
		if (record.id === mutationId) {
			return record;
		}
	}
	return null;
}
