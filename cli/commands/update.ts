import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import {
	envelopeErr,
	envelopeOk,
	type ResultEnvelope,
	stringifyEnvelope,
} from "../core/envelope";
import {
	defaultOperationContext,
	type OperationContext,
	requiresApproval,
} from "../core/operation-context";
import { atomicWriteText } from "../services/io/atomic";
import {
	withExternalPathLock,
	withResourceLocks,
	withSessionLock,
} from "../services/io/session-lock";
import {
	appendMutationRecords,
	createMutationId,
	loadMutationJournal,
	type MutationRecord,
	withMutationJournalLock,
} from "../services/mutations/journal";
import { resolveProjectWritePath } from "../services/project/root";
import { validateMutationRuntime } from "../services/state/validate";
import {
	checkTemplateUpdate,
	formatUpdateCheck,
	type OwnershipCounts,
	type UpdateCheckResult,
	type UpdateOperation,
} from "../services/update/check";
import { assertTaskInProgress } from "../services/workbench/lifecycle";
import {
	backupPath as makeBackupPath,
	normalizeHash,
	readJournalBackupBytes,
} from "./file/shared";
import { type CommandIo, DEFAULT_IO } from "./io";

type UpdateSubcommand = "check" | "preview" | "apply" | "rollback";

type WritableUpdateOperation = Extract<
	UpdateOperation,
	{ kind: "create" | "update-managed" | "remove-stale" }
>;

type UpdateChangeSummary = {
	total: number;
	create: number;
	update: number;
	remove: number;
	conflict: number;
	preserve: number;
	paths: string[];
	pathsTruncated: boolean;
	conflictPaths: string[];
	conflictPathsTruncated: boolean;
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

const MAX_COMPACT_UPDATE_PATHS = 16;

type ParsedUpdateArgs = {
	dryRun: boolean;
	json: boolean;
	verbose: boolean;
	session: string;
	taskId: string;
	reason: string;
	allowUnboundContext: boolean;
	batchId: string;
};

function normalizeSubcommand(value: string | undefined): UpdateSubcommand {
	if (!value || value.startsWith("-") || value === "check" || value === "ck") {
		return "check";
	}
	if (value === "preview" || value === "plan") {
		return "preview";
	}
	if (value === "apply" || value === "ap") {
		return "apply";
	}
	if (value === "rollback") return "rollback";
	throw new Error(`Unknown update command: ${value}`);
}

function isWritableOperation(
	operation: UpdateOperation,
): operation is WritableUpdateOperation {
	return (
		operation.kind === "create" ||
		operation.kind === "update-managed" ||
		operation.kind === "remove-stale"
	);
}

function parseUpdateArgs(values: string[]): ParsedUpdateArgs {
	const parsed: ParsedUpdateArgs = {
		dryRun: false,
		json: false,
		verbose: false,
		session: "",
		taskId: "",
		reason: "",
		allowUnboundContext: false,
		batchId: "",
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
		if (value === "--allow-unbound-context") {
			parsed.allowUnboundContext = true;
			continue;
		}
		if (value === "--batch-id") {
			const next = values[index + 1];
			if (!next) throw new Error("Missing value for --batch-id");
			parsed.batchId = next;
			index += 1;
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

function requireApplyContext(
	args: ParsedUpdateArgs,
	allowUnboundContext = false,
): void {
	if (allowUnboundContext) {
		if (!args.reason.trim()) {
			throw new Error("Real update apply requires --reason.");
		}
		return;
	}
	if (!args.session.trim() || !args.taskId.trim() || !args.reason.trim()) {
		throw new Error(
			"Real update apply requires --session, --task-id, and --reason.",
		);
	}
}

function allowUnboundContextEnabled(
	env: Record<string, string | undefined> = process.env,
): boolean {
	return env.AFOL_CI === "1" || env.AFOL_TEST === "1";
}

function requireAllowedUnboundContext(): void {
	if (!allowUnboundContextEnabled()) {
		throw new Error(
			"--allow-unbound-context requires AFOL_CI=1 or AFOL_TEST=1.",
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
	failAfterPrepared?: boolean | undefined;
	failBeforeJournalAppend?: boolean | undefined;
	failBeforeRollbackJournalAppend?: boolean | undefined;
	cliRoot?: string | undefined;
	invocationPath?: string | undefined;
	beforeLockedReplan?: (() => void) | undefined;
	removedTemplatePaths?: readonly string[] | undefined;
	beforeRollbackLockedValidation?: (() => void) | undefined;
};

type StagedUpdateOperation = {
	operation: WritableUpdateOperation;
	absolutePath: string;
	beforeExisted: boolean;
	beforeContent: string;
	beforeIsDirectory: boolean;
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
		remove: 0,
		conflict: 0,
		preserve: 0,
		paths: [],
		pathsTruncated: false,
		conflictPaths: [],
		conflictPathsTruncated: false,
	};

	for (const operation of result.operations) {
		if (operation.kind === "skip-identical") {
			continue;
		}
		counts.total += 1;
		if (counts.paths.length < MAX_COMPACT_UPDATE_PATHS) {
			counts.paths.push(operation.path);
		} else {
			counts.pathsTruncated = true;
		}
		if (operation.kind === "create") {
			counts.create += 1;
			continue;
		}
		if (operation.kind === "update-managed") {
			counts.update += 1;
			continue;
		}
		if (operation.kind === "remove-stale") {
			counts.remove += 1;
			continue;
		}
		if (operation.kind === "preserve-project-owned") {
			counts.preserve += 1;
			continue;
		}
		if (operation.kind === "conflict") {
			counts.conflict += 1;
			if (counts.conflictPaths.length < MAX_COMPACT_UPDATE_PATHS) {
				counts.conflictPaths.push(operation.path);
			} else {
				counts.conflictPathsTruncated = true;
			}
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
		const resolved = resolveProjectWritePath(projectRoot, operation.path);
		if (!resolved.ok) {
			throw new Error(resolved.error);
		}
		const absolutePath = resolved.value.path;
		const beforeExisted = existsSync(absolutePath);
		const beforeIsDirectory = beforeExisted
			? statSync(absolutePath).isDirectory()
			: false;
		const beforeContent =
			beforeExisted && !beforeIsDirectory
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
				beforeIsDirectory,
				backupPath,
				mutationId,
				record: {
					id: mutationId,
					ts: new Date().toISOString(),
					kind: "update",
					status: "prepared",
					dryRun: false,
					session: context.session,
					taskId: context.taskId,
					reason: context.reason,
					sourcePath: operation.path,
					beforeHash:
						beforeExisted && !beforeIsDirectory
							? normalizeHash(beforeContent)
							: null,
					afterHash:
						operation.kind === "remove-stale"
							? null
							: normalizeHash(operation.nextContent),
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
			if (entry.beforeIsDirectory) {
				rmSync(entry.absolutePath, { recursive: true, force: true });
				if (entry.backupPath) {
					cpSync(entry.backupPath, entry.absolutePath, { recursive: true });
				}
				continue;
			}
			writeAtomically(
				entry.absolutePath,
				entry.operation.path,
				entry.mutationId,
				entry.beforeContent,
			);
			continue;
		}
		rmSync(entry.absolutePath, { recursive: true, force: true });
	}
}

function applyUpdateOperations(
	projectRoot: string,
	context: Pick<ParsedUpdateArgs, "session" | "taskId" | "reason">,
	runtime: UpdateApplyRuntime = {},
	assertLockedWriteAllowed: (() => void) | undefined = undefined,
): { batchId: string | null; result: UpdateCheckResult } {
	return withSessionLock(projectRoot, "__scaffold-update__", () => {
		runtime.beforeLockedReplan?.();
		const result = checkTemplateUpdate(
			projectRoot,
			runtime.removedTemplatePaths,
		);
		if (result.operations.some((operation) => operation.kind === "conflict")) {
			throw new Error("update-conflict-after-replan");
		}
		if (result.operations.some(isWritableOperation)) {
			assertLockedWriteAllowed?.();
		}
		const normalizedContext = {
			...context,
			session: context.session.trim() || "__ci__",
			taskId: context.taskId.trim() || "__unbound__",
		};
		const staged = stageUpdateOperations(
			projectRoot,
			result.operations,
			normalizedContext,
		);
		if (staged.length === 0) {
			return { batchId: null, result };
		}
		return withMutationJournalLock(projectRoot, () =>
			withResourceLocks(
				projectRoot,
				staged.map((entry) => entry.absolutePath),
				() => {
					for (const entry of staged) {
						const exists = existsSync(entry.absolutePath);
						if (exists !== entry.beforeExisted)
							throw new Error(`update-stale-existence:${entry.operation.path}`);
						if (
							exists &&
							!entry.beforeIsDirectory &&
							normalizeHash(readFileSync(entry.absolutePath, "utf8")) !==
								normalizeHash(entry.beforeContent)
						)
							throw new Error(`update-stale-hash:${entry.operation.path}`);
					}

					const applied: StagedUpdateOperation[] = [];
					try {
						appendMutationRecords(
							projectRoot,
							staged.map((entry) => entry.record),
						);
						if (runtime.failAfterPrepared)
							throw new Error(
								"Injected update apply failure after prepared journal",
							);
						for (const entry of staged) {
							if (entry.backupPath)
								cpSync(entry.absolutePath, entry.backupPath, {
									recursive: true,
								});
						}
						for (const entry of staged) {
							if (entry.operation.kind === "remove-stale") {
								rmSync(entry.absolutePath, { recursive: true, force: true });
								applied.push(entry);
								if (
									typeof runtime.failAfterWriteCount === "number" &&
									applied.length >= runtime.failAfterWriteCount
								) {
									throw new Error("Injected update apply failure after write");
								}
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
								entry.operation.nextContent,
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
							throw new Error(
								"Injected update apply failure before journal append",
							);
						}

						appendMutationRecords(
							projectRoot,
							staged.map((entry) => ({
								...entry.record,
								status: "committed" as const,
							})),
						);
					} catch (error) {
						restoreAppliedOperations(applied);
						try {
							if (runtime.failBeforeRollbackJournalAppend) {
								throw new Error(
									"Injected update rollback journal append failure",
								);
							}
							appendMutationRecords(
								projectRoot,
								staged.map((entry) => ({
									...entry.record,
									status: "rolled_back" as const,
								})),
							);
						} catch (journalError) {
							throw new Error(
								`INTEGRITY_ERROR: update apply (batch ${staged[0]?.record.batchId ?? "unknown"}) rolled back on disk but rollback journal write failed: ${(journalError as Error).message}. Original error: ${(error as Error).message}`,
							);
						}
						throw error;
					}
					return { batchId: staged[0]?.record.batchId ?? null, result };
				},
			),
		);
	});
}

type UpdateRollbackResult = {
	status: "rolled-back" | "blocked";
	batchId: string;
	message?: string;
};
type CommittedUpdateRecord = MutationRecord & {
	kind: "update";
	beforeExisted?: boolean;
	backupPath?: string | null;
	afterHash?: string | null;
};

function rollbackUpdateBatch(
	projectRoot: string,
	batchId: string,
	reason: string,
	runtime: UpdateApplyRuntime = {},
): UpdateRollbackResult {
	return withSessionLock(projectRoot, "__scaffold-update__", () =>
		withMutationJournalLock(projectRoot, () => {
			const records = loadMutationJournal(projectRoot);
			const updates = records.filter(
				(record) =>
					record.kind === "update" &&
					record.status === "committed" &&
					record.batchId === batchId,
			) as CommittedUpdateRecord[];
			if (updates.length === 0)
				return {
					status: "blocked",
					batchId,
					message: `update-batch-not-found:${batchId}`,
				};
			const undone = new Set(
				records
					.filter(
						(record) => record.kind === "undo" && record.status === "committed",
					)
					.map((record) =>
						record.kind === "undo" ? record.targetMutationId : "",
					),
			);
			if (updates.every((record) => undone.has(record.id)))
				return {
					status: "blocked",
					batchId,
					message: `already-rolled-back:${batchId}`,
				};
			const planned = updates.map((record) => {
				const path = resolveProjectWritePath(projectRoot, record.sourcePath);
				if (!path.ok) throw new Error(path.error);
				return {
					record,
					absolutePath: path.value.path,
				};
			});
			return withResourceLocks(
				projectRoot,
				planned.map((entry) => entry.absolutePath),
				() => {
					runtime.beforeRollbackLockedValidation?.();
					const resolved = planned.map((entry) => {
						const exists = existsSync(entry.absolutePath);
						const isDirectory = exists
							? statSync(entry.absolutePath).isDirectory()
							: false;
						const currentContent =
							exists && !isDirectory
								? readFileSync(entry.absolutePath, "utf8")
								: "";
						const currentHash =
							exists && !isDirectory ? normalizeHash(currentContent) : null;
						if (currentHash !== (entry.record.afterHash ?? null))
							throw new Error(`rollback-drift:${entry.record.sourcePath}`);
						let backupBytes: Buffer | null = null;
						if (entry.record.beforeExisted) {
							try {
								backupBytes = readJournalBackupBytes(
									projectRoot,
									entry.record.backupPath,
								);
							} catch {
								throw new Error(
									`rollback-backup-unsafe:${entry.record.backupPath ?? ""}`,
								);
							}
							if (!backupBytes)
								throw new Error(
									`rollback-backup-missing:${entry.record.sourcePath}`,
								);
						}
						return { ...entry, currentContent, backupBytes };
					});
					const snapshots = resolved.map((entry) => {
						const existed = existsSync(entry.absolutePath);
						const isDirectory = existed
							? statSync(entry.absolutePath).isDirectory()
							: false;
						const snapshotPath = existed
							? makeBackupPath(
									projectRoot,
									createMutationId(),
									`${entry.record.sourcePath}.rollback-current`,
								)
							: null;
						if (snapshotPath)
							cpSync(entry.absolutePath, snapshotPath, { recursive: true });
						return { ...entry, existed, isDirectory, snapshotPath };
					});
					const undoRecords = resolved.map(({ record }) => ({
						id: createMutationId(),
						ts: new Date().toISOString(),
						kind: "undo" as const,
						status: "prepared" as const,
						dryRun: false,
						session: record.session,
						taskId: record.taskId,
						reason,
						targetMutationId: record.id,
						sourcePath: record.sourcePath,
						destinationPath: record.sourcePath,
						source: "afol-update" as const,
						batchId,
					}));
					appendMutationRecords(projectRoot, undoRecords);
					const applied: typeof resolved = [];
					try {
						for (const entry of resolved) {
							if (entry.record.beforeExisted && entry.backupBytes) {
								mkdirSync(dirname(entry.absolutePath), { recursive: true });
								writeFileSync(entry.absolutePath, entry.backupBytes);
							} else
								rmSync(entry.absolutePath, { recursive: true, force: true });
							applied.push(entry);
						}
						if (runtime.failBeforeJournalAppend)
							throw new Error(
								"Injected update rollback failure before journal append",
							);
						appendMutationRecords(
							projectRoot,
							undoRecords.map((record) => ({
								...record,
								status: "committed" as const,
							})),
						);
					} catch (error) {
						for (const snapshot of snapshots.reverse()) {
							rmSync(snapshot.absolutePath, { recursive: true, force: true });
							if (snapshot.existed && snapshot.snapshotPath)
								cpSync(snapshot.snapshotPath, snapshot.absolutePath, {
									recursive: true,
								});
						}
						try {
							if (runtime.failBeforeRollbackJournalAppend) {
								throw new Error(
									"Injected update rollback journal append failure",
								);
							}
							appendMutationRecords(
								projectRoot,
								undoRecords.map((record) => ({
									...record,
									status: "rolled_back" as const,
								})),
							);
						} catch (journalError) {
							throw new Error(
								`INTEGRITY_ERROR: update rollback (batch ${batchId}) restored files on disk but rollback journal write failed: ${(journalError as Error).message}. Original error: ${(error as Error).message}`,
							);
						}
						throw error;
					}
					return { status: "rolled-back", batchId };
				},
			);
		}),
	);
}

export async function runUpdateCommand(
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
	runtime: UpdateApplyRuntime = {},
	ctx: OperationContext = defaultOperationContext(),
): Promise<number> {
	try {
		const [rawCommand, ...rest] = args;
		const command = normalizeSubcommand(rawCommand);
		const parsedArgs = parseUpdateArgs(
			rawCommand?.startsWith("-") ? args : rest,
		);
		if (parsedArgs.allowUnboundContext) {
			requireAllowedUnboundContext();
		}
		if (command === "rollback") {
			if (requiresApproval(ctx))
				throw new Error(
					"Real update rollback requires local interactive approval.",
				);
			if (!parsedArgs.batchId)
				throw new Error("update rollback requires --batch-id");
			if (!parsedArgs.reason.trim())
				throw new Error("update rollback requires --reason");
			if (parsedArgs.dryRun) {
				const preview = { status: "dry-run", batchId: parsedArgs.batchId };
				if (parsedArgs.json)
					io.stdout(
						stringifyEnvelope(resultEnvelope(preview, "update.rollback", 0)),
					);
				else io.stdout(`update rollback dry-run: ${parsedArgs.batchId}`);
				return 0;
			}
			const rollbackRuntime = validateMutationRuntime({
				cliRoot: runtime.cliRoot,
				invocationPath: runtime.invocationPath,
				operation: "update rollback",
			});
			if (!rollbackRuntime.ok) throw new Error(rollbackRuntime.message);
			let rollback: UpdateRollbackResult;
			try {
				rollback = await withExternalPathLock(projectRoot, async () =>
					rollbackUpdateBatch(
						projectRoot,
						parsedArgs.batchId as string,
						parsedArgs.reason,
						runtime,
					),
				);
			} catch (error) {
				const message = (error as Error).message;
				if (!message.startsWith("rollback-")) throw error;
				rollback = { status: "blocked", batchId: parsedArgs.batchId, message };
			}
			const exitCode = rollback.status === "blocked" ? 4 : 0;
			if (parsedArgs.json)
				io.stdout(
					stringifyEnvelope(
						resultEnvelope(rollback, "update.rollback", exitCode),
					),
				);
			else
				io.stdout(
					`update rollback ${rollback.status}: ${rollback.batchId}${rollback.message ? ` ${rollback.message}` : ""}`,
				);
			return exitCode;
		}
		const result = checkTemplateUpdate(
			projectRoot,
			runtime.removedTemplatePaths,
		);
		const writableOperations = result.operations.filter(isWritableOperation);
		const conflictCount = result.operations.filter(
			(operation) => operation.kind === "conflict",
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
			if (conflictCount > 0) {
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
				if (requiresApproval(ctx)) {
					throw new Error(
						"Real update apply requires local interactive approval.",
					);
				}
				requireApplyContext(parsedArgs, parsedArgs.allowUnboundContext);
				if (!parsedArgs.allowUnboundContext) {
					assertTaskInProgress(
						projectRoot,
						parsedArgs.session,
						parsedArgs.taskId,
					);
				}
				const runtimeValidation = validateMutationRuntime({
					cliRoot: runtime.cliRoot,
					invocationPath: runtime.invocationPath,
					operation: "update apply",
				});
				if (!runtimeValidation.ok) {
					throw new Error(runtimeValidation.message);
				}
			}
			const assertLockedWriteAllowed = (): void => {
				if (requiresApproval(ctx)) {
					throw new Error(
						"Real update apply requires local interactive approval.",
					);
				}
				requireApplyContext(parsedArgs, parsedArgs.allowUnboundContext);
				if (parsedArgs.allowUnboundContext) requireAllowedUnboundContext();
				else
					assertTaskInProgress(
						projectRoot,
						parsedArgs.session,
						parsedArgs.taskId,
					);
				const validation = validateMutationRuntime({
					cliRoot: runtime.cliRoot,
					invocationPath: runtime.invocationPath,
					operation: "update apply",
				});
				if (!validation.ok) throw new Error(validation.message);
			};
			const applied = await withExternalPathLock(projectRoot, async () =>
				applyUpdateOperations(
					projectRoot,
					parsedArgs,
					runtime,
					assertLockedWriteAllowed,
				),
			);
			if (parsedArgs.json) {
				io.stdout(
					stringifyEnvelope(
						resultEnvelope(
							{
								...jsonResultData(applied.result, parsedArgs.verbose),
								batch_id: applied.batchId,
							},
							"update.apply",
							0,
						),
					),
				);
			} else {
				io.stdout(
					`${formatUpdateCheck(applied.result, command, {
						verbose: parsedArgs.verbose,
					}).trimEnd()}\nbatch_id: ${applied.batchId ?? "none"}`,
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
		const message = (error as Error).message;
		if (args.includes("--json") || args.includes("-j")) {
			io.stdout(
				stringifyEnvelope(
					envelopeErr("UPDATE_ERROR", message, {
						action: "update",
						exitCode: 2,
					}),
				),
			);
		} else io.stderr(message);
		return 2;
	}
}
