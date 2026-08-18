import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	envelopeErr,
	envelopeOk,
	envelopeWithLegacyKeys,
	type ResultEnvelope,
	stringifyEnvelope,
} from "../core/envelope";
import {
	beginHotPathMeasurement,
	countHotPathOperation,
} from "../services/hot-path/instrumentation";
import {
	collectSessionIds,
	detectSessionHealth,
	loadWorkBenchIndexSnapshot,
} from "../services/local-state/workbench-index";
import {
	type ProjectConfigSource,
	resolveProjectPaths,
} from "../services/project/paths";
import {
	type LoadedProjectRoot,
	loadProjectRoot,
} from "../services/project/root";
import { collectGlobalStatusFindings } from "../services/status/global-findings";
import {
	type CatchupReport,
	computeCatchup,
} from "../services/workbench/catchup";
import { sessionLifecycleState } from "../services/workbench/lifecycle";
import {
	defaultAllowGlobalFallback,
	resolveSession as resolveEffectiveSession,
} from "../services/workbench/session-context";
import { type CommandIo, DEFAULT_IO } from "./io";

type StatusSnapshot = {
	status: string;
	task: string;
	filesWritten: string[];
	validationOrChecks: string[];
	blockers: string[];
	next: string[];
	warnings: string[];
	configPath: string;
	configSource: ProjectConfigSource;
	lockPath: string;
	activeSessionPath: string;
	taskFilePath?: string;
	problemReason?: string;
	safeNextAction?: string;
	sessionCount?: number | null;
	sessionHealth?: string[];
	catchup: CatchupReport | undefined;
};

type StatusSessionInfo = {
	id: string;
	status: string;
	changed_files: number;
	git_changed_files_overflow: boolean;
	git_changed_files_degraded: boolean;
	freshness: CatchupReport["freshness"];
	next_step: string;
};

type StatusJsonData = {
	status: string;
	task: string;
	files_written: string[];
	validation_or_checks: string[];
	blockers: string[];
	next: string[];
	session_count: number | null;
	session_health_warnings: string[];
	paths: {
		config: string;
		config_source: ProjectConfigSource;
		lock: string;
		active_session: string;
		task_file: string | null;
	};
	session: StatusSessionInfo | undefined;
	warnings: string[];
	problem_reason?: string;
	safe_next_action?: string;
};

const FIELD_HEADERS = [
	"STATUS",
	"TASK",
	"FILES_WRITTEN",
	"VALIDATION_OR_CHECKS",
	"BLOCKERS",
	"NEXT",
];
const TASK_ROW_RE =
	/^\|\s*(T-\d{2,3})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(.*?)\s*\|$/;
const TASK_STATE_PRIORITY: Record<string, number> = {
	in_progress: 0,
	problem: 1,
	implemented_untested: 2,
	tested_needs_spec_validation: 3,
	pending: 4,
	done: 50,
	moved: 60,
};

type TaskBoardRow = {
	taskId: string;
	state: string;
	notes: string;
};

type StatusCommandError = Error & {
	code?: number;
	errorCode?: string;
};

let computeCatchupImpl = computeCatchup;
let computeHealthImpl = computeSessionHealth;

export function setCatchupComputerForTests(
	computer: typeof computeCatchup | null,
): void {
	computeCatchupImpl = computer ?? computeCatchup;
}

export function setHealthComputerForTests(
	computer: typeof computeSessionHealth | null,
): void {
	computeHealthImpl = computer ?? computeSessionHealth;
}

function taskNotFoundError(taskId: string, session: string | null): Error {
	const error = new Error(
		`error: task-not-found task_id=${taskId}${
			session ? ` session=${session}` : ""
		}`,
	) as StatusCommandError;
	error.code = 1;
	error.errorCode = "task-not-found";
	return error;
}

function writeStatusError(
	error: unknown,
	json: boolean,
	io: CommandIo,
): number {
	const commandError = error as StatusCommandError;
	const exitCode =
		typeof commandError.code === "number" ? commandError.code : 2;
	const message = commandError.message ?? String(error);
	if (json) {
		io.stdout(
			stringifyEnvelope(
				envelopeErr(commandError.errorCode ?? "status.error", message, {
					action: "status",
					exitCode,
				}),
			),
		);
	} else {
		io.stderr(message);
	}
	return exitCode;
}

function parseStatusArgs(args: string[]): {
	json: boolean;
	session: string | null;
	health: boolean;
	catchup: boolean;
	taskId: string | null;
} {
	let json = false;
	let session: string | null = null;
	let health = false;
	let catchup = false;
	let taskId: string | null = null;
	const values = [...args];
	if (values[0] === "status") {
		values.shift();
	}

	for (let index = 0; index < values.length; index += 1) {
		const value = values[index];
		if (!value) {
			continue;
		}
		if (value === "--json" || value === "-j") {
			json = true;
			continue;
		}
		if (value === "--session" || value === "-S") {
			const next = values[index + 1];
			if (!next || next.startsWith("-")) {
				throw new Error("Missing value for --session in status.");
			}
			session = next;
			index += 1;
			continue;
		}
		if (value === "--health") {
			health = true;
			continue;
		}
		if (value === "--catchup") {
			catchup = true;
			continue;
		}
		if (value === "--task-id") {
			const next = values[index + 1];
			if (!next || next.startsWith("-")) {
				throw new Error("Missing value for --task-id in status.");
			}
			taskId = next;
			index += 1;
			continue;
		}
		if (value.startsWith("-")) {
			throw new Error(`Unknown status argument: ${value}`);
		}
		if (!taskId) {
			taskId = value;
			continue;
		}
		throw new Error(`Unexpected status argument: ${value}`);
	}

	return { json, session, health, catchup, taskId };
}

function resultEnvelope<T extends Record<string, unknown>>(
	data: T,
	action: string,
	exitCode: number,
): ResultEnvelope<T> {
	return exitCode === 0
		? envelopeOk(data, { action, exitCode })
		: {
				schema: "afol.result/v1",
				ok: false,
				action,
				exit_code: exitCode,
				data,
			};
}

function parseFrontmatter(text: string): Record<string, string> {
	const match = /^---\n([\s\S]*?)\n---/m.exec(text);
	if (!match?.[1]) {
		return {};
	}

	const frontmatter: Record<string, string> = {};
	for (const line of match[1].split(/\r?\n/)) {
		const separatorIndex = line.indexOf(":");
		if (separatorIndex <= 0) {
			continue;
		}
		const key = line.slice(0, separatorIndex).trim();
		const value = line.slice(separatorIndex + 1).trim();
		if (!key || !value) {
			continue;
		}
		frontmatter[key] = value;
	}
	return frontmatter;
}

function normalizeList(values: string[]): string[] {
	const normalized = values
		.map((value) => value.trim())
		.filter((value) => value.length > 0 && value.toLowerCase() !== "none");
	return normalized.length > 0 ? normalized : ["none"];
}

function compactSafeAction(values: string[]): string | undefined {
	const normalized = values
		.map((value) => value.trim())
		.filter((value) => value.length > 0 && value.toLowerCase() !== "none");
	return normalized.length > 0 ? (normalized[0] ?? undefined) : undefined;
}

function compactProblemReason(
	status: string,
	boardNotes?: string,
): string | undefined {
	if (status === "problem") {
		const canonicalNote = taskReasonFromNotes(boardNotes ?? "");
		if (canonicalNote) {
			return canonicalNote;
		}
		return undefined;
	}
	if (status === "corrupt") {
		return "active session state is corrupt";
	}
	return undefined;
}

function compactSafeNextAction(next: string[]): string | undefined {
	return compactSafeAction(next);
}

function extractFieldList(
	content: string,
	label: "FILES_WRITTEN" | "VALIDATION_OR_CHECKS" | "BLOCKERS" | "NEXT",
): string[] {
	const lines = content.split(/\r?\n/);
	const prefix = `${label}:`;

	for (let index = 0; index < lines.length; index += 1) {
		const rawLine = lines[index];
		if (!rawLine) {
			continue;
		}
		if (!rawLine.trim().startsWith(prefix)) {
			continue;
		}

		const values: string[] = [];
		const inlineValue = rawLine.trim().slice(prefix.length).trim();
		if (inlineValue.length > 0) {
			values.push(inlineValue);
		}

		for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
			const line = lines[cursor] ?? "";
			const trimmed = line.trim();
			if (trimmed.length === 0) {
				if (values.length > 0) {
					break;
				}
				continue;
			}
			const headerName = trimmed.endsWith(":") ? trimmed.slice(0, -1) : "";
			if (FIELD_HEADERS.includes(headerName)) {
				break;
			}
			if (trimmed.startsWith("- ")) {
				const entry = trimmed.slice(2).trim();
				if (entry.length > 0) {
					values.push(entry);
				}
				continue;
			}
			if (/^[A-Z_]+:/.test(trimmed)) {
				break;
			}
			values.push(trimmed);
			break;
		}

		return normalizeList(values);
	}

	return ["none"];
}

function extractTaskId(
	content: string,
	frontmatter: Record<string, string>,
	fileName: string,
): string {
	const fromFrontmatter = frontmatter.task_id ?? frontmatter.id;
	if (fromFrontmatter && fromFrontmatter.trim().length > 0) {
		return fromFrontmatter.trim();
	}

	const fromContent = /\bT-\d+\b/.exec(content)?.[0];
	if (fromContent) {
		return fromContent;
	}

	const fromFileName = /_task_(\d+)\.md$/.exec(fileName)?.[1];
	if (fromFileName) {
		return `T-${fromFileName.padStart(2, "0")}`;
	}

	return "none";
}

function extractTaskState(content: string, taskId: string): string | null {
	for (const line of content.split(/\r?\n/)) {
		const match = line.trim().match(TASK_ROW_RE);
		if (!match || match[1] !== taskId) {
			continue;
		}
		return (match[2] ?? "").trim() || null;
	}
	return null;
}

function parseTaskBoardRows(content: string): TaskBoardRow[] {
	const rows: TaskBoardRow[] = [];
	for (const line of content.split(/\r?\n/)) {
		const match = line.trim().match(TASK_ROW_RE);
		if (!match?.[1]) {
			continue;
		}
		rows.push({
			taskId: match[1],
			state: (match[2] ?? "").trim(),
			notes: (match[4] ?? "").trim(),
		});
	}
	return rows;
}

function taskReasonFromNotes(notes: string): string | undefined {
	const encoded = /(?:^|\s)reason=([^\s]+)/.exec(notes)?.[1];
	if (!encoded) {
		return undefined;
	}
	try {
		const reason = decodeURIComponent(encoded).trim();
		return reason.length > 0 ? reason : undefined;
	} catch {
		return undefined;
	}
}

function taskStatePriority(state: string): number {
	const normalized = state.trim().toLowerCase();
	return TASK_STATE_PRIORITY[normalized] ?? 10;
}

function selectTaskId(
	content: string,
	frontmatter: Record<string, string>,
	fileName: string,
	requestedTaskId?: string | null,
): string {
	if (requestedTaskId) {
		return requestedTaskId;
	}

	const taskRows = parseTaskBoardRows(content);
	const selected = [...taskRows]
		.sort((left, right) => {
			const priorityDelta =
				taskStatePriority(left.state) - taskStatePriority(right.state);
			return priorityDelta !== 0
				? priorityDelta
				: left.taskId.localeCompare(right.taskId);
		})
		.at(0);
	if (selected) {
		return selected.taskId;
	}

	return extractTaskId(content, frontmatter, fileName);
}

function pickTaskFile(
	projectRoot: string,
	activeSession: string,
	taskId?: string | null,
): string | null {
	const sessionDir = join(
		resolveProjectPaths(projectRoot).abs.wbDir,
		activeSession,
	);
	if (!existsSync(sessionDir)) {
		return null;
	}

	const taskFiles = readdirSync(sessionDir)
		.filter((name) => name.includes("_task_") && name.endsWith(".md"))
		.sort();

	if (taskFiles.length === 0) {
		return null;
	}

	if (taskId) {
		const targetTaskId = taskId.toLowerCase();
		for (const name of taskFiles) {
			const path = join(sessionDir, name);
			const content = readFileSync(path, "utf8");
			const fileTaskId = extractTaskId(
				content,
				parseFrontmatter(content),
				name,
			).toLowerCase();
			const hasTaskRow = parseTaskBoardRows(content).some(
				(row) => row.taskId.toLowerCase() === targetTaskId,
			);
			if (fileTaskId === targetTaskId || hasTaskRow) {
				return path;
			}
		}
		return null;
	}

	for (const name of taskFiles) {
		const path = join(sessionDir, name);
		const content = readFileSync(path, "utf8");
		const status = parseFrontmatter(content).status?.toLowerCase();
		if (status && status !== "done" && status !== "moved") {
			return path;
		}
	}

	const first = taskFiles[0];
	return first ? join(sessionDir, first) : null;
}

function computeSessionHealth(
	projectRoot: string,
	workbenchSnapshot = loadWorkBenchIndexSnapshot(projectRoot),
): {
	sessionCount: number | null;
	sessionHealth: string[];
} {
	try {
		const sessions =
			workbenchSnapshot?.sessions ?? collectSessionIds(projectRoot);
		const warnings = detectSessionHealth(
			projectRoot,
			workbenchSnapshot ? { workbenchSnapshot } : {},
		);
		return {
			sessionCount: sessions.length,
			sessionHealth: warnings.map((w) => w.message),
		};
	} catch {
		return {
			sessionCount: null,
			sessionHealth: ["unavailable: session health collection failed"],
		};
	}
}

function defaultSessionCount(
	projectRoot: string,
	workbenchSnapshot = loadWorkBenchIndexSnapshot(projectRoot),
): number {
	return workbenchSnapshot?.sessions.length ?? 0;
}

function mergeStatusEntries(current: string[], additions: string[]): string[] {
	return normalizeList([...current, ...additions]);
}

function formatFreshness(report: CatchupReport): string {
	const changedFiles = report.git_changed_files.length;
	if (
		!report.git_changed_files_degraded &&
		!report.freshness.findings_stale &&
		!report.freshness.log_behind_diff &&
		changedFiles === 0
	) {
		return "freshness: ok";
	}

	return `freshness: findings_stale=${report.freshness.findings_stale ? "yes" : "no"} log_behind_diff=${report.freshness.log_behind_diff ? "yes" : "no"} changed_files=${changedFiles} degraded=${report.git_changed_files_degraded ? "yes" : "no"} overflow=${report.git_changed_files_overflow ? "yes" : "no"} next=${JSON.stringify(report.next_step)}`;
}

function readStatusSnapshot(
	projectRoot: string,
	freshnessSession: string | null,
	taskId: string | null,
	includeHealthFindings: boolean,
	includeCatchup: boolean,
	loadedProject?: LoadedProjectRoot,
): StatusSnapshot {
	let project: LoadedProjectRoot;
	if (loadedProject) {
		project = loadedProject;
	} else {
		const loaded = loadProjectRoot(projectRoot);
		if (!loaded.ok) {
			const error = new Error(loaded.error.message);
			(error as Error & { code?: number }).code = loaded.error.code;
			throw error;
		}
		project = loaded.value;
	}

	const projectPaths = resolveProjectPaths(project.root);
	const lockPath = projectPaths.abs.lockFile;
	const activeSessionPath = projectPaths.abs.activeSessionFile;
	const workbenchSnapshot = loadWorkBenchIndexSnapshot(project.root);

	let healthInfo: Pick<StatusSnapshot, "sessionCount" | "sessionHealth"> = {
		sessionCount: defaultSessionCount(project.root, workbenchSnapshot),
	};
	if (includeHealthFindings) {
		try {
			countHotPathOperation("status.health");
			healthInfo = computeHealthImpl(project.root, workbenchSnapshot);
		} catch {
			healthInfo = {
				sessionCount: null,
				sessionHealth: ["unavailable: session health collection failed"],
			};
		}
	}
	const globalFindings = includeHealthFindings
		? collectGlobalStatusFindings(project.root)
		: [];
	const warnings = globalFindings.map((finding) =>
		finding.next
			? `${finding.validation} (next: ${finding.next})`
			: finding.validation,
	);
	const selectedSession =
		resolveEffectiveSession(project.root, {
			...(freshnessSession ? { explicit: freshnessSession } : {}),
			allowGlobalFallback: defaultAllowGlobalFallback(),
		})?.session ?? null;
	const catchupSession = selectedSession;
	const catchupReport = includeCatchup
		? (() => {
				countHotPathOperation("status.catchup");
				return catchupSession
					? computeCatchupImpl(project.root, { session: catchupSession })
					: computeCatchupImpl(project.root, {});
			})()
		: undefined;

	if (!selectedSession) {
		if (taskId) {
			throw taskNotFoundError(taskId, null);
		}
		return {
			status: "none",
			task: "none",
			filesWritten: ["none"],
			validationOrChecks: mergeStatusEntries(["none"], []),
			blockers: ["none"],
			next: mergeStatusEntries(["none"], []),
			warnings,
			configPath: project.configPath,
			configSource: project.configSource,
			lockPath,
			activeSessionPath,
			...healthInfo,
			catchup: catchupReport,
		};
	}

	const taskFilePath = pickTaskFile(project.root, selectedSession, taskId);
	if (!taskFilePath) {
		if (taskId) {
			throw taskNotFoundError(taskId, selectedSession);
		}
		const status =
			sessionLifecycleState(project.root, selectedSession) === "corrupt"
				? "corrupt"
				: "none";
		const problemReason = compactProblemReason(status);
		const safeNextAction = compactSafeNextAction(["none"]);
		return {
			status,
			task: "none",
			filesWritten: ["none"],
			validationOrChecks: mergeStatusEntries(["none"], []),
			blockers: ["missing canonical task file"],
			next: mergeStatusEntries(["none"], []),
			warnings,
			...(problemReason ? { problemReason } : {}),
			...(safeNextAction ? { safeNextAction } : {}),
			configPath: project.configPath,
			configSource: project.configSource,
			lockPath,
			activeSessionPath,
			...healthInfo,
			catchup: catchupReport,
		};
	}

	const content = readFileSync(taskFilePath, "utf8");
	const frontmatter = parseFrontmatter(content);
	const fileName = taskFilePath.split("/").at(-1) ?? "";
	const task = selectTaskId(content, frontmatter, fileName, taskId);
	const status =
		extractTaskState(content, task) ?? frontmatter.status?.trim() ?? "none";
	const taskRowNotes = parseTaskBoardRows(content).find(
		(row) => row.taskId === task,
	)?.notes;
	const problemReason = compactProblemReason(status, taskRowNotes);
	const safeNextAction = compactSafeNextAction(
		extractFieldList(content, "NEXT"),
	);

	return {
		status,
		task,
		filesWritten: extractFieldList(content, "FILES_WRITTEN"),
		validationOrChecks: mergeStatusEntries(
			extractFieldList(content, "VALIDATION_OR_CHECKS"),
			[],
		),
		blockers: extractFieldList(content, "BLOCKERS"),
		warnings,
		next: mergeStatusEntries(extractFieldList(content, "NEXT"), []),
		...(problemReason ? { problemReason } : {}),
		...(safeNextAction ? { safeNextAction } : {}),
		configPath: project.configPath,
		configSource: project.configSource,
		lockPath,
		activeSessionPath,
		taskFilePath,
		...healthInfo,
		catchup: catchupReport,
	};
}

function formatCompact(snapshot: StatusSnapshot): string {
	const lines = [
		`STATUS: ${snapshot.status}`,
		`TASK: ${snapshot.task}`,
		"FILES_WRITTEN:",
		...snapshot.filesWritten.map((entry) => `- ${entry}`),
		"VALIDATION_OR_CHECKS:",
		...snapshot.validationOrChecks.map((entry) => `- ${entry}`),
		"BLOCKERS:",
		...snapshot.blockers.map((entry) => `- ${entry}`),
		"NEXT:",
		...snapshot.next.map((entry) => `- ${entry}`),
	];
	if (snapshot.problemReason) {
		lines.push(`PROBLEM_REASON: ${snapshot.problemReason}`);
	}
	if (snapshot.safeNextAction) {
		lines.push(`SAFE_NEXT_ACTION: ${snapshot.safeNextAction}`);
	}
	if (snapshot.warnings.length > 0) {
		lines.push("WARNINGS:");
		for (const warning of snapshot.warnings) {
			lines.push(`- ${warning}`);
		}
	}

	if (snapshot.sessionCount !== undefined) {
		if (snapshot.sessionCount === null) {
			lines.push("SESSIONS: unavailable");
		} else {
			lines.push(`SESSIONS: ${snapshot.sessionCount}`);
		}
		if (snapshot.sessionHealth && snapshot.sessionHealth.length > 0) {
			lines.push("SESSION_HEALTH_WARNINGS:");
			for (const warning of snapshot.sessionHealth) {
				lines.push(`  - ${warning}`);
			}
		}
	}

	if (snapshot.catchup) {
		lines.push(formatFreshness(snapshot.catchup));
	}

	return lines.join("\n");
}

export function runStatusCommand(
	projectRoot: string,
	args: string[],
	io: CommandIo = DEFAULT_IO,
	loadedProject?: LoadedProjectRoot,
): number {
	const finishMeasurement = beginHotPathMeasurement("status");
	let parsed: {
		json: boolean;
		session: string | null;
		health: boolean;
		catchup: boolean;
		taskId: string | null;
	};
	try {
		parsed = parseStatusArgs(args);
	} catch (error) {
		return writeStatusError(
			error,
			args.includes("--json") || args.includes("-j"),
			io,
		);
	}

	let snapshot: StatusSnapshot;
	try {
		snapshot = readStatusSnapshot(
			projectRoot,
			parsed.session,
			parsed.taskId,
			parsed.health,
			parsed.catchup,
			loadedProject,
		);
	} catch (error) {
		return writeStatusError(error, parsed.json, io);
	}

	if (parsed.json) {
		const data: StatusJsonData = {
			status: snapshot.status,
			task: snapshot.task,
			files_written: snapshot.filesWritten,
			validation_or_checks: snapshot.validationOrChecks,
			warnings: snapshot.warnings,
			blockers: snapshot.blockers,
			next: snapshot.next,
			session_count: snapshot.sessionCount ?? null,
			session_health_warnings: snapshot.sessionHealth ?? [],
			paths: {
				config: snapshot.configPath,
				config_source: snapshot.configSource,
				lock: snapshot.lockPath,
				active_session: snapshot.activeSessionPath,
				task_file: snapshot.taskFilePath ?? null,
			},
			session: snapshot.catchup
				? {
						id: snapshot.catchup.session ?? "none",
						status: snapshot.catchup.session_status,
						changed_files: snapshot.catchup.git_changed_files.length,
						git_changed_files_overflow:
							snapshot.catchup.git_changed_files_overflow,
						git_changed_files_degraded:
							snapshot.catchup.git_changed_files_degraded,
						freshness: snapshot.catchup.freshness,
						next_step: snapshot.catchup.next_step,
					}
				: undefined,
		};
		if (snapshot.problemReason) {
			data.problem_reason = snapshot.problemReason;
		}
		if (snapshot.safeNextAction) {
			data.safe_next_action = snapshot.safeNextAction;
		}

		const output = stringifyEnvelope(
			envelopeWithLegacyKeys(resultEnvelope(data, "status", 0), [
				"status",
				"task",
				"warnings",
				"files_written",
				"validation_or_checks",
				"blockers",
				"next",
				"problem_reason",
				"safe_next_action",
				"session_count",
				"session_health_warnings",
				"paths",
			]),
		);
		io.stdout(output);
		finishMeasurement(output);
		return 0;
	}

	const output = formatCompact(snapshot);
	io.stdout(output);
	finishMeasurement(output);
	return 0;
}
