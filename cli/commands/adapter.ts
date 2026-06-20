import {
	envelopeErr,
	envelopeOk,
	type ResultEnvelope,
	stringifyEnvelope,
} from "../core/envelope";
import {
	archiveClaudeArtifacts,
	CLAUDE_ADAPTER_ID,
	describeClaudeAdapter,
	findClaudeArtifacts,
	restoreClaudeArtifacts,
	writeClaudeAdapterEnabled,
} from "../services/adapter/claude";
import { type CommandIo, DEFAULT_IO } from "./io";

const KNOWN_ADAPTERS: Set<string> = new Set([CLAUDE_ADAPTER_ID]);

type ActionResult = {
	data: Record<string, unknown>;
	lines: string[];
	exitCode: number;
};

/**
 * Runtime adapter toggle. Lets a downstream project disable optional
 * integration surfaces while keeping `AGENTS.md` as the always-on canonical
 * instruction surface. The Claude adapter remains as a cleanup/config switch
 * for legacy installs that still carry `CLAUDE.md` or `.claude/`.
 *
 * Usage:
 *   afol adapter list
 *   afol adapter disable claude [--dry-run] [--json]
 *   afol adapter enable claude  [--dry-run] [--json]
 */
export async function runAdapterCommand(
	action: string,
	args: string[],
	projectRoot: string,
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	const { json, dryRun, positional } = parseArgs(args);

	if (action === "list" || action === "") {
		return emit(listAdapters(projectRoot), "adapter.list", json, io);
	}

	const adapterId = positional[0] ?? "";
	if (!KNOWN_ADAPTERS.has(adapterId)) {
		const hint = `known adapters: ${[...KNOWN_ADAPTERS].join(", ")}`;
		if (json) {
			io.stdout(
				stringifyEnvelope(
					envelopeErr("ADAPTER_UNKNOWN", hint, {
						action: "adapter",
						exitCode: 2,
					}),
				),
			);
		} else {
			io.stderr(`err adapter-unknown ${hint}`);
		}
		return 2;
	}

	if (action === "disable") {
		return emit(applyDisable(projectRoot, dryRun), "adapter.disable", json, io);
	}
	if (action === "enable") {
		return emit(applyEnable(projectRoot, dryRun), "adapter.enable", json, io);
	}

	const message = `afol adapter: unknown action '${action}'`;
	if (json) {
		io.stdout(
			stringifyEnvelope(
				envelopeErr("ADAPTER_ACTION_UNKNOWN", message, {
					action: "adapter",
					exitCode: 2,
				}),
			),
		);
	} else {
		io.stderr(
			`err adapter-action-unknown action=${action} hint="use list, enable, or disable"`,
		);
		return 2;
	}
	return 2;
}

function listAdapters(projectRoot: string): ActionResult {
	const state = describeClaudeAdapter(projectRoot);
	return {
		data: {
			adapters: [
				{
					id: state.id,
					enabled: state.enabled,
					artifacts_present: state.artifactsPresent,
				},
			],
		},
		lines: [
			"adapter list:",
			`  ${state.id}: ${state.enabled ? "enabled" : "disabled"}${state.artifactsPresent ? " (artifacts present)" : " (no artifacts)"}`,
		],
		exitCode: 0,
	};
}

function applyDisable(projectRoot: string, dryRun: boolean): ActionResult {
	const before = describeClaudeAdapter(projectRoot);
	const artifacts = findClaudeArtifacts(projectRoot);
	if (dryRun) {
		return {
			data: {
				adapter: before.id,
				action: "disable",
				dry_run: true,
				previous: { enabled: before.enabled },
				next: { enabled: false },
				artifacts_to_archive: artifacts,
			},
			lines: [
				`adapter disable ${before.id}: dry-run`,
				`  config: adapters.${before.id}.enabled -> false`,
				artifacts.length > 0
					? `  archive: ${artifacts.join(", ")}`
					: "  archive: (no artifacts present)",
			],
			exitCode: 0,
		};
	}

	if (!before.enabled && !before.artifactsPresent) {
		return {
			data: {
				adapter: before.id,
				action: "disable",
				already_disabled: true,
				enabled: false,
			},
			lines: [`adapter ${before.id}: already disabled`],
			exitCode: 0,
		};
	}

	writeClaudeAdapterEnabled(projectRoot, false);
	const { archiveRoot, archived } = archiveClaudeArtifacts(projectRoot);
	return {
		data: {
			adapter: before.id,
			action: "disable",
			previous: { enabled: before.enabled },
			next: { enabled: false },
			archive_root: archiveRoot,
			archived,
		},
		lines: [
			`adapter ${before.id}: disabled`,
			`  config: adapters.${before.id}.enabled=false`,
			archived.length > 0
				? `  archived: ${archived.join(", ")} -> ${archiveRoot}`
				: "  archived: (no artifacts present)",
		],
		exitCode: 0,
	};
}

function applyEnable(projectRoot: string, dryRun: boolean): ActionResult {
	const before = describeClaudeAdapter(projectRoot);
	if (dryRun) {
		return {
			data: {
				adapter: before.id,
				action: "enable",
				dry_run: true,
				previous: { enabled: before.enabled },
				next: { enabled: true },
			},
			lines: [
				`adapter enable ${before.id}: dry-run`,
				`  config: adapters.${before.id}.enabled -> true`,
				"  restore: template-owned artifacts when present",
			],
			exitCode: 0,
		};
	}

	if (before.enabled && before.artifactsPresent) {
		return {
			data: {
				adapter: before.id,
				action: "enable",
				already_enabled: true,
				enabled: true,
			},
			lines: [`adapter ${before.id}: already enabled`],
			exitCode: 0,
		};
	}

	writeClaudeAdapterEnabled(projectRoot, true);
	const restored = restoreClaudeArtifacts(projectRoot);
	return {
		data: {
			adapter: before.id,
			action: "enable",
			previous: { enabled: before.enabled },
			next: { enabled: true },
			restored,
		},
		lines: [
			`adapter ${before.id}: enabled`,
			`  config: adapters.${before.id}.enabled=true`,
			restored.length > 0
				? `  restored: ${restored.join(", ")}`
				: "  restored: (template empty)",
		],
		exitCode: 0,
	};
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
	for (const line of result.lines) {
		io.stdout(line);
	}
	return result.exitCode;
}

function parseArgs(args: string[]): {
	json: boolean;
	dryRun: boolean;
	positional: string[];
} {
	let json = false;
	let dryRun = false;
	const positional: string[] = [];
	for (const arg of args) {
		if (arg === "-j" || arg === "--json") {
			json = true;
			continue;
		}
		if (arg === "--dry-run") {
			dryRun = true;
			continue;
		}
		positional.push(arg);
	}
	return { json, dryRun, positional };
}
