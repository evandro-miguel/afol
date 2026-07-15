export type WorkbenchHintContext = {
	session?: string;
	taskId?: string;
	command?: string;
	result?: string;
	theme?: string;
};

type LifecycleStep =
	| "new"
	| "start"
	| "evidence"
	| "done"
	| "close"
	| "log"
	| "quick-task"
	| "session-show";

function sessionId(ctx: WorkbenchHintContext): string {
	return ctx.session ?? "<session-id>";
}

function taskId(ctx: WorkbenchHintContext): string {
	return ctx.taskId ?? "T-01";
}

function escapeHint(value: string): string {
	return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export function formatHintLine(hint: string): string {
	return `hint="${escapeHint(hint)}"`;
}

export function nextCommandHint(
	step: LifecycleStep,
	ctx: WorkbenchHintContext = {},
): string {
	switch (step) {
		case "new":
			return `afol start --session ${sessionId(ctx)} --task-id ${taskId(ctx)}`;
		case "start":
			return `afol evidence --session ${sessionId(ctx)} --task-id ${taskId(ctx)} --command "<cmd>" --result passed`;
		case "evidence":
			return `afol done --session ${sessionId(ctx)} --task-id ${taskId(ctx)}`;
		case "done":
			return `afol close --session ${sessionId(ctx)}`;
		case "close":
		case "quick-task":
			return "afol status";
		case "log":
			return `afol evidence --session ${sessionId(ctx)} --task-id ${taskId(ctx)} --command "<cmd>" --result passed`;
		case "session-show":
			return `afol session show --session ${sessionId(ctx)}`;
	}
}

export function repairHintForStep(
	step: LifecycleStep,
	ctx: WorkbenchHintContext = {},
): string {
	switch (step) {
		case "new":
			return "afol new <theme> [--feature-id <F-id>] [--parent-spec <spec-id>] [--task <summary>]";
		case "start":
			return `afol start --session ${sessionId(ctx)} --task-id ${taskId(ctx)}`;
		case "evidence":
			return `afol evidence --session ${sessionId(ctx)} --task-id ${taskId(ctx)} --command "<cmd>" --result passed`;
		case "done":
			return `afol done --session ${sessionId(ctx)} --task-id ${taskId(ctx)}`;
		case "close":
			return `afol session show --session ${sessionId(ctx)}`;
		case "log":
			return `afol log --session ${sessionId(ctx)} --message "<text>"`;
		case "quick-task":
			return `afol quick-task <theme> --command "<cmd>" --no-spec-required --reason "<reason>"`;
		case "session-show":
			return `afol session show --session ${sessionId(ctx)}`;
	}
}
