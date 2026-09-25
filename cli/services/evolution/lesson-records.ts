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
import { readProjectConfig, resolveProjectPaths } from "../project/paths";
import {
	readActiveSession,
	sessionLifecycleState,
} from "../workbench/lifecycle";
import { verifyWorkbenchTasks } from "../workbench/verify";
import { labeledValues, sessionPath } from "./adoption-candidates";
import { redactSensitiveText } from "./observation-model";
import { resolveEvolutionConfig } from "./runtime-config";

const MAX_LESSON_STATEMENTS = 10;
const MAX_LESSON_FILES = 24;
const MAX_LESSON_FILE_BYTES = 32_768;
const MAX_EVIDENCE_FILE_BYTES = 65_536;
const MAX_LESSON_TEXT_BYTES = 512;
export const MAX_CONTEXT_LESSONS = 2;
export const MAX_CONTEXT_LESSON_SECTION_BYTES = 800;
const LESSON_JOURNAL_LOCK = "__evolution-lessons__";
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const RECORD_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const LESSON_ID = /^L-[a-f0-9]{20}$/;
const VERSION_ID = /^LV-[a-f0-9]{20}$/;
const APPLICATION_ID = /^LA-[a-f0-9]{20}$/;
const HEX_64 = /^[a-f0-9]{64}$/;
const LESSON_LABELS = [
	"problem",
	"applies when",
	"preventive action",
	"evidence",
	"verify",
] as const;
const PATH_TOKEN = /[A-Za-z0-9_.@-]+(?:\/[A-Za-z0-9_.@-]+)+/g;

export type LessonWorkType = {
	operation?: string;
	module?: string;
	test?: string;
	error?: string;
};

/** Fields are present only when the session text stated them explicitly. */
export type LessonRecordFields = {
	problem: string;
	applies_when?: string;
	preventive_action?: string;
	/** Observed evidence id only; a declared success is never evidence. */
	evidence?: string;
	verify?: string;
};

export type LessonRecord = {
	record_type: "lesson_record";
	schema_version: 1;
	version_id: string;
	lesson_id: string;
	project_id: string;
	session_id: string;
	/** Informational only; never part of the lesson identity. */
	task_id?: string;
	version: number;
	created_at: string;
	fields: LessonRecordFields;
	work_type: LessonWorkType;
	/** Previous version replaced by this row; the origin row is kept. */
	supersedes: string | null;
	/** Versions this row contradicts; a contradiction is marked, not overwritten. */
	contradicts: string[];
	field_set_digest: string;
	source_refs: Array<{
		id: string;
		kind: "session" | "report" | "evidence";
		path?: string;
		digest?: string;
		authority: "canonical";
	}>;
};

export type LessonApplication = {
	record_type: "lesson_application";
	schema_version: 1;
	id: string;
	lesson_id: string;
	evidence_id: string;
	session_id: string;
	created_at: string;
};

export type LessonVersionView = LessonRecord & {
	superseded: boolean;
	contradicted: boolean;
	application_count: number;
	last_applied_at: string | null;
};

export type LessonView = {
	lesson_id: string;
	versions: LessonVersionView[];
	current: LessonVersionView[];
	contradicted: boolean;
};

export type ContextLessonEntry = {
	id: string;
	version: number;
	problem: string;
	applies_when?: string;
	preventive_action?: string;
	verify?: string;
	evidence?: string;
};

export type ContextLessonSection = {
	lessons: ContextLessonEntry[];
	shown_lesson_ids: string[];
	bytes: number;
	truncated: boolean;
};

export type LessonIngestResult = {
	read_only: false;
	session_id: string;
	state: "recorded" | "no_statement" | "blocked_missing_evidence";
	appended: number;
	duplicates: number;
	lessons: LessonView[];
};

type PublicText = { value: string; truncated: boolean };
type EvidenceRow = {
	id: string;
	task_id: string;
	created_at: string;
	provenance: unknown;
	exit_code: unknown;
	result: unknown;
	test?: unknown;
	error_code?: unknown;
	path?: unknown;
	operation?: unknown;
};

function digest(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value && typeof value === "object")
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
			.join(",")}}`;
	return JSON.stringify(value);
}

function identityText(value: string | undefined): string {
	return redactSensitiveText(value ?? "", { redactPaths: true });
}

function boundedLessonText(value: string): PublicText | null {
	const redacted = redactSensitiveText(value, { redactPaths: true });
	if (!redacted) return null;
	let bytes = 0;
	let bounded = "";
	for (const character of redacted) {
		const characterBytes = Buffer.byteLength(character, "utf8");
		if (bytes + characterBytes > MAX_LESSON_TEXT_BYTES)
			return { value: bounded, truncated: true };
		bounded += character;
		bytes += characterBytes;
	}
	return { value: bounded, truncated: false };
}

export function lessonJournalPath(root: string): string {
	return join(
		resolveProjectPaths(root).abs.mutableDir,
		"data",
		"evolution",
		"lessons.jsonl",
	);
}

function withLessonJournalLock<T>(root: string, action: () => T): T {
	return withSessionLock(root, LESSON_JOURNAL_LOCK, action);
}

/** An observed success (exit 0) or an observed failure; declared success is not evidence. */
function isObservedEvidence(row: EvidenceRow): boolean {
	if (row.provenance !== "observed") return false;
	if (row.exit_code === 0) return true;
	return (
		String(row.result ?? "").toLowerCase() === "failed" ||
		(typeof row.exit_code === "number" && row.exit_code !== 0)
	);
}

function readSessionEvidence(sessionDir: string): Map<string, EvidenceRow> {
	const rows = new Map<string, EvidenceRow>();
	const path = join(sessionDir, ".evidence.jsonl");
	if (!existsSync(path) || !lstatSync(path).isFile()) return rows;
	if (lstatSync(path).size > MAX_EVIDENCE_FILE_BYTES)
		throw new Error("lesson evidence ledger exceeds the size limit");
	for (const [index, line] of readFileSync(path, "utf8")
		.split("\n")
		.entries()) {
		if (!line.trim()) continue;
		let value: Record<string, unknown>;
		try {
			value = JSON.parse(line) as Record<string, unknown>;
		} catch {
			throw new Error(
				`lesson evidence ledger line ${index + 1} is invalid or legacy`,
			);
		}
		if (
			typeof value.id !== "string" ||
			!RECORD_ID.test(value.id) ||
			typeof value.task_id !== "string" ||
			typeof value.created_at !== "string" ||
			Number.isNaN(Date.parse(value.created_at))
		)
			throw new Error(
				`lesson evidence ledger line ${index + 1} is invalid or legacy`,
			);
		rows.set(value.id, {
			id: value.id,
			task_id: value.task_id,
			created_at: value.created_at,
			provenance: value.provenance,
			exit_code: value.exit_code,
			result: value.result,
			test: value.test,
			error_code: value.error_code,
			path: value.path,
			operation: value.operation,
		});
	}
	return rows;
}

export type ExtractedLesson = {
	fields: LessonRecordFields;
	work_type: LessonWorkType;
	task_id?: string;
	path: string;
	digest: string;
};

/** Every lesson statement in the session text; a statement starts at each
 * Problem label and a second statement is never dropped for a first one. */
export function extractLessonStatements(sessionDir: string): ExtractedLesson[] {
	const evidence = readSessionEvidence(sessionDir);
	const files = readdirSync(sessionDir, { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
		.map((entry) => join(sessionDir, entry.name))
		.sort()
		.slice(0, MAX_LESSON_FILES);
	const lessons: ExtractedLesson[] = [];
	for (const path of files) {
		const stat = lstatSync(path);
		if (!stat.isFile() || stat.size > MAX_LESSON_FILE_BYTES) continue;
		const content = readFileSync(path, "utf8");
		const matches = labeledValues(content, LESSON_LABELS);
		type Draft = {
			problem: PublicText | null;
			applies_when: PublicText | null;
			preventive_action: PublicText | null;
			evidenceId: string | null;
			verify: PublicText | null;
		};
		const push = (draft: Draft) => {
			if (!draft.problem) return;
			const fields: LessonRecordFields = { problem: draft.problem.value };
			let workType: LessonWorkType = {};
			let taskId: string | undefined;
			if (draft.applies_when) fields.applies_when = draft.applies_when.value;
			if (draft.preventive_action)
				fields.preventive_action = draft.preventive_action.value;
			if (draft.evidenceId) {
				const row = evidence.get(draft.evidenceId);
				if (row && isObservedEvidence(row)) {
					fields.evidence = row.id;
					taskId = row.task_id;
					workType = {
						...(typeof row.operation === "string" && row.operation.trim()
							? { operation: identityText(row.operation) }
							: {}),
						...(typeof row.path === "string" && row.path.trim()
							? { module: identityText(row.path) }
							: {}),
						...(typeof row.test === "string" && row.test.trim()
							? { test: identityText(row.test) }
							: {}),
						...(typeof row.error_code === "string" && row.error_code.trim()
							? { error: identityText(row.error_code) }
							: {}),
					};
				}
			}
			if (draft.verify) fields.verify = draft.verify.value;
			lessons.push({
				fields,
				work_type: workType,
				...(taskId ? { task_id: taskId } : {}),
				path,
				digest: digest(content),
			});
		};
		let draft: Draft = {
			problem: null,
			applies_when: null,
			preventive_action: null,
			evidenceId: null,
			verify: null,
		};
		for (const match of matches) {
			if (match.label === "problem") {
				push(draft);
				draft = {
					problem: boundedLessonText(match.value),
					applies_when: null,
					preventive_action: null,
					evidenceId: null,
					verify: null,
				};
				continue;
			}
			if (!draft.problem) continue;
			if (match.label === "applies when") {
				if (!draft.applies_when)
					draft.applies_when = boundedLessonText(match.value);
				continue;
			}
			if (match.label === "preventive action") {
				if (!draft.preventive_action)
					draft.preventive_action = boundedLessonText(match.value);
				continue;
			}
			if (match.label === "evidence") {
				const id = match.value.trim();
				if (!draft.evidenceId && RECORD_ID.test(id)) draft.evidenceId = id;
				continue;
			}
			if (!draft.verify) draft.verify = boundedLessonText(match.value);
		}
		push(draft);
		if (lessons.length >= MAX_LESSON_STATEMENTS) break;
	}
	return lessons.slice(0, MAX_LESSON_STATEMENTS);
}

function lessonIdentity(
	projectId: string,
	fields: LessonRecordFields,
	workType: LessonWorkType,
): string {
	return digest(
		stableJson({
			version: 1,
			project_id: projectId,
			problem: identityText(fields.problem),
			applies_when: identityText(fields.applies_when),
			work_type: {
				operation: identityText(workType.operation),
				module: identityText(workType.module),
				test: identityText(workType.test),
				error: identityText(workType.error),
			},
		}),
	);
}

/** Version comparison covers the lesson content; the evidence pointer is
 * per-version provenance and never versions the lesson by itself. */
function lessonFieldSetDigest(fields: LessonRecordFields): string {
	return digest(
		stableJson({
			problem: fields.problem,
			applies_when: fields.applies_when ?? "",
			preventive_action: fields.preventive_action ?? "",
			verify: fields.verify ?? "",
		}),
	);
}

function parseLessonRow(
	line: string,
	lineNumber: number,
): LessonRecord | LessonApplication {
	const throwInvalid = (): never => {
		throw new Error(`lesson journal line ${lineNumber} is invalid or legacy`);
	};
	let value: Record<string, unknown>;
	try {
		value = JSON.parse(line) as Record<string, unknown>;
	} catch {
		return throwInvalid();
	}
	if (value.record_type === "lesson_application") {
		if (
			value.schema_version !== 1 ||
			typeof value.id !== "string" ||
			!APPLICATION_ID.test(value.id) ||
			typeof value.lesson_id !== "string" ||
			!LESSON_ID.test(value.lesson_id) ||
			typeof value.evidence_id !== "string" ||
			!RECORD_ID.test(value.evidence_id) ||
			!SESSION_ID.test(String(value.session_id)) ||
			typeof value.created_at !== "string" ||
			Number.isNaN(Date.parse(value.created_at)) ||
			Object.keys(value).length !== 7
		)
			return throwInvalid();
		return {
			record_type: "lesson_application",
			schema_version: 1,
			id: value.id,
			lesson_id: value.lesson_id,
			evidence_id: value.evidence_id,
			session_id: String(value.session_id),
			created_at: value.created_at,
		};
	}
	if (value.record_type !== "lesson_record") return throwInvalid();
	const fields = value.fields as Record<string, unknown> | undefined;
	const workType = value.work_type as Record<string, unknown> | undefined;
	if (
		value.schema_version !== 1 ||
		typeof value.version_id !== "string" ||
		!VERSION_ID.test(value.version_id) ||
		typeof value.lesson_id !== "string" ||
		!LESSON_ID.test(value.lesson_id) ||
		!SESSION_ID.test(String(value.session_id)) ||
		!SESSION_ID.test(String(value.project_id)) ||
		(value.task_id !== undefined && !RECORD_ID.test(String(value.task_id))) ||
		!Number.isInteger(value.version) ||
		Number(value.version) < 1 ||
		typeof value.created_at !== "string" ||
		Number.isNaN(Date.parse(value.created_at)) ||
		!fields ||
		typeof fields.problem !== "string" ||
		!fields.problem.trim() ||
		Buffer.byteLength(String(fields.problem), "utf8") > MAX_LESSON_TEXT_BYTES ||
		["applies_when", "preventive_action", "evidence", "verify"].some(
			(field) =>
				fields[field] !== undefined &&
				(typeof fields[field] !== "string" ||
					Buffer.byteLength(String(fields[field]), "utf8") >
						MAX_LESSON_TEXT_BYTES),
		) ||
		(fields.evidence !== undefined &&
			!RECORD_ID.test(String(fields.evidence))) ||
		!workType ||
		["operation", "module", "test", "error"].some(
			(field) =>
				workType[field] !== undefined && typeof workType[field] !== "string",
		) ||
		(value.supersedes !== null &&
			value.supersedes !== undefined &&
			!VERSION_ID.test(String(value.supersedes))) ||
		!Array.isArray(value.contradicts) ||
		value.contradicts.some(
			(entry) => typeof entry !== "string" || !VERSION_ID.test(entry),
		) ||
		typeof value.field_set_digest !== "string" ||
		!HEX_64.test(value.field_set_digest) ||
		!Array.isArray(value.source_refs) ||
		value.source_refs.length > 8
	)
		return throwInvalid();
	return {
		record_type: "lesson_record",
		schema_version: 1,
		version_id: value.version_id,
		lesson_id: value.lesson_id,
		project_id: String(value.project_id),
		session_id: String(value.session_id),
		...(value.task_id === undefined ? {} : { task_id: String(value.task_id) }),
		version: Number(value.version),
		created_at: value.created_at,
		fields: {
			problem: fields.problem,
			...(fields.applies_when === undefined
				? {}
				: { applies_when: String(fields.applies_when) }),
			...(fields.preventive_action === undefined
				? {}
				: { preventive_action: String(fields.preventive_action) }),
			...(fields.evidence === undefined
				? {}
				: { evidence: String(fields.evidence) }),
			...(fields.verify === undefined ? {} : { verify: String(fields.verify) }),
		},
		work_type: {
			...(workType.operation === undefined
				? {}
				: { operation: String(workType.operation) }),
			...(workType.module === undefined
				? {}
				: { module: String(workType.module) }),
			...(workType.test === undefined ? {} : { test: String(workType.test) }),
			...(workType.error === undefined
				? {}
				: { error: String(workType.error) }),
		},
		supersedes:
			value.supersedes === null || value.supersedes === undefined
				? null
				: String(value.supersedes),
		contradicts: (value.contradicts as string[]).slice(),
		field_set_digest: value.field_set_digest,
		source_refs: (value.source_refs as LessonRecord["source_refs"]).slice(),
	};
}

type LessonJournal = {
	records: LessonRecord[];
	applications: LessonApplication[];
};

function readLessonJournalUnlocked(root: string): LessonJournal {
	const path = lessonJournalPath(root);
	if (!existsSync(path)) return { records: [], applications: [] };
	const journal: LessonJournal = { records: [], applications: [] };
	const versionIds = new Set<string>();
	const applicationIds = new Set<string>();
	for (const [index, line] of readFileSync(path, "utf8")
		.split("\n")
		.entries()) {
		if (!line.trim()) continue;
		const row = parseLessonRow(line, index + 1);
		if (row.record_type === "lesson_application") {
			if (applicationIds.has(row.id)) return throwDuplicate(index + 1);
			applicationIds.add(row.id);
			journal.applications.push(row);
			continue;
		}
		if (versionIds.has(row.version_id)) return throwDuplicate(index + 1);
		versionIds.add(row.version_id);
		const known = journal.records
			.filter((record) => record.lesson_id === row.lesson_id)
			.map((record) => record.version_id);
		if (row.version !== known.length + 1) return throwDuplicate(index + 1);
		if (
			(row.supersedes !== null && !known.includes(row.supersedes)) ||
			row.contradicts.some((ref) => !known.includes(ref))
		)
			throw new Error(
				`lesson journal line ${index + 1} references an unknown version`,
			);
		journal.records.push(row);
	}
	if (
		journal.applications.some(
			(application) =>
				!journal.records.some(
					(record) => record.lesson_id === application.lesson_id,
				),
		)
	)
		throw new Error("lesson journal references an unknown lesson application");
	return journal;
}

function throwDuplicate(lineNumber: number): never {
	throw new Error(`lesson journal line ${lineNumber} is invalid or legacy`);
}

export function readLessonJournal(root: string): LessonJournal {
	return withLessonJournalLock(root, () => readLessonJournalUnlocked(root));
}

function appendLessonJournalLines(root: string, lines: string[]): void {
	if (lines.length === 0) return;
	const path = lessonJournalPath(root);
	mkdirSync(resolve(path, ".."), { recursive: true, mode: 0o700 });
	const fd = openSync(path, "a", 0o600);
	const previousSize = fstatSync(fd).size;
	const payload = Buffer.from(
		lines.map((line) => `${line}\n`).join(""),
		"utf8",
	);
	let attemptedWrite = false;
	let primaryError: unknown;
	try {
		let offset = 0;
		while (offset < payload.byteLength) {
			attemptedWrite = true;
			const written = writeSync(
				fd,
				payload,
				offset,
				payload.byteLength - offset,
			);
			if (!Number.isInteger(written) || written <= 0)
				throw new Error("lesson journal write did not make progress");
			offset += written;
		}
		fsyncSync(fd);
		if (process.platform !== "win32") {
			const parentFd = openSync(resolve(path, ".."), "r");
			try {
				fsyncSync(parentFd);
			} finally {
				closeSync(parentFd);
			}
		}
	} catch (error) {
		primaryError = error;
		if (attemptedWrite) {
			const rollbackFd = openSync(path, "r+");
			try {
				ftruncateSync(rollbackFd, previousSize);
				fsyncSync(rollbackFd);
			} finally {
				closeSync(rollbackFd);
			}
		}
	} finally {
		closeSync(fd);
	}
	if (primaryError !== undefined) throw primaryError;
}

function lessonViews(journal: LessonJournal): LessonView[] {
	const byLesson = new Map<string, LessonRecord[]>();
	for (const record of journal.records) {
		const versions = byLesson.get(record.lesson_id) ?? [];
		versions.push(record);
		byLesson.set(record.lesson_id, versions);
	}
	const applicationsByLesson = new Map<string, LessonApplication[]>();
	for (const application of journal.applications) {
		const entries = applicationsByLesson.get(application.lesson_id) ?? [];
		entries.push(application);
		applicationsByLesson.set(application.lesson_id, entries);
	}
	const views: LessonView[] = [];
	const journalOrder = new Map<string, number>();
	for (let index = 0; index < journal.records.length; index += 1) {
		const record = journal.records[index];
		if (record) journalOrder.set(record.lesson_id, index);
	}
	for (const [lessonId, versions] of byLesson) {
		const supersededIds = new Set(
			versions.flatMap((record) =>
				record.supersedes === null ? [] : [record.supersedes],
			),
		);
		const contradictedIds = new Set(
			versions.flatMap((record) => record.contradicts),
		);
		const versionViews = versions.map((record) => ({
			...record,
			superseded: supersededIds.has(record.version_id),
			contradicted:
				record.contradicts.length > 0 || contradictedIds.has(record.version_id),
			application_count: applicationsByLesson.get(lessonId)?.length ?? 0,
			last_applied_at:
				applicationsByLesson.get(lessonId)?.at(-1)?.created_at ?? null,
		}));
		const current = versionViews.filter((view) => !view.superseded);
		views.push({
			lesson_id: lessonId,
			versions: versionViews,
			current,
			contradicted: current.some((view) => view.contradicted),
		});
	}
	views.sort((left, right) => {
		const leftAt = left.versions.at(-1)?.created_at ?? "";
		const rightAt = right.versions.at(-1)?.created_at ?? "";
		if (leftAt !== rightAt) return rightAt.localeCompare(leftAt);
		const leftOrder = journalOrder.get(left.lesson_id) ?? -1;
		const rightOrder = journalOrder.get(right.lesson_id) ?? -1;
		if (leftOrder !== rightOrder) return rightOrder - leftOrder;
		return left.lesson_id.localeCompare(right.lesson_id);
	});
	return views;
}

export function readLessonRecords(root: string): LessonView[] {
	// Fast path keeps the common no-lesson context bundle free of lock I/O.
	if (!existsSync(lessonJournalPath(root))) return [];
	return withLessonJournalLock(root, () =>
		lessonViews(readLessonJournalUnlocked(root)),
	);
}

/** Resolve an exact current lesson version for an explicitly approved adoption.
 * Superseded, contradicted, or changed versions cannot be activated. */
export function resolveLessonVersionForAdoption(
	root: string,
	lessonId: string,
	versionId: string,
	fieldSetDigest: string,
): LessonVersionView {
	if (!LESSON_ID.test(lessonId) || !VERSION_ID.test(versionId))
		throw new Error("lesson adoption identity is invalid");
	if (!HEX_64.test(fieldSetDigest))
		throw new Error("lesson adoption field digest is invalid");
	const view = readLessonRecords(root).find(
		(candidate) => candidate.lesson_id === lessonId,
	);
	const current = view?.current.find(
		(version) => version.version_id === versionId,
	);
	if (
		!current ||
		current.contradicted ||
		current.field_set_digest !== fieldSetDigest
	)
		throw new Error(
			"lesson adoption version is missing, stale, or contradicted",
		);
	return current;
}

function lessonRecordRow(input: {
	projectId: string;
	session: string;
	lesson: ExtractedLesson;
	lessonId: string;
	version: number;
	createdAt: string;
	supersedes: string | null;
	contradicts: string[];
	root: string;
}): LessonRecord {
	const fieldSetDigest = lessonFieldSetDigest(input.lesson.fields);
	return {
		record_type: "lesson_record",
		schema_version: 1,
		version_id: `LV-${digest(
			`${input.lessonId}\n${fieldSetDigest}\n${input.session}\n${input.version}\n${input.createdAt}`,
		).slice(0, 20)}`,
		lesson_id: input.lessonId,
		project_id: input.projectId,
		session_id: input.session,
		...(input.lesson.task_id ? { task_id: input.lesson.task_id } : {}),
		version: input.version,
		created_at: input.createdAt,
		fields: input.lesson.fields,
		work_type: input.lesson.work_type,
		supersedes: input.supersedes,
		contradicts: input.contradicts,
		field_set_digest: fieldSetDigest,
		source_refs: [
			{ id: input.session, kind: "session", authority: "canonical" },
			{
				id: `R-${input.lesson.digest.slice(0, 20)}`,
				kind: "report",
				path: relative(input.root, input.lesson.path),
				digest: input.lesson.digest,
				authority: "canonical",
			},
			...(input.lesson.fields.evidence
				? [
						{
							id: input.lesson.fields.evidence,
							kind: "evidence" as const,
							authority: "canonical" as const,
						},
					]
				: []),
		],
	};
}

export function ingestLessonStatements(input: {
	root: string;
	session?: string;
	now?: Date;
}): LessonIngestResult {
	return withLessonJournalLock(input.root, () => {
		const now = (input.now ?? new Date()).toISOString();
		const configured = resolveEvolutionConfig(readProjectConfig(input.root));
		if (!configured.configured || !configured.enabled || !configured.projectId)
			return emptyIngest(
				input.session ?? readActiveSession(input.root) ?? "",
				"no_statement",
			);
		const session = input.session ?? readActiveSession(input.root);
		if (!session) return emptyIngest("", "no_statement");
		const path = sessionPath(input.root, session);
		if (sessionLifecycleState(input.root, session) !== "closed")
			return emptyIngest(session, "blocked_missing_evidence");
		if (!verifyWorkbenchTasks(path, true).allCompleted)
			return emptyIngest(session, "blocked_missing_evidence");
		const lessons = extractLessonStatements(path);
		if (lessons.length === 0) return emptyIngest(session, "no_statement");
		const journal = readLessonJournalUnlocked(input.root);
		const appended: LessonRecord[] = [];
		const touched = new Set<string>();
		let duplicates = 0;
		for (const lesson of lessons) {
			const identity = lessonIdentity(
				configured.projectId,
				lesson.fields,
				lesson.work_type,
			);
			const lessonId = `L-${identity.slice(0, 20)}`;
			const fieldSetDigest = lessonFieldSetDigest(lesson.fields);
			touched.add(lessonId);
			const versions = journal.records.filter(
				(record) => record.lesson_id === lessonId,
			);
			if (
				versions.some((record) => record.field_set_digest === fieldSetDigest)
			) {
				duplicates += 1;
				continue;
			}
			const supersededIds = new Set(
				versions.flatMap((record) =>
					record.supersedes === null ? [] : [record.supersedes],
				),
			);
			const current = versions.filter(
				(record) => !supersededIds.has(record.version_id),
			);
			const foreign = current.filter((record) => record.session_id !== session);
			const row = lessonRecordRow({
				projectId: configured.projectId,
				session,
				lesson,
				lessonId,
				version: versions.length + 1,
				createdAt: now,
				// A same-session correction replaces the previous version; a
				// cross-session difference is a marked contradiction, never an overwrite.
				supersedes:
					foreign.length > 0 ? null : (versions.at(-1)?.version_id ?? null),
				contradicts: foreign.map((record) => record.version_id),
				root: input.root,
			});
			journal.records.push(row);
			appended.push(row);
		}
		appendLessonJournalLines(
			input.root,
			appended.map((row) => JSON.stringify(row)),
		);
		const views = lessonViews(journal);
		return {
			read_only: false,
			session_id: session,
			state: "recorded",
			appended: appended.length,
			duplicates,
			lessons: views.filter((view) => touched.has(view.lesson_id)),
		};
	});
}

function emptyIngest(
	session: string,
	state: LessonIngestResult["state"],
): LessonIngestResult {
	return {
		read_only: false,
		session_id: session,
		state,
		appended: 0,
		duplicates: 0,
		lessons: [],
	};
}

export function recordLessonApplication(input: {
	root: string;
	session: string;
	lessonId: string;
	evidenceId: string;
	createdAt: string;
}): LessonApplication {
	if (!SESSION_ID.test(input.session))
		throw new Error("lesson application session is invalid");
	if (!LESSON_ID.test(input.lessonId))
		throw new Error("lesson application requires a lesson id");
	if (!RECORD_ID.test(input.evidenceId))
		throw new Error("lesson application requires an evidence id");
	if (Number.isNaN(Date.parse(input.createdAt)))
		throw new Error("lesson application requires a valid created_at");
	return withLessonJournalLock(input.root, () => {
		const journal = readLessonJournalUnlocked(input.root);
		if (!journal.records.some((record) => record.lesson_id === input.lessonId))
			throw new Error("lesson application lesson is missing");
		const path = sessionPath(input.root, input.session);
		const evidence = readSessionEvidence(path).get(input.evidenceId);
		if (evidence?.provenance !== "observed" || evidence.exit_code !== 0)
			throw new Error(
				"lesson application requires observed successful evidence",
			);
		const id = `LA-${digest(`${input.lessonId}:${input.evidenceId}`).slice(0, 20)}`;
		const existing = journal.applications.find((entry) => entry.id === id);
		if (existing) return existing;
		const application: LessonApplication = {
			record_type: "lesson_application",
			schema_version: 1,
			id,
			lesson_id: input.lessonId,
			evidence_id: input.evidenceId,
			session_id: input.session,
			created_at: input.createdAt,
		};
		appendLessonJournalLines(input.root, [JSON.stringify(application)]);
		return application;
	});
}

function normalizeFileToken(value: string): string {
	return value
		.replaceAll("\\", "/")
		.replace(/^\.\//, "")
		.replace(/\/+$/, "")
		.toLowerCase();
}

function pathsIntersect(left: string, right: string): boolean {
	if (!left || !right) return false;
	return (
		left === right ||
		left.startsWith(`${right}/`) ||
		right.startsWith(`${left}/`)
	);
}

/** A lesson applies only when its applies_when files or work_type module
 * intersect the requested files; a shared task id never merges lessons. */
export function lessonMatchesRequest(
	appliesWhen: string | undefined,
	module: string | undefined,
	requestFiles: readonly string[],
): boolean {
	const files = [...new Set(requestFiles.map(normalizeFileToken))].filter(
		Boolean,
	);
	if (files.length === 0) return false;
	const appliesTokens = [...new Set(appliesWhen?.match(PATH_TOKEN) ?? [])].map(
		normalizeFileToken,
	);
	if (
		appliesTokens.some((token) =>
			files.some((file) => pathsIntersect(token, file)),
		)
	)
		return true;
	const moduleToken = module ? normalizeFileToken(module) : "";
	return (
		moduleToken !== "" &&
		files.some((file) => pathsIntersect(moduleToken, file))
	);
}

export function contextLessonEntry(
	view: LessonVersionView,
): ContextLessonEntry {
	return {
		id: view.lesson_id,
		version: view.version,
		problem: view.fields.problem,
		...(view.fields.applies_when === undefined
			? {}
			: { applies_when: view.fields.applies_when }),
		...(view.fields.preventive_action === undefined
			? {}
			: { preventive_action: view.fields.preventive_action }),
		...(view.fields.verify === undefined ? {} : { verify: view.fields.verify }),
		...(view.fields.evidence === undefined
			? {}
			: { evidence: view.fields.evidence }),
	};
}

export function contextLessonBytes(
	entries: readonly ContextLessonEntry[],
): number {
	return Buffer.byteLength(JSON.stringify(entries), "utf8");
}

export function finalizeContextLessonSection(
	entries: readonly ContextLessonEntry[],
	truncated: boolean,
): ContextLessonSection {
	const lessons = entries.slice();
	return {
		lessons,
		shown_lesson_ids: lessons.map((entry) => entry.id),
		bytes: contextLessonBytes(lessons),
		truncated,
	};
}

/** At most two current, non-contradicted lessons whose scope intersects the
 * requested files, capped at 800 bytes; omitted entirely when nothing matches. */
export function selectContextLessons(
	views: readonly LessonView[],
	requestFiles: readonly string[],
): ContextLessonSection | undefined {
	const entries: ContextLessonEntry[] = [];
	let matched = 0;
	for (const view of views) {
		const current = view.current.find((version) => !version.contradicted);
		if (!current) continue;
		if (
			!lessonMatchesRequest(
				current.fields.applies_when,
				current.work_type.module,
				requestFiles,
			)
		)
			continue;
		matched += 1;
		if (entries.length >= MAX_CONTEXT_LESSONS) continue;
		const entry = contextLessonEntry(current);
		if (
			contextLessonBytes([...entries, entry]) > MAX_CONTEXT_LESSON_SECTION_BYTES
		)
			continue;
		entries.push(entry);
	}
	if (entries.length === 0) return undefined;
	return finalizeContextLessonSection(entries, matched > entries.length);
}
