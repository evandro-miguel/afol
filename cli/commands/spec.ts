import {
	rebuildSpecsIndex,
	type SpecIndexEntry,
	type SpecsIndexSnapshot,
} from "../services/local-state/project-indexes";
import {
	checkSpecCompatibility,
	getSpecCheck,
	waiveSpecCheck,
} from "../services/spec-gate/checker";
import type { SpecCheckResult } from "../services/spec-gate/types";
import {
	type CommandIo,
	createJsonWriters,
	DEFAULT_IO,
	writeLegacyJsonEnvelope,
} from "./io";

type SpecAction = "check" | "conflict" | "waive" | "list";

type ParsedArgs = {
	json: boolean;
	session: string;
	task: string;
	reason: string;
	adr: string;
};

type ParsedListArgs = {
	json: boolean;
	verbose: boolean;
};

type CompactSpecListEntry = Pick<SpecIndexEntry, "id"> &
	Partial<Pick<SpecIndexEntry, "status" | "theme">>;

const SPEC_JSON = createJsonWriters("spec");

const SPEC_COMMAND_HELP = [
	"Usage: afol spec <action> [options]",
	"",
	"Actions",
	"  list                 List indexed specs from .afol/adm/specs",
	"  check                Check task/spec compatibility",
	"  conflict             Exit 0 when task/spec compatibility conflicts",
	"  waive                Waive a spec conflict",
	"",
	"Options",
	"  --session <id>       Workbench session for check/conflict/waive",
	"  --task <id>          Workbench task for check/conflict/waive",
	"  --reason <text>      Waiver reason",
	"  --adr <id>           ADR reference for waiver",
	"  --json               Emit machine-readable result",
	"  --verbose            Include paths and timestamps in spec list JSON",
].join("\n");

function isHelpArg(value: string | undefined): boolean {
	return value === "help" || value === "-h" || value === "--help";
}

function normalizeAction(value: string | undefined): SpecAction {
	if (!value || value === "check" || value === "ck") {
		return "check";
	}
	if (value === "list" || value === "ls") {
		return "list";
	}
	if (value === "conflict" || value === "cf") {
		return "conflict";
	}
	if (value === "waive" || value === "wv") {
		return "waive";
	}
	throw new Error(`Unknown spec action: ${value}`);
}

function parseArgs(args: string[]): ParsedArgs {
	const parsed: ParsedArgs = {
		json: false,
		session: "",
		task: "",
		reason: "",
		adr: "",
	};
	for (let index = 0; index < args.length; index += 1) {
		const value = args[index];
		if (value === "--json" || value === "-j") {
			parsed.json = true;
			continue;
		}
		if (value === "--session" || value === "-S") {
			const next = args[index + 1];
			if (!next) {
				throw new Error("Missing value for --session in spec.");
			}
			parsed.session = next;
			index += 1;
			continue;
		}
		if (value === "--task" || value === "-T") {
			const next = args[index + 1];
			if (!next) {
				throw new Error("Missing value for --task in spec.");
			}
			parsed.task = next;
			index += 1;
			continue;
		}
		if (value === "--reason") {
			const next = args[index + 1];
			if (!next) {
				throw new Error("Missing value for --reason in spec.");
			}
			parsed.reason = next;
			index += 1;
			continue;
		}
		if (value === "--adr") {
			const next = args[index + 1];
			if (!next) {
				throw new Error("Missing value for --adr in spec.");
			}
			parsed.adr = next;
			index += 1;
			continue;
		}
		throw new Error(`Unknown spec argument: ${value}`);
	}
	if (!parsed.session) {
		throw new Error("Missing --session for spec.");
	}
	if (!parsed.task) {
		throw new Error("Missing --task for spec.");
	}
	return parsed;
}

function parseListArgs(args: string[]): ParsedListArgs {
	const parsed: ParsedListArgs = { json: false, verbose: false };
	for (const value of args) {
		if (value === "--json" || value === "-j") {
			parsed.json = true;
			continue;
		}
		if (value === "--verbose" || value === "-v") {
			parsed.verbose = true;
			continue;
		}
		throw new Error(`Unknown spec list argument: ${value}`);
	}
	return parsed;
}

function formatResult(action: SpecAction, result: SpecCheckResult): string {
	const base = [
		`spec ${action}: ${result.status}`,
		`session: ${result.session_id}`,
		`task: ${result.task_id}`,
	];
	if (result.spec_id) {
		base.push(`spec: ${result.spec_id}`);
	}
	if (result.waiver_reason) {
		base.push(`reason: ${result.waiver_reason}`);
	}
	if (result.adr_ref) {
		base.push(`adr: ${result.adr_ref}`);
	}
	base.push(`checked_at: ${result.checked_at}`);
	return base.join("\n");
}

function writeJsonResult(
	io: CommandIo,
	action: SpecAction,
	result: SpecCheckResult,
	exitCode: number,
): void {
	const data = { action, ...result };
	writeLegacyJsonEnvelope(io, `spec.${action}`, data, {
		ok: exitCode === 0,
		errorCode: "SPEC_CONFLICT",
		errorMessage: "spec compatibility check failed",
		exitCode,
	});
}

function formatSpecList(snapshot: SpecsIndexSnapshot): string {
	if (snapshot.specs.length === 0) {
		return "specs: 0";
	}
	return [
		`specs: ${snapshot.specs.length}`,
		...snapshot.specs.map((spec) => {
			const status = spec.status ? ` status=${spec.status}` : "";
			const theme = spec.theme ? ` theme=${spec.theme}` : "";
			return `- ${spec.id}${status}${theme} path=${spec.path}`;
		}),
	].join("\n");
}

function writeSpecListJson(
	io: CommandIo,
	snapshot: SpecsIndexSnapshot,
	verbose: boolean,
): void {
	const specs = verbose
		? snapshot.specs
		: snapshot.specs.map(
				(spec): CompactSpecListEntry => ({
					id: spec.id,
					...(spec.status ? { status: spec.status } : {}),
					...(spec.theme ? { theme: spec.theme } : {}),
				}),
			);
	SPEC_JSON.ok(
		io,
		"list",
		{
			action: "list",
			count: snapshot.specs.length,
			specs,
		},
		["action", "count"],
	);
}

export async function runSpecCommand(
	action: string,
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	try {
		if (
			isHelpArg(action) ||
			(!action && args.length === 1 && isHelpArg(args[0]))
		) {
			io.stdout(SPEC_COMMAND_HELP);
			return 0;
		}
		const specAction = normalizeAction(action);
		if (specAction === "list") {
			if (args.length === 1 && isHelpArg(args[0])) {
				io.stdout(SPEC_COMMAND_HELP);
				return 0;
			}
			const parsed = parseListArgs(args);
			const snapshot = rebuildSpecsIndex(projectRoot);
			if (parsed.json) {
				writeSpecListJson(io, snapshot, parsed.verbose);
			} else {
				io.stdout(formatSpecList(snapshot));
			}
			return 0;
		}
		const parsed = parseArgs(args);
		if (specAction === "waive" && !parsed.reason.trim()) {
			throw new Error("Missing --reason for spec waive.");
		}
		const result =
			specAction === "waive"
				? waiveSpecCheck(
						projectRoot,
						parsed.session,
						parsed.task,
						parsed.reason,
						parsed.adr || undefined,
					)
				: checkSpecCompatibility(projectRoot, parsed.session, parsed.task);
		const stored =
			getSpecCheck(projectRoot, parsed.session, parsed.task) ?? result;
		const exitCode =
			specAction === "conflict"
				? stored.status === "conflict"
					? 0
					: 1
				: stored.status === "conflict"
					? 1
					: 0;
		if (parsed.json) {
			writeJsonResult(io, specAction, stored, exitCode);
		} else {
			io.stdout(formatResult(specAction, stored));
		}
		return exitCode;
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}
}
