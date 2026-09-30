import { createHash, randomUUID } from "node:crypto";
import {
	closeSync,
	constants as fsConstants,
	fstatSync,
	fsyncSync,
	ftruncateSync,
	mkdirSync,
	openSync,
	writeSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import type { ArtifactReferenceV2 } from "../artifacts/types";
import { readBoundedSourceFile } from "../io/safe-source";
import { withSessionLock } from "../io/session-lock";
import { readProjectConfig, resolveProjectPaths } from "../project/paths";
import { resolveProjectWritePath } from "../project/root";
import { canonicalArtifactEvidenceReference } from "./artifact-inspection";
import type { AssistedProposalPreview } from "./assisted-proposal-packet";
import {
	assertSafeEvolutionProjectRoot,
	assertSafeEvolutionTarget,
} from "./db";
import { resolveEvolutionConfig } from "./runtime-config";

const JOURNAL_FILE = "assisted-proposals.jsonl";
const JOURNAL_LOCK = "__evolution-assisted-proposals__";
const GENESIS = "GENESIS";
const MAX_JOURNAL_BYTES = 32 * 1024 * 1024;
const MAX_JOURNAL_LINES = 32_768;
const MAX_EVENT_BYTES = 256 * 1024;
const DIGEST_RE = /^[a-f0-9]{64}$/;
const PROPOSAL_ID_RE = /^EP-[a-f0-9]{24}$/;

function previewProducesContextGuidance(preview: unknown): boolean {
	if (!preview || typeof preview !== "object" || Array.isArray(preview))
		return false;
	const value = preview as Record<string, unknown>;
	const intervention = value.intervention;
	const operations =
		intervention &&
		typeof intervention === "object" &&
		!Array.isArray(intervention)
			? (intervention as Record<string, unknown>).operations
			: undefined;
	if (!Array.isArray(operations)) return false;
	const expectedOperation = new Map<string, string>([
		["skill_discovery", "activate_skill"],
		["lesson_adoption", "apply_lesson"],
		["contextual_preference", "publish_guidance"],
		["durable_decision", "publish_guidance"],
		["durable_restriction", "publish_guidance"],
	]);
	const expected = expectedOperation.get(String(value.kind));
	return Boolean(
		expected &&
			operations.some(
				(operation) =>
					operation !== null &&
					typeof operation === "object" &&
					(operation as Record<string, unknown>).type === expected,
			),
	);
}

export type AssistedProposalEventType =
	| "prepared"
	| "decision"
	| "applied"
	| "evaluation"
	| "revoked";

export type AssistedProposalEvent = {
	schema_version: 1;
	sequence: number;
	event_id: string;
	event_type: AssistedProposalEventType;
	project_id: string;
	proposal_id: string;
	version_digest: string;
	problem_identity: string;
	timestamp: string;
	payload: Record<string, unknown>;
	previous_event_digest: string;
	event_digest: string;
};

export type ProposalDecision = "approve" | "defer" | "reject";

export class AssistedProposalSuppressedError extends Error {
	readonly code = "EVOLVE_PROPOSAL_SUPPRESSED";
	readonly hint =
		"Use --reopen-from <rejected-proposal-id> only when new material evidence supports reopening the same intervention.";
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value !== null && typeof value === "object")
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
			.join(",")}}`;
	return JSON.stringify(value) ?? "null";
}

function digest(value: unknown): string {
	return createHash("sha256").update(stableJson(value)).digest("hex");
}

function journalPath(root: string): string {
	assertSafeEvolutionProjectRoot(root);
	const config = resolveEvolutionConfig(readProjectConfig(root));
	const resolved = resolveProjectWritePath(
		root,
		join(config.paths.evolutionEventsDir, JOURNAL_FILE),
	);
	if (!resolved.ok) throw new Error("assisted proposal journal path is unsafe");
	return resolved.value.path;
}

function safeParseEvent(
	value: unknown,
	index: number,
	previousDigest: string,
	projectId: string,
): AssistedProposalEvent {
	if (value === null || typeof value !== "object" || Array.isArray(value))
		throw new Error(`assisted proposal journal line ${index + 1} is invalid`);
	const event = value as Record<string, unknown>;
	if (
		event.schema_version !== 1 ||
		event.sequence !== index + 1 ||
		typeof event.event_id !== "string" ||
		!/^APE-[0-9a-f-]{36}$/i.test(event.event_id) ||
		!new Set(["prepared", "decision", "applied", "evaluation", "revoked"]).has(
			String(event.event_type),
		) ||
		event.project_id !== projectId ||
		typeof event.proposal_id !== "string" ||
		!PROPOSAL_ID_RE.test(event.proposal_id) ||
		typeof event.version_digest !== "string" ||
		!DIGEST_RE.test(event.version_digest) ||
		typeof event.problem_identity !== "string" ||
		!DIGEST_RE.test(event.problem_identity) ||
		typeof event.timestamp !== "string" ||
		Number.isNaN(Date.parse(event.timestamp)) ||
		event.previous_event_digest !== previousDigest ||
		typeof event.event_digest !== "string" ||
		!DIGEST_RE.test(event.event_digest) ||
		event.payload === null ||
		typeof event.payload !== "object" ||
		Array.isArray(event.payload)
	)
		throw new Error(`assisted proposal journal line ${index + 1} is invalid`);
	const withoutDigest = { ...event };
	delete withoutDigest.event_digest;
	if (event.event_digest !== digest(withoutDigest))
		throw new Error(
			`assisted proposal journal line ${index + 1} digest mismatch`,
		);
	return event as unknown as AssistedProposalEvent;
}

function validateTransitions(events: readonly AssistedProposalEvent[]): void {
	const prepared = new Map<string, AssistedProposalEvent>();
	const latestDecision = new Map<string, ProposalDecision>();
	const applied = new Set<string>();
	const revoked = new Set<string>();
	for (const event of events) {
		const key = `${event.proposal_id}:${event.version_digest}`;
		if (event.event_type === "prepared") {
			if (prepared.has(key))
				throw new Error("assisted proposal journal has a duplicate version");
			const preview = event.payload.preview;
			if (
				preview === null ||
				typeof preview !== "object" ||
				Array.isArray(preview) ||
				(preview as Record<string, unknown>).proposal_id !==
					event.proposal_id ||
				(preview as Record<string, unknown>).version_digest !==
					event.version_digest ||
				(preview as Record<string, unknown>).problem_identity !==
					event.problem_identity
			)
				throw new Error("assisted proposal prepared payload binding mismatch");
			prepared.set(key, event);
			continue;
		}
		if (!prepared.has(key))
			throw new Error(
				"assisted proposal journal event has no prepared version",
			);
		if (event.event_type === "decision") {
			const action = event.payload.decision;
			if (
				!("approve defer reject".split(" ") as string[]).includes(
					String(action),
				)
			)
				throw new Error("assisted proposal journal decision is invalid");
			const previous = latestDecision.get(key);
			const reconsidering = event.payload.reconsider_rejection === true;
			if (
				reconsidering &&
				(action !== "approve" ||
					previous !== "reject" ||
					typeof event.payload.reason !== "string" ||
					!event.payload.reason.trim())
			)
				throw new Error(
					"assisted proposal rejection reconsideration is invalid",
				);
			if (previous === "reject" && action !== "reject" && !reconsidering)
				throw new Error("rejected assisted proposal version was reopened");
			if (applied.has(key) && action !== "approve")
				throw new Error("applied assisted proposal decision was changed");
			latestDecision.set(key, action as ProposalDecision);
			continue;
		}
		if (event.event_type === "applied") {
			if (latestDecision.get(key) !== "approve")
				throw new Error("assisted proposal apply lacks exact approval");
			if (applied.has(key))
				throw new Error("assisted proposal version was applied more than once");
			applied.add(key);
			continue;
		}
		if (event.event_type === "revoked") {
			if (
				!applied.has(key) ||
				revoked.has(key) ||
				!previewProducesContextGuidance(prepared.get(key)?.payload.preview) ||
				typeof event.payload.reason !== "string" ||
				!event.payload.reason.trim()
			)
				throw new Error("assisted proposal revocation is invalid");
			revoked.add(key);
			continue;
		}
		if (!applied.has(key))
			throw new Error("assisted proposal evaluation has no applied version");
	}
}

function readEventsUnlocked(
	root: string,
	projectId: string,
): AssistedProposalEvent[] {
	const path = journalPath(root);
	const text = readBoundedSourceFile(path, "assisted proposal journal", {
		maxBytes: MAX_JOURNAL_BYTES,
		maxLines: MAX_JOURNAL_LINES,
		maxCandidates: MAX_JOURNAL_LINES,
	});
	if (text === null || text.trim() === "") return [];
	const events: AssistedProposalEvent[] = [];
	let previous = GENESIS;
	for (const [index, line] of text.split(/\r?\n/).filter(Boolean).entries()) {
		if (Buffer.byteLength(line, "utf8") > MAX_EVENT_BYTES)
			throw new Error(
				`assisted proposal journal line ${index + 1} exceeds size limit`,
			);
		let raw: unknown;
		try {
			raw = JSON.parse(line);
		} catch {
			throw new Error(
				`assisted proposal journal line ${index + 1} is invalid JSON`,
			);
		}
		const event = safeParseEvent(raw, index, previous, projectId);
		events.push(event);
		previous = event.event_digest;
	}
	validateTransitions(events);
	return events;
}

export function withAssistedProposalJournalLock<T>(
	root: string,
	action: () => T,
): T {
	return withSessionLock(root, JOURNAL_LOCK, action);
}

export function readAssistedProposalJournal(
	root: string,
	projectId: string,
): AssistedProposalEvent[] {
	return withAssistedProposalJournalLock(root, () =>
		readEventsUnlocked(root, projectId),
	);
}

function appendEventUnlocked(input: {
	root: string;
	projectId: string;
	eventType: AssistedProposalEventType;
	proposalId: string;
	versionDigest: string;
	problemIdentity: string;
	payload: Record<string, unknown>;
	now?: Date;
}): AssistedProposalEvent {
	const path = journalPath(input.root);
	const events = readEventsUnlocked(input.root, input.projectId);
	if (events.length >= MAX_JOURNAL_LINES)
		throw new Error("assisted proposal journal exceeds line limit");
	const base = {
		schema_version: 1 as const,
		sequence: events.length + 1,
		event_id: `APE-${randomUUID()}`,
		event_type: input.eventType,
		project_id: input.projectId,
		proposal_id: input.proposalId,
		version_digest: input.versionDigest,
		problem_identity: input.problemIdentity,
		timestamp: (input.now ?? new Date()).toISOString(),
		payload: input.payload,
		previous_event_digest: events.at(-1)?.event_digest ?? GENESIS,
	};
	const event: AssistedProposalEvent = {
		...base,
		event_digest: digest(base),
	};
	const line = Buffer.from(`${JSON.stringify(event)}\n`, "utf8");
	if (line.byteLength > MAX_EVENT_BYTES)
		throw new Error("assisted proposal event exceeds size limit");
	const existing = assertSafeEvolutionTarget(path, "assisted proposal journal");
	const priorSize = Number(existing?.size ?? 0);
	if (priorSize + line.byteLength > MAX_JOURNAL_BYTES)
		throw new Error("assisted proposal journal exceeds size limit");
	const directory = dirname(path);
	mkdirSync(directory, { recursive: true, mode: 0o700 });
	const flags =
		fsConstants.O_RDWR |
		fsConstants.O_APPEND |
		fsConstants.O_CREAT |
		(process.platform === "win32" ? 0 : (fsConstants.O_NOFOLLOW ?? 0));
	const fd = openSync(path, flags, 0o600);
	try {
		const opened = fstatSync(fd);
		if (
			!opened.isFile() ||
			opened.nlink !== 1 ||
			opened.size !== priorSize ||
			(existing && (opened.dev !== existing.dev || opened.ino !== existing.ino))
		)
			throw new Error("assisted proposal journal changed during append");
		let offset = 0;
		try {
			while (offset < line.length) {
				const written = writeSync(fd, line, offset, line.length - offset);
				if (written <= 0)
					throw new Error("assisted proposal journal write made no progress");
				offset += written;
			}
			fsyncSync(fd);
		} catch (error) {
			try {
				ftruncateSync(fd, priorSize);
				fsyncSync(fd);
			} catch (rollbackError) {
				throw new AggregateError(
					[error, rollbackError],
					"assisted proposal journal write and rollback failed",
				);
			}
			throw error;
		}
	} finally {
		closeSync(fd);
	}
	if (process.platform !== "win32") {
		const directoryFd = openSync(directory, fsConstants.O_RDONLY);
		try {
			fsyncSync(directoryFd);
		} finally {
			closeSync(directoryFd);
		}
	}
	return event;
}

export function storePreparedAssistedProposal(
	root: string,
	preview: AssistedProposalPreview,
	now?: Date,
): { event: AssistedProposalEvent; duplicate: boolean } {
	return withAssistedProposalJournalLock(root, () => {
		const events = readEventsUnlocked(root, preview.project_id);
		const sameVersion = events.find(
			(event) =>
				event.event_type === "prepared" &&
				event.proposal_id === preview.proposal_id &&
				event.version_digest === preview.version_digest,
		);
		const rejected = events.filter(
			(event) =>
				event.event_type === "decision" && event.payload.decision === "reject",
		);
		const rejectedPrepared = rejected
			.map((decision) =>
				events.find(
					(event) =>
						event.event_type === "prepared" &&
						event.proposal_id === decision.proposal_id &&
						event.version_digest === decision.version_digest,
				),
			)
			.filter((event): event is AssistedProposalEvent => event !== undefined);
		const rejectedExact = rejectedPrepared.find(
			(event) => event.problem_identity === preview.problem_identity,
		);
		const previewEvidence = new Set(
			canonicalEvidenceIdentity(root, preview.evidence_refs),
		);
		const overlappingRejected = rejectedPrepared.find((event) => {
			const previous = event.payload.preview as AssistedProposalPreview;
			if (previous.intervention_identity !== preview.intervention_identity)
				return false;
			return canonicalEvidenceIdentity(root, previous.evidence_refs).some(
				(item) => previewEvidence.has(item),
			);
		});
		const previousProposalId = preview.problem_reopen_link;
		if (rejectedExact && previousProposalId !== rejectedExact.proposal_id)
			throw new AssistedProposalSuppressedError(
				`proposal matches rejected problem ${rejectedExact.proposal_id}`,
			);
		if (
			overlappingRejected &&
			previousProposalId !== overlappingRejected.proposal_id &&
			!rejectedExact
		)
			throw new AssistedProposalSuppressedError(
				`a related intervention was rejected as ${overlappingRejected.proposal_id}; new evidence requires --reopen-from`,
			);
		if (previousProposalId) {
			const previous = rejectedPrepared.find(
				(event) => event.proposal_id === previousProposalId,
			);
			if (!previous)
				throw new Error("proposal reopen source is not a rejected proposal");
			const previousPreview = previous.payload
				.preview as AssistedProposalPreview;
			if (
				previousPreview.intervention_identity !== preview.intervention_identity
			)
				throw new Error("proposal reopen intervention does not match source");
			const previousEvidence = new Set(
				canonicalEvidenceIdentity(root, previousPreview.evidence_refs),
			);
			if (
				previous.problem_identity === preview.problem_identity ||
				canonicalEvidenceIdentity(root, preview.evidence_refs).every((item) =>
					previousEvidence.has(item),
				)
			)
				throw new AssistedProposalSuppressedError(
					"proposal reopen requires materially new evidence",
				);
		}
		if (sameVersion) return { event: sameVersion, duplicate: true };
		const event = appendEventUnlocked({
			root,
			projectId: preview.project_id,
			eventType: "prepared",
			proposalId: preview.proposal_id,
			versionDigest: preview.version_digest,
			problemIdentity: preview.problem_identity,
			payload: { preview },
			...(now ? { now } : {}),
		});
		return { event, duplicate: false };
	});
}

type ProposalEvidenceReference =
	AssistedProposalPreview["evidence_refs"][number];

function isV2EvidenceReference(
	ref: ProposalEvidenceReference,
): ref is ArtifactReferenceV2 {
	return (ref as ArtifactReferenceV2).schema_version === 2;
}

function canonicalEvidenceIdentity(
	root: string,
	refs: readonly ProposalEvidenceReference[],
): string[] {
	const wb = relative(root, resolveProjectPaths(root).abs.wbDir).replaceAll(
		"\\",
		"/",
	);
	return refs
		.map((raw) => {
			const ref = canonicalArtifactEvidenceReference(root, raw);
			if (isV2EvidenceReference(ref)) {
				return stableJson({
					owner: ref.owner,
					path: ref.relative_path,
					content_digest: ref.content_digest,
					...(ref.digest_scope === "range"
						? {
								anchor: ref.anchor,
								source_identity_digest: ref.source_identity_digest,
							}
						: {}),
				});
			}
			const ownerPrefix = [
				`${wb}/${ref.session_id}/`,
				`${wb}/_archive/${ref.session_id}/`,
			].find((prefix) => ref.path.startsWith(prefix));
			return stableJson({
				session_id: ref.session_id,
				path: ownerPrefix ? ref.path.slice(ownerPrefix.length) : ref.path,
				content_digest: ref.content_digest,
				...(ref.digest_scope === "range"
					? {
							anchor: ref.anchor,
							source_identity_digest: ref.source_identity_digest,
						}
					: {}),
			});
		})
		.sort();
}

export function appendAssistedProposalEvent(input: {
	root: string;
	projectId: string;
	eventType: Exclude<AssistedProposalEventType, "prepared">;
	proposalId: string;
	versionDigest: string;
	problemIdentity: string;
	payload: Record<string, unknown>;
	now?: Date;
}): AssistedProposalEvent {
	return withAssistedProposalJournalLock(input.root, () => {
		const events = readEventsUnlocked(input.root, input.projectId);
		const keyEvents = events.filter(
			(event) =>
				event.proposal_id === input.proposalId &&
				event.version_digest === input.versionDigest,
		);
		const prepared = keyEvents.find((event) => event.event_type === "prepared");
		if (!prepared || prepared.problem_identity !== input.problemIdentity)
			throw new Error("assisted proposal version is missing or stale");
		if (input.eventType === "decision") {
			const decision = input.payload.decision;
			if (
				!("approve defer reject".split(" ") as string[]).includes(
					String(decision),
				)
			)
				throw new Error("assisted proposal decision is invalid");
			const prior = keyEvents.filter(
				(event) => event.event_type === "decision",
			);
			const last = prior.at(-1);
			const reconsidering = input.payload.reconsider_rejection === true;
			if (decision === "reject" && last?.payload.decision === "reject")
				return last;
			if (
				reconsidering &&
				(decision !== "approve" ||
					last?.payload.decision !== "reject" ||
					typeof input.payload.reason !== "string" ||
					!input.payload.reason.trim())
			)
				throw new Error(
					"reconsideration requires a rejected exact version and an approval reason",
				);
			if (
				last?.payload.decision === "reject" &&
				decision !== "reject" &&
				!reconsidering
			)
				throw new Error(
					"rejected proposal version cannot be approved or deferred",
				);
			if (keyEvents.some((event) => event.event_type === "applied"))
				throw new Error("applied proposal decision cannot be changed");
		}
		if (input.eventType === "applied") {
			if (keyEvents.some((event) => event.event_type === "applied"))
				return keyEvents.find(
					(event) => event.event_type === "applied",
				) as AssistedProposalEvent;
			if (
				keyEvents.at(-1)?.event_type !== "decision" ||
				keyEvents.at(-1)?.payload.decision !== "approve"
			)
				throw new Error(
					"proposal apply requires approval of the exact version",
				);
		}
		if (
			input.eventType === "evaluation" &&
			!keyEvents.some((event) => event.event_type === "applied")
		)
			throw new Error("proposal evaluation requires an applied version");
		if (input.eventType === "revoked") {
			const prior = keyEvents.find((event) => event.event_type === "revoked");
			if (prior) return prior;
			if (!keyEvents.some((event) => event.event_type === "applied"))
				throw new Error("proposal revocation requires an applied version");
			if (!previewProducesContextGuidance(prepared.payload.preview))
				throw new Error(
					"proposal revocation only applies to adopted context guidance",
				);
			if (
				typeof input.payload.reason !== "string" ||
				!input.payload.reason.trim()
			)
				throw new Error("proposal revocation requires a reason");
		}
		return appendEventUnlocked(input);
	});
}

export function proposalPreparedEvent(
	events: readonly AssistedProposalEvent[],
	proposalId: string,
	versionDigest?: string,
): AssistedProposalEvent | undefined {
	return events.find(
		(event) =>
			event.event_type === "prepared" &&
			event.proposal_id === proposalId &&
			(versionDigest === undefined || event.version_digest === versionDigest),
	);
}

export function proposalVersionEvents(
	events: readonly AssistedProposalEvent[],
	proposalId: string,
	versionDigest: string,
): AssistedProposalEvent[] {
	return events.filter(
		(event) =>
			event.proposal_id === proposalId &&
			event.version_digest === versionDigest,
	);
}
