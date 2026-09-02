import type { EventLedgerInspection } from "../events/ledger";
import { checkPstrStale, validatePstrIndex } from "../pstr/builder";
import {
	validateFilesIndex,
	validateRulesIndex,
	validateSkillsIndex,
	validateSpecsIndex,
} from "./project-indexes";
import { validateWorkBenchIndex } from "./workbench-index";

export type FreshnessSurface = "local-state" | "pstr";
export type FreshnessState = "current" | "missing" | "invalid" | "stale";

export type FreshnessCheck = {
	id: string;
	surface: FreshnessSurface;
	state: FreshnessState;
	ok: boolean;
	message: string;
	remediation: string;
};

export type FreshnessReport = {
	ok: boolean;
	checked_at: string;
	checks: FreshnessCheck[];
	findings: FreshnessCheck[];
};

export type FreshnessOptions = {
	localState?: boolean;
	pstr?: boolean;
	eventLedger?: EventLedgerInspection;
};

type ValidationResult = {
	ok: boolean;
	message: string;
};

type LocalStateCheck = {
	name: string;
	validate: (root: string, options: FreshnessOptions) => ValidationResult;
};

const LOCAL_STATE_CHECKS: readonly LocalStateCheck[] = [
	{ name: "rules", validate: (root) => validateRulesIndex(root) },
	{ name: "skills", validate: (root) => validateSkillsIndex(root) },
	{ name: "specs", validate: (root) => validateSpecsIndex(root) },
	{ name: "files", validate: (root) => validateFilesIndex(root) },
	{
		name: "workbench",
		validate: (root, options) =>
			validateWorkBenchIndex(
				root,
				options.eventLedger ? { eventLedger: options.eventLedger } : undefined,
			),
	},
];

function nowIso(): string {
	return new Date().toISOString();
}

function classifyMessage(message: string): FreshnessState {
	const normalized = message.toLowerCase();
	if (normalized.includes("missing")) {
		return "missing";
	}
	if (
		normalized.includes("invalid") ||
		normalized.includes("degraded") ||
		normalized.includes("unreadable")
	) {
		return "invalid";
	}
	if (
		normalized.includes("stale") ||
		normalized.includes("drift") ||
		normalized.includes("need rebuild")
	) {
		return "stale";
	}
	return "invalid";
}

function localStateRemediation(message: string): string {
	return message.includes("explicit repair required")
		? "repair the event ledger, then run afol local-state rebuild"
		: "run afol local-state rebuild";
}

function localStateCheck(
	name: string,
	result: ValidationResult,
): FreshnessCheck {
	const state = result.ok ? "current" : classifyMessage(result.message);
	return {
		id: `local-state:${name}`,
		surface: "local-state",
		state,
		ok: result.ok,
		message: result.message,
		remediation: localStateRemediation(result.message),
	};
}

function pstrCheck(
	id: string,
	result: ValidationResult,
	stateOverride?: FreshnessState,
): FreshnessCheck {
	const state = result.ok
		? "current"
		: (stateOverride ?? classifyMessage(result.message));
	return {
		id,
		surface: "pstr",
		state,
		ok: result.ok,
		message: result.message,
		remediation: "run afol pstr rebuild",
	};
}

function collectLocalStateChecks(
	root: string,
	options: FreshnessOptions,
): FreshnessCheck[] {
	return LOCAL_STATE_CHECKS.map(({ name, validate }) =>
		localStateCheck(name, validate(root, options)),
	);
}

function collectPstrChecks(root: string): FreshnessCheck[] {
	const validation = validatePstrIndex(root);
	const checks: FreshnessCheck[] = [pstrCheck("pstr:index", validation)];
	if (!validation.ok && checks[0]?.state === "invalid") {
		return checks;
	}
	let staleEntries: ReturnType<typeof checkPstrStale> = [];
	try {
		staleEntries = checkPstrStale(root);
	} catch {
		// validatePstrIndex carries the actionable configuration finding.
	}

	for (const entry of [...staleEntries].sort((a, b) =>
		a.id.localeCompare(b.id),
	)) {
		checks.push(
			pstrCheck(
				`pstr:map:${entry.id}`,
				{
					ok: !entry.stale,
					message: entry.message,
				},
				entry.stale ? classifyMessage(entry.message) : undefined,
			),
		);
	}
	return checks;
}

export function collectFreshnessReport(
	root: string,
	options: FreshnessOptions = {},
): FreshnessReport {
	const checks = [
		...(options.localState === false
			? []
			: collectLocalStateChecks(root, options)),
		...(options.pstr === false ? [] : collectPstrChecks(root)),
	];
	const findings = checks.filter((check) => !check.ok);
	return {
		ok: findings.length === 0,
		checked_at: nowIso(),
		checks,
		findings,
	};
}
