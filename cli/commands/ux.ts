import {
	defaultOperationContext,
	type OperationContext,
	requiresApproval,
} from "../core/operation-context";
import {
	coverageForTool,
	findUxJourney,
	loadUxRegistry,
	registerUxJourneyFromSpec,
	type UxJourneyEntry,
} from "../services/ux/journeys";
import { type CommandIo, DEFAULT_IO, writeLegacyJsonEnvelope } from "./io";

type UxAction = "list" | "show" | "validate" | "coverage" | "register";

type ParsedArgs = {
	json: boolean;
	verbose: boolean;
	dryRun: boolean;
	tool: string;
	fromSpec: string;
	journeyId: string;
};

const UX_COMMAND_HELP = [
	"Usage: afol ux <action> [options]",
	"",
	"Actions",
	"  list                         List registered and spec-derived UX journeys",
	"  show <journey-id>            Show one UX journey entry",
	"  validate                     Validate UX journey registry standards",
	"  coverage --tool <command>    Show journeys covering one AFOL command",
	"  register --from-spec <id>    Create a spec-linked UX journey draft",
	"",
	"Options",
	"  --tool <command>             AFOL command to inspect",
	"  --from-spec <spec-id>        Source spec for UX journey registration",
	"  --dry-run                    Preview registration without writing",
	"  --json                       Emit machine-readable result",
	"  --verbose                    Include detailed entry fields in list output",
].join("\n");

function isHelpArg(value: string | undefined): boolean {
	return value === "help" || value === "-h" || value === "--help";
}

function normalizeAction(value: string | undefined): UxAction {
	if (!value || value === "list" || value === "ls") {
		return "list";
	}
	if (value === "show" || value === "sh") {
		return "show";
	}
	if (value === "validate" || value === "v") {
		return "validate";
	}
	if (value === "coverage" || value === "cov") {
		return "coverage";
	}
	if (value === "register" || value === "reg") {
		return "register";
	}
	throw new Error(`Unknown ux action: ${value}`);
}

function requireValue(args: string[], index: number, flag: string): string {
	const value = args[index + 1];
	if (!value || value.startsWith("-")) {
		throw new Error(`Missing value for ${flag}.`);
	}
	return value;
}

function parseArgs(args: string[]): ParsedArgs {
	const parsed: ParsedArgs = {
		json: false,
		verbose: false,
		dryRun: false,
		tool: "",
		fromSpec: "",
		journeyId: "",
	};
	for (let index = 0; index < args.length; index += 1) {
		const value = args[index];
		if (!value) {
			continue;
		}
		if (value === "--json" || value === "-j") {
			parsed.json = true;
			continue;
		}
		if (value === "--verbose") {
			parsed.verbose = true;
			continue;
		}
		if (value === "--dry-run") {
			parsed.dryRun = true;
			continue;
		}
		if (value === "--tool") {
			parsed.tool = requireValue(args, index, "--tool");
			index += 1;
			continue;
		}
		if (value.startsWith("--tool=")) {
			parsed.tool = value.slice("--tool=".length);
			if (!parsed.tool) {
				throw new Error("Missing value for --tool.");
			}
			continue;
		}
		if (value === "--from-spec") {
			parsed.fromSpec = requireValue(args, index, "--from-spec");
			index += 1;
			continue;
		}
		if (value.startsWith("--from-spec=")) {
			parsed.fromSpec = value.slice("--from-spec=".length);
			if (!parsed.fromSpec) {
				throw new Error("Missing value for --from-spec.");
			}
			continue;
		}
		if (!value.startsWith("-") && !parsed.journeyId) {
			parsed.journeyId = value;
			continue;
		}
		throw new Error(`Unknown ux argument: ${value}`);
	}
	return parsed;
}

function compactEntry(entry: UxJourneyEntry): Record<string, unknown> {
	return {
		id: entry.id,
		path: entry.path,
		doc_type: entry.doc_type,
		status: entry.status,
		source: entry.source,
		title: entry.title,
		commands: entry.commands,
		missing_fields: entry.missing_fields,
		roadmap_feature: entry.roadmap_feature,
		parent_spec: entry.parent_spec,
	};
}

function listEntry(entry: UxJourneyEntry): Record<string, unknown> {
	return {
		id: entry.id,
		status: entry.status,
		source: entry.source,
		doc_type: entry.doc_type,
	};
}

function formatEntries(entries: UxJourneyEntry[], verbose: boolean): string {
	if (entries.length === 0) {
		return "  none";
	}
	return entries
		.flatMap((entry) => {
			const lines = [
				`  - ${entry.id} status=${entry.status || "unknown"} source=${entry.source} path=${entry.path}`,
			];
			if (verbose && entry.commands.length > 0) {
				lines.push(`    commands: ${entry.commands.join(", ")}`);
			}
			return lines;
		})
		.join("\n");
}

function writeJson(
	io: CommandIo,
	action: UxAction,
	data: Record<string, unknown>,
	ok = true,
	exitCode = ok ? 0 : 1,
): void {
	writeLegacyJsonEnvelope(io, `ux.${action}`, data, {
		ok,
		exitCode,
		errorCode: "UX_FAILED",
		errorMessage: "ux command failed",
	});
}

export async function runUxCommand(
	action: string,
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
	ctx: OperationContext = defaultOperationContext(),
): Promise<number> {
	try {
		if (isHelpArg(action) || args.some(isHelpArg)) {
			io.stdout(UX_COMMAND_HELP);
			return 0;
		}
		const uxAction = normalizeAction(action);
		const parsed = parseArgs(args);

		if (uxAction === "list") {
			const snapshot = loadUxRegistry(projectRoot);
			const data = {
				ok: true,
				generated_at: snapshot.generated_at,
				count: snapshot.entries.length,
				issue_count: snapshot.issues.length,
				entries: snapshot.entries.map(
					parsed.verbose ? compactEntry : listEntry,
				),
				issues: snapshot.issues,
				verbose: parsed.verbose,
				detail_hint: parsed.verbose
					? undefined
					: "Pass --verbose for paths, command mentions, and governing fields.",
			};
			if (parsed.json) {
				writeJson(io, uxAction, data);
			} else {
				io.stdout(
					[
						`ux journeys: ${snapshot.entries.length}`,
						`issues: ${snapshot.issues.length}`,
						formatEntries(snapshot.entries, parsed.verbose),
					].join("\n"),
				);
			}
			return 0;
		}

		if (uxAction === "show") {
			if (!parsed.journeyId) {
				throw new Error("Missing journey id for ux show.");
			}
			const entry = findUxJourney(projectRoot, parsed.journeyId);
			if (!entry) {
				const data = { ok: false, id: parsed.journeyId, found: false };
				if (parsed.json) {
					writeJson(io, uxAction, data, false, 1);
				} else {
					io.stderr(`UX journey not found: ${parsed.journeyId}`);
				}
				return 1;
			}
			const data = { ok: true, entry: compactEntry(entry) };
			if (parsed.json) {
				writeJson(io, uxAction, data);
			} else {
				io.stdout(formatEntries([entry], true).trimStart());
			}
			return 0;
		}

		if (uxAction === "validate") {
			const snapshot = loadUxRegistry(projectRoot);
			const errors = snapshot.issues.filter(
				(issue) => issue.severity === "error",
			);
			const data = {
				ok: errors.length === 0,
				generated_at: snapshot.generated_at,
				count: snapshot.entries.length,
				error_count: errors.length,
				warning_count: snapshot.issues.length - errors.length,
				issues: snapshot.issues,
			};
			if (parsed.json) {
				writeJson(
					io,
					uxAction,
					data,
					errors.length === 0,
					errors.length === 0 ? 0 : 1,
				);
			} else {
				io.stdout(
					[
						`ux validate: ${errors.length === 0 ? "passed" : "failed"}`,
						`journeys: ${snapshot.entries.length}`,
						`errors: ${errors.length}`,
						`warnings: ${snapshot.issues.length - errors.length}`,
						...snapshot.issues.map(
							(issue) => `${issue.severity} ${issue.path} ${issue.message}`,
						),
					].join("\n"),
				);
			}
			return errors.length === 0 ? 0 : 1;
		}

		if (uxAction === "coverage") {
			if (!parsed.tool) {
				throw new Error("Missing --tool for ux coverage.");
			}
			const entries = coverageForTool(projectRoot, parsed.tool);
			const data = {
				ok: true,
				tool: parsed.tool,
				count: entries.length,
				entries: entries.map(compactEntry),
			};
			if (parsed.json) {
				writeJson(io, uxAction, data);
			} else {
				io.stdout(
					[
						`ux coverage: ${parsed.tool}`,
						`journeys: ${entries.length}`,
						formatEntries(entries, parsed.verbose),
					].join("\n"),
				);
			}
			return 0;
		}

		if (!parsed.fromSpec) {
			throw new Error("Missing --from-spec for ux register.");
		}
		if (!parsed.dryRun && requiresApproval(ctx)) {
			throw new Error("ux register requires local interactive approval");
		}
		const result = registerUxJourneyFromSpec(projectRoot, parsed.fromSpec, {
			dryRun: parsed.dryRun,
		});
		const data = {
			ok: true,
			created: result.created,
			dry_run: result.dry_run,
			path: result.path,
			entry: compactEntry(result.entry),
		};
		if (parsed.json) {
			writeJson(io, uxAction, data);
		} else {
			io.stdout(
				[
					`ux register${result.dry_run ? " (dry-run)" : ""}: ${result.path}`,
					`created: ${result.created ? "yes" : "no"}`,
				].join("\n"),
			);
		}
		return 0;
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}
}
