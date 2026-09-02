import {
	envelopeOk,
	envelopeWithLegacyKeys,
	stringifyEnvelope,
} from "../core/envelope";
import { runDoctor } from "../services/health/doctor";
import { type CommandIo, DEFAULT_IO } from "./io";

type DoctorJsonData = ReturnType<typeof runDoctor> & {
	ok: boolean;
	remediation_plan: boolean;
	scope: "full";
};

function parseArgs(args: string[]): {
	json: boolean;
	remediationPlan: boolean;
} {
	const parsed = { json: false, remediationPlan: false };
	for (const value of args) {
		if (value === "--json" || value === "-j") {
			parsed.json = true;
			continue;
		}
		if (value === "--remediation-plan") {
			parsed.remediationPlan = true;
			continue;
		}
		throw new Error(`Unknown doctor argument: ${value}`);
	}
	return parsed;
}

export async function runDoctorCommand(
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	try {
		const parsed = parseArgs(args);
		const report = runDoctor(projectRoot);
		if (parsed.json) {
			const data: DoctorJsonData = {
				...report,
				ok: true,
				remediation_plan: parsed.remediationPlan,
				scope: "full",
			};
			io.stdout(
				stringifyEnvelope(
					envelopeWithLegacyKeys(
						envelopeOk(data, { action: "doctor", exitCode: 0 }),
						[
							"ok",
							"configuration",
							"scores",
							"remediation",
							"remediation_plan",
							"scope",
						],
					),
				),
			);
			return 0;
		}
		if (parsed.remediationPlan) {
			io.stdout(
				[
					"doctor scope: full",
					"doctor remediation plan:",
					...report.remediation.map(
						(step) =>
							`${step.step}. ${step.area} [${step.severity}] ${step.action}`,
					),
				].join("\n"),
			);
			return 0;
		}
		io.stdout(
			[
				"doctor scope: full",
				`evolution config: enabled=${String(report.configuration.evolution?.enabled ?? false)} project_id=${String(report.configuration.evolution?.project_id ?? "missing")} timezone=${String(report.configuration.evolution?.timezone ?? "unknown")}`,
				"doctor scores:",
				...report.scores.map(
					(score) => `  ${score.area}: ${score.score}/${score.max}`,
				),
				"hint: run afol doctor --remediation-plan for next actions",
			].join("\n"),
		);
		return 0;
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}
}
