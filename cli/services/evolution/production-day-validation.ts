import type { Database } from "bun:sqlite";

export type ProductionDayProjectionValidationContext = {
	root: string;
	projectId: string;
	timezone: string;
	evolutionEventsDir?: string;
	db: Database;
};

export type ProductionDayProjectionValidationDependencies<Event, Row> = {
	read: (
		root: string,
		projectId: string,
		timezone: string,
		eventsDir?: string,
	) => Event[];
	replay: (projectId: string, events: readonly Event[]) => Row[];
	rows: (db: Database, projectId: string) => Row[];
	digest: (value: unknown) => string;
};

const READ_RETRIES = 3;

export function validateProductionDayProjection<Event, Row>(
	context: ProductionDayProjectionValidationContext,
	dependencies: ProductionDayProjectionValidationDependencies<Event, Row>,
): void {
	let lastError: unknown;
	for (let attempt = 0; attempt < READ_RETRIES; attempt += 1) {
		try {
			const before = dependencies.read(
				context.root,
				context.projectId,
				context.timezone,
				context.evolutionEventsDir,
			);
			const expected = dependencies.replay(context.projectId, before);
			const actual = dependencies.rows(context.db, context.projectId);
			const after = dependencies.read(
				context.root,
				context.projectId,
				context.timezone,
				context.evolutionEventsDir,
			);
			const actualAfter = dependencies.rows(context.db, context.projectId);
			if (
				dependencies.digest(before) !== dependencies.digest(after) ||
				dependencies.digest(actual) !== dependencies.digest(actualAfter)
			) {
				lastError = new Error("evolution state changed during read");
				Bun.sleepSync(25);
				continue;
			}
			if (dependencies.digest(actual) !== dependencies.digest(expected)) {
				lastError = new Error(
					"evolution db projection differs from canonical production-day journal",
				);
				Bun.sleepSync(25);
				continue;
			}
			return;
		} catch (error) {
			lastError = error;
			if (
				!(
					error instanceof Error &&
					error.message === "evolution state changed during read"
				)
			)
				throw error;
		}
	}
	throw lastError;
}
