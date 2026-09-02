import { existsSync, readFileSync } from "node:fs";
import { sessionPaths } from "./session-reader";

export type TaskDocument =
	| { kind: "legacy"; content: string }
	| {
			kind: "frontmatter";
			lines: string[];
			newline: "\n" | "\r\n";
			suffix: string;
	  };

export type TaskLifecycleState =
	| { kind: "open"; document: TaskDocument }
	| { kind: "closed"; closedAt: string; document: TaskDocument };

export function parseTaskDocument(
	content: string,
	taskPath: string,
): TaskDocument {
	const opening = content.match(/^---(\r?\n)/);
	if (!opening?.[1]) {
		return { kind: "legacy", content };
	}
	const newline = opening[1] as "\n" | "\r\n";
	const frontmatterStart = opening[0].length;
	const closingMarker = `${newline}---`;
	let closingStart = content.indexOf(closingMarker, frontmatterStart);
	while (closingStart >= 0) {
		const closingEnd = closingStart + closingMarker.length;
		if (
			closingEnd === content.length ||
			content.startsWith(newline, closingEnd)
		) {
			return {
				kind: "frontmatter",
				lines: content.slice(frontmatterStart, closingStart).split(/\r?\n/),
				newline,
				suffix: content.slice(closingEnd),
			};
		}
		closingStart = content.indexOf(closingMarker, closingStart + 1);
	}
	throw new Error(`Task file has malformed canonical frontmatter: ${taskPath}`);
}

export function scalarValue(
	line: string,
	key: string,
): string | null | undefined {
	const match = line.match(new RegExp(`^\\s*${key}\\s*:\\s*(.*?)\\s*$`));
	if (!match) return undefined;
	const value = match[1] ?? "";
	if (!value || value === "null" || value === "~") return null;
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1) || null;
	}
	return value;
}

function taskFrontmatterValue(
	document: TaskDocument,
	key: string,
	taskPath: string,
): string | null {
	if (document.kind === "legacy") {
		return null;
	}
	const values = document.lines
		.map((line) => scalarValue(line, key))
		.filter((value) => value !== undefined);
	if (values.length > 1) {
		throw new Error(`Task file has duplicate ${key} frontmatter: ${taskPath}`);
	}
	return values[0] ?? null;
}

function isCanonicalIsoTimestamp(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
		return false;
	}
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return false;
	}
	const rendered = parsed.toISOString();
	return rendered === value || rendered.replace(/\.000Z$/, "Z") === value;
}

export function readTaskLifecycleState(
	taskPath: string,
	session: string,
): TaskLifecycleState {
	const document = parseTaskDocument(readFileSync(taskPath, "utf8"), taskPath);
	if (document.kind === "legacy") {
		return { kind: "open", document };
	}
	const docType = taskFrontmatterValue(document, "doc_type", taskPath);
	const id = taskFrontmatterValue(document, "id", taskPath);
	const sessionId = taskFrontmatterValue(document, "session_id", taskPath);
	const status = taskFrontmatterValue(
		document,
		"status",
		taskPath,
	)?.toLowerCase();
	const updatedAt = taskFrontmatterValue(document, "updated_at", taskPath);
	const closedAt = taskFrontmatterValue(document, "closed_at", taskPath);
	const expectedId = `${session}_task_01`;

	if (docType && docType !== "workbench_task" && docType !== "task") {
		throw new Error(
			`Session ${session} has corrupt lifecycle metadata: expected a workbench task document.`,
		);
	}
	if (id && id !== expectedId) {
		throw new Error(
			`Session ${session} has corrupt lifecycle metadata: task id does not match the session.`,
		);
	}
	if (sessionId && sessionId !== session) {
		throw new Error(
			`Session ${session} has corrupt lifecycle metadata: session_id does not match the session.`,
		);
	}

	if (status !== "closed" && closedAt === null) {
		return { kind: "open", document };
	}
	if (
		docType !== "workbench_task" ||
		id !== expectedId ||
		sessionId !== session ||
		status !== "closed" ||
		closedAt === null ||
		updatedAt === null ||
		!isCanonicalIsoTimestamp(closedAt) ||
		!isCanonicalIsoTimestamp(updatedAt) ||
		new Date(updatedAt).getTime() < new Date(closedAt).getTime()
	) {
		throw new Error(
			`Session ${session} has corrupt lifecycle metadata: status, closed_at, and updated_at must form one canonical close record with updated_at at or after closed_at. Repair the task frontmatter before continuing.`,
		);
	}
	return { kind: "closed", closedAt, document };
}

export type SessionLifecycleState = "open" | "closed" | "corrupt";

export function sessionLifecycleState(
	root: string,
	session: string,
): SessionLifecycleState {
	const paths = sessionPaths(root, session);
	if (!existsSync(paths.taskPath)) {
		return "corrupt";
	}
	const state = readTaskLifecycleState(paths.taskPath, session);
	return state.kind === "closed" ? "closed" : "open";
}

export function isSessionClosed(root: string, session: string): boolean {
	return sessionLifecycleState(root, session) === "closed";
}
