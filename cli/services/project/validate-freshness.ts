import type {
	FreshnessCheck,
	FreshnessOptions,
	FreshnessReport,
} from "../local-state/freshness";
import { collectFreshnessReport } from "../local-state/freshness";

export type { FreshnessCheck, FreshnessOptions, FreshnessReport };

/**
 * Compatibility entry point for project validation. Freshness semantics and
 * workbench batching are owned by the local-state implementation.
 */
export function collectFreshnessReportFast(
	root: string,
	options: FreshnessOptions = {},
): FreshnessReport {
	return collectFreshnessReport(root, options);
}
