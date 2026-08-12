import { isAbsolute } from "node:path";

import { envelopeErr, envelopeOk, stringifyEnvelope } from "../core/envelope";
import {
	defaultOperationContext,
	type OperationContext,
	requiresApproval,
} from "../core/operation-context";
import {
	FLEET_MAX_PROJECTS,
	type FleetCheckReport,
	type FleetProjectCheck,
	type FleetRepairReport,
	runFleetCheck,
	runFleetRepair,
} from "../services/fleet";
import { type CommandIo, DEFAULT_IO } from "./io";

type FleetSubcommand = "check" | "repair";

type ParsedFleetArgs = {
	action: FleetSubcommand;
	json: boolean;
	dryRun: boolean;
	derived: boolean;
	reason: string;
	roots: string[];
};

type FleetEnvelope = Record<string, unknown>;

type FleetCheckProjectCompact = {
	root: string;
	config_source: FleetProjectCheck["config_source"];
	classification: FleetProjectCheck["classification"];
	git: {
		state: FleetProjectCheck["git"]["state"];
		dirty_count: FleetProjectCheck["git"]["dirty_count"];
	};
	health_summary: FleetProjectCheck["health_summary"];
	template_update: {
		operation_summary: FleetProjectCheck["template_update"]["operation_summary"];
		conflict_paths_overflow: FleetProjectCheck["template_update"]["conflict_paths_overflow"];
	};
	validation: {
		failed_check_ids: FleetProjectCheck["validation"]["failed_check_ids"];
	};
	local_state: {
		checks_failed: FleetProjectCheck["local_state"]["checks_failed"];
	};
};

type FleetCheckReportCompact = Omit<FleetCheckReport, "projects"> & {
	projects: FleetCheckProjectCompact[];
};

function resolveFleetAction(value: string | undefined): FleetSubcommand {
	if (!value || value === "check") return "check";
	if (value === "repair") return "repair";
	throw new Error(`Unknown fleet action: ${value}`);
}

function parseFleetArgs(values: string[]): ParsedFleetArgs {
	const parsed: ParsedFleetArgs = {
		action: resolveFleetAction(values[0]),
		json: values.includes("-j") || values.includes("--json"),
		dryRun: false,
		derived: false,
		reason: "",
		roots: [],
	};

	for (let index = 1; index < values.length; index += 1) {
		const value = values[index];
		if (!value) continue;

		if (value === "--json" || value === "-j") {
			continue;
		}

		if (value === "--dry-run") {
			if (parsed.action !== "repair") {
				throw new Error("fleet check does not accept --dry-run.");
			}
			parsed.dryRun = true;
			continue;
		}

		if (value === "--derived") {
			if (parsed.action !== "repair") {
				throw new Error("fleet check does not accept --derived.");
			}
			parsed.derived = true;
			continue;
		}

		if (value === "--reason") {
			if (parsed.action !== "repair") {
				throw new Error("fleet check does not accept --reason.");
			}
			const next = values[index + 1];
			if (!next) {
				throw new Error("Missing value for --reason in fleet repair.");
			}
			parsed.reason = next;
			index += 1;
			continue;
		}

		if (value === "--root") {
			const next = values[index + 1];
			if (!next) {
				throw new Error("Missing value for --root in fleet command.");
			}
			if (!isAbsolute(next)) {
				throw new Error(`fleet root must be absolute: ${next}`);
			}
			parsed.roots.push(next);
			index += 1;
			continue;
		}

		if (value.startsWith("-")) {
			throw new Error(`Unknown fleet argument: ${value}`);
		}

		throw new Error(`Unexpected positional argument in fleet: ${value}`);
	}

	if (parsed.action === "check" && parsed.roots.length === 0) {
		throw new Error("fleet check requires at least one --root path.");
	}

	if (parsed.action === "repair") {
		if (!parsed.derived) {
			throw new Error("fleet repair requires --derived.");
		}
		if (parsed.roots.length !== 1) {
			throw new Error("fleet repair accepts exactly one --root path.");
		}
		if (!parsed.dryRun && !parsed.reason.trim()) {
			throw new Error("fleet repair requires --reason.");
		}
	}

	return parsed;
}

function formatProjectLines(project: FleetRepairReport["after"]): string[] {
	return [
		`  root: ${project.root}`,
		`  config_source: ${project.config_source ?? "(none)"}`,
		`  config_path: ${project.config_path ?? "(none)"}`,
		`  classification: ${project.classification} (${project.classification_reasons.join(", ")})`,
		`  health: fail=${project.health_summary.fail}, warn=${project.health_summary.warn}, info=${project.health_summary.info}, ok=${project.health_summary.ok ? "yes" : "no"}`,
		`  template_conflicts: ${project.template_update.conflict_paths.length === 0 ? "none" : project.template_update.conflict_paths.join(", ")}`,
		`  template_ops: total=${project.template_update.operation_summary.total}, conflict=${project.template_update.operation_summary.conflict}`,
		`  validation_ok: ${project.validation.ok ? "yes" : "no"} (${project.validation.failed_check_ids.join(", ") || "none"})`,
		`  git: ${project.git.state} (${project.git.dirty_count} path(s) dirty)`,
		`  local-state: ${project.local_state.checks_failed}/${project.local_state.checks.length} failed checks`,
	];
}

function formatFleetCheckReport(report: FleetCheckReport): string {
	const lines = [
		`fleet check: ${report.ok ? "ok" : "blocked"}`,
		`max_roots: ${report.max_projects}`,
		`truncated: ${report.truncated ? "yes" : "no"}`,
		`projects: ${report.projects.length}`,
	];
	for (const project of report.projects) {
		lines.push(`- ${project.root}`);
		lines.push(...formatProjectLines(project));
	}
	return lines.join("\n");
}

function formatFleetRepairReport(report: FleetRepairReport): string {
	return [
		`fleet repair ${report.mode}: ${report.root}`,
		`mode: ${report.mode}`,
		`target: ${report.target}`,
		`eligible: ${report.eligible ? "yes" : "no"}`,
		`eligibility_reason: ${report.eligibility_reason}`,
		`writes_performed: ${report.writes_performed ? "yes" : "no"}`,
		`changed: ${report.changed ? "yes" : "no"}`,
		`before_classification: ${report.before.classification}`,
		`before_reasons: ${report.before.classification_reasons.join(", ")}`,
		`after_classification: ${report.after.classification}`,
		`after_reasons: ${report.after.classification_reasons.join(", ")}`,
	].join("\n");
}

function compactFleetCheckReport(
	report: FleetCheckReport,
): FleetCheckReportCompact {
	return {
		ok: report.ok,
		max_projects: report.max_projects,
		truncated: report.truncated,
		projects: report.projects.map((project) => ({
			root: project.root,
			config_source: project.config_source,
			classification: project.classification,
			git: {
				state: project.git.state,
				dirty_count: project.git.dirty_count,
			},
			health_summary: project.health_summary,
			template_update: {
				operation_summary: project.template_update.operation_summary,
				conflict_paths_overflow:
					project.template_update.conflict_paths_overflow,
			},
			validation: {
				failed_check_ids: project.validation.failed_check_ids,
			},
			local_state: {
				checks_failed: project.local_state.checks_failed,
			},
		})),
	};
}

function formatJsonEnvelope<T extends FleetEnvelope>(
	action: string,
	data: T,
	exitCode: number,
): string {
	if (exitCode === 0) {
		return stringifyEnvelope(envelopeOk(data, { action, exitCode }));
	}

	return stringifyEnvelope({
		schema: "afol.result/v1",
		ok: false,
		action,
		exit_code: exitCode,
		data,
	});
}

function formatError(
	io: CommandIo,
	message: string,
	json: boolean,
	action: string,
	code = "FLEET_ERROR",
	exitCode = 2,
): number {
	if (json) {
		io.stdout(
			stringifyEnvelope(
				envelopeErr(code, message, {
					action,
					exitCode,
				}),
			),
		);
		return exitCode;
	}

	io.stderr(message);
	return exitCode;
}

export async function runFleetCommand(
	args: string[],
	_projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
	ctx: OperationContext = defaultOperationContext(),
): Promise<number> {
	let parsed: ParsedFleetArgs;
	try {
		parsed = parseFleetArgs(args);
	} catch (error) {
		return formatError(
			io,
			`for fleet command: ${(error as Error).message}`,
			(args.includes("--json") || args.includes("-j")) as boolean,
			"fleet",
		);
	}

	if (parsed.action === "check") {
		const report = await runFleetCheck({
			roots: parsed.roots,
			max_projects: FLEET_MAX_PROJECTS,
		});
		if (parsed.json) {
			io.stdout(
				formatJsonEnvelope(
					"fleet.check",
					compactFleetCheckReport(report),
					report.ok ? 0 : 1,
				),
			);
		} else {
			io.stdout(formatFleetCheckReport(report));
		}
		return report.ok ? 0 : 1;
	}

	if (parsed.dryRun && parsed.action !== "repair") {
		return formatError(
			io,
			"fleet check does not accept --dry-run.",
			parsed.json,
			"fleet",
		);
	}

	if (!parsed.dryRun && requiresApproval(ctx)) {
		return formatError(
			io,
			"fleet repair requires local interactive approval; pass --dry-run for preview",
			parsed.json,
			"fleet.repair.apply",
			"approval-required",
		);
	}
	const root = parsed.roots[0];
	if (!root) {
		return formatError(
			io,
			"fleet repair requires --root",
			parsed.json,
			"fleet",
		);
	}

	const report = await runFleetRepair({
		root,
		target: "derived",
		dry_run: parsed.dryRun,
		reason: parsed.reason.trim(),
	});

	if (!parsed.dryRun && (!report.eligible || !report.writes_performed)) {
		return formatError(
			io,
			`fleet repair is not eligible: ${report.eligibility_reason}`,
			parsed.json,
			"fleet.repair.apply",
			"FLEET_REPAIR_INELIGIBLE",
			1,
		);
	}

	if (parsed.json) {
		io.stdout(
			formatJsonEnvelope(
				parsed.dryRun ? "fleet.repair.preview" : "fleet.repair.apply",
				report,
				0,
			),
		);
	} else {
		const output = formatFleetRepairReport(report);
		io.stdout(parsed.dryRun ? `${output}\n--dry-run` : output);
	}
	return 0;
}
