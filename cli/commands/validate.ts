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
			io.stdout(JSON.stringify(report));
		} else {
			io.stdout(formatDriftReport(report));
		}
		return report.ok ? 0 : 2;
	}

	let report: ValidationReport;
	try {
		report = await validate(projectRoot, { checkDrift: parsed.checkDrift });
	} catch (error) {
		report = failureReport(error);
	}

	if (parsed.json) {
		io.stdout(JSON.stringify(report));
	} else {
		io.stdout(formatReport(report));
	}

	return report.ok ? 0 : 2;
}
