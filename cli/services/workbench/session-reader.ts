import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	assertSafeSourceFile,
	type BoundedSourceLimits,
	readBoundedSourceFile,
} from "../io/safe-source";
import { resolveProjectPaths } from "../project/paths";
import { resolveProjectPath } from "../project/root";
import type { EvidenceEntry } from "./types";

const SESSION_NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;
export const MAX_SESSION_IDENTIFIER_LENGTH = 128;

/**
 * Validate and resolve a safe session path without mutation.
 * Throws on invalid session identifiers or path traversal attempts.
 */
function resolveSafeSessionPath(root: string, session: string): string {
	const normalized = session.trim();
	if (
		!SESSION_NAME_RE.test(normalized) ||
		normalized.includes("..") ||
		normalized.length === 0 ||
		normalized.length > MAX_SESSION_IDENTIFIER_LENGTH
	) {
		throw new Error("Invalid session identifier");
	}

	const projectPaths = resolveProjectPaths(root);
	const result = resolveProjectPath(root, join(projectPaths.wbDir, normalized));
	if (!result.ok) {
		throw new Error(result.error);
	}
	return result.value.path;
}

export function assertSafeSessionSourceFile(path: string, label: string): void {
	assertSafeSourceFile(path, label);
}

/**
 * Return the file-system paths for a named workbench session.
 * Pure read-only — does not create or lock anything.
 */
export function sessionPaths(
	root: string,
	session: string,
): {
	wbRoot: string;
	sessionDir: string;
	planPath: string;
	taskPath: string;
	logPath: string;
	evidencePath: string;
	activeSessionPath: string;
} {
	const projectPaths = resolveProjectPaths(root);
	const wbRoot = projectPaths.abs.wbDir;
	const sessionDir = resolveSafeSessionPath(root, session);
	return {
		wbRoot,
		sessionDir,
		planPath: join(sessionDir, `${session}_plan_01.md`),
		taskPath: join(sessionDir, `${session}_task_01.md`),
		logPath: join(sessionDir, `${session}_log_01.md`),
		evidencePath: join(sessionDir, ".evidence.jsonl"),
		activeSessionPath: projectPaths.abs.activeSessionFile,
	};
}

/**
 * Load parsed evidence entries from a session's evidence ledger.
 * Returns an empty array when the file does not exist.
 */
export function parseEvidenceEntries(text: string): EvidenceEntry[] {
	const rows = text
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	const entries: EvidenceEntry[] = [];
	for (const [index, row] of rows.entries()) {
		try {
			const parsed = JSON.parse(row) as Partial<EvidenceEntry> & {
				taskId?: unknown;
				createdAt?: unknown;
			};
			const taskId =
				typeof parsed.task_id === "string" ? parsed.task_id : parsed.taskId;
			const createdAt =
				typeof parsed.created_at === "string"
					? parsed.created_at
					: parsed.createdAt;
			if (
				typeof parsed.id === "string" &&
				typeof taskId === "string" &&
				typeof createdAt === "string" &&
				typeof parsed.command === "string" &&
				typeof parsed.result === "string"
			) {
				const entry: EvidenceEntry = {
					id: parsed.id,
					task_id: taskId,
					created_at: createdAt,
					command: parsed.command,
					result: parsed.result,
				};
				if (typeof parsed.project_id === "string") {
					entry.project_id = parsed.project_id;
				}
				if (typeof parsed.session_id === "string") {
					entry.session_id = parsed.session_id;
				}
				if (typeof parsed.exit_code === "number") {
					entry.exit_code = parsed.exit_code;
				}
				if (typeof parsed.signal === "string") {
					entry.signal = parsed.signal;
				}
				if (typeof parsed.artifact === "string") {
					entry.artifact = parsed.artifact;
				}
				if (typeof parsed.note === "string") {
					entry.note = parsed.note;
				}
				if (
					parsed.authorization_type === "execution" ||
					parsed.authorization_type === "artifact" ||
					parsed.authorization_type === "waiver"
				)
					entry.authorization_type = parsed.authorization_type;
				if (typeof parsed.artifact_sha256 === "string")
					entry.artifact_sha256 = parsed.artifact_sha256;
				if (typeof parsed.waiver_reason === "string")
					entry.waiver_reason = parsed.waiver_reason;
				if (typeof parsed.approved_by === "string")
					entry.approved_by = parsed.approved_by;
				if (
					typeof parsed.attempt === "number" &&
					Number.isSafeInteger(parsed.attempt) &&
					parsed.attempt >= 0
				)
					entry.attempt = parsed.attempt;
				if (
					parsed.provenance === "declared" ||
					parsed.provenance === "observed"
				) {
					entry.provenance = parsed.provenance;
				}
				if (
					parsed.task_state === "pending" ||
					parsed.task_state === "in_progress" ||
					parsed.task_state === "done"
				) {
					entry.task_state = parsed.task_state;
				}
				if (parsed.purpose === "completion") entry.purpose = parsed.purpose;
				if (typeof parsed.verification_run_id === "string")
					entry.verification_run_id = parsed.verification_run_id;
				for (const key of [
					"task_attempt",
					"verification_attempt",
					"step_index",
					"step_count",
					"duration_ms",
				] as const) {
					const value = parsed[key];
					if (
						typeof value === "number" &&
						Number.isSafeInteger(value) &&
						value >= 0
					) {
						entry[key] = value;
					}
				}
				if (
					parsed.verification_status === "passed" ||
					parsed.verification_status === "failed" ||
					parsed.verification_status === "timed_out" ||
					parsed.verification_status === "output_limit" ||
					parsed.verification_status === "signaled" ||
					parsed.verification_status === "spawn_failed" ||
					parsed.verification_status === "lock_lost" ||
					parsed.verification_status === "superseded"
				) {
					entry.verification_status = parsed.verification_status;
				}
				if (typeof parsed.command_digest === "string")
					entry.command_digest = parsed.command_digest;
				if (
					Array.isArray(parsed.warnings) &&
					parsed.warnings.every((warning) => typeof warning === "string")
				) {
					entry.warnings = parsed.warnings;
				}
				entries.push(entry);
			}
		} catch (error) {
			throw new Error(
				`Malformed evidence ledger line ${index + 1}: ${(error as Error).message}`,
			);
		}
	}
	return entries;
}

export function loadEvidenceEntries(
	evidencePath: string,
	limits?: BoundedSourceLimits,
): EvidenceEntry[] {
	if (limits) {
		const text = readBoundedSourceFile(
			evidencePath,
			"session evidence ledger",
			limits,
		);
		return text === null ? [] : parseEvidenceEntries(text);
	}
	if (!existsSync(evidencePath)) return [];
	return parseEvidenceEntries(readFileSync(evidencePath, "utf8"));
}
