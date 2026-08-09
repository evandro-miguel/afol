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
			return `afol st ${taskId(ctx)}`;
		case "start":
			return `afol d ${taskId(ctx)} -x "<cmd>"`;
		case "evidence":
			return `afol d ${taskId(ctx)}`;
		case "done":
			return "afol c";
		case "close":
		case "quick-task":
			return "afol status";
		case "log":
			return `afol d ${taskId(ctx)} -x "<cmd>"`;
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
			return "afol n <theme> [-F <F-id>] [-P <spec-id>] [-t <summary>]";
		case "start":
			return `afol st ${taskId(ctx)}`;
		case "evidence":
			return `afol e ${taskId(ctx)} -c "<cmd>" -o passed`;
		case "done":
			return `afol d ${taskId(ctx)} -x "<cmd>"`;
		case "close":
			return `afol session show --session ${sessionId(ctx)}`;
		case "log":
			return `afol l -m "<text>"`;
		case "quick-task":
			return `afol qt <theme> -c "<cmd>" [--no-spec-required --reason "<reason>"]`;
		case "session-show":
			return `afol session show --session ${sessionId(ctx)}`;
	}
}
