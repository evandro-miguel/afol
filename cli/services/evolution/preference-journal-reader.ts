import { createHash } from "node:crypto";
import {
	closeSync,
	constants as fsConstants,
	fstatSync,
	fsyncSync,
	ftruncateSync,
	type lstatSync,
	openSync,
	readFileSync,
} from "node:fs";
import { validateEvolutionIdentity } from "./config";
import { assertSafeEvolutionTarget } from "./db";
import { preferenceDecisionDigest } from "./preference-authority";
import { preferenceJournalPath } from "./preference-journal-path";
import type { PreferenceJournalEvent } from "./preference-types";

export const GENESIS_DIGEST = "GENESIS";
export const READ_RETRIES = 3;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const SOURCE_KINDS = new Set([
	"session",
	"task",
	"evidence",
	"decision",
	"report",
	"claim",
	"import",
	"external_session",
	"observation",
	"suggestion",
	"proposal",
	"journal",
	"tombstone",
	"memory",
	"lesson",
	"feedback",
	"telemetry",
	"test",
	"commit",
	"artifact",
	"source",
]);
function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value && typeof value === "object")
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
			.join(",")}}`;
	return JSON.stringify(value);
}

export function preferenceDigest(value: unknown): string {
	return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function openFlags(flags: number): number {
	return process.platform === "win32"
		? flags
		: flags | (fsConstants.O_NOFOLLOW ?? 0);
}

export function validateId(value: unknown, label: string): void {
	if (typeof value !== "string" || !ID_RE.test(value))
		throw new Error(`${label} is invalid`);
}

export function validateSourceRefs(refs: unknown, label: string): void {
	if (!Array.isArray(refs) || refs.length === 0)
		throw new Error(`${label} are required`);
	for (const ref of refs) {
		if (!ref || typeof ref !== "object" || Array.isArray(ref))
			throw new Error(`${label} contain an invalid reference`);
		const value = ref as Record<string, unknown>;
		validateId(value.id, `${label} id`);
		if (typeof value.kind !== "string" || !SOURCE_KINDS.has(value.kind))
			throw new Error(`${label} kind is invalid`);
	}
}

export function expectedAuthority(kind: string): {
	authority_kind: PreferenceJournalEvent["authority_kind"];
	caller_type: PreferenceJournalEvent["caller_type"];
} {
	if (["explicit", "accepted", "rejected", "contradiction"].includes(kind))
		return {
			authority_kind: "explicit_project_user",
			caller_type: "project_user",
		};
	if (kind === "structural")
		return { authority_kind: "approved_policy", caller_type: "system" };
	return {
		authority_kind: "explicit_project_user",
		caller_type: "project_user",
	};
}

function validatePreferencePayload(
	event: PreferenceJournalEvent,
	projectId: string,
): void {
	const preference = event.payload.preference;
	validateId(event.event_id, "preference journal event id");
	validateId(event.subject_id, "preference journal subject id");
	validateSourceRefs(event.source_refs, "preference journal source refs");
	validateSourceRefs(preference.source_refs, "preference source refs");
	if (preference.project_id !== projectId || preference.scope !== "project")
		throw new Error("preference journal project or scope mismatch");
	validateId(preference.id, "preference id");
	if (!preference.statement.trim())
		throw new Error("preference statement is empty");
	if (!"active aging dormant rejected".split(" ").includes(preference.status))
		throw new Error("preference status is invalid");
	if (
		!"explicit inferred structural".split(" ").includes(preference.provenance)
	)
		throw new Error("preference provenance is invalid");
	for (const [label, value] of [
		["confidence", preference.confidence],
		["effective confidence", preference.effective_confidence],
	]) {
		if (
			typeof value !== "number" ||
			!Number.isFinite(value) ||
			value < 0 ||
			value > 1
		)
			throw new Error(`preference ${label} is invalid`);
	}
	const integerFields: Array<[string, number]> = [
		["positive evidence", preference.positive_evidence],
		["negative evidence", preference.negative_evidence],
		[
			"last reinforced production day",
			preference.last_reinforced_production_day,
		],
		["current production day", preference.current_production_day],
	];
	for (const [label, value] of integerFields) {
		if (!Number.isInteger(value) || value < 0)
			throw new Error(`preference ${label} is invalid`);
	}
	validateId(preference.journal_event_id, "preference journal event id");
	if (preference.journal_event_id !== event.event_id)
		throw new Error("preference journal id mismatch");
	if (
		!preference.created_at ||
		Number.isNaN(Date.parse(preference.created_at)) ||
		!preference.updated_at ||
		Number.isNaN(Date.parse(preference.updated_at))
	)
		throw new Error("preference timestamps are invalid");
	const evidence = event.payload.evidence;
	if (!evidence) return;
	validateId(evidence.id, "preference evidence id");
	validateId(
		evidence.preference_id || preference.id,
		"preference evidence preference id",
	);
	if (evidence.project_id !== projectId)
		throw new Error("preference evidence belongs to another project");
	if (
		!"explicit inferred structural external accepted rejected contradiction"
			.split(" ")
			.includes(evidence.kind)
	)
		throw new Error("preference evidence kind is invalid");
	if ((evidence.kind === "external") !== (evidence.trust === "untrusted"))
		throw new Error("external preference evidence must be untrusted");
	if (
		!Number.isFinite(evidence.weight) ||
		!Number.isInteger(evidence.production_day_sequence) ||
		evidence.production_day_sequence < 0
	)
		throw new Error("preference evidence values are invalid");
	validateId(evidence.journal_event_id, "preference evidence journal id");
	if (evidence.journal_event_id !== event.event_id)
		throw new Error("preference evidence journal id mismatch");
	validateSourceRefs(evidence.source_refs, "preference evidence source refs");
	if (!evidence.created_at || Number.isNaN(Date.parse(evidence.created_at)))
		throw new Error("preference evidence timestamp is invalid");
	const expected = expectedAuthority(evidence.kind);
	if (
		event.authority_kind !== expected.authority_kind ||
		event.caller_type !== expected.caller_type
	)
		throw new Error("preference journal authority does not match evidence");
}

function fingerprint(stat: NonNullable<ReturnType<typeof lstatSync>>): string {
	return `${String(stat.dev)}:${String(stat.ino)}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
}

function readJournalText(path: string): string | null {
	const before = assertSafeEvolutionTarget(path, "preference journal target");
	if (!before) return null;
	const beforeFingerprint = fingerprint(before);
	const fd = openSync(path, openFlags(fsConstants.O_RDONLY));
	try {
		const opened = fstatSync(fd);
		if (
			!opened.isFile() ||
			opened.nlink !== 1 ||
			fingerprint(opened) !== beforeFingerprint
		)
			throw new Error("preference journal target must be a regular file");
		const text = readFileSync(fd, "utf8");
		const after = assertSafeEvolutionTarget(
			path,
			"preference journal target",
			false,
		);
		if (!after || fingerprint(after) !== beforeFingerprint)
			throw new Error("preference journal changed during read");
		return text;
	} finally {
		closeSync(fd);
	}
}

export function truncateJournal(path: string, size: number): void {
	const target = assertSafeEvolutionTarget(path, "preference journal target");
	if (!target) return;
	const fd = openSync(path, openFlags(fsConstants.O_WRONLY));
	try {
		const opened = fstatSync(fd);
		if (!opened.isFile() || opened.nlink !== 1)
			throw new Error("preference journal target must be a regular file");
		ftruncateSync(fd, size);
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
}

export function validateEvent(
	root: string,
	event: PreferenceJournalEvent,
	index: number,
	previousDigest: string,
	projectId: string,
): void {
	if (
		event.sequence !== index + 1 ||
		event.event_type !== "preference" ||
		!ID_RE.test(event.event_id) ||
		!ID_RE.test(event.subject_id) ||
		event.trust_level !== "local_trusted"
	)
		throw new Error(`invalid preference journal sequence at line ${index + 1}`);
	if (event.previous_event_digest !== previousDigest)
		throw new Error(
			`broken preference journal hash chain at line ${index + 1}`,
		);
	if (
		event.payload.project_id !== projectId ||
		event.payload.preference.project_id !== projectId
	)
		throw new Error("preference journal belongs to another project");
	if (event.payload.preference.id !== event.subject_id)
		throw new Error("preference journal subject mismatch");
	if (Number.isNaN(Date.parse(event.timestamp)))
		throw new Error("preference journal timestamp is invalid");
	if (
		!"create reinforce contradict reject reopen"
			.split(" ")
			.includes(event.action)
	)
		throw new Error("preference journal action is invalid");
	validatePreferencePayload(event, projectId);
	if (
		event.decision.projectId !== projectId ||
		event.decision.preferenceId !== event.payload.preference.id ||
		event.decision.action !== event.action ||
		event.decision.provenance !== event.payload.preference.provenance ||
		event.decision.actor !==
			(event.decision.provenance === "structural"
				? "policy"
				: "project_user") ||
		Number.isNaN(Date.parse(event.decision.timestamp)) ||
		event.decision_digest !== preferenceDecisionDigest(event.decision)
	)
		throw new Error("preference journal decision binding is invalid");
	const decisionRef = event.source_refs.find(
		(ref) => ref.kind === "decision" && ref.id === event.decision.id,
	);
	if (
		!decisionRef ||
		decisionRef.path !== event.origin_ref ||
		decisionRef.digest !== event.decision_digest ||
		decisionRef.authority !== "canonical"
	)
		throw new Error("preference journal decision source ref is invalid");
	const kind =
		event.payload.evidence?.kind ?? event.payload.preference.provenance;
	const expected = expectedAuthority(kind);
	if (
		event.authority_kind !== expected.authority_kind ||
		event.caller_type !== expected.caller_type
	)
		throw new Error("preference journal authority does not match payload");
	if (
		(event.action === "contradict" && kind !== "contradiction") ||
		(event.action === "reject" && kind !== "rejected") ||
		(event.action === "reopen" && kind !== "accepted") ||
		(event.action === "reinforce" &&
			["contradiction", "rejected", "accepted"].includes(kind)) ||
		(event.action === "create" &&
			event.payload.evidence &&
			kind !== event.payload.preference.provenance &&
			!(
				kind === "external" &&
				event.payload.preference.provenance === "inferred"
			))
	)
		throw new Error("preference journal action does not match payload");
	if (event.payload_digest !== preferenceDigest(event.payload))
		throw new Error(
			`preference journal payload digest mismatch at line ${index + 1}`,
		);
	const { event_digest: _digest, ...withoutDigest } = event;
	if (event.event_digest !== preferenceDigest(withoutDigest))
		throw new Error(
			`preference journal event digest mismatch at line ${index + 1}`,
		);
	if (event.payload.evidence && event.payload.evidence.project_id !== projectId)
		throw new Error("preference evidence belongs to another project");
	void root;
}

export function readPreferenceJournal(
	root: string,
	projectId: string,
	eventsDir?: string,
): PreferenceJournalEvent[] {
	validateEvolutionIdentity({ projectId, timezone: "UTC" });
	const path = preferenceJournalPath(root, eventsDir);
	let lastError: unknown;
	for (let attempt = 0; attempt < READ_RETRIES; attempt += 1) {
		try {
			const text = readJournalText(path);
			if (text === null) return [];
			const events: PreferenceJournalEvent[] = [];
			let previous = GENESIS_DIGEST;
			for (const [index, line] of text
				.split(/\r?\n/)
				.filter(Boolean)
				.entries()) {
				let parsed: PreferenceJournalEvent;
				try {
					parsed = JSON.parse(line) as PreferenceJournalEvent;
				} catch {
					throw new Error(
						`invalid preference journal JSON at line ${index + 1}`,
					);
				}
				validateEvent(root, parsed, index, previous, projectId);
				events.push(parsed);
				previous = parsed.event_digest;
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
