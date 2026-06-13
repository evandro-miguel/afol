import { maintenanceMonthly, maintenanceWeekly } from "../services/health";
import {
	envelopeOk,
	envelopeWithLegacyKeys,
	stringifyEnvelope,
	type ResultEnvelope,
} from "../core/envelope";

type CommandIo = {
	stdout: (message: string) => void;
	stderr: (message: string) => void;
};

const DEFAULT_IO: CommandIo = {
	stdout: (message) => console.log(message),
	stderr: (message) => console.error(message),
};

type MaintenanceMode = "weekly" | "monthly";

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
} {
	let mode: MaintenanceMode = "weekly";
	let dryRun = false;
	let json = false;
	for (const value of args) {
		if (value === "weekly" || value === "monthly") {
			mode = value;
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
		throw new Error(`Unknown maintenance argument: ${value}`);
	}
	return { dryRun, json, mode };
}

export async function runMaintenanceCommand(
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	try {
		const parsed = parseArgs(args);
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
								...result,
							},
							`maintenance.${parsed.mode}`,
							0,
						),
						["ok", "mode", "dry_run", "actions", "applied"],
					),
				),
			);
		} else {
			io.stdout(
				[
					`maintenance ${parsed.mode}: ${parsed.dryRun ? "dry-run" : "suggestions"}`,
					`applied: ${result.applied}`,
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
