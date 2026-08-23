import {
	envelopeErr,
	envelopeOk,
	envelopeWithLegacyKeys,
	type ResultEnvelope,
	stringifyEnvelope,
} from "../core/envelope";
import { runDriftCheck } from "../services/drift/checker";
import type { DriftReport } from "../services/drift/types";
import { validateProjectStructure } from "../services/project/validate";
import { type CommandIo, DEFAULT_IO } from "./io";

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
};

type DriftJsonData = {
	report: DriftReport;
};

type ValidateRunner = (
	projectRoot: string,
	options: { checkDrift: boolean; strict: boolean },
) => Promise<ValidationReport>;

function parseValidateArgs(args: string[]): {
	json: boolean;
	checkDrift: boolean;
	strict: boolean;
	mode: "project" | "drift";
} {
	let json = false;
	let checkDrift = false;
	let strict = false;
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
		if (value === "--strict") {
			strict = true;
			continue;
		}
		if (value.startsWith("-")) {
			throw new Error(`Unknown validate argument: ${value}`);
		}
		throw new Error(`Unexpected validate argument: ${value}`);
	}

	return { json, checkDrift, strict, mode };
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
	};
	const envelope = report.ok
		? envelopeOk(data, { action: "validate", exitCode: 0 })
		: (envelopeErr("VALIDATION_FAILED", "validation failed", {
				action: "validate",
				exitCode: 1,
			}) as ResultEnvelope<ValidationJsonData>);
	envelope.data = data;
	const output = envelopeWithLegacyKeys(envelope, ["report"]);
	(output as Record<string, unknown>).checks = report.checks;
	io.stdout(stringifyEnvelope(output));
}

function writeDriftJson(io: CommandIo, report: DriftReport): void {
	const data: DriftJsonData = {
		report,
	};
	const envelope = report.ok
		? envelopeOk(data, { action: "validate.drift", exitCode: 0 })
		: (envelopeErr("DRIFT_FOUND", "drift validation failed", {
				action: "validate.drift",
				exitCode: 1,
			}) as ResultEnvelope<DriftJsonData>);
	envelope.data = data;
	const output = envelopeWithLegacyKeys(envelope, ["report"]);
	const legacyOutput = output as Record<string, unknown>;
	legacyOutput.findings = report.findings;
	legacyOutput.checked_at = report.checked_at;
	io.stdout(stringifyEnvelope(output));
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
	let parsed: {
		json: boolean;
		checkDrift: boolean;
		strict: boolean;
		mode: "project" | "drift";
	};
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
		report = await validate(projectRoot, {
			checkDrift: parsed.checkDrift,
			strict: parsed.strict,
		});
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
