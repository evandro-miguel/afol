import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildContextBundle } from "../services/context/bundler";
import { rebuildSectionIndex } from "../services/context/section-index";
import {
	appendProductionDayAllocation,
	evolutionDbPath,
	openEvolutionDb,
} from "../services/evolution";
import {
	appendAssistedProposalEvent,
	readAssistedProposalJournal,
	storePreparedAssistedProposal,
} from "../services/evolution/assisted-proposal-journal";
import type { AssistedProposalPreview } from "../services/evolution/assisted-proposal-packet";
import {
	ingestLessonStatements,
	lessonJournalPath,
	readLessonRecords,
} from "../services/evolution/lesson-records";
import { removeEvolutionTestRoot } from "./evolution-test-support";

const PROJECT_ID = "20969539-76b4-469d-b5d1-d2b6b092ac85";
const NOW = new Date("2026-09-25T18:00:00.000Z");

function fixture(): string {
	const root = mkdtempSync(join(tmpdir(), "assisted-context-guidance-"));
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "specs"), { recursive: true });
	mkdirSync(join(root, ".afol", "data", "index"), { recursive: true });
	mkdirSync(join(root, ".agents"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "config.json"),
		JSON.stringify({
			schema_version: 1,
			project: {
				id: PROJECT_ID,
				name: "assisted-context-fixture",
				timezone: "UTC",
			},
			paths: {
				external_dir: ".afol/external",
				wb_dir: ".afol/wb",
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
	rebuildSectionIndex(root);
	return root;
}

function seedProposal(
	root: string,
	input: {
		seed: string;
		kind: string;
		operation: Record<string, unknown>;
		approvalProductionDay?: number;
		approvalProductionDayBasis?: "distinct_local_dates" | null;
	},
): { proposalId: string; versionDigest: string } {
	const versionDigest = input.seed.repeat(64).slice(0, 64);
	const preview = {
		read_only: true,
		approved: false,
		project_id: PROJECT_ID,
		kind: input.kind,
		proposal_id: `EP-${versionDigest.slice(0, 24)}`,
		version_digest: versionDigest,
		problem_identity: input.seed.repeat(64).slice(0, 64),
		intervention_identity: input.seed.repeat(64).slice(0, 64),
		observed_fact: "Canonical evidence supports this bounded proposal.",
		hypothesis: "The approved guidance may improve matching work.",
		evidence_refs: [],
		intervention: { operations: [input.operation] },
		alternative: "Keep current behavior.",
		validation_plan: {
			commands: ["bun test"],
			expected: "Tests pass.",
			executed: false,
		},
		target_baselines: [],
		problem_reopen_link: null,
	} as unknown as AssistedProposalPreview;
	storePreparedAssistedProposal(root, preview, NOW);
	appendAssistedProposalEvent({
		root,
		projectId: PROJECT_ID,
		eventType: "decision",
		proposalId: preview.proposal_id,
		versionDigest,
		problemIdentity: preview.problem_identity,
		payload: {
			decision: "approve",
			...(input.approvalProductionDay === undefined
				? {}
				: {
						approval_production_day: input.approvalProductionDay,
						...(input.approvalProductionDayBasis === null
							? {}
							: {
									approval_production_day_base:
										input.approvalProductionDayBasis ?? "distinct_local_dates",
								}),
					}),
		},
		now: NOW,
	});
	appendAssistedProposalEvent({
		root,
		projectId: PROJECT_ID,
		eventType: "applied",
		proposalId: preview.proposal_id,
		versionDigest,
		problemIdentity: preview.problem_identity,
		payload: {
			targets: [
				typeof input.operation.target === "string"
					? input.operation.target
					: "project",
			],
			mutation_ids: [],
			session: "S-apply",
			task_id: "T-01",
			applied_at: NOW.toISOString(),
		},
		now: NOW,
	});
	return { proposalId: preview.proposal_id, versionDigest };
}

function writeLessonSession(root: string): void {
	const session = "S-lesson";
	const dir = join(root, ".afol", "wb", session);
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, `${session}_task_01.md`),
		[
			"---",
			'doc_type: "workbench_task"',
			`id: "${session}_task_01"`,
			`session_id: "${session}"`,
			'status: "closed"',
			'created_at: "2026-08-11T12:00:00.000Z"',
			'updated_at: "2026-08-11T12:00:00.000Z"',
			'closed_at: "2026-08-11T12:00:00.000Z"',
			"---",
			"",
			"## State Board",
			"",
			"| Task | State | Owner | Notes |",
			"| --- | --- | --- | --- |",
			"| T-01 | done | agent | complete |",
			"",
			"Problem: A nested file path was not selected for relevant context.",
			"Applies when: cli/services/context/bundler.ts",
			"Preventive action: Match approved lessons to requested project paths.",
			"Evidence: E-LESSON",
			"Verify: bun test cli/tests/context-system.test.ts",
		].join("\n"),
	);
	writeFileSync(
		join(dir, ".evidence.jsonl"),
		`${JSON.stringify({
			id: "E-LESSON",
			task_id: "T-01",
			project_id: PROJECT_ID,
			session_id: session,
			created_at: "2026-08-11T12:00:00.000Z",
			command: "bun test cli/tests/context-system.test.ts",
			result: "passed",
			provenance: "observed",
			exit_code: 0,
		})}\n`,
	);
}

function addProductionDays(root: string, count: number): void {
	const db = openEvolutionDb(evolutionDbPath(root));
	try {
		for (let index = 1; index <= count; index += 1) {
			const session = `S-day-${index}`;
			const evidenceId = `E-DAY-${index}`;
			const createdAt = new Date(Date.UTC(2026, 7, index, 12)).toISOString();
			const dir = join(root, ".afol", "wb", session);
			mkdirSync(dir, { recursive: true });
			writeFileSync(
				join(dir, ".evidence.jsonl"),
				`${JSON.stringify({
					id: evidenceId,
					project_id: PROJECT_ID,
					session_id: session,
					created_at: createdAt,
					result: "passed",
					provenance: "observed",
					exit_code: 0,
				})}\n`,
			);
			appendProductionDayAllocation({
				root,
				db,
				projectId: PROJECT_ID,
				timezone: "UTC",
				sessionId: session,
				evidenceId,
				now: new Date(createdAt),
			});
		}
	} finally {
		db.close();
	}
}

describe("assisted context guidance", () => {
	test("candidate lessons stay inactive until exact adoption and context reads do not reinforce them", () => {
		const root = fixture();
		try {
			writeLessonSession(root);
			ingestLessonStatements({ root, session: "S-lesson", now: NOW });
			const view = readLessonRecords(root)[0];
			const lesson = view?.current[0];
			expect(lesson).toBeDefined();
			if (!lesson) return;
			const build = () =>
				buildContextBundle(root, {
					filePath: "cli/services/context/bundler.ts",
					surface: "general",
					mode: "balanced",
				});
			expect(build().lessons).toBeUndefined();
			const adoption = seedProposal(root, {
				seed: "a",
				kind: "lesson_adoption",
				operation: {
					type: "apply_lesson",
					lesson_id: lesson.lesson_id,
					version_id: lesson.version_id,
					field_set_digest: lesson.field_set_digest,
				},
			});
			const beforeLessonJournal = readFileSync(lessonJournalPath(root), "utf8");
			const beforeProposalJournal = readAssistedProposalJournal(
				root,
				PROJECT_ID,
			);
			const bundle = build();
			expect(bundle.lessons?.lessons[0]).toMatchObject({
				id: lesson.lesson_id,
				problem: lesson.fields.problem,
			});
			expect(bundle.approved_guidance?.items).toContainEqual(
				expect.objectContaining({
					proposal_id: adoption.proposalId,
					version_digest: adoption.versionDigest,
					kind: "lesson_adoption",
					lesson: expect.objectContaining({
						version_id: lesson.version_id,
						field_set_digest: lesson.field_set_digest,
					}),
				}),
			);
			build();
			expect(readFileSync(lessonJournalPath(root), "utf8")).toBe(
				beforeLessonJournal,
			);
			expect(readAssistedProposalJournal(root, PROJECT_ID)).toHaveLength(
				beforeProposalJournal.length,
			);
			expect(readLessonRecords(root)[0]?.current[0]?.application_count).toBe(0);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("contextual preferences decay at production day 20 while durable guidance remains", () => {
		const root = fixture();
		try {
			addProductionDays(root, 21);
			const fresh = seedProposal(root, {
				seed: "b",
				kind: "contextual_preference",
				approvalProductionDay: 13,
				operation: {
					type: "publish_guidance",
					statement: "Prefer short focused validation runs.",
				},
			});
			const expired = seedProposal(root, {
				seed: "c",
				kind: "contextual_preference",
				approvalProductionDay: 1,
				operation: {
					type: "publish_guidance",
					statement: "Use the full test suite before delivery.",
				},
			});
			const decision = seedProposal(root, {
				seed: "d",
				kind: "durable_decision",
				approvalProductionDay: 0,
				operation: {
					type: "publish_guidance",
					statement: "Prefer canonical project-relative paths.",
				},
			});
			const restriction = seedProposal(root, {
				seed: "e",
				kind: "durable_restriction",
				approvalProductionDay: 0,
				operation: {
					type: "publish_guidance",
					statement: "Do not execute packet validation commands automatically.",
				},
			});
			const bundle = buildContextBundle(root, {
				surface: "general",
				role: "worker",
				mode: "balanced",
			});
			const guidance = bundle.approved_guidance;
			expect(guidance?.current_production_day).toBe(21);
			expect(guidance?.contextual_preference_health).toBe("healthy");
			expect(guidance?.items).toContainEqual(
				expect.objectContaining({
					proposal_id: fresh.proposalId,
					production_day_age: 8,
					preference_freshness: 12 / 13,
				}),
			);
			expect(
				guidance?.items.some((item) => item.proposal_id === expired.proposalId),
			).toBe(false);
			expect(guidance?.omitted).toContainEqual({
				proposal_id: expired.proposalId,
				reason: "preference_expired",
			});
			expect(guidance?.items).toContainEqual(
				expect.objectContaining({
					proposal_id: decision.proposalId,
					kind: "durable_decision",
				}),
			);
			expect(guidance?.items).toContainEqual(
				expect.objectContaining({
					proposal_id: restriction.proposalId,
					kind: "durable_restriction",
				}),
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("marked day-zero preferences guide immediately and age after the first production day", () => {
		const root = fixture();
		try {
			const proposal = seedProposal(root, {
				seed: "a",
				kind: "contextual_preference",
				approvalProductionDay: 0,
				operation: {
					type: "publish_guidance",
					statement: "Use verified artifacts.",
				},
			});
			for (const age of [0, 1]) {
				if (age === 1) addProductionDays(root, 1);
				const guidance = buildContextBundle(root, {
					surface: "general",
					role: "worker",
					mode: "balanced",
				}).approved_guidance;
				expect(guidance?.contextual_preference_health).toBe("healthy");
				expect(guidance?.items).toContainEqual(
					expect.objectContaining({
						proposal_id: proposal.proposalId,
						production_day_age: age,
						preference_freshness: 1,
					}),
				);
			}
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("unmarked legacy production-day ordinals are unknown and require reconfirmation", () => {
		const root = fixture();
		try {
			addProductionDays(root, 21);
			const marked = seedProposal(root, {
				seed: "a",
				kind: "contextual_preference",
				approvalProductionDay: 13,
				operation: {
					type: "publish_guidance",
					statement: "Marked preference remains usable.",
				},
			});
			const legacy = seedProposal(root, {
				seed: "f",
				kind: "contextual_preference",
				approvalProductionDay: 13,
				approvalProductionDayBasis: null,
				operation: {
					type: "publish_guidance",
					statement: "Legacy guidance with an ambiguous ordinal.",
				},
			});
			const guidance = buildContextBundle(root, {
				surface: "general",
				role: "worker",
				mode: "balanced",
			}).approved_guidance;

			expect(guidance?.current_production_day).toBe(21);
			expect(guidance?.contextual_preference_health).toBe("unknown");
			expect(guidance?.items).toContainEqual(
				expect.objectContaining({
					proposal_id: marked.proposalId,
					production_day_age: 8,
				}),
			);
			expect(
				guidance?.items.some((item) => item.proposal_id === legacy.proposalId),
			).toBe(false);
			expect(guidance?.omitted).toContainEqual({
				proposal_id: legacy.proposalId,
				reason: "approval_production_day_basis_unknown",
				reconfirmation_required: true,
			});
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("explicit revocation retires exact applied guidance without deleting its history", () => {
		const root = fixture();
		try {
			const proposal = seedProposal(root, {
				seed: "f",
				kind: "durable_restriction",
				operation: {
					type: "publish_guidance",
					statement: "Do not reuse the temporary migration script.",
				},
			});
			const prepared = readAssistedProposalJournal(root, PROJECT_ID).find(
				(event) =>
					event.event_type === "prepared" &&
					event.proposal_id === proposal.proposalId,
			);
			if (!prepared) throw new Error("prepared proposal missing from fixture");
			const before = buildContextBundle(root, {
				surface: "general",
				role: "worker",
				mode: "balanced",
			});
			expect(before.approved_guidance?.items).toContainEqual(
				expect.objectContaining({ proposal_id: proposal.proposalId }),
			);
			appendAssistedProposalEvent({
				root,
				projectId: PROJECT_ID,
				eventType: "revoked",
				proposalId: proposal.proposalId,
				versionDigest: proposal.versionDigest,
				problemIdentity: prepared.problem_identity,
				payload: {
					reason: "The migration completed and this restriction is obsolete.",
				},
				now: NOW,
			});
			const after = buildContextBundle(root, {
				surface: "general",
				role: "worker",
				mode: "balanced",
			});
			expect(
				after.approved_guidance?.items.some(
					(item) => item.proposal_id === proposal.proposalId,
				) ?? false,
			).toBe(false);
			expect(
				readAssistedProposalJournal(root, PROJECT_ID).at(-1)?.event_type,
			).toBe("revoked");
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("context budget drops decaying hints before durable restrictions", () => {
		const root = fixture();
		try {
			addProductionDays(root, 1);
			for (let index = 0; index < 15; index += 1)
				seedProposal(root, {
					seed: index.toString(16),
					kind: "contextual_preference",
					approvalProductionDay: 1,
					operation: {
						type: "publish_guidance",
						statement: `Use the contextual preference ${index}. ${"p".repeat(900)}`,
					},
				});
			const restriction = seedProposal(root, {
				seed: "f",
				kind: "durable_restriction",
				operation: {
					type: "publish_guidance",
					statement: `Never discard this durable restriction. ${"r".repeat(900)}`,
				},
			});
			const bundle = buildContextBundle(root, {
				surface: "general",
				role: "worker",
				mode: "balanced",
			});
			expect(bundle.budget.used_tokens).toBeLessThanOrEqual(2000);
			expect(bundle.approved_guidance?.items).toContainEqual(
				expect.objectContaining({
					proposal_id: restriction.proposalId,
					kind: "durable_restriction",
				}),
			);
			expect(bundle.approved_guidance?.truncated).toBe(true);
			expect(bundle.approved_guidance?.omitted_count).toBeGreaterThan(0);
			expect(bundle.approved_guidance?.mandatory_omitted).toBe(false);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("context budget reports when durable restrictions themselves are omitted", () => {
		const root = fixture();
		try {
			for (let index = 0; index < 16; index += 1)
				seedProposal(root, {
					seed: `d${index}`,
					kind: "durable_restriction",
					operation: {
						type: "publish_guidance",
						statement: `Retain durable restriction ${index}. ${"r".repeat(900)}`,
					},
				});
			const bundle = buildContextBundle(root, {
				surface: "general",
				role: "worker",
				mode: "balanced",
			});
			expect(bundle.budget.used_tokens).toBeLessThanOrEqual(2000);
			expect(bundle.approved_guidance?.mandatory_omitted).toBe(true);
			expect(bundle.approved_guidance?.truncated).toBe(true);
			expect(bundle.approved_guidance?.omitted_count).toBeGreaterThan(0);
			expect(bundle.gaps).toContain(
				"Approved durable guidance was omitted by the context budget; review approved_guidance.omitted before proceeding.",
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});
});
