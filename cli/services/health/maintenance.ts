import { checkHealth } from "./checker";
import { summarizeMaintenanceReviewDue } from "./maintenance-review";

export function maintenanceWeekly(
	root: string,
	dryRun: boolean,
): { actions: string[]; planOnly: true } {
	const report = checkHealth(root, { deep: false, includeAuxiliary: true });
	const maintenanceReview = summarizeMaintenanceReviewDue(root);
	const actions = [
		"check PSTR stale",
		"rebuild stale indexes",
		"archive old sessions",
	];
	if (maintenanceReview.dueAreas.length > 0) {
		actions.push(
			`review maintenance areas: ${maintenanceReview.dueAreas.join(", ")}`,
		);
	}
	if (maintenanceReview.storeStatus === "malformed") {
		actions.push(
			`repair maintenance review store: ${maintenanceReview.storeError ?? "malformed state"}`,
		);
	}
	if (report.summary.fail > 0) {
		actions.unshift("review health failures");
	}
	void dryRun;
	return { actions, planOnly: true };
}

export function maintenanceMonthly(
	root: string,
	dryRun: boolean,
): { actions: string[]; planOnly: true } {
	const report = checkHealth(root, { deep: false, includeAuxiliary: true });
	const actions = [
		"rotate logs",
		"review roadmap/spec/manifest alignment",
		"prune obsolete rules/skills",
		"archive closed sessions older than 90 days",
		"rebuild stale indexes",
	];
	if (report.summary.fail > 0) {
		actions.unshift("review health failures");
	}
	void dryRun;
	return { actions, planOnly: true };
}
