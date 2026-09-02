import { collectFreshnessReport } from "../local-state/freshness";

export type GlobalStatusFinding = {
	validation: string;
	next: string;
};

function normalizeGlobalMessage(message: string): {
	validation: string;
	next: string | null;
} {
	const [validation, next] = message.split(/;\s+/, 2);
	return {
		validation: (validation?.trim() || message)
			.replace(/: (?:\.?\/|\/).*$/, "")
			.trim(),
		next: next?.trim() || null,
	};
}

export function collectGlobalStatusFindings(
	projectRoot: string,
): GlobalStatusFinding[] {
	const findings: GlobalStatusFinding[] = [];
	const report = collectFreshnessReport(projectRoot);
	const localStateFailures = report.findings.filter(
		(finding) => finding.surface === "local-state",
	);
	const pstrFailures = report.findings.filter(
		(finding) => finding.surface === "pstr",
	);
	if (localStateFailures.length > 0 && pstrFailures.length > 0) {
		findings.push({
			validation: "project indexes need rebuild",
			next: "run afol local-state rebuild; afol pstr rebuild",
		});
		return findings;
	}
	if (localStateFailures.length > 0) {
		const subject =
			localStateFailures.length === 1 ? "index snapshot" : "index snapshots";
		findings.push({
			validation: `local-state: ${localStateFailures.length} ${subject} need rebuild`,
			next: "run afol local-state rebuild",
		});
	}
	if (pstrFailures.length > 0) {
		const first = pstrFailures[0];
		if (first) {
			const normalized = normalizeGlobalMessage(first.message);
			findings.push({
				validation: `pstr: ${normalized.validation}`,
				next: first.remediation,
			});
		}
	}

	return findings;
}
