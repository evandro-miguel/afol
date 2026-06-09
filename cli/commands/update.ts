import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { atomicWriteText } from "../services/io/atomic";
import {
	appendMutationRecord,
	createMutationId,
} from "../services/mutations/journal";
import { resolveProjectPaths } from "../services/project/paths";
import {
	checkTemplateUpdate,
	formatUpdateCheck,
	type UpdateOperation,
} from "../services/update/check";

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

function applyUpdateOperations(
	projectRoot: string,
	operations: UpdateOperation[],
	context: Pick<ParsedUpdateArgs, "session" | "taskId" | "reason">,
): void {
	for (const operation of operations.filter(isWritableOperation)) {
		if (!operation.nextContent) {
			continue;
		}
		const absolutePath = join(projectRoot, operation.path);
		const dir = dirname(absolutePath);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
		const beforeExisted = existsSync(absolutePath);
		const beforeContent = beforeExisted
			? readFileSync(absolutePath, "utf8")
			: "";
		const mutationId = createMutationId();
		let backupPath: string | null = null;

		if (beforeExisted) {
			backupPath = mutationBackupPath(projectRoot, mutationId, operation.path);
			cpSync(absolutePath, backupPath);
		}

		writeAtomically(
			absolutePath,
			operation.path,
			mutationId,
			operation.nextContent,
		);

		appendMutationRecord(projectRoot, {
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
			...(operation.diff ? { diffPreview: operation.diff } : {}),
		});
	}
}

export async function runUpdateCommand(
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
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
				io.stdout(
					parsedArgs.json
						? JSON.stringify(result)
						: formatUpdateCheck(result, command).trimEnd(),
				);
				return 1;
			}
			if (blockedCount > 0) {
				io.stdout(
					parsedArgs.json
						? JSON.stringify(result)
						: formatUpdateCheck(result, "apply").trimEnd(),
				);
				return 4;
			}
			if (parsedArgs.dryRun) {
				io.stdout(
					parsedArgs.json
						? JSON.stringify(result)
						: formatUpdateCheck(result, "apply").trimEnd(),
				);
				return 0;
			}
			if (writableOperations.length > 0) {
				requireApplyContext(parsedArgs);
			}
			applyUpdateOperations(projectRoot, writableOperations, parsedArgs);
			io.stdout(
				parsedArgs.json
					? JSON.stringify(result)
					: formatUpdateCheck(result, command).trimEnd(),
			);
			return 0;
		}

		io.stdout(
			parsedArgs.json
				? JSON.stringify(result)
				: formatUpdateCheck(result, command).trimEnd(),
		);
		return result.hasSource ? 0 : 1;
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}
}
