import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
	closeSync,
	existsSync,
	fstatSync,
	fsyncSync,
	mkdirSync,
	openSync,
	readFileSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import type { CommandSpec } from "../../registry";
import { withSessionLock } from "../io/session-lock";
import { resolveProjectPath } from "../project/root";
import { sanitizeEvidenceText } from "../workbench/lifecycle";
import { sessionPaths } from "../workbench/session-reader";
import { fixedHarnessProfile } from "./profiles";

const MAX_RECEIPT_BYTES = 64 * 1024;
const MAX_TEXT_LENGTH = 512;
export const MAX_RECEIPT_AGE_MS = 24 * 60 * 60 * 1000;
export const MAX_RECEIPT_FUTURE_SKEW_MS = 5 * 60 * 1000;
const RECEIPT_LOCK_STALE_MS = 60 * 1000;
const SHA256_RE = /^[a-f0-9]{64}$/i;
const COMMIT_RE = /^[a-f0-9]{40}$/i;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const RESULT_VALUES = new Set(["passed", "failed"]);

export type ExternalReceipt = {
	receipt_id: string;
	project_id: string;
	session_id: string;
	task_id: string;
	harness_id: string;
	run_id: string;
	harness_profile_id: string;
	harness_profile_digest: string;
	source_commit: string;
	head_commit: string;
	diff_hash: string;
	checked_paths: string[];
	check_command?: string;
	check_exit_code?: number;
	tool_trace_digest: string;
	started_at: string;
	finished_at: string;
	result: "passed" | "failed";
};

type ReceiptRecord = {
	record_type: "reservation" | "committed";
	receipt?: ExternalReceipt;
	receipt_id: string;
	receipt_digest: string;
	evidence_id?: string;
	created_at: string;
};

export type ReceiptIngestResult = {
	receipt_id: string;
	evidence_id: string;
	status: "committed" | "duplicate";
};

function fail(message: string): never {
	throw new Error(message);
}

function asObject(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value))
		return fail("Receipt must be a JSON object.");
	return value as Record<string, unknown>;
}

function requiredId(value: unknown, label: string): string {
	if (typeof value !== "string" || !ID_RE.test(value))
		return fail(`Receipt ${label} is invalid.`);
	return value;
}

function requiredText(value: unknown, label: string): string {
	if (
		typeof value !== "string" ||
		!value.trim() ||
		value.length > MAX_TEXT_LENGTH
	)
		return fail(`Receipt ${label} is invalid.`);
	if (sanitizeEvidenceText(value) !== value)
		return fail(`Receipt ${label} contains sensitive material.`);
	return value;
}

function requiredHash(value: unknown, label: string): string {
	if (typeof value !== "string" || !SHA256_RE.test(value))
		return fail(`Receipt ${label} must be a SHA-256 digest.`);
	return value.toLowerCase();
}

function requiredCommit(value: unknown, label: string): string {
	if (typeof value !== "string" || !COMMIT_RE.test(value))
		return fail(`Receipt ${label} must be a full commit hash.`);
	return value.toLowerCase();
}

function timestamp(value: unknown, label: string): string {
	if (typeof value !== "string" || Number.isNaN(Date.parse(value)))
		return fail(`Receipt ${label} is invalid.`);
	return value;
}

function projectId(root: string): string {
	const configPath = join(root, ".afol", "config.json");
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(configPath, "utf8"));
	} catch {
		return fail("Project config cannot establish a receipt project identity.");
	}
	const project = asObject(asObject(parsed).project);
	return requiredId(project.id, "project_id");
}

function canonicalReceipt(receipt: ExternalReceipt): string {
	return JSON.stringify({
		receipt_id: receipt.receipt_id,
		project_id: receipt.project_id,
		session_id: receipt.session_id,
		task_id: receipt.task_id,
		harness_id: receipt.harness_id,
		run_id: receipt.run_id,
		harness_profile_id: receipt.harness_profile_id,
		harness_profile_digest: receipt.harness_profile_digest,
		source_commit: receipt.source_commit,
		head_commit: receipt.head_commit,
		diff_hash: receipt.diff_hash,
		checked_paths: [...receipt.checked_paths].sort(),
		...(receipt.check_command
			? {
					check_command: receipt.check_command,
					check_exit_code: receipt.check_exit_code,
				}
			: {}),
		tool_trace_digest: receipt.tool_trace_digest,
		started_at: receipt.started_at,
		finished_at: receipt.finished_at,
		result: receipt.result,
	});
}

function receiptDigest(receipt: ExternalReceipt): string {
	return createHash("sha256").update(canonicalReceipt(receipt)).digest("hex");
}

function receiptJournalPath(root: string): string {
	return join(root, ".afol", "data", "receipts", "external.jsonl");
}

function receiptLockPath(root: string, receiptId: string): string {
	return join(
		root,
		".afol",
		"data",
		"receipts",
		"locks",
		`${createHash("sha256").update(receiptId).digest("hex")}.lock`,
	);
}

type ReceiptLockIdentity = { dev: bigint; ino: bigint };

type ReceiptLockMetadata = ReceiptLockIdentity & {
	ownerToken: string;
	acquiredAtMs: number;
};

function receiptLockSession(receiptId: string): string {
	return `receipt-${createHash("sha256").update(receiptId).digest("hex")}`;
}

function lockIdentity(fd: number): ReceiptLockIdentity {
	const stat = fstatSync(fd, { bigint: true });
	return { dev: stat.dev, ino: stat.ino };
}

function identitiesMatch(
	left: ReceiptLockIdentity,
	right: ReceiptLockIdentity,
): boolean {
	return left.dev === right.dev && left.ino === right.ino;
}

function readReceiptLockMetadata(path: string): ReceiptLockMetadata | null {
	let fd: number | null = null;
	try {
		fd = openSync(path, "r");
		const raw = JSON.parse(readFileSync(fd, "utf8")) as Record<string, unknown>;
		const ownerToken = raw.owner_token;
		const acquiredAt = raw.acquired_at;
		if (
			typeof ownerToken !== "string" ||
			!ownerToken ||
			typeof acquiredAt !== "string" ||
			!Number.isFinite(Date.parse(acquiredAt))
		)
			return null;
		return {
			...lockIdentity(fd),
			ownerToken,
			acquiredAtMs: Date.parse(acquiredAt),
		};
	} catch {
		return null;
	} finally {
		if (fd !== null) closeSync(fd);
	}
}

function releaseReceiptLockIfOwned(
	path: string,
	expected: ReceiptLockMetadata,
): boolean {
	let fd: number | null = null;
	try {
		fd = openSync(path, "r");
		if (!identitiesMatch(lockIdentity(fd), expected)) return false;
		const current = JSON.parse(readFileSync(fd, "utf8")) as Record<
			string,
			unknown
		>;
		if (current.owner_token !== expected.ownerToken) return false;
		unlinkSync(path);
		return true;
	} catch {
		return false;
	} finally {
		if (fd !== null) closeSync(fd);
	}
}

export const receiptLockTesting = {
	lockPath: receiptLockPath,
	releaseIfOwned(path: string, ownerToken: string): boolean {
		const metadata = readReceiptLockMetadata(path);
		return metadata?.ownerToken === ownerToken
			? releaseReceiptLockIfOwned(path, metadata)
			: false;
	},
};

function appendReceiptRecord(root: string, record: ReceiptRecord): void {
	const path = receiptJournalPath(root);
	mkdirSync(join(root, ".afol", "data", "receipts"), { recursive: true });
	const fd = openSync(path, "a");
	try {
		writeFileSync(fd, `${JSON.stringify(record)}\n`, "utf8");
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
}

function withReceiptLock<T>(
	root: string,
	receiptId: string,
	operation: () => T,
): T {
	return withSessionLock(root, receiptLockSession(receiptId), () => {
		const path = receiptLockPath(root, receiptId);
		mkdirSync(join(root, ".afol", "data", "receipts", "locks"), {
			recursive: true,
		});
		let fd: number | null = null;
		while (fd === null) {
			try {
				fd = openSync(path, "wx");
			} catch {
				const prior = readReceiptLockMetadata(path);
				if (!prior)
					fail("Receipt lock is invalid or cannot be safely recovered.");
				if (Date.now() - prior.acquiredAtMs <= RECEIPT_LOCK_STALE_MS)
					fail("Receipt ingestion is already in progress; retry shortly.");
				if (!releaseReceiptLockIfOwned(path, prior))
					fail("Receipt lock changed during stale recovery; retry shortly.");
			}
		}
		const ownerToken = randomUUID();
		let owned: ReceiptLockMetadata | null = null;
		try {
			owned = {
				...lockIdentity(fd),
				ownerToken,
				acquiredAtMs: Date.now(),
			};
			writeFileSync(
				fd,
				`${JSON.stringify({
					owner_token: ownerToken,
					acquired_at: new Date(owned.acquiredAtMs).toISOString(),
				})}\n`,
				"utf8",
			);
			fsyncSync(fd);
			return operation();
		} finally {
			if (owned) releaseReceiptLockIfOwned(path, owned);
			closeSync(fd);
		}
	});
}

function loadReceiptRecords(root: string): ReceiptRecord[] {
	const path = receiptJournalPath(root);
	if (!existsSync(path)) return [];
	const stat = statSync(path);
	if (!stat.isFile() || stat.size > 4 * 1024 * 1024)
		return fail("External receipt journal is invalid.");
	return readFileSync(path, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			try {
				return JSON.parse(line) as ReceiptRecord;
			} catch {
				return fail("External receipt journal is invalid.");
			}
		});
}

function receiptState(
	records: readonly ReceiptRecord[],
	receiptId: string,
): ReceiptRecord | null {
	let state: ReceiptRecord | null = null;
	for (const record of records) {
		if (record.receipt_id !== receiptId) continue;
		if (!record.receipt_digest || !record.created_at)
			fail("External receipt journal is invalid.");
		if (record.record_type === "reservation") {
			if (!record.receipt) fail("External receipt journal is invalid.");
			state = record;
			continue;
		}
		if (record.record_type === "committed" && state) {
			if (!record.evidence_id) fail("External receipt journal is invalid.");
			const reservedReceipt: ExternalReceipt | undefined = state.receipt;
			if (!reservedReceipt) fail("External receipt journal is invalid.");
			state = { ...state, ...record, receipt: reservedReceipt };
			continue;
		}
		fail("External receipt journal is invalid.");
	}
	return state;
}

function recordedEvidenceId(
	root: string,
	receipt: ExternalReceipt,
): string | null {
	const evidencePath = sessionPaths(root, receipt.session_id).evidencePath;
	if (!existsSync(evidencePath)) return null;
	const marker = `external receipt ${receipt.receipt_id} harness ${receipt.harness_id} run ${receipt.run_id}`;
	const entries = readFileSync(evidencePath, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as { id?: unknown; command?: unknown });
	const matching = entries.filter(
		(entry) => typeof entry.id === "string" && entry.command === marker,
	);
	if (matching.length > 1)
		fail("Receipt evidence recovery found duplicate entries.");
	return matching[0]?.id as string | null;
}

function assertTaskBinding(root: string, receipt: ExternalReceipt): void {
	const paths = sessionPaths(root, receipt.session_id);
	if (!existsSync(paths.taskPath))
		fail("Receipt session task board does not exist.");
	const escaped = receipt.task_id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	if (
		!new RegExp(`^\\|\\s*${escaped}\\s*\\|`, "m").test(
			readFileSync(paths.taskPath, "utf8"),
		)
	)
		fail("Receipt task does not exist in the session.");
}

function assertPathProvenance(root: string, receipt: ExternalReceipt): void {
	for (const path of receipt.checked_paths) {
		const resolved = resolveProjectPath(root, path);
		if (!resolved.ok || !existsSync(resolved.value.path))
			fail("Receipt checked path is outside the project or missing.");
		if (relative(root, resolved.value.path).replaceAll("\\", "/") !== path)
			fail("Receipt checked path is not canonical.");
	}
	const currentHead = execFileSync("git", ["rev-parse", "HEAD"], {
		cwd: root,
		encoding: "utf8",
	})
		.trim()
		.toLowerCase();
	if (receipt.head_commit !== currentHead)
		fail("Receipt head_commit does not match the current project HEAD.");
	for (const commit of [receipt.source_commit, receipt.head_commit]) {
		try {
			execFileSync("git", ["cat-file", "-e", `${commit}^{commit}`], {
				cwd: root,
				stdio: "ignore",
			});
		} catch {
			fail("Receipt commit provenance is unknown to this project.");
		}
	}
	try {
		execFileSync(
			"git",
			[
				"merge-base",
				"--is-ancestor",
				receipt.source_commit,
				receipt.head_commit,
			],
			{ cwd: root, stdio: "ignore" },
		);
	} catch {
		fail("Receipt source_commit is not an ancestor of head_commit.");
	}
	const diff = execFileSync(
		"git",
		[
			"diff",
			"--no-ext-diff",
			"--binary",
			`${receipt.source_commit}..${receipt.head_commit}`,
		],
		{ cwd: root, maxBuffer: MAX_RECEIPT_BYTES },
	);
	const canonicalDiffHash = createHash("sha256").update(diff).digest("hex");
	if (receipt.diff_hash !== canonicalDiffHash)
		fail("Receipt diff_hash does not match source_commit..head_commit.");
}

export function readExternalReceipt(path: string): ExternalReceipt {
	const stat = statSync(path);
	if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_RECEIPT_BYTES)
		return fail("Receipt file exceeds the allowed size.");
	let parsed: Record<string, unknown>;
	try {
		parsed = asObject(JSON.parse(readFileSync(path, "utf8")));
	} catch (error) {
		if (error instanceof Error && error.message.startsWith("Receipt"))
			throw error;
		return fail("Receipt file is not valid JSON.");
	}
	const allowed = new Set([
		"receipt_id",
		"project_id",
		"session_id",
		"task_id",
		"harness_id",
		"run_id",
		"harness_profile_id",
		"harness_profile_digest",
		"source_commit",
		"head_commit",
		"diff_hash",
		"checked_paths",
		"check_command",
		"check_exit_code",
		"tool_trace_digest",
		"started_at",
		"finished_at",
		"result",
	]);
	if (Object.keys(parsed).some((key) => !allowed.has(key)))
		return fail("Receipt contains unsupported fields.");
	if (
		!Array.isArray(parsed.checked_paths) ||
		parsed.checked_paths.length === 0 ||
		parsed.checked_paths.length > 64
	)
		return fail("Receipt checked_paths is invalid.");
	const checkedPaths = parsed.checked_paths.map((value) =>
		requiredText(value, "checked_path"),
	);
	if (new Set(checkedPaths).size !== checkedPaths.length)
		fail("Receipt checked_paths contains duplicates.");
	const checkCommand =
		parsed.check_command === undefined
			? undefined
			: requiredText(parsed.check_command, "check_command");
	const rawCheckExitCode = parsed.check_exit_code;
	if (
		(checkCommand === undefined) !== (rawCheckExitCode === undefined) ||
		(rawCheckExitCode !== undefined &&
			(typeof rawCheckExitCode !== "number" ||
				!Number.isSafeInteger(rawCheckExitCode) ||
				rawCheckExitCode < 0 ||
				rawCheckExitCode > 255))
	)
		fail("Receipt check command and exit code must be supplied together.");
	const checkExitCode = rawCheckExitCode as number | undefined;
	const result = requiredText(parsed.result, "result");
	if (!RESULT_VALUES.has(result)) fail("Receipt result is invalid.");
	const receipt: ExternalReceipt = {
		receipt_id: requiredId(parsed.receipt_id, "receipt_id"),
		project_id: requiredId(parsed.project_id, "project_id"),
		session_id: requiredId(parsed.session_id, "session_id"),
		task_id: requiredId(parsed.task_id, "task_id"),
		harness_id: requiredId(parsed.harness_id, "harness_id"),
		run_id: requiredId(parsed.run_id, "run_id"),
		harness_profile_id: requiredId(
			parsed.harness_profile_id,
			"harness_profile_id",
		),
		harness_profile_digest: requiredHash(
			parsed.harness_profile_digest,
			"harness_profile_digest",
		),
		source_commit: requiredCommit(parsed.source_commit, "source_commit"),
		head_commit: requiredCommit(parsed.head_commit, "head_commit"),
		diff_hash: requiredHash(parsed.diff_hash, "diff_hash"),
		checked_paths: checkedPaths,
		...(checkCommand !== undefined && checkExitCode !== undefined
			? { check_command: checkCommand, check_exit_code: checkExitCode }
			: {}),
		tool_trace_digest: requiredHash(
			parsed.tool_trace_digest,
			"tool_trace_digest",
		),
		started_at: timestamp(parsed.started_at, "started_at"),
		finished_at: timestamp(parsed.finished_at, "finished_at"),
		result: result as ExternalReceipt["result"],
	};
	if (Date.parse(receipt.started_at) > Date.parse(receipt.finished_at))
		fail("Receipt timestamps are invalid.");
	if (Date.now() - Date.parse(receipt.finished_at) > MAX_RECEIPT_AGE_MS)
		fail("Receipt is older than the allowed ingestion window.");
	if (Date.parse(receipt.finished_at) - Date.now() > MAX_RECEIPT_FUTURE_SKEW_MS)
		fail("Receipt finished_at exceeds the allowed future clock skew.");
	return receipt;
}

export function ingestExternalReceipt(input: {
	root: string;
	receipt: ExternalReceipt;
	commands: readonly CommandSpec[];
	recordObservedEvidence: (input: {
		session: string;
		taskId: string;
		command: string;
		result: string;
		exitCode?: number;
		provenance: "observed";
		note: string;
	}) => { id: string };
}): ReceiptIngestResult {
	const { root, receipt } = input;
	if (receipt.project_id !== projectId(root))
		fail("Receipt belongs to another project.");
	const profile = fixedHarnessProfile(
		input.commands,
		receipt.harness_profile_id,
	);
	if (!profile || profile.digest !== receipt.harness_profile_digest)
		fail("Receipt harness profile is unknown or has a mismatched digest.");
	assertTaskBinding(root, receipt);
	assertPathProvenance(root, receipt);
	const digest = receiptDigest(receipt);
	return withReceiptLock(root, receipt.receipt_id, () => {
		const prior = receiptState(loadReceiptRecords(root), receipt.receipt_id);
		if (prior && prior.receipt_digest !== digest)
			fail("Receipt id already exists with different canonical content.");
		if (prior?.evidence_id)
			return {
				receipt_id: receipt.receipt_id,
				evidence_id: prior.evidence_id,
				status: "duplicate" as const,
			};
		if (!prior) {
			appendReceiptRecord(root, {
				record_type: "reservation",
				receipt,
				receipt_id: receipt.receipt_id,
				receipt_digest: digest,
				created_at: new Date().toISOString(),
			});
		}
		const recoveredEvidenceId = recordedEvidenceId(root, receipt);
		const evidenceId =
			recoveredEvidenceId ??
			input.recordObservedEvidence({
				session: receipt.session_id,
				taskId: receipt.task_id,
				command: `external receipt ${receipt.receipt_id} harness ${receipt.harness_id} run ${receipt.run_id}`,
				result: receipt.result,
				...(receipt.check_exit_code === undefined
					? {}
					: { exitCode: receipt.check_exit_code }),
				provenance: "observed",
				note: `profile=${profile.id} profile_digest=${profile.digest} receipt_digest=${digest}`,
			}).id;
		appendReceiptRecord(root, {
			record_type: "committed",
			receipt_id: receipt.receipt_id,
			receipt_digest: digest,
			evidence_id: evidenceId,
			created_at: new Date().toISOString(),
		});
		return {
			receipt_id: receipt.receipt_id,
			evidence_id: evidenceId,
			status: "committed" as const,
		};
	});
}
