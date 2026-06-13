import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { atomicWriteText } from "../services/io/atomic";
import { withSessionLock } from "../services/io/session-lock";
import {
	appendMutationRecords,
	createMutationId,
	type MutationRecord,
} from "../services/mutations/journal";
import { resolveProjectPaths } from "../services/project/paths";
import {
	checkTemplateUpdate,
	formatUpdateCheck,
	type UpdateCheckResult,
	type UpdateOperation,
} from "../services/update/check";
import {
	envelopeOk,
	envelopeWithLegacyKeys,
	stringifyEnvelope,
	type ResultEnvelope,
} from "../core/envelope";

type CommandIo = {
	stdout: (message: string) => void;
	stderr: (message: string) => void;
};

const DEFAULT_IO: CommandIo = {
	stdout: (message: string) => console.log(message),
	stderr: (message: string) => console.error(message),
};

type UpdateSubcommand = "check" | "preview" | "apply";

type ParsedUpdateArgs = {
	dryRun: boolean;
	json: boolean;
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

function sha256Hex(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function sanitizeForFilename(value: string): string {
	return value
		.replace(/[\\/:*?"<>|]/g, "_")
		.replace(/\.{2,}/g, "_")
		.replace(/\s+/g, "-")
		.replace(/^$/g, "root");
}

function ensureBackupDir(projectRoot: string): string {
	const backups = resolveProjectPaths(projectRoot).abs.mutationBackupsDir;
	mkdirSync(backups, { recursive: true });
	return backups;
}

function mutationBackupPath(
	projectRoot: string,
	mutationId: string,
	relativePath: string,
): string {
	return join(
		ensureBackupDir(projectRoot),
		`${mutationId}-${sanitizeForFilename(relativePath)}.bak`,
	);
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

function writeJsonResult(
	io: CommandIo,
	action: string,
	result: UpdateCheckResult,
	exitCode: number,
): void {
	io.stdout(
		stringifyEnvelope(
			envelopeWithLegacyKeys(
				resultEnvelope(result, action, exitCode),
				[
					"hasSource",
					"currentRevision",
					"sourceRevision",
					"upToDate",
					"changes",
					"ownershipSource",
					"ownershipCurrent",
					"filePreviews",
					"operations",
				],
			),
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
			? mutationBackupPath(projectRoot, mutationId, operation.path)
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
					beforeHash: beforeExisted ? sha256Hex(beforeContent) : null,
					afterHash: sha256Hex(operation.nextContent),
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
				parsedArgs.json
					? writeJsonResult(io, `update.${command}`, result, 1)
					: io.stdout(formatUpdateCheck(result, command).trimEnd());
				return 1;
			}
			if (blockedCount > 0) {
				parsedArgs.json
					? writeJsonResult(io, "update.apply", result, 4)
					: io.stdout(formatUpdateCheck(result, "apply").trimEnd());
				return 4;
			}
			if (parsedArgs.dryRun) {
				parsedArgs.json
					? writeJsonResult(io, "update.apply", result, 0)
					: io.stdout(formatUpdateCheck(result, "apply").trimEnd());
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
			parsedArgs.json
				? writeJsonResult(io, "update.apply", result, 0)
				: io.stdout(formatUpdateCheck(result, command).trimEnd());
			return 0;
		}

		parsedArgs.json
			? writeJsonResult(io, `update.${command}`, result, result.hasSource ? 0 : 1)
			: io.stdout(formatUpdateCheck(result, command).trimEnd());
		return result.hasSource ? 0 : 1;
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}
}
