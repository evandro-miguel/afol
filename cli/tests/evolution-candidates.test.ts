import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
	writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runEvolveCommand } from "../commands/evolve";
import {
	appendAdoptionReviewEvent,
	discoverAdoptionCandidates,
	learningReviewStatus,
	readAdoptionReviewEvents,
	reviewAdoptionCandidate,
} from "../services/evolution/adoption-candidates";

const PROJECT_ID = "6b7d91ca-496f-4f0c-8537-5c4993810d15";

function fixture(): string {
	const root = mkdtempSync(join(tmpdir(), "evolve-candidates-"));
	mkdirSync(join(root, ".afol", "wb", "S-01"), { recursive: true });
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
	writeFileSync(
		join(root, ".afol", "wb", "S-01", "S-01_task_01.md"),
		'---\ndoc_type: "workbench_task"\nid: "S-01_task_01"\nsession_id: "S-01"\nstatus: "closed"\ncreated_at: "2026-08-11T12:00:00.000Z"\nupdated_at: "2026-08-11T12:00:00.000Z"\nclosed_at: "2026-08-11T12:00:00.000Z"\n---\n\n## State Board\n\n| Task | State | Owner | Notes |\n| --- | --- | --- | --- |\n| T-01 | done | agent | complete |\n\nDecision: Preserve bounded evidence in adoption reviews.\n',
	);
	writeFileSync(
		join(root, ".afol", "wb", "S-01", ".evidence.jsonl"),
		`${JSON.stringify({ id: "E-01", task_id: "T-01", result: "passed", provenance: "observed", command: "bun test", exit_code: 0, created_at: "2026-08-11T12:00:00.000Z" })}\n`,
	);
	return root;
}

function sink() {
	const stdout: string[] = [];
	return {
		stdout,
		io: { stdout: (line: string) => stdout.push(line), stderr: () => {} },
	};
}

describe("evolve candidates", () => {
	test("returns a bounded, redacted read-only memory candidate from a completed session", async () => {
		const root = fixture();
		try {
			const out = sink();
			expect(
				await runEvolveCommand(
					"candidates",
					["--session", "S-01", "--limit", "1", "--json"],
					root,
					out.io,
				),
			).toBe(0);
			const result = JSON.parse(out.stdout.join("\n"));
			expect(result.data).toMatchObject({
				read_only: true,
				review_state: "candidate_available",
				session_id: "S-01",
			});
			expect(result.data.candidates[0]).toMatchObject({
				destination: "memory",
				provenance: "explicit",
				state_class: "derived",
				approval_required: true,
			});
			expect(JSON.stringify(result)).not.toContain(".evidence.jsonl");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("blocks learning from a completed but unclosed session", async () => {
		const root = fixture();
		try {
			const taskPath = join(root, ".afol", "wb", "S-01", "S-01_task_01.md");
			writeFileSync(
				taskPath,
				readFileSync(taskPath, "utf8").replace(/^---[\s\S]*?---\n\n/, ""),
			);
			const out = sink();
			expect(
				await runEvolveCommand(
					"candidates",
					["--session", "S-01", "--json"],
					root,
					out.io,
				),
			).toBe(0);
			expect(out.stdout.join("\n")).toContain("blocked_missing_evidence");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("references only observed successful evidence for a completed task", async () => {
		const root = fixture();
		try {
			const evidencePath = join(root, ".afol", "wb", "S-01", ".evidence.jsonl");
			const unrelated = JSON.stringify({
				id: "E-UNRELATED",
				task_id: "T-99",
				result: "passed",
				provenance: "observed",
				command: "true",
				exit_code: 0,
				created_at: "2026-08-11T11:00:00.000Z",
			});
			writeFileSync(
				evidencePath,
				`${unrelated}\n${readFileSync(evidencePath, "utf8")}`,
			);
			const out = sink();
			expect(
				await runEvolveCommand(
					"candidates",
					["--session", "S-01", "--json"],
					root,
					out.io,
				),
			).toBe(0);
			const payload = JSON.parse(out.stdout.join("\n"));
			expect(payload.data.candidates[0].source_refs).toEqual(
				expect.arrayContaining([expect.objectContaining({ id: "E-01" })]),
			);
			expect(JSON.stringify(payload)).not.toContain("E-UNRELATED");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("reports explicit material without valid proof as blocked and does not write state", async () => {
		const root = fixture();
		try {
			writeFileSync(join(root, ".afol", "wb", "S-01", ".evidence.jsonl"), "");
			const out = sink();
			expect(
				await runEvolveCommand(
					"candidates",
					["--session", "S-01", "--json"],
					root,
					out.io,
				),
			).toBe(0);
			expect(out.stdout.join("\n")).toContain("blocked_missing_evidence");
			expect(() =>
				readFileSync(join(root, ".afol", "state", "evolution.db")),
			).toThrow();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects invalid limits", async () => {
		const root = fixture();
		try {
			const out = sink();
			expect(
				await runEvolveCommand(
					"candidates",
					["--limit", "11", "--json"],
					root,
					out.io,
				),
			).toBe(2);
			expect(out.stdout.join("\n")).toContain("integer from 1 to 10");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("preserves full redacted problem and recommendation with a typed destination", async () => {
		const root = fixture();
		try {
			const taskPath = join(root, ".afol", "wb", "S-01", "S-01_task_01.md");
			writeFileSync(
				taskPath,
				`${readFileSync(taskPath, "utf8")}\nProblem: ${"x".repeat(400)}\nRecommendation: Never expose /private/token in candidate output.\nDestination: library\n`,
			);
			const out = sink();
			expect(
				await runEvolveCommand(
					"candidates",
					["--session", "S-01", "--json"],
					root,
					out.io,
				),
			).toBe(0);
			const candidate = JSON.parse(out.stdout.join("\n")).data.candidates[0];
			expect(candidate).toMatchObject({
				destination: "library",
				recommendation: "never expose <redacted-path> in candidate output.",
			});
			expect(candidate.problem.length).toBe(400);
			expect(candidate.fingerprint).toMatch(/^[a-f0-9]{64}$/);
			expect(candidate.evidence_provenance).toMatchObject({
				evidence_id: "E-01",
				task_id: "T-01",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("collects indented continuations for structured adoption material", async () => {
		const root = fixture();
		try {
			const taskPath = join(root, ".afol", "wb", "S-01", "S-01_task_01.md");
			writeFileSync(
				taskPath,
				`${readFileSync(taskPath, "utf8")}\nProblem: Candidate output omitted the\n  decision rationale needed by reviewers.\nRecommendation: Preserve the decision and\n  its rationale in the adoption candidate.\nDestination: memory\n`,
			);
			const out = sink();
			expect(
				await runEvolveCommand(
					"candidates",
					["--session", "S-01", "--json"],
					root,
					out.io,
				),
			).toBe(0);
			const candidate = JSON.parse(out.stdout.join("\n")).data.candidates[0];
			expect(candidate).toMatchObject({
				problem:
					"candidate output omitted the decision rationale needed by reviewers.",
				recommendation:
					"preserve the decision and its rationale in the adoption candidate.",
				problem_truncated: false,
				recommendation_truncated: false,
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("stops explicit continuations at rationale, labels, bullets, and headings", async () => {
		const root = fixture();
		try {
			const taskPath = join(root, ".afol", "wb", "S-01", "S-01_task_01.md");
			writeFileSync(
				taskPath,
				`${readFileSync(taskPath, "utf8").replace("Decision:", "Note:")}\nDecision: Keep the durable writer\n  under the shared resource lock.\n  Rationale: competing writers otherwise race.\n  - Lesson: this must not be captured.\n  ## Next steps\n`,
			);
			const out = sink();
			expect(
				await runEvolveCommand(
					"candidates",
					["--session", "S-01", "--json"],
					root,
					out.io,
				),
			).toBe(0);
			const candidate = JSON.parse(out.stdout.join("\n")).data.candidates[0];
			expect(candidate.recommendation).toBe(
				"keep the durable writer under the shared resource lock.",
			);
			expect(candidate.destination).toBe("memory");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("caps public candidate text without splitting UTF-8 and retains source provenance", async () => {
		const root = fixture();
		try {
			const taskPath = join(root, ".afol", "wb", "S-01", "S-01_task_01.md");
			writeFileSync(
				taskPath,
				`${readFileSync(taskPath, "utf8")}\nProblem: ${"é".repeat(300)}\nRecommendation: ${"🙂".repeat(200)}\nDestination: library\n`,
			);
			const first = sink();
			const second = sink();
			await runEvolveCommand(
				"candidates",
				["--session", "S-01", "--json"],
				root,
				first.io,
			);
			await runEvolveCommand(
				"candidates",
				["--session", "S-01", "--json"],
				root,
				second.io,
			);
			const candidate = JSON.parse(first.stdout.join("\n")).data.candidates[0];
			const repeated = JSON.parse(second.stdout.join("\n")).data.candidates[0];
			expect(Buffer.byteLength(candidate.problem, "utf8")).toBeLessThanOrEqual(
				512,
			);
			expect(
				Buffer.byteLength(candidate.recommendation, "utf8"),
			).toBeLessThanOrEqual(512);
			expect(candidate).toMatchObject({
				problem_truncated: true,
				recommendation_truncated: true,
			});
			expect(candidate.id).toBe(repeated.id);
			expect(candidate.source_refs).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						kind: "report",
						digest: createHash("sha256")
							.update(readFileSync(taskPath, "utf8"))
							.digest("hex"),
					}),
				]),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("does not admit non-knowledge destinations into the adoption journal", async () => {
		const root = fixture();
		try {
			const taskPath = join(root, ".afol", "wb", "S-01", "S-01_task_01.md");
			writeFileSync(
				taskPath,
				`${readFileSync(taskPath, "utf8").replace("Decision:", "Note:")}\nProblem: A code change is needed.\nRecommendation: Add a safe branch.\nDestination: code\n`,
			);
			const out = sink();
			expect(
				await runEvolveCommand(
					"candidates",
					["--session", "S-01", "--json"],
					root,
					out.io,
				),
			).toBe(0);
			expect(JSON.parse(out.stdout.join("\n")).data.candidates).toHaveLength(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("requires explicit approval and appends a review decision", async () => {
		const root = fixture();
		try {
			const out = sink();
			expect(
				await runEvolveCommand(
					"candidates",
					[
						"review",
						"--session",
						"S-01",
						"--id",
						"AC-ignored",
						"--decision",
						"approved",
						"--reason",
						"good",
						"--json",
					],
					root,
					out.io,
				),
			).toBe(2);
			const discovered = sink();
			await runEvolveCommand(
				"candidates",
				["--session", "S-01", "--json"],
				root,
				discovered.io,
			);
			const id = JSON.parse(discovered.stdout.join("\n")).data.candidates[0].id;
			const approved = sink();
			expect(
				await runEvolveCommand(
					"candidates",
					[
						"review",
						"--session",
						"S-01",
						"--id",
						id,
						"--decision",
						"approved",
						"--approve",
						"--reason",
						"good",
						"--json",
					],
					root,
					approved.io,
				),
			).toBe(0);
			expect(approved.stdout.join("\n")).toContain('"append_only":true');
			expect(
				readFileSync(
					join(root, ".afol", "data", "evolution", "adoption-reviews.jsonl"),
					"utf8",
				)
					.trim()
					.split("\n"),
			).toHaveLength(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fails closed on malformed review journal and reports terminal review status", async () => {
		const root = fixture();
		try {
			const status = learningReviewStatus(root, "S-01");
			expect(status).toMatchObject({ session_id: "S-01", terminal: false });
			expect(status.required[0]?.id).toMatch(/^AC-/);
			const journalDir = join(root, ".afol", "data", "evolution");
			mkdirSync(journalDir, { recursive: true });
			writeFileSync(
				join(journalDir, "adoption-reviews.jsonl"),
				`${JSON.stringify({ record_type: "adoption_review", schema_version: 1 })}\n`,
			);
			expect(() => readAdoptionReviewEvents(root)).toThrow(
				"adoption review journal line 1 is invalid or legacy",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("isolates a valid forged cross-session review from the reviewed session", async () => {
		const root = fixture();
		try {
			const initial = learningReviewStatus(root, "S-01");
			const required = initial.required[0];
			expect(required).toBeDefined();
			const session = "S-OTHER";
			const createdAt = "2026-08-12T00:00:00.000Z";
			const decision = "approved";
			const id = `AR-${createHash("sha256").update(`${session}:${required?.id}:${required?.fingerprint}:${createdAt}:${decision}`).digest("hex").slice(0, 20)}`;
			const journalDir = join(root, ".afol", "data", "evolution");
			mkdirSync(journalDir, { recursive: true });
			writeFileSync(
				join(journalDir, "adoption-reviews.jsonl"),
				`${JSON.stringify({ record_type: "adoption_review", schema_version: 1, id, session_id: session, candidate_id: required?.id, fingerprint: required?.fingerprint, decision, reason: "forged other session", created_at: createdAt })}\n`,
			);
			expect(learningReviewStatus(root, "S-01")).toMatchObject({
				terminal: false,
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rederives the candidate under the journal lock and keeps the first decision", () => {
		const root = fixture();
		try {
			const candidate = discoverAdoptionCandidates({ root, session: "S-01" })
				.candidates[0];
			expect(candidate).toBeDefined();
			const first = reviewAdoptionCandidate({
				root,
				session: "S-01",
				candidateId: candidate?.id ?? "",
				decision: "rejected",
				reason: "first reviewer declines",
				createdAt: "2026-08-11T13:00:00.000Z",
			});
			expect(first.decision).toBe("rejected");
			expect(() =>
				reviewAdoptionCandidate({
					root,
					session: "S-01",
					candidateId: candidate?.id ?? "",
					decision: "approved",
					reason: "second reviewer changes course",
					createdAt: "2026-08-11T13:01:00.000Z",
				}),
			).toThrow("already has a terminal decision");
			expect(readAdoptionReviewEvents(root)).toHaveLength(1);
			expect(learningReviewStatus(root, "S-01").terminal).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("treats a pre-existing conflicting journal history as terminal", () => {
		const root = fixture();
		try {
			const candidate = discoverAdoptionCandidates({ root, session: "S-01" })
				.candidates[0];
			expect(candidate).toBeDefined();
			const first = appendAdoptionReviewEvent(root, "S-01", {
				candidate_id: candidate?.id ?? "",
				fingerprint: candidate?.fingerprint ?? "",
				decision: "approved",
				reason: "first decision",
				created_at: "2026-08-11T13:00:00.000Z",
			});
			const createdAt = "2026-08-11T13:01:00.000Z";
			const decision = "rejected";
			const id = `AR-${createHash("sha256").update(`S-01:${candidate?.id}:${candidate?.fingerprint}:${createdAt}:${decision}`).digest("hex").slice(0, 20)}`;
			writeFileSync(
				join(root, ".afol", "data", "evolution", "adoption-reviews.jsonl"),
				`${JSON.stringify(first)}\n${JSON.stringify({ ...first, id, decision, reason: "forged conflict", created_at: createdAt })}\n`,
			);
			expect(learningReviewStatus(root, "S-01")).toMatchObject({
				terminal: true,
			});
			expect(() =>
				reviewAdoptionCandidate({
					root,
					session: "S-01",
					candidateId: candidate?.id ?? "",
					decision: "approved",
					reason: "cannot reopen conflict",
					createdAt: "2026-08-11T13:02:00.000Z",
				}),
			).toThrow("already has a terminal decision");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects a stale preview after the fingerprint changes without writing", () => {
		const root = fixture();
		try {
			const candidate = discoverAdoptionCandidates({ root, session: "S-01" })
				.candidates[0];
			const taskPath = join(root, ".afol", "wb", "S-01", "S-01_task_01.md");
			writeFileSync(
				taskPath,
				readFileSync(taskPath, "utf8").replace(
					"Preserve bounded evidence in adoption reviews.",
					"Changed after preview.",
				),
			);
			expect(() =>
				reviewAdoptionCandidate({
					root,
					session: "S-01",
					candidateId: candidate?.id ?? "",
					decision: "approved",
					reason: "approve current candidate",
					createdAt: "2026-08-11T13:00:00.000Z",
				}),
			).toThrow("candidate is missing or stale");
			expect(readAdoptionReviewEvents(root)).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rolls back a partial review-journal write", () => {
		const root = fixture();
		try {
			const candidate = discoverAdoptionCandidates({ root, session: "S-01" })
				.candidates[0];
			expect(candidate).toBeDefined();
			expect(() =>
				appendAdoptionReviewEvent(
					root,
					"S-01",
					{
						candidate_id: candidate?.id ?? "",
						fingerprint: candidate?.fingerprint ?? "",
						decision: "approved",
						reason: "fault injection",
						created_at: "2026-08-11T13:00:00.000Z",
					},
					{
						writeBytes: (_fd, value) => {
							if (value.byteLength < 2)
								throw new Error("injected write failure");
							return 1;
						},
					},
				),
			).toThrow("injected write failure");
			expect(readAdoptionReviewEvents(root)).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("preserves an existing review journal on a partial second write", () => {
		const root = fixture();
		try {
			const candidate = discoverAdoptionCandidates({ root, session: "S-01" })
				.candidates[0];
			expect(candidate).toBeDefined();
			const first = appendAdoptionReviewEvent(root, "S-01", {
				candidate_id: candidate?.id ?? "",
				fingerprint: candidate?.fingerprint ?? "",
				decision: "approved",
				reason: "first durable decision",
				created_at: "2026-08-11T13:00:00.000Z",
			});
			const journalPath = join(
				root,
				".afol",
				"data",
				"evolution",
				"adoption-reviews.jsonl",
			);
			const beforeSecondWrite = readFileSync(journalPath);

			expect(() =>
				appendAdoptionReviewEvent(
					root,
					"S-01",
					{
						candidate_id: `AC-${"b".repeat(20)}`,
						fingerprint: "c".repeat(64),
						decision: "rejected",
						reason: "partial second write",
						created_at: "2026-08-11T13:01:00.000Z",
					},
					{
						writeBytes: (fd, value) => {
							writeSync(fd, value.subarray(0, 1), 0, 1, null);
							throw new Error("injected second-write failure");
						},
					},
				),
			).toThrow("injected second-write failure");
			expect(readFileSync(journalPath)).toEqual(beforeSecondWrite);
			expect(readAdoptionReviewEvents(root)).toEqual([first]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
