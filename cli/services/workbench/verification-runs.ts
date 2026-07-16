import { createHash } from "node:crypto";
import {
	closeSync,
	existsSync,
	fsyncSync,
	openSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { resolveProjectPaths } from "../project/paths";
import { resolveProjectWritePath } from "../project/root";

const SESSION_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;

export type VerificationRunStatus =
	| "passed"
	| "failed"
	| "timed_out"
	| "output_limit"
	| "signaled"
	| "spawn_failed"
	| "lock_lost";

export interface VerificationRunCommand {
	step_index: number;
	command_digest: string;
}

export interface VerificationRunStartRecord {
	record_type: "start";
	verification_run_id: string;
	task_id: string;
	task_attempt: number;
	verification_attempt: number;
	step_count: number;
	commands: VerificationRunCommand[];
	created_at: string;
}

export interface VerificationRunStepRecord {
	record_type: "step";
	verification_run_id: string;
	task_id: string;
	task_attempt: number;
	verification_attempt: number;
	step_index: number;
	step_count: number;
	command_digest: string;
	evidence_id: string;
	status: VerificationRunStatus;
	exit_code: number;
	signal?: string;
	duration_ms: number;
	created_at: string;
}

export type VerificationTerminalStatus =
	| "passed"
	| "failed"
	| "interrupted"
	| "superseded";

export interface VerificationRunTerminalRecord {
	record_type: "terminal";
	verification_run_id: string;
	task_id: string;
	task_attempt: number;
	verification_attempt: number;
	status: VerificationTerminalStatus;
	evidence_ids: string[];
	evidence_count: number;
	authorizing_evidence_id?: string;
	failed_step?: number;
	created_at: string;
}

export type VerificationRunRecord =
	| VerificationRunStartRecord
	| VerificationRunStepRecord
	| VerificationRunTerminalRecord;

interface VerificationEvidenceRecord {
	id?: string;
	task_id?: string;
	command?: string;
	command_digest?: string;
	verification_run_id?: string;
	task_attempt?: number;
	verification_attempt?: number;
	step_index?: number;
	step_count?: number;
	verification_status?: VerificationRunStatus;
	exit_code?: number;
	signal?: string;
	duration_ms?: number;
}

function assertSession(session: string): string {
	const normalized = session.trim();
	if (!SESSION_RE.test(normalized) || normalized.includes("..")) {
		throw new Error(`Invalid workbench session: ${session}`);
	}
	return normalized;
}

function sessionFile(root: string, session: string, name: string): string {
	const normalized = assertSession(session);
	const paths = resolveProjectPaths(root);
	const candidate = join(paths.wbDir, normalized, name);
	const resolved = resolveProjectWritePath(root, candidate);
	if (!resolved.ok) throw new Error(resolved.error);
	return resolved.value.path;
}

export function verificationRunsPath(root: string, session: string): string {
	return sessionFile(root, session, ".verification-runs.jsonl");
}

function evidencePath(root: string, session: string): string {
	return sessionFile(root, session, ".evidence.jsonl");
}

function parseJsonLines<T>(path: string): T[] {
	if (!existsSync(path)) return [];
	const records: T[] = [];
	for (const [index, line] of readFileSync(path, "utf8")
		.split(/\r?\n/)
		.entries()) {
		if (!line.trim()) continue;
		try {
			records.push(JSON.parse(line) as T);
		} catch {
			throw new Error(`Invalid JSONL record at ${path}:${index + 1}`);
		}
	}
	return records;
}

function appendJsonLineFsync(
	path: string,
	value: unknown,
	fencingCheck: () => void,
): void {
	const existed = existsSync(path);
	fencingCheck();
	const fd = openSync(path, "a");
	try {
		writeFileSync(fd, `${JSON.stringify(value)}\n`, "utf8");
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
	if (!existed) fsyncDirectoryIfSupported(dirname(path));
}

export function fsyncDirectoryIfSupported(
	directoryPath: string,
	platform: NodeJS.Platform = process.platform,
): void {
	if (platform === "win32") return;
	const directoryFd = openSync(directoryPath, "r");
	try {
		fsyncSync(directoryFd);
	} finally {
		closeSync(directoryFd);
	}
}

export function verificationCommandDigest(command: string): string {
	return createHash("sha256").update(command, "utf8").digest("hex");
}

export function readVerificationRunLedger(
	root: string,
	session: string,
): VerificationRunRecord[] {
	return parseJsonLines<VerificationRunRecord>(
		verificationRunsPath(root, session),
	);
}

export function readVerificationRunLedgerAtSessionPath(
	sessionPath: string,
): VerificationRunRecord[] {
	return parseJsonLines<VerificationRunRecord>(
		join(sessionPath, ".verification-runs.jsonl"),
	);
}

export function latestRunForTask(
	records: readonly VerificationRunRecord[],
	taskId: string,
): VerificationRunStartRecord | null {
	return (
		records
			.filter(
				(record): record is VerificationRunStartRecord =>
					record.record_type === "start" && record.task_id === taskId,
			)
			.at(-1) ?? null
	);
}

export function terminalForRun(
	records: readonly VerificationRunRecord[],
	runId: string,
): VerificationRunTerminalRecord | null {
	return (
		records.find(
			(record): record is VerificationRunTerminalRecord =>
				record.record_type === "terminal" &&
				record.verification_run_id === runId,
		) ?? null
	);
}

export function stepsForRun(
	records: readonly VerificationRunRecord[],
	runId: string,
): VerificationRunStepRecord[] {
	return records
		.filter(
			(record): record is VerificationRunStepRecord =>
				record.record_type === "step" && record.verification_run_id === runId,
		)
		.sort((left, right) => left.step_index - right.step_index);
}

export function nextVerificationAttempt(
	records: readonly VerificationRunRecord[],
	taskId: string,
): number {
	return (
		Math.max(
			0,
			...records
				.filter(
					(record): record is VerificationRunStartRecord =>
						record.record_type === "start" && record.task_id === taskId,
				)
				.map((record) => record.verification_attempt),
		) + 1
	);
}

export function appendVerificationRunStart(
	root: string,
	session: string,
	record: VerificationRunStartRecord,
	fencingCheck: () => void,
): void {
	const records = readVerificationRunLedger(root, session);
	if (
		records.some(
			(entry) => entry.verification_run_id === record.verification_run_id,
		)
	) {
		throw new Error(
			`Duplicate verification run id: ${record.verification_run_id}`,
		);
	}
	appendJsonLineFsync(
		verificationRunsPath(root, session),
		record,
		fencingCheck,
	);
}

export function appendVerificationRunStep(
	root: string,
	session: string,
	record: VerificationRunStepRecord,
	fencingCheck: () => void,
): void {
	const records = readVerificationRunLedger(root, session);
	const existing = stepsForRun(records, record.verification_run_id).find(
		(entry) => entry.step_index === record.step_index,
	);
	if (existing) {
		if (
			existing.evidence_id === record.evidence_id &&
			existing.command_digest === record.command_digest
		) {
			return;
		}
		throw new Error(
			`Duplicate verification run step: ${record.verification_run_id}/${record.step_index}`,
		);
	}
	if (terminalForRun(records, record.verification_run_id)) {
		throw new Error(
			`Verification run is already terminal: ${record.verification_run_id}`,
		);
	}
	appendJsonLineFsync(
		verificationRunsPath(root, session),
		record,
		fencingCheck,
	);
}

export function appendVerificationRunTerminal(
	root: string,
	session: string,
	record: VerificationRunTerminalRecord,
	fencingCheck: () => void,
): VerificationRunTerminalRecord {
	const records = readVerificationRunLedger(root, session);
	const existing = terminalForRun(records, record.verification_run_id);
	if (existing) return existing;
	appendJsonLineFsync(
		verificationRunsPath(root, session),
		record,
		fencingCheck,
	);
	return record;
}

export function runHasCompletePassedSteps(
	records: readonly VerificationRunRecord[],
	start: VerificationRunStartRecord,
): boolean {
	const steps = stepsForRun(records, start.verification_run_id);
	return (
		steps.length === start.step_count &&
		steps.every(
			(step, index) =>
				step.step_index === index + 1 &&
				step.task_id === start.task_id &&
				step.task_attempt === start.task_attempt &&
				step.verification_attempt === start.verification_attempt &&
				step.step_count === start.step_count &&
				step.evidence_id.length > 0 &&
				step.status === "passed" &&
				step.command_digest === start.commands[index]?.command_digest,
		)
	);
}

export function reconcileVerificationEvidenceOrphans(
	root: string,
	session: string,
	start: VerificationRunStartRecord,
	fencingCheck: () => void,
): void {
	const records = readVerificationRunLedger(root, session);
	const existingIndexes = new Set(
		stepsForRun(records, start.verification_run_id).map(
			(record) => record.step_index,
		),
	);
	const evidence = parseJsonLines<VerificationEvidenceRecord>(
		evidencePath(root, session),
	);
	for (const entry of evidence) {
		if (
			entry.verification_run_id !== start.verification_run_id ||
			entry.task_id !== start.task_id ||
			typeof entry.step_index !== "number" ||
			entry.step_index < 1 ||
			entry.step_index > start.step_count ||
			existingIndexes.has(entry.step_index) ||
			typeof entry.id !== "string" ||
			typeof entry.command_digest !== "string" ||
			entry.verification_attempt !== start.verification_attempt ||
			entry.task_attempt !== start.task_attempt ||
			entry.step_count !== start.step_count ||
			typeof entry.duration_ms !== "number" ||
			typeof entry.exit_code !== "number" ||
			typeof entry.verification_status !== "string" ||
			start.commands[entry.step_index - 1]?.command_digest !==
				entry.command_digest
		) {
			continue;
		}
		appendVerificationRunStep(
			root,
			session,
			{
				record_type: "step",
				verification_run_id: start.verification_run_id,
				task_id: start.task_id,
				task_attempt: entry.task_attempt,
				verification_attempt: entry.verification_attempt,
				step_index: entry.step_index,
				step_count: entry.step_count,
				command_digest: entry.command_digest,
				evidence_id: entry.id,
				status: entry.verification_status,
				exit_code: entry.exit_code,
				...(typeof entry.signal === "string" ? { signal: entry.signal } : {}),
				duration_ms: entry.duration_ms,
				created_at: new Date().toISOString(),
			},
			fencingCheck,
		);
		existingIndexes.add(entry.step_index);
	}
}

export function verificationRunAuthorizes(
	root: string,
	session: string,
	taskId: string,
	taskAttempt: number,
	evidenceId: string,
	runId: string,
): boolean {
	const records = readVerificationRunLedger(root, session);
	return verificationRunRecordsAuthorize(
		records,
		taskId,
		taskAttempt,
		evidenceId,
		runId,
	);
}

export function verificationRunRecordsAuthorize(
	records: readonly VerificationRunRecord[],
	taskId: string,
	taskAttempt: number,
	evidenceId: string,
	runId: string,
): boolean {
	const start = records.find(
		(record): record is VerificationRunStartRecord =>
			record.record_type === "start" &&
			record.verification_run_id === runId &&
			record.task_id === taskId &&
			record.task_attempt === taskAttempt,
	);
	if (!start || !runHasCompletePassedSteps(records, start)) return false;
	const steps = stepsForRun(records, runId);
	const terminal = terminalForRun(records, runId);
	return (
		terminal?.status === "passed" &&
		terminal.task_id === start.task_id &&
		terminal.task_attempt === start.task_attempt &&
		terminal.verification_attempt === start.verification_attempt &&
		terminal.authorizing_evidence_id === evidenceId &&
		terminal.evidence_count === start.step_count &&
		terminal.evidence_ids.length === steps.length &&
		terminal.evidence_ids.every(
			(stepEvidenceId, index) => stepEvidenceId === steps[index]?.evidence_id,
		) &&
		terminal.evidence_ids.at(-1) === evidenceId
	);
}
