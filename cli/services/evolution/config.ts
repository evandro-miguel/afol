export const DEFAULT_EVOLUTION_TIMEZONE = "UTC";
export type EvolutionPaths = {
	externalDir: string;
	evolutionDb: string;
	evolutionDataDir: string;
	evolutionEventsDir: string;
};

export const DEFAULT_EVOLUTION_PATHS: Readonly<EvolutionPaths> = Object.freeze({
	externalDir: ".afol/external",
	evolutionDb: ".afol/state/evolution.db",
	evolutionDataDir: ".afol/data/evolution",
	evolutionEventsDir: ".afol/data/events/evolution",
});
export const DEFAULT_EVOLUTION_SETTINGS: Readonly<Record<string, unknown>> =
	Object.freeze({
		enabled: true,
		suggestions: {
			first_session_of_day: true,
			dedupe_scope: "project",
			max_visible_per_day: 1,
			remind_skipped_next_day: true,
			deep_review_after_production_days: 5,
		},
		preferences: {
			soft_decay_after_production_days: 7,
			stop_guiding_after_production_days: 20,
			minimum_effective_confidence: 0.65,
			decay_curve: "linear",
		},
		recurrence: {
			minimum_occurrences: 3,
			minimum_distinct_sessions: 2,
			minimum_distinct_production_days: 2,
		},
		large_change: {
			changed_files: 20,
			changed_lines: 1000,
			critical_paths_trigger: true,
		},
		external: {
			mode: "explicit_import_only",
			storage: "normalized_sections",
			store_raw: false,
			redact_before_persist: true,
		},
		autonomy: {
			auto_observe: true,
			auto_refresh_preference_projections: true,
			auto_clean_derived_state: true,
			auto_apply_mode: "none",
		},
	});
const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EvolutionIdentity = {
	projectId: string | null;
	timezone: string;
	usedDefaultProjectId: boolean;
	usedDefaultTimezone: boolean;
};

export type ResolvedEvolutionConfig = EvolutionIdentity & {
	configured: boolean;
	enabled: boolean;
	paths: EvolutionPaths;
	settings: Record<string, unknown>;
};

export function isValidProjectUuid(value: unknown): value is string {
	return typeof value === "string" && UUID_RE.test(value);
}

export function isValidIanaTimezone(value: unknown): value is string {
	if (
		typeof value !== "string" ||
		(!/^UTC$/.test(value) &&
			!/^(?:[A-Za-z_]+\/){1,2}[A-Za-z0-9_+.-]+$/.test(value))
	)
		return false;
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
		return true;
	} catch {
		return false;
	}
}

export function validateEvolutionIdentity(input: {
	projectId: unknown;
	timezone: unknown;
}): void {
	if (!isValidProjectUuid(input.projectId))
		throw new Error("invalid evolution project UUID");
	if (!isValidIanaTimezone(input.timezone))
		throw new Error("invalid evolution IANA timezone");
}

/** Read v1 config without mutating legacy projects. */
export function resolveEvolutionIdentity(config: unknown): EvolutionIdentity {
	const root =
		config !== null && typeof config === "object" && !Array.isArray(config)
			? (config as Record<string, unknown>)
			: {};
	const evolutionConfigured = root.evolution !== undefined;
	const project = root.project;
	const projectObject =
		project !== null && typeof project === "object" && !Array.isArray(project)
			? (project as Record<string, unknown>)
			: {};
	if (evolutionConfigured) {
		if (!isValidProjectUuid(projectObject.id))
			throw new Error("invalid evolution project UUID");
		if (!isValidIanaTimezone(projectObject.timezone))
			throw new Error("invalid evolution IANA timezone");
	}
	const projectId = isValidProjectUuid(projectObject.id)
		? projectObject.id
		: null;
	const timezone = isValidIanaTimezone(projectObject.timezone)
		? projectObject.timezone
		: DEFAULT_EVOLUTION_TIMEZONE;
	return {
		projectId,
		timezone,
		usedDefaultProjectId: projectId === null,
		usedDefaultTimezone: projectObject.timezone === undefined,
	};
}

export function localDateForTimezone(date: Date, timezone: string): string {
	if (!isValidIanaTimezone(timezone))
		throw new Error("invalid evolution IANA timezone");
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);
	const values = Object.fromEntries(
		parts.map((part) => [part.type, part.value]),
	);
	return `${values.year}-${values.month}-${values.day}`;
}
