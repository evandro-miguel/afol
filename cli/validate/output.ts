import type { RegistrySnapshot } from "./types";

const OUTPUT_TAIL_LIMIT = 4000;

export function outputJson(payload: Record<string, unknown>): number {
	process.stdout.write(`${JSON.stringify(payload)}\n`);
	return 0;
}

export function outputJsonWithStatus(
	payload: Record<string, unknown>,
	status: number,
): number {
	process.stdout.write(`${JSON.stringify(payload)}\n`);
	return status;
}

export function outputTail(value: string): string {
	if (value.length <= OUTPUT_TAIL_LIMIT) {
		return value;
	}
	return value.slice(value.length - OUTPUT_TAIL_LIMIT);
}

export function registrySummary(
	snapshot: RegistrySnapshot,
): Array<Record<string, unknown>> {
	return snapshot.packs.map((entry) => ({
		pack_id: entry.pack_id,
		min_scenarios: entry.min_scenarios,
		scenario_count: (snapshot.scenariosByPack[entry.pack_id] ?? []).length,
		baseline_present: Boolean(snapshot.baselinesByPack[entry.pack_id]),
	}));
}
