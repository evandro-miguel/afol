import {
	type Dirent,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { withSessionLock } from "../io/session-lock";
import { resolveProjectPaths } from "../project/paths";
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
const STATE_BOARD_HEADER_RE =
	/^\s*\|\s*Task\s*\|\s*State\s*\|\s*Owner\s*\|\s*Notes\s*\|?\s*$/i;
const TASK_ROW_RE =
	/^\s*\|\s*(T-\d{2,3})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(.*?)\s*\|?\s*$/;
const TASK_TABLE_SEPARATOR_RE =
	/^\s*\|\s*-+\s*\|\s*-+\s*\|\s*-+\s*\|\s*-+\s*\|?\s*$/;
const TASK_HEADING_RE = /^#{2,6}\s+(T-\d{2,3})\b/i;
const CHECKPOINT_HEADING_RE = /^#{2,6}\s+.+checkpoint\b/i;
const FILE_CLAIM_LABEL_RE = /^\s*-\s*Files\s+(planned|touched)\s*:\s*$/i;
const NESTED_LIST_ITEM_RE = /^\s{2,}[-*]\s+(.+?)\s*$/;
const GLOB_TOKEN_RE = /[*?[\]{}]/;
const WORKBENCH_INDEX_LOCK_SESSION = "workbench-index";

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
				entry.name !== "_archive",
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

function sessionTaskFiles(sessionDir: string): string[] {
	try {
		return readdirSync(sessionDir, { withFileTypes: true })
			.filter((entry) => entry.isFile() && TASK_FILE_RE.test(entry.name))
			.map((entry) => resolve(sessionDir, entry.name))
			.sort();
	} catch {
		return [];
	}
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
): Map<string, { started: boolean; closed: boolean }> {
	const eventLog = resolveWorkbenchEventLogPath(root);
	const lifecycle = new Map<string, { started: boolean; closed: boolean }>();
	if (!existsSync(eventLog)) {
		return lifecycle;
	}

	let lines: string[];
	try {
		lines = readFileSync(eventLog, "utf8").split(/\r?\n/);
	} catch {
		return lifecycle;
	}

	for (const line of lines) {
		if (!line.trim()) {
			continue;
		}
		let raw: Record<string, unknown>;
		try {
			raw = JSON.parse(line) as Record<string, unknown>;
		} catch {
			continue;
		}
		if (!raw || typeof raw !== "object") {
			continue;
		}

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
			};
			if (workbenchType === "workbench.new") {
				state.started = true;
				state.closed = false;
			}
			if (workbenchType === "workbench.close") {
				state.closed = true;
			}
			lifecycle.set(workbenchSession, state);
		}

		if (telemetrySession) {
			const state = lifecycle.get(telemetrySession) ?? {
				started: false,
				closed: false,
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

function parseStateBoardTasks(
	session: string,
	file: string,
	lines: string[],
): Array<Omit<WorkbenchIndexTask, "planned_files" | "touched_files">> {
	const tasks: Array<
		Omit<WorkbenchIndexTask, "planned_files" | "touched_files">
	> = [];
	let stateBoard = false;
	let insideCodeBlock = false;

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		const trimmed = line.trim();
		if (!trimmed) {
			if (stateBoard) {
				stateBoard = false;
			}
			continue;
		}

		if (trimmed.startsWith("```")) {
			insideCodeBlock = !insideCodeBlock;
			continue;
		}
		if (insideCodeBlock) {
			continue;
		}

		if (!stateBoard && STATE_BOARD_HEADER_RE.test(trimmed)) {
			stateBoard = true;
			continue;
		}
		if (!stateBoard) {
			continue;
		}
		if (TASK_TABLE_SEPARATOR_RE.test(trimmed)) {
			continue;
		}
		if (!trimmed.startsWith("|")) {
			continue;
		}

		const match = trimmed.match(TASK_ROW_RE);
		if (!match?.[1]) {
			continue;
		}

		tasks.push({
			session,
			task_id: match[1],
			state: (match[2] ?? "").trim().toLowerCase(),
			owner: (match[3] ?? "").trim(),
			notes: (match[4] ?? "").trim(),
			file,
			line: index + 1,
			touched_at: parseTouchedAt(file),
		});
	}

	return tasks;
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

function parseTaskRows(session: string, file: string): WorkbenchIndexTask[] {
	try {
		const lines = readFileSync(file, "utf8").split("\n");
		const tasks = parseStateBoardTasks(session, file, lines);
		const parsedClaims = parseTaskClaims(
			lines,
			tasks.map((task) => task.task_id),
		);
		return tasks.map((task) => {
			const claims = parsedClaims.get(task.task_id) ?? emptyTaskClaims();
			return {
				...task,
				planned_files: dedupeClaims(claims.planned_files),
				touched_files: dedupeClaims(claims.touched_files),
			};
		});
	} catch {
		return [];
	}
}

function summarizeSession(
	session: string,
	tasks: WorkbenchIndexTask[],
): WorkbenchIndexSession {
	const completed = tasks.filter((task) => task.state === "done").length;
	const problem = tasks.filter((task) => task.state === "problem").length;
	const open = tasks.filter(
		(task) => task.state !== "done" && task.state !== "moved",
	).length;
	return {
		session,
		task_count: tasks.length,
		completed,
		open,
		problem,
		touched_at:
			tasks.length > 0 ? (tasks.at(-1)?.touched_at ?? ZERO_TIME) : ZERO_TIME,
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

	for (const session of sessions) {
		const sessionDir = resolve(wbRoot, session);
		if (!existsSync(sessionDir)) {
			continue;
		}
		const sessionTasks: WorkbenchIndexTask[] = [];

		for (const file of sessionTaskFiles(sessionDir)) {
			sessionTasks.push(...parseTaskRows(session, file));
		}

		snapshotSessions.push(summarizeSession(session, sessionTasks));
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
	writeFileSync(indexPath, `${JSON.stringify(snapshot)}\n`, "utf8");
	return snapshot;
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
		if (
			parsed.kind !== "workbench_index_v1" ||
			parsed.version !== 1 ||
			typeof parsed.generated_at !== "string" ||
			!Array.isArray(parsed.sessions) ||
			!Array.isArray(parsed.tasks) ||
			typeof parsed.source !== "object" ||
			parsed.source === null
		) {
			return null;
		}
		return normalizeWorkbenchSnapshot(parsed as WorkbenchIndexSnapshotInput);
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
		} catch {}
	}
	return latest;
}

function latestSourceMtime(root: string): number {
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

	for (const session of collectSessionIds(root)) {
		latest = Math.max(latest, sessionSourceLatestTime(root, session));
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

function isIsoDate(value: unknown): boolean {
	return Number.isFinite(Date.parse(value as string));
}

export function rebuildWorkBenchIndex(
	root: string,
	sessionScope?: string,
	options: WorkbenchIndexRebuildOptions = {},
): WorkbenchIndexSnapshot {
	options.beforeWrite?.(sessionScope);
	return withSessionLock(root, WORKBENCH_INDEX_LOCK_SESSION, () => {
		const current = loadWorkBenchIndexSnapshot(root);

		if (sessionScope) {
			const targetSnapshot = buildSessionsSnapshot(root, [sessionScope]);
			const hasSession = sessionDirExists(root, sessionScope);

			const existingTasks = current?.tasks ?? [];
			const existingSessions = current?.sessions ?? [];

			if (!hasSession) {
				const filtered = {
					...(current ?? emptySnapshot(root)),
					generated_at: formatFreshTimestamp(root),
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
				generated_at: formatFreshTimestamp(root),
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

export function validateWorkBenchIndex(root: string): {
	ok: boolean;
	message: string;
} {
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

	const generatedAt = Date.parse(snapshot.generated_at);
	const sourceLatest = latestSourceMtime(root);
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
	type: "duplicate_theme" | "stale_open_tasks" | "missing_session_directory";
	session: string;
	message: string;
};

export function detectSessionHealth(root: string): SessionHealthWarning[] {
	const warnings: SessionHealthWarning[] = [];
	const allSessionIds = collectSessionIds(root);
	const lifecycle = collectSessionLifecycleEvents(root);
	const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
	const now = Date.now();

	// Detect duplicate themes (same suffix after timestamp prefix)
	const themeToSessions = new Map<string, string[]>();
	for (const session of allSessionIds) {
		const theme = session.replace(/^\d{6}_\d{4}_/, "");
		const existing = themeToSessions.get(theme) ?? [];
		existing.push(session);
		themeToSessions.set(theme, existing);
	}
	for (const [theme, sessions] of themeToSessions) {
		if (sessions.length > 1) {
			warnings.push({
				type: "duplicate_theme",
				session: sessions.join(", "),
				message: `Duplicate session theme: "${theme}" appears in ${sessions.length} sessions: ${sessions.join(", ")}`,
			});
		}
	}

	// Detect stale open tasks (>7 days since last touched)
	const wbRoot = resolveWorkbenchRoot(root);
	for (const session of allSessionIds) {
		const sessionDir = resolve(wbRoot, session);
		if (!existsSync(sessionDir)) {
			continue;
		}
		const taskFiles = sessionTaskFiles(sessionDir);
		if (taskFiles.length === 0) {
			continue;
		}

		let hasOpen = false;
		let touchedAt = 0;
		for (const file of taskFiles) {
			const tasks = parseTaskRows(session, file);
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
