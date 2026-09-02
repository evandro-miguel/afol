import { createHash, randomUUID } from "node:crypto";
import {
	closeSync,
	existsSync,
	fsyncSync,
	mkdirSync,
	openSync,
	readFileSync,
	writeSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { withSessionLock } from "../io/session-lock";
import { resolveProjectPaths } from "../project/paths";
import { resolveProjectPath, resolveProjectWritePath } from "../project/root";

export type MutationKind = "patch" | "move" | "archive" | "update";
export type MutationStatus =
	| "prepared"
	| "applied"
	| "committed"
	| "rolled_back"
	| "noop";
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

function resolveJournalPath(projectRoot: string): string {
	const root = resolve(projectRoot);
	const projectPaths = resolveProjectPaths(root);
	const resolved = resolveProjectWritePath(
		root,
		join(projectPaths.mutationsDir, "mutations.jsonl"),
	);
	if (!resolved.ok) {
		throw new Error(resolved.error);
	}
	return resolved.value.path;
}

function generateMutationId(now = new Date()): string {
	return `M-${now.toISOString()}-${randomUUID()}`;
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
		const statusValue = [
			"prepared",
			"applied",
			"committed",
			"rolled_back",
			"noop",
		].includes(String(record.status))
			? (record.status as MutationStatus)
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

		if (kind === "undo" && statusValue) {
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
			(kind === "patch" ||
				kind === "move" ||
				kind === "archive" ||
				kind === "update") &&
			statusValue
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

export function withMutationJournalLock<T>(
	projectRoot: string,
	action: () => T,
): T {
	return withSessionLock(projectRoot, MUTATION_JOURNAL_LOCK_SESSION, action);
}

export function appendMutationRecords(
	projectRoot: string,
	records: MutationRecord[],
): void {
	if (records.length === 0) {
		return;
	}
	const path = resolveJournalPath(projectRoot);
	withMutationJournalLock(projectRoot, () => {
		const directory = dirname(path);
		mkdirSync(directory, { recursive: true });
		const payload = records
			.map((record) =>
				JSON.stringify({
					...record,
					ts: record.ts || new Date().toISOString(),
				}),
			)
			.join("\n");
		const fd = openSync(path, "a");
		try {
			writeSync(fd, `${payload}\n`, undefined, "utf8");
			fsyncSync(fd);
		} finally {
			closeSync(fd);
		}
		// Make creation/append visibility durable when the filesystem supports it.
		try {
			const directoryFd = openSync(directory, "r");
			try {
				fsyncSync(directoryFd);
			} finally {
				closeSync(directoryFd);
			}
		} catch {
			// Directory fsync is unsupported by some filesystems; file fsync remains required.
		}
	});
}

export function appendMutationRecord(
	projectRoot: string,
	record: MutationRecord,
): void {
	appendMutationRecords(projectRoot, [record]);
}

export function loadMutationJournal(projectRoot: string): MutationRecord[] {
	const result = loadMutationJournalStrict(projectRoot);
	if (result.issues.length > 0) {
		throw new Error(`Mutation journal corruption: ${result.issues.join("; ")}`);
	}
	return result.records.filter((record) =>
		["applied", "committed", "noop"].includes(record.status),
	);
}

export function assertMutationJournalIntegrity(projectRoot: string): void {
	recoverPreparedMutations(projectRoot);
	const result = loadMutationJournalStrict(projectRoot);
	if (result.issues.length > 0) {
		throw new Error(`Mutation journal corruption: ${result.issues.join("; ")}`);
	}
}

function fileHash(path: string): string | null {
	return existsSync(path)
		? createHash("sha256").update(readFileSync(path)).digest("hex")
		: null;
}

function resolveJournalRecordPath(
	projectRoot: string,
	storedPath: string,
): string | null {
	const root = resolve(projectRoot);
	const candidate = isAbsolute(storedPath)
		? relative(root, storedPath)
		: storedPath;
	const result = resolveProjectPath(root, candidate);
	return result.ok ? result.value.path : null;
}

function resolveJournalBackupRecordPath(
	projectRoot: string,
	storedPath: string,
): string | null {
	const root = resolve(projectRoot);
	const candidate = isAbsolute(storedPath)
		? relative(root, storedPath)
		: storedPath;
	const resolved = resolveProjectWritePath(root, candidate);
	if (!resolved.ok) return null;
	const backupsRoot = resolve(
		root,
		resolveProjectPaths(root).mutationBackupsDir,
	);
	const backupRelative = relative(backupsRoot, resolved.value.path);
	if (
		backupRelative === ".." ||
		backupRelative.startsWith(`..${sep}`) ||
		isAbsolute(backupRelative)
	)
		return null;
	return resolved.value.path;
}

function preparedRecoveryStatus(
	projectRoot: string,
	record: MutationRecord,
): MutationStatus | null {
	if (record.kind === "undo") return null;
	const source = resolveJournalRecordPath(projectRoot, record.sourcePath);
	const destination = record.destinationPath
		? resolveJournalRecordPath(projectRoot, record.destinationPath)
		: null;
	if (!source || (record.destinationPath && !destination)) return null;
	const sourceHash = fileHash(source);
	const destinationHash = destination ? fileHash(destination) : null;
	if (record.kind === "patch") {
		if (sourceHash === record.afterHash) return "committed";
		if (record.beforeExisted === false && sourceHash === null)
			return "rolled_back";
		if (record.beforeExisted !== false && sourceHash === record.beforeHash)
			return "rolled_back";
		return null;
	}
	if (!destination) return null;
	if (sourceHash === null && destinationHash === record.afterHash)
		return "committed";
	if (sourceHash !== record.beforeHash) return null;
	if (!record.destinationExisted && destinationHash === null)
		return "rolled_back";
	if (record.destinationExisted && record.overwrittenBackupPath) {
		const backupPath = resolveJournalBackupRecordPath(
			projectRoot,
			record.overwrittenBackupPath,
		);
		if (!backupPath) return null;
		const backupHash = fileHash(backupPath);
		if (backupHash !== null && destinationHash === backupHash)
			return "rolled_back";
	}
	if (record.kind === "archive" && destinationHash === null)
		return "rolled_back";
	return null;
}

/** Reconciles only byte-provable interrupted operations; ambiguous state remains fail-closed. */
export function recoverPreparedMutations(projectRoot: string): void {
	withMutationJournalLock(projectRoot, () => {
		const snapshot = loadMutationJournalStrictLocked(projectRoot);
		if (
			snapshot.issues.some((issue) => !issue.startsWith("unmatched-prepared:"))
		)
			return;
		const terminalIds = new Set(
			snapshot.records
				.filter((record) =>
					["applied", "committed", "rolled_back"].includes(record.status),
				)
				.map((record) => record.id),
		);
		for (const record of snapshot.records) {
			if (record.status !== "prepared" || terminalIds.has(record.id)) continue;
			const status = preparedRecoveryStatus(projectRoot, record);
			if (status) appendMutationRecord(projectRoot, { ...record, status });
		}
	});
}

export type MutationJournalReadResult = {
	records: MutationRecord[];
	issues: string[];
};

export function loadMutationJournalStrict(
	projectRoot: string,
): MutationJournalReadResult {
	return withMutationJournalLock(projectRoot, () =>
		loadMutationJournalStrictLocked(projectRoot),
	);
}

function loadMutationJournalStrictLocked(
	projectRoot: string,
): MutationJournalReadResult {
	const path = resolveJournalPath(projectRoot);
	if (!existsSync(path)) {
		return { records: [], issues: [] };
	}
	const rows = readFileSync(path, "utf8").split("\n");
	const records: MutationRecord[] = [];
	const issues: string[] = [];
	for (const [index, row] of rows.entries()) {
		const trimmed = row.trim();
		if (trimmed.length === 0) {
			continue;
		}
		const parsed = parseRecord(trimmed);
		if (parsed) {
			records.push(parsed);
		} else {
			issues.push(`${path}:${index + 1}: invalid mutation record`);
		}
	}
	const terminalIds = new Set(
		records
			.filter((record) =>
				["applied", "committed", "rolled_back"].includes(record.status),
			)
			.map((record) => record.id),
	);
	for (const record of records) {
		if (record.status === "prepared" && !terminalIds.has(record.id)) {
			issues.push(`unmatched-prepared:${record.id}`);
			if (record.kind === "undo")
				issues.push(`unrecoverable-prepared-undo:${record.id}`);
		}
	}
	return { records, issues };
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
		if (
			isUndoRecord(record) &&
			["applied", "committed"].includes(record.status)
		) {
			undone.add(record.targetMutationId);
		}
	}

	for (let index = records.length - 1; index >= 0; index -= 1) {
		const record = records[index];
		if (
			!record ||
			isUndoRecord(record) ||
			!["applied", "committed"].includes(record.status) ||
			!["patch", "move", "archive"].includes(record.kind)
		) {
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
	if (
		records.some(
			(record) =>
				isUndoRecord(record) &&
				["applied", "committed"].includes(record.status) &&
				record.targetMutationId === mutationId,
		)
	) {
		throw new Error(`already-undone:${mutationId}`);
	}
	for (let index = records.length - 1; index >= 0; index -= 1) {
		const record = records[index];
		if (!record) {
			continue;
		}
		if (
			isUndoRecord(record) ||
			!["applied", "committed"].includes(record.status)
		) {
			continue;
		}
		if (record.id === mutationId) {
			return record;
		}
	}
	return null;
}
