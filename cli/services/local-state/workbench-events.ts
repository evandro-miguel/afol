import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveProjectPaths } from "../project/paths";

export type WorkbenchEventKind =
	| "workbench.new"
	| "workbench.start_task"
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
	return resolveProjectPaths(resolve(root)).abs.eventsFile;
}

const WORKBENCH_EVENT_ID_PREFIX = "WSE-";
let eventCounter = 0;

function nextEventId(now: Date): string {
	eventCounter = (eventCounter + 1) % 1_000_000;
	return `${WORKBENCH_EVENT_ID_PREFIX}${now.getTime()}-${eventCounter.toString().padStart(6, "0")}`;
}

export function appendWorkbenchEvent(
	root: string,
	event: Omit<WorkbenchEvent, "id" | "ts" | "source"> & {
		detail?: Record<string, unknown>;
	},
): WorkbenchEvent {
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
}

export function hasEventLog(root: string): boolean {
	return existsSync(resolveWorkbenchEventLogPath(root));
}
