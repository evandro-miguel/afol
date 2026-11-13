import {
	classifyCoordinationClaim,
	coordinationClaimIdentity,
	isGenericTaskOwner,
} from "../local-state/coordination-radar";
import {
	normalizeTaskClaimPath,
	parseTaskFileClaims,
	taskMarkdownContentLines,
	type WorkbenchTaskFileIntent,
} from "../local-state/workbench-index";

/**
 * File intent registered by `afol session intent`. It lives in one managed
 * block per task inside the canonical task file, under a `## T-xx file intent`
 * heading, so the index parser (and older AFOL versions, for write paths)
 * read it like any other task claim section. Owners and paths are advisory
 * task metadata: they grant no authority and prove no executor identity.
 */
export type TaskIntentState = {
	file_intent: WorkbenchTaskFileIntent | null;
	write: string[];
	read: string[];
};

export type TaskIntentBlock = TaskIntentState & {
	/** Zero-based heading line. */
	start: number;
	/** Zero-based end-marker line. */
	end: number;
};

export type TaskIntentErrorCode =
	| "invalid"
	| "conflict"
	| "task_not_found"
	| "task_not_open"
	| "malformed_block";

export class TaskIntentError extends Error {
	readonly code: TaskIntentErrorCode;

	constructor(code: TaskIntentErrorCode, message: string) {
		super(message);
		this.name = "TaskIntentError";
		this.code = code;
	}
}

export const TASK_INTENT_PATH_LIMIT = 100;
const OWNER_RE = /^[A-Za-z0-9][A-Za-z0-9._@:+/-]{0,79}$/;
const BLOCK_INTENT_RE = /^- File intent: (read-only|write)$/;
const BLOCK_LABEL_RE = /^- Files (planned|read):$/;
const BLOCK_ITEM_RE = /^ {2}- `([^`]+)`$/;

function hasControlCharacter(value: string): boolean {
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index);
		if (code < 0x20 || code === 0x7f) return true;
	}
	return false;
}

function headingLine(taskId: string): string {
	return `## ${taskId} file intent`;
}

function beginMarker(taskId: string): string {
	return `<!-- afol:task-intent ${taskId}: written by afol session intent; change it with that command -->`;
}

function endMarker(taskId: string): string {
	return `<!-- /afol:task-intent ${taskId} -->`;
}

export function validateTaskIntentOwner(raw: string): string {
	if (!OWNER_RE.test(raw)) {
		throw new TaskIntentError(
			"invalid",
			`Invalid --owner ${JSON.stringify(raw)}: use 1-80 letters, digits or . _ @ : + / - with no spaces, starting with a letter or digit.`,
		);
	}
	if (isGenericTaskOwner(raw)) {
		throw new TaskIntentError(
			"invalid",
			`Invalid --owner ${JSON.stringify(raw)}: generic defaults are not concrete owners.`,
		);
	}
	return raw;
}

/**
 * Normalizes claim input exactly as the index parser will read it back, and
 * rejects input it would drop, alter or be unable to match.
 */
export function normalizeTaskIntentPaths(
	root: string,
	raws: readonly string[],
	flag: string,
): { paths: string[]; keys: Map<string, string> } {
	if (raws.length > TASK_INTENT_PATH_LIMIT) {
		throw new TaskIntentError(
			"invalid",
			`${flag} accepts at most ${TASK_INTENT_PATH_LIMIT} paths per task.`,
		);
	}
	const paths: string[] = [];
	const keys = new Map<string, string>();
	for (const raw of raws) {
		const label = `${flag} ${JSON.stringify(raw)}`;
		if (hasControlCharacter(raw) || raw.includes("`")) {
			throw new TaskIntentError(
				"invalid",
				`Invalid ${label}: control characters and backticks are not allowed.`,
			);
		}
		if (raw.trim() !== raw) {
			throw new TaskIntentError(
				"invalid",
				`Invalid ${label}: remove leading or trailing whitespace.`,
			);
		}
		const normalized = normalizeTaskClaimPath(raw);
		const expected = raw.replace(/\\/g, "/").replace(/^\.\//, "");
		if (normalized === null || normalized.length === 0) {
			throw new TaskIntentError(
				"invalid",
				`Invalid ${label}: not read as a path claim; use a path with a directory or extension, a directory ending in /, or an absolute path (for example /absolute/project/Makefile).`,
			);
		}
		if (normalized !== expected) {
			throw new TaskIntentError(
				"invalid",
				`Invalid ${label}: trailing punctuation would be dropped when the claim is read back.`,
			);
		}
		const parsed = classifyCoordinationClaim(root, normalized);
		if (parsed.kind === "unsupported") {
			throw new TaskIntentError(
				"invalid",
				`Invalid ${label}: unsupported or malformed pattern (extglob, leading !, or unbalanced [ ] or { }).`,
			);
		}
		const key = coordinationClaimIdentity(root, normalized);
		if (keys.has(key)) {
			throw new TaskIntentError(
				"invalid",
				`Duplicate ${label}: same claim as ${JSON.stringify(keys.get(key))}.`,
			);
		}
		keys.set(key, raw);
		paths.push(normalized);
	}
	return { paths, keys };
}

/** Finds the task's managed block; a damaged block is an error, not absent. */
export function readTaskIntentBlock(
	lines: readonly string[],
	taskId: string,
): TaskIntentBlock | null {
	const visible = taskMarkdownContentLines(lines);
	const starts: number[] = [];
	const begins: number[] = [];
	const ends: number[] = [];
	const marker = new RegExp(
		`^<!--\\s*/?afol:task-intent\\s+${taskId}(?=[:\\s>])`,
	);
	for (let index = 0; index < visible.length; index += 1) {
		const line = (visible[index] ?? "").trim();
		if (line === headingLine(taskId)) starts.push(index);
		if (marker.test(line)) {
			if (line === beginMarker(taskId)) begins.push(index);
			else if (line === endMarker(taskId)) ends.push(index);
			else throw malformed(taskId, `damaged marker on line ${index + 1}`);
		}
	}
	if (starts.length === 0 && begins.length === 0 && ends.length === 0)
		return null;
	const [start] = starts;
	const [begin] = begins;
	const [end] = ends;
	if (
		start === undefined ||
		begin === undefined ||
		end === undefined ||
		starts.length !== 1 ||
		begins.length !== 1 ||
		ends.length !== 1 ||
		!(start < begin && begin < end)
	) {
		throw malformed(
			taskId,
			"missing, surplus or out-of-order heading or markers",
		);
	}
	const state: TaskIntentState = { file_intent: null, write: [], read: [] };
	let list: string[] | null = null;
	let sawBegin = false;
	for (let index = start + 1; index < lines.length; index += 1) {
		const line = (lines[index] ?? "").trimEnd();
		if (line === endMarker(taskId)) {
			if (!sawBegin) {
				throw malformed(taskId, "missing begin marker");
			}
			return { ...state, start, end: index };
		}
		if (line === "" && !sawBegin) {
			continue;
		}
		if (line === beginMarker(taskId) && !sawBegin) {
			sawBegin = true;
			continue;
		}
		const intent = sawBegin ? line.match(BLOCK_INTENT_RE) : null;
		const label = sawBegin ? line.match(BLOCK_LABEL_RE) : null;
		const item = sawBegin && list ? line.match(BLOCK_ITEM_RE) : null;
		if (intent?.[1] && state.file_intent === null) {
			state.file_intent = intent[1] === "write" ? "write" : "read_only";
			list = null;
		} else if (label?.[1]) {
			list = label[1] === "planned" ? state.write : state.read;
		} else if (item?.[1] && list) {
			list.push(item[1]);
		} else {
			throw malformed(taskId, `unexpected line ${index + 1}`);
		}
	}
	throw malformed(taskId, "missing end marker");
}

/** Check the prospective document with the index reader before any durable write. */
export function assertTaskIntentReadable(
	lines: readonly string[],
	taskId: string,
	next: TaskIntentState,
): void {
	if (isEmptyTaskIntent(next)) return;
	const block = readTaskIntentBlock(lines, taskId);
	if (!block)
		throw malformed(
			taskId,
			"intent would be hidden by an unmatched Markdown fence",
		);
	const full = parseTaskFileClaims(lines.join("\n"), [taskId]).get(taskId);
	const matches = (paths: string[] | undefined, expected: string[]) =>
		JSON.stringify(paths ?? []) === JSON.stringify(expected);
	const visiblePaths = (field: "planned_files" | "read_files") =>
		full?.[field]
			.filter(
				(claim) => claim.line > block.start && claim.line <= block.end + 1,
			)
			.map((claim) => claim.path);
	if (
		(next.file_intent !== null && full?.file_intent !== next.file_intent) ||
		!matches(visiblePaths("planned_files"), next.write) ||
		!matches(visiblePaths("read_files"), next.read)
	) {
		throw malformed(
			taskId,
			"rendered intent is not readable as target task metadata",
		);
	}
}

function malformed(taskId: string, detail: string): TaskIntentError {
	return new TaskIntentError(
		"malformed_block",
		`Managed file intent block for ${taskId} is malformed (${detail}); repair or remove the "${headingLine(taskId)}" section, then retry.`,
	);
}

export function renderTaskIntentBlock(
	taskId: string,
	state: TaskIntentState,
): string[] {
	const lines = [headingLine(taskId), "", beginMarker(taskId)];
	if (state.file_intent) {
		lines.push(
			`- File intent: ${state.file_intent === "write" ? "write" : "read-only"}`,
		);
	}
	if (state.write.length > 0) {
		lines.push(
			"- Files planned:",
			...state.write.map((path) => `  - \`${path}\``),
		);
	}
	if (state.read.length > 0) {
		lines.push("- Files read:", ...state.read.map((path) => `  - \`${path}\``));
	}
	lines.push(endMarker(taskId));
	return lines;
}

export function isEmptyTaskIntent(state: TaskIntentState): boolean {
	return (
		state.file_intent === null &&
		state.write.length === 0 &&
		state.read.length === 0
	);
}

/** Replaces the block in place, appends it, or removes it when empty. */
export function replaceTaskIntentBlock(
	lines: readonly string[],
	taskId: string,
	existing: TaskIntentBlock | null,
	next: TaskIntentState,
): string[] {
	const rendered = isEmptyTaskIntent(next)
		? []
		: renderTaskIntentBlock(taskId, next);
	if (existing) {
		const before = lines.slice(0, existing.start);
		const after = lines.slice(existing.end + 1);
		if (rendered.length === 0) {
			while (before.length > 0 && before.at(-1)?.trim() === "") before.pop();
			while (after.length > 0 && after[0]?.trim() === "") after.shift();
			return [...before, ...(after.length > 0 ? ["", ...after] : [])];
		}
		return [...before, ...rendered, ...after];
	}
	if (rendered.length === 0) {
		return [...lines];
	}
	const body = [...lines];
	while (body.length > 0 && body.at(-1)?.trim() === "") body.pop();
	return [...body, "", ...rendered];
}
