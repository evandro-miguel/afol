import {
	envelopeErr,
	envelopeOk,
	envelopeWithLegacyKeys,
	type ResultEnvelope,
	stringifyEnvelope,
} from "../core/envelope";
import {
	defaultOperationContext,
	type OperationContext,
	requiresApproval,
} from "../core/operation-context";
import { assertValidEventLedger } from "../services/events/ledger";
import { countHotPathOperation } from "../services/hot-path/instrumentation";
import { withSessionLock } from "../services/io/session-lock";
import {
	rebuildProjectIndexes,
	validateFilesIndex,
	validateRulesIndex,
	validateSkillsIndex,
	validateSpecsIndex,
} from "../services/local-state/project-indexes";
import {
	rebuildWorkBenchIndex,
	validateWorkBenchIndex,
} from "../services/local-state/workbench-index";
import { type CommandIo, DEFAULT_IO } from "./io";

type LocalStateCommand = "rebuild" | "freshness";

const JSON_OUTPUT_BYTE_LIMIT = 16_000;

type ParsedArgs = {
	json: boolean;
	verbose: boolean;
};

type RebuildSnapshot = {
	workbench: ReturnType<typeof rebuildWorkBenchIndex>;
} & ReturnType<typeof rebuildProjectIndexes>;

type RebuildSummary = {
	workbench: {
		sessions: number;
		tasks: number;
		open_tasks: number;
		problem_tasks: number;
	};
	rules: { count: number };
	skills: { count: number };
	specs: { count: number };
	files: { count: number };
};

type RebuildPayload = {
	ok: true;
	command: LocalStateCommand;
	summary: RebuildSummary;
	output: "compact" | "verbose";
	hint?: string;
	snapshot?: RebuildSnapshot;
	snapshot_truncated?: boolean;
	snapshot_omitted?: number;
};

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

function normalizeCommand(value: string | undefined): LocalStateCommand {
	if (!value || value === "freshness" || value === "fs") {
		return "freshness";
	}
	if (value === "rebuild" || value === "rb") {
		return "rebuild";
	}
	throw new Error(`Unknown local-state command: ${value}`);
}

function parseArgs(values: string[]): ParsedArgs {
	const parsed: ParsedArgs = { json: false, verbose: false };

	for (const value of values) {
		if (value === "--json" || value === "-j") {
			parsed.json = true;
			continue;
		}
		if (value === "--verbose" || value === "-v") {
			parsed.verbose = true;
			continue;
		}
		throw new Error(`Unknown local-state argument: ${value}`);
	}

	return parsed;
}

function summarizeRebuild(snapshot: RebuildSnapshot): RebuildSummary {
	return {
		workbench: {
			sessions: snapshot.workbench.sessions.length,
			tasks: snapshot.workbench.tasks.length,
			open_tasks: snapshot.workbench.tasks.filter(
				(task) => task.state !== "done" && task.state !== "moved",
			).length,
			problem_tasks: snapshot.workbench.tasks.filter(
				(task) => task.state === "blocked" || task.state === "problem",
			).length,
		},
		rules: { count: snapshot.rules.rules.length },
		skills: { count: snapshot.skills.skills.length },
		specs: { count: snapshot.specs.specs.length },
		files: { count: snapshot.files.files.length },
	};
}

function truncateArrays(
	value: unknown,
	limit: number,
	omitted: { count: number },
): unknown {
	if (Array.isArray(value)) {
		if (value.length > limit) omitted.count += value.length - limit;
		return value
			.slice(0, limit)
			.map((entry) => truncateArrays(entry, limit, omitted));
	}
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [
				key,
				truncateArrays(entry, limit, omitted),
			]),
		);
	}
	return value;
}

function boundedSnapshot(snapshot: RebuildSnapshot): {
	snapshot: RebuildSnapshot;
	omitted: number;
	truncated: boolean;
} {
	if (
		Buffer.byteLength(JSON.stringify({ snapshot }), "utf8") <=
		JSON_OUTPUT_BYTE_LIMIT
	) {
		return { snapshot, omitted: 0, truncated: false };
	}
	for (const limit of [32, 16, 8, 4]) {
		const omitted = { count: 0 };
		const bounded = truncateArrays(snapshot, limit, omitted) as RebuildSnapshot;
		if (
			Buffer.byteLength(JSON.stringify({ snapshot: bounded }), "utf8") <=
			JSON_OUTPUT_BYTE_LIMIT
		) {
			return { snapshot: bounded, omitted: omitted.count, truncated: true };
		}
	}
	const omitted = { count: 0 };
	const bounded = truncateArrays(snapshot, 1, omitted) as RebuildSnapshot;
	return { snapshot: bounded, omitted: omitted.count, truncated: true };
}

function formatFreshness(root: string): {
	ok: boolean;
	checks: { id: string; ok: boolean; message: string }[];
} {
	const checks = [
		{ id: "workbench", ...validateWorkBenchIndex(root) },
		{ id: "rules", ...validateRulesIndex(root) },
		{ id: "skills", ...validateSkillsIndex(root) },
		{ id: "specs", ...validateSpecsIndex(root) },
		{ id: "files", ...validateFilesIndex(root) },
	];
	return {
		ok: checks.every((check) => check.ok),
		checks,
	};
}

export async function runLocalStateCommand(
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
	ctx: OperationContext = defaultOperationContext(),
): Promise<number> {
	try {
		const [rawCommand, ...rest] = args;
		const command = normalizeCommand(rawCommand);
		const parsed = parseArgs(rest);

		if (command === "rebuild") {
			if (requiresApproval(ctx)) {
				const message =
					"local-state rebuild requires local interactive approval";
				if (parsed.json) {
					io.stdout(
						stringifyEnvelope(
							envelopeErr("approval-required", message, {
								action: "local-state.rebuild",
								exitCode: 2,
							}),
						),
					);
				} else {
					io.stderr(`err approval-required ${message}`);
				}
				return 2;
			}
			return withSessionLock(projectRoot, "local-state.rebuild", () => {
				assertValidEventLedger(projectRoot);
				countHotPathOperation("workbench.local_state_refresh");
				const workbench = rebuildWorkBenchIndex(projectRoot);
				const snapshot = { workbench, ...rebuildProjectIndexes(projectRoot) };
				const summary = summarizeRebuild(snapshot);
				const bounded = boundedSnapshot(snapshot);

				if (parsed.json) {
					const compactPayload: RebuildPayload = {
						ok: true,
						command,
						summary,
						output: parsed.verbose ? "verbose" : "compact",
						...(parsed.verbose
							? {
									snapshot: bounded.snapshot,
									...(bounded?.truncated
										? {
												snapshot_truncated: true,
												snapshot_omitted: bounded.omitted,
											}
										: {}),
								}
							: {
									hint: "Use `afol local-state rebuild --json --verbose` for bounded index details.",
								}),
					};
					io.stdout(
						stringifyEnvelope(
							envelopeWithLegacyKeys(
								resultEnvelope(compactPayload, `local-state.${command}`, 0),
								parsed.verbose
									? [
											"ok",
											"command",
											"summary",
											"output",
											"snapshot",
											"snapshot_truncated",
											"snapshot_omitted",
										]
									: ["ok", "command", "summary", "output", "hint"],
							),
						),
					);
				} else {
					io.stdout(
						[
							"local-state rebuild: ok",
							`workbench: ${summary.workbench.sessions} sessions, ${summary.workbench.tasks} tasks`,
							`rules: ${summary.rules.count}`,
							`skills: ${summary.skills.count}`,
							`specs: ${summary.specs.count}`,
							`files: ${summary.files.count}`,
						].join("\n"),
					);
				}
				return 0;
			});
		}

		const result = formatFreshness(projectRoot);
		if (parsed.json) {
			io.stdout(
				stringifyEnvelope(
					envelopeWithLegacyKeys(
						resultEnvelope(result, "local-state.freshness", result.ok ? 0 : 1),
						["ok", "checks"],
					),
				),
			);
		} else {
			io.stdout(
				[
					`local-state freshness: ${result.ok ? "ok" : "failed"}`,
					...result.checks.map(
						(check) =>
							`${check.ok ? "ok" : "fail"} ${check.id} ${check.message}`,
					),
				].join("\n"),
			);
		}
		return result.ok ? 0 : 1;
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}
}
