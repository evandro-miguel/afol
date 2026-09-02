import {
	envelopeErr,
	envelopeOk,
	type ResultEnvelope,
	stringifyEnvelope,
} from "../core/envelope";
import {
	ADAPTER_IDS,
	type AdapterId,
	type AdapterMutationAction,
	AdapterOperationError,
	describeAdapter,
	mutateAdapters,
} from "../services/adapter/antigravity";
import { type CommandIo, DEFAULT_IO } from "./io";

type ActionResult = {
	data: Record<string, unknown>;
	lines: string[];
	exitCode: number;
};

/**
 * Manage the opt-in Antigravity workspace rule for canonical AGENTS.md.
 * AFOL owns only the exact marked rule file, never its parent directory.
 */
export async function runAdapterCommand(
	action: string,
	args: string[],
	projectRoot: string,
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	const parsed = parseArgs(args);
	if (parsed.error) {
		return emitError(parsed.error, action, parsed.json, io);
	}
	if (action === "list" || action === "") {
		if (parsed.positional.length > 0 || parsed.all) {
			return emitError(
				new Error("list does not accept a provider or --all"),
				action,
				parsed.json,
				io,
			);
		}
		return emit(listAdapters(projectRoot), "adapter.list", parsed.json, io);
	}
	if (action !== "enable" && action !== "disable" && action !== "sync") {
		return emitError(
			new Error(`unknown adapter action '${action}'`),
			action,
			parsed.json,
			io,
			"ADAPTER_ACTION_UNKNOWN",
		);
	}

	const ids = resolveProviders(action, parsed);
	if (!ids.ok) {
		return emitError(ids.error, `adapter.${action}`, parsed.json, io);
	}
	try {
		const results = mutateAdapters(
			projectRoot,
			ids.value,
			action,
			parsed.dryRun,
		);
		return emit(
			formatMutation(results, action, parsed.dryRun),
			`adapter.${action}`,
			parsed.json,
			io,
		);
	} catch (error) {
		return emitError(error, `adapter.${action}`, parsed.json, io);
	}
}

function listAdapters(projectRoot: string): ActionResult {
	const states = ADAPTER_IDS.map((id) => describeAdapter(projectRoot, id));
	return {
		data: {
			adapters: states.map((state) => ({
				id: state.id,
				enabled: state.enabled,
				mirror_path: state.mirrorPath,
				ownership: state.ownership,
				in_sync: state.inSync,
				artifacts_present: state.artifactsPresent,
				config_state: state.configState,
			})),
		},
		lines: [
			"adapter list:",
			...states.map(
				(state) =>
					`  ${state.id}: ${state.enabled ? "enabled" : "disabled"} (${state.ownership}, ${state.inSync ? "in sync" : "not in sync"})`,
			),
		],
		exitCode: 0,
	};
}

function formatMutation(
	results: ReturnType<typeof mutateAdapters>,
	action: AdapterMutationAction,
	dryRun: boolean,
): ActionResult {
	const changedPaths = [
		...new Set(results.flatMap((result) => result.changedPaths)),
	].sort();
	const data: Record<string, unknown> = {
		outcome: results.every((result) => result.outcome === "unchanged")
			? "unchanged"
			: "changed",
		changed_paths: changedPaths,
		dry_run: dryRun,
		adapters: results.map((result) => ({
			adapter: result.id,
			provider: result.id,
			outcome: result.outcome,
			changed_paths: result.changedPaths,
			dry_run: result.dryRun,
			previous: result.previous,
			next: result.next,
			ownership: result.ownership,
		})),
	};
	const [result] = results;
	if (result && results.length === 1) {
		data.adapter = result.id;
		data.provider = result.id;
		data.action = action;
		data.previous = result.previous;
		data.next = result.next;
		data.ownership = result.ownership;
	}
	return {
		data,
		lines: [
			`adapter ${action}${results.length > 1 ? " --all" : ` ${results[0]?.id ?? ""}`}: ${dryRun ? "dry-run" : data.outcome}`,
			...results.map((result) =>
				result.changedPaths.length > 0
					? `  ${result.id}: ${result.changedPaths.join(", ")}`
					: `  ${result.id}: no changes`,
			),
		],
		exitCode: 0,
	};
}

function resolveProviders(
	action: string,
	parsed: ParsedArgs,
): { ok: true; value: AdapterId[] } | { ok: false; error: Error } {
	if (action === "sync" && parsed.all) {
		if (parsed.positional.length > 0) {
			return {
				ok: false,
				error: new Error("sync --all cannot name a provider"),
			};
		}
		return { ok: true, value: [...ADAPTER_IDS] };
	}
	if (parsed.all) {
		return { ok: false, error: new Error("--all is supported only by sync") };
	}
	const id = parsed.positional[0];
	if (parsed.positional.length !== 1 || !isAdapterId(id)) {
		return {
			ok: false,
			error: new Error(
				`known adapters: ${ADAPTER_IDS.join(", ")}; usage: ${action} <provider>`,
			),
		};
	}
	return { ok: true, value: [id] };
}

function isAdapterId(value: string | undefined): value is AdapterId {
	return (
		value !== undefined && (ADAPTER_IDS as readonly string[]).includes(value)
	);
}

type ParsedArgs = {
	json: boolean;
	dryRun: boolean;
	all: boolean;
	positional: string[];
	error?: Error;
};

function parseArgs(args: string[]): ParsedArgs {
	let json = false;
	let dryRun = false;
	let all = false;
	const positional: string[] = [];
	for (const arg of args) {
		if (arg === "-j" || arg === "--json") {
			json = true;
		} else if (arg === "--dry-run") {
			dryRun = true;
		} else if (arg === "--all") {
			all = true;
		} else if (arg.startsWith("-")) {
			return {
				json,
				dryRun,
				all,
				positional,
				error: new Error(`unknown option '${arg}'`),
			};
		} else {
			positional.push(arg);
		}
	}
	return { json, dryRun, all, positional };
}

function emitError(
	error: unknown,
	action: string,
	json: boolean,
	io: CommandIo,
	overrideCode?: string,
): number {
	const adapterError = error instanceof AdapterOperationError ? error : null;
	const code = overrideCode ?? adapterError?.code ?? "ADAPTER_INVALID";
	const exitCode = adapterError?.code === "ADAPTER_CONFLICT" ? 4 : 2;
	const message = error instanceof Error ? error.message : String(error);
	if (json) {
		const envelope: ResultEnvelope<never> = envelopeErr(code, message, {
			action,
			exitCode,
		});
		io.stdout(stringifyEnvelope(envelope));
	} else {
		io.stderr(`err ${code.toLowerCase().replaceAll("_", "-")} ${message}`);
	}
	return exitCode;
}

function emit(
	result: ActionResult,
	action: string,
	json: boolean,
	io: CommandIo,
): number {
	if (json) {
		const envelope: ResultEnvelope<Record<string, unknown>> = envelopeOk(
			result.data,
			{ action, exitCode: result.exitCode },
		);
		io.stdout(stringifyEnvelope(envelope));
		return result.exitCode;
	}
	for (const line of result.lines) io.stdout(line);
	return result.exitCode;
}
