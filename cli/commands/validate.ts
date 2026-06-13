import {
	envelopeErr,
	envelopeOk,
	envelopeWithLegacyKeys,
	type ResultEnvelope,
	stringifyEnvelope,
} from "../core/envelope";
import type { DriftReport } from "../services/drift";
import { runDriftCheck } from "../services/drift";
import { validateProjectStructure } from "../services/project/validate";

type CommandIo = {
	stdout: (message: string) => void;
	stderr: (message: string) => void;
};

const DEFAULT_IO: CommandIo = {
	stdout: (message: string) => {
		console.log(message);
	},
	stderr: (message: string) => {
		console.error(message);
	},
};

type ValidationCheck = {
	id: string;
	ok: boolean;
	message: string;
};

type ValidationReport = {
	ok: boolean;
	checks: ValidationCheck[];
};

type ValidationJsonData = {
	report: ValidationReport;
	ok: boolean;
	checks: ValidationCheck[];
};

type DriftJsonData = {
	report: DriftReport;
	ok: boolean;
	findings: DriftReport["findings"];
	checked_at: string;
};

type ValidateRunner = (
	projectRoot: string,
	options: { checkDrift: boolean },
) => Promise<ValidationReport>;

function parseValidateArgs(args: string[]): {
	json: boolean;
	checkDrift: boolean;
	mode: "project" | "drift";
} {
	let json = false;
	let checkDrift = false;
	let mode: "project" | "drift" = "project";
	const values = [...args];
	if (values[0] === "validate") {
		values.shift();
	}
	if (values[0] === "drift") {
		mode = "drift";
		values.shift();
	}

	for (const value of values) {
		if (value === "--json" || value === "-j") {
			json = true;
			continue;
		}
		if (value === "--check-drift") {
			checkDrift = true;
			continue;
		}
		if (value.startsWith("-")) {
			throw new Error(`Unknown validate argument: ${value}`);
		}
		throw new Error(`Unexpected validate argument: ${value}`);
	}

	return { json, checkDrift, mode };
}

function formatReport(report: ValidationReport): string {
	const failed = report.checks.filter((check) => !check.ok);
	return [
		`validate: ${report.ok ? "passed" : "failed"}`,
		`checks: ${report.checks.length}`,
		`failed: ${failed.length}`,
		...report.checks.map(
			(check) => `${check.ok ? "ok" : "fail"} ${check.id} ${check.message}`,
		),
	].join("\n");
}

function formatDriftReport(report: DriftReport): string {
	return [
		`drift: ${report.ok ? "passed" : "failed"}`,
		`checked_at: ${report.checked_at}`,
		`findings: ${report.findings.length}`,
		...report.findings.map((finding) => {
			const hint = finding.hint ? ` hint=${finding.hint}` : "";
			return `${finding.severity} ${finding.domain} ${finding.id} ${finding.message}${hint}`;
		}),
	].join("\n");
}

function writeValidationJson(io: CommandIo, report: ValidationReport): void {
	const data: ValidationJsonData = {
		report,
		ok: report.ok,
		checks: report.checks,
	};
	const envelope = report.ok
		? envelopeOk(data, { action: "validate", exitCode: 0 })
		: (envelopeErr("VALIDATION_FAILED", "validation failed", {
				action: "validate",
				exitCode: 1,
			}) as ResultEnvelope<ValidationJsonData>);
	envelope.data = data;
	io.stdout(
		stringifyEnvelope(
			envelopeWithLegacyKeys(envelope, ["report", "ok", "checks"]),
		),
	);
}

function writeDriftJson(io: CommandIo, report: DriftReport): void {
	const data: DriftJsonData = {
		report,
		ok: report.ok,
		findings: report.findings,
		checked_at: report.checked_at,
	};
	const envelope = report.ok
		? envelopeOk(data, { action: "validate.drift", exitCode: 0 })
		: (envelopeErr("DRIFT_FOUND", "drift validation failed", {
				action: "validate.drift",
				exitCode: 1,
			}) as ResultEnvelope<DriftJsonData>);
	envelope.data = data;
	io.stdout(
		stringifyEnvelope(
			envelopeWithLegacyKeys(envelope, [
				"report",
				"ok",
				"findings",
				"checked_at",
			]),
		),
	);
}

function failureReport(error: unknown): ValidationReport {
	const message = error instanceof Error ? error.message : String(error);
	return {
		ok: false,
		checks: [
			{
				id: "runtime",
				ok: false,
				message,
			},
		],
	};
}

export async function runValidateCommand(
	projectRoot: string,
	args: string[],
	io: CommandIo = DEFAULT_IO,
	validate: ValidateRunner = validateProjectStructure,
): Promise<number> {
	let parsed: { json: boolean; checkDrift: boolean; mode: "project" | "drift" };
	try {
		parsed = parseValidateArgs(args);
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}

	if (parsed.mode === "drift") {
		const report = runDriftCheck(projectRoot);
		if (parsed.json) {
			writeDriftJson(io, report);
		} else {
			io.stdout(formatDriftReport(report));
		}
		return report.ok ? 0 : 1;
	}

	let report: ValidationReport;
	try {
		report = await validate(projectRoot, { checkDrift: parsed.checkDrift });
	} catch (error) {
		report = failureReport(error);
	}

	if (parsed.json) {
		writeValidationJson(io, report);
	} else {
		io.stdout(formatReport(report));
	}

	return report.ok ? 0 : 1;
}
