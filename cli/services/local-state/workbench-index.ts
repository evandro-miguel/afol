import {
	type Dirent,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import {
	appendValidatedEventLedgerRecords,
	assertValidEventLedger,
	type DurableJsonlIo,
	type EventLedgerInspection,
	EventLedgerValidationError,
	inspectEventLedger,
	readEventLedgerRecords,
} from "../events/ledger";
import { atomicWriteText } from "../io/atomic";
import { withSessionLock } from "../io/session-lock";
import { resolveProjectPaths } from "../project/paths";
import { parseMarkdownTableCells } from "../workbench/state-board";
import { resolveWorkbenchEventLogPath } from "./workbench-events";

export type WorkbenchIndexTask = {
	session: string;
	task_id: string;
	state: string;
	owner: string;
	notes: string;
	file: string;
	line: number;
	touched_at: string;
	planned_files: WorkbenchIndexFileClaim[];
	touched_files: WorkbenchIndexFileClaim[];
};

export type WorkbenchIndexFileClaim = {
	path: string;
	kind: "exact" | "glob";
	source: "planned" | "touched";
	line: number;
};

export type WorkbenchIndexSession = {
	session: string;
	task_count: number;
	completed: number;
	open: number;
	problem: number;
	touched_at: string;
	degraded?: boolean;
	archived?: boolean;
	archived_at?: string;
};

export type WorkbenchIndexSnapshot = {
	kind: "workbench_index_v1";
	version: 1;
	generated_at: string;
	source: {
		wb_dir: string;
		event_log: string;
	};
	sessions: WorkbenchIndexSession[];
	tasks: WorkbenchIndexTask[];
};

type WorkbenchIndexSnapshotInput = Omit<WorkbenchIndexSnapshot, "tasks"> & {
	tasks: Array<
		Omit<WorkbenchIndexTask, "planned_files" | "touched_files"> & {
			planned_files?: WorkbenchIndexFileClaim[] | null;
			touched_files?: WorkbenchIndexFileClaim[] | null;
		}
	>;
};

const TASK_FILE_RE = /^.+_task_\d+\.md$/;
const STATE_BOARD_HEADING_RE = /^#{2,6}\s+State Board\b/i;
const TASK_HEADING_RE = /^#{2,6}\s+(T-\d{2,3})\b/i;
const CHECKPOINT_HEADING_RE = /^#{2,6}\s+.+checkpoint\b/i;
const FILE_CLAIM_LABEL_RE = /^\s*-\s*Files\s+(planned|touched)\s*:\s*$/i;
const NESTED_LIST_ITEM_RE = /^\s{2,}[-*]\s+(.+?)\s*$/;
const GLOB_TOKEN_RE = /[*?[\]{}]/;
const WORKBENCH_INDEX_LOCK_SESSION = "workbench-index";
const LEDGER_VALIDATION_CAPABILITY = Symbol("ledger-validation-capability");
const WORKBENCH_AUXILIARY_DIRS = new Set(["_archive", "screenshots"]);

const ZERO_TIME = new Date(0).toISOString();

function resolveWorkbenchRoot(root: string): string {
	return resolveProjectPaths(root).abs.wbDir;
}

function resolveWorkbenchIndexPath(root: string): string {
	return resolve(resolveProjectPaths(root).abs.dataIndexDir, "workbench.json");
}

function workbenchSource(root: string): WorkbenchIndexSnapshot["source"] {
	const projectPaths = resolveProjectPaths(root);
	return {
		wb_dir: projectPaths.wbDir,
		event_log: projectPaths.eventsFile,
	};
}

function formatNow(): string {
	return new Date().toISOString();
}

function formatFreshTimestamp(root: string): string {
	return new Date(
		Math.max(Date.now(), Math.ceil(latestSourceMtime(root))),
	).toISOString();
}

function parseTouchedAt(path: string): string {
	try {
		return statSync(path).mtime.toISOString();
	} catch {
		return ZERO_TIME;
	}
}

export function collectSessionIds(root: string): string[] {
	const wbRoot = resolveWorkbenchRoot(root);
	if (!existsSync(wbRoot)) {
		return [];
	}
	return readdirSync(wbRoot, { withFileTypes: true })
		.filter(
			(entry) =>
				entry.isDirectory() &&
				!entry.name.startsWith(".") &&
				!WORKBENCH_AUXILIARY_DIRS.has(entry.name),
		)
		.map((entry) => entry.name)
		.sort();
}

function sessionDirExists(root: string, session: string): boolean {
	try {
		return statSync(resolve(resolveWorkbenchRoot(root), session)).isDirectory();
	} catch {
		return false;
	}
}

function readSessionTaskFiles(sessionDir: string): {
	files: string[];
	readFailed: boolean;
} {
	try {
		return {
			files: readdirSync(sessionDir, { withFileTypes: true })
				.filter((entry) => entry.isFile() && TASK_FILE_RE.test(entry.name))
				.map((entry) => resolve(sessionDir, entry.name))
				.sort(),
			readFailed: false,
		};
	} catch {
		return { files: [], readFailed: true };
	}
}

function sessionTaskFiles(sessionDir: string): string[] {
	return readSessionTaskFiles(sessionDir).files;
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sessionTokenBoundaryRegExp(session: string): RegExp {
	const escaped = escapeRegex(session);
	return new RegExp(`(?:^|[^A-Za-z0-9_-])${escaped}(?:$|[^A-Za-z0-9_-])`);
}

function collectSessionsWithMigrationEvidence(
	root: string,
	sessions: readonly string[],
): Set<string> {
	const matched = new Set<string>();
	const pending = new Map<string, { needle: string; pathMatcher: RegExp }>();
	for (const session of sessions) {
		const needle = session.trim();
		if (!needle) {
			continue;
		}
		pending.set(session, {
			needle,
			pathMatcher: sessionTokenBoundaryRegExp(needle),
		});
	}
	if (pending.size === 0) {
		return matched;
	}

	const projectPaths = resolveProjectPaths(root);
	const migrationRoot = join(projectPaths.abs.mutableDir, "data", "migrations");
	if (!existsSync(migrationRoot)) {
		return matched;
	}

	const stack = [migrationRoot];
	const seen = new Set<string>();

	while (stack.length > 0 && pending.size > 0) {
		const current = stack.pop();
		if (!current || seen.has(current)) {
			continue;
		}
		seen.add(current);
		let entries: Dirent[];
		try {
			entries = readdirSync(current, { withFileTypes: true });
		} catch {
			continue;
		}

		for (const entry of entries) {
			const child = join(current, entry.name);
			const relative = child
				.slice(migrationRoot.length + 1)
				.replace(/\\/g, "/");
			const candidate = `/${relative}`;
			for (const [session, evidence] of pending) {
				if (evidence.pathMatcher.test(candidate)) {
					matched.add(session);
					pending.delete(session);
				}
			}
			if (pending.size === 0) {
				return matched;
			}
			if (entry.isDirectory()) {
				stack.push(child);
				continue;
			}
			if (!entry.isFile()) {
				continue;
			}
			if (!/\.(?:json|md|txt|yml|yaml)$/i.test(entry.name)) {
				continue;
			}
			try {
				const content = readFileSync(child, "utf8");
				for (const [session, evidence] of pending) {
					if (content.includes(evidence.needle)) {
						matched.add(session);
						pending.delete(session);
					}
				}
			} catch {
				// ignore unreadable migration payloads for warning detection
			}
			if (pending.size === 0) {
				return matched;
			}
		}
	}
	return matched;
}

function sessionHasArchiveDir(root: string, session: string): boolean {
	const trimmed = session.trim();
	if (!trimmed) {
		return false;
	}
	const archiveDir = join(resolveWorkbenchRoot(root), "_archive", trimmed);
	try {
		return statSync(archiveDir).isDirectory();
	} catch {
		return false;
	}
}

function collectSessionLifecycleEvents(
	root: string,
	validatedRecords?: readonly Record<string, unknown>[],
): Map<
	string,
	{ started: boolean; closed: boolean; archived: boolean; archivedAt?: string }
> {
	const eventLog = resolveWorkbenchEventLogPath(root);
	const lifecycle = new Map<
		string,
		{
			started: boolean;
			closed: boolean;
			archived: boolean;
			archivedAt?: string;
		}
	>();
	if (!existsSync(eventLog)) {
		return lifecycle;
	}

	for (const raw of validatedRecords ?? readEventLedgerRecords(root)) {
		const workbenchType = typeof raw.type === "string" ? raw.type : "";
		const telemetryType =
			typeof raw.event_type === "string" ? raw.event_type : "";
		const workbenchSession = typeof raw.session === "string" ? raw.session : "";
		const telemetrySession =
			typeof raw.session_id === "string" ? raw.session_id : "";

		if (workbenchSession) {
			const state = lifecycle.get(workbenchSession) ?? {
				started: false,
				closed: false,
				archived: false,
			};
			if (workbenchType === "workbench.new") {
				state.started = true;
				state.closed = false;
			}
			if (workbenchType === "workbench.close") {
				state.closed = true;
			}
			if (workbenchType === "workbench.archive") {
				state.archived = true;
				if (typeof raw.ts === "string") {
					state.archivedAt = raw.ts;
				} else {
					delete state.archivedAt;
				}
			}
			if (workbenchType === "workbench.restore") {
				state.archived = false;
				delete state.archivedAt;
			}
			lifecycle.set(workbenchSession, state);
		}

		if (telemetrySession) {
			const state = lifecycle.get(telemetrySession) ?? {
				started: false,
				closed: false,
				archived: false,
			};
			if (telemetryType === "session_start") {
				state.started = true;
				state.closed = false;
			}
			if (telemetryType === "session_end") {
				state.closed = true;
			}
			lifecycle.set(telemetrySession, state);
		}
	}
	return lifecycle;
}

type ParsedTaskClaims = {
	planned_files: WorkbenchIndexFileClaim[];
	touched_files: WorkbenchIndexFileClaim[];
};

type WorkbenchIndexRebuildOptions = {
	beforeWrite?: (sessionScope?: string) => void;
	ledgerValidationCapability?: typeof LEDGER_VALIDATION_CAPABILITY;
};

type FileClaimField = keyof ParsedTaskClaims;

function emptyTaskClaims(): ParsedTaskClaims {
	return {
		planned_files: [],
		touched_files: [],
	};
}

function mergeBySession<T extends { session: string }>(
	entries: T[],
	replacement: T[],
	session: string,
): T[] {
	if (entries.length === 0) {
		return replacement.length > 0 ? [...replacement] : [];
	}

	const merged: T[] = [];
	let inserted = false;

	for (const entry of entries) {
		if (!inserted && entry.session.localeCompare(session) > 0) {
			merged.push(...replacement);
			inserted = true;
		}
		if (entry.session !== session) {
			merged.push(entry);
		}
	}

	if (!inserted) {
		merged.push(...replacement);
	}

	return merged;
}

function sortClaims(
	claims: WorkbenchIndexFileClaim[],
): WorkbenchIndexFileClaim[] {
	return [...claims].sort((a, b) => {
		if (a.path !== b.path) {
			return a.path.localeCompare(b.path);
		}
		if (a.source !== b.source) {
			return a.source.localeCompare(b.source);
		}
		return a.line - b.line;
	});
}

function dedupeClaims(
	claims: WorkbenchIndexFileClaim[],
): WorkbenchIndexFileClaim[] {
	const seen = new Set<string>();
	const deduped: WorkbenchIndexFileClaim[] = [];
	for (const claim of sortClaims(claims)) {
		const key = `${claim.source}:${claim.kind}:${claim.path}:${claim.line}`;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		deduped.push(claim);
	}
	return deduped;
}

function normalizeClaimValue(raw: string): string {
	let value = raw.trim();
	const fullCodeMatch = value.match(/^`([^`]+)`$/);
	if (fullCodeMatch?.[1]) {
		value = fullCodeMatch[1];
	}
	value = value.replace(/\\/g, "/").replace(/^\.\//, "");
	while (
		value.length > 0 &&
		/[),.;:]$/.test(value) &&
		(value.includes("/") ||
			value.startsWith(".") ||
			GLOB_TOKEN_RE.test(value) ||
			/^[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]+$/.test(value))
	) {
		value = value.slice(0, -1);
	}
	return value.trim();
}

function looksLikeClaimPath(value: string): boolean {
	const normalized = normalizeClaimValue(value);
	const lower = normalized.toLowerCase();
	if (
		normalized.length === 0 ||
		lower === "n/a" ||
		lower === "none" ||
		lower.startsWith("n/a ") ||
		lower.startsWith("pending") ||
		lower.startsWith("see ")
	) {
		return false;
	}
	return (
		normalized.includes("/") ||
		normalized.startsWith(".") ||
		GLOB_TOKEN_RE.test(normalized) ||
		/^[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]+$/.test(normalized)
	);
}

function parseTaskFileClaim(
	raw: string,
	source: WorkbenchIndexFileClaim["source"],
	line: number,
): WorkbenchIndexFileClaim | null {
	if (!looksLikeClaimPath(raw)) {
		return null;
	}
	const path = normalizeClaimValue(raw);
	return {
		path,
		kind: GLOB_TOKEN_RE.test(path) ? "glob" : "exact",
		source,
		line,
	};
}

type StateBoardTable = {
	columnCount: number;
	taskColumn: number;
	stateColumn: number;
	ownerColumn: number;
	notesColumn: number | null;
};

type ParsedStateBoardTasks = {
	tasks: Array<Omit<WorkbenchIndexTask, "planned_files" | "touched_files">>;
	malformed: boolean;
};

/**
 * Split a Markdown table row body (after leading `|`, without trailing `|`)
 * into cells. A pipe `|` is a column delimiter only when preceded by an even
 * number of consecutive backslashes. Backslashes and escaped pipes are
 * preserved in the cell value.
 *
 * Example: `a\\|b|c` -> ["a\\", "b", "c"]  (two backslashes, even, pipe is delimiter)
 * Example: `a\\\|b|c` -> ["a\\\|b", "c"] (three backslashes, odd, pipe is content)
 * Example: `a\|b|c`    -> ["a\|b", "c"]    (one backslash, odd, pipe is content)
 */
function parseStateBoardTableHeader(
	line: string,
	allowExtraColumns: boolean,
): StateBoardTable | null {
	const cells = parseMarkdownTableCells(line);
	if (!cells) {
		return null;
	}
	const labels = cells.map((cell) => cell.toLowerCase());
	const canonical = ["task", "state", "owner", "notes"];
	if (
		labels.length === canonical.length &&
		labels.every((label, index) => label === canonical[index])
	) {
		return {
			columnCount: labels.length,
			taskColumn: 0,
			stateColumn: 1,
			ownerColumn: 2,
			notesColumn: 3,
		};
	}
	if (!allowExtraColumns) {
		return null;
	}

	const columns = new Map<string, number>();
	for (const [index, label] of labels.entries()) {
		if (
			columns.has(label) &&
			["task", "state", "owner", "notes"].includes(label)
		) {
			return null;
		}
		if (!columns.has(label)) {
			columns.set(label, index);
		}
	}
	const taskColumn = columns.get("task");
	const stateColumn = columns.get("state");
	const ownerColumn = columns.get("owner");
	if (
		taskColumn === undefined ||
		stateColumn === undefined ||
		ownerColumn === undefined
	) {
		return null;
	}

	return {
		columnCount: labels.length,
		taskColumn,
		stateColumn,
		ownerColumn,
		notesColumn: columns.get("notes") ?? null,
	};
}

function isTableSeparator(cells: string[], table: StateBoardTable): boolean {
	return (
		cells.length === table.columnCount &&
		cells.every((cell) => /^:?-+:?$/.test(cell))
	);
}

function parseStateBoardTasks(
	session: string,
	file: string,
	lines: string[],
): ParsedStateBoardTasks {
	const tasks: Array<
		Omit<WorkbenchIndexTask, "planned_files" | "touched_files">
	> = [];
	let afterStateBoard = false;
	let table: StateBoardTable | null = null;
	let malformed = false;
	let insideCodeBlock = false;

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		const trimmed = line.trim();
		if (!trimmed) {
			table = null;
			continue;
		}

		if (trimmed.startsWith("```")) {
			insideCodeBlock = !insideCodeBlock;
			continue;
		}
		if (insideCodeBlock) {
			continue;
		}

		if (STATE_BOARD_HEADING_RE.test(trimmed)) {
			afterStateBoard = true;
			table = null;
			continue;
		}
		if (trimmed.startsWith("#")) {
			afterStateBoard = false;
			table = null;
			continue;
		}

		const header = parseStateBoardTableHeader(trimmed, afterStateBoard);
		if (header) {
			table = header;
			continue;
		}
		if (!table) {
			if (afterStateBoard && trimmed.startsWith("|")) {
				malformed = true;
			}
			continue;
		}

		const cells = parseMarkdownTableCells(trimmed);
		if (!cells) {
			continue;
		}
		if (isTableSeparator(cells, table)) {
			continue;
		}

		const taskId = cells[table.taskColumn]?.trim() ?? "";
		const state = cells[table.stateColumn]?.trim() ?? "";
		const owner = cells[table.ownerColumn]?.trim() ?? "";
		if (
			table.taskColumn >= cells.length ||
			table.stateColumn >= cells.length ||
			table.ownerColumn >= cells.length ||
			!/^T-\d{2,3}$/.test(taskId) ||
			!state
		) {
			// Keep valid rows, but surface partial table corruption as degraded.
			malformed = true;
			continue;
		}

		tasks.push({
			session,
			task_id: taskId,
			state: state.toLowerCase(),
			owner,
			notes:
				table.notesColumn === null
					? ""
					: (cells[table.notesColumn] ?? "").trim(),
			file,
			line: index + 1,
			touched_at: parseTouchedAt(file),
		});
	}

	return { tasks, malformed };
}

function parseTaskClaims(
	lines: string[],
	taskIds: string[],
): Map<string, ParsedTaskClaims> {
	const taskIdSet = new Set(taskIds);
	const parsed = new Map<string, ParsedTaskClaims>();
	const singleTaskId = taskIds.length === 1 ? (taskIds[0] ?? null) : null;
	let insideCodeBlock = false;
	let currentTaskId: string | null = null;
	let currentField: FileClaimField | null = null;

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		const trimmed = line.trim();

		if (trimmed.startsWith("```")) {
			insideCodeBlock = !insideCodeBlock;
			continue;
		}
		if (insideCodeBlock) {
			continue;
		}

		const taskHeading = trimmed.match(TASK_HEADING_RE);
		if (taskHeading?.[1]) {
			currentField = null;
			currentTaskId = taskIdSet.has(taskHeading[1]) ? taskHeading[1] : null;
			continue;
		}

		if (CHECKPOINT_HEADING_RE.test(trimmed)) {
			currentField = null;
			currentTaskId = singleTaskId;
			continue;
		}

		if (trimmed.startsWith("#")) {
			currentField = null;
			currentTaskId = null;
			continue;
		}

		const labelMatch = trimmed.match(FILE_CLAIM_LABEL_RE);
		if (labelMatch?.[1] && currentTaskId) {
			currentField =
				labelMatch[1].toLowerCase() === "planned"
					? "planned_files"
					: "touched_files";
			continue;
		}

		if (!currentTaskId || !currentField) {
			continue;
		}

		const itemMatch = line.match(NESTED_LIST_ITEM_RE);
		if (!itemMatch?.[1]) {
			if (
				trimmed.length > 0 &&
				!line.startsWith("  ") &&
				!line.startsWith("\t")
			) {
				currentField = null;
			}
			continue;
		}

		const claim = parseTaskFileClaim(
			itemMatch[1],
			currentField === "planned_files" ? "planned" : "touched",
			index + 1,
		);
		if (!claim) {
			continue;
		}
		const bucket = parsed.get(currentTaskId) ?? emptyTaskClaims();
		bucket[currentField].push(claim);
		parsed.set(currentTaskId, bucket);
	}

	return parsed;
}

function parseTaskRows(
	session: string,
	file: string,
): { tasks: WorkbenchIndexTask[]; malformed: boolean } {
	try {
		const lines = readFileSync(file, "utf8").split("\n");
		const parsedBoard = parseStateBoardTasks(session, file, lines);
		const parsedClaims = parseTaskClaims(
			lines,
			parsedBoard.tasks.map((task) => task.task_id),
		);
		return {
			tasks: parsedBoard.tasks.map((task) => {
				const claims = parsedClaims.get(task.task_id) ?? emptyTaskClaims();
				return {
					...task,
					planned_files: dedupeClaims(claims.planned_files),
					touched_files: dedupeClaims(claims.touched_files),
				};
			}),
			malformed: parsedBoard.malformed,
		};
	} catch {
		return { tasks: [], malformed: true };
	}
}

function summarizeSession(
	session: string,
	tasks: WorkbenchIndexTask[],
	archive?: { archived: boolean; archivedAt?: string },
): WorkbenchIndexSession {
	const completed = tasks.filter((task) => task.state === "done").length;
	const problem = tasks.filter((task) => task.state === "problem").length;
	const open = tasks.filter(
		(task) => task.state !== "done" && task.state !== "moved",
	).length;
	const touchedAt = tasks.reduce((latest, task) => {
		const current = Date.parse(task.touched_at);
		return Number.isFinite(current) ? Math.max(latest, current) : latest;
	}, 0);
	return {
		session,
		task_count: tasks.length,
		completed,
		open,
		problem,
		touched_at:
			tasks.length > 0 && touchedAt > 0
				? new Date(touchedAt).toISOString()
				: ZERO_TIME,
		...(archive?.archived
			? { archived: true, archived_at: archive.archivedAt }
			: {}),
	};
}

function sortSessions(
	a: WorkbenchIndexSession,
	b: WorkbenchIndexSession,
): number {
	return a.session.localeCompare(b.session);
}

function sortTasks(a: WorkbenchIndexTask, b: WorkbenchIndexTask): number {
	if (a.session !== b.session) {
		return a.session.localeCompare(b.session);
	}
	if (a.task_id !== b.task_id) {
		return a.task_id.localeCompare(b.task_id);
	}
	return a.line - b.line;
}

function buildSessionsSnapshot(
	root: string,
	sessions: Iterable<string>,
): {
	sessions: WorkbenchIndexSession[];
	tasks: WorkbenchIndexTask[];
} {
	const wbRoot = resolveWorkbenchRoot(root);
	const allTasks: WorkbenchIndexTask[] = [];
	const snapshotSessions: WorkbenchIndexSession[] = [];
	const lifecycle = collectSessionLifecycleEvents(root);

	for (const session of sessions) {
		const sessionDir = resolve(wbRoot, session);
		if (!existsSync(sessionDir)) {
			continue;
		}
		const sessionTasks: WorkbenchIndexTask[] = [];
		const taskFileRead = readSessionTaskFiles(sessionDir);
		const taskFiles = taskFileRead.files;
		const readError = taskFileRead.readFailed;
		let parseError = false;
		let duplicateTaskId = false;
		const seenTaskIds = new Set<string>();

		for (const file of taskFiles) {
			const parsed = parseTaskRows(session, file);
			parseError ||= parsed.malformed;
			for (const task of parsed.tasks) {
				if (seenTaskIds.has(task.task_id)) {
					duplicateTaskId = true;
					continue;
				}
				seenTaskIds.add(task.task_id);
				sessionTasks.push(task);
			}
		}

		// If task files exist but no tasks could be parsed, the session is degraded.
		const summary = summarizeSession(
			session,
			sessionTasks,
			lifecycle.get(session),
		);
		if (
			readError ||
			parseError ||
			duplicateTaskId ||
			(taskFiles.length > 0 && sessionTasks.length === 0)
		) {
			summary.degraded = true;
		}

		snapshotSessions.push(summary);
		allTasks.push(...sessionTasks);
	}

	return {
		sessions: snapshotSessions.sort(sortSessions),
		tasks: allTasks.sort(sortTasks),
	};
}

function allSessionsSnapshot(root: string): {
	sessions: WorkbenchIndexSession[];
	tasks: WorkbenchIndexTask[];
} {
	return buildSessionsSnapshot(root, collectSessionIds(root));
}

function emptySnapshot(root: string): WorkbenchIndexSnapshot {
	return {
		kind: "workbench_index_v1",
		version: 1,
		generated_at: formatNow(),
		source: workbenchSource(root),
		sessions: [],
		tasks: [],
	};
}

export function collectWorkBenchSnapshot(
	root: string,
	sessionScope?: string,
): WorkbenchIndexSnapshot {
	const scoped = sessionScope
		? buildSessionsSnapshot(root, [sessionScope])
		: allSessionsSnapshot(root);
	return {
		kind: "workbench_index_v1",
		version: 1,
		generated_at: formatFreshTimestamp(root),
		source: workbenchSource(root),
		sessions: scoped.sessions,
		tasks: scoped.tasks,
	};
}

function writeSnapshot(
	root: string,
	snapshot: WorkbenchIndexSnapshot,
): WorkbenchIndexSnapshot {
	const indexPath = resolveWorkbenchIndexPath(root);
	mkdirSync(resolve(indexPath, ".."), { recursive: true });
	atomicWriteText(indexPath, `${JSON.stringify(snapshot)}\n`);
	return snapshot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isWorkbenchIndexFileClaim(
	value: unknown,
): value is WorkbenchIndexFileClaim {
	if (!isRecord(value)) {
		return false;
	}
	return (
		typeof value.path === "string" &&
		value.path.length > 0 &&
		(value.kind === "exact" || value.kind === "glob") &&
		(value.source === "planned" || value.source === "touched") &&
		isPositiveInteger(value.line)
	);
}

function isWorkbenchIndexTaskInput(
	value: unknown,
): value is WorkbenchIndexSnapshotInput["tasks"][number] {
	if (!isRecord(value)) {
		return false;
	}
	const plannedFiles = value.planned_files;
	const touchedFiles = value.touched_files;
	return (
		typeof value.session === "string" &&
		value.session.length > 0 &&
		typeof value.task_id === "string" &&
		value.task_id.length > 0 &&
		typeof value.state === "string" &&
		value.state.length > 0 &&
		typeof value.owner === "string" &&
		typeof value.notes === "string" &&
		typeof value.file === "string" &&
		value.file.length > 0 &&
		isPositiveInteger(value.line) &&
		typeof value.touched_at === "string" &&
		isIsoDate(value.touched_at) &&
		(plannedFiles === undefined ||
			plannedFiles === null ||
			(Array.isArray(plannedFiles) &&
				plannedFiles.every(isWorkbenchIndexFileClaim))) &&
		(touchedFiles === undefined ||
			touchedFiles === null ||
			(Array.isArray(touchedFiles) &&
				touchedFiles.every(isWorkbenchIndexFileClaim)))
	);
}

function isWorkbenchIndexSession(
	value: unknown,
): value is WorkbenchIndexSession {
	if (!isRecord(value)) {
		return false;
	}
	return (
		typeof value.session === "string" &&
		value.session.length > 0 &&
		isNonNegativeInteger(value.task_count) &&
		isNonNegativeInteger(value.completed) &&
		isNonNegativeInteger(value.open) &&
		isNonNegativeInteger(value.problem) &&
		typeof value.touched_at === "string" &&
		isIsoDate(value.touched_at) &&
		(value.degraded === undefined || typeof value.degraded === "boolean") &&
		(value.archived === undefined || typeof value.archived === "boolean") &&
		(value.archived_at === undefined ||
			(typeof value.archived_at === "string" &&
				isIsoDate(value.archived_at))) &&
		(value.archived !== true || typeof value.archived_at === "string")
	);
}

function isWorkbenchIndexSnapshotInput(
	value: unknown,
): value is WorkbenchIndexSnapshotInput {
	if (!isRecord(value) || !isRecord(value.source)) {
		return false;
	}
	if (
		value.kind !== "workbench_index_v1" ||
		value.version !== 1 ||
		typeof value.generated_at !== "string" ||
		typeof value.source.wb_dir !== "string" ||
		typeof value.source.event_log !== "string" ||
		!Array.isArray(value.sessions) ||
		!Array.isArray(value.tasks) ||
		!value.sessions.every(isWorkbenchIndexSession) ||
		!value.tasks.every(isWorkbenchIndexTaskInput)
	) {
		return false;
	}
	const sessionNames = new Set(
		value.sessions.map((session) => session.session),
	);
	const tasks = value.tasks;
	if (sessionNames.size !== value.sessions.length) {
		return false;
	}

	const taskKeys = new Set<string>();
	for (const task of value.tasks) {
		if (!sessionNames.has(task.session)) {
			return false;
		}
		const taskKey = `${task.session}\0${task.task_id}`;
		if (taskKeys.has(taskKey)) {
			return false;
		}
		taskKeys.add(taskKey);
	}

	return value.sessions.every((session) => {
		const sessionTasks = tasks.filter(
			(task) => task.session === session.session,
		);
		return (
			session.task_count === sessionTasks.length &&
			session.completed ===
				sessionTasks.filter((task) => task.state === "done").length &&
			session.open ===
				sessionTasks.filter(
					(task) => task.state !== "done" && task.state !== "moved",
				).length &&
			session.problem ===
				sessionTasks.filter((task) => task.state === "problem").length
		);
	});
}

function normalizeWorkbenchTask(
	task: WorkbenchIndexSnapshotInput["tasks"][number],
): WorkbenchIndexTask {
	return {
		...task,
		planned_files: Array.isArray(task.planned_files) ? task.planned_files : [],
		touched_files: Array.isArray(task.touched_files) ? task.touched_files : [],
	};
}

export function normalizeWorkbenchSnapshot(
	snapshot: WorkbenchIndexSnapshotInput,
): WorkbenchIndexSnapshot {
	return {
		...snapshot,
		tasks: snapshot.tasks.map(normalizeWorkbenchTask),
	};
}

export function loadWorkBenchIndexSnapshot(
	root: string,
): WorkbenchIndexSnapshot | null {
	const indexPath = resolveWorkbenchIndexPath(root);
	if (!existsSync(indexPath)) {
		return null;
	}
	try {
		const parsed = JSON.parse(
			readFileSync(indexPath, "utf8"),
		) as Partial<WorkbenchIndexSnapshot>;
		if (!isWorkbenchIndexSnapshotInput(parsed)) {
			return null;
		}
		return normalizeWorkbenchSnapshot(parsed);
	} catch {
		return null;
	}
}

function sessionSourceLatestTime(root: string, session: string): number {
	const wbRoot = resolveWorkbenchRoot(root);
	const sessionDir = resolve(wbRoot, session);
	if (!existsSync(sessionDir)) {
		return 0;
	}
	let latest = 0;
	try {
		latest = Math.max(latest, statSync(sessionDir).mtimeMs);
	} catch {
		latest = 0;
	}

	for (const file of sessionTaskFiles(sessionDir)) {
		try {
			latest = Math.max(latest, statSync(file).mtimeMs);
		} catch {
			// best-effort freshness stat; skip
		}
	}
	return latest;
}

function latestAuxiliarySourceMtime(root: string): number {
	const wbRoot = resolveWorkbenchRoot(root);
	if (!existsSync(wbRoot)) {
		return 0;
	}

	let latest = 0;
	try {
		latest = Math.max(latest, statSync(wbRoot).mtimeMs);
	} catch {
		latest = 0;
	}

	const activeSessionPath = resolve(wbRoot, ".active_session");
	if (existsSync(activeSessionPath)) {
		try {
			latest = Math.max(latest, statSync(activeSessionPath).mtimeMs);
		} catch {
			// no-op
		}
	}

	const eventLog = resolveWorkbenchEventLogPath(root);
	if (existsSync(eventLog)) {
		try {
			latest = Math.max(latest, statSync(eventLog).mtimeMs);
		} catch {
			// no-op
		}
	}
	return latest;
}

function latestSourceMtime(root: string): number {
	let latest = latestAuxiliarySourceMtime(root);
	for (const session of collectSessionIds(root)) {
		latest = Math.max(latest, sessionSourceLatestTime(root, session));
	}
	return latest;
}

function isIsoDate(value: unknown): boolean {
	return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function normalizedMtime(path: string): number | null {
	try {
		const timestamp = statSync(path).mtime.toISOString();
		const parsed = Date.parse(timestamp);
		return Number.isFinite(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function isSessionSnapshotFresh(
	root: string,
	session: string,
	persistedSession: WorkbenchIndexSession | undefined,
	persistedTasks: readonly WorkbenchIndexTask[],
	generatedAt: number,
): boolean {
	if (!persistedSession) {
		return false;
	}
	if (persistedSession.task_count !== persistedTasks.length) {
		return false;
	}
	const currentSnapshot = buildSessionsSnapshot(root, [session]);
	const currentSession = currentSnapshot.sessions[0];
	if (
		!currentSession ||
		JSON.stringify(currentSession) !== JSON.stringify(persistedSession) ||
		JSON.stringify(currentSnapshot.tasks) !==
			JSON.stringify([...persistedTasks].sort(sortTasks))
	) {
		return false;
	}

	const sessionDir = resolve(resolveWorkbenchRoot(root), session);
	const taskFileRead = readSessionTaskFiles(sessionDir);
	if (taskFileRead.readFailed) {
		return false;
	}
	const taskFiles = taskFileRead.files;

	if (persistedTasks.length === 0) {
		if (persistedSession.touched_at !== ZERO_TIME) {
			return false;
		}
		const sourceTimes = [
			normalizedMtime(sessionDir),
			...taskFiles.map(normalizedMtime),
		];
		return sourceTimes.every(
			(timestamp) => timestamp !== null && timestamp <= generatedAt,
		);
	}

	const persistedByFile = new Map<string, number[]>();
	for (const task of persistedTasks) {
		const touchedAt = Date.parse(task.touched_at);
		if (!Number.isFinite(touchedAt)) {
			return false;
		}
		const timestamps = persistedByFile.get(task.file) ?? [];
		timestamps.push(touchedAt);
		persistedByFile.set(task.file, timestamps);
	}

	const currentFiles = new Set(taskFiles);
	if (
		currentFiles.size !== persistedByFile.size ||
		[...currentFiles].some((file) => !persistedByFile.has(file)) ||
		[...persistedByFile.keys()].some((file) => !currentFiles.has(file))
	) {
		return false;
	}

	let latestTaskMtime = 0;
	for (const file of taskFiles) {
		const currentMtime = normalizedMtime(file);
		const persistedMtimes = persistedByFile.get(file);
		if (currentMtime === null || !persistedMtimes) {
			return false;
		}
		latestTaskMtime = Math.max(latestTaskMtime, currentMtime);
		if (persistedMtimes.some((timestamp) => timestamp !== currentMtime)) {
			return false;
		}
	}

	return Date.parse(persistedSession.touched_at) === latestTaskMtime;
}

export function rebuildWorkBenchIndex(
	root: string,
	sessionScope?: string,
	options: WorkbenchIndexRebuildOptions = {},
): WorkbenchIndexSnapshot {
	return withSessionLock(root, WORKBENCH_INDEX_LOCK_SESSION, () => {
		if (options.ledgerValidationCapability !== LEDGER_VALIDATION_CAPABILITY) {
			assertValidEventLedger(root);
		}
		options.beforeWrite?.(sessionScope);
		const current = loadWorkBenchIndexSnapshot(root);

		if (sessionScope) {
			if (!current) {
				// Existing snapshot is missing or malformed — fall back to full rebuild
				// to avoid silently dropping unaffected sessions.
				return writeSnapshot(root, collectWorkBenchSnapshot(root));
			}
			const targetSnapshot = buildSessionsSnapshot(root, [sessionScope]);
			const hasSession = sessionDirExists(root, sessionScope);

			const existingTasks = current?.tasks ?? [];
			const existingSessions = current?.sessions ?? [];

			if (!hasSession) {
				const filtered = {
					...(current ?? emptySnapshot(root)),
					generated_at: formatNow(),
					sessions: existingSessions.filter(
						(entry) => entry.session !== sessionScope,
					),
					tasks: existingTasks.filter((task) => task.session !== sessionScope),
				};
				return writeSnapshot(root, filtered);
			}

			const nextSessions = mergeBySession(
				existingSessions,
				targetSnapshot.sessions,
				sessionScope,
			);
			const nextTasks = mergeBySession(
				existingTasks,
				targetSnapshot.tasks,
				sessionScope,
			);

			const next: WorkbenchIndexSnapshot = {
				kind: "workbench_index_v1",
				version: 1,
				generated_at: formatNow(),
				source: {
					...workbenchSource(root),
				},
				sessions: nextSessions,
				tasks: nextTasks,
			};
			return writeSnapshot(root, next);
		}

		return writeSnapshot(root, collectWorkBenchSnapshot(root));
	});
}

export function appendEventsAndRebuildWorkBenchIndex(
	root: string,
	sessionScope: string | undefined,
	records: readonly Record<string, unknown>[],
	options: {
		ledgerIo?: DurableJsonlIo;
		beforeIndexRebuild?: () => void;
	} = {},
): WorkbenchIndexSnapshot {
	return withSessionLock(root, WORKBENCH_INDEX_LOCK_SESSION, () => {
		appendValidatedEventLedgerRecords(root, records, options.ledgerIo);
		try {
			options.beforeIndexRebuild?.();
			return rebuildWorkBenchIndex(root, sessionScope, {
				ledgerValidationCapability: LEDGER_VALIDATION_CAPABILITY,
			});
		} catch (error) {
			throw new Error(
				`event ledger committed; workbench index repair required (run afol local-state rebuild): ${(error as Error).message}`,
				{ cause: error },
			);
		}
	});
}

export function validateWorkBenchIndex(
	root: string,
	options?: { eventLedger?: EventLedgerInspection },
): {
	ok: boolean;
	message: string;
} {
	const ledger = options?.eventLedger ?? inspectEventLedger(root);
	if (!ledger.ok) {
		const first = ledger.issues.find((issue) => issue.severity === "error");
		const location = first?.line ? ` line=${first.line}` : "";
		return {
			ok: false,
			message: `${first?.code ?? "EVENT_LEDGER_UNREADABLE"}${location}: event ledger invalid; explicit repair required`,
		};
	}
	const indexPath = resolveWorkbenchIndexPath(root);
	if (!existsSync(indexPath)) {
		return {
			ok: false,
			message: `missing workbench index snapshot: ${indexPath}; run afol local-state rebuild`,
		};
	}

	const snapshot = loadWorkBenchIndexSnapshot(root);
	if (!snapshot) {
		return {
			ok: false,
			message: `invalid workbench index snapshot: ${indexPath}`,
		};
	}
	if (!isIsoDate(snapshot.generated_at)) {
		return {
			ok: false,
			message: `invalid workbench index snapshot: ${indexPath}`,
		};
	}

	const degradedSessions = snapshot.sessions.filter((s) => s.degraded);
	if (degradedSessions.length > 0) {
		const degradedNames = degradedSessions.map((s) => s.session).join(", ");
		return {
			ok: false,
			message: `degraded sessions in workbench index: ${degradedNames}. Task sources may be unreadable, have malformed or empty State Boards, or contain duplicate task IDs. Repair the named session task source, then run afol local-state rebuild.`,
		};
	}

	const diskSessions = collectSessionIds(root);
	const snapshotSessions = new Set(
		snapshot.sessions.map((session) => session.session),
	);
	const sessionById = new Map(
		snapshot.sessions.map((entry) => [entry.session, entry]),
	);
	const tasksBySession = new Map<string, WorkbenchIndexTask[]>();
	for (const task of snapshot.tasks) {
		const tasks = tasksBySession.get(task.session) ?? [];
		tasks.push(task);
		tasksBySession.set(task.session, tasks);
	}
	const generatedAt = Date.parse(snapshot.generated_at);
	if (
		diskSessions.length !== snapshotSessions.size ||
		diskSessions.some((session) => !snapshotSessions.has(session)) ||
		diskSessions.some(
			(session) =>
				!isSessionSnapshotFresh(
					root,
					session,
					sessionById.get(session),
					tasksBySession.get(session) ?? [],
					generatedAt,
				),
		)
	) {
		return {
			ok: false,
			message: `stale workbench index snapshot: ${indexPath}`,
		};
	}

	const sourceLatest = latestAuxiliarySourceMtime(root);
	if (!Number.isFinite(sourceLatest)) {
		return { ok: true, message: `ok workbench index: ${indexPath}` };
	}
	if (generatedAt < sourceLatest) {
		return {
			ok: false,
			message: `stale workbench index snapshot: ${indexPath}`,
		};
	}

	return { ok: true, message: `ok workbench index snapshot: ${indexPath}` };
}

export type SessionHealthWarning = {
	type:
		| "stale_open_tasks"
		| "missing_session_directory"
		| "unreadable_session_directory"
		| "invalid_event_ledger";
	session: string;
	message: string;
};

export function detectSessionHealth(
	root: string,
	options?: {
		eventLedger?: EventLedgerInspection;
		workbenchSnapshot?: WorkbenchIndexSnapshot;
	},
): SessionHealthWarning[] {
	const warnings: SessionHealthWarning[] = [];
	const allSessionIds = collectSessionIds(root);
	const eventLedger = options?.eventLedger ?? inspectEventLedger(root);
	if (!eventLedger.ok) {
		const message = new EventLedgerValidationError(eventLedger).message;
		warnings.push({
			type: "invalid_event_ledger",
			session: "",
			message,
		});
		return warnings;
	}
	const lifecycle = collectSessionLifecycleEvents(root, eventLedger.records);
	const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
	const now = Date.now();
	const indexedSessions = options?.workbenchSnapshot
		? new Map(
				options.workbenchSnapshot.sessions.map((session) => [
					session.session,
					session,
				]),
			)
		: null;

	// Detect stale open tasks (>7 days since last touched).
	if (indexedSessions) {
		for (const [session, indexed] of indexedSessions) {
			const touchedAt = Date.parse(indexed.touched_at);
			if (
				indexed.open > 0 &&
				Number.isFinite(touchedAt) &&
				now - touchedAt > SEVEN_DAYS_MS
			) {
				warnings.push({
					type: "stale_open_tasks",
					session,
					message: `Session "${session}" has open tasks untouched for >7 days`,
				});
			}
		}
	} else {
		const wbRoot = resolveWorkbenchRoot(root);
		for (const session of allSessionIds) {
			const sessionDir = resolve(wbRoot, session);
			if (!existsSync(sessionDir)) {
				continue;
			}
			const taskFileRead = readSessionTaskFiles(sessionDir);
			if (taskFileRead.readFailed) {
				warnings.push({
					type: "unreadable_session_directory",
					session,
					message: `unavailable: session directory unreadable: ${session}`,
				});
				continue;
			}
			const taskFiles = taskFileRead.files;
			if (taskFiles.length === 0) {
				continue;
			}

			let hasOpen = false;
			let touchedAt = 0;
			for (const file of taskFiles) {
				const tasks = parseTaskRows(session, file).tasks;
				for (const task of tasks) {
					if (task.state !== "done" && task.state !== "moved") {
						hasOpen = true;
					}
				}
				try {
					touchedAt = Math.max(touchedAt, statSync(file).mtimeMs);
				} catch {
					// ignore
				}
			}

			if (hasOpen && now - touchedAt > SEVEN_DAYS_MS) {
				warnings.push({
					type: "stale_open_tasks",
					session,
					message: `Session "${session}" has open tasks untouched for >7 days`,
				});
			}
		}
	}

	const missingSessionCandidates: string[] = [];
	for (const [session, state] of lifecycle) {
		if (!state.started || state.closed) {
			continue;
		}
		if (sessionDirExists(root, session)) {
			continue;
		}
		if (sessionHasArchiveDir(root, session)) {
			continue;
		}
		missingSessionCandidates.push(session);
	}

	const migratedSessions = collectSessionsWithMigrationEvidence(
		root,
		missingSessionCandidates,
	);
	for (const session of missingSessionCandidates) {
		if (migratedSessions.has(session)) {
			continue;
		}
		warnings.push({
			type: "missing_session_directory",
			session,
			message: `Session "${session}" has start event but no active workbench directory and no migration/archive fallback.`,
		});
	}

	return warnings;
}
