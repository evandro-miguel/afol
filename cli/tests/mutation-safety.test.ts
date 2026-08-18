import { describe, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import {
	appendFileSync,
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	runArchiveMutation,
	undoArchiveMutation,
} from "../commands/file/mutations/archive";
import {
	runMoveMutation,
	undoMoveMutation,
} from "../commands/file/mutations/move";
import {
	runPatchMutation,
	undoPatchMutation,
} from "../commands/file/mutations/patch";
import type { PatchArgs } from "../commands/file/shared";
import { normalizeHash } from "../commands/file/shared";
import {
	type MutationRecord,
	mutationJournalPath,
} from "../services/mutations/journal";
import { resolveProjectPaths } from "../services/project/paths";
import { symlinkTestSupport } from "./symlink-test-support";

const kernelPath = `${process.cwd()}/cli/main.ts`;

function runKernel(cwd: string, args: string[]) {
	return spawnSync("bun", [kernelPath, ...args], {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

function runKernelAsync(
	cwd: string,
	args: string[],
): Promise<{ code: number | null; stderr: string; stdout: string }> {
	const proc = spawn("bun", [kernelPath, ...args], {
		cwd,
		stdio: ["ignore", "pipe", "pipe"],
	});
	return new Promise((resolve, reject) => {
		let stdout = "";
		let stderr = "";
		proc.stdout?.setEncoding("utf8");
		proc.stderr?.setEncoding("utf8");
		proc.stdout?.on("data", (chunk: string) => {
			stdout += chunk;
		});
		proc.stderr?.on("data", (chunk: string) => {
			stderr += chunk;
		});
		proc.on("error", reject);
		proc.on("close", (code) => resolve({ code, stderr, stdout }));
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

function expectRestrictedFileError(proc: ReturnType<typeof runKernel>): void {
	expect(proc.status).toBe(2);
	expect(proc.stderr as string).toBe("");
	const payload = parseJsonOutput(proc.stdout as string);
	expect(payload.schema).toBe("afol.result/v1");
	expect(payload.ok).toBe(false);
	expect(payload.exit_code).toBe(2);
	expect(payload.action).toBe("file.patch.preview");
	expect(payload.error).toBeTruthy();
}

function mkProjectRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "mutation-safety-"));
	const afolDir = join(root, ".afol");
	const agentsDir = join(root, ".agents");
	mkdirSync(afolDir, { recursive: true });
	mkdirSync(agentsDir, { recursive: true });
	writeFileSync(
		join(afolDir, "config.json"),
		'{"schema_version":1,"project":{"name":"afol"}}\n',
		"utf8",
	);
	cpSync(
		join(process.cwd(), "src", "project-template", ".agents", "lock.json"),
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

function assertRestrictedControlPlanePreview(
	relativePath: string,
	marker: string,
): void {
	const root = mkProjectRoot();
	const target = join(root, relativePath);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, `${marker}\n`, "utf8");
	const journalPath = join(
		resolveProjectPaths(root).abs.mutationsDir,
		"mutations.jsonl",
	);
	const beforeTarget = readFileSync(target).toString("base64");
	const beforeJournal = existsSync(journalPath)
		? readFileSync(journalPath).toString("base64")
		: null;
	try {
		const proc = runKernel(root, [
			"--agent",
			"f",
			"pt",
			"--path",
			relativePath,
			"--append",
			"\nsynthetic control-plane append\n",
			"--dry-run",
			"--json",
		]);

		expectRestrictedFileError(proc);
		expect(`${proc.stdout as string}\n${proc.stderr as string}`).not.toContain(
			marker,
		);
		expect(readFileSync(target).toString("base64")).toBe(beforeTarget);
		if (beforeJournal === null) {
			expect(existsSync(journalPath)).toBe(false);
		} else {
			expect(readFileSync(journalPath).toString("base64")).toBe(beforeJournal);
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

describe("mutation safety command family", () => {
	test("SEC-001 restricted file dry-run denies .env before preview or persistence", () => {
		const root = mkProjectRoot();
		const sensitivePath = join(root, ".env");
		const fixtureText = "NON_SECRET_FIXTURE_MARKER=synthetic-only\n";
		writeFileSync(sensitivePath, fixtureText, "utf8");
		const journalPath = join(
			resolveProjectPaths(root).abs.mutationsDir,
			"mutations.jsonl",
		);
		const before = readFileSync(sensitivePath).toString("base64");
		try {
			const proc = runKernel(root, [
				"--agent",
				"f",
				"pt",
				"--path",
				".env",
				"--append",
				"\nsynthetic append only\n",
				"--dry-run",
				"--json",
			]);

			expectRestrictedFileError(proc);
			expect(
				`${proc.stdout as string}\n${proc.stderr as string}`,
			).not.toContain(fixtureText);
			expect(readFileSync(sensitivePath).toString("base64")).toBe(before);
			expect(existsSync(journalPath)).toBe(false);
			expect(existsSync(resolveProjectPaths(root).abs.mutationBackupsDir)).toBe(
				false,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("SEC-004 restricted file preview denies .afol/wb targets", () => {
		assertRestrictedControlPlanePreview(
			".afol/wb/protected-control-plane.txt",
			"CONTROL_PLANE_FIXTURE_WB",
		);
	});

	test("SEC-004 restricted file preview denies .afol/adm targets", () => {
		assertRestrictedControlPlanePreview(
			".afol/adm/protected-control-plane.txt",
			"CONTROL_PLANE_FIXTURE_ADM",
		);
	});

	test("SEC-004 restricted file preview denies .afol/state targets", () => {
		assertRestrictedControlPlanePreview(
			".afol/state/protected-control-plane.txt",
			"CONTROL_PLANE_FIXTURE_STATE",
		);
	});

	test("SEC-004 restricted file preview denies the mutation journal", () => {
		assertRestrictedControlPlanePreview(
			".afol/data/mutations/mutations.jsonl",
			"CONTROL_PLANE_FIXTURE_JOURNAL",
		);
	});

	test.skipIf(!symlinkTestSupport.available)(
		"SEC-004 symlink operands cannot bypass protected-resource admission",
		() => {
			for (const relativeTarget of [
				".env",
				".afol/adm/protected-control-plane.txt",
			]) {
				for (const restricted of [true, false]) {
					const root = mkProjectRoot();
					const target = join(root, relativeTarget);
					const alias = join(
						root,
						"notes",
						`${restricted ? "agent" : "local"}-${relativeTarget.replaceAll("/", "-")}`,
					);
					mkdirSync(dirname(target), { recursive: true });
					mkdirSync(dirname(alias), { recursive: true });
					writeFileSync(target, "SYNTHETIC_SYMLINK_TARGET\n", "utf8");
					symlinkSync(target, alias);
					const before = readFileSync(target).toString("base64");
					const journalPath = join(
						resolveProjectPaths(root).abs.mutationsDir,
						"mutations.jsonl",
					);
					try {
						if (!restricted) createMutationSession(root, "S-SYMLINK", "T-01");
						const proc = runKernel(root, [
							...(restricted ? ["--agent"] : []),
							"file",
							"patch",
							"--path",
							join("notes", alias.split("/").at(-1) ?? ""),
							"--append",
							"synthetic append",
							...(restricted
								? ["--dry-run"]
								: [
										"--session",
										"S-SYMLINK",
										"--task-id",
										"T-01",
										"--reason",
										"synthetic symlink check",
									]),
							"--json",
						]);

						expect(proc.status).toBe(2);
						expect(readFileSync(target).toString("base64")).toBe(before);
						expect(existsSync(journalPath)).toBe(false);
						expect(
							`${proc.stdout as string}${proc.stderr as string}`,
						).not.toContain("SYNTHETIC_SYMLINK_TARGET");
						const payload = parseJsonOutput(proc.stdout as string);
						expect(payload.error).toBeTruthy();
						if (restricted) {
							expect(payload.action).toBe("file.patch.preview");
							expect((payload.error as { code: string }).code).toBe(
								"approval-required",
							);
						}
					} finally {
						rmSync(root, { recursive: true, force: true });
					}
				}
			}
		},
	);

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

	test("separate processes reject a stale same-path mutation without losing state", async () => {
		const root = mkProjectRoot();
		try {
			const target = join(root, "notes", "concurrent.txt");
			mkdirSync(join(root, "notes"), { recursive: true });
			const base = "base\n";
			writeFileSync(target, base, "utf8");
			createMutationSession(root, "S-CONCURRENT-A", "T-01");
			createMutationSession(root, "S-CONCURRENT-B", "T-02");
			const expectedBeforeHash = normalizeHash(base);
			const common = [
				"f",
				"pt",
				"--path",
				"notes/concurrent.txt",
				"--expected-before-hash",
				expectedBeforeHash,
				"--reason",
				"concurrent compare and swap",
				"--json",
			];

			const [first, second] = await Promise.all([
				runKernelAsync(root, [
					...common,
					"--append",
					"A",
					"--session",
					"S-CONCURRENT-A",
					"--task-id",
					"T-01",
				]),
				runKernelAsync(root, [
					...common,
					"--append",
					"B",
					"--session",
					"S-CONCURRENT-B",
					"--task-id",
					"T-02",
				]),
			]);

			const results = [first, second];
			expect(results.filter((result) => result.code === 0)).toHaveLength(1);
			expect(results.filter((result) => result.code === 2)).toHaveLength(1);
			for (const result of results) {
				expect(result.stderr).toBe("");
			}
			const successful = results.find((result) => result.code === 0);
			const rejected = results.find((result) => result.code === 2);
			expect(successful?.stdout).toBeTruthy();
			expect(rejected?.stdout).toContain(
				"stale-before-hash:notes/concurrent.txt",
			);
			expect(readFileSync(target, "utf8")).toMatch(/^base\n[AB]$/);

			const journal = readMutationJournal(root);
			expect(journal.map((row) => row.status)).toEqual([
				"prepared",
				"committed",
			]);
			expect(
				journal.every((row) => row.sourcePath === "notes/concurrent.txt"),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("separate processes serialize same-path appends without losing either update", async () => {
		const root = mkProjectRoot();
		try {
			const target = join(root, "notes", "concurrent-appends.txt");
			mkdirSync(join(root, "notes"), { recursive: true });
			writeFileSync(target, "base\n", "utf8");
			createMutationSession(root, "S-CONCURRENT-C", "T-03");
			createMutationSession(root, "S-CONCURRENT-D", "T-04");
			const common = [
				"f",
				"pt",
				"--path",
				"notes/concurrent-appends.txt",
				"--reason",
				"concurrent append serialization",
				"--json",
			];

			const [first, second] = await Promise.all([
				runKernelAsync(root, [
					...common,
					"--append",
					"C",
					"--session",
					"S-CONCURRENT-C",
					"--task-id",
					"T-03",
				]),
				runKernelAsync(root, [
					...common,
					"--append",
					"D",
					"--session",
					"S-CONCURRENT-D",
					"--task-id",
					"T-04",
				]),
			]);

			for (const result of [first, second]) {
				expect(result.code).toBe(0);
				expect(result.stderr).toBe("");
			}
			expect(readFileSync(target, "utf8")).toMatch(/^base\n[CD][CD]$/);
			expect(readFileSync(target, "utf8")).toContain("C");
			expect(readFileSync(target, "utf8")).toContain("D");
			expect(readMutationJournal(root).map((row) => row.status)).toEqual([
				"prepared",
				"committed",
				"prepared",
				"committed",
			]);
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

	test("runPatchMutation double fault: filesystem restored + INTEGRITY_ERROR on journal write failure", () => {
		const root = mkProjectRoot();
		const session = "S-DOUBLE";
		const taskId = "T-DOUBLE";
		try {
			createMutationSession(root, session, taskId);
			const target = join(root, "target.txt");
			const originalContent = "original\n";
			writeFileSync(target, originalContent, "utf8");

			const args: PatchArgs = {
				command: "pt",
				path: "target.txt",
				appendText: "\nappended\n",
				dryRun: false,
				json: false,
				session,
				taskId,
				reason: "double-fault test",
			};

			const journalPath = mutationJournalPath(root);
			// Ensure journal file exists by doing a successful mutation first
			const setupResult = runPatchMutation(args, root);
			expect(setupResult.status).toBe("write");
			const setupMutationId = (setupResult as Record<string, unknown>)
				.mutation_id as string;

			// Now do a second mutation with afterPrepared that corrupts the journal.
			// The afterPrepared hook runs AFTER the "prepared" record is written
			// but BEFORE the actual file write + "committed" journal record.
			// By replacing the journal with a directory, both the "committed"
			// append and the subsequent "rolled_back" append will fail.
			const args2: PatchArgs = { ...args };
			// Capture journal state BEFORE the afterPrepared hook corrupts the file,
			// so we can verify the "prepared" record without hitting EISDIR.
			// Use a wrapper object so TypeScript can track the assignment through
			// the closure and narrow correctly in the subsequent if-block.
			const capturedJournal: { raw: string | null } = { raw: null };
			let journalCorrupted = false;
			let thrown: Error | null = null;
			try {
				runPatchMutation(args2, root, {
					afterPrepared: () => {
						capturedJournal.raw = readFileSync(journalPath, "utf8");
						rmSync(journalPath, { force: true });
						mkdirSync(journalPath, { recursive: true });
						journalCorrupted = true;
					},
				});
			} catch (error) {
				thrown = error as Error;
			}

			expect(thrown).not.toBeNull();
			if (thrown === null) {
				throw new Error("Expected mutation to throw");
			}
			expect(thrown.message).toContain("INTEGRITY_ERROR");
			// Must mention both the original error context and the journal failure
			expect(thrown.message).toContain("rolled back on disk");
			expect(thrown.message).toContain("rollback journal write failed");

			// Filesystem must be restored to the pre-second-mutation content
			// (state after the successful first mutation)
			const afterFirstMutation = readFileSync(target, "utf8");
			expect(afterFirstMutation).not.toBe(originalContent);
			expect(afterFirstMutation).toContain("\nappended\n");

			// Remove the directory that replaced the journal file
			if (journalCorrupted) {
				rmSync(journalPath, { recursive: true, force: true });
			}
			// Journal must NOT have "committed" or "rolled_back" for the corrupted
			// mutation — only "prepared" survived the corruption.
			// Use the pre-corruption capture because the journal file was replaced
			// with a directory and its content cannot be recovered.
			const journalAfter: Array<Record<string, unknown>> =
				capturedJournal.raw !== null
					? capturedJournal.raw
							.split("\n")
							.map((row) => row.trim())
							.filter((row) => row.length > 0)
							.map((row) => JSON.parse(row) as Record<string, unknown>)
					: readMutationJournal(root);
			const secondMutationRecords = journalAfter.filter(
				(r) => r.id !== setupMutationId,
			);
			// The "prepared" record should exist
			expect(secondMutationRecords.some((r) => r.status === "prepared")).toBe(
				true,
			);
			// No "committed" or "rolled_back" for this mutation
			expect(secondMutationRecords.some((r) => r.status === "committed")).toBe(
				false,
			);
			expect(
				secondMutationRecords.some((r) => r.status === "rolled_back"),
			).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rename rollback keeps a durable copy at each replacement boundary", () => {
		const root = mkProjectRoot();
		const args = {
			command: "ud" as const,
			path: "mut/source.txt",
			dryRun: false,
			json: false,
			session: "S-RENAME",
			taskId: "T-RENAME",
			reason: "fault injection",
		};
		try {
			createMutationSession(root, args.session, args.taskId);
			const source = join(root, "mut", "source.txt");
			const destination = join(root, "mut", "destination.txt");
			mkdirSync(dirname(source), { recursive: true });
			writeFileSync(source, "from", "utf8");
			let observedDurableCopy = false;
			expect(() =>
				runMoveMutation(
					{
						...args,
						command: "mv",
						path: "mut/source.txt",
						destinationPath: "mut/destination.txt",
					},
					root,
					{
						afterReplaced: () => {
							observedDurableCopy =
								existsSync(source) || existsSync(destination);
							throw new Error("inject-after-replace");
						},
					},
				),
			).toThrow("inject-after-replace");
			expect(observedDurableCopy).toBe(true);
			expect(readFileSync(source, "utf8")).toBe("from");
			expect(existsSync(destination)).toBe(false);

			writeFileSync(source, "archive", "utf8");
			observedDurableCopy = false;
			const archiveRoot = join(root, ".afol", "data", "mutations", "archives");
			expect(() =>
				runArchiveMutation(
					{ ...args, command: "ar", path: "mut/source.txt" },
					root,
					{
						afterReplaced: () => {
							observedDurableCopy =
								existsSync(source) ||
								(existsSync(archiveRoot) &&
									readdirSync(archiveRoot, { recursive: true }).some((path) =>
										path.toString().endsWith("source.txt"),
									));
							throw new Error("inject-after-replace");
						},
					},
				),
			).toThrow("inject-after-replace");
			expect(observedDurableCopy).toBe(true);
			expect(readFileSync(source, "utf8")).toBe("archive");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rename rollback restores an overwritten destination after replacement", () => {
		const root = mkProjectRoot();
		const sourceContent = "source-before";
		const destinationContent = "destination-before";
		const args = {
			command: "mv" as const,
			path: "mut/source.txt",
			destinationPath: "mut/destination.txt",
			dryRun: false,
			json: false,
			session: "S-RENAME-OVERWRITE",
			taskId: "T-RENAME-OVERWRITE",
			reason: "fault injection",
			expectedDestinationExists: true,
			expectedDestinationHash: normalizeHash(destinationContent),
		};
		try {
			createMutationSession(root, args.session, args.taskId);
			const source = join(root, args.path);
			const destination = join(root, args.destinationPath);
			mkdirSync(dirname(source), { recursive: true });
			writeFileSync(source, sourceContent, "utf8");
			writeFileSync(destination, destinationContent, "utf8");

			expect(() =>
				runMoveMutation(args, root, {
					afterReplaced: () => {
						throw new Error("inject-after-replace-overwrite");
					},
				}),
			).toThrow("inject-after-replace-overwrite");
			expect(readFileSync(source, "utf8")).toBe(sourceContent);
			expect(readFileSync(destination, "utf8")).toBe(destinationContent);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("undo rollback keeps the moved or archived bytes durable", () => {
		const root = mkProjectRoot();
		const args = {
			command: "ud" as const,
			path: "mut/source.txt",
			dryRun: false,
			json: false,
			session: "S-UNDO-RENAME",
			taskId: "T-UNDO-RENAME",
			reason: "fault injection",
		};
		const move: MutationRecord = {
			id: "move-1",
			ts: new Date().toISOString(),
			kind: "move",
			status: "committed",
			dryRun: false,
			session: args.session,
			taskId: args.taskId,
			reason: args.reason,
			sourcePath: "mut/source.txt",
			destinationPath: "mut/destination.txt",
			beforeHash: normalizeHash("from"),
			afterHash: normalizeHash("from"),
			destinationExisted: false,
		};
		const archive: MutationRecord = {
			...move,
			id: "archive-1",
			kind: "archive",
		};
		try {
			createMutationSession(root, args.session, args.taskId);
			const source = join(root, "mut", "source.txt");
			const destination = join(root, "mut", "destination.txt");
			mkdirSync(dirname(destination), { recursive: true });
			for (const mutation of [move, archive]) {
				writeFileSync(destination, "from", "utf8");
				let observedDurableCopy = false;
				expect(() =>
					(mutation.kind === "move" ? undoMoveMutation : undoArchiveMutation)(
						args,
						mutation,
						root,
						{
							afterReplaced: () => {
								observedDurableCopy =
									existsSync(source) || existsSync(destination);
								throw new Error("inject-after-replace");
							},
						},
					),
				).toThrow("inject-after-replace");
				expect(observedDurableCopy).toBe(true);
				expect(existsSync(source)).toBe(false);
				expect(readFileSync(destination, "utf8")).toBe("from");
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("legacy patch undo blocks when the original state cannot be proved", () => {
		const root = mkProjectRoot();
		try {
			const target = join(root, "notes", "legacy.txt");
			mkdirSync(dirname(target), { recursive: true });
			writeFileSync(target, "after", "utf8");
			const result = undoPatchMutation(
				{
					command: "ud",
					path: "notes/legacy.txt",
					dryRun: false,
					json: false,
					session: "S-LEGACY",
					taskId: "T-LEGACY",
					reason: "legacy undo",
				},
				{
					id: "legacy-patch",
					ts: new Date().toISOString(),
					kind: "patch",
					status: "committed",
					dryRun: false,
					session: "S-LEGACY",
					taskId: "T-LEGACY",
					reason: "legacy patch",
					sourcePath: "notes/legacy.txt",
					beforeHash: normalizeHash("before"),
					afterHash: normalizeHash("after"),
				} as MutationRecord,
				root,
			);
			expect(result.status).toBe("blocked");
			expect(result.message).toBe(
				"Undo blocked: original patch state is unprovable",
			);
			expect(readFileSync(target, "utf8")).toBe("after");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
