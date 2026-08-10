import {
	validateFilesIndex,
	validateRulesIndex,
	validateSkillsIndex,
	validateSpecsIndex,
} from "../local-state/project-indexes";
import { validateWorkBenchIndex } from "../local-state/workbench-index";
import { validatePstrIndex } from "../pstr/builder";

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
	const addFinding = (
		scope: string,
		result: { ok: boolean; message: string },
		fallbackNext: string | null = null,
	): void => {
		if (result.ok) {
			return;
		}
		const normalized = normalizeGlobalMessage(result.message);
		findings.push({
			validation: `${scope}: ${normalized.validation}`,
			next: normalized.next ?? fallbackNext ?? "review failing project checks",
		});
	};

	const localStateResults = [
		validateRulesIndex(projectRoot),
		validateSkillsIndex(projectRoot),
		validateSpecsIndex(projectRoot),
		validateFilesIndex(projectRoot),
		validateWorkBenchIndex(projectRoot),
	];
	const localStateFailureCount = localStateResults.filter(
		(result) => !result.ok,
	).length;
	const pstrResult = validatePstrIndex(projectRoot);
	if (localStateFailureCount > 0 && !pstrResult.ok) {
		findings.push({
			validation: "project indexes need rebuild",
			next: "run afol local-state rebuild; afol pstr rebuild",
		});
		return findings;
	}
	if (localStateFailureCount > 0) {
		const subject =
			localStateFailureCount === 1 ? "index snapshot" : "index snapshots";
		addFinding("local-state", {
			ok: false,
			message: `${localStateFailureCount} ${subject} need rebuild; run afol local-state rebuild`,
		});
	}
	addFinding("pstr", pstrResult, "run afol pstr rebuild");

	return findings;
}
