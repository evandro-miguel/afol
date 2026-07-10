import { describe, expect, test } from "bun:test";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runFileCommand } from "../commands/file";
import {
	parseArchiveArgs,
	parseMoveArgs,
	parsePatchArgs,
	parseUndoArgs,
} from "../commands/file/args";
import {
	runArchiveMutation,
	runMoveMutation,
	runPatchMutation,
	runUndoMutation,
} from "../commands/file/mutations";
import { undoArchiveMutation } from "../commands/file/mutations/archive";
import { undoMoveMutation } from "../commands/file/mutations/move";
import { undoPatchMutation } from "../commands/file/mutations/patch";
import { outputResult } from "../commands/file/output";
import {
	applyProjectMutationDefaults,
	archiveDestination,
	backupPath,
	type CommandIo,
	type CommandResult,
	DEFAULT_MOVE_DESTINATION,
	DEFAULT_MOVE_SOURCE,
	DEFAULT_PATCH_PATH,
	looksBinary,
	makeDiffPreview,
	makeMovePreview,
	normalizeHash,
	readTextOrEmpty,
	requireWriteContext,
	resolveSafePath,
} from "../commands/file/shared";
import { agentOperationContext } from "../core/operation-context";
import {
	appendMutationRecord,
	type MutationRecord,
} from "../services/mutations/journal";
import { resolveProjectPaths } from "../services/project/paths";

function mkProjectRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "file-command-unit-"));
	const agentsDir = join(root, ".agents");
	mkdirSync(agentsDir, { recursive: true });
	cpSync(
		join(process.cwd(), ".agents", "config.json"),
		join(agentsDir, "config.json"),
	);
	cpSync(
		join(process.cwd(), ".agents", "lock.json"),
		join(agentsDir, "lock.json"),
	);
	return root;
}

function setTaskState(
	root: string,
	session: string,
	taskId: string,
	state: "in_progress" | "done",
): void {
	const taskPath = join(root, ".afol", "wb", session, `${session}_task_01.md`);
	const taskRow = new RegExp(
		`^\\|\\s*${taskId}\\s*\\|\\s*([^|]+?)\\s*\\|\\s*([^|]*?)\\s*\\|\\s*(.*?)\\s*\\|$`,
	);
	const lines = readFileSync(taskPath, "utf8")
		.split(/\r?\n/)
		.map((line) => {
			const match = line.match(taskRow);
			if (!match) {
				return line;
			}
			const owner = (match[2] ?? "").trim();
			const notes = (match[3] ?? "").trim();
			return `| ${taskId} | ${state} | ${owner} | ${notes} |`;
		});
	writeFileSync(taskPath, `${lines.join("\n").replace(/\n*$/g, "")}\n`, "utf8");
}

function captureIo(): { io: CommandIo; stdout: string[]; stderr: string[] } {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		io: {
			stdout: (message) => stdout.push(message),
			stderr: (message) => stderr.push(message),
		},
		stdout,
		stderr,
	};
}

function writeFileTree(
	root: string,
	relativePath: string,
	contents: string,
): string {
	const absolute = join(root, relativePath);
	mkdirSync(dirname(absolute), { recursive: true });
	writeFileSync(absolute, contents, "utf8");
	return absolute;
}

function parseJsonLine(value: string): Record<string, unknown> {
	return JSON.parse(value.trim()) as Record<string, unknown>;
}

describe("file args", () => {
	test("parsePatchArgs preserves explicit path and append text", () => {
		const parsed = parsePatchArgs([
			"--path",
			"notes/doc.txt",
			"--append",
			"beta",
		]);
		expect(parsed.path).toBe("notes/doc.txt");
		expect(parsed.appendText).toBe("beta");
	});

	test("parsePatchArgs falls back to positional path and append text", () => {
		const parsed = parsePatchArgs(["notes/doc.txt", "alpha", "beta"]);
		expect(parsed.path).toBe("notes/doc.txt");
		expect(parsed.appendText).toBe("alpha beta");
	});

	test("parseMoveArgs infers destination from positional arguments", () => {
		const parsed = parseMoveArgs([
			"--path",
			"notes/source.txt",
			"notes/destination.txt",
		]);
		expect(parsed.path).toBe("notes/source.txt");
		expect(parsed.destinationPath).toBe("notes/destination.txt");
	});

	test("parseUndoArgs and parseArchiveArgs accept positional fallbacks", () => {
		expect(parseUndoArgs(["M-1"]).mutationId).toBe("M-1");
		expect(parseArchiveArgs([]).path).toBe(DEFAULT_PATCH_PATH);
	});

	test("parse functions reject bad flag usage", () => {
		expect(() => parsePatchArgs(["--session"])).toThrow(
			"Missing value for --session",
		);
		expect(() => parseMoveArgs(["--bogus"])).toThrow(
			"Unknown file argument --bogus",
		);
		expect(() => parseArchiveArgs(["--path"])).toThrow(
			"Missing value for --path",
		);
		expect(() => parseUndoArgs(["--id"])).toThrow("Missing value for --id");
	});
});

describe("file shared helpers", () => {
	test("hashing, binary detection, and diff previews behave deterministically", () => {
		expect(normalizeHash("hello")).toBe(normalizeHash("hello"));
		expect(normalizeHash("hello")).toHaveLength(64);
		expect(looksBinary(new Uint8Array())).toBe(false);
		expect(looksBinary(Buffer.from([0, 1, 2]))).toBe(true);
		expect(looksBinary(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))).toBe(
			true,
		);
		expect(looksBinary(Buffer.from("plain text", "utf8"))).toBe(false);
		expect(makeDiffPreview("same", "same", "notes/doc.txt")).toBeUndefined();
		expect(makeDiffPreview("a", "ab", "notes/doc.txt")).toContain(
			"notes/doc.txt",
		);
		expect(makeMovePreview("a", "b")).toContain("move-path");
	});

	test("project defaults, safe paths, and file reads stay in bounds", () => {
		const root = mkProjectRoot();
		try {
			const mutationsDir = resolveProjectPaths(root).mutationsDir;
			const patchArgs = applyProjectMutationDefaults(
				{
					command: "pt",
					path: DEFAULT_PATCH_PATH,
					dryRun: true,
					json: false,
					session: "S",
					taskId: "T",
					reason: "R",
					appendText: "x",
				},
				root,
			);
			expect(patchArgs.path).toBe(join(mutationsDir, ".file-probe.txt"));

			const moveArgs = applyProjectMutationDefaults(
				{
					command: "mv",
					path: DEFAULT_MOVE_SOURCE,
					destinationPath: DEFAULT_MOVE_DESTINATION,
					dryRun: true,
					json: false,
					session: "S",
					taskId: "T",
					reason: "R",
				},
				root,
			);
			expect(moveArgs.path).toBe(join(mutationsDir, "move-source.txt"));
			expect(moveArgs.destinationPath).toBe(
				join(mutationsDir, "move-destination.txt"),
			);

			const readTarget = writeFileTree(root, "notes/read.txt", "hello");
			expect(readTextOrEmpty(readTarget)).toBe("hello");
			expect(readTextOrEmpty(join(root, "notes/missing.txt"))).toBe("");
			expect(() =>
				requireWriteContext({
					command: "pt",
					path: "x",
					dryRun: false,
					json: false,
					session: "",
					taskId: "",
					reason: "",
				}),
			).toThrow(
				"Real file mutation requires --session, --task-id, and --reason.",
			);
			expect(() => resolveSafePath(root, ".afol/config.json")).toThrow(
				"protected-path:.afol/config.json",
			);
			expect(() =>
				resolveSafePath(root, ".afol/config.json.example"),
			).not.toThrow();
			expect(() => resolveSafePath(root, ".agents/config.json")).toThrow(
				"protected-path:.agents/config.json",
			);
			expect(() => resolveSafePath(root, "../outside.txt")).toThrow();

			const backup = backupPath(root, "M-1", "notes/doc.txt");
			const archive = archiveDestination(root, "M-1", "notes/doc.txt");
			expect(backup).toContain(
				resolveProjectPaths(root).abs.mutationBackupsDir,
			);
			expect(archive.path).toContain(
				resolveProjectPaths(root).mutationArchivesDir,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("file output", () => {
	test("outputResult emits JSON and human output", () => {
		const jsonIo = captureIo();
		const result = {
			command: "pt",
			status: "write",
			dry_run: false,
			session: "S",
			task_id: "T",
			reason: "R",
			path: "notes/doc.txt",
			mutation_id: "M-1",
			before_hash: "before",
			after_hash: "after",
		} satisfies CommandResult;
		outputResult(result, jsonIo.io, true);
		expect(jsonIo.stdout).toHaveLength(1);
		const payload = parseJsonLine(jsonIo.stdout[0] ?? "");
		expect(payload.action).toBe("file");
		expect(payload.ok).toBe(true);
		expect(payload.data).toMatchObject(result);
		expect((jsonIo.stdout[0] ?? "").endsWith("\n")).toBe(true);

		const humanIo = captureIo();
		outputResult(
			{
				command: "ud",
				status: "blocked",
				dry_run: true,
				session: "S",
				task_id: "T",
				reason: "R",
				path: "notes/doc.txt",
				destination: "notes/doc.txt",
				target_mutation_id: "M-1",
				message: "blocked",
				diff_preview: "preview",
			} satisfies CommandResult,
			humanIo.io,
			false,
		);
		expect(humanIo.stdout[0]).toContain("file:ud");
		expect(humanIo.stdout[0]).toContain("target_mutation_id=M-1");
		expect(humanIo.stdout[0]).toContain("diff=");
	});
});

describe("file command dispatcher", () => {
	test("dispatches branches in-process", async () => {
		const root = mkProjectRoot();
		try {
			const patchIo = captureIo();
			expect(
				await runFileCommand(
					["pt", "--path", "notes/doc.txt", "--dry-run", "--json"],
					root,
					patchIo.io,
				),
			).toBe(0);
			expect(parseJsonLine(patchIo.stdout[0] ?? "").command).toBe("pt");

			const appendIo = captureIo();
			expect(
				await runFileCommand(
					["append", "--path", "notes/doc.txt", "--dry-run", "--json"],
					root,
					appendIo.io,
				),
			).toBe(0);
			expect(parseJsonLine(appendIo.stdout[0] ?? "").command).toBe("pt");

			writeFileTree(root, DEFAULT_MOVE_SOURCE, "move me");
			const moveIo = captureIo();
			expect(await runFileCommand(["mv", "--dry-run"], root, moveIo.io)).toBe(
				0,
			);
			expect(moveIo.stdout[0]).toContain("file:mv");

			const archiveIo = captureIo();
			expect(
				await runFileCommand(["ar", "--dry-run"], root, archiveIo.io),
			).toBe(0);
			expect(archiveIo.stdout[0]).toContain("file:ar");

			const undoIo = captureIo();
			expect(
				await runFileCommand(["ud", "--dry-run", "--json"], root, undoIo.io),
			).toBe(0);
			expect(parseJsonLine(undoIo.stdout[0] ?? "").status).toBe("noop");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("reports missing and unknown subcommands", async () => {
		const root = mkProjectRoot();
		try {
			const missingIo = captureIo();
			expect(await runFileCommand([], root, missingIo.io)).toBe(2);
			expect(missingIo.stderr[0]).toContain("Missing file subcommand");

			const unknownIo = captureIo();
			expect(await runFileCommand(["xx"], root, unknownIo.io)).toBe(2);
			expect(unknownIo.stderr[0]).toContain("Unknown file command: xx");

			const undoIo = captureIo();
			expect(await runFileCommand(["ud"], root, undoIo.io)).toBe(2);
			expect(undoIo.stderr[0]).toContain("Real file mutation requires");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects non-dry-run mutation if task exits in_progress before write under atomic lock", async () => {
		const root = mkProjectRoot();
		try {
			const target = writeFileTree(root, "notes/doc.txt", "alpha");
			const session = "ATOMIC";
			const taskId = "T-01";
			const sessionDir = join(root, ".afol", "wb", session);
			mkdirSync(sessionDir, { recursive: true });
			writeFileSync(
				join(sessionDir, `${session}_task_01.md`),
				[
					"# Tasks: active",
					"",
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					`| ${taskId} | in_progress | worker | doing file change |`,
					"",
				].join("\n"),
				"utf8",
			);

			const journalDir = resolveProjectPaths(root).abs.mutationsDir;
			const io = captureIo();
			const code = await runFileCommand(
				[
					"pt",
					"--path",
					"notes/doc.txt",
					"--append",
					"beta",
					"--session",
					session,
					"--task-id",
					taskId,
					"--reason",
					"lock test",
				],
				root,
				io.io,
				undefined,
				{
					beforeMutation: () => {
						setTaskState(root, session, taskId, "done");
					},
				},
			);

			expect(code).toBe(2);
			expect(io.stderr[0]).toContain(`Task ${taskId} is done`);
			expect(readFileSync(target, "utf8")).toBe("alpha");
			expect(existsSync(journalDir)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("denies real file mutations for restricted agent callers", async () => {
		const root = mkProjectRoot();
		try {
			writeFileTree(root, "notes/doc.txt", "alpha");
			const io = captureIo();
			expect(
				await runFileCommand(
					[
						"pt",
						"--path",
						"notes/doc.txt",
						"--append",
						"beta",
						"--session",
						"S",
						"--task-id",
						"T-01",
						"--reason",
						"trust test",
					],
					root,
					io.io,
					agentOperationContext(),
				),
			).toBe(2);
			expect(io.stderr[0]).toContain("requires local interactive approval");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects non-dry-run mutations with closed session task and does not write or journal", async () => {
		const root = mkProjectRoot();
		try {
			const target = writeFileTree(root, "notes/doc.txt", "original");

			// Create a session with a done (closed) task
			const sessionDir = join(root, ".afol", "wb", "CLOSED");
			mkdirSync(sessionDir, { recursive: true });
			writeFileSync(
				join(sessionDir, "CLOSED_task_01.md"),
				[
					"# Tasks: closed",
					"",
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | done | worker | already done |",
					"",
				].join("\n"),
				"utf8",
			);

			const journalDir = resolveProjectPaths(root).abs.mutationsDir;
			expect(existsSync(journalDir)).toBe(false);

			const io = captureIo();
			const code = await runFileCommand(
				[
					"pt",
					"--path",
					"notes/doc.txt",
					"--append",
					"should-not-write",
					"--session",
					"CLOSED",
					"--task-id",
					"T-01",
					"--reason",
					"should fail",
				],
				root,
				io.io,
			);

			expect(code).toBe(2);
			expect(io.stderr[0]).toContain("T-01 is done");
			expect(readFileSync(target, "utf8")).toBe("original");
			// Journal must not have been created
			expect(existsSync(journalDir)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("file mutation handlers", () => {
	test("move and archive use binary-safe hashes and suppress binary diffs", () => {
		const root = mkProjectRoot();
		try {
			const movePayload = Buffer.from([0, 255, 16, 32, 64]);
			const moveSource = join(root, "bin", "move.bin");
			mkdirSync(dirname(moveSource), { recursive: true });
			writeFileSync(moveSource, movePayload);
			const moveWrite = runMoveMutation(
				{
					command: "mv",
					path: "bin/move.bin",
					destinationPath: "bin/moved.bin",
					dryRun: false,
					json: false,
					session: "S",
					taskId: "T",
					reason: "R",
				},
				root,
			);
			const moveHash = normalizeHash(movePayload);
			expect(moveWrite.before_hash).toBe(moveHash);
			expect(moveWrite.after_hash).toBe(moveHash);

			const archivePayload = Buffer.from([9, 8, 7, 0, 6]);
			const archiveSource = join(root, "bin", "archive.bin");
			writeFileSync(archiveSource, archivePayload);
			const archiveWrite = runArchiveMutation(
				{
					command: "ar",
					path: "bin/archive.bin",
					dryRun: false,
					json: false,
					session: "S",
					taskId: "T",
					reason: "R",
				},
				root,
			);
			const archiveHash = normalizeHash(archivePayload);
			expect(archiveWrite.before_hash).toBe(archiveHash);
			expect(archiveWrite.after_hash).toBe(archiveHash);

			const undoPreview = undoArchiveMutation(
				{
					command: "ud",
					path: "",
					dryRun: true,
					json: false,
					session: "S",
					taskId: "T",
					reason: "R",
				},
				{
					id: archiveWrite.mutation_id ?? "M-archive",
					ts: new Date().toISOString(),
					kind: "archive",
					status: "applied",
					dryRun: false,
					session: "S",
					taskId: "T",
					reason: "R",
					sourcePath: "bin/archive.bin",
					destinationPath: archiveWrite.destination ?? "",
					backupPath: archiveWrite.backup_path ?? null,
					beforeHash: archiveWrite.before_hash ?? null,
					afterHash: archiveWrite.after_hash ?? null,
				},
				root,
			);
			expect(undoPreview.diff_preview).toBeUndefined();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("patch covers dry-run, noop, write, block, and undo", () => {
		const root = mkProjectRoot();
		try {
			const file = writeFileTree(root, "notes/doc.txt", "alpha");
			const dryRun = runPatchMutation(
				{
					command: "pt",
					path: "notes/doc.txt",
					appendText: "beta",
					dryRun: true,
					json: false,
					session: "S",
					taskId: "T",
					reason: "R",
				},
				root,
			);
			expect(dryRun.status).toBe("dry-run");

			const noop = runPatchMutation(
				{
					command: "pt",
					path: "notes/doc.txt",
					appendText: "",
					dryRun: false,
					json: false,
					session: "S",
					taskId: "T",
					reason: "R",
				},
				root,
			);
			expect(noop.status).toBe("noop");
			expect(readFileSync(file, "utf8")).toBe("alpha");

			const write = runPatchMutation(
				{
					command: "pt",
					path: "notes/doc.txt",
					appendText: "+beta",
					dryRun: false,
					json: false,
					session: "S",
					taskId: "T",
					reason: "R",
				},
				root,
			);
			expect(write.status).toBe("write");
			expect(readFileSync(file, "utf8")).toBe("alpha+beta");
			expect(write.backup_path).toContain(
				resolveProjectPaths(root).abs.mutationBackupsDir,
			);

			const binary = writeFileTree(root, "assets/logo.bin", "\u0000binary");
			const blocked = runPatchMutation(
				{
					command: "pt",
					path: "assets/logo.bin",
					appendText: "x",
					dryRun: false,
					json: false,
					session: "S",
					taskId: "T",
					reason: "R",
				},
				root,
			);
			expect(blocked.status).toBe("blocked");
			expect(blocked.message).toContain("binary target");
			expect(readFileSync(binary, "utf8")).toContain("binary");

			const mutation: MutationRecord = {
				id: "M-patch",
				ts: new Date().toISOString(),
				kind: "patch",
				status: "applied",
				dryRun: false,
				session: "S",
				taskId: "T",
				reason: "R",
				sourcePath: "notes/doc.txt",
				backupPath: null,
				beforeHash: null,
				afterHash: null,
			};
			const undone = runUndoMutation(
				{
					command: "ud",
					path: "",
					dryRun: true,
					json: false,
					session: "S",
					taskId: "T",
					reason: "R",
					mutationId: "M-patch",
				},
				root,
			);
			expect(undone.status).toBe("noop");
			appendMutationRecord(root, mutation);
			const dryUndo = runUndoMutation(
				{
					command: "ud",
					path: "",
					dryRun: true,
					json: false,
					session: "S",
					taskId: "T",
					reason: "R",
					mutationId: "M-patch",
				},
				root,
			);
			expect(dryUndo.status).toBe("dry-run");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("undoPatchMutation restores the original file and validates the mutation kind", () => {
		const root = mkProjectRoot();
		try {
			const file = writeFileTree(root, "notes/undo-patch.txt", "base");
			const write = runPatchMutation(
				{
					command: "pt",
					path: "notes/undo-patch.txt",
					appendText: "+next",
					dryRun: false,
					json: false,
					session: "S",
					taskId: "T",
					reason: "R",
				},
				root,
			);
			const mutation: MutationRecord = {
				id: write.mutation_id ?? "M-patch-undo",
				ts: new Date().toISOString(),
				kind: "patch",
				status: "applied",
				dryRun: false,
				session: "S",
				taskId: "T",
				reason: "R",
				sourcePath: "notes/undo-patch.txt",
				beforeHash: write.before_hash ?? null,
				afterHash: write.after_hash ?? null,
				backupPath: write.backup_path ?? null,
				beforeExisted: true,
			};

			expect(
				undoPatchMutation(
					{
						command: "ud",
						path: "",
						dryRun: true,
						json: false,
						session: "S",
						taskId: "T",
						reason: "R",
					},
					mutation,
					root,
				).status,
			).toBe("dry-run");
			expect(
				undoPatchMutation(
					{
						command: "ud",
						path: "",
						dryRun: false,
						json: false,
						session: "S",
						taskId: "T",
						reason: "R",
					},
					mutation,
					root,
				).status,
			).toBe("write");
			expect(readFileSync(file, "utf8")).toBe("base");
			expect(() =>
				undoPatchMutation(
					{
						command: "ud",
						path: "",
						dryRun: false,
						json: false,
						session: "S",
						taskId: "T",
						reason: "R",
					},
					{ ...mutation, kind: "move" } as unknown as MutationRecord,
					root,
				),
			).toThrow("Expected patch mutation for undo, got move");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("patch on empty file sets beforeExisted true and creates backup_path", () => {
		const root = mkProjectRoot();
		try {
			const file = writeFileTree(root, "notes/empty.txt", "");
			const write = runPatchMutation(
				{
					command: "pt",
					path: "notes/empty.txt",
					appendText: "+content",
					dryRun: false,
					json: false,
					session: "S",
					taskId: "T",
					reason: "R",
				},
				root,
			);
			expect(write.status).toBe("write");
			expect(write.backup_path).toBeTruthy();
			expect(readFileSync(file, "utf8")).toBe("+content");

			const mutation: MutationRecord = {
				id: write.mutation_id ?? "M-empty-patch",
				ts: new Date().toISOString(),
				kind: "patch",
				status: "applied",
				dryRun: false,
				session: "S",
				taskId: "T",
				reason: "R",
				sourcePath: "notes/empty.txt",
				beforeHash: write.before_hash ?? null,
				afterHash: write.after_hash ?? null,
				backupPath: write.backup_path ?? null,
				beforeExisted: true,
			};

			const undone = undoPatchMutation(
				{
					command: "ud",
					path: "",
					dryRun: false,
					json: false,
					session: "S",
					taskId: "T",
					reason: "R",
				},
				mutation,
				root,
			);
			expect(undone.status).toBe("write");
			expect(readFileSync(file, "utf8")).toBe("");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("patch on new file sets beforeExisted false and no backup_path", () => {
		const root = mkProjectRoot();
		try {
			const filePath = join(root, "notes/new.txt");
			const write = runPatchMutation(
				{
					command: "pt",
					path: "notes/new.txt",
					appendText: "fresh",
					dryRun: false,
					json: false,
					session: "S",
					taskId: "T",
					reason: "R",
				},
				root,
			);
			expect(write.status).toBe("write");
			expect(write.backup_path).toBeNull();
			expect(readFileSync(filePath, "utf8")).toBe("fresh");

			const mutation: MutationRecord = {
				id: write.mutation_id ?? "M-new-patch",
				ts: new Date().toISOString(),
				kind: "patch",
				status: "applied",
				dryRun: false,
				session: "S",
				taskId: "T",
				reason: "R",
				sourcePath: "notes/new.txt",
				beforeHash: write.before_hash ?? null,
				afterHash: write.after_hash ?? null,
				backupPath: null,
				beforeExisted: false,
			};

			const undone = undoPatchMutation(
				{
					command: "ud",
					path: "",
					dryRun: false,
					json: false,
					session: "S",
					taskId: "T",
					reason: "R",
				},
				mutation,
				root,
			);
			expect(undone.status).toBe("write");
			expect(existsSync(filePath)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("undoPatchMutation rejects journal backup paths outside the backups dir", () => {
		const root = mkProjectRoot();
		try {
			const file = writeFileTree(root, "notes/outside-backup.txt", "base");
			const mutation: MutationRecord = {
				id: "M-patch-malicious",
				ts: new Date().toISOString(),
				kind: "patch",
				status: "applied",
				dryRun: false,
				session: "S",
				taskId: "T",
				reason: "R",
				sourcePath: "notes/outside-backup.txt",
				backupPath: join(root, "outside", "evil.bak"),
				beforeExisted: true,
			};

			expect(() =>
				undoPatchMutation(
					{
						command: "ud",
						path: "",
						dryRun: true,
						json: false,
						session: "S",
						taskId: "T",
						reason: "R",
					},
					mutation,
					root,
				),
			).toThrow("journal backup path escapes mutation backups dir");

			expect(() =>
				undoPatchMutation(
					{
						command: "ud",
						path: "",
						dryRun: false,
						json: false,
						session: "S",
						taskId: "T",
						reason: "R",
					},
					mutation,
					root,
				),
			).toThrow("journal backup path escapes mutation backups dir");
			expect(readFileSync(file, "utf8")).toBe("base");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("move covers dry-run, noop, write, and undo restore", () => {
		const root = mkProjectRoot();
		try {
			const source = writeFileTree(root, "mut/source.txt", "from");
			const destination = writeFileTree(
				root,
				"mut/destination.txt",
				"existing",
			);

			expect(
				runMoveMutation(
					{
						command: "mv",
						path: "mut/source.txt",
						destinationPath: "mut/destination.txt",
						dryRun: true,
						json: false,
						session: "S",
						taskId: "T",
						reason: "R",
					},
					root,
				).status,
			).toBe("dry-run");
			expect(
				runMoveMutation(
					{
						command: "mv",
						path: "mut/source.txt",
						destinationPath: "mut/source.txt",
						dryRun: false,
						json: false,
						session: "S",
						taskId: "T",
						reason: "R",
					},
					root,
				).status,
			).toBe("noop");

			const write = runMoveMutation(
				{
					command: "mv",
					path: "mut/source.txt",
					destinationPath: "mut/destination.txt",
					dryRun: false,
					json: false,
					session: "S",
					taskId: "T",
					reason: "R",
				},
				root,
			);
			expect(write.status).toBe("write");
			expect(readFileSync(destination, "utf8")).toBe("from");
			expect(existsSync(source)).toBe(false);

			const undo = runUndoMutation(
				{
					command: "ud",
					path: "",
					dryRun: false,
					json: false,
					session: "S",
					taskId: "T",
					reason: "R",
				},
				root,
			);
			expect(undo.status).toBe("write");
			expect(readFileSync(source, "utf8")).toBe("from");
			expect(readFileSync(destination, "utf8")).toBe("existing");

			expect(() =>
				runMoveMutation(
					{
						command: "mv",
						path: "mut/missing.txt",
						destinationPath: "mut/else.txt",
						dryRun: false,
						json: false,
						session: "S",
						taskId: "T",
						reason: "R",
					},
					root,
				),
			).toThrow("Source file not found: mut/missing.txt");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("move dry-run rejects a missing source before claiming success", () => {
		const root = mkProjectRoot();
		try {
			expect(() =>
				runMoveMutation(
					{
						command: "mv",
						path: "mut/missing.txt",
						destinationPath: "mut/else.txt",
						dryRun: true,
						json: false,
						session: "S",
						taskId: "T",
						reason: "R",
					},
					root,
				),
			).toThrow("Source file not found: mut/missing.txt");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("move noop rejects a missing source before claiming success", () => {
		const root = mkProjectRoot();
		try {
			expect(() =>
				runMoveMutation(
					{
						command: "mv",
						path: "mut/missing.txt",
						destinationPath: "mut/missing.txt",
						dryRun: false,
						json: false,
						session: "S",
						taskId: "T",
						reason: "R",
					},
					root,
				),
			).toThrow("Source file not found: mut/missing.txt");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("undoMoveMutation restores both paths and validates the mutation kind", () => {
		const root = mkProjectRoot();
		try {
			const source = writeFileTree(root, "mut/source.txt", "from");
			const destination = writeFileTree(
				root,
				"mut/destination.txt",
				"existing",
			);
			const write = runMoveMutation(
				{
					command: "mv",
					path: "mut/source.txt",
					destinationPath: "mut/destination.txt",
					dryRun: false,
					json: false,
					session: "S",
					taskId: "T",
					reason: "R",
				},
				root,
			);
			const mutation: MutationRecord = {
				id: write.mutation_id ?? "M-move-undo",
				ts: new Date().toISOString(),
				kind: "move",
				status: "applied",
				dryRun: false,
				session: "S",
				taskId: "T",
				reason: "R",
				sourcePath: "mut/source.txt",
				destinationPath: "mut/destination.txt",
				overwrittenBackupPath: write.overwritten_backup_path ?? null,
			};

			const dryRunUndo = undoMoveMutation(
				{ dryRun: true, session: "S", taskId: "T", reason: "R" },
				mutation,
				root,
			);
			expect(dryRunUndo.status).toBe("dry-run");
			expect(dryRunUndo.before_hash).toBeNull();
			const writeUndo = undoMoveMutation(
				{ dryRun: false, session: "S", taskId: "T", reason: "R" },
				mutation,
				root,
			);
			expect(writeUndo.status).toBe("write");
			expect(writeUndo.before_hash).toBeNull();
			expect(readFileSync(source, "utf8")).toBe("from");
			expect(readFileSync(destination, "utf8")).toBe("existing");
			expect(() =>
				undoMoveMutation(
					{ dryRun: false, session: "S", taskId: "T", reason: "R" },
					{ ...mutation, kind: "patch" } as unknown as MutationRecord,
					root,
				),
			).toThrow("Expected move mutation for undo, got patch");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("undoMoveMutation rejects overwritten backup paths outside the backups dir", () => {
		const root = mkProjectRoot();
		try {
			const destination = writeFileTree(
				root,
				"mut/malicious-destination.txt",
				"existing",
			);
			const mutation: MutationRecord = {
				id: "M-move-malicious",
				ts: new Date().toISOString(),
				kind: "move",
				status: "applied",
				dryRun: false,
				session: "S",
				taskId: "T",
				reason: "R",
				sourcePath: "mut/malicious-source.txt",
				destinationPath: "mut/malicious-destination.txt",
				overwrittenBackupPath: join(root, "outside", "evil-move.bak"),
			};

			expect(() =>
				undoMoveMutation(
					{ dryRun: true, session: "S", taskId: "T", reason: "R" },
					mutation,
					root,
				),
			).toThrow("journal backup path escapes mutation backups dir");

			expect(() =>
				undoMoveMutation(
					{ dryRun: false, session: "S", taskId: "T", reason: "R" },
					mutation,
					root,
				),
			).toThrow("journal backup path escapes mutation backups dir");
			expect(readFileSync(destination, "utf8")).toBe("existing");
			expect(existsSync(join(root, "mut", "malicious-source.txt"))).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("archive covers dry-run, noop, write, and undo archive", () => {
		const root = mkProjectRoot();
		try {
			const source = writeFileTree(root, "notes/archive.txt", "archived");
			expect(
				runArchiveMutation(
					{
						command: "ar",
						path: "notes/archive.txt",
						dryRun: true,
						json: false,
						session: "S",
						taskId: "T",
						reason: "R",
					},
					root,
				).status,
			).toBe("dry-run");
			expect(
				runArchiveMutation(
					{
						command: "ar",
						path: "notes/missing.txt",
						dryRun: false,
						json: false,
						session: "S",
						taskId: "T",
						reason: "R",
					},
					root,
				).status,
			).toBe("noop");

			const write = runArchiveMutation(
				{
					command: "ar",
					path: "notes/archive.txt",
					dryRun: false,
					json: false,
					session: "S",
					taskId: "T",
					reason: "R",
				},
				root,
			);
			expect(write.status).toBe("write");
			expect(existsSync(source)).toBe(false);

			const undo = runUndoMutation(
				{
					command: "ud",
					path: "",
					dryRun: false,
					json: false,
					session: "S",
					taskId: "T",
					reason: "R",
					mutationId: write.mutation_id,
				},
				root,
			);
			expect(undo.status).toBe("write");
			expect(readFileSync(source, "utf8")).toBe("archived");

			expect(() =>
				runArchiveMutation(
					{
						command: "ar",
						path: ".afol/config.json",
						dryRun: false,
						json: false,
						session: "S",
						taskId: "T",
						reason: "R",
					},
					root,
				),
			).toThrow("protected-path:.afol/config.json");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("undoArchiveMutation restores archived content and validates the mutation kind", () => {
		const root = mkProjectRoot();
		try {
			const source = writeFileTree(root, "notes/archive-undo.txt", "archived");
			const write = runArchiveMutation(
				{
					command: "ar",
					path: "notes/archive-undo.txt",
					dryRun: false,
					json: false,
					session: "S",
					taskId: "T",
					reason: "R",
				},
				root,
			);
			const mutation: MutationRecord = {
				id: write.mutation_id ?? "M-archive-undo",
				ts: new Date().toISOString(),
				kind: "archive",
				status: "applied",
				dryRun: false,
				session: "S",
				taskId: "T",
				reason: "R",
				sourcePath: "notes/archive-undo.txt",
				destinationPath: write.destination ?? write.backup_path ?? "",
			};

			expect(
				undoArchiveMutation(
					{
						command: "ud",
						path: "",
						dryRun: true,
						json: false,
						session: "S",
						taskId: "T",
						reason: "R",
					},
					mutation,
					root,
				).status,
			).toBe("dry-run");
			expect(
				undoArchiveMutation(
					{
						command: "ud",
						path: "",
						dryRun: false,
						json: false,
						session: "S",
						taskId: "T",
						reason: "R",
					},
					mutation,
					root,
				).status,
			).toBe("write");
			expect(readFileSync(source, "utf8")).toBe("archived");
			expect(() =>
				undoArchiveMutation(
					{
						command: "ud",
						path: "",
						dryRun: false,
						json: false,
						session: "S",
						taskId: "T",
						reason: "R",
					},
					{ ...mutation, kind: "move" } as unknown as MutationRecord,
					root,
				),
			).toThrow("Expected archive mutation for undo, got move");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("runUndoMutation dispatches patch, move, and archive records", () => {
		const root = mkProjectRoot();
		try {
			writeFileTree(root, "notes/journal-patch.txt", "base");
			const patch = runPatchMutation(
				{
					command: "pt",
					path: "notes/journal-patch.txt",
					appendText: "+next",
					dryRun: false,
					json: false,
					session: "S",
					taskId: "T",
					reason: "R",
				},
				root,
			);
			expect(
				runUndoMutation(
					{
						command: "ud",
						path: "",
						dryRun: true,
						json: false,
						session: "S",
						taskId: "T",
						reason: "R",
						mutationId: patch.mutation_id,
					},
					root,
				).status,
			).toBe("dry-run");

			writeFileTree(root, "mut/journal-source.txt", "from");
			writeFileTree(root, "mut/journal-destination.txt", "existing");
			expect(
				runMoveMutation(
					{
						command: "mv",
						path: "mut/journal-source.txt",
						destinationPath: "mut/journal-destination.txt",
						dryRun: false,
						json: false,
						session: "S",
						taskId: "T",
						reason: "R",
					},
					root,
				).status,
			).toBe("write");
			expect(
				runUndoMutation(
					{
						command: "ud",
						path: "",
						dryRun: true,
						json: false,
						session: "S",
						taskId: "T",
						reason: "R",
					},
					root,
				).status,
			).toBe("dry-run");

			writeFileTree(root, "notes/journal-archive.txt", "archived");
			expect(
				runArchiveMutation(
					{
						command: "ar",
						path: "notes/journal-archive.txt",
						dryRun: false,
						json: false,
						session: "S",
						taskId: "T",
						reason: "R",
					},
					root,
				).status,
			).toBe("write");
			expect(
				runUndoMutation(
					{
						command: "ud",
						path: "",
						dryRun: false,
						json: false,
						session: "S",
						taskId: "T",
						reason: "R",
					},
					root,
				).status,
			).toBe("write");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("runUndoMutation handles no target, explicit ids, and session mismatch", () => {
		const root = mkProjectRoot();
		try {
			const noop = runUndoMutation(
				{
					command: "ud",
					path: "",
					dryRun: false,
					json: false,
					session: "S",
					taskId: "T",
					reason: "R",
				},
				root,
			);
			expect(noop.status).toBe("noop");

			const mutation: MutationRecord = {
				id: "M-explicit",
				ts: new Date().toISOString(),
				kind: "patch",
				status: "applied",
				dryRun: false,
				session: "S",
				taskId: "T",
				reason: "R",
				sourcePath: "notes/doc.txt",
				backupPath: null,
				beforeHash: null,
				afterHash: null,
			};
			appendMutationRecord(root, mutation);
			expect(
				runUndoMutation(
					{
						command: "ud",
						path: "",
						dryRun: true,
						json: false,
						session: "S",
						taskId: "T",
						reason: "R",
						mutationId: "M-explicit",
					},
					root,
				).status,
			).toBe("dry-run");

			expect(() =>
				runUndoMutation(
					{
						command: "ud",
						path: "",
						dryRun: false,
						json: false,
						session: "OTHER",
						taskId: "OTHER",
						reason: "R",
						mutationId: "M-explicit",
					},
					root,
				),
			).toThrow(/session\/task mismatch/);
			expect(
				runUndoMutation(
					{
						command: "ud",
						path: "",
						dryRun: false,
						json: false,
						session: "S",
						taskId: "T",
						reason: "R",
						mutationId: "missing",
					},
					root,
				),
			).toMatchObject({ status: "noop" });
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
