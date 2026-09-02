import { existsSync, mkdirSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { boundedSpawn } from "../../core/subprocess";
import { checkHealth } from "../health/checker";
import { withSessionLock } from "../io/session-lock";
import {
	collectFreshnessReport,
	type FreshnessCheck,
	type FreshnessReport,
	type FreshnessState,
} from "../local-state/freshness";
import { rebuildProjectIndexes } from "../local-state/project-indexes";
import { rebuildWorkBenchIndex } from "../local-state/workbench-index";
import {
	type ProjectConfigResolution,
	type ProjectConfigSource,
	resolveProjectConfigPath,
} from "../project/paths";
import { validateProjectStructure } from "../project/validate";
import {
	checkTemplateUpdate,
	type UpdateCheckResult,
	type UpdateOperation,
} from "../update/check";

export type FleetProjectClass =
	| "healthy"
	| "derived-repairable"
	| "conflicted"
	| "legacy"
	| "mixed"
	| "blocked"
	| "update-conflicted"
	| "validation-blocked";

export type FleetDecisionAction =
	| "noop"
	| "repair-derived"
	| "preview-update"
	| "manual-review";

export type FleetDecisionAxisState = "ok" | "warn" | "blocked";

export type FleetDecisionBlocker =
	| "critical-scaffold-conflict"
	| "dirty-git-worktree"
	| "history-failed"
	| "missing-config";

export type FleetDecisionAxis = {
	state: FleetDecisionAxisState;
	reason: string;
};

export type FleetProjectDecision = {
	action: FleetDecisionAction;
	blockers: readonly FleetDecisionBlocker[];
	axes: {
		git: FleetDecisionAxis;
		derived: FleetDecisionAxis;
		scaffold: FleetDecisionAxis;
		history: FleetDecisionAxis;
	};
	next_command: string | null;
};

export const FLEET_MAX_PROJECTS = 25;
const FLEET_MAX_GIT_PATHS = 25;
const FLEET_DEFAULT_PATH_LIMIT = 3;
const GIT_STATUS_TIMEOUT_MS = 5_000;
const GIT_STATUS_MAX_BUFFER_BYTES = 64 * 1024;
const LOCAL_STATE_VALIDATION_SUFFIX = "_local_state_index";
const HISTORY_VALIDATION_FAILURE_IDS = new Set([
	"session_evidence",
	"session-history",
]);
const DEFAULT_FLEET_ENTRYPOINT = "afol";

const AFOL_OWNED_DIRTY_PREFIXES = [".afol/"] as const;

export type FleetGitState = "clean" | "dirty" | "unavailable";

export type FleetGitPosture = {
	state: FleetGitState;
	dirty_count: number;
	dirty_paths: readonly string[];
	dirty_paths_overflow: boolean;
};

export type FleetLocalStateFinding = {
	id: FreshnessCheck["id"];
	state: FreshnessState;
	ok: boolean;
};

export type FleetProjectHealth = {
	ok: boolean;
	fail: number;
	warn: number;
	info: number;
};

export type FleetTemplateUpdatePosture = {
	has_source: boolean;
	up_to_date: boolean;
	current_revision: string;
	source_revision: string;
	operation_summary: {
		total: number;
		create: number;
		update: number;
		remove: number;
		conflict: number;
		preserve: number;
	};
	conflict_paths: readonly string[];
	conflict_paths_overflow: boolean;
	critical_conflict_count: number;
	project_owned_preserve_count: number;
};

export type FleetRepairEligibilityReason =
	| "eligible"
	| "not-eligible:not-supported-target"
	| "not-eligible:missing-root"
	| "not-eligible:missing-config"
	| "not-eligible:dirty-git-worktree"
	| "not-eligible:non-repairable-classification"
	| "not-eligible:no-local-state-failures";

export type FleetValidationSummary = {
	ok: boolean;
	failed_check_ids: readonly string[];
};

export type FleetProjectCheck = {
	root: string;
	config_source: ProjectConfigSource | null;
	config_path: string | null;
	classification: FleetProjectClass;
	classification_reasons: readonly string[];
	decision: FleetProjectDecision;
	git: FleetGitPosture;
	health_summary: FleetProjectHealth;
	template_update: FleetTemplateUpdatePosture;
	validation: FleetValidationSummary;
	local_state: {
		checks: readonly FleetLocalStateFinding[];
		checks_failed: number;
	};
};

export type FleetCheckInput = {
	roots: readonly string[];
	max_projects?: number;
	max_paths?: number;
	entrypoint?: string;
};

export type FleetCheckReport = {
	ok: boolean;
	max_projects: number;
	truncated: boolean;
	projects: readonly FleetProjectCheck[];
};

export type FleetRepairTarget = "derived";
export type FleetRepairMode = "preview" | "apply";

export type FleetRepairInput = {
	root: string;
	target?: FleetRepairTarget;
	dry_run?: boolean;
	max_paths?: number;
	reason?: string;
	entrypoint?: string;
};

export type FleetRepairReport = {
	mode: FleetRepairMode;
	root: string;
	target: FleetRepairTarget;
	decision: FleetProjectDecision;
	reason: string | null;
	eligible: boolean;
	eligibility_reason: FleetRepairEligibilityReason;
	writes_performed: boolean;
	changed: boolean;
	before: FleetProjectCheck;
	after: FleetProjectCheck;
};

const EMPTY_FLEET_PROJECT_HEALTH: FleetProjectHealth = {
	ok: false,
	fail: 0,
	warn: 0,
	info: 0,
};
const EMPTY_FLEET_VALIDATION_SUMMARY: FleetValidationSummary = {
	ok: false,
	failed_check_ids: [],
};
const EMPTY_FLEET_TEMPLATE_UPDATE: FleetTemplateUpdatePosture = {
	has_source: false,
	up_to_date: false,
	current_revision: "unknown",
	source_revision: "unknown",
	operation_summary: {
		total: 0,
		create: 0,
		update: 0,
		remove: 0,
		conflict: 0,
		preserve: 0,
	},
	conflict_paths: [],
	conflict_paths_overflow: false,
	critical_conflict_count: 0,
	project_owned_preserve_count: 0,
};

function resolveFleetEntrypoint(value: string | undefined): string {
	const trimmed = value?.trim();
	return trimmed ? trimmed : DEFAULT_FLEET_ENTRYPOINT;
}

function nextCommandForFleetDecision(
	entrypoint: string,
	action: FleetDecisionAction,
	root: string,
): string | null {
	const quotedRoot = quoteShellPath(root);
	const quotedEntrypoint = quoteShellPath(entrypoint);
	if (action === "repair-derived") {
		return `${quotedEntrypoint} fleet repair --derived --dry-run --root ${quotedRoot} --json`;
	}
	if (action === "preview-update") {
		return `cd ${quotedRoot} && ${quotedEntrypoint} update preview --json`;
	}
	return null;
}

function quoteShellPath(value: string): string {
	return `'${value.replace(/'/g, "'\\''")}'`;
}

function absoluteRoot(value: string): string {
	if (!isAbsolute(value)) {
		throw new Error(`fleet path must be absolute: ${value}`);
	}
	return resolve(value);
}

function toMax(
	value: number | undefined,
	fallback: number,
	hardCap: number,
): number {
	if (value === undefined || !Number.isInteger(value) || value <= 0)
		return fallback;
	return Math.max(1, Math.min(hardCap, value));
}

function isExcludedDirtyPath(relativePath: string): boolean {
	const normalized = relativePath.replace(/\\/g, "/");
	return AFOL_OWNED_DIRTY_PREFIXES.some((prefix) =>
		normalized.startsWith(prefix),
	);
}

function parseGitStatusPath(rawLine: string): string | null {
	if (rawLine.length < 4) {
		return null;
	}
	const tail = rawLine.slice(3).trim();
	if (!tail) return null;
	const renameIndex = tail.indexOf(" -> ");
	return (renameIndex >= 0 ? tail.slice(renameIndex + 4) : tail).trim();
}

function normalizeRootForDedupe(value: string): string {
	return isAbsolute(value) ? resolve(value) : value;
}

function toFleetProjectHealth(projectRoot: string): FleetProjectHealth {
	try {
		const health = checkHealth(projectRoot, { includeAuxiliary: true });
		return {
			ok: health.ok,
			fail: health.summary.fail,
			warn: health.summary.warn,
			info: health.summary.info,
		};
	} catch {
		return EMPTY_FLEET_PROJECT_HEALTH;
	}
}

function toFleetTemplateUpdate(
	update: UpdateCheckResult,
	maxPaths: number,
): FleetTemplateUpdatePosture {
	const operation_summary = {
		total: 0,
		create: 0,
		update: 0,
		remove: 0,
		conflict: 0,
		preserve: 0,
	};
	const conflictPaths: string[] = [];
	let criticalConflictCount = 0;
	let projectOwnedPreserveCount = 0;

	for (const operation of update.operations) {
		if (operation.kind === "skip-identical") {
			continue;
		}
		operation_summary.total += 1;
		if (operation.kind === "create") {
			operation_summary.create += 1;
			continue;
		}
		if (operation.kind === "update-managed") {
			operation_summary.update += 1;
			continue;
		}
		if (operation.kind === "remove-stale") {
			operation_summary.remove += 1;
			continue;
		}
		if (operation.kind === "preserve-project-owned") {
			operation_summary.preserve += 1;
			projectOwnedPreserveCount += 1;
			continue;
		}
		if (operation.kind === "conflict") {
			if (isCriticalTemplateConflict(operation)) {
				criticalConflictCount += 1;
			}
			operation_summary.conflict += 1;
			conflictPaths.push(operation.path);
		}
	}
	const visibleConflictPaths = conflictPaths
		.sort()
		.slice(0, Math.max(0, maxPaths));

	return {
		has_source: update.hasSource,
		up_to_date: update.upToDate,
		current_revision: update.currentRevision,
		source_revision: update.sourceRevision,
		operation_summary,
		conflict_paths: visibleConflictPaths,
		conflict_paths_overflow: visibleConflictPaths.length < conflictPaths.length,
		critical_conflict_count: criticalConflictCount,
		project_owned_preserve_count: projectOwnedPreserveCount,
	};
}

function isCriticalTemplateConflict(operation: UpdateOperation): boolean {
	return (
		operation.path === ".agents/lock.json" ||
		operation.path === ".agents/manifest.json" ||
		operation.path.endsWith(".schema.json")
	);
}

function isHistoryValidationFailure(checkId: string): boolean {
	return HISTORY_VALIDATION_FAILURE_IDS.has(checkId);
}

async function toFleetValidationSummary(
	projectRoot: string,
): Promise<FleetValidationSummary> {
	const validation = await validateProjectStructure(projectRoot, {
		checkDrift: false,
	});
	const failed_check_ids = validation.checks
		.filter((check) => !check.ok)
		.map((check) => check.id);
	return {
		ok: validation.ok,
		failed_check_ids,
	};
}

function makeFleetProjectDecision(
	projectRoot: string,
	configSource: ProjectConfigSource | null,
	classification: FleetProjectClass,
	git: FleetGitPosture,
	_healthSummary: FleetProjectHealth,
	templateUpdate: FleetTemplateUpdatePosture,
	validation: FleetValidationSummary,
	localStateChecks: readonly FleetLocalStateFinding[],
	entrypoint: string,
): FleetProjectDecision {
	const localStateFailures = localStateChecks.filter(
		(check) => !check.ok,
	).length;
	const historyDebtChecks = validation.failed_check_ids.filter(
		isHistoryValidationFailure,
	);

	const gitAxis: FleetDecisionAxis =
		git.state === "unavailable"
			? {
					state: "blocked",
					reason: "git state unavailable",
				}
			: git.state === "dirty"
				? {
						state: "warn",
						reason: `${git.dirty_count} dirty path(s)`,
					}
				: {
						state: "ok",
						reason: "clean worktree",
					};

	const derivedAxis: FleetDecisionAxis = (() => {
		if (classification === "blocked") {
			return {
				state: "blocked",
				reason: "missing config source",
			};
		}
		if (classification === "validation-blocked") {
			return {
				state: "blocked",
				reason: "validation blocked repair path",
			};
		}
		if (localStateFailures > 0) {
			return {
				state: "warn",
				reason: `${localStateFailures} local-state failure(s)`,
			};
		}
		return {
			state: "ok",
			reason: "no local-state failures",
		};
	})();

	const historyAxis: FleetDecisionAxis = (() => {
		if (historyDebtChecks.length > 0) {
			return {
				state: "blocked",
				reason: `history debt: ${historyDebtChecks.join(", ")}`,
			};
		}
		return {
			state: "ok",
			reason: "history clean",
		};
	})();

	const scaffoldAxis: FleetDecisionAxis = (() => {
		if (templateUpdate.critical_conflict_count > 0) {
			return {
				state: "blocked",
				reason: `${templateUpdate.critical_conflict_count} critical scaffold conflict(s)`,
			};
		}
		if (templateUpdate.operation_summary.conflict > 0) {
			return {
				state: "warn",
				reason: `${templateUpdate.operation_summary.conflict} scaffold conflict(s)`,
			};
		}
		if (templateUpdate.project_owned_preserve_count > 0) {
			return {
				state: "warn",
				reason: `${templateUpdate.project_owned_preserve_count} project-owned preserve conflict(s)`,
			};
		}
		return {
			state: "ok",
			reason: "scaffold clean",
		};
	})();

	const blockers = new Set<FleetDecisionBlocker>();
	if (configSource === null) {
		blockers.add("missing-config");
	}
	if (git.state === "dirty") {
		blockers.add("dirty-git-worktree");
	}
	if (historyAxis.state === "blocked") {
		blockers.add("history-failed");
	}
	if (scaffoldAxis.state === "blocked") {
		blockers.add("critical-scaffold-conflict");
	}

	let action: FleetDecisionAction = "manual-review";
	const canRepairDerived =
		derivedAxis.state === "warn" &&
		gitAxis.state === "ok" &&
		historyAxis.state === "ok";
	if (blockers.size === 0) {
		const allClear =
			gitAxis.state === "ok" &&
			derivedAxis.state === "ok" &&
			scaffoldAxis.state === "ok" &&
			historyAxis.state === "ok";
		if (allClear) {
			action = "noop";
		} else if (canRepairDerived) {
			action = "repair-derived";
		} else if (
			classification === "update-conflicted" ||
			scaffoldAxis.state === "warn"
		) {
			action = "preview-update";
		}
	}

	return {
		action,
		blockers: [...blockers],
		axes: {
			git: gitAxis,
			derived: derivedAxis,
			scaffold: scaffoldAxis,
			history: historyAxis,
		},
		next_command: nextCommandForFleetDecision(entrypoint, action, projectRoot),
	};
}

function toFleetProjectReport(
	projectRoot: string,
	errors: readonly string[] = ["error:project-check"],
	entrypoint: string = DEFAULT_FLEET_ENTRYPOINT,
): FleetProjectCheck {
	const git = {
		state: "unavailable" as const,
		dirty_count: 0,
		dirty_paths: [],
		dirty_paths_overflow: false,
	};
	return {
		root: projectRoot,
		config_source: null,
		config_path: null,
		classification: "blocked",
		classification_reasons: errors,
		decision: makeFleetProjectDecision(
			projectRoot,
			null,
			"blocked",
			git,
			EMPTY_FLEET_PROJECT_HEALTH,
			EMPTY_FLEET_TEMPLATE_UPDATE,
			EMPTY_FLEET_VALIDATION_SUMMARY,
			[],
			entrypoint,
		),
		git,
		health_summary: EMPTY_FLEET_PROJECT_HEALTH,
		template_update: EMPTY_FLEET_TEMPLATE_UPDATE,
		validation: EMPTY_FLEET_VALIDATION_SUMMARY,
		local_state: {
			checks: [],
			checks_failed: 0,
		},
	};
}

function collectGitPosture(
	projectRoot: string,
	maxPaths: number,
): FleetGitPosture {
	const result = boundedSpawn("git", ["status", "--porcelain=v1", "-uall"], {
		cwd: projectRoot,
		timeoutMs: GIT_STATUS_TIMEOUT_MS,
		maxBuffer: GIT_STATUS_MAX_BUFFER_BYTES,
	});
	if (!result.ok) {
		if (result.timedOut) {
			return {
				state: "unavailable",
				dirty_count: 0,
				dirty_paths: [],
				dirty_paths_overflow: false,
			};
		}
		// Non-git projects (or permission/IO issues) are a known non-blocking
		// fleet posture signal and must remain compactly represented.
		return {
			state: "unavailable",
			dirty_count: 0,
			dirty_paths: [],
			dirty_paths_overflow: false,
		};
	}

	const lines = result.stdout.split(/\r?\n/).map(parseGitStatusPath);
	const dirty: string[] = [];
	let overflow = false;
	for (const line of lines) {
		if (!line) continue;
		const normalized = line.replace(/\\/g, "/");
		if (isExcludedDirtyPath(normalized)) {
			continue;
		}
		if (dirty.length < maxPaths) {
			dirty.push(normalized);
		} else {
			overflow = true;
		}
	}

	const state = dirty.length === 0 && !overflow ? "clean" : "dirty";
	const dirtyCount = Math.max(0, dirty.length + (overflow ? 1 : 0));
	return {
		state,
		dirty_count: dirtyCount,
		dirty_paths: dirty,
		dirty_paths_overflow: overflow,
	};
}

function filterLocalStateChecks(
	report: FreshnessReport,
): FleetLocalStateFinding[] {
	const checks = report.checks.filter(
		(check) => check.surface === "local-state",
	);
	return checks
		.map((check) => ({
			id: check.id,
			state: check.state,
			ok: check.ok,
		}))
		.sort((left, right) => left.id.localeCompare(right.id));
}

function classifyProject(
	configSource: ProjectConfigSource | null,
	localStateChecks: readonly FleetLocalStateFinding[],
	templateUpdate: FleetTemplateUpdatePosture,
	validation: FleetValidationSummary,
): {
	classification: FleetProjectClass;
	reasons: string[];
} {
	const failures = localStateChecks.filter((check) => !check.ok);
	if (configSource === null) {
		return { classification: "blocked", reasons: ["missing-config"] };
	}

	const hasLegacy = configSource === "legacy";
	const hasFailures = failures.length > 0;
	const hasConflicts = failures.some((finding) => finding.state === "invalid");
	const hasValidationFailures = !validation.ok;
	const hasTemplateConflicts = templateUpdate.operation_summary.conflict > 0;
	const hasOnlyLocalStateValidationFailures =
		hasValidationFailures &&
		validation.failed_check_ids.every((id) =>
			id.endsWith(LOCAL_STATE_VALIDATION_SUFFIX),
		);
	const hasNonLocalStateValidationFailures =
		hasValidationFailures &&
		!validation.failed_check_ids.every((id) =>
			id.endsWith(LOCAL_STATE_VALIDATION_SUFFIX),
		);
	const reasons: string[] = [];

	if (hasLegacy) reasons.push("legacy-config");
	for (const id of validation.failed_check_ids) {
		reasons.push(`validation:${id}`);
	}

	if (hasTemplateConflicts) {
		reasons.push("template-update-conflict");
		return {
			classification: "update-conflicted",
			reasons,
		};
	}

	if (hasNonLocalStateValidationFailures) {
		reasons.push("validation-failed");
		return {
			classification: "validation-blocked",
			reasons,
		};
	}

	if (hasOnlyLocalStateValidationFailures) {
		reasons.push("validation-repairable-local-state");
	}

	if (!hasFailures) {
		return {
			classification: hasLegacy ? "legacy" : "healthy",
			reasons,
		};
	}

	if (hasLegacy) {
		return {
			classification: "mixed",
			reasons: reasons.concat(
				hasConflicts ? ["derived-conflict"] : ["derived-repairable"],
			),
		};
	}

	if (hasConflicts) {
		return {
			classification: "conflicted",
			reasons: reasons.concat(["derived-conflict"]),
		};
	}

	return {
		classification: "derived-repairable",
		reasons: reasons.concat(["derived-repairable"]),
	};
}

async function collectProjectCheck(
	projectRoot: string,
	maxPaths: number,
	entrypoint: string,
): Promise<FleetProjectCheck> {
	let configResolution: ProjectConfigResolution | null;
	try {
		configResolution = resolveProjectConfigPath(projectRoot);
	} catch {
		configResolution = null;
	}

	const configPath = configResolution?.absolutePath ?? null;
	const configSource = configResolution?.source ?? null;

	let validation: FleetValidationSummary = EMPTY_FLEET_VALIDATION_SUMMARY;
	let templateUpdate: FleetTemplateUpdatePosture = EMPTY_FLEET_TEMPLATE_UPDATE;
	const healthSummary = toFleetProjectHealth(projectRoot);

	try {
		validation = await toFleetValidationSummary(projectRoot);
	} catch {
		validation = {
			ok: false,
			failed_check_ids: ["validate:error"],
		};
	}
	try {
		templateUpdate = toFleetTemplateUpdate(
			checkTemplateUpdate(projectRoot),
			maxPaths,
		);
	} catch {
		templateUpdate = {
			...EMPTY_FLEET_TEMPLATE_UPDATE,
			has_source: false,
			conflict_paths: [],
			conflict_paths_overflow: false,
		};
		validation = {
			ok: false,
			failed_check_ids: [
				...validation.failed_check_ids,
				"template-update:error",
			],
		};
	}

	let report: FreshnessReport;
	try {
		report = collectFreshnessReport(projectRoot, {
			localState: true,
			pstr: false,
		});
	} catch {
		return toFleetProjectReport(projectRoot, ["error:local-state"], entrypoint);
	}

	const localStateChecks = filterLocalStateChecks(report);
	const git = collectGitPosture(projectRoot, maxPaths);
	const classification = classifyProject(
		configSource,
		localStateChecks,
		templateUpdate,
		validation,
	);
	const decision = makeFleetProjectDecision(
		projectRoot,
		configSource,
		classification.classification,
		git,
		healthSummary,
		templateUpdate,
		validation,
		localStateChecks,
		entrypoint,
	);
	return {
		root: projectRoot,
		config_source: configSource,
		config_path: configPath,
		classification: classification.classification,
		classification_reasons: classification.reasons,
		decision,
		git,
		health_summary: healthSummary,
		template_update: templateUpdate,
		validation,
		local_state: {
			checks: localStateChecks,
			checks_failed: localStateChecks.filter((check) => !check.ok).length,
		},
	};
}

function hasDerivedStateFailure(
	localStateChecks: readonly FleetLocalStateFinding[],
): boolean {
	return localStateChecks.some((check) => !check.ok);
}

function repairEligibility(
	root: string,
	check: FleetProjectCheck,
): {
	eligible: boolean;
	reason: FleetRepairEligibilityReason;
} {
	if (!existsSync(root)) {
		return { eligible: false, reason: "not-eligible:missing-root" };
	}
	if (check.config_source === null) {
		return { eligible: false, reason: "not-eligible:missing-config" };
	}
	if (check.git.state === "dirty") {
		return { eligible: false, reason: "not-eligible:dirty-git-worktree" };
	}
	if (check.decision.action !== "repair-derived") {
		if (
			check.decision.action === "noop" &&
			!hasDerivedStateFailure(check.local_state.checks)
		) {
			return {
				eligible: false,
				reason: "not-eligible:no-local-state-failures",
			};
		}
		return {
			eligible: false,
			reason: "not-eligible:non-repairable-classification",
		};
	}
	if (!hasDerivedStateFailure(check.local_state.checks)) {
		return {
			eligible: false,
			reason: "not-eligible:no-local-state-failures",
		};
	}
	return { eligible: true, reason: "eligible" };
}

function dedupeProjectRoots(
	roots: readonly string[],
	maxProjects: number,
): {
	selected: readonly string[];
	truncated: boolean;
} {
	const selected = new Set<string>();
	const projectRoots: string[] = [];
	for (const root of roots) {
		const key = normalizeRootForDedupe(root);
		if (selected.has(key)) continue;
		selected.add(key);
		if (projectRoots.length < maxProjects) {
			projectRoots.push(root);
		}
	}
	return {
		selected: projectRoots,
		truncated: selected.size > maxProjects,
	};
}

function toFleetReport(
	reports: FleetProjectCheck[],
	maxProjects: number,
	truncated: boolean,
): FleetCheckReport {
	return {
		ok: reports.every((report) =>
			["healthy", "derived-repairable", "legacy", "mixed"].includes(
				report.classification,
			),
		),
		max_projects: maxProjects,
		truncated,
		projects: reports,
	};
}

function blockedProject(root: string, entrypoint: string): FleetProjectCheck {
	return {
		root,
		config_source: null,
		config_path: null,
		classification: "blocked",
		classification_reasons: ["non-absolute-root"],
		decision: makeFleetProjectDecision(
			root,
			null,
			"blocked",
			{
				state: "unavailable",
				dirty_count: 0,
				dirty_paths: [],
				dirty_paths_overflow: false,
			},
			EMPTY_FLEET_PROJECT_HEALTH,
			EMPTY_FLEET_TEMPLATE_UPDATE,
			EMPTY_FLEET_VALIDATION_SUMMARY,
			[],
			entrypoint,
		),
		git: {
			state: "unavailable",
			dirty_count: 0,
			dirty_paths: [],
			dirty_paths_overflow: false,
		},
		health_summary: EMPTY_FLEET_PROJECT_HEALTH,
		template_update: EMPTY_FLEET_TEMPLATE_UPDATE,
		validation: EMPTY_FLEET_VALIDATION_SUMMARY,
		local_state: {
			checks: [],
			checks_failed: 0,
		},
	};
}

export async function runFleetCheck(
	input: FleetCheckInput,
): Promise<FleetCheckReport> {
	const maxProjects = toMax(
		input.max_projects,
		FLEET_MAX_PROJECTS,
		FLEET_MAX_PROJECTS,
	);
	const maxPaths = toMax(
		input.max_paths,
		FLEET_DEFAULT_PATH_LIMIT,
		FLEET_MAX_GIT_PATHS,
	);
	const { selected, truncated } = dedupeProjectRoots(input.roots, maxProjects);
	const entrypoint = resolveFleetEntrypoint(input.entrypoint);

	const projects: FleetProjectCheck[] = [];
	for (const root of selected) {
		if (!isAbsolute(root)) {
			projects.push(blockedProject(root, entrypoint));
			continue;
		}
		projects.push(
			await collectProjectCheck(resolve(root), maxPaths, entrypoint),
		);
	}

	return toFleetReport(projects, maxProjects, truncated);
}

function writeLocalState(projectRoot: string): void {
	mkdirSync(resolve(projectRoot, ".afol", "data", "index"), {
		recursive: true,
	});
	const hasState = existsSync(resolve(projectRoot, ".afol", "state"));
	if (!hasState) {
		mkdirSync(resolve(projectRoot, ".afol", "state"), { recursive: true });
	}
	rebuildWorkBenchIndex(projectRoot);
	rebuildProjectIndexes(projectRoot);
}

function lockPathForTarget(target: FleetRepairTarget): string {
	return `fleet.repair.${target}`;
}

function checkSignature(check: FleetProjectCheck): string {
	return JSON.stringify({
		classification: check.classification,
		classification_reasons: check.classification_reasons,
		git: check.git,
		health_summary: check.health_summary,
		template_update: check.template_update,
		local_state: check.local_state,
		validation: check.validation,
	});
}

function compareCheckSignatures(
	before: FleetProjectCheck,
	after: FleetProjectCheck,
): boolean {
	return checkSignature(before) === checkSignature(after);
}

export async function runFleetRepair(
	input: FleetRepairInput,
): Promise<FleetRepairReport> {
	const root = absoluteRoot(input.root);
	const target: FleetRepairTarget = input.target ?? "derived";
	const entrypoint = resolveFleetEntrypoint(input.entrypoint);
	const maxPaths = toMax(
		input.max_paths,
		FLEET_DEFAULT_PATH_LIMIT,
		FLEET_MAX_GIT_PATHS,
	);
	if (target !== "derived") {
		throw new Error(`unsupported fleet repair target: ${target}`);
	}

	const before = await collectProjectCheck(root, maxPaths, entrypoint);
	const eligibility = repairEligibility(root, before);
	const repairReportMetadata = {
		reason: input.reason ?? null,
		eligible: eligibility.eligible,
		eligibility_reason: eligibility.reason,
	};
	if (input.dry_run) {
		return {
			mode: "preview",
			root,
			target,
			decision: before.decision,
			...repairReportMetadata,
			writes_performed: false,
			changed: false,
			before,
			after: before,
		};
	}
	if (!eligibility.eligible) {
		return {
			mode: "apply",
			root,
			target,
			decision: before.decision,
			...repairReportMetadata,
			writes_performed: false,
			changed: false,
			before,
			after: before,
		};
	}

	withSessionLock(root, lockPathForTarget(target), () => {
		writeLocalState(root);
	});
	const after = await collectProjectCheck(root, maxPaths, entrypoint);
	const changed = !compareCheckSignatures(before, after);

	return {
		mode: "apply",
		root,
		target,
		decision: after.decision,
		...repairReportMetadata,
		writes_performed: true,
		changed,
		before,
		after,
	};
}
