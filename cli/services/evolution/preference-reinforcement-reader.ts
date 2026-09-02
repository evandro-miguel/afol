import { readPreferenceJournal } from "./preference-journal-reader";

export function preferenceReinforcementExceedsProductionOrdinal(
	root: string,
	projectId: string,
	canonicalMax: number,
	eventsDir?: string,
): string | null {
	return (
		readPreferenceJournal(root, projectId, eventsDir).find(
			(event) =>
				event.payload.preference.last_reinforced_production_day > canonicalMax,
		)?.payload.preference.id ?? null
	);
}
