import { relative } from "node:path";
import { migrateAdm } from "../services/adm/migrator";
import { listAdmFiles, resolveAdmPaths } from "../services/adm/paths";
import { buildAdmMigrationPlan } from "../services/adm/planner";
import { validateAdmMigration } from "../services/adm/validate";
import { type CommandIo, DEFAULT_IO, writeLegacyJsonEnvelope } from "./io";

type AdmAction = "paths" | "show" | "plan" | "migrate" | "validate";

function normalizeAction(value: string | undefined): AdmAction {
	if (!value || value === "paths") {
		return "paths";
	}
	if (value === "show") {
		return "show";
	}
	if (value === "plan") {
		return "plan";
	}
	if (value === "migrate") {
		return "migrate";
	}
	if (value === "validate") {
		return "validate";
	}
	throw new Error(`Unknown adm action: ${value}`);
}

function parseArgs(args: string[]): { dryRun: boolean; json: boolean } {
	let dryRun = false;
	let json = false;
	for (const value of args) {
		if (value === "--dry-run") {
			dryRun = true;
			continue;
		}
		if (value === "--json" || value === "-j") {
			json = true;
			continue;
		}
		throw new Error(`Unknown adm argument: ${value}`);
	}
	return { dryRun, json };
}

function toRelative(
	root: string,
	paths: Record<string, string>,
): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(paths)) {
		result[key] = relative(root, value);
	}
	return result;
}

function writeJsonEnvelope(
	io: CommandIo,
	data: Record<string, unknown>,
	ok: boolean,
): void {
	writeLegacyJsonEnvelope(io, String(data.action ?? "adm"), data, {
		ok,
		errorCode: "ADM_FAILED",
		errorMessage: "adm command failed",
		exitCode: ok ? 0 : 1,
	});
}

export async function runAdmCommand(
	action: string,
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	try {
		const admAction = normalizeAction(action);
		const parsed = parseArgs(args);
		if (admAction === "paths") {
			const paths = resolveAdmPaths(projectRoot);
			if (parsed.json) {
				writeJsonEnvelope(io, { action: admAction, paths }, true);
			} else {
				io.stdout(
					Object.entries(toRelative(projectRoot, paths))
						.map(([key, value]) => `${key}: ${value}`)
						.join("\n"),
				);
			}
			return 0;
		}

		if (admAction === "plan" || admAction === "migrate") {
			if (admAction === "plan" && parsed.dryRun) {
				throw new Error("Unknown adm argument: --dry-run");
			}
			if (admAction === "plan") {
				const result = buildAdmMigrationPlan(projectRoot);
				if (parsed.json) {
					writeJsonEnvelope(io, { action: admAction, ...result }, true);
				} else {
					io.stdout(
						[
							`${admAction}: ${result.manifest.length} files`,
							...result.manifest.map(
								(entry) => `${entry.source_path} -> ${entry.target_path}`,
							),
						].join("\n"),
					);
				}
				return 0;
			}

			if (parsed.dryRun) {
				const result = buildAdmMigrationPlan(projectRoot);
				if (parsed.json) {
					writeJsonEnvelope(
						io,
						{
							action: admAction,
							dry_run: true,
							archive_path: null,
							count: result.manifest.length,
							manifest: result.manifest,
						},
						true,
					);
				} else {
					io.stdout(
						[
							`${admAction}: ${result.manifest.length} files`,
							"archive: (dry-run)",
						].join("\n"),
					);
				}
				return 0;
			}

			const result = migrateAdm(projectRoot);
			if (parsed.json) {
				writeJsonEnvelope(io, { action: admAction, ...result }, true);
			} else {
				io.stdout(
					[
						`${admAction}: ${result.manifest.length} files`,
						`archive: ${result.archive_path}`,
					].join("\n"),
				);
			}
			return 0;
		}

		if (admAction === "validate") {
			if (parsed.dryRun) {
				throw new Error("Unknown adm argument: --dry-run");
			}
			const report = validateAdmMigration(projectRoot);
			if (parsed.json) {
				writeJsonEnvelope(io, { action: admAction, ...report }, report.ok);
			} else {
				io.stdout(
					[
						`${admAction}: ${report.ok ? "passed" : "failed"}`,
						`checked_at: ${report.checked_at}`,
						`findings: ${report.findings.length}`,
						...report.findings.map((finding) => {
							const hint = finding.hint ? ` hint=${finding.hint}` : "";
							return `${finding.severity} ${finding.domain} ${finding.id} ${finding.message}${hint}`;
						}),
					].join("\n"),
				);
			}
			return report.ok ? 0 : 1;
		}

		const files = listAdmFiles(projectRoot);
		if (parsed.json) {
			writeJsonEnvelope(io, { action: admAction, files }, true);
		} else {
			io.stdout(files.join("\n"));
		}
		return 0;
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}
}
