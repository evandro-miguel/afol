import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
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
import {
	agentOperationContext,
	defaultOperationContext,
	isActionAllowed,
	remoteOperationContext,
	resolveCanonicalAction,
} from "../core/operation-context";
import {
	appendProductionDayAllocation,
	evolutionDbPath,
	localDateForTimezone,
	normalizeObservationRecord,
	openEvolutionDb,
	previewDailySuggestion,
	projectSuggestionReceipts,
	readSuggestionReceiptJournal,
	suggestionJournalPath,
} from "../services/evolution";
import { appendObservationJournalEvent } from "../services/evolution/observation-journal";
import { claimDailySuggestion } from "../services/evolution/suggestion-journal";
import { removeEvolutionTestRoot } from "./evolution-test-support";

const PROJECT_ID = "6b7d91ca-496f-4f0c-8537-5c4993810d15";
const DIGEST = "a".repeat(64);
const KERNEL_PATH = join(process.cwd(), "cli", "main.ts");

function configure(
	root: string,
	enabled = true,
	timezone = "UTC",
	suggestionOverrides: Record<string, unknown> = {},
): void {
	mkdirSync(join(root, ".afol"), { recursive: true });
	mkdirSync(join(root, ".agents"), { recursive: true });
	writeFileSync(
		join(root, ".agents", "lock.json"),
		readFileSync(join(process.cwd(), "src/project-template/.agents/lock.json")),
	);
	writeFileSync(
		join(root, ".agents", "manifest.json"),
		readFileSync(
			join(process.cwd(), "src/project-template/.agents/manifest.json"),
		),
	);
	writeFileSync(
		join(root, ".afol", "config.json"),
		JSON.stringify({
			schema_version: 1,
			project: { id: PROJECT_ID, name: "fixture", timezone },
			paths: {
				external_dir: ".afol/external",
				evolution_db: ".afol/state/evolution.db",
				evolution_data_dir: ".afol/data/evolution",
				evolution_events_dir: ".afol/data/events/evolution",
			},
			evolution: {
				enabled,
				suggestions: {
					first_session_of_day: true,
					dedupe_scope: "project",
					max_visible_per_day: 1,
					remind_skipped_next_day: true,
					deep_review_after_production_days: 5,
					...suggestionOverrides,
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
		}),
	);
}

function seedCandidate(root: string, timezone = "UTC"): void {
	const sessionId = "S-production";
	const sessionDir = join(root, ".afol", "wb", sessionId);
	mkdirSync(sessionDir, { recursive: true });
	const evidence = [1, 2, 3].map((index) => ({
		id: `E-production-${index}`,
		project_id: PROJECT_ID,
		session_id: sessionId,
		created_at: `2026-07-1${index}T00:00:00.000Z`,
		result: "passed",
		provenance: "observed",
		exit_code: 0,
	}));
	writeFileSync(
		join(sessionDir, ".evidence.jsonl"),
		`${evidence.map((row) => JSON.stringify(row)).join("\n")}\n`,
	);
	const db = openEvolutionDb(evolutionDbPath(root));
	try {
		for (const row of evidence)
			appendProductionDayAllocation({
				root,
				db,
				projectId: PROJECT_ID,
				timezone,
				sessionId,
				evidenceId: row.id,
			});
		const rows = [1, 2, 3].map((index) =>
			normalizeObservationRecord({
				project_id: PROJECT_ID,
				id: `O-${index}`,
				kind: "tool_failure",
				session_id: `S-${index % 2}`,
				production_day_sequence: index,
				task_type: "bug-fix",
				impact: "rework",
				created_at: `2026-07-1${index}T12:00:00.000Z`,
				journal_event_id: `J-${index}`,
				source_refs: [{ id: `E-${index}`, kind: "evidence" }],
				command: "bun test",
			}),
		);
		for (const row of rows)
			appendObservationJournalEvent({
				root,
				db,
				projectId: PROJECT_ID,
				observation: row,
			});
	} finally {
		db.close();
	}
}

function seedAlternateCandidate(root: string): void {
	const db = openEvolutionDb(evolutionDbPath(root));
	try {
		for (const index of [1, 2, 3])
			appendObservationJournalEvent({
				root,
				db,
				projectId: PROJECT_ID,
				observation: normalizeObservationRecord({
					project_id: PROJECT_ID,
					id: `O-alt-${index}`,
					kind: "test_failure",
					session_id: `S-alt-${index % 2}`,
					production_day_sequence: index,
					task_type: "bug-fix",
					impact: "rework",
					created_at: `2026-07-1${index}T13:00:00.000Z`,
					journal_event_id: `J-alt-${index}`,
					source_refs: [{ id: `E-alt-${index}`, kind: "evidence" }],
					test: "alternate-suite",
				}),
			});
	} finally {
		db.close();
	}
}

function outputSink(): {
	output: string[];
	io: { stdout: (value: string) => void; stderr: (value: string) => void };
} {
	const output: string[] = [];
	return {
		output,
		io: { stdout: (value) => output.push(value), stderr: () => {} },
	};
}

describe("evolve suggestion command boundary", () => {
	test("shows a DB-derived candidate without exposing token or digest and projects the receipt", async () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-command-show-"));
		try {
			configure(root);
			seedCandidate(root);
			const sink = outputSink();
			expect(
				await runEvolveCommand(
					"suggest",
					["--first-session", "--json"],
					root,
					sink.io,
				),
			).toBe(0);
			const serialized = sink.output.join("\n");
			expect(serialized).not.toContain("claim_token");
			expect(serialized).not.toContain("digest");
			expect(previewDailySuggestion(root).daily_status).toBe("shown");
			const db = openEvolutionDb(evolutionDbPath(root));
			try {
				expect(
					db
						.query("SELECT receipt_status FROM daily_suggestion_receipts")
						.get(),
				).toEqual({ receipt_status: "shown" });
			} finally {
				db.close();
			}
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("disabled or empty configuration does not create a receipt or database", async () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-command-disabled-"));
		try {
			configure(root, false);
			const sink = outputSink();
			expect(
				await runEvolveCommand(
					"suggest",
					["--first-session", "--json"],
					root,
					sink.io,
				),
			).toBe(0);
			expect(sink.output.join("\n")).toContain('"daily_status":"disabled"');
			expect(existsSync(join(root, ".afol", "state", "evolution.db"))).toBe(
				false,
			);
			expect(existsSync(join(root, ".afol", "data", "events"))).toBe(false);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("rejects unknown suggestion providers without creating state", async () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-command-provider-"));
		try {
			configure(root);
			const sink = outputSink();
			expect(
				await runEvolveCommand(
					"suggest",
					["--first-session", "--claimed-by", "untrusted", "--json"],
					root,
					sink.io,
				),
			).toBe(2);
			expect(sink.output.join("\n")).toContain(
				"Unsupported suggestion provider",
			);
			expect(existsSync(join(root, ".afol", "state", "evolution.db"))).toBe(
				false,
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("direct remote handler calls cannot claim or initialize suggestion state", async () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-command-remote-"));
		try {
			configure(root);
			const sink = outputSink();
			expect(
				await runEvolveCommand(
					"suggest",
					["--first-session", "--json"],
					root,
					sink.io,
					remoteOperationContext(),
				),
			).toBe(2);
			expect(sink.output.join("\n")).toContain("not allowed");
			expect(existsSync(join(root, ".afol", "state", "evolution.db"))).toBe(
				false,
			);
			expect(existsSync(join(root, ".afol", "data", "events"))).toBe(false);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("restricted stale suggestion state returns rebuild-required without mutation", async () => {
		const root = mkdtempSync(
			join(tmpdir(), "evolution-command-restricted-stale-"),
		);
		try {
			configure(root);
			seedCandidate(root);
			const checkpoint = join(
				root,
				".afol/data/events/evolution/projection-checkpoints.jsonl",
			);
			rmSync(checkpoint);
			const beforeDb = readFileSync(evolutionDbPath(root));
			const sink = outputSink();
			expect(
				await runEvolveCommand(
					"suggest",
					["--first-session", "--json"],
					root,
					sink.io,
					agentOperationContext(),
					new Date("2026-07-17T12:00:00.000Z"),
				),
			).toBe(2);
			const payload = JSON.parse(sink.output.join("\n")) as Record<
				string,
				unknown
			>;
			expect(payload).toMatchObject({
				action: "evolve.suggest",
				ok: false,
				error: { code: "EVOLUTION_REBUILD_REQUIRED" },
			});
			expect(existsSync(checkpoint)).toBe(false);
			expect(readFileSync(evolutionDbPath(root))).toEqual(beforeDb);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("restricted status JSON omits internal paths and identifiers", async () => {
		const root = mkdtempSync(
			join(tmpdir(), "evolution-command-restricted-status-"),
		);
		try {
			configure(root);
			seedCandidate(root);
			const sink = outputSink();
			expect(
				await runEvolveCommand(
					"status",
					["--json"],
					root,
					sink.io,
					agentOperationContext(),
				),
			).toBe(0);
			const serialized = sink.output.join("\n");
			expect(serialized).not.toContain(evolutionDbPath(root));
			expect(serialized).not.toContain(PROJECT_ID);
			expect(serialized).not.toContain("source_refs");
			expect(serialized).not.toContain("related_session_ids");
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("restricted suggestion errors redact filesystem and journal diagnostics", async () => {
		const root = mkdtempSync(
			join(tmpdir(), "evolution-command-restricted-error-"),
		);
		try {
			configure(root);
			seedCandidate(root);
			const journal = suggestionJournalPath(root);
			mkdirSync(join(root, ".afol/data/events/evolution"), {
				recursive: true,
			});
			writeFileSync(journal, "not-json\n");
			const sink = outputSink();
			expect(
				await runEvolveCommand(
					"suggest",
					["--first-session", "--json"],
					root,
					sink.io,
					agentOperationContext(),
				),
			).toBe(2);
			const payload = JSON.parse(sink.output.join("\n")) as {
				error?: { code?: string; message?: string };
			};
			expect(payload.error).toMatchObject({
				code: "EVOLVE_SUGGEST_FAILED",
				message:
					"evolve.suggest failed; local interactive diagnostics required",
			});
			expect(JSON.stringify(payload)).not.toContain(root);
			expect(JSON.stringify(payload)).not.toContain("not-json");
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("decision and repair failures use action-specific envelopes", async () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-command-errors-"));
		try {
			configure(root);
			const decision = outputSink();
			expect(
				await runEvolveCommand(
					"skip",
					["SUG-missing", "--json"],
					root,
					decision.io,
					defaultOperationContext(),
					new Date("2026-07-17T12:00:00.000Z"),
				),
			).toBe(2);
			expect(JSON.parse(decision.output.join("\n"))).toMatchObject({
				action: "evolve.skip",
				error: { code: "EVOLVE_SKIP_FAILED" },
			});
			const repair = outputSink();
			expect(
				await runEvolveCommand(
					"repair",
					["--json"],
					root,
					repair.io,
					agentOperationContext(),
				),
			).toBe(2);
			expect(JSON.parse(repair.output.join("\n"))).toMatchObject({
				action: "evolve.repair",
				error: { code: "approval-required" },
			});
			expect(existsSync(evolutionDbPath(root))).toBe(false);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("disabled repair is rejected directly and through cli/main.ts", async () => {
		const root = mkdtempSync(
			join(tmpdir(), "evolution-command-repair-disabled-"),
		);
		try {
			configure(root, false);
			const direct = outputSink();
			expect(
				await runEvolveCommand(
					"repair",
					["--json"],
					root,
					direct.io,
					defaultOperationContext(),
				),
			).toBe(2);
			expect(JSON.parse(direct.output.join("\n"))).toMatchObject({
				action: "evolve.repair",
				error: { code: "EVOLVE_REPAIR_DISABLED" },
			});
			const proc = spawnSync(
				"bun",
				[KERNEL_PATH, "evolve", "repair", "--json"],
				{ cwd: root, encoding: "utf8" },
			);
			expect(proc.status).toBe(2);
			expect(JSON.parse(proc.stdout as string)).toMatchObject({
				action: "evolve.repair",
				error: { code: "EVOLVE_REPAIR_DISABLED" },
			});
			expect(existsSync(evolutionDbPath(root))).toBe(false);
			expect(existsSync(join(root, ".afol", "data"))).toBe(false);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("enabled suggestion routes through cli/main.ts", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-command-router-"));
		try {
			configure(root);
			seedCandidate(root);
			const proc = spawnSync(
				"bun",
				[KERNEL_PATH, "evolve", "suggest", "--first-session", "--json"],
				{ cwd: root, encoding: "utf8" },
			);
			expect(proc.status).toBe(0);
			expect(proc.stderr).toBe("");
			expect(JSON.parse(proc.stdout as string)).toMatchObject({
				action: "evolve.suggest",
				ok: true,
			});
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("first-session suggestions can be disabled without hiding status health", async () => {
		const root = mkdtempSync(
			join(tmpdir(), "evolution-command-first-session-"),
		);
		try {
			configure(root, true, "UTC", { first_session_of_day: false });
			seedCandidate(root);
			const suggest = outputSink();
			expect(
				await runEvolveCommand(
					"suggest",
					["--first-session", "--json"],
					root,
					suggest.io,
				),
			).toBe(0);
			expect(suggest.output.join("\n")).toContain('"daily_status":"disabled"');
			expect(readSuggestionReceiptJournal(root, PROJECT_ID)).toHaveLength(0);
			const status = outputSink();
			expect(
				await runEvolveCommand("status", ["--json"], root, status.io),
			).toBe(0);
			expect(status.output.join("\n")).toContain('"suggestion_queue"');
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("status exposes pending suggestions and non-recurring critical alerts", async () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-command-status-"));
		try {
			configure(root);
			seedCandidate(root);
			const db = openEvolutionDb(evolutionDbPath(root));
			try {
				appendObservationJournalEvent({
					root,
					db,
					projectId: PROJECT_ID,
					observation: normalizeObservationRecord({
						project_id: PROJECT_ID,
						id: "O-critical",
						kind: "integrity_error",
						session_id: "S-critical",
						production_day_sequence: 1,
						task_type: "bug-fix",
						impact: "integrity",
						created_at: "2026-07-11T12:30:00.000Z",
						journal_event_id: "J-critical",
						source_refs: [{ id: "E-critical", kind: "evidence" }],
					}),
				});
			} finally {
				db.close();
			}
			const status = outputSink();
			expect(
				await runEvolveCommand("status", ["--json"], root, status.io),
			).toBe(0);
			const output = status.output.join("\n");
			expect(output).toContain('"suggestion_queue"');
			expect(output).toContain('"pending_count"');
			expect(output).toContain('"critical_alerts"');
			expect(output).toContain("integrity_error");
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("warm daily preview remains below the 150ms p95 budget at historical scale", async () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-command-latency-"));
		try {
			configure(root);
			seedCandidate(root);
			const shownAt = new Date("2035-01-01T12:00:00.000Z");
			await runEvolveCommand(
				"suggest",
				["--first-session", "--json"],
				root,
				outputSink().io,
				defaultOperationContext(),
				shownAt,
			);
			const db = openEvolutionDb(evolutionDbPath(root));
			try {
				db.exec("BEGIN IMMEDIATE");
				const cluster = db.prepare(
					"INSERT INTO issue_clusters(project_id,fingerprint_version,fingerprint,state,occurrence_count,distinct_session_count,distinct_production_day_count,user_confirmed_recurrence,first_seen_at,last_seen_at,priority,source_refs,updated_at,journal_event_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
				);
				for (let index = 0; index < 10_000; index += 1)
					cluster.run(
						PROJECT_ID,
						1,
						`historical-${String(index).padStart(5, "0")}`,
						"resolved",
						1,
						1,
						1,
						0,
						"2000-01-01T00:00:00.000Z",
						"2000-01-01T00:00:00.000Z",
						0,
						"[]",
						"2000-01-01T00:00:00.000Z",
						`J-historical-${index}`,
					);
				const receipt = db.prepare(
					"INSERT INTO daily_suggestion_receipts(project_id,local_date,suggestion_id,receipt_status,claimed_by,claim_token_digest,generation,claim_expires_at,reject_reason,evidence_digest,journal_sequence,journal_event_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
				);
				for (let index = 0; index < 5_000; index += 1) {
					const date = new Date(Date.UTC(2000, 0, index + 1))
						.toISOString()
						.slice(0, 10);
					receipt.run(
						PROJECT_ID,
						date,
						`SUG-historical-${index}`,
						"rejected",
						"afol",
						"b".repeat(64),
						1,
						`${date}T12:00:00.000Z`,
						"historical",
						"c".repeat(64),
						index + 10,
						`REC-historical-${index}`,
					);
				}
				db.exec("COMMIT");
			} catch (error) {
				db.exec("ROLLBACK");
				throw error;
			} finally {
				db.close();
			}
			const previewAt = new Date("2040-01-01T12:00:00.000Z");
			previewDailySuggestion(root, previewAt);
			const durations = Array.from({ length: 25 }, () => {
				const started = performance.now();
				previewDailySuggestion(root, previewAt);
				return performance.now() - started;
			}).sort((left, right) => left - right);
			const p95 = durations[Math.ceil(durations.length * 0.95) - 1] ?? Infinity;
			expect(p95).toBeLessThan(150);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("preview and claim select the same remaining candidate after a disabled reminder", async () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-command-reminder-"));
		try {
			configure(root, true, "UTC", { remind_skipped_next_day: false });
			seedCandidate(root);
			seedAlternateCandidate(root);
			const dayOne = new Date("2026-07-17T12:00:00.000Z");
			const shown = outputSink();
			expect(
				await runEvolveCommand(
					"suggest",
					["--first-session", "--json"],
					root,
					shown.io,
					defaultOperationContext(),
					dayOne,
				),
			).toBe(0);
			const suggestionId = String(
				projectSuggestionReceipts(
					readSuggestionReceiptJournal(root, PROJECT_ID),
				).get(`${PROJECT_ID}\u00002026-07-17`)?.suggestion_id ?? "",
			);
			expect(
				await runEvolveCommand(
					"skip",
					[suggestionId, "--json"],
					root,
					outputSink().io,
					defaultOperationContext(),
					dayOne,
				),
			).toBe(0);
			const dayTwo = new Date("2026-07-18T12:00:00.000Z");
			const preview = previewDailySuggestion(root, dayTwo);
			expect(preview.daily_status).toBe("available");
			const previewId = String(preview.suggestion?.id ?? "");
			expect(previewId).toMatch(/^SUG-/);
			expect(previewId).not.toBe(suggestionId);
			expect(
				await runEvolveCommand(
					"suggest",
					["--first-session", "--json"],
					root,
					outputSink().io,
					defaultOperationContext(),
					dayTwo,
				),
			).toBe(0);
			expect(
				projectSuggestionReceipts(
					readSuggestionReceiptJournal(root, PROJECT_ID),
				).get(`${PROJECT_ID}\u00002026-07-18`)?.suggestion_id,
			).toBe(previewId);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("same-day terminal receipts keep remaining candidates in the pending count", async () => {
		for (const action of ["skip", "reject"] as const) {
			const root = mkdtempSync(
				join(tmpdir(), `evolution-command-pending-${action}-`),
			);
			try {
				configure(root, true, "UTC", { remind_skipped_next_day: false });
				seedCandidate(root);
				seedAlternateCandidate(root);
				const now = new Date("2026-07-17T12:00:00.000Z");
				expect(
					await runEvolveCommand(
						"suggest",
						["--first-session", "--json"],
						root,
						outputSink().io,
						defaultOperationContext(),
						now,
					),
				).toBe(0);
				const suggestionId = String(
					projectSuggestionReceipts(
						readSuggestionReceiptJournal(root, PROJECT_ID),
					).get(`${PROJECT_ID}\u00002026-07-17`)?.suggestion_id ?? "",
				);
				const args =
					action === "reject"
						? [suggestionId, "--reason", "not useful", "--json"]
						: [suggestionId, "--json"];
				expect(
					await runEvolveCommand(
						action,
						args,
						root,
						outputSink().io,
						defaultOperationContext(),
						now,
					),
				).toBe(0);
				const preview = previewDailySuggestion(root, now);
				expect(preview.daily_status).toBe(
					action === "reject" ? "rejected" : "skipped",
				);
				expect(preview.suggestion).toBeNull();
				expect(preview.pending_count).toBe(1);
			} finally {
				removeEvolutionTestRoot(root);
			}
		}
	});

	test("uses one command clock across a non-UTC day boundary", async () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-command-clock-"));
		try {
			configure(root, true, "America/Asuncion");
			seedCandidate(root, "America/Asuncion");
			const now = new Date("2030-01-01T03:59:59.999Z");
			const localDate = localDateForTimezone(now, "America/Asuncion");
			const sink = outputSink();
			expect(
				await runEvolveCommand(
					"suggest",
					["--first-session", "--json"],
					root,
					sink.io,
					defaultOperationContext(),
					now,
				),
			).toBe(0);
			const receipt = [
				...projectSuggestionReceipts(
					readSuggestionReceiptJournal(root, PROJECT_ID),
				).values(),
			][0];
			expect(receipt?.local_date).toBe(localDate);
			expect(receipt?.receipt_status).toBe("shown");
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("reject requires a non-flag reason value", async () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-command-reason-"));
		try {
			configure(root);
			const sink = outputSink();
			expect(
				await runEvolveCommand(
					"reject",
					["SUG-test", "--reason", "--json"],
					root,
					sink.io,
				),
			).toBe(2);
			expect(sink.output.join("\n")).toContain("--reason requires a value");
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("reclaims an expired CLI claim and records a token-free skip decision", async () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-command-reclaim-"));
		try {
			configure(root);
			seedCandidate(root);
			const now = new Date();
			const date = localDateForTimezone(now, "UTC");
			const suggestionId = String(
				previewDailySuggestion(root).suggestion?.id ?? "",
			);
			expect(suggestionId).toMatch(/^SUG-/);
			const db = openEvolutionDb(evolutionDbPath(root));
			try {
				claimDailySuggestion({
					root,
					db,
					projectId: PROJECT_ID,
					localDate: date,
					suggestionId: "SUG-expired",
					claimedBy: "codex",
					evidenceDigest: DIGEST,
					ttlMs: 1,
					now: new Date(now.getTime() - 2_000),
				});
			} finally {
				db.close();
			}
			const shown = outputSink();
			expect(
				await runEvolveCommand(
					"suggest",
					["--first-session", "--json"],
					root,
					shown.io,
				),
			).toBe(0);
			const receipts = readSuggestionReceiptJournal(root, PROJECT_ID);
			expect(receipts.at(-1)?.action).toBe("shown");
			const skip = outputSink();
			expect(
				await runEvolveCommand("skip", [suggestionId, "--json"], root, skip.io),
			).toBe(0);
			expect(skip.output.join("\n")).not.toContain("digest");
			const after = readSuggestionReceiptJournal(root, PROJECT_ID);
			expect(
				projectSuggestionReceipts(after).get(`${PROJECT_ID}\u0000${date}`)
					?.receipt_status,
			).toBe("skipped");
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("records a bounded CLI rejection reason after the suggestion is shown", async () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-command-reject-"));
		try {
			configure(root);
			seedCandidate(root);
			const suggestionId = String(
				previewDailySuggestion(root).suggestion?.id ?? "",
			);
			const shown = outputSink();
			expect(
				await runEvolveCommand(
					"suggest",
					["--first-session", "--json"],
					root,
					shown.io,
				),
			).toBe(0);
			const rejected = outputSink();
			expect(
				await runEvolveCommand(
					"reject",
					[suggestionId, "--reason", "not actionable", "--json"],
					root,
					rejected.io,
				),
			).toBe(0);
			expect(rejected.output.join("\n")).not.toContain("digest");
			const now = localDateForTimezone(new Date(), "UTC");
			const receipt = projectSuggestionReceipts(
				readSuggestionReceiptJournal(root, PROJECT_ID),
			).get(`${PROJECT_ID}\u0000${now}`);
			expect(receipt).toMatchObject({
				receipt_status: "rejected",
				reject_reason: "not actionable",
			});
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("decision authority permits agents to show but denies remote mutation", () => {
		const suggest = resolveCanonicalAction({
			kind: "subcommand",
			group: "evolve",
			action: "suggest",
			args: ["--first-session"],
		});
		const skip = resolveCanonicalAction({
			kind: "subcommand",
			group: "evolve",
			action: "skip",
			args: ["SUG-1"],
		});
		expect(isActionAllowed(agentOperationContext(), suggest)).toBe(true);
		expect(isActionAllowed(remoteOperationContext(), suggest)).toBe(false);
		expect(isActionAllowed(agentOperationContext(), skip)).toBe(false);
		expect(isActionAllowed(defaultOperationContext(), skip)).toBe(true);
	});
});
