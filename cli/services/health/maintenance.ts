import { checkHealth } from "./checker";

export function maintenanceWeekly(
	root: string,
	dryRun: boolean,
): { actions: string[]; applied: boolean } {
	const report = checkHealth(root, { deep: false, includeAuxiliary: true });
	const actions = [
		"check PSTR stale",
		"rebuild stale indexes",
		"archive old sessions",
	];
	if (report.summary.fail > 0) {
		actions.unshift("review health failures");
	}
	void dryRun;
	return { actions, applied: false };
}

export function maintenanceMonthly(
	root: string,
	dryRun: boolean,
): { actions: string[]; applied: boolean } {
	const report = checkHealth(root, { deep: false, includeAuxiliary: true });
	const actions = [
		"rotate logs",
		"archive closed sessions older than 90 days",
		"rebuild stale indexes",
	];
	if (report.summary.fail > 0) {
		actions.unshift("review health failures");
	}
	void dryRun;
	return { actions, applied: false };
}
