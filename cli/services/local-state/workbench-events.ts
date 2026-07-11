import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { withSessionLock } from "../io/session-lock";
import { resolveProjectPaths } from "../project/paths";
import { resolveProjectWritePath } from "../project/root";

export type WorkbenchEventKind =
	| "workbench.new"
	| "workbench.start_task"
	| "workbench.transition_task"
	| "workbench.record_evidence"
	| "workbench.mark_done"
	| "workbench.append_log"
	| "workbench.close";

export type WorkbenchEvent = {
	id: string;
	type: WorkbenchEventKind;
	ts: string;
	source: "cli-workbench";
	session: string;
	taskId?: string;
	command?: string;
	result?: string;
	detail?: Record<string, unknown>;
};

export function resolveWorkbenchEventLogPath(root: string): string {
	const projectRoot = resolve(root);
	const projectPaths = resolveProjectPaths(projectRoot);
	const resolved = resolveProjectWritePath(
		projectRoot,
		projectPaths.eventsFile,
	);
	if (!resolved.ok) {
		throw new Error(resolved.error);
	}
	return resolved.value.path;
}

const WORKBENCH_EVENT_ID_PREFIX = "WSE-";
function nextEventId(now: Date): string {
	return `${WORKBENCH_EVENT_ID_PREFIX}${now.getTime()}-${randomUUID()}`;
}

export function appendWorkbenchEvent(
	root: string,
	event: Omit<WorkbenchEvent, "id" | "ts" | "source"> & {
		detail?: Record<string, unknown>;
	},
): WorkbenchEvent {
	return withSessionLock(root, event.session, () => {
		const now = new Date();
		const eventPath = resolveWorkbenchEventLogPath(root);
		const fullEvent: WorkbenchEvent = {
			id: nextEventId(now),
			ts: now.toISOString(),
			source: "cli-workbench",
			...event,
		};
		mkdirSync(resolve(eventPath, ".."), { recursive: true });
		writeFileSync(eventPath, `${JSON.stringify(fullEvent)}\n`, {
			encoding: "utf8",
			flag: "a",
		});
		return fullEvent;
	});
}

export function hasEventLog(root: string): boolean {
	return existsSync(resolveWorkbenchEventLogPath(root));
}

import { randomUUID } from "node:crypto";
