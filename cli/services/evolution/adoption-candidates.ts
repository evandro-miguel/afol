import { createHash } from "node:crypto";
import {
	closeSync,
	existsSync,
	fstatSync,
	fsyncSync,
	ftruncateSync,
	lstatSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	writeSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { withSessionLock } from "../io/session-lock";
import { readMemory } from "../memory";
import { readProjectConfig, resolveProjectPaths } from "../project/paths";
import {
	readActiveSession,
	sessionLifecycleState,
} from "../workbench/lifecycle";
import { verifyWorkbenchTasks } from "../workbench/verify";
import { redactSensitiveText } from "./observation-model";
import { resolveEvolutionConfig } from "./runtime-config";

const MAX_CANDIDATES = 10;
const MAX_SESSION_FILES = 24;
const MAX_SESSION_FILE_BYTES = 32_768;
const MAX_EVIDENCE_FILE_BYTES = 65_536;
const MAX_PUBLIC_TEXT_BYTES = 512;
const ADOPTION_REVIEW_JOURNAL_LOCK = "__evolution-adoption-reviews__";
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const RECORD_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const EXPLICIT_LABELS = [
	"decision",
	"correction",
	"lesson",
	"preference",
] as const;

export const ADOPTION_DESTINATIONS = ["memory", "library"] as const;
export type AdoptionDestination = (typeof ADOPTION_DESTINATIONS)[number];
export type AdoptionReviewDecision = "approved" | "rejected";
type CandidateReviewState =
	| "candidate_available"
	| "already_adopted"
	| "duplicate"
	| "conflict"
	| "approved"
	| "rejected";

export type AdoptionCandidate = {
	record_type: "adoption_candidate";
	id: string;
	state_class: "derived";
	status: "candidate";
	created_at: string;
	project_id: string;
	session_id: string;
	destination: AdoptionDestination;
	candidate_type: "project_continuity" /** @deprecated Use recommendation. */;
	statement: string;
	problem: string;
	problem_truncated: boolean;
	recommendation: string;
	recommendation_truncated: boolean;
	fingerprint: string;
	provenance: "explicit";
	confidence: number;
	confidence_reason: string;
	review_state: CandidateReviewState;
	conflict_refs: string[];
	approval_required: true;
	approval_owner: "learning_reviewer";
	next_action: string;
	project_scope: "project";
	explicitness: "explicit";
	source_refs: Array<{
		id: string;
		kind: "session" | "report" | "evidence";
		path?: string;
		digest?: string;
		authority: "canonical";
	}>;
	session_provenance: { session_id: string; lifecycle: "closed" };
	evidence_provenance: { evidence_id: string; task_id: string; digest: string };
};

export type AdoptionCandidateResult = {
	read_only: true;
	session_id: string | null;
	review_state:
		| CandidateReviewState
		| "no_candidate"
		| "blocked_missing_evidence";
	candidates: AdoptionCandidate[];
	list: {
		requested_limit: number;
		returned: number;
		available: number;
		truncated: boolean;
	};
};

export type AdoptionReviewEvent = {
	record_type: "adoption_review";
	schema_version: 1;
	id: string;
	session_id: string;
	candidate_id: string;
	fingerprint: string;
	decision: AdoptionReviewDecision;
	reason: string;
	created_at: string;
};

export type LearningReviewStatus = {
	session_id: string;
	required: Array<{ id: string; fingerprint: string }>;
	terminal: boolean;
};

export type AdoptionReviewAppendOptions = {
	/** Narrow fault-injection seam for durability tests. */
	writeBytes?: (fd: number, value: Buffer) => number;
	syncFile?: (fd: number) => void;
	syncDirectory?: (directory: string) => void;
	truncateFile?: (fd: number, size: number) => void;
};

function digest(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}
function adoptionReviewEventId(input: {
	session_id: string;
	candidate_id: string;
	fingerprint: string;
	created_at: string;
	decision: AdoptionReviewDecision;
}): string {
	return `AR-${digest(`${input.session_id}:${input.candidate_id}:${input.fingerprint}:${input.created_at}:${input.decision}`).slice(0, 20)}`;
}
function redactedRequired(value: string): string | null {
	return redactSensitiveText(value, { redactPaths: true }) || null;
}
type PublicText = { value: string; truncated: boolean };
function boundedPublicText(value: string): PublicText | null {
	const redacted = redactedRequired(value);
	if (!redacted) return null;
	let bytes = 0;
	let bounded = "";
	for (const character of redacted) {
		const characterBytes = Buffer.byteLength(character, "utf8");
		if (bytes + characterBytes > MAX_PUBLIC_TEXT_BYTES)
			return { value: bounded, truncated: true };
		bounded += character;
		bytes += characterBytes;
	}
	return { value: bounded, truncated: false };
}
function isMarkdownValueBoundary(line: string): boolean {
	const trimmed = line.trim();
	return (
		!trimmed ||
		/^#{1,6}\s/.test(trimmed) ||
		/^(?:[-*+]\s+|\d+[.)]\s+)/.test(trimmed) ||
		/^[A-Za-z][A-Za-z0-9 _-]{0,80}:\s*/.test(trimmed)
	);
}
function labeledValue(
	content: string,
	labels: readonly string[],
): { label: string; value: string } | null {
	const labelPattern = labels.join("|");
	const linePattern = new RegExp(
		`^\\s*(?:[-*]\\s*)?(${labelPattern})\\s*:\\s*(\\S(?:.*?\\S)?)\\s*$`,
		"i",
	);
	const lines = content.split(/\r?\n/);
	for (let index = 0; index < lines.length; index += 1) {
		const match = linePattern.exec(lines[index] ?? "");
		if (!match?.[1] || !match[2]) continue;
		const parts = [match[2]];
		for (let next = index + 1; next < lines.length; next += 1) {
			const line = lines[next] ?? "";
			if (!/^\s+/.test(line) || isMarkdownValueBoundary(line)) break;
			parts.push(line.trim());
		}
		return { label: match[1].toLowerCase(), value: parts.join(" ") };
	}
	return null;
}
function emptyResult(
	session: string | null,
	reviewState: AdoptionCandidateResult["review_state"],
	limit: number,
): AdoptionCandidateResult {
	return {
		read_only: true,
		session_id: session,
		review_state: reviewState,
		candidates: [],
		list: {
			requested_limit: limit,
			returned: 0,
			available: 0,
			truncated: false,
		},
	};
}
function sessionPath(root: string, session: string): string {
	if (!SESSION_ID.test(session))
		throw new Error("evolve candidates session is invalid");
	const wbDir = resolveProjectPaths(root).abs.wbDir;
	const path = resolve(wbDir, session);
	if (relative(wbDir, path).startsWith(".."))
		throw new Error("evolve candidates session escapes workbench");
	if (!existsSync(path) || !lstatSync(path).isDirectory())
		throw new Error("evolve candidates session was not found");
	return path;
}
function explicitStatement(sessionDir: string): {
	problem: string;
	problemTruncated: boolean;
	recommendation: string;
	recommendationTruncated: boolean;
	destination: AdoptionDestination;
	path: string;
	digest: string;
} | null {
	const files = readdirSync(sessionDir, { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
		.map((entry) => join(sessionDir, entry.name))
		.sort()
		.slice(0, MAX_SESSION_FILES);
	for (const path of files) {
		const stat = lstatSync(path);
		if (!stat.isFile() || stat.size > MAX_SESSION_FILE_BYTES) continue;
		const content = readFileSync(path, "utf8");
		const problem = boundedPublicText(
			labeledValue(content, ["problem"])?.value ?? "",
		);
		const recommendation = boundedPublicText(
			labeledValue(content, ["recommendation"])?.value ?? "",
		);
		const destination = labeledValue(content, [
			"destination",
		])?.value.toLowerCase() as AdoptionDestination | undefined;
		if (
			problem &&
			recommendation &&
			(destination === "memory" || destination === "library")
		)
			return {
				problem: problem.value,
				problemTruncated: problem.truncated,
				recommendation: recommendation.value,
				recommendationTruncated: recommendation.truncated,
				destination,
				path,
				digest: digest(content),
			};
		const explicit = labeledValue(content, EXPLICIT_LABELS);
		if (!explicit) continue;
		const statement = boundedPublicText(explicit.value);
		if (!statement) continue;
		const kind = explicit.label;
		const fallbackProblem = boundedPublicText(
			`Explicit ${kind} recorded by the closed session`,
		);
		if (!fallbackProblem) continue;
		return {
			problem: fallbackProblem.value,
			problemTruncated: fallbackProblem.truncated,
			recommendation: statement.value,
			recommendationTruncated: statement.truncated,
			destination:
				kind === "correction" || kind === "lesson" ? "library" : "memory",
			path,
			digest: digest(content),
		};
	}
	return null;
}
function evidenceRef(
	sessionDir: string,
	taskIds: ReadonlySet<string>,
): { id: string; taskId: string; createdAt: string; digest: string } | null {
	const path = join(sessionDir, ".evidence.jsonl");
	if (
		!existsSync(path) ||
		!lstatSync(path).isFile() ||
		lstatSync(path).size > MAX_EVIDENCE_FILE_BYTES
	)
		return null;
	for (const line of readFileSync(path, "utf8").split("\n")) {
		if (!line.trim()) continue;
		try {
			const value = JSON.parse(line) as Record<string, unknown>;
			if (
				typeof value.id === "string" &&
				typeof value.task_id === "string" &&
				taskIds.has(value.task_id) &&
				typeof value.created_at === "string" &&
				RECORD_ID.test(value.id) &&
				!Number.isNaN(Date.parse(value.created_at)) &&
				value.provenance === "observed" &&
				value.exit_code === 0 &&
				typeof value.command === "string" &&
				value.command.trim() !== "" &&
				["passed", "pass", "success", "ok"].includes(
					String(value.result).toLowerCase(),
				)
			)
				return {
					id: value.id,
					taskId: value.task_id,
					createdAt: value.created_at,
					digest: digest(line),
				};
		} catch {
			return null;
		}
	}
	return null;
}
function completedTaskIds(sessionDir: string): Set<string> {
	const ids = new Set<string>();
	for (const entry of readdirSync(sessionDir, { withFileTypes: true })) {
		if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
		const path = join(sessionDir, entry.name);
		if (lstatSync(path).size > MAX_SESSION_FILE_BYTES) continue;
		for (const match of readFileSync(path, "utf8").matchAll(
			/^\|\s*(T-\d{2,3})\s*\|\s*done\s*\|/gim,
		))
			if (match[1]) ids.add(match[1]);
	}
	return ids;
}
function alreadyAdopted(root: string, statement: string): boolean {
	return (readMemory(root)?.entries ?? []).some(
		(entry) =>
			redactSensitiveText(entry.body, { redactPaths: true }) === statement,
	);
}
export function adoptionReviewJournalPath(root: string): string {
	return join(
		resolveProjectPaths(root).abs.mutableDir,
		"data",
		"evolution",
		"adoption-reviews.jsonl",
	);
}
function withAdoptionReviewJournalLock<T>(root: string, action: () => T): T {
	return withSessionLock(root, ADOPTION_REVIEW_JOURNAL_LOCK, action);
}
function readAdoptionReviewEventsUnlocked(root: string): AdoptionReviewEvent[] {
	const path = adoptionReviewJournalPath(root);
	if (!existsSync(path)) return [];
	const ids = new Set<string>();
	return readFileSync(path, "utf8")
		.split("\n")
		.flatMap((line, index) => {
			if (!line.trim()) return [];
			let event: AdoptionReviewEvent;
			try {
				event = JSON.parse(line) as AdoptionReviewEvent;
			} catch {
				throw new Error(
					`adoption review journal line ${index + 1} is invalid or legacy`,
				);
			}
			if (
				event.record_type !== "adoption_review" ||
				event.schema_version !== 1 ||
				!/^AR-[a-f0-9]{20}$/.test(event.id) ||
				!SESSION_ID.test(event.session_id) ||
				!/^AC-[a-f0-9]{20}$/.test(event.candidate_id) ||
				!/^[a-f0-9]{64}$/.test(event.fingerprint) ||
				(event.decision !== "approved" && event.decision !== "rejected") ||
				typeof event.reason !== "string" ||
				!event.reason.trim() ||
				/\p{Cc}/u.test(event.reason) ||
				typeof event.created_at !== "string" ||
				Number.isNaN(Date.parse(event.created_at)) ||
				event.id !== adoptionReviewEventId(event) ||
				ids.has(event.id)
			)
				throw new Error(
					`adoption review journal line ${index + 1} is invalid or legacy`,
				);
			ids.add(event.id);
			return [event];
		});
}
export function readAdoptionReviewEvents(root: string): AdoptionReviewEvent[] {
	return withAdoptionReviewJournalLock(root, () =>
		readAdoptionReviewEventsUnlocked(root),
	);
}
export function appendAdoptionReviewEvent(
	root: string,
	session: string,
	input: Omit<
		AdoptionReviewEvent,
		"record_type" | "schema_version" | "id" | "session_id"
	>,
	options: AdoptionReviewAppendOptions = {},
): AdoptionReviewEvent {
	if (!SESSION_ID.test(session))
		throw new Error("evolve candidates session is invalid");
	if (!input.reason.trim())
		throw new Error("evolve candidates review requires --reason <reason>");
	if (
		(input.decision !== "approved" && input.decision !== "rejected") ||
		/\p{Cc}/u.test(input.reason)
	)
		throw new Error("evolve candidates review is invalid");
	const event: AdoptionReviewEvent = {
		record_type: "adoption_review",
		schema_version: 1,
		id: "",
		session_id: session,
		...input,
	};
	event.id = adoptionReviewEventId(event);
	if (
		!/^AC-[a-f0-9]{20}$/.test(input.candidate_id) ||
		!/^[a-f0-9]{64}$/.test(input.fingerprint) ||
		Number.isNaN(Date.parse(input.created_at))
	)
		throw new Error("evolve candidates review is invalid");
	return withAdoptionReviewJournalLock(root, () => {
		const existing = readAdoptionReviewEventsUnlocked(root);
		if (
			existing.some(
				(entry) =>
					entry.session_id === session &&
					entry.fingerprint === event.fingerprint,
			)
		)
			throw new Error(
				"evolve candidates review already has a terminal decision",
			);
		const path = adoptionReviewJournalPath(root);
		mkdirSync(resolve(path, ".."), { recursive: true, mode: 0o700 });
		const fd = openSync(path, "a", 0o600);
		const previousSize = fstatSync(fd).size;
		const line = Buffer.from(`${JSON.stringify(event)}\n`, "utf8");
		let attemptedWrite = false;
		let committed = false;
		let primaryError: unknown;
		let rollbackError: unknown;
		try {
			let offset = 0;
			while (offset < line.byteLength) {
				attemptedWrite = true;
				const written = (
					options.writeBytes ??
					((target, value) =>
						writeSync(target, value, 0, value.byteLength, null))
				)(fd, line.subarray(offset));
				if (!Number.isInteger(written) || written <= 0)
					throw new Error(
						"adoption review journal write did not make progress",
					);
				offset += written;
			}
			(options.syncFile ?? fsyncSync)(fd);
			if (process.platform !== "win32") {
				const parentFd = openSync(resolve(path, ".."), "r");
				try {
					(options.syncDirectory ?? ((_: string) => fsyncSync(parentFd)))(
						resolve(path, ".."),
					);
				} finally {
					closeSync(parentFd);
				}
			}
			committed = true;
		} catch (error) {
			primaryError = error;
			if (attemptedWrite) {
				try {
					// Windows rejects ftruncate on an O_APPEND descriptor. Roll back
					// through a separate non-append descriptor after proving it still
					// names the file that received the partial append.
					const opened = fstatSync(fd);
					const rollbackFd = openSync(path, "r+");
					try {
						const rollbackOpened = fstatSync(rollbackFd);
						if (
							String(rollbackOpened.dev) !== String(opened.dev) ||
							String(rollbackOpened.ino) !== String(opened.ino)
						)
							throw new Error(
								"adoption review journal changed before rollback",
							);
						(options.truncateFile ?? ftruncateSync)(rollbackFd, previousSize);
						(options.syncFile ?? fsyncSync)(rollbackFd);
					} finally {
						closeSync(rollbackFd);
					}
					if (process.platform !== "win32") {
						const parentFd = openSync(resolve(path, ".."), "r");
						try {
							fsyncSync(parentFd);
						} finally {
							closeSync(parentFd);
						}
					}
				} catch (errorDuringRollback) {
					rollbackError = errorDuringRollback;
				}
			}
		} finally {
			closeSync(fd);
		}
		if (primaryError !== undefined) {
			if (rollbackError !== undefined)
				throw new AggregateError(
					[primaryError, rollbackError],
					"adoption review journal append and rollback failed",
				);
			throw primaryError;
		}
		if (!committed) throw new Error("adoption review journal append failed");
		return event;
	});
}

export function reviewAdoptionCandidate(input: {
	root: string;
	session: string;
	candidateId: string;
	decision: AdoptionReviewDecision;
	reason: string;
	createdAt: string;
}): AdoptionReviewEvent {
	return withAdoptionReviewJournalLock(input.root, () => {
		const result = discoverAdoptionCandidates({
			root: input.root,
			session: input.session,
			limit: MAX_CANDIDATES,
		});
		const candidate = result.candidates.find(
			(entry) => entry.id === input.candidateId,
		);
		if (!candidate)
			throw new Error("evolve candidates review candidate is missing or stale");
		if (candidate.review_state !== "candidate_available")
			throw new Error(
				"evolve candidates review already has a terminal decision",
			);
		return appendAdoptionReviewEvent(input.root, input.session, {
			candidate_id: candidate.id,
			fingerprint: candidate.fingerprint,
			decision: input.decision,
			reason: input.reason,
			created_at: input.createdAt,
		});
	});
}

export function learningReviewStatus(
	root: string,
	session: string,
): LearningReviewStatus {
	const result = discoverAdoptionCandidates({
		root,
		session,
		limit: MAX_CANDIDATES,
	});
	const required = result.candidates.map((candidate) => ({
		id: candidate.id,
		fingerprint: candidate.fingerprint,
	}));
	return {
		session_id: session,
		required,
		terminal:
			result.review_state === "no_candidate" ||
			result.review_state === "approved" ||
			result.review_state === "rejected" ||
			result.review_state === "already_adopted" ||
			result.review_state === "duplicate" ||
			result.review_state === "conflict",
	};
}
/** Read-only, deterministic discovery of explicit continuity statements. */
export function discoverAdoptionCandidates(input: {
	root: string;
	session?: string;
	limit?: number;
}): AdoptionCandidateResult {
	return withAdoptionReviewJournalLock(input.root, () =>
		discoverAdoptionCandidatesUnlocked(input),
	);
}
function discoverAdoptionCandidatesUnlocked(input: {
	root: string;
	session?: string;
	limit?: number;
}): AdoptionCandidateResult {
	const limit = input.limit ?? 3;
	if (!Number.isInteger(limit) || limit < 1 || limit > MAX_CANDIDATES)
		throw new Error(
			"evolve candidates --limit must be an integer from 1 to 10",
		);
	const configured = resolveEvolutionConfig(readProjectConfig(input.root));
	if (!configured.configured || !configured.enabled || !configured.projectId)
		return emptyResult(input.session ?? null, "no_candidate", limit);
	const session = input.session ?? readActiveSession(input.root);
	if (!session) return emptyResult(null, "no_candidate", limit);
	const path = sessionPath(input.root, session);
	if (sessionLifecycleState(input.root, session) !== "closed")
		return emptyResult(session, "blocked_missing_evidence", limit);
	const verification = verifyWorkbenchTasks(path, true);
	const explicit = explicitStatement(path);
	const evidence = evidenceRef(path, completedTaskIds(path));
	if (!verification.allCompleted || !explicit || !evidence)
		return emptyResult(
			session,
			explicit ? "blocked_missing_evidence" : "no_candidate",
			limit,
		);
	const fingerprint = digest(
		`${configured.projectId}\n${session}\n${explicit.destination}\n${explicit.problem}\n${explicit.recommendation}\n${evidence.digest}`,
	);
	const id = `AC-${fingerprint.slice(0, 20)}`;
	const prior = readAdoptionReviewEvents(input.root).filter(
		(event) =>
			event.session_id === session && event.fingerprint === fingerprint,
	);
	const adopted =
		explicit.destination === "memory" &&
		alreadyAdopted(input.root, explicit.recommendation);
	const decisions = new Set(prior.map((event) => event.decision));
	const reviewState: CandidateReviewState =
		decisions.size > 1
			? "conflict"
			: (prior.at(-1)?.decision ??
				(adopted
					? "already_adopted"
					: prior.length > 0
						? "duplicate"
						: "candidate_available"));
	const candidate: AdoptionCandidate = {
		record_type: "adoption_candidate",
		id,
		state_class: "derived",
		status: "candidate",
		created_at: evidence.createdAt,
		project_id: configured.projectId,
		session_id: session,
		destination: explicit.destination,
		candidate_type: "project_continuity",
		statement: explicit.recommendation,
		problem: explicit.problem,
		problem_truncated: explicit.problemTruncated,
		recommendation: explicit.recommendation,
		recommendation_truncated: explicit.recommendationTruncated,
		fingerprint,
		provenance: "explicit",
		confidence: 0.9,
		confidence_reason: "explicit session material with passed evidence",
		review_state: reviewState,
		conflict_refs: prior.map((event) => event.id),
		approval_required: true,
		approval_owner: "learning_reviewer",
		next_action:
			reviewState === "candidate_available"
				? `afol evolve candidates review --session ${session} --id ${id} --decision approved --approve --reason <reason>`
				: "inspect append-only review history",
		project_scope: "project",
		explicitness: "explicit",
		source_refs: [
			{ id: session, kind: "session", authority: "canonical" },
			{
				id: `R-${explicit.digest.slice(0, 20)}`,
				kind: "report",
				path: relative(input.root, explicit.path),
				digest: explicit.digest,
				authority: "canonical",
			},
			{
				id: evidence.id,
				kind: "evidence",
				digest: evidence.digest,
				authority: "canonical",
			},
		],
		session_provenance: { session_id: session, lifecycle: "closed" },
		evidence_provenance: {
			evidence_id: evidence.id,
			task_id: evidence.taskId,
			digest: evidence.digest,
		},
	};
	return {
		read_only: true,
		session_id: session,
		review_state: candidate.review_state,
		candidates: [candidate].slice(0, limit),
		list: {
			requested_limit: limit,
			returned: 1,
			available: 1,
			truncated: false,
		},
	};
}
