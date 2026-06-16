import {
	envelopeOk,
	envelopeWithLegacyKeys,
	type ResultEnvelope,
	stringifyEnvelope,
} from "../core/envelope";
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

type CommandIo = {
	stdout: (message: string) => void;
	stderr: (message: string) => void;
};

const DEFAULT_IO: CommandIo = {
	stdout: (message) => console.log(message),
	stderr: (message) => console.error(message),
};

type LocalStateCommand = "rebuild" | "freshness";

type LocalStateSnapshot = {
	workbench: ReturnType<typeof rebuildWorkBenchIndex>;
} & ReturnType<typeof rebuildProjectIndexes>;

function summarizeSnapshot(
	snapshot: LocalStateSnapshot,
): Record<string, unknown> {
	return {
		workbench: {
			sessions: snapshot.workbench.sessions.length,
			tasks: snapshot.workbench.tasks.length,
		},
		rules: snapshot.rules.rules.length,
		skills: snapshot.skills.skills.length,
		specs: snapshot.specs.specs.length,
		files: snapshot.files.files.length,
	};
}

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

function formatFreshnessLine(check: {
	id: string;
	ok: boolean;
	message: string;
}): string {
	if (check.ok) {
		return `ok ${check.id}`;
	}
	return `fail ${check.id} ${check.message}`;
}

export async function runLocalStateCommand(
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	try {
		const [rawCommand, ...rest] = args;
		const command = normalizeCommand(rawCommand);
		let json = false;
		let verbose = false;

		for (const value of rest) {
			if (value === "--json" || value === "-j") {
				json = true;
				continue;
			}
			if (value === "--verbose" || value === "-v") {
				verbose = true;
				continue;
			}
			throw new Error(`Unknown local-state argument: ${value}`);
		}

		if (command === "rebuild") {
			const workbench = rebuildWorkBenchIndex(projectRoot);
			const snapshot = { workbench, ...rebuildProjectIndexes(projectRoot) };
			const summary = summarizeSnapshot(snapshot);
			if (json) {
				const payload = verbose
					? { ok: true, command, summary, snapshot }
					: { ok: true, command, summary };
				io.stdout(
					stringifyEnvelope(
						envelopeWithLegacyKeys(
							resultEnvelope(payload, `local-state.${command}`, 0),
							verbose
								? ["ok", "command", "summary", "snapshot"]
								: ["ok", "command", "summary"],
						),
					),
				);
			} else {
				io.stdout(
					[
						"local-state rebuild: ok",
						`workbench: ${snapshot.workbench.sessions.length} sessions, ${snapshot.workbench.tasks.length} tasks`,
						`rules: ${snapshot.rules.rules.length}`,
						`skills: ${snapshot.skills.skills.length}`,
						`specs: ${snapshot.specs.specs.length}`,
						`files: ${snapshot.files.files.length}`,
					].join("\n"),
				);
			}
			return 0;
		}

		const result = formatFreshness(projectRoot);
		if (json) {
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
					...result.checks.map(formatFreshnessLine),
				].join("\n"),
			);
		}
		return result.ok ? 0 : 1;
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}
}
