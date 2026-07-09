import { envelopeOk, stringifyEnvelope } from "../core/envelope";
import {
	formatPendingSpecBlocker,
	readPendingSpecIndex,
	resolvePendingSpec,
} from "../services/governance/pending-specs";
import { writeJsonError } from "./workbench/shared";

type GovernanceIo = {
	stdout: (message: string) => void;
	stderr: (message: string) => void;
};

const DEFAULT_IO: GovernanceIo = {
	stdout: console.log,
	stderr: console.error,
};

type PendingArgs = {
	json: boolean;
	all: boolean;
};

type ResolveSpecArgs = {
	session: string;
	featureId: string;
	parentSpec: string;
	noSpecRequired: boolean;
	reason: string;
	json: boolean;
};

function hasJsonFlag(args: readonly string[]): boolean {
	return args.includes("--json") || args.includes("-j");
}

function parsePendingArgs(args: string[]): PendingArgs {
	let json = false;
	let all = false;
	for (const arg of args) {
		if (arg === "--json" || arg === "-j") {
			json = true;
			continue;
		}
		if (arg === "--all") {
			all = true;
			continue;
		}
		throw new Error(`Unknown governance pending argument: ${arg}`);
	}
	return { json, all };
}

function parseResolveSpecArgs(args: string[]): ResolveSpecArgs {
	let session = "";
	let featureId = "";
	let parentSpec = "";
	let noSpecRequired = false;
	let reason = "";
	let json = false;
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		const value = args[index + 1];
		if (arg === "--json" || arg === "-j") {
			json = true;
			continue;
		}
		if (arg === "--session") {
			if (!value) throw new Error("Missing value for --session.");
			session = value;
			index += 1;
			continue;
		}
		if (arg === "--feature-id") {
			if (!value) throw new Error("Missing value for --feature-id.");
			featureId = value;
			index += 1;
			continue;
		}
		if (arg === "--parent-spec") {
			if (!value) throw new Error("Missing value for --parent-spec.");
			parentSpec = value;
			index += 1;
			continue;
		}
		if (arg === "--no-spec-required") {
			noSpecRequired = true;
			continue;
		}
		if (arg === "--reason") {
			if (!value) throw new Error("Missing value for --reason.");
			reason = value;
			index += 1;
			continue;
		}
		throw new Error(`Unknown governance resolve-spec argument: ${arg}`);
	}
	if (!session) {
		throw new Error("Missing --session for governance resolve-spec.");
	}
	if (noSpecRequired) {
		if (!reason.trim()) {
			throw new Error(
				"Missing --reason for --no-spec-required in governance resolve-spec.",
			);
		}
		if (featureId || parentSpec) {
			throw new Error(
				"Do not pass --feature-id or --parent-spec when waiving spec requirement.",
			);
		}
	} else if (!featureId || !parentSpec) {
		throw new Error(
			"governance resolve-spec requires --feature-id and --parent-spec unless --no-spec-required --reason is used.",
		);
	}
	return {
		session,
		featureId,
		parentSpec,
		noSpecRequired,
		reason,
		json,
	};
}

function runPendingCommand(
	args: string[],
	root: string,
	io: GovernanceIo,
): number {
	const parsed = parsePendingArgs(args);
	const index = readPendingSpecIndex(root);
	const entries = parsed.all
		? index.entries
		: index.entries.filter((entry) => entry.status === "open");
	if (parsed.json) {
		io.stdout(
			stringifyEnvelope(
				envelopeOk(
					{
						status: "ok",
						total: entries.length,
						entries,
					},
					{ action: "governance.pending" },
				),
			),
		);
		return 0;
	}
	if (entries.length === 0) {
		io.stdout("pending_spec: none");
		return 0;
	}
	io.stdout(formatPendingSpecBlocker(entries));
	return 0;
}

function runResolveSpecCommand(
	args: string[],
	root: string,
	io: GovernanceIo,
): number {
	const parsed = parseResolveSpecArgs(args);
	const entry = resolvePendingSpec(root, {
		session: parsed.session,
		...(parsed.featureId ? { featureId: parsed.featureId } : {}),
		...(parsed.parentSpec ? { parentSpec: parsed.parentSpec } : {}),
		...(parsed.noSpecRequired ? { noSpecRequiredReason: parsed.reason } : {}),
	});
	if (parsed.json) {
		io.stdout(
			stringifyEnvelope(
				envelopeOk(
					{
						status: entry.status,
						session: entry.session_id,
						entry,
					},
					{ action: "governance.resolve-spec" },
				),
			),
		);
		return 0;
	}
	io.stdout(
		`pending_spec ${entry.status}: ${entry.session_id}${
			entry.parent_spec ? ` parent_spec=${entry.parent_spec}` : ""
		}`,
	);
	return 0;
}

export function runGovernanceCommand(
	action: string,
	args: string[],
	root: string = process.cwd(),
	io: GovernanceIo = DEFAULT_IO,
): number {
	try {
		const resolvedAction = action || "pending";
		if (resolvedAction === "pending") {
			return runPendingCommand(args, root, io);
		}
		if (resolvedAction === "resolve-spec") {
			return runResolveSpecCommand(args, root, io);
		}
		throw new Error(`Unknown governance action: ${resolvedAction}`);
	} catch (error) {
		if (hasJsonFlag(args)) {
			writeJsonError("governance", error);
		} else {
			io.stderr((error as Error).message);
		}
		return 2;
	}
}
