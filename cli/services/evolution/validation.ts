import {
	DEFAULT_EVOLUTION_PATHS,
	isValidIanaTimezone,
	isValidProjectUuid,
} from "./config";

function record(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function requireRecord(
	parent: Record<string, unknown>,
	key: string,
	path: string,
	issues: string[],
): Record<string, unknown> {
	const value = record(parent[key]);
	if (!value) issues.push(`${path} must be an object`);
	return value ?? {};
}

function requireBoolean(
	parent: Record<string, unknown>,
	key: string,
	path: string,
	issues: string[],
): void {
	if (typeof parent[key] !== "boolean") issues.push(`${path} must be boolean`);
}

function requireInteger(
	parent: Record<string, unknown>,
	key: string,
	path: string,
	issues: string[],
): void {
	const value = parent[key];
	if (!Number.isInteger(value) || (value as number) < 1) {
		issues.push(`${path} must be an integer >= 1`);
	}
}

function requireExact(
	parent: Record<string, unknown>,
	key: string,
	expected: unknown,
	path: string,
	issues: string[],
): void {
	if (parent[key] !== expected)
		issues.push(`${path} must be ${String(expected)}`);
}

function requireAfolOwnedProjectRelativePath(
	parent: Record<string, unknown>,
	key: string,
	path: string,
	issues: string[],
): void {
	const value = parent[key];
	const safe =
		typeof value === "string" &&
		value.startsWith(".afol/") &&
		value.length > 0 &&
		value.trim() === value &&
		!value.includes("\\") &&
		!value.includes(":") &&
		!value.startsWith("/") &&
		!value.includes("\0") &&
		value
			.split("/")
			.every(
				(segment) => segment !== "" && segment !== "." && segment !== "..",
			);
	if (!safe) issues.push(`${path} must be an AFOL-owned project-relative path`);
}

export function validateEvolutionConfigExtension(config: unknown): string[] {
	const root = record(config) ?? {};
	if (root.evolution === undefined) return [];
	const issues: string[] = [];
	const project = requireRecord(root, "project", "project", issues);
	if (!isValidProjectUuid(project.id)) {
		issues.push("project.id must be a stable UUID");
	}
	if (!isValidIanaTimezone(project.timezone)) {
		issues.push("project.timezone must be a valid IANA timezone");
	}

	const paths = requireRecord(root, "paths", "paths", issues);
	requireExact(
		paths,
		"external_dir",
		DEFAULT_EVOLUTION_PATHS.externalDir,
		"paths.external_dir",
		issues,
	);
	requireAfolOwnedProjectRelativePath(
		paths,
		"evolution_db",
		"paths.evolution_db",
		issues,
	);
	requireExact(
		paths,
		"evolution_data_dir",
		DEFAULT_EVOLUTION_PATHS.evolutionDataDir,
		"paths.evolution_data_dir",
		issues,
	);
	requireAfolOwnedProjectRelativePath(
		paths,
		"evolution_events_dir",
		"paths.evolution_events_dir",
		issues,
	);

	const evolution = requireRecord(root, "evolution", "evolution", issues);
	requireBoolean(evolution, "enabled", "evolution.enabled", issues);
	const suggestions = requireRecord(
		evolution,
		"suggestions",
		"evolution.suggestions",
		issues,
	);
	requireBoolean(
		suggestions,
		"first_session_of_day",
		"evolution.suggestions.first_session_of_day",
		issues,
	);
	requireExact(
		suggestions,
		"dedupe_scope",
		"project",
		"evolution.suggestions.dedupe_scope",
		issues,
	);
	requireExact(
		suggestions,
		"max_visible_per_day",
		1,
		"evolution.suggestions.max_visible_per_day",
		issues,
	);
	requireBoolean(
		suggestions,
		"remind_skipped_next_day",
		"evolution.suggestions.remind_skipped_next_day",
		issues,
	);
	requireInteger(
		suggestions,
		"deep_review_after_production_days",
		"evolution.suggestions.deep_review_after_production_days",
		issues,
	);

	const preferences = requireRecord(
		evolution,
		"preferences",
		"evolution.preferences",
		issues,
	);
	requireExact(
		preferences,
		"soft_decay_after_production_days",
		7,
		"evolution.preferences.soft_decay_after_production_days",
		issues,
	);
	requireExact(
		preferences,
		"stop_guiding_after_production_days",
		20,
		"evolution.preferences.stop_guiding_after_production_days",
		issues,
	);
	const confidence = preferences.minimum_effective_confidence;
	if (
		typeof confidence !== "number" ||
		!Number.isFinite(confidence) ||
		confidence < 0 ||
		confidence > 1
	) {
		issues.push(
			"evolution.preferences.minimum_effective_confidence must be between 0 and 1",
		);
	}
	requireExact(
		preferences,
		"decay_curve",
		"linear",
		"evolution.preferences.decay_curve",
		issues,
	);

	const recurrence = requireRecord(
		evolution,
		"recurrence",
		"evolution.recurrence",
		issues,
	);
	for (const key of [
		"minimum_occurrences",
		"minimum_distinct_sessions",
		"minimum_distinct_production_days",
	]) {
		requireInteger(recurrence, key, `evolution.recurrence.${key}`, issues);
	}

	const largeChange = requireRecord(
		evolution,
		"large_change",
		"evolution.large_change",
		issues,
	);
	requireInteger(
		largeChange,
		"changed_files",
		"evolution.large_change.changed_files",
		issues,
	);
	requireInteger(
		largeChange,
		"changed_lines",
		"evolution.large_change.changed_lines",
		issues,
	);
	requireBoolean(
		largeChange,
		"critical_paths_trigger",
		"evolution.large_change.critical_paths_trigger",
		issues,
	);

	const external = requireRecord(
		evolution,
		"external",
		"evolution.external",
		issues,
	);
	requireExact(
		external,
		"mode",
		"explicit_import_only",
		"evolution.external.mode",
		issues,
	);
	requireExact(
		external,
		"storage",
		"normalized_sections",
		"evolution.external.storage",
		issues,
	);
	requireExact(
		external,
		"store_raw",
		false,
		"evolution.external.store_raw",
		issues,
	);
	requireExact(
		external,
		"redact_before_persist",
		true,
		"evolution.external.redact_before_persist",
		issues,
	);

	const autonomy = requireRecord(
		evolution,
		"autonomy",
		"evolution.autonomy",
		issues,
	);
	for (const key of [
		"auto_observe",
		"auto_refresh_preference_projections",
		"auto_clean_derived_state",
	]) {
		requireBoolean(autonomy, key, `evolution.autonomy.${key}`, issues);
	}
	if (
		!new Set(["none", "canary", "lessons_memory_only"]).has(
			String(autonomy.auto_apply_mode),
		)
	) {
		issues.push(
			"evolution.autonomy.auto_apply_mode must be none, canary, or lessons_memory_only",
		);
	}
	return issues;
}
