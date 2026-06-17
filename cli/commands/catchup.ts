import { envelopeOk, stringifyEnvelope } from "../core/envelope";
import {
	type CatchupReport,
	computeCatchup,
} from "../services/workbench/catchup";
import { type CommandIo, DEFAULT_IO } from "./io";

function parseCatchupArgs(args: string[]): {
	json: boolean;
	session: string | null;
} {
	let json = false;
	let session: string | null = null;
	const values = [...args];
	if (values[0] === "catchup") {
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
				throw new Error("Missing value for --session in catchup.");
			}
			session = next;
			index += 1;
			continue;
		}
		throw new Error(`Unknown catchup argument: ${value}`);
	}

	return { json, session };
}

function formatArtifact(
	name: string,
	artifact: CatchupReport["artifacts"][keyof CatchupReport["artifacts"]],
): string {
	return `${name}: ${artifact.present ? "present" : "missing"} mtime=${artifact.mtime ?? "none"} lines=${artifact.lines}`;
}

function formatCatchup(report: CatchupReport): string {
	const changed = report.git_changed_files.length;
	const changedLabel = report.git_changed_files_overflow
		? `${changed}+`
		: String(changed);
	const lines = [
		`session: ${report.session ?? "none"} (${report.session_status})`,
		`branch: ${report.git_branch ?? "none"}`,
		`changed_files: ${changedLabel}`,
		formatArtifact("plan", report.artifacts.plan),
		formatArtifact("task", report.artifacts.task),
		formatArtifact("log", report.artifacts.log),
		formatArtifact("report", report.artifacts.report),
		`freshness: findings_stale=${report.freshness.findings_stale ? "yes" : "no"} log_behind_diff=${report.freshness.log_behind_diff ? "yes" : "no"}`,
		`notes: ${report.freshness.notes.join("; ")}`,
		`next_step: ${report.next_step}`,
	];
	return lines.join("\n");
}

export async function runCatchupCommand(
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	let parsed: { json: boolean; session: string | null };
	try {
		parsed = parseCatchupArgs(args);
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}

	try {
		const report =
			parsed.session === null
				? computeCatchup(projectRoot, {})
				: computeCatchup(projectRoot, { session: parsed.session });
		if (parsed.json) {
			io.stdout(
				stringifyEnvelope(
					envelopeOk<CatchupReport>(report, { action: "catchup" }),
				),
			);
			return 0;
		}
		io.stdout(formatCatchup(report));
		return 0;
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}
}
