import { checkHealth } from "./checker";
import type {
	DoctorReport,
	HealthArea,
	HealthFinding,
	HealthSeverity,
} from "./types";

const AREAS: readonly HealthArea[] = [
	"adm",
	"pstr",
	"wb",
	"memory",
	"library",
	"state",
	"ctx",
	"token_budget",
];

function scoreFor(findings: readonly HealthFinding[]): number {
	let score = 100;
	for (const finding of findings) {
		if (finding.severity === "fail") {
			score -= 35;
			continue;
		}
		if (finding.severity === "warn") {
			score -= 10;
			continue;
		}
		score -= 2;
	}
	return Math.max(0, score);
}

function severityRank(severity: HealthSeverity): number {
	if (severity === "fail") {
		return 0;
	}
	if (severity === "warn") {
		return 1;
	}
	return 2;
}

function remediationAction(finding: HealthFinding): string {
	if (finding.hint) {
		return finding.hint;
	}
	switch (finding.area) {
		case "pstr":
			return "run afol pstr rebuild";
		case "wb":
			return "rebuild the workbench index";
		case "memory":
			return "refresh project memory";
		case "library":
			return "repair library topics and claim references";
		case "state":
			return "rehydrate the affected session state";
		case "ctx":
			return "rebuild the section index";
		case "token_budget":
			return "prune or split section sources";
		default:
			return "review the reported area";
	}
}

export function runDoctor(root: string): DoctorReport {
	const report = checkHealth(root, { deep: false, includeAuxiliary: true });
	const scores = AREAS.map((area) => {
		const findings = report.findings.filter((finding) => finding.area === area);
		return { area, score: scoreFor(findings), max: 100 };
	});
	const remediation = report.findings
		.filter(
			(finding) => finding.severity === "fail" || finding.severity === "warn",
		)
		.sort(
			(a, b) =>
				severityRank(a.severity) - severityRank(b.severity) ||
				a.area.localeCompare(b.area) ||
				a.message.localeCompare(b.message),
		)
		.map((finding, index) => ({
			step: index + 1,
			area: finding.area,
			action: remediationAction(finding),
			severity: finding.severity,
		}));

	return { scores, remediation };
}
