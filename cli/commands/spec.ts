import type { SpecCheckResult } from "../services/spec-gate";
import {
	checkSpecCompatibility,
	getSpecCheck,
	waiveSpecCheck,
} from "../services/spec-gate";

type CommandIo = {
	stdout: (message: string) => void;
	stderr: (message: string) => void;
};

const DEFAULT_IO: CommandIo = {
	stdout: (message) => console.log(message),
	stderr: (message) => console.error(message),
};

type SpecAction = "check" | "conflict" | "waive";

type ParsedArgs = {
	json: boolean;
	session: string;
	task: string;
	reason: string;
	adr: string;
};

function normalizeAction(value: string | undefined): SpecAction {
	if (!value || value === "check" || value === "ck") {
		return "check";
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

export async function runSpecCommand(
	action: string,
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	try {
		const specAction = normalizeAction(action);
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
		const output = parsed.json
			? JSON.stringify({ action: specAction, ...stored })
			: formatResult(specAction, stored);
		io.stdout(output);
		if (specAction === "conflict") {
			return stored.status === "conflict" ? 0 : 1;
		}
		return stored.status === "conflict" ? 1 : 0;
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}
}
