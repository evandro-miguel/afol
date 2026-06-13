import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	collectSessionIds,
	detectSessionHealth,
} from "../services/local-state/workbench-index";
import { resolveProjectPaths } from "../services/project/paths";
import { loadProjectRoot } from "../services/project/root";
import {
	envelopeOk,
	envelopeWithLegacyKeys,
	stringifyEnvelope,
	type ResultEnvelope,
} from "../core/envelope";

type CommandIo = {
	stdout: (message: string) => void;
	stderr: (message: string) => void;
};

type StatusSnapshot = {
	status: string;
	task: string;
	filesWritten: string[];
	validationOrChecks: string[];
	blockers: string[];
	next: string[];
	configPath: string;
	lockPath: string;
	activeSessionPath: string;
	taskFilePath?: string;
	sessionCount?: number;
	sessionHealth?: string[];
};

type StatusJsonData = {
	status: string;
	task: string;
	files_written: string[];
	validation_or_checks: string[];
	blockers: string[];
	next: string[];
	paths: {
		config: string;
		lock: string;
		active_session: string;
		task_file: string | null;
	};
};

const DEFAULT_IO: CommandIo = {
	stdout: (message: string) => {
		console.log(message);
	},
	stderr: (message: string) => {
		console.error(message);
	},
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

function parseStatusArgs(args: string[]): { json: boolean } {
	let json = false;
	const values = [...args];
	if (values[0] === "status") {
		values.shift();
	}

	for (const value of values) {
		if (value === "--json" || value === "-j") {
			json = true;
			continue;
		}
		if (value.startsWith("-")) {
			throw new Error(`Unknown status argument: ${value}`);
		}
		throw new Error(`Unexpected status argument: ${value}`);
	}

	return { json };
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

function pickTaskFile(
	projectRoot: string,
	activeSession: string,
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

function computeSessionHealth(projectRoot: string): {
	sessionCount: number;
	sessionHealth: string[];
} {
	try {
		const sessions = collectSessionIds(projectRoot);
		const warnings = detectSessionHealth(projectRoot);
		return {
			sessionCount: sessions.length,
			sessionHealth: warnings.map((w) => w.message),
		};
	} catch {
		return { sessionCount: 0, sessionHealth: [] };
	}
}

function readStatusSnapshot(projectRoot: string): StatusSnapshot {
	const loaded = loadProjectRoot(projectRoot);
	if (!loaded.ok) {
		const error = new Error(loaded.error.message);
		(error as Error & { code?: number }).code = loaded.error.code;
		throw error;
	}

	const projectPaths = resolveProjectPaths(loaded.value.root);
	const lockPath = projectPaths.abs.lockFile;
	const activeSessionPath = projectPaths.abs.activeSessionFile;

	const healthInfo = computeSessionHealth(loaded.value.root);

	if (!existsSync(activeSessionPath)) {
		return {
			status: "none",
			task: "none",
			filesWritten: ["none"],
			validationOrChecks: ["none"],
			blockers: ["none"],
			next: ["none"],
			configPath: loaded.value.configPath,
			lockPath,
			activeSessionPath,
			...healthInfo,
		};
	}

	const activeSession = readFileSync(activeSessionPath, "utf8").trim();
	if (!activeSession) {
		return {
			status: "none",
			task: "none",
			filesWritten: ["none"],
			validationOrChecks: ["none"],
			blockers: ["none"],
			next: ["none"],
			configPath: loaded.value.configPath,
			lockPath,
			activeSessionPath,
			...healthInfo,
		};
	}

	const taskFilePath = pickTaskFile(loaded.value.root, activeSession);
	if (!taskFilePath) {
		return {
			status: "none",
			task: "none",
			filesWritten: ["none"],
			validationOrChecks: ["none"],
			blockers: ["none"],
			next: ["none"],
			configPath: loaded.value.configPath,
			lockPath,
			activeSessionPath,
			...healthInfo,
		};
	}

	const content = readFileSync(taskFilePath, "utf8");
	const frontmatter = parseFrontmatter(content);
	const fileName = taskFilePath.split("/").at(-1) ?? "";
	const task = extractTaskId(content, frontmatter, fileName);
	const status =
		extractTaskState(content, task) ?? frontmatter.status?.trim() ?? "none";

	return {
		status,
		task,
		filesWritten: extractFieldList(content, "FILES_WRITTEN"),
		validationOrChecks: extractFieldList(content, "VALIDATION_OR_CHECKS"),
		blockers: extractFieldList(content, "BLOCKERS"),
		next: extractFieldList(content, "NEXT"),
		configPath: loaded.value.configPath,
		lockPath,
		activeSessionPath,
		taskFilePath,
		...computeSessionHealth(projectRoot),
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

	if (snapshot.sessionCount !== undefined) {
		lines.push(`SESSIONS: ${snapshot.sessionCount}`);
		if (snapshot.sessionHealth && snapshot.sessionHealth.length > 0) {
			lines.push("SESSION_HEALTH_WARNINGS:");
			for (const warning of snapshot.sessionHealth) {
				lines.push(`  - ${warning}`);
			}
		}
	}

	return lines.join("\n");
}

export function runStatusCommand(
	projectRoot: string,
	args: string[],
	io: CommandIo = DEFAULT_IO,
): number {
	let parsed: { json: boolean };
	try {
		parsed = parseStatusArgs(args);
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}

	let snapshot: StatusSnapshot;
	try {
		snapshot = readStatusSnapshot(projectRoot);
	} catch (error) {
		const commandError = error as Error & { code?: number };
		io.stderr(commandError.message);
		return commandError.code ?? 2;
	}

	if (parsed.json) {
		const data: StatusJsonData = {
			status: snapshot.status,
			task: snapshot.task,
			files_written: snapshot.filesWritten,
			validation_or_checks: snapshot.validationOrChecks,
			blockers: snapshot.blockers,
			next: snapshot.next,
			paths: {
				config: snapshot.configPath,
				lock: snapshot.lockPath,
				active_session: snapshot.activeSessionPath,
				task_file: snapshot.taskFilePath ?? null,
			},
		};
		io.stdout(
			stringifyEnvelope(
				envelopeWithLegacyKeys(
					resultEnvelope(data, "status", 0),
					[
						"status",
						"task",
						"files_written",
						"validation_or_checks",
						"blockers",
						"next",
						"paths",
					],
				),
			),
		);
		return 0;
	}

	io.stdout(formatCompact(snapshot));
	return 0;
}
