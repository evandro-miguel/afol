import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import {
	envelopeOk,
	type ResultEnvelope,
	stringifyEnvelope,
} from "../core/envelope";
import { atomicWriteText } from "../services/io/atomic";
import { withSessionLock } from "../services/io/session-lock";
import {
	appendMutationRecords,
	createMutationId,
	type MutationRecord,
} from "../services/mutations/journal";
import {
	checkTemplateUpdate,
	formatUpdateCheck,
	type OwnershipCounts,
	type UpdateCheckResult,
	type UpdateOperation,
} from "../services/update/check";
import { backupPath as makeBackupPath, normalizeHash } from "./file/shared";

type CommandIo = {
	stdout: (message: string) => void;
	stderr: (message: string) => void;
};

const DEFAULT_IO: CommandIo = {
	stdout: (message: string) => console.log(message),
	stderr: (message: string) => console.error(message),
};

type UpdateSubcommand = "check" | "preview" | "apply";

type UpdateChangeSummary = {
	total: number;
	create: number;
	update: number;
	conflict: number;
	preserve: number;
	paths: string[];
	conflictPaths: string[];
};

type UpdateCheckJsonSummary = {
	hasSource: boolean;
	currentRevision: string;
	sourceRevision: string;
	upToDate: boolean;
	changes: UpdateChangeSummary;
	ownershipSource: OwnershipCounts;
	ownershipCurrent: OwnershipCounts;
};

type UpdateJsonData = UpdateCheckResult | UpdateCheckJsonSummary;

type ParsedUpdateArgs = {
	dryRun: boolean;
	json: boolean;
	verbose: boolean;
	session: string;
	taskId: string;
	reason: string;
};

function normalizeSubcommand(value: string | undefined): UpdateSubcommand {
	if (!value || value === "check" || value === "ck") {
		return "check";
	}
	if (value === "preview" || value === "plan") {
		return "preview";
	}
	if (value === "apply" || value === "ap") {
		return "apply";
	}
	throw new Error(`Unknown update command: ${value}`);
}

function isWritableOperation(operation: UpdateOperation): boolean {
	return operation.kind === "create" || operation.kind === "update-managed";
}

function parseUpdateArgs(values: string[]): ParsedUpdateArgs {
	const parsed: ParsedUpdateArgs = {
		dryRun: false,
		json: false,
		verbose: false,
		session: "",
		taskId: "",
		reason: "",
	};

	for (let index = 0; index < values.length; index += 1) {
		const value = values[index];
		if (value === "--json" || value === "-j") {
			parsed.json = true;
			continue;
		}
		if (value === "--verbose" || value === "-v") {
			parsed.verbose = true;
			continue;
		}
		if (value === "--dry-run") {
			parsed.dryRun = true;
			continue;
		}
		if (value === "--session" || value === "-S") {
			const next = values[index + 1];
			if (!next) {
				throw new Error("Missing value for --session");
			}
			parsed.session = next;
			index += 1;
			continue;
		}
		if (value === "--task-id" || value === "-T") {
			const next = values[index + 1];
			if (!next) {
				throw new Error("Missing value for --task-id");
			}
			parsed.taskId = next;
			index += 1;
			continue;
		}
		if (value === "--reason") {
			const next = values[index + 1];
			if (!next) {
				throw new Error("Missing value for --reason");
			}
			parsed.reason = next;
			index += 1;
			continue;
		}
		throw new Error(`Unknown update argument: ${value}`);
	}

	return parsed;
}

function requireApplyContext(args: ParsedUpdateArgs): void {
	if (!args.session.trim() || !args.taskId.trim() || !args.reason.trim()) {
		throw new Error(
			"Real update apply requires --session, --task-id, and --reason.",
		);
	}
}

function writeAtomically(
	absolutePath: string,
	relativePath: string,
	mutationId: string,
	content: string,
): void {
	void relativePath;
	void mutationId;
	atomicWriteText(absolutePath, content);
}

type UpdateApplyRuntime = {
	failAfterWriteCount?: number | undefined;
	failBeforeJournalAppend?: boolean | undefined;
};

type StagedUpdateOperation = {
	operation: UpdateOperation;
	absolutePath: string;
	beforeExisted: boolean;
	beforeContent: string;
	backupPath: string | null;
	mutationId: string;
	record: MutationRecord;
};

function resultEnvelope<T extends object>(
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

function summarizeUpdateChanges(
	result: UpdateCheckResult,
): UpdateChangeSummary {
	const counts: UpdateChangeSummary = {
		total: 0,
		create: 0,
		update: 0,
		conflict: 0,
		preserve: 0,
		paths: [],
		conflictPaths: [],
	};

	for (const operation of result.operations) {
		if (operation.kind === "skip-identical") {
			continue;
		}
		counts.total += 1;
		counts.paths.push(operation.path);
		if (operation.kind === "create") {
			counts.create += 1;
			continue;
		}
		if (operation.kind === "update-managed") {
			counts.update += 1;
			continue;
		}
		if (operation.kind === "preserve-project-owned") {
			counts.preserve += 1;
			continue;
		}
		if (operation.kind === "conflict") {
			counts.conflict += 1;
			counts.conflictPaths.push(operation.path);
		}
	}

	return counts;
}

function jsonResultData(
	result: UpdateCheckResult,
	verbose: boolean,
): UpdateJsonData {
	return verbose
		? result
		: {
				hasSource: result.hasSource,
				currentRevision: result.currentRevision,
				sourceRevision: result.sourceRevision,
				upToDate: result.upToDate,
				changes: summarizeUpdateChanges(result),
				ownershipSource: result.ownershipSource,
				ownershipCurrent: result.ownershipCurrent,
			};
}

function writeJsonResult(
	io: CommandIo,
	action: string,
	result: UpdateCheckResult,
	exitCode: number,
	verbose: boolean,
): void {
	io.stdout(
		stringifyEnvelope(
			resultEnvelope(jsonResultData(result, verbose), action, exitCode),
		),
	);
}

function stageUpdateOperations(
	projectRoot: string,
	operations: UpdateOperation[],
	context: Pick<ParsedUpdateArgs, "session" | "taskId" | "reason">,
): StagedUpdateOperation[] {
	const batchId = createMutationId();
	return operations.filter(isWritableOperation).flatMap((operation) => {
		if (!operation.nextContent) {
			return [];
		}
		const absolutePath = join(projectRoot, operation.path);
		const beforeExisted = existsSync(absolutePath);
		const beforeContent = beforeExisted
			? readFileSync(absolutePath, "utf8")
			: "";
		const mutationId = createMutationId();
		const backupPath = beforeExisted
			? makeBackupPath(projectRoot, mutationId, operation.path)
			: null;

		return [
			{
				operation,
				absolutePath,
				beforeExisted,
				beforeContent,
				backupPath,
				mutationId,
				record: {
					id: mutationId,
					ts: new Date().toISOString(),
					kind: "patch",
					status: "applied",
					dryRun: false,
					session: context.session,
					taskId: context.taskId,
					reason: context.reason,
					sourcePath: operation.path,
					beforeHash: beforeExisted ? normalizeHash(beforeContent) : null,
					afterHash: normalizeHash(operation.nextContent),
					backupPath,
					beforeExisted,
					source: "afol-update",
					batchId,
					...(operation.diff ? { diffPreview: operation.diff } : {}),
				},
			},
		];
	});
}

function restoreAppliedOperations(staged: StagedUpdateOperation[]): void {
	for (let index = staged.length - 1; index >= 0; index -= 1) {
		const entry = staged[index];
		if (!entry) {
			continue;
		}
		if (entry.beforeExisted) {
			writeAtomically(
				entry.absolutePath,
				entry.operation.path,
				entry.mutationId,
				entry.beforeContent,
			);
			continue;
		}
		rmSync(entry.absolutePath, { force: true });
	}
}

function applyUpdateOperations(
	projectRoot: string,
	operations: UpdateOperation[],
	context: Pick<ParsedUpdateArgs, "session" | "taskId" | "reason">,
	runtime: UpdateApplyRuntime = {},
): void {
	withSessionLock(projectRoot, context.session, () => {
		const staged = stageUpdateOperations(projectRoot, operations, context);
		if (staged.length === 0) {
			return;
		}

		for (const entry of staged) {
			if (!entry.backupPath) {
				continue;
			}
			cpSync(entry.absolutePath, entry.backupPath);
		}

		const applied: StagedUpdateOperation[] = [];
		try {
			for (const entry of staged) {
				const nextContent = entry.operation.nextContent;
				if (!nextContent) {
					continue;
				}
				const dir = dirname(entry.absolutePath);
				if (!existsSync(dir)) {
					mkdirSync(dir, { recursive: true });
				}
				writeAtomically(
					entry.absolutePath,
					entry.operation.path,
					entry.mutationId,
					nextContent,
				);
				applied.push(entry);
				if (
					typeof runtime.failAfterWriteCount === "number" &&
					applied.length >= runtime.failAfterWriteCount
				) {
					throw new Error("Injected update apply failure after write");
				}
			}

			if (runtime.failBeforeJournalAppend) {
				throw new Error("Injected update apply failure before journal append");
			}

			appendMutationRecords(
				projectRoot,
				staged.map((entry) => entry.record),
			);
		} catch (error) {
			restoreAppliedOperations(applied);
			throw error;
		}
	});
}

export async function runUpdateCommand(
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
	runtime: UpdateApplyRuntime = {},
): Promise<number> {
	try {
		const [rawCommand, ...rest] = args;
		const command = normalizeSubcommand(rawCommand);
		const parsedArgs = parseUpdateArgs(rest);
		const result = checkTemplateUpdate(projectRoot);
		const writableOperations = result.operations.filter(isWritableOperation);
		const blockedCount = result.operations.filter(
			(operation) =>
				operation.kind === "conflict" ||
				(operation.kind === "preserve-project-owned" &&
					(operation.owner === "project-owned" ||
						operation.owner === "ignored")),
		).length;

		if (command === "apply") {
			if (!result.hasSource) {
				if (parsedArgs.json) {
					writeJsonResult(
						io,
						`update.${command}`,
						result,
						1,
						parsedArgs.verbose,
					);
				} else {
					io.stdout(
						formatUpdateCheck(result, command, {
							verbose: parsedArgs.verbose,
						}).trimEnd(),
					);
				}
				return 1;
			}
			if (blockedCount > 0) {
				if (parsedArgs.json) {
					writeJsonResult(io, "update.apply", result, 4, parsedArgs.verbose);
				} else {
					io.stdout(
						formatUpdateCheck(result, "apply", {
							verbose: parsedArgs.verbose,
						}).trimEnd(),
					);
				}
				return 4;
			}
			if (parsedArgs.dryRun) {
				if (parsedArgs.json) {
					writeJsonResult(io, "update.apply", result, 0, parsedArgs.verbose);
				} else {
					io.stdout(
						formatUpdateCheck(result, "apply", {
							verbose: parsedArgs.verbose,
						}).trimEnd(),
					);
				}
				return 0;
			}
			if (writableOperations.length > 0) {
				requireApplyContext(parsedArgs);
			}
			applyUpdateOperations(
				projectRoot,
				writableOperations,
				parsedArgs,
				runtime,
			);
			if (parsedArgs.json) {
				writeJsonResult(io, "update.apply", result, 0, parsedArgs.verbose);
			} else {
				io.stdout(
					formatUpdateCheck(result, command, {
						verbose: parsedArgs.verbose,
					}).trimEnd(),
				);
			}
			return 0;
		}

		if (parsedArgs.json) {
			io.stdout(
				stringifyEnvelope(
					resultEnvelope(
						jsonResultData(result, parsedArgs.verbose),
						`update.${command}`,
						result.hasSource ? 0 : 1,
					),
				),
			);
		} else {
			io.stdout(
				formatUpdateCheck(result, command, {
					verbose: parsedArgs.verbose,
				}).trimEnd(),
			);
		}
		return result.hasSource ? 0 : 1;
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}
}
