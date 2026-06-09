import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
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
import { join } from "node:path";
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
			const result = parseJsonOutput(proc.stdout as string);
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
			const result = parseJsonOutput(proc.stdout as string);
			expect(result.status).toBe("write");
			expect(result.path).toBe("notes/with-backup.txt");
			expect(result.backup_path).toBeTruthy();

			const backupPath = result.backup_path as string;
			expect(existsSync(backupPath)).toBe(true);
			expect(readFileSync(backupPath, "utf8")).toBe("v1");
			expect(readFileSync(target, "utf8")).toBe("v1+v2");

			const journal = readMutationJournal(root);
			expect(journal.length).toBe(1);
			expect(journal[0]?.kind).toBe("patch");
			expect(journal[0]?.status).toBe("applied");
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
				"--json",
			]);
			expect(moveProc.status).toBe(0);
			const moveResult = parseJsonOutput(moveProc.stdout as string);
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
			const undoResult = parseJsonOutput(undoProc.stdout as string);
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
			expect(proc.stdout as string).toBe("");
			expect(proc.stderr as string).toContain(
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
			const result = parseJsonOutput(proc.stdout as string);
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
			const archiveResult = parseJsonOutput(archiveProc.stdout as string);
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
			const undoResult = parseJsonOutput(undoProc.stdout as string);
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
				".agents/runtime/core.py",
				"--append",
				"danger",
				"--dry-run",
				"--json",
			]);

			expect(proc.status).toBe(2);
			expect(proc.stderr as string).toContain("protected-path");
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
			const result = parseJsonOutput(proc.stdout as string);
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
			const result = parseJsonOutput(proc.stdout as string);
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
			const blockedResult = parseJsonOutput(blockedUndoProc.stdout as string);
			expect(blockedResult.status).toBe("blocked");
			expect(blockedResult.message).toBe(
				"Undo blocked: source already exists: mut/undo-source.txt",
			);
			expect(readMutationJournal(root)).toHaveLength(1);
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
			expect(beforeUndoJournal.length).toBe(1);

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
			const dryRunUndoResult = parseJsonOutput(dryRunUndo.stdout as string);
			expect(dryRunUndoResult.status).toBe("dry-run");
			expect(readFileSync(target, "utf8")).toBe("orig/updated");

			const afterUndoJournal = readMutationJournal(root);
			expect(afterUndoJournal.length).toBe(beforeUndoJournal.length);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
