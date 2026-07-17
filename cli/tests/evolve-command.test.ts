import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { hostname, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runEvolveCommand } from "../commands/evolve";
import { kernelRegistry } from "../registry";
import { resolveCommand } from "../router";
import {
	appendProductionDayAllocation,
	assertSafeEvolutionProjectRoot,
	evolutionDbPath,
	observationJournalPath,
	openEvolutionDb,
	validateEvolutionConfigExtension,
} from "../services/evolution";
import { resolveSessionLockPath } from "../services/io/session-lock";

const PROJECT_ID = "db97afff-2026-4eb1-a799-5d34fd505267";

function evolutionConfig(): Record<string, unknown> {
	return {
		schema_version: 1,
		project: {
			name: "fixture",
			id: PROJECT_ID,
			timezone: "America/Asuncion",
		},
		paths: {
			external_dir: ".afol/external",
			evolution_db: ".afol/state/evolution.db",
			evolution_data_dir: ".afol/data/evolution",
			evolution_events_dir: ".afol/data/events/evolution",
		},
		evolution: {
			enabled: true,
			suggestions: {
				first_session_of_day: true,
				dedupe_scope: "project",
				max_visible_per_day: 1,
				remind_skipped_next_day: true,
				deep_review_after_production_days: 5,
			},
			preferences: {
				soft_decay_after_production_days: 7,
				stop_guiding_after_production_days: 20,
				minimum_effective_confidence: 0.65,
				decay_curve: "linear",
			},
			recurrence: {
				minimum_occurrences: 3,
				minimum_distinct_sessions: 2,
				minimum_distinct_production_days: 2,
			},
			large_change: {
				changed_files: 20,
				changed_lines: 1000,
				critical_paths_trigger: true,
			},
			external: {
				mode: "explicit_import_only",
				storage: "normalized_sections",
				store_raw: false,
				redact_before_persist: true,
			},
			autonomy: {
				auto_observe: true,
				auto_refresh_preference_projections: true,
				auto_clean_derived_state: true,
				auto_apply_mode: "none",
			},
		},
	};
}

function fixture(config = evolutionConfig()): string {
	const root = mkdtempSync(join(tmpdir(), "evolve-command-"));
	mkdirSync(join(root, ".afol"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "config.json"),
		`${JSON.stringify(config, null, 2)}\n`,
		"utf8",
	);
	return root;
}

function openSeededProductionDb(root: string, projectId: string) {
	const sessionId = "S-status";
	const evidenceId = "E-status";
	const sessionDir = join(root, ".afol", "wb", sessionId);
	mkdirSync(sessionDir, { recursive: true });
	writeFileSync(
		join(sessionDir, ".evidence.jsonl"),
		`${JSON.stringify({
			id: evidenceId,
			project_id: projectId,
			session_id: sessionId,
			created_at: "2026-07-16T12:00:00.000Z",
			result: "passed",
			provenance: "observed",
			exit_code: 0,
		})}\n`,
		"utf8",
	);
	const db = openEvolutionDb(evolutionDbPath(root));
	appendProductionDayAllocation({
		root,
		db,
		projectId,
		timezone: "America/Asuncion",
		sessionId,
		evidenceId,
	});
	return db;
}

function captureIo() {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		stdout,
		stderr,
		io: {
			stdout: (message: string) => stdout.push(message),
			stderr: (message: string) => stderr.push(message),
		},
	};
}

async function holdChildSessionLock(root: string, session: string) {
	const lockPath = resolveSessionLockPath(root, session);
	const child = spawn(
		process.execPath,
		[
			"-e",
			`const fs=require("node:fs"); const os=require("node:os"); fs.mkdirSync(${JSON.stringify(dirname(lockPath))},{recursive:true}); fs.writeFileSync(${JSON.stringify(lockPath)}, JSON.stringify({pid:process.pid,host:os.hostname().toLowerCase(),acquired_at:new Date().toISOString(),session:${JSON.stringify(session)}})+"\\n"); process.stdout.write("ready\\n"); setInterval(()=>{},1000);`,
		],
		{ stdio: ["ignore", "pipe", "pipe"] },
	);
	await new Promise<void>((resolve, reject) => {
		const onData = (chunk: Buffer | string) => {
			if (String(chunk).includes("ready")) {
				child.stdout.off("data", onData);
				resolve();
			}
		};
		child.stdout.on("data", onData);
		child.once("error", reject);
	});
	return { child, lockPath };
}

describe("evolve status", () => {
	test("is registered and routes through the subcommand group", () => {
		expect(
			kernelRegistry.commands.some((command) => command.command === "evolve"),
		).toBe(true);
		expect(resolveCommand(["evolve", "status", "--json"])).toEqual({
			kind: "subcommand",
			group: "evolve",
			action: "status",
			args: ["--json"],
		});
	});

	test("reports an uninitialized derived store without creating it", async () => {
		const root = fixture();
		try {
			const captured = captureIo();
			expect(
				await runEvolveCommand("status", ["--json"], root, captured.io),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload).toMatchObject({
				schema: "afol.result/v1",
				ok: true,
				action: "evolve.status",
				data: {
					state: "ready_uninitialized",
					project_id: PROJECT_ID,
					analysis_available: false,
				},
			});
			const dbPath = evolutionDbPath(root);
			expect(existsSync(dbPath)).toBe(false);
			expect(existsSync(`${dbPath}-wal`)).toBe(false);
			expect(existsSync(`${dbPath}-shm`)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fails closed on an invalid observation journal before DB initialization", async () => {
		const root = fixture();
		try {
			const path = observationJournalPath(root);
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, "{invalid-json}\n", "utf8");
			const captured = captureIo();
			expect(
				await runEvolveCommand("status", ["--json"], root, captured.io),
			).toBe(1);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload.data).toMatchObject({
				state: "unhealthy",
				journal_health: { exists: true, valid: false },
			});
			expect(payload.data.journal_health.error).toMatch(/^observations:/);
			expect(existsSync(evolutionDbPath(root))).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("reports migrated production state and supports the no-action preview", async () => {
		const root = fixture();
		try {
			const db = openSeededProductionDb(root, PROJECT_ID);
			db.close();
			const captured = captureIo();
			expect(await runEvolveCommand("", ["--json"], root, captured.io)).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload.data).toMatchObject({
				state: "healthy",
				db_status: { production_day_count: 1 },
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("reports reconciling while a child writer lock is active", async () => {
		const root = fixture();
		let child: ReturnType<typeof spawn> | null = null;
		try {
			const db = openSeededProductionDb(root, PROJECT_ID);
			db.query("UPDATE production_days SET qualifying_events = ?").run(
				JSON.stringify(["E-status", "E-concurrent-writer"]),
			);
			db.close();
			const held = await holdChildSessionLock(root, "__evolution-journal__");
			child = held.child;
			const lockPath = held.lockPath;
			const before = readFileSync(lockPath);
			const beforeStat = statSync(lockPath);
			Bun.sleepSync(100);
			const captured = captureIo();
			expect(
				await runEvolveCommand("status", ["--json"], root, captured.io),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload.data).toMatchObject({ state: "reconciling" });
			expect(readFileSync(lockPath)).toEqual(before);
			const afterStat = statSync(lockPath);
			expect(afterStat.ino).toBe(beforeStat.ino);
			expect(afterStat.mtimeMs).toBe(beforeStat.mtimeMs);
		} finally {
			child?.kill();
			await new Promise<void>(
				(resolve) => child?.once("exit", () => resolve()) ?? resolve(),
			);
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("does not let a stale dead lock mask rebuild_required", async () => {
		const root = fixture();
		try {
			const db = openSeededProductionDb(root, PROJECT_ID);
			db.query("UPDATE production_days SET qualifying_events = ?").run(
				JSON.stringify(["E-status", "E-stale-lock"]),
			);
			db.close();
			const lockPath = resolveSessionLockPath(root, "__evolution-journal__");
			mkdirSync(dirname(lockPath), { recursive: true });
			writeFileSync(
				lockPath,
				`${JSON.stringify({
					pid: 999_999_999,
					host: hostname().toLowerCase(),
					acquired_at: new Date(Date.now() - 240_000).toISOString(),
				})}\n`,
				"utf8",
			);
			const captured = captureIo();
			expect(
				await runEvolveCommand("status", ["--json"], root, captured.io),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload.data).toMatchObject({ state: "rebuild_required" });
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects unsafe Windows project-root namespaces before filesystem access", () => {
		for (const root of [
			"//server/share/project",
			"\\\\?\\C:\\project",
			"\\\\.\\PhysicalDrive0",
			"C:\\project\\state.db:stream",
			"C:relative-project",
			"C:\\project\\CON",
			"C:\\project\\con.txt",
			"C:\\project\\AUX.",
			"C:\\project\\LPT9 ",
			"C:\\project\\COM1 .txt",
		]) {
			expect(() => assertSafeEvolutionProjectRoot(root)).toThrow(
				/evolution project root must not (use|contain)/,
			);
		}
		expect(() => assertSafeEvolutionProjectRoot("C:\\project")).not.toThrow();
		expect(() => assertSafeEvolutionProjectRoot("C:/project")).not.toThrow();
		expect(() =>
			assertSafeEvolutionProjectRoot("C:\\project\\context"),
		).not.toThrow();
		expect(() =>
			assertSafeEvolutionProjectRoot("C:\\project\\COM10"),
		).not.toThrow();
	});

	test("fails closed for an invalid configured timezone", async () => {
		const config = evolutionConfig();
		(config.project as Record<string, unknown>).timezone = "not/a-timezone";
		expect(validateEvolutionConfigExtension(config)).toContain(
			"project.timezone must be a valid IANA timezone",
		);
		const root = fixture(config);
		try {
			const captured = captureIo();
			expect(
				await runEvolveCommand("status", ["--json"], root, captured.io),
			).toBe(2);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload).toMatchObject({
				ok: false,
				error: { code: "EVOLUTION_STATUS_FAILED" },
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fails closed when a database is copied from another project", async () => {
		const source = fixture();
		const targetConfig = evolutionConfig();
		(targetConfig.project as Record<string, unknown>).id =
			"f4c7c0ae-50c7-4ea7-81c4-bf20e7f3a1a9";
		const target = fixture(targetConfig);
		try {
			const sourceDb = openSeededProductionDb(source, PROJECT_ID);
			sourceDb.exec("PRAGMA wal_checkpoint(TRUNCATE)");
			sourceDb.close();
			mkdirSync(join(target, ".afol", "state"), { recursive: true });
			copyFileSync(evolutionDbPath(source), evolutionDbPath(target));

			const captured = captureIo();
			expect(
				await runEvolveCommand("status", ["--json"], target, captured.io),
			).toBe(1);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload).toMatchObject({
				ok: false,
				error: { code: "EVOLUTION_UNHEALTHY" },
				data: {
					state: "unhealthy",
					db_health: { ok: false },
				},
			});
			expect(payload.data.db_health.findings).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						message: expect.stringContaining(
							"does not match configured project",
						),
					}),
				]),
			);
		} finally {
			rmSync(source, { recursive: true, force: true });
			rmSync(target, { recursive: true, force: true });
		}
	});
});
