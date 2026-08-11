import { envelopeOk, stringifyEnvelope } from "../core/envelope";
import {
	type OperationContext,
	requiresApproval,
	resolveOperationContext,
} from "../core/operation-context";
import {
	applyCatchupRepair,
	type CatchupReport,
	computeCatchup,
} from "../services/workbench/catchup";
import { type CommandIo, DEFAULT_IO } from "./io";

function resolveCatchupContext(ctx?: OperationContext): OperationContext {
	if (ctx) {
		return ctx;
	}
	// main currently does not thread operationCtx into catchup; re-resolve from
	// env/TTY so AFOL_AGENT / non-interactive callers still hit approval gates.
	return resolveOperationContext(
		[],
		process.env,
		Boolean(process.stdin.isTTY && process.stderr.isTTY),
	).ctx;
}

function parseCatchupArgs(args: string[]): {
	json: boolean;
	session: string | null;
	fix: boolean;
} {
	let json = false;
	let session: string | null = null;
	let fix = false;
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
		if (value === "--fix") {
			fix = true;
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

	return { json, session, fix };
}

function formatArtifact(
	name: string,
	artifact: CatchupReport["artifacts"][keyof CatchupReport["artifacts"]],
): string {
	return `${name}: ${artifact.present ? "present" : "missing"} mtime=${artifact.mtime ?? "none"} lines=${artifact.lines}`;
}

function formatRepair(report: CatchupReport): string[] {
	const repair = report.repair;
	if (!repair) {
		return [];
	}
	const lines = [
		`repair: applied=${repair.applied ? "yes" : "no"} mutated=${repair.mutated ? "yes" : "no"}`,
	];
	if (repair.unbound.length > 0) {
		lines.push(
			`  unbound: ${repair.unbound
				.map((item) => `${item.session}(${item.state})`)
				.join(", ")}`,
		);
	} else {
		lines.push("  unbound: none");
	}
	lines.push(`  rebound: ${repair.rebound ?? "none"}`);
	if (repair.skipped.length > 0) {
		lines.push(
			`  skipped: ${repair.skipped
				.map((item) =>
					item.session ? `${item.session}: ${item.reason}` : item.reason,
				)
				.join("; ")}`,
		);
	} else {
		lines.push("  skipped: none");
	}
	return lines;
}

export function formatCatchup(report: CatchupReport): string {
	const changed = report.git_changed_files.length;
	const countLabel = report.git_changed_files_overflow
		? `${changed}+`
		: String(changed);
	const changedLabel = report.git_changed_files_degraded
		? `${countLabel} (degraded)`
		: countLabel;
	const lines = [
		`session: ${report.session ?? "none"} (${report.session_status})`,
		`branch: ${report.git_branch ?? "none"}`,
		`changed_files: ${changedLabel}`,
		formatArtifact("plan", report.artifacts.plan),
		formatArtifact("task", report.artifacts.task),
		formatArtifact("log", report.artifacts.log),
		formatArtifact("report", report.artifacts.report),
		`freshness: findings_stale=${report.freshness.findings_stale ? "yes" : "no"} log_behind_diff=${report.freshness.log_behind_diff ? "yes" : "no"}`,
		`pending_spec_open: ${report.pending_spec_open ?? 0}`,
		`notes: ${report.freshness.notes.join("; ")}`,
		...formatRepair(report),
		`next_step: ${report.next_step}`,
	];
	return lines.join("\n");
}

export async function runCatchupCommand(
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
	ctx?: OperationContext,
): Promise<number> {
	let parsed: { json: boolean; session: string | null; fix: boolean };
	try {
		parsed = parseCatchupArgs(args);
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}

	try {
		const operationCtx = resolveCatchupContext(ctx);
		if (parsed.fix && requiresApproval(operationCtx)) {
			throw new Error("catchup --fix requires local interactive approval");
		}

		const repair = parsed.fix ? applyCatchupRepair(projectRoot) : undefined;
		const report =
			parsed.session === null
				? computeCatchup(projectRoot, repair ? { repair } : undefined)
				: computeCatchup(projectRoot, {
						session: parsed.session,
						...(repair ? { repair } : {}),
					});

		const action = parsed.fix ? "catchup.fix" : "catchup";
		if (parsed.json) {
			io.stdout(
				stringifyEnvelope(envelopeOk<CatchupReport>(report, { action })),
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
