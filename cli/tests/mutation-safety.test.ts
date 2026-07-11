import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	appendFileSync,
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeHash } from "../commands/file/shared";
import { resolveProjectPaths } from "../services/project/paths";

const kernelPath = `${process.cwd()}/cli/main.ts`;

function runKernel(cwd: string, args: string[]) {
	return spawnSync("bun", [kernelPath, ...args], {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

function parseJsonOutput(stdout: string): Record<string, unknown> {
	return JSON.parse(stdout) as Record<string, unknown>;
}

function expectFileEnvelope(
	payload: Record<string, unknown>,
	exitCode = 0,
	ok = exitCode === 0,
): Record<string, unknown> & { data: Record<string, unknown> } {
	expect(payload.schema).toBe("afol.result/v1");
	expect(payload.ok).toBe(ok);
	expect(payload.exit_code).toBe(exitCode);
	expect(payload.action).toBe("file");
	const data = payload.data as Record<string, unknown>;
	expect(data).toBeTruthy();
	for (const [key, value] of Object.entries(data)) {
		expect(payload[key]).toEqual(value);
	}
	return payload as Record<string, unknown> & { data: Record<string, unknown> };
}

function mkProjectRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "mutation-safety-"));
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

function createMutationSession(
	root: string,
	session: string,
	taskId: string,
): void {
	const sessionDir = join(root, ".afol", "wb", session);
	mkdirSync(sessionDir, { recursive: true });
	writeFileSync(
		join(sessionDir, `${session}_task_01.md`),
		[
			`# Tasks: mutation-safety`,
			"",
			"## State Board",
			"",
			"| Task | State | Owner | Notes |",
			"|------|-------|-------|-------|",
			`| ${taskId} | in_progress | worker | mutation-safety test |`,
			"",
		].join("\n"),
		"utf8",
	);
}

function readMutationJournal(root: string): Array<Record<string, unknown>> {
	const path = join(
		resolveProjectPaths(root).abs.mutationsDir,
		"mutations.jsonl",
	);
	if (!existsSync(path)) {
		return [];
	}
	return readFileSync(path, "utf8")
		.split("\n")
		.map((row) => row.trim())
		.filter((row) => row.length > 0)
		.map((row) => JSON.parse(row) as Record<string, unknown>);
}

describe("mutation safety command family", () => {
	test("pt dry-run shows diff and hashes without mutating", () => {
		const root = mkProjectRoot();
		try {
			const target = join(root, "notes", "doc.txt");
			mkdirSync(join(root, "notes"), { recursive: true });
			writeFileSync(target, "alpha", "utf8");

			const proc = runKernel(root, [
				"f",
				"pt",
				"--session",
				"S-01",
				"--task-id",
				"T-01",
				"--reason",
				"append baseline",
				"--path",
				"notes/doc.txt",
				"--append",
				"\nbeta",
				"--dry-run",
				"--json",
			]);

			expect(proc.status).toBe(0);
			const result = expectFileEnvelope(parseJsonOutput(proc.stdout as string));
			expect(result.command).toBe("pt");
			expect(result.status).toBe("dry-run");
			expect(result.path).toBe("notes/doc.txt");
			expect(typeof result.before_hash).toBe("string");
			expect(typeof result.after_hash).toBe("string");
			expect(typeof result.diff_preview).toBe("string");
			expect(result.dry_run).toBe(true);
			expect(result.path).toBe("notes/doc.txt");
			expect(readFileSync(target, "utf8")).toBe("alpha");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("pt write stores backup and records mutation", () => {
		const root = mkProjectRoot();
		try {
			const target = join(root, "notes", "with-backup.txt");
			mkdirSync(join(root, "notes"), { recursive: true });
			writeFileSync(target, "v1", "utf8");
			createMutationSession(root, "S-02", "T-02");

			const proc = runKernel(root, [
				"f",
				"pt",
				"--session",
				"S-02",
				"--task-id",
				"T-02",
				"--reason",
				"append backup",
				"--path",
				"notes/with-backup.txt",
				"--append",
				"+v2",
				"--json",
			]);
			expect(proc.status).toBe(0);
			const result = expectFileEnvelope(parseJsonOutput(proc.stdout as string));
			expect(result.status).toBe("write");
			expect(result.path).toBe("notes/with-backup.txt");
			expect(result.backup_path).toBeTruthy();

			const backupPath = result.backup_path as string;
			expect(existsSync(backupPath)).toBe(true);
			expect(readFileSync(backupPath, "utf8")).toBe("v1");
			expect(readFileSync(target, "utf8")).toBe("v1+v2");

			const journal = readMutationJournal(root);
			expect(journal.length).toBe(2);
			expect(journal.map((row) => row.status)).toEqual([
				"prepared",
				"committed",
			]);
			expect(journal[0]?.kind).toBe("patch");
			expect(journal[1]?.status).toBe("committed");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("mv write plus undo restores source and destination backup", () => {
		const root = mkProjectRoot();
		try {
			const source = join(root, "mut", "source.txt");
			const destination = join(root, "mut", "destination.txt");
			mkdirSync(join(root, "mut"), { recursive: true });
			writeFileSync(source, "from", "utf8");
			writeFileSync(destination, "existing", "utf8");
			createMutationSession(root, "S-03", "T-03");

			const moveProc = runKernel(root, [
				"f",
				"mv",
				"--session",
				"S-03",
				"--task-id",
				"T-03",
				"--reason",
				"move with overwrite",
				"--path",
				"mut/source.txt",
				"--to",
				"mut/destination.txt",
				"--expected-destination-exists",
				"true",
				"--expected-destination-hash",
				normalizeHash("existing"),
				"--json",
			]);
			expect(moveProc.status).toBe(0);
			const moveResult = expectFileEnvelope(
				parseJsonOutput(moveProc.stdout as string),
			);
			expect(moveResult.status).toBe("write");
			expect(typeof moveResult.overwritten_backup_path).toBe("string");

			expect(existsSync(source)).toBe(false);
			expect(readFileSync(destination, "utf8")).toBe("from");

			const undoProc = runKernel(root, [
				"f",
				"ud",
				"--session",
				"S-03",
				"--task-id",
				"T-03",
				"--reason",
				"undo move",
				"--json",
			]);
			expect(undoProc.status).toBe(0);
			const undoResult = expectFileEnvelope(
				parseJsonOutput(undoProc.stdout as string),
			);
			expect(undoResult.status).toBe("write");
			expect(readFileSync(source, "utf8")).toBe("from");
			expect(readFileSync(destination, "utf8")).toBe("existing");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("mv missing source fails instead of reporting success", () => {
		const root = mkProjectRoot();
		try {
			createMutationSession(root, "S-07", "T-07");
			const proc = runKernel(root, [
				"f",
				"mv",
				"--session",
				"S-07",
				"--task-id",
				"T-07",
				"--reason",
				"missing move",
				"--path",
				"mut/missing.txt",
				"--to",
				"mut/destination.txt",
				"--json",
			]);

			expect(proc.status).toBe(2);
			expect(proc.stderr as string).toBe("");
			expect(proc.stdout as string).toContain(
				"Source file not found: mut/missing.txt",
			);
			expect(readMutationJournal(root)).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("ar dry-run reports deterministic destination and does not mutate", () => {
		const root = mkProjectRoot();
		try {
			const target = join(root, "notes", "to-archive.txt");
			mkdirSync(join(root, "notes"), { recursive: true });
			writeFileSync(target, "transient", "utf8");

			const proc = runKernel(root, [
				"f",
				"ar",
				"--path",
				"notes/to-archive.txt",
				"--dry-run",
				"--json",
			]);
			expect(proc.status).toBe(0);
			const result = expectFileEnvelope(parseJsonOutput(proc.stdout as string));
			expect(result.command).toBe("ar");
			expect(result.status).toBe("dry-run");
			expect(result.path).toBe("notes/to-archive.txt");
			expect(typeof result.destination).toBe("string");
			expect(result.destination as string).toContain(
				`${resolveProjectPaths(root).mutationArchivesDir}/`,
			);
			expect(readFileSync(target, "utf8")).toBe("transient");
			expect(readMutationJournal(root).length).toBe(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("ar write moves file to archive and undo restores it", () => {
		const root = mkProjectRoot();
		try {
			const target = join(root, "notes", "to-archive.txt");
			mkdirSync(join(root, "notes"), { recursive: true });
			writeFileSync(target, "for-archive", "utf8");
			createMutationSession(root, "S-06", "T-06");

			const archiveProc = runKernel(root, [
				"f",
				"ar",
				"--session",
				"S-06",
				"--task-id",
				"T-06",
				"--reason",
				"archive then restore",
				"--path",
				"notes/to-archive.txt",
				"--json",
			]);
			expect(archiveProc.status).toBe(0);
			const archiveResult = expectFileEnvelope(
				parseJsonOutput(archiveProc.stdout as string),
			);
			expect(archiveResult.status).toBe("write");
			expect(archiveResult.path).toBe("notes/to-archive.txt");

			const destination = archiveResult.destination as string;
			expect(typeof destination).toBe("string");
			expect(destination).toContain(
				`${resolveProjectPaths(root).mutationArchivesDir}/`,
			);
			const archivedPath = join(root, destination);
			expect(existsSync(archivedPath)).toBe(true);
			expect(readFileSync(archivedPath, "utf8")).toBe("for-archive");
			expect(existsSync(target)).toBe(false);

			const undoProc = runKernel(root, [
				"f",
				"ud",
				"--session",
				"S-06",
				"--task-id",
				"T-06",
				"--reason",
				"undo archive",
				"--json",
			]);
			expect(undoProc.status).toBe(0);
			const undoResult = expectFileEnvelope(
				parseJsonOutput(undoProc.stdout as string),
			);
			expect(undoResult.status).toBe("write");
			expect(undoResult.target_mutation_id).toBe(archiveResult.mutation_id);
			expect(readFileSync(target, "utf8")).toBe("for-archive");
			expect(existsSync(archivedPath)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("protected paths are blocked", () => {
		const root = mkProjectRoot();
		try {
			const proc = runKernel(root, [
				"f",
				"pt",
				"--session",
				"S-04",
				"--task-id",
				"T-04",
				"--reason",
				"blocked target",
				"--path",
				".agents/config.json",
				"--append",
				"danger",
				"--dry-run",
				"--json",
			]);

			expect(proc.status).toBe(2);
			expect(proc.stderr as string).toBe("");
			expect(proc.stdout as string).toContain("protected-path");

			const boundaryProc = runKernel(root, [
				"f",
				"pt",
				"--session",
				"S-04",
				"--task-id",
				"T-04",
				"--reason",
				"boundary target",
				"--path",
				".afol/config.json.example",
				"--append",
				"safe",
				"--dry-run",
				"--json",
			]);

			expect(boundaryProc.status).toBe(0);
			const boundaryResult = expectFileEnvelope(
				parseJsonOutput(boundaryProc.stdout as string),
			);
			expect(boundaryResult.status).toBe("dry-run");
			expect(boundaryResult.path).toBe(".afol/config.json.example");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("pt dry-run blocks binary target without writing or journaling", () => {
		const root = mkProjectRoot();
		try {
			const target = join(root, "assets", "logo.bin");
			const payload = Buffer.from([0, 255, 16, 32, 64]);
			mkdirSync(join(root, "assets"), { recursive: true });
			writeFileSync(target, payload);

			const proc = runKernel(root, [
				"f",
				"pt",
				"--session",
				"S-08",
				"--task-id",
				"T-08",
				"--reason",
				"preview blocked binary patch",
				"--path",
				"assets/logo.bin",
				"--append",
				"danger",
				"--dry-run",
				"--json",
			]);

			expect(proc.status).toBe(4);
			expect(proc.stderr as string).toBe("");
			const result = expectFileEnvelope(
				parseJsonOutput(proc.stdout as string),
				4,
			);
			expect(result.status).toBe("blocked");
			expect(result.dry_run).toBe(true);
			expect(result.message).toBe(
				"Patch blocked: binary target: assets/logo.bin",
			);
			expect(readMutationJournal(root)).toEqual([]);
			expect(readFileSync(target)).toEqual(payload);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("pt write blocks binary target without writing or journaling", () => {
		const root = mkProjectRoot();
		try {
			const target = join(root, "assets", "sprite.bin");
			const payload = Buffer.from([0, 254, 31, 65, 66]);
			mkdirSync(join(root, "assets"), { recursive: true });
			writeFileSync(target, payload);
			createMutationSession(root, "S-09", "T-09");

			const proc = runKernel(root, [
				"f",
				"pt",
				"--session",
				"S-09",
				"--task-id",
				"T-09",
				"--reason",
				"blocked binary patch",
				"--path",
				"assets/sprite.bin",
				"--append",
				"danger",
				"--json",
			]);

			expect(proc.status).toBe(4);
			expect(proc.stderr as string).toBe("");
			const result = expectFileEnvelope(
				parseJsonOutput(proc.stdout as string),
				4,
			);
			expect(result.status).toBe("blocked");
			expect(result.dry_run).toBe(false);
			expect(result.message).toBe(
				"Patch blocked: binary target: assets/sprite.bin",
			);
			expect(readMutationJournal(root)).toEqual([]);
			expect(readFileSync(target)).toEqual(payload);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("blocked file command returns exit code 4 and preserves blocked status payload", () => {
		const root = mkProjectRoot();
		try {
			const source = join(root, "mut", "undo-source.txt");
			const destination = join(root, "mut", "undo-destination.txt");
			mkdirSync(join(root, "mut"), { recursive: true });
			writeFileSync(source, "from", "utf8");
			writeFileSync(destination, "existing", "utf8");
			createMutationSession(root, "S-08", "T-08");

			const moveProc = runKernel(root, [
				"f",
				"mv",
				"--session",
				"S-08",
				"--task-id",
				"T-08",
				"--reason",
				"prepare blocked undo",
				"--path",
				"mut/undo-source.txt",
				"--to",
				"mut/undo-destination.txt",
				"--expected-destination-exists",
				"true",
				"--expected-destination-hash",
				normalizeHash("existing"),
				"--json",
			]);
			expect(moveProc.status).toBe(0);

			writeFileSync(source, "conflict", "utf8");

			const blockedUndoProc = runKernel(root, [
				"f",
				"ud",
				"--session",
				"S-08",
				"--task-id",
				"T-08",
				"--reason",
				"blocked undo",
				"--json",
			]);

			expect(blockedUndoProc.status).toBe(4);
			expect(blockedUndoProc.stderr as string).toBe("");
			const blockedResult = expectFileEnvelope(
				parseJsonOutput(blockedUndoProc.stdout as string),
				4,
			);
			expect(blockedResult.status).toBe("blocked");
			expect(blockedResult.message).toBe(
				"Undo blocked: source already exists: mut/undo-source.txt",
			);
			expect(readMutationJournal(root)).toHaveLength(2);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("undo dry-run does not mutate or append journal", () => {
		const root = mkProjectRoot();
		try {
			const target = join(root, "notes", "guard.txt");
			mkdirSync(join(root, "notes"), { recursive: true });
			writeFileSync(target, "orig", "utf8");
			createMutationSession(root, "S-05", "T-05");

			const writeProc = runKernel(root, [
				"f",
				"pt",
				"--session",
				"S-05",
				"--task-id",
				"T-05",
				"--reason",
				"write then undo-preview",
				"--path",
				"notes/guard.txt",
				"--append",
				"/updated",
				"--json",
			]);
			expect(writeProc.status).toBe(0);
			const beforeUndoJournal = readMutationJournal(root);
			expect(beforeUndoJournal.length).toBe(2);

			const dryRunUndo = runKernel(root, [
				"f",
				"ud",
				"--session",
				"S-05",
				"--task-id",
				"T-05",
				"--reason",
				"preview undo",
				"--dry-run",
				"--json",
			]);
			expect(dryRunUndo.status).toBe(0);
			const dryRunUndoResult = expectFileEnvelope(
				parseJsonOutput(dryRunUndo.stdout as string),
			);
			expect(dryRunUndoResult.status).toBe("dry-run");
			expect(readFileSync(target, "utf8")).toBe("orig/updated");

			const afterUndoJournal = readMutationJournal(root);
			expect(afterUndoJournal.length).toBe(beforeUndoJournal.length);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("undo blocks drift and a second undo without changing files", () => {
		const root = mkProjectRoot();
		try {
			const target = join(root, "notes", "undo-once.txt");
			mkdirSync(join(root, "notes"), { recursive: true });
			writeFileSync(target, "base", "utf8");
			createMutationSession(root, "S-11", "T-11");
			const common = [
				"--session",
				"S-11",
				"--task-id",
				"T-11",
				"--reason",
				"safety",
				"--json",
			];
			const patchProc = runKernel(root, [
				"f",
				"pt",
				"--path",
				"notes/undo-once.txt",
				"--append",
				"next",
				...common,
			]);
			const mutationId = String(
				expectFileEnvelope(parseJsonOutput(patchProc.stdout as string))
					.mutation_id,
			);
			writeFileSync(target, "later-change", "utf8");
			const conflict = runKernel(root, [
				"f",
				"ud",
				"--id",
				mutationId,
				...common,
			]);
			expect(conflict.status).toBe(4);
			expect(readFileSync(target, "utf8")).toBe("later-change");
			writeFileSync(target, "basenext", "utf8");
			const firstUndo = runKernel(root, [
				"f",
				"ud",
				"--id",
				mutationId,
				...common,
			]);
			expect(firstUndo.status).toBe(0);
			const journalPath = join(
				resolveProjectPaths(root).abs.mutationsDir,
				"mutations.jsonl",
			);
			const journalBeforeSecond = readFileSync(journalPath, "utf8");
			const secondUndo = runKernel(root, [
				"f",
				"ud",
				"--id",
				mutationId,
				...common,
			]);
			expect(secondUndo.status).toBe(4);
			expect(readFileSync(target, "utf8")).toBe("base");
			expect(readFileSync(journalPath, "utf8")).toBe(journalBeforeSecond);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("journal corruption blocks undo without mutating files", () => {
		const root = mkProjectRoot();
		try {
			const target = join(root, "notes", "loader.txt");
			mkdirSync(join(root, "notes"), { recursive: true });
			writeFileSync(target, "base", "utf8");
			createMutationSession(root, "S-10", "T-10");

			const proc = runKernel(root, [
				"f",
				"pt",
				"--session",
				"S-10",
				"--task-id",
				"T-10",
				"--reason",
				"stable row before truncation",
				"--path",
				"notes/loader.txt",
				"--append",
				"-next",
				"--json",
			]);
			expect(proc.status).toBe(0);

			const journalPath = join(
				resolveProjectPaths(root).abs.mutationsDir,
				"mutations.jsonl",
			);
			appendFileSync(journalPath, '{"id":"partial"', "utf8");

			const undoProc = runKernel(root, [
				"f",
				"ud",
				"--session",
				"S-10",
				"--task-id",
				"T-10",
				"--reason",
				"undo after truncated row",
				"--json",
			]);
			expect(undoProc.status).toBe(2);
			expect(undoProc.stderr as string).toBe("");
			expect(undoProc.stdout as string).toContain(
				"Mutation journal corruption",
			);
			expect(readFileSync(target, "utf8")).toBe("base-next");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
