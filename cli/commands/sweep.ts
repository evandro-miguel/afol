import { sweepDaily, sweepMonthly, sweepWeekly } from "../services/sweep";

type CommandIo = {
	stdout: (message: string) => void;
	stderr: (message: string) => void;
};

const DEFAULT_IO: CommandIo = {
	stdout: (message) => console.log(message),
	stderr: (message) => console.error(message),
};

type SweepAction = "daily" | "weekly" | "monthly";

function normalizeAction(value: string | undefined): SweepAction {
	if (!value || value === "daily") return "daily";
	if (value === "weekly") return "weekly";
	if (value === "monthly") return "monthly";
	throw new Error(`Unknown sweep action: ${value}`);
}

function parseArgs(args: string[]): boolean {
	let json = false;
	for (const value of args) {
		if (value === "--json" || value === "-j") {
			json = true;
			continue;
		}
		throw new Error(`Unknown sweep argument: ${value}`);
	}
	return json;
}

export async function runSweepCommand(
	action: string,
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	try {
		const sweepAction = normalizeAction(action);
		const json = parseArgs(args);
		const report =
			sweepAction === "daily"
				? sweepDaily(projectRoot)
				: sweepAction === "weekly"
					? sweepWeekly(projectRoot)
					: sweepMonthly(projectRoot);
		if (json) io.stdout(JSON.stringify({ ok: report.issues === 0, action: sweepAction, ...report }));
		else io.stdout([`sweep ${sweepAction}: ${report.issues === 0 ? "ok" : "issues"}`, `checked: ${report.checked}`, `issues: ${report.issues}`, ...report.actions.map((actionLine) => `- ${actionLine}`)].join("\n"));
		return report.issues === 0 ? 0 : 1;
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}
}
