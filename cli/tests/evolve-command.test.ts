import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { hostname, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runEvolveCommand, runObserveCommand } from "../commands/evolve";
import {
	agentOperationContext,
	defaultOperationContext,
	localNonInteractiveOperationContext,
	resolveOperationContext,
} from "../core/operation-context";
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
import { removeEvolutionTestRoot } from "./evolution-test-support";

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

function snapshotEvolutionDbState(root: string) {
	const paths = [
		evolutionDbPath(root),
		`${evolutionDbPath(root)}-wal`,
		`${evolutionDbPath(root)}-shm`,
	];
	return paths.map((path) => {
		const exists = existsSync(path);
		const bytes = exists ? readFileSync(path) : null;
		return {
			path,
			exists,
			bytes,
			sha256: bytes ? createHash("sha256").update(bytes).digest("hex") : null,
			mtimeMs: exists ? statSync(path).mtimeMs : null,
		};
	});
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
		expect(resolveCommand(["evolve", "apply", "EVO-1", "--json"])).toEqual({
			kind: "subcommand",
			group: "evolve",
			action: "apply",
			args: ["EVO-1", "--json"],
		});
		expect(resolveCommand(["evolve", "rollback", "EVO-1", "--json"])).toEqual({
			kind: "subcommand",
			group: "evolve",
			action: "rollback",
			args: ["EVO-1", "--json"],
		});
		expect(resolveCommand(["evolve", "evaluate", "M-1", "--json"])).toEqual({
			kind: "subcommand",
			group: "evolve",
			action: "evaluate",
			args: ["M-1", "--json"],
		});
	});

	test("evaluation recording is restricted to a local operator", async () => {
		const root = fixture();
		try {
			const captured = captureIo();
			expect(
				await runEvolveCommand(
					"evaluate",
					["M-1", "--record", "--json"],
					root,
					captured.io,
					agentOperationContext(),
				),
			).toBe(2);
			expect(captured.stdout.join("\n")).toContain(
				"local interactive diagnostics required",
			);
			const nonInteractive = captureIo();
			expect(
				await runEvolveCommand(
					"evaluate",
					["M-1", "--record", "--json"],
					root,
					nonInteractive.io,
					localNonInteractiveOperationContext(),
				),
			).toBe(2);
			expect(nonInteractive.stdout.join("\n")).toContain(
				"local interactive diagnostics required",
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("apply and rollback fail closed before mutation without valid CLI context", async () => {
		const root = fixture();
		try {
			const missingId = captureIo();
			expect(
				await runEvolveCommand("apply", ["--json"], root, missingId.io),
			).toBe(2);
			expect(missingId.stdout.join("\n")).toContain("requires <proposal-id>");

			const noSession = captureIo();
			expect(
				await runEvolveCommand(
					"rollback",
					["EVO-1", "--json"],
					root,
					noSession.io,
					resolveOperationContext([], {}, true).ctx,
				),
			).toBe(2);
			expect(noSession.stdout.join("\n")).toContain(
				"requires an active workbench session",
			);

			const agent = captureIo();
			expect(
				await runEvolveCommand(
					"apply",
					["EVO-1", "--json"],
					root,
					agent.io,
					agentOperationContext(),
				),
			).toBe(2);
			expect(agent.stdout.join("\n")).toContain(
				"local interactive diagnostics required",
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
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
			removeEvolutionTestRoot(root);
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
			removeEvolutionTestRoot(root);
		}
	});

	test("uses the no-action form for a read-only analysis preview", async () => {
		const root = fixture();
		try {
			const db = openSeededProductionDb(root, PROJECT_ID);
			db.close();
			const captured = captureIo();
			expect(await runEvolveCommand("", ["--json"], root, captured.io)).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload.data).toMatchObject({
				mode: "analyze",
				status: "empty",
				baseline: { production_day_count: 1 },
				proposals: [],
			});
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("blocked analysis points to bounded evolve status diagnostics", async () => {
		const root = fixture();
		try {
			const captured = captureIo();
			expect(
				await runEvolveCommand(
					"analyze",
					["--json"],
					root,
					captured.io,
					agentOperationContext(),
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload.data).toMatchObject({
				status: "blocked",
				blocked_reason: "evolution state is unavailable",
				recovery_action: "afol evolve status --json",
			});
			expect(JSON.stringify(payload.data)).not.toContain(root);
			expect(Buffer.byteLength(captured.stdout[0] ?? "", "utf8")).toBeLessThan(
				4_000,
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("status isolates mixed-project latest day and recurring cluster without writes", async () => {
		const root = fixture();
		try {
			const db = openSeededProductionDb(root, PROJECT_ID);
			db.run(
				"INSERT INTO production_days (project_id,local_date,ordinal_sequence,ordinal,created_at,qualifying_events,journal_event_id) VALUES (?,?,?,?,?,?,?)",
				[
					"foreign-project",
					"2026-07-21",
					99,
					"PD-0099",
					"2026-07-21T12:00:00.000Z",
					'["E-foreign"]',
					"J-foreign",
				],
			);
			db.run(
				"INSERT INTO issue_clusters (project_id,fingerprint_version,fingerprint,state,occurrence_count,distinct_session_count,distinct_production_day_count,user_confirmed_recurrence,first_seen_at,last_seen_at,priority,source_refs,updated_at,journal_event_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
				[
					"foreign-project",
					1,
					"foreign-fingerprint",
					"recurring",
					3,
					2,
					2,
					0,
					"2026-07-20T00:00:00.000Z",
					"2026-07-21T00:00:00.000Z",
					2,
					"[]",
					"2026-07-21T00:00:00.000Z",
					"J-cluster",
				],
			);
			db.close();
			const before = snapshotEvolutionDbState(root);
			const captured = captureIo();
			expect(
				await runEvolveCommand("status", ["--json"], root, captured.io),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload.data.db_status).toMatchObject({
				production_day_count: 1,
				recurring_cluster_count: 0,
				latest_production_day: { ordinal_sequence: 1 },
			});
			expect(snapshotEvolutionDbState(root)).toEqual(before);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("status tolerates malformed foreign qualifying_events; native project healthy and counts isolated", async () => {
		const root = fixture();
		try {
			const db = openSeededProductionDb(root, PROJECT_ID);
			// Insert a foreign production day with malformed qualifying_events
			// (object instead of expected JSON array).
			db.run(
				"INSERT INTO production_days (project_id,local_date,ordinal_sequence,ordinal,created_at,qualifying_events,journal_event_id) VALUES (?,?,?,?,?,?,?)",
				[
					"foreign-malformed",
					"2026-07-21",
					99,
					"PD-0099",
					"2026-07-21T12:00:00.000Z",
					JSON.stringify({ invalid: "not-an-array" }),
					"J-malformed",
				],
			);
			// Settle WAL pages before taking a byte-level read-only baseline.
			db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
			db.close();

			const dbPath = evolutionDbPath(root);
			const before = readFileSync(dbPath);
			const captured = captureIo();
			expect(
				await runEvolveCommand("status", ["--json"], root, captured.io),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			// Native project healthy and read-only.
			expect(payload.data).toMatchObject({
				state: "healthy",
				db_status: {
					production_day_count: 1,
					latest_production_day: { ordinal_sequence: 1 },
				},
			});
			expect(payload.data.journal_health.valid).toBe(true);
			expect(readFileSync(dbPath)).toEqual(before);
		} finally {
			removeEvolutionTestRoot(root);
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
			removeEvolutionTestRoot(root);
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
			removeEvolutionTestRoot(root);
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
			removeEvolutionTestRoot(root);
		}
	});

	test("evolve observe writes observations from completed session evidence", async () => {
		const root = fixture();
		try {
			// Seed a completed session with observed passed evidence (creates
			// production day) and telemetry error (creates observation).
			const sessionId = "S-observe-test";
			const sessionDir = join(root, ".afol", "wb", sessionId);
			mkdirSync(sessionDir, { recursive: true });
			// Completed State Board so strict completeness passes.
			writeFileSync(
				join(sessionDir, `${sessionId}_task_01.md`),
				"# Tasks\n\n## State Board\n\n| Task | State | Owner | Notes |\n|------|-------|-------|-------|\n| T-01 | done | test | completion_policy=execution |\n",
				"utf8",
			);
			writeFileSync(
				join(sessionDir, ".evidence.jsonl"),
				`${[
					JSON.stringify({
						id: "E-pass",
						task_id: "T-01",
						project_id: PROJECT_ID,
						session_id: sessionId,
						created_at: "2026-07-20T10:00:00.000Z",
						command: "true",
						result: "passed",
						provenance: "observed",
						exit_code: 0,
						purpose: "completion",
						authorization_type: "execution",
					}),
				].join("\n")}\n`,
				"utf8",
			);
			// Telemetry error for the failure (distinct from evidence).
			const { appendTelemetryEvent } = await import(
				"../services/events/telemetry"
			);
			appendTelemetryEvent(root, {
				event_type: "error",
				session_id: sessionId,
				task_id: "T-01",
				error_type: "TypeError",
				cmd_type: "bun",
			});
			const captured = captureIo();
			const exitCode = await runEvolveCommand(
				"observe",
				["--session", sessionId, "--json"],
				root,
				captured.io,
				defaultOperationContext(),
			);
			expect(exitCode).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload.ok).toBe(true);
			expect(payload.data.appended).toBe(1);
			expect(payload.data.duplicates).toBe(0);
			expect(payload.data.observation_ids).toHaveLength(1);
			// Verify journal file exists and contains the observation.
			const journalPath = observationJournalPath(root);
			expect(existsSync(journalPath)).toBe(true);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("evolve observe missing session returns structured error", async () => {
		const root = fixture();
		try {
			const captured = captureIo();
			const exitCode = await runEvolveCommand(
				"observe",
				["--session", "does-not-exist", "--json"],
				root,
				captured.io,
				defaultOperationContext(),
			);
			expect(exitCode).toBe(2);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload).toMatchObject({
				ok: false,
				error: { code: "EVOLVE_OBSERVE_FAILED" },
			});
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("manual observe is disabled when evolution is disabled", async () => {
		const config = evolutionConfig();
		(config.evolution as Record<string, unknown>).enabled = false;
		const root = fixture(config);
		try {
			const captured = captureIo();
			expect(
				await runEvolveCommand(
					"observe",
					["--session", "S-01", "--json"],
					root,
					captured.io,
					defaultOperationContext(),
				),
			).toBe(1);
			expect(JSON.parse(captured.stdout[0] ?? "{}")).toMatchObject({
				ok: false,
				error: { code: "EVOLVE_OBSERVE_FAILED" },
			});
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("restricted contexts deny manual observe through the canonical policy", async () => {
		const root = fixture();
		try {
			const captured = captureIo();
			expect(
				await runEvolveCommand(
					"observe",
					["--session", "S-01", "--json"],
					root,
					captured.io,
					agentOperationContext(),
				),
			).toBe(2);
			expect(JSON.parse(captured.stdout[0] ?? "{}")).toMatchObject({
				ok: false,
				error: { code: "approval-required" },
			});
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("observe rejects forged or omitted context before reading the project", () => {
		const root = fixture();
		const io = captureIo().io;
		for (const context of [
			undefined,
			{
				callerType: "local",
				interactive: true,
				trustLevel: "trusted",
			} as const,
		]) {
			expect(() =>
				runObserveCommand(["--session", "S-01", "--json"], root, io, context),
			).toThrow("operation context was not admitted");
		}
		expect(existsSync(evolutionDbPath(root))).toBe(false);
		expect(existsSync(observationJournalPath(root))).toBe(false);
	});

	test("evolve observe missing --session flag returns nonzero", async () => {
		const root = fixture();
		const captured = captureIo();
		const exitCode = await runEvolveCommand(
			"observe",
			["--json"],
			root,
			captured.io,
			defaultOperationContext(),
		);
		expect(exitCode).toBe(2);
		const payload = JSON.parse(captured.stdout[0] ?? "{}");
		expect(payload).toMatchObject({
			ok: false,
			error: { code: "EVOLVE_OBSERVE_FAILED" },
		});
	});

	test("evolve analysis is read-only (no mutation)", async () => {
		const root = fixture();
		try {
			// First analysis call
			const c1 = captureIo();
			expect(await runEvolveCommand("", ["--json"], root, c1.io)).toBe(0);
			const p1 = JSON.parse(c1.stdout[0] ?? "{}");

			// Set up seeded DB + observation journal
			const db = openSeededProductionDb(root, PROJECT_ID);
			db.close();

			// Second analysis call after setup — still read-only, no journal mutation
			const c2 = captureIo();
			expect(await runEvolveCommand("", ["--json"], root, c2.io)).toBe(0);
			const p2 = JSON.parse(c2.stdout[0] ?? "{}");
			expect(p1.data.mode).toBe("analyze");
			expect(p2.data.mode).toBe("analyze");
			expect(p2.data.baseline.production_day_count).toBe(1);

			// Verify no journal file was created by the status command itself
			const journalPath = observationJournalPath(root);
			expect(existsSync(journalPath)).toBe(false);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("evolve observe JSON config-failure returns EVOLVE_OBSERVE_FAILED with action evolve.observe", async () => {
		// Config with missing project.id — the validation extension throws
		// before the graceful "not configured" return, so exit code 2 with
		// EVOLVE_OBSERVE_FAILED envelope is correct.
		const config = evolutionConfig();
		delete (config.project as Record<string, unknown>).id;
		const root = fixture(config);
		try {
			const captured = captureIo();
			const exitCode = await runEvolveCommand(
				"observe",
				["--session", "S-01", "--json"],
				root,
				captured.io,
				defaultOperationContext(),
			);
			expect(exitCode).toBeGreaterThan(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload).toMatchObject({
				ok: false,
				error: { code: "EVOLVE_OBSERVE_FAILED" },
				action: "evolve.observe",
			});
			expect(captured.stderr).toEqual([]);
		} finally {
			removeEvolutionTestRoot(root);
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
			removeEvolutionTestRoot(source);
			removeEvolutionTestRoot(target);
		}
	});
});
