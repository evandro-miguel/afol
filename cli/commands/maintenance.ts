import {
	envelopeOk,
	envelopeWithLegacyKeys,
	type ResultEnvelope,
	stringifyEnvelope,
} from "../core/envelope";
import { maintenanceMonthly, maintenanceWeekly } from "../services/health";
import {
	MAINTENANCE_REVIEW_AREAS,
	type MaintenanceReviewAreaSelection,
	recordMaintenanceReview,
} from "../services/health/maintenance-review";
import { type CommandIo, DEFAULT_IO } from "./io";

type MaintenanceMode = "weekly" | "monthly" | "review";

function resultEnvelope<T extends Record<string, unknown>>(
	data: T,
	action: string,
	exitCode: number,
): ResultEnvelope<T> {
	return exitCode === 0
		? envelopeOk(data, { action, exitCode })
		: {
				schema: "afol.result/v1",
				ok: false,
				action,
				exit_code: exitCode,
				data,
			};
}

function parseArgs(args: string[]): {
	dryRun: boolean;
	json: boolean;
	mode: MaintenanceMode;
	area: MaintenanceReviewAreaSelection;
	note: string | undefined;
} {
	let mode: MaintenanceMode = "weekly";
	let dryRun = false;
	let json = false;
	let area: MaintenanceReviewAreaSelection = "all";
	let note: string | undefined;
	for (let index = 0; index < args.length; index += 1) {
		const value = args[index];
		if (value === "weekly" || value === "monthly" || value === "review") {
			mode = value;
			continue;
		}
		if (value === "--area") {
			const next = args[index + 1];
			if (
				next !== "all" &&
				!MAINTENANCE_REVIEW_AREAS.includes(
					next as (typeof MAINTENANCE_REVIEW_AREAS)[number],
				)
			) {
				throw new Error("Missing or invalid value for --area.");
			}
			area = (next ?? "all") as MaintenanceReviewAreaSelection;
			index += 1;
			continue;
		}
		if (value === "--note") {
			const next = args[index + 1];
			if (!next) {
				throw new Error("Missing value for --note.");
			}
			note = next;
			index += 1;
			continue;
		}
		if (value === "--dry-run") {
			dryRun = true;
			continue;
		}
		if (value === "--json" || value === "-j") {
			json = true;
			continue;
		}
		if (
			mode === "review" &&
			(value === "all" ||
				MAINTENANCE_REVIEW_AREAS.includes(
					value as (typeof MAINTENANCE_REVIEW_AREAS)[number],
				))
		) {
			area = value as MaintenanceReviewAreaSelection;
			continue;
		}
		throw new Error(`Unknown maintenance argument: ${value}`);
	}
	return { dryRun, json, mode, area, note };
}

export async function runMaintenanceCommand(
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	try {
		const parsed = parseArgs(args);
		if (parsed.mode === "review") {
			const result = recordMaintenanceReview(projectRoot, {
				area: parsed.area,
				dryRun: parsed.dryRun,
				...(parsed.note ? { note: parsed.note } : {}),
			});
			if (parsed.json) {
				io.stdout(
					stringifyEnvelope(
						envelopeWithLegacyKeys(
							resultEnvelope(
								{
									ok: true,
									mode: parsed.mode,
									area: result.area,
									reviewed_areas: result.reviewed_areas,
									dry_run: result.dry_run,
									recorded_at: result.recorded_at,
									note: result.note,
									review_interval_days: result.summary.review_interval_days,
									due_areas: result.summary.due_areas,
								},
								"maintenance.review",
								0,
							),
							[
								"ok",
								"mode",
								"area",
								"reviewed_areas",
								"dry_run",
								"recorded_at",
								"note",
								"review_interval_days",
								"due_areas",
							],
						),
					),
				);
			} else {
				io.stdout(
					[
						`maintenance review recorded${parsed.dryRun ? " (dry-run)" : ""}: ${result.reviewed_areas.join(", ")}`,
						`  due next: ${result.summary.due_areas.join(", ") || "none"}`,
					].join("\n"),
				);
			}
			return 0;
		}
		const result =
			parsed.mode === "weekly"
				? maintenanceWeekly(projectRoot, parsed.dryRun)
				: maintenanceMonthly(projectRoot, parsed.dryRun);
		if (parsed.json) {
			io.stdout(
				stringifyEnvelope(
					envelopeWithLegacyKeys(
						resultEnvelope(
							{
								ok: true,
								mode: parsed.mode,
								dry_run: parsed.dryRun,
								actions: result.actions,
								plan_only: result.planOnly,
							},
							`maintenance.${parsed.mode}`,
							0,
						),
						["ok", "mode", "dry_run", "actions", "plan_only"],
					),
				),
			);
		} else {
			io.stdout(
				[
					`maintenance ${parsed.mode} plan${parsed.dryRun ? " (dry-run)" : ""}:`,
					...result.actions.map((action) => `  - ${action}`),
				].join("\n"),
			);
		}
		return 0;
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}
}
