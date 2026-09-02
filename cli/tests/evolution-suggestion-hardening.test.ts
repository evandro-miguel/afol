import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	closeSync,
	existsSync,
	linkSync,
	mkdirSync,
	mkdtempSync,
	openSync,
	readFileSync,
	readSync,
	rmSync,
	symlinkSync,
	writeFileSync,
	writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { defaultOperationContext } from "../core/operation-context";
import { evolutionDbPath, openEvolutionDb } from "../services/evolution/db";
import {
	normalizeObservationRecord,
	projectObservation,
} from "../services/evolution/observation-model";
import { readExactTailBytes } from "../services/evolution/projection-watermark";
import { dispatchSuggestionDecision } from "../services/evolution/suggestion-authority";
import {
	acknowledgeDailySuggestion,
	assertSuggestionReceiptAppendBudget,
	claimDailySuggestion,
	projectSuggestionReceipts,
	readSuggestionReceiptJournal,
	suggestionJournalPath,
} from "../services/evolution/suggestion-journal";
import { previewDailySuggestion } from "../services/evolution/suggestion-query";
import { removeEvolutionTestRoot } from "./evolution-test-support";
import { symlinkTestSupport } from "./symlink-test-support";

const PROJECT_ID = "6b7d91ca-496b-4f0c-8537-5c4993810d15";
const DIGEST = "a".repeat(64);
const JOURNAL_MAX_BYTES = 4 * 1024 * 1024;
const JOURNAL_MAX_LINES = 16_384;
const JOURNAL_MAX_LINE_BYTES = 32 * 1024;

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value && typeof value === "object")
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
			.join(",")}}`;
	return JSON.stringify(value);
}

function eventDigest(value: unknown): string {
	return createHash("sha256").update(stableJson(value)).digest("hex");
}

function configure(root: string, timezone = "UTC"): void {
	mkdirSync(join(root, ".afol"), { recursive: true });
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
}

describe("evolution suggestion hardening", () => {
	test("fills bounded tail buffers across short reads", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-tail-short-read-"));
		const path = join(root, "tail.jsonl");
		const expected = Buffer.from('{"event_digest":"abc"}\n');
		writeFileSync(path, expected);
		const fd = openSync(path, "r");
		try {
			const actual = Buffer.alloc(expected.length);
			readExactTailBytes(
				fd,
				actual,
				0,
				"bounded tail read was incomplete",
				(readFd, buffer, offset, length, position) =>
					readSync(readFd, buffer, offset, Math.min(length, 2), position),
			);
			expect(actual).toEqual(expected);
		} finally {
			closeSync(fd);
			removeEvolutionTestRoot(root);
		}
	});

	test("fails bounded tail reads on premature EOF with stable reader errors", () => {
		for (const message of [
			"evolution projection checkpoint read was incomplete",
			"evolution journal watermark read was incomplete",
			"suggestion journal tail read was incomplete",
		]) {
			let calls = 0;
			expect(() =>
				readExactTailBytes(
					-1,
					Buffer.alloc(4),
					0,
					message,
					(_fd, buffer, offset) => {
						calls += 1;
						if (calls > 1) return 0;
						buffer[offset] = 0x7b;
						return 1;
					},
				),
			).toThrow(message);
		}
	});

	test("rejects a rehashed event with forged action and authority semantics", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-suggestion-semantic-"));
		configure(root);
		try {
			claimDailySuggestion({
				root,
				projectId: PROJECT_ID,
				suggestionId: "SUG-semantic",
				claimedBy: "codex",
				evidenceDigest: DIGEST,
				now: new Date("2026-07-17T12:00:00.000Z"),
			});
			const path = suggestionJournalPath(root);
			const forged = JSON.parse(readFileSync(path, "utf8")) as Record<
				string,
				unknown
			>;
			forged.action = "accepted";
			const { event_digest: _, ...unsigned } = forged;
			forged.event_digest = eventDigest(unsigned);
			writeFileSync(path, `${JSON.stringify(forged)}\n`);
			expect(() => readSuggestionReceiptJournal(root, PROJECT_ID)).toThrow(
				"semantics",
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("redacts a raw rejection reason again at the journal boundary", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-suggestion-reason-"));
		configure(root);
		try {
			const claim = claimDailySuggestion({
				root,
				projectId: PROJECT_ID,
				suggestionId: "SUG-reason",
				claimedBy: "codex",
				evidenceDigest: DIGEST,
				now: new Date("2026-07-17T12:00:00.000Z"),
			});
			acknowledgeDailySuggestion({
				root,
				projectId: PROJECT_ID,
				suggestionId: "SUG-reason",
				claimedBy: "codex",
				claimToken: claim.claim_token,
				generation: claim.generation,
				evidenceDigest: DIGEST,
				action: "shown",
				now: new Date("2026-07-17T12:00:01.000Z"),
			});
			const rawReason = [
				'{"token":"REDACTION_CANARY_JOURNAL"}',
				"Authorization: Basic REDACTION_CANARY_BASIC_JOURNAL",
				'Authorization: Digest response="REDACTION_CANARY_DIGEST_JOURNAL"',
			].join("\n");
			const authority = dispatchSuggestionDecision({
				projectId: PROJECT_ID,
				localDate: "2026-07-17",
				suggestionId: "SUG-reason",
				evidenceDigest: DIGEST,
				action: "rejected",
				reason: rawReason,
				sourceDecisionRef: "USER-reject",
				operationContext: defaultOperationContext(),
			});
			acknowledgeDailySuggestion({
				root,
				projectId: PROJECT_ID,
				suggestionId: "SUG-reason",
				claimedBy: "codex",
				generation: claim.generation,
				evidenceDigest: DIGEST,
				action: "rejected",
				rejectReason: rawReason,
				authority,
				now: new Date("2026-07-17T12:00:02.000Z"),
			});
			const serialized = readFileSync(suggestionJournalPath(root), "utf8");
			expect(serialized).not.toContain("REDACTION_CANARY_JOURNAL");
			expect(serialized).not.toContain("REDACTION_CANARY_BASIC_JOURNAL");
			expect(serialized).not.toContain("REDACTION_CANARY_DIGEST_JOURNAL");
			expect(serialized).toContain("REDACTED");
		} finally {
			removeEvolutionTestRoot(root);
		}
	});
	test("serializes two processes to exactly one same-day claim winner", async () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-suggestion-race-"));
		const start = join(root, "start");
		const resultDir = join(root, "results");
		mkdirSync(resultDir, { recursive: true });
		configure(root);
		const modulePath = join(
			import.meta.dir,
			"../services/evolution/suggestion-journal",
		);
		const script = (actor: string) =>
			`import { existsSync, writeFileSync } from "node:fs"; import { claimDailySuggestion } from ${JSON.stringify(modulePath)}; const root=${JSON.stringify(root)}; while (!existsSync(${JSON.stringify(start)})) Bun.sleepSync(2); try { claimDailySuggestion({root,projectId:${JSON.stringify(PROJECT_ID)},localDate:"2026-07-17",suggestionId:"SUG-race",claimedBy:${JSON.stringify(actor)},evidenceDigest:${JSON.stringify(DIGEST)},now:new Date("2026-07-17T12:00:00.000Z")}); writeFileSync(${JSON.stringify(join(resultDir, `${actor}.ok`))},"ok"); } catch (error) { writeFileSync(${JSON.stringify(join(resultDir, `${actor}.error`))},String(error)); process.exitCode=1; }`;
		const codex = Bun.spawn(["bun", "-e", script("codex")], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const pi = Bun.spawn(["bun", "-e", script("pi")], {
			stdout: "pipe",
			stderr: "pipe",
		});
		try {
			writeFileSync(start, "1");
			const codexExit = await codex.exited;
			const piExit = await pi.exited;
			expect([codexExit, piExit].filter((code) => code === 0)).toHaveLength(1);
			expect([codexExit, piExit].filter((code) => code !== 0)).toHaveLength(1);
			const winners = ["codex", "pi"].filter((actor) =>
				existsSync(join(resultDir, `${actor}.ok`)),
			);
			expect(winners).toHaveLength(1);
			const loser = winners[0] === "codex" ? "pi" : "codex";
			expect(readFileSync(join(resultDir, `${loser}.error`), "utf8")).toContain(
				"active",
			);
			expect(readSuggestionReceiptJournal(root, PROJECT_ID)).toHaveLength(1);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("reclaims an expired generation but fences the old token and terminal shown", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-suggestion-expiry-"));
		configure(root);
		try {
			const first = claimDailySuggestion({
				root,
				projectId: PROJECT_ID,
				localDate: "2026-07-17",
				suggestionId: "SUG-expiry",
				claimedBy: "codex",
				evidenceDigest: DIGEST,
				ttlMs: 1_000,
				now: new Date("2026-07-17T12:00:00.000Z"),
			});
			const second = claimDailySuggestion({
				root,
				projectId: PROJECT_ID,
				localDate: "2026-07-17",
				suggestionId: "SUG-expiry",
				claimedBy: "pi",
				evidenceDigest: DIGEST,
				now: new Date("2026-07-17T12:00:02.000Z"),
			});
			expect(second.generation).toBe(first.generation + 1);
			expect(() =>
				acknowledgeDailySuggestion({
					root,
					projectId: PROJECT_ID,
					localDate: "2026-07-17",
					suggestionId: "SUG-expiry",
					claimedBy: "codex",
					claimToken: first.claim_token,
					generation: first.generation,
					evidenceDigest: DIGEST,
					action: "shown",
					now: new Date("2026-07-17T12:00:02.001Z"),
				}),
			).toThrow("claim fence");
			acknowledgeDailySuggestion({
				root,
				projectId: PROJECT_ID,
				localDate: "2026-07-17",
				suggestionId: "SUG-expiry",
				claimedBy: "pi",
				claimToken: second.claim_token,
				generation: second.generation,
				evidenceDigest: DIGEST,
				action: "shown",
				now: new Date("2026-07-17T12:00:03.000Z"),
			});
			expect(() =>
				claimDailySuggestion({
					root,
					projectId: PROJECT_ID,
					localDate: "2026-07-17",
					suggestionId: "SUG-expiry",
					claimedBy: "hermes",
					evidenceDigest: DIGEST,
					now: new Date("2026-07-17T12:00:04.000Z"),
				}),
			).toThrow("already acknowledged");
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("replays a journal-ahead receipt when the next DB-backed claim arrives", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-suggestion-replay-"));
		configure(root);
		const first = claimDailySuggestion({
			root,
			projectId: PROJECT_ID,
			localDate: "2026-07-17",
			suggestionId: "SUG-replay",
			claimedBy: "codex",
			evidenceDigest: DIGEST,
			ttlMs: 1_000,
			now: new Date("2026-07-17T12:00:00.000Z"),
		});
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			const second = claimDailySuggestion({
				root,
				db,
				projectId: PROJECT_ID,
				localDate: "2026-07-17",
				suggestionId: "SUG-replay",
				claimedBy: "pi",
				evidenceDigest: DIGEST,
				now: new Date("2026-07-17T12:00:02.000Z"),
			});
			expect(second.generation).toBe(first.generation + 1);
			expect(
				db
					.query(
						"SELECT generation,receipt_status FROM daily_suggestion_receipts",
					)
					.all(),
			).toEqual([{ generation: 2, receipt_status: "claimed" }]);
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("fails closed for project, timezone, and unconfigured mismatches", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-suggestion-config-"));
		configure(root, "America/Asuncion");
		try {
			expect(() =>
				claimDailySuggestion({
					root,
					projectId: "7b7d91ca-496b-4f0c-8537-5c4993810d15",
					localDate: "2026-07-17",
					suggestionId: "SUG-config",
					claimedBy: "codex",
					evidenceDigest: DIGEST,
					now: new Date("2026-07-17T12:00:00.000Z"),
				}),
			).toThrow("identity");
			expect(() =>
				claimDailySuggestion({
					root,
					projectId: PROJECT_ID,
					localDate: "2026-07-18",
					suggestionId: "SUG-config",
					claimedBy: "codex",
					evidenceDigest: DIGEST,
					now: new Date("2026-07-18T02:00:00.000Z"),
				}),
			).toThrow("timezone");
			writeFileSync(
				join(root, ".afol", "config.json"),
				JSON.stringify({
					schema_version: 1,
					project: { id: PROJECT_ID, name: "fixture", timezone: "UTC" },
				}),
			);
			expect(() =>
				claimDailySuggestion({
					root,
					projectId: PROJECT_ID,
					localDate: "2026-07-17",
					suggestionId: "SUG-config",
					claimedBy: "codex",
					evidenceDigest: DIGEST,
					now: new Date("2026-07-17T12:00:00.000Z"),
				}),
			).toThrow("configured evolution project");
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("never persists the claim token in journal or projected receipt", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-suggestion-token-"));
		configure(root);
		try {
			const claim = claimDailySuggestion({
				root,
				projectId: PROJECT_ID,
				localDate: "2026-07-17",
				suggestionId: "SUG-token",
				claimedBy: "codex",
				evidenceDigest: DIGEST,
				now: new Date("2026-07-17T12:00:00.000Z"),
			});
			const journal = readFileSync(suggestionJournalPath(root), "utf8");
			expect(journal).not.toContain(claim.claim_token);
			expect(
				JSON.stringify(
					projectSuggestionReceipts(
						readSuggestionReceiptJournal(root, PROJECT_ID),
					),
				),
			).not.toContain(claim.claim_token);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("rejects symlinked and hardlinked journal targets", () => {
		for (const kind of ["symlink", "hardlink"] as const) {
			const root = mkdtempSync(join(tmpdir(), `evolution-suggestion-${kind}-`));
			configure(root);
			const target = suggestionJournalPath(root);
			mkdirSync(dirname(target), { recursive: true });
			const outside = join(root, `${kind}-outside.jsonl`);
			writeFileSync(outside, "");
			if (kind === "symlink") {
				if (!symlinkTestSupport.available) continue;
				symlinkSync(outside, target);
			} else linkSync(outside, target);
			try {
				expect(() =>
					claimDailySuggestion({
						root,
						projectId: PROJECT_ID,
						localDate: "2026-07-17",
						suggestionId: `SUG-${kind}`,
						claimedBy: "codex",
						evidenceDigest: DIGEST,
						now: new Date("2026-07-17T12:00:00.000Z"),
					}),
				).toThrow(/regular file|hardlinked|reparse|symlink/);
			} finally {
				removeEvolutionTestRoot(root);
			}
		}
	});

	test("completes a receipt append across partial writes", () => {
		const root = mkdtempSync(
			join(tmpdir(), "evolution-suggestion-short-write-"),
		);
		configure(root);
		try {
			const claim = claimDailySuggestion({
				root,
				projectId: PROJECT_ID,
				suggestionId: "SUG-partial",
				claimedBy: "codex",
				evidenceDigest: DIGEST,
				now: new Date("2026-07-17T12:00:00.000Z"),
				writeBytes: (fd, value) =>
					writeSync(fd, value, 0, Math.min(8, value.byteLength), null),
			});
			expect(claim.event.action).toBe("claimed");
			expect(readSuggestionReceiptJournal(root, PROJECT_ID)).toHaveLength(1);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("rolls back a zero-byte write without leaving a receipt event", () => {
		const root = mkdtempSync(
			join(tmpdir(), "evolution-suggestion-zero-write-"),
		);
		configure(root);
		try {
			expect(() =>
				claimDailySuggestion({
					root,
					projectId: PROJECT_ID,
					suggestionId: "SUG-zero",
					claimedBy: "codex",
					evidenceDigest: DIGEST,
					writeBytes: () => 0,
					now: new Date("2026-07-17T12:00:00.000Z"),
				}),
			).toThrow("write was incomplete");
			expect(readSuggestionReceiptJournal(root, PROJECT_ID)).toHaveLength(0);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("does not truncate a pathname-swapped receipt target", () => {
		if (process.platform === "win32") return;
		const root = mkdtempSync(join(tmpdir(), "evolution-suggestion-swap-"));
		configure(root);
		try {
			const path = suggestionJournalPath(root);
			expect(() =>
				claimDailySuggestion({
					root,
					projectId: PROJECT_ID,
					suggestionId: "SUG-swap",
					claimedBy: "codex",
					evidenceDigest: DIGEST,
					writeBytes: (fd, value) => {
						rmSync(path);
						writeFileSync(path, "replacement");
						return writeSync(fd, value, 0, value.byteLength, null);
					},
					now: new Date("2026-07-17T12:00:00.000Z"),
				}),
			).toThrow("append and rollback failed");
			expect(readFileSync(path, "utf8")).toBe("replacement");
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("restores the DB projection when receipt projection fails", () => {
		const root = mkdtempSync(
			join(tmpdir(), "evolution-suggestion-projection-failure-"),
		);
		configure(root);
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			db.exec(
				"CREATE TRIGGER fail_receipt_insert BEFORE INSERT ON daily_suggestion_receipts BEGIN SELECT RAISE(ABORT, 'injected receipt projection failure'); END;",
			);
			expect(() =>
				claimDailySuggestion({
					root,
					db,
					projectId: PROJECT_ID,
					suggestionId: "SUG-projection",
					claimedBy: "codex",
					evidenceDigest: DIGEST,
					now: new Date("2026-07-17T12:00:00.000Z"),
				}),
			).toThrow("injected receipt projection failure");
			expect(readSuggestionReceiptJournal(root, PROJECT_ID)).toHaveLength(0);
			expect(
				db
					.query("SELECT COUNT(*) AS count FROM daily_suggestion_receipts")
					.get(),
			).toEqual({ count: 0 });
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("rejects oversized and over-counted receipt journals before parsing", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-suggestion-bounds-"));
		configure(root);
		try {
			const path = suggestionJournalPath(root);
			mkdirSync(dirname(path), { recursive: true });
			expect(JOURNAL_MAX_BYTES).toBe(4_194_304);
			expect(JOURNAL_MAX_LINES).toBe(16_384);
			expect(JOURNAL_MAX_LINE_BYTES).toBe(32_768);
			writeFileSync(path, "x".repeat(4 * 1024 * 1024 + 1));
			expect(() => readSuggestionReceiptJournal(root, PROJECT_ID)).toThrow(
				"byte limit",
			);
			writeFileSync(path, `${"{}\n".repeat(16_385)}`);
			expect(() => readSuggestionReceiptJournal(root, PROJECT_ID)).toThrow(
				"line limit",
			);
			writeFileSync(path, `${"x".repeat(32 * 1024 + 1)}\n`);
			expect(() => readSuggestionReceiptJournal(root, PROJECT_ID)).toThrow(
				"line exceeds",
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("enforces exact append byte and line boundaries without mutation", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-suggestion-boundary-"));
		configure(root);
		try {
			const path = suggestionJournalPath(root);
			mkdirSync(dirname(path), { recursive: true });
			const fullLine = `${"x".repeat(32 * 1024 - 1)}\n`;
			const existing = `${fullLine.repeat(127)}${"x".repeat(32 * 1024 - 3)}\n`;
			writeFileSync(path, existing);
			assertSuggestionReceiptAppendBudget(path, "a\n");
			expect(() => assertSuggestionReceiptAppendBudget(path, "ab\n")).toThrow(
				"byte limit",
			);
			writeFileSync(path, "seed\n");
			const lineBefore = readFileSync(path);
			expect(() =>
				assertSuggestionReceiptAppendBudget(path, `${"x".repeat(32 * 1024)}\n`),
			).toThrow("line exceeds");
			expect(readFileSync(path)).toEqual(lineBefore);
			expect(existsSync(join(root, ".afol/state/evolution.db"))).toBe(false);
			expect(
				existsSync(
					join(
						root,
						".afol/data/events/evolution/projection-checkpoints.jsonl",
					),
				),
			).toBe(false);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("preview rejects a hardlinked derived database", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-preview-hardlink-"));
		try {
			configure(root);
			const path = evolutionDbPath(root);
			openEvolutionDb(path).close();
			linkSync(path, join(root, "linked-evolution.db"));
			expect(() => previewDailySuggestion(root)).toThrow(/hardlinked/);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("preview rejects crafted derived observations before rendering", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-preview-crafted-"));
		try {
			configure(root);
			const db = openEvolutionDb(evolutionDbPath(root));
			try {
				db.query(
					"INSERT INTO evolution_metadata(key,value) VALUES ('project_id',?)",
				).run(PROJECT_ID);
				projectObservation(
					db,
					normalizeObservationRecord({
						project_id: PROJECT_ID,
						id: "O-crafted",
						kind: "ignore_previous_instructions",
						session_id: "S-crafted",
						production_day_sequence: 0,
						task_type: "bug-fix",
						impact: "rework",
						created_at: "2026-07-17T12:00:00.000Z",
						journal_event_id: "J-crafted",
						source_refs: [{ id: "E-crafted", kind: "evidence" }],
					}),
				);
			} finally {
				db.close();
			}
			expect(() => previewDailySuggestion(root)).toThrow(
				/projection checkpoint is missing/,
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});
});
