import { describe, expect, test } from "bun:test";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runEvolveCommand } from "../commands/evolve";
import { agentOperationContext } from "../core/operation-context";
import {
	appendProductionDayAllocation,
	evolutionDbPath,
	openEvolutionDb,
	productionDayJournalPath,
	readProductionDayJournal,
	repairEvolutionDerivedState,
} from "../services/evolution";
import { productionDayValidationDependencies } from "../services/evolution/journal";
import { checkAreaHealth } from "../services/health/checker";
import { resolveEvolutionRuntime } from "../services/evolution/runtime-config";
import {
	releaseEvolutionTestHandles,
	removeEvolutionTestRoot,
} from "./evolution-test-support";

const PROJECT_ID = "db97afff-2026-4eb1-a799-5d34fd505267";

function fixture(projectId = PROJECT_ID): string {
	const root = mkdtempSync(join(tmpdir(), "evolve-journal-status-"));
	mkdirSync(join(root, ".afol"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "config.json"),
		`${JSON.stringify(
			{
				schema_version: 1,
				project: {
					name: "fixture",
					id: projectId,
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
			},
			null,
			2,
		)}\n`,
		"utf8",
	);
	return root;
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

function createJournal(
	root: string,
	projectId = PROJECT_ID,
	createdAt = "2026-07-16T12:00:00.000Z",
): void {
	const sessionId = "S-journal-status";
	const evidenceId = "E-journal-status";
	const sessionDir = join(root, ".afol", "wb", sessionId);
	mkdirSync(sessionDir, { recursive: true });
	writeFileSync(
		join(sessionDir, ".evidence.jsonl"),
		`${JSON.stringify({
			id: evidenceId,
			project_id: projectId,
			session_id: sessionId,
			created_at: createdAt,
			result: "passed",
			provenance: "observed",
			exit_code: 0,
		})}\n`,
		"utf8",
	);
	const runtime = resolveEvolutionRuntime(root);
	const db = openEvolutionDb(runtime.dbPath);
	appendProductionDayAllocation({
		root,
		db,
		projectId,
		timezone: "America/Asuncion",
		sessionId,
		evidenceId,
		evolutionEventsDir: runtime.eventsDir,
	});
	db.close();
}

function removeDb(root: string): void {
	releaseEvolutionTestHandles();
	const path = resolveEvolutionRuntime(root).dbPath;
	for (const candidate of [path, `${path}-wal`, `${path}-shm`])
		rmSync(candidate, { force: true });
}

describe("evolve status canonical journal integrity", () => {
	test("health separates invalid journal recovery from derived projection repair", () => {
		const root = fixture();
		try {
			createJournal(root);
			const path = productionDayJournalPath(root);
			const original = readFileSync(path, "utf8");
			writeFileSync(path, "not-json\n");
			expect(
				checkAreaHealth(root, "evolution").some((finding) =>
					finding.hint?.startsWith("inspect canonical journal and evidence"),
				),
			).toBe(true);
			writeFileSync(path, original);
			const db = openEvolutionDb(evolutionDbPath(root));
			db.exec("UPDATE production_days SET ordinal_sequence = 99, ordinal = 99");
			db.close();
			const finding = checkAreaHealth(root, "evolution").find((finding) =>
				finding.message.includes("projection differs from canonical"),
			);
			expect(finding?.hint).toBe(
				"rebuild the derived evolution database from canonical journal events",
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});
	test("replays legacy Asuncion dates without rewriting the journal and rejects tampering", () => {
		const root = fixture();
		try {
			createJournal(root, PROJECT_ID, "2026-08-07T03:05:05.930Z");
			const path = productionDayJournalPath(root);
			const event = JSON.parse(readFileSync(path, "utf8"));
			expect(typeof event.payload.utc_offset_seconds).toBe("number");
			delete event.payload.utc_offset_seconds;
			event.payload.local_date = "2026-08-06";
			event.subject_id = "2026-08-06";
			event.payload_digest = productionDayValidationDependencies.digest(
				event.payload,
			);
			const { event_digest: _, ...base } = event;
			event.event_digest = productionDayValidationDependencies.digest(base);
			const legacy = `${JSON.stringify(event)}\n`;
			writeFileSync(path, legacy);
			expect(
				readProductionDayJournal(root, PROJECT_ID, "America/Asuncion")[0]
					?.payload.local_date,
			).toBe("2026-08-06");
			expect(readFileSync(path, "utf8")).toBe(legacy);
			event.payload.local_date = "2026-08-05";
			writeFileSync(path, `${JSON.stringify(event)}\n`);
			expect(() =>
				readProductionDayJournal(root, PROJECT_ID, "America/Asuncion"),
			).toThrow("event-date mismatch");
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("producer, repair and status share custom database and journal paths", async () => {
		const root = fixture();
		try {
			const configPath = join(root, ".afol/config.json");
			const config = JSON.parse(readFileSync(configPath, "utf8"));
			config.paths.evolution_db = ".afol/custom/evolution.sqlite";
			config.paths.evolution_events_dir = ".afol/custom/journal";
			writeFileSync(configPath, JSON.stringify(config));
			createJournal(root);
			const journalPath = productionDayJournalPath(
				root,
				config.paths.evolution_events_dir,
			);
			expect(journalPath).toContain(".afol/custom/journal/");
			expect(resolveEvolutionRuntime(root).dbPath).toBe(
				join(root, ".afol/custom/evolution.sqlite"),
			);
			const journal = readFileSync(journalPath);
			removeDb(root);
			const repaired = repairEvolutionDerivedState({ root });
			expect(repaired.changed).toBe(true);
			const output = captureIo();
			expect(
				await runEvolveCommand("status", ["--json"], root, output.io),
			).toBe(0);
			expect(JSON.parse(output.stdout[0] ?? "{}").data.state).toBe("healthy");
			expect(readFileSync(journalPath)).toEqual(journal);
			expect(existsSync(join(root, ".afol/state/evolution.db"))).toBe(false);
			expect(existsSync(join(root, ".afol/data/events/evolution"))).toBe(false);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("valid canonical journal repairs a divergent projection without fabricating production events", async () => {
		const root = fixture();
		try {
			createJournal(root);
			const journalPath = productionDayJournalPath(root);
			const journal = readFileSync(journalPath);
			const db = openEvolutionDb(evolutionDbPath(root));
			const expected = db.query("SELECT * FROM production_days").all();
			db.exec("UPDATE production_days SET qualifying_events = '[]'");
			db.close();
			const database = readFileSync(evolutionDbPath(root));
			const output = captureIo();
			expect(
				await runEvolveCommand("status", ["--json"], root, output.io),
			).toBe(1);
			const status = JSON.parse(output.stdout[0] ?? "{}").data;
			expect(status.state).toBe("unhealthy");
			expect(status.journal_health.valid).toBe(true);
			expect(readFileSync(evolutionDbPath(root))).toEqual(database);
			expect(readFileSync(journalPath)).toEqual(journal);
			repairEvolutionDerivedState({ root });
			const rebuilt = openEvolutionDb(evolutionDbPath(root));
			expect(rebuilt.query("SELECT * FROM production_days").all()).toEqual(
				expected,
			);
			rebuilt.close();
			expect(readFileSync(journalPath)).toEqual(journal);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("reports the safe recovery action in restricted output when projection is absent", async () => {
		const root = fixture();
		try {
			createJournal(root);
			removeDb(root);
			const captured = captureIo();
			expect(
				await runEvolveCommand(
					"status",
					["--json"],
					root,
					captured.io,
					agentOperationContext(),
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload.data).toMatchObject({
				state: "rebuild_required",
				recovery_action: "afol evolve repair --json",
				journal_health: { exists: true, valid: true, error: null },
			});
			expect(payload.data).not.toHaveProperty("project_id");
			expect(existsSync(evolutionDbPath(root))).toBe(false);
			expect(existsSync(`${evolutionDbPath(root)}-wal`)).toBe(false);
			expect(existsSync(`${evolutionDbPath(root)}-shm`)).toBe(false);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("reports a stale schema with an approved rebuild recovery action", async () => {
		const root = fixture();
		try {
			createJournal(root);
			const db = openEvolutionDb(evolutionDbPath(root));
			db.exec("PRAGMA user_version = 0");
			db.close();
			const json = captureIo();
			expect(await runEvolveCommand("status", ["--json"], root, json.io)).toBe(
				0,
			);
			const payload = JSON.parse(json.stdout[0] ?? "{}");
			expect(payload.data).toMatchObject({
				state: "rebuild_required",
				recovery_action: "afol evolve repair --json",
				journal_health: { exists: true, valid: true, error: null },
				db_health: { db_exists: true, ok: false },
			});
			const compact = captureIo();
			expect(await runEvolveCommand("status", [], root, compact.io)).toBe(0);
			expect(compact.stdout.join("\n")).toContain(
				"recovery_action=afol evolve repair --json",
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("reports no recovery action for a healthy projection", async () => {
		const root = fixture();
		try {
			createJournal(root);
			const captured = captureIo();
			expect(
				await runEvolveCommand("status", ["--json"], root, captured.io),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload.data).toMatchObject({
				state: "healthy",
				recovery_action: null,
			});
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("fails closed for a malformed canonical journal without creating a db", async () => {
		const root = fixture();
		try {
			const path = productionDayJournalPath(root);
			mkdirSync(join(root, ".afol", "data", "events", "evolution"), {
				recursive: true,
			});
			writeFileSync(path, "not-json\n", "utf8");
			const captured = captureIo();
			expect(
				await runEvolveCommand("status", ["--json"], root, captured.io),
			).toBe(1);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload.data).toMatchObject({
				state: "unhealthy",
				journal_health: { exists: true, valid: false },
			});
			expect(payload.data.journal_health.error).toContain("JSON");
			expect(payload.data.recovery_action).toContain(
				"inspect canonical journal and evidence",
			);
			for (const action of ["", "analyze", "weekly"]) {
				const analysis = captureIo();
				expect(
					await runEvolveCommand(action, ["--json"], root, analysis.io),
				).toBe(1);
				expect(JSON.parse(analysis.stdout[0] ?? "{}")).toMatchObject({
					ok: false,
					exit_code: 1,
					data: { status: "blocked" },
				});
			}
			expect(existsSync(evolutionDbPath(root))).toBe(false);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("fails closed when a journal is copied from another project", async () => {
		const source = fixture();
		const target = fixture("f4c7c0ae-50c7-4ea7-81c4-bf20e7f3a1a9");
		try {
			createJournal(source);
			const targetPath = productionDayJournalPath(target);
			mkdirSync(join(target, ".afol", "data", "events", "evolution"), {
				recursive: true,
			});
			copyFileSync(productionDayJournalPath(source), targetPath);
			const captured = captureIo();
			expect(
				await runEvolveCommand("status", ["--json"], target, captured.io),
			).toBe(1);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload.data).toMatchObject({
				state: "unhealthy",
				journal_health: { exists: true, valid: false },
			});
			expect(payload.data.journal_health.error).toContain("another project");
			expect(existsSync(evolutionDbPath(target))).toBe(false);
		} finally {
			removeEvolutionTestRoot(source);
			removeEvolutionTestRoot(target);
		}
	});
});
