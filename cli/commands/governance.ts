import { envelopeOk, stringifyEnvelope } from "../core/envelope";
import {
	defaultOperationContext,
	type OperationContext,
	requiresApproval,
} from "../core/operation-context";
import {
	activateRoadmapFeature,
	formatPendingSpecBlocker,
	type GovernanceActivationRuntime,
	readPendingSpecIndex,
	repairPendingSpecIndex,
	resolvePendingSpec,
} from "../services/governance/pending-specs";
import { resolveSession } from "../services/workbench/session-context";
import { writeJsonError } from "./workbench/shared";

type GovernanceIo = {
	stdout: (message: string) => void;
	stderr: (message: string) => void;
};

const DEFAULT_IO: GovernanceIo = {
	stdout: console.log,
	stderr: console.error,
};

const DEFAULT_BULK_WAIVE_LIMIT = 20;
const MAX_EXPLICIT_BULK_SESSIONS = 100;
const PREVIEW_ID_LIMIT = 5;

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

type BulkWaiveArgs = {
	reason: string;
	sessions: string[];
	limit: number | undefined;
	dryRun: boolean;
	json: boolean;
};

type BulkWaiveError = {
	session: string;
	message: string;
};

type ActivateFeatureArgs = {
	featureId: string;
	parentSpec: string;
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

function parseBulkWaiveArgs(args: string[]): BulkWaiveArgs {
	let reason = "";
	let limit: number | undefined;
	let dryRun = false;
	let json = false;
	const sessions: string[] = [];
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		const value = args[index + 1];
		if (arg === "--json" || arg === "-j") {
			json = true;
			continue;
		}
		if (arg === "--dry-run") {
			dryRun = true;
			continue;
		}
		if (arg === "--reason") {
			if (!value) throw new Error("Missing value for --reason.");
			reason = value;
			index += 1;
			continue;
		}
		if (arg === "--limit") {
			if (!value) throw new Error("Missing value for --limit.");
			const parsedLimit = Number(value);
			if (!Number.isInteger(parsedLimit) || parsedLimit < 0) {
				throw new Error("--limit must be a non-negative integer.");
			}
			limit = parsedLimit;
			index += 1;
			continue;
		}
		if (arg === "--session") {
			if (!value) throw new Error("Missing value for --session.");
			sessions.push(value);
			index += 1;
			continue;
		}
		throw new Error(`Unknown governance bulk-waive argument: ${arg}`);
	}
	if (!reason.trim()) {
		throw new Error("Missing --reason for governance bulk-waive.");
	}
	if (sessions.length > MAX_EXPLICIT_BULK_SESSIONS) {
		throw new Error(
			`governance bulk-waive accepts at most ${MAX_EXPLICIT_BULK_SESSIONS} explicit --session values.`,
		);
	}
	return {
		reason: reason.trim(),
		sessions,
		limit,
		dryRun,
		json,
	};
}

function parseActivateFeatureArgs(args: string[]): ActivateFeatureArgs {
	let featureId = "";
	let parentSpec = "";
	let json = false;
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		const value = args[index + 1];
		if (arg === "--json" || arg === "-j") {
			json = true;
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
		throw new Error(`Unknown governance activate-feature argument: ${arg}`);
	}
	if (!featureId.trim())
		throw new Error("governance activate-feature requires --feature-id.");
	return { featureId: featureId.trim(), parentSpec: parentSpec.trim(), json };
}

function resolveDefaultSession(root: string): string {
	const resolved = resolveSession(root, {});
	if (!resolved) {
		throw new Error(
			"Missing usable session for governance resolve-spec. Pass --session/-S or bind an active session.",
		);
	}
	return resolved.session;
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
	const session = parsed.session || resolveDefaultSession(root);
	const entry = resolvePendingSpec(root, {
		session,
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

function runActivateFeatureCommand(
	args: string[],
	root: string,
	io: GovernanceIo,
	runtime: GovernanceActivationRuntime = {},
): number {
	const parsed = parseActivateFeatureArgs(args);
	const result = activateRoadmapFeature(
		root,
		parsed.featureId,
		parsed.parentSpec || undefined,
		runtime,
	);
	if (parsed.json) {
		io.stdout(
			stringifyEnvelope(
				envelopeOk(result, { action: "governance.activate-feature" }),
			),
		);
		return 0;
	}
	io.stdout(
		result.status === "activated"
			? `roadmap feature activated: ${result.featureId}`
			: `roadmap feature already active: ${result.featureId}`,
	);
	if (result.parentSpec) {
		io.stdout(
			result.parentStatus === "activated"
				? `parent spec activated: ${result.parentSpec}`
				: `parent spec already active: ${result.parentSpec}`,
		);
	}
	return 0;
}

function formatPreviewIds(ids: readonly string[]): string {
	if (ids.length === 0) return "";
	const preview = ids.slice(0, PREVIEW_ID_LIMIT);
	const suffix = ids.length > PREVIEW_ID_LIMIT ? ", ..." : "";
	return preview.join(", ") + suffix;
}

function runBulkWaiveCommand(
	args: string[],
	root: string,
	io: GovernanceIo,
): number {
	const parsed = parseBulkWaiveArgs(args);
	const index = readPendingSpecIndex(root);
	const waived: string[] = [];
	const skipped: string[] = [];
	const errors: BulkWaiveError[] = [];

	const candidates: string[] = [];
	if (parsed.sessions.length > 0) {
		for (const session of parsed.sessions) {
			const entry = index.entries.find(
				(candidate) => candidate.session_id === session,
			);
			if (!entry) {
				errors.push({
					session,
					message: `pending_spec entry not found for session ${session}`,
				});
				continue;
			}
			if (entry.status !== "open") {
				skipped.push(session);
				continue;
			}
			candidates.push(session);
		}
	} else {
		const open = index.entries.filter((entry) => entry.status === "open");
		const limit = parsed.limit ?? DEFAULT_BULK_WAIVE_LIMIT;
		for (const entry of open.slice(0, limit)) {
			candidates.push(entry.session_id);
		}
		for (const entry of open.slice(limit)) {
			skipped.push(entry.session_id);
		}
	}

	for (const session of candidates) {
		if (parsed.dryRun) {
			waived.push(session);
			continue;
		}
		try {
			resolvePendingSpec(root, {
				session,
				noSpecRequiredReason: parsed.reason,
			});
			waived.push(session);
		} catch (error) {
			errors.push({
				session,
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}

	const exitCode = errors.length > 0 ? 1 : 0;
	const payload = {
		waived,
		skipped,
		errors,
		dry_run: parsed.dryRun,
		limit:
			parsed.sessions.length > 0
				? null
				: (parsed.limit ?? DEFAULT_BULK_WAIVE_LIMIT),
		reason: parsed.reason,
	};

	if (parsed.json) {
		io.stdout(
			stringifyEnvelope(
				envelopeOk(payload, {
					action: "governance.bulk-waive",
					exitCode,
				}),
			),
		);
		return exitCode;
	}

	io.stdout(
		`waived: ${waived.length}; skipped: ${skipped.length}; dry_run: ${parsed.dryRun}`,
	);
	const waivedPreview = formatPreviewIds(waived);
	if (waivedPreview) {
		io.stdout(`waived_ids: ${waivedPreview}`);
	}
	const skippedPreview = formatPreviewIds(skipped);
	if (skippedPreview) {
		io.stdout(`skipped_ids: ${skippedPreview}`);
	}
	if (errors.length > 0) {
		const errorPreview = errors
			.slice(0, PREVIEW_ID_LIMIT)
			.map((entry) => `${entry.session}: ${entry.message}`)
			.join("; ");
		io.stderr(
			`errors: ${errors.length}${errorPreview ? ` (${errorPreview})` : ""}`,
		);
	}
	return exitCode;
}

export function runGovernanceCommand(
	action: string,
	args: string[],
	root: string = process.cwd(),
	io: GovernanceIo = DEFAULT_IO,
	ctx: OperationContext = defaultOperationContext(),
	runtime: GovernanceActivationRuntime = {},
): number {
	try {
		const resolvedAction = action || "pending";
		if (resolvedAction === "pending") {
			return runPendingCommand(args, root, io);
		}
		if (resolvedAction === "resolve-spec") {
			if (requiresApproval(ctx))
				throw new Error(
					"governance resolve-spec requires local interactive approval",
				);
			return runResolveSpecCommand(args, root, io);
		}
		if (resolvedAction === "activate-feature") {
			if (requiresApproval(ctx))
				throw new Error(
					"governance activate-feature requires local interactive approval",
				);
			return runActivateFeatureCommand(args, root, io, runtime);
		}
		if (resolvedAction === "bulk-waive") {
			if (requiresApproval(ctx))
				throw new Error(
					"governance bulk-waive requires local interactive approval",
				);
			return runBulkWaiveCommand(args, root, io);
		}
		if (resolvedAction === "repair-index") {
			if (requiresApproval(ctx))
				throw new Error(
					"governance repair-index requires local interactive approval",
				);
			const index = repairPendingSpecIndex(root);
			io.stdout(`pending_spec index repaired: ${index.entries.length} entries`);
			return 0;
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
