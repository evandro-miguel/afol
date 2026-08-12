import { describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runEvolveCommand } from "../commands/evolve";
import { resolveTelemetryEventPath } from "../services/events/telemetry";
import { OBSERVE_JOURNAL_LIMITS } from "../services/evolution/observation-ingest";

const PROJECT_ID = "6b7d91ca-496f-4f0c-8537-5c4993810d15";

function task(session: string, closed: boolean): string {
	return `---\ndoc_type: "workbench_task"\nid: "${session}_task_01"\nsession_id: "${session}"\nstatus: "${closed ? "closed" : "open"}"\ncreated_at: "2026-08-11T12:00:00.000Z"\nupdated_at: "2026-08-11T12:00:00.000Z"${closed ? '\nclosed_at: "2026-08-11T12:00:00.000Z"' : ""}\n---\n\n## State Board\n\n| Task | State | Owner | Notes |\n| --- | --- | --- | --- |\n| T-01 | ${closed ? "done" : "in_progress"} | agent | complete |\n\nDecision: Preserve bounded evidence.\n`;
}

function fixture(): string {
	const root = mkdtempSync(join(tmpdir(), "evolve-backfill-"));
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	mkdirSync(join(root, ".afol", "wb", ".locks"));
	mkdirSync(join(root, ".afol", "wb", "_archive"));
	writeFileSync(
		join(root, ".afol", "config.json"),
		JSON.stringify({
			schema_version: 1,
			project: { name: "fixture", id: PROJECT_ID, timezone: "UTC" },
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
		}),
	);
	for (const session of ["S-01", "S-02", "S-03"]) {
		const dir = join(root, ".afol", "wb", session);
		mkdirSync(dir);
		writeFileSync(join(dir, `${session}_task_01.md`), task(session, true));
		writeFileSync(
			join(dir, ".evidence.jsonl"),
			`${JSON.stringify({ id: `E-${session}`, task_id: "T-01", project_id: PROJECT_ID, session_id: session, result: "failed", provenance: "observed", purpose: "completion", authorization_type: "execution", command: "bun test", exit_code: 1, created_at: "2026-08-11T12:00:00.000Z" })}\n`,
		);
	}
	const legacy = join(root, ".afol", "wb", "S-legacy");
	mkdirSync(legacy);
	writeFileSync(
		join(legacy, "S-legacy_task_01.md"),
		task("S-legacy", false).replace(
			"| T-01 | in_progress |",
			"| T-01 | done |",
		),
	);
	writeFileSync(
		join(legacy, ".evidence.jsonl"),
		`${JSON.stringify({ id: "E-legacy", task_id: "T-01", project_id: PROJECT_ID, session_id: "S-legacy", result: "failed", provenance: "observed", purpose: "completion", authorization_type: "execution", command: "bun test", exit_code: 1, created_at: "2026-08-11T12:00:00.000Z" })}\n`,
	);
	const open = join(root, ".afol", "wb", "S-open");
	mkdirSync(open);
	writeFileSync(join(open, "S-open_task_01.md"), task("S-open", false));
	const corrupt = join(root, ".afol", "wb", "S-corrupt");
	mkdirSync(corrupt);
	writeFileSync(join(corrupt, "S-corrupt_task_01.md"), "---\nstatus: closed\n");
	// A stale derived DB must not affect journal/file-canonical preview.
	mkdirSync(join(root, ".afol", "state"), { recursive: true });
	writeFileSync(join(root, ".afol", "state", "evolution.db"), "stale");
	return root;
}

function sink() {
	const stdout: string[] = [];
	return {
		stdout,
		io: { stdout: (line: string) => stdout.push(line), stderr: () => {} },
	};
}

describe("evolve backfill", () => {
	test("pages closed canonical sessions without writes and accounts for open/corrupt state", async () => {
		const root = fixture();
		try {
			const before = readFileSync(
				join(root, ".afol", "state", "evolution.db"),
				"utf8",
			);
			const out = sink();
			expect(
				await runEvolveCommand(
					"backfill",
					["--offset", "1", "--limit", "1", "--json"],
					root,
					out.io,
				),
			).toBe(0);
			const payload = JSON.parse(out.stdout.join("\n")).data;
			expect(payload).toMatchObject({
				read_only: true,
				pagination: {
					offset: 1,
					limit: 1,
					returned: 1,
					available: 4,
					has_more: true,
				},
				coverage: {
					session_dirs: 6,
					canonical_closed: 3,
					legacy_terminal: 1,
					legacy_evidence_unverified: 1,
					open: 1,
					corrupt: 1,
					eligible: 4,
				},
				observations: {
					derived_total: 1,
					already_observed: 0,
					pending_backfill: 1,
				},
				adoption: {
					candidate_available: 0,
					reviewed: 0,
					no_candidate: 0,
					blocked: 1,
				},
			});
			expect(payload.sources.sessions).toEqual([
				expect.objectContaining({
					session_id: "S-02",
					observation: { pending: 1, observed: 0 },
					adoption: "blocked",
					skip_reasons: ["adoption_blocked"],
					digest: expect.stringMatching(/^[a-f0-9]{64}$/),
				}),
			]);
			expect(
				readFileSync(join(root, ".afol", "state", "evolution.db"), "utf8"),
			).toBe(before);
			expect(JSON.stringify(payload)).not.toContain("bun test");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects unbounded pagination values", async () => {
		const root = fixture();
		try {
			const out = sink();
			expect(
				await runEvolveCommand(
					"backfill",
					["--limit", "11", "--json"],
					root,
					out.io,
				),
			).toBe(2);
			expect(JSON.parse(out.stdout.join("\n")).error.code).toBe(
				"EVOLVE_BACKFILL_FAILED",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("includes completed legacy sessions but excludes genuinely open sessions", async () => {
		const root = fixture();
		try {
			const out = sink();
			expect(
				await runEvolveCommand(
					"backfill",
					["--offset", "3", "--limit", "1", "--json"],
					root,
					out.io,
				),
			).toBe(0);
			const payload = JSON.parse(out.stdout.join("\n")).data;
			expect(payload.pagination).toMatchObject({
				available: 4,
				has_more: false,
			});
			expect(payload.sources.sessions[0]).toMatchObject({
				session_id: "S-legacy",
				adoption: "blocked",
				skip_reasons: ["legacy_evidence_unverified", "adoption_blocked"],
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("continues a page when one session exceeds bounded telemetry", async () => {
		const root = fixture();
		try {
			const telemetryPath = resolveTelemetryEventPath(root);
			mkdirSync(dirname(telemetryPath), { recursive: true });
			writeFileSync(
				telemetryPath,
				`${Array.from({ length: 1025 }, (_, index) =>
					JSON.stringify({
						schema_version: "1",
						id: `TEL-${index}`,
						ts: "2026-07-28T20:00:00.000Z",
						source: "afol-cli",
						event_type: "error",
						session_id: "S-01",
					}),
				).join("\n")}\n`,
			);
			const out = sink();
			expect(
				await runEvolveCommand(
					"backfill",
					["--limit", "2", "--json"],
					root,
					out.io,
				),
			).toBe(0);
			const payload = JSON.parse(out.stdout.join("\n")).data;
			expect(payload.skip_reasons.telemetry_limit_exceeded).toBe(1);
			expect(payload.sources.sessions).toEqual([
				expect.objectContaining({
					session_id: "S-01",
					observation: { pending: 0, observed: 0 },
					skip_reasons: ["telemetry_limit_exceeded", "adoption_blocked"],
				}),
				expect.objectContaining({ session_id: "S-02" }),
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("blocks observations but continues independent adoption when the journal is over limit", async () => {
		const root = fixture();
		try {
			writeFileSync(
				join(root, ".afol", "wb", "S-02", ".evidence.jsonl"),
				`${JSON.stringify({ id: "E-S-02", task_id: "T-01", project_id: PROJECT_ID, session_id: "S-02", result: "passed", provenance: "observed", purpose: "completion", authorization_type: "execution", command: "bun test", exit_code: 0, created_at: "2026-08-11T12:00:00.000Z" })}\n`,
			);
			const journalPath = join(
				root,
				".afol",
				"data",
				"events",
				"evolution",
				"observations.jsonl",
			);
			mkdirSync(dirname(journalPath), { recursive: true });
			writeFileSync(
				journalPath,
				"x".repeat(OBSERVE_JOURNAL_LIMITS.maxBytes + 1),
			);
			const out = sink();
			expect(
				await runEvolveCommand(
					"backfill",
					["--limit", "2", "--json"],
					root,
					out.io,
				),
			).toBe(0);
			const payload = JSON.parse(out.stdout.join("\n")).data;
			expect(payload.observations).toEqual({
				derived_total: 0,
				already_observed: 0,
				pending_backfill: 0,
			});
			expect(payload.skip_reasons.observation_journal_unavailable).toBe(2);
			expect(payload.sources.sessions).toEqual([
				expect.objectContaining({
					session_id: "S-01",
					observation: { pending: 0, observed: 0 },
					skip_reasons: ["observation_journal_unavailable", "adoption_blocked"],
				}),
				expect.objectContaining({
					session_id: "S-02",
					observation: { pending: 0, observed: 0 },
					adoption: "candidate_available",
					skip_reasons: ["observation_journal_unavailable"],
				}),
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
