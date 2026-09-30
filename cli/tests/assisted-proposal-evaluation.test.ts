import { describe, expect, test } from "bun:test";
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	appendProductionDayAllocation,
	evolutionDbPath,
	openEvolutionDb,
} from "../services/evolution";
import { inspectEvolutionArtifacts } from "../services/evolution/artifact-inspection";
import { applyAssistedProposal } from "../services/evolution/assisted-proposal-apply";
import { previewAssistedProposalEvaluation } from "../services/evolution/assisted-proposal-evaluation";
import {
	appendAssistedProposalEvent,
	storePreparedAssistedProposal,
} from "../services/evolution/assisted-proposal-journal";
import { prepareAssistedProposalPreview } from "../services/evolution/assisted-proposal-packet";
import { appendObservationJournalEvent } from "../services/evolution/observation-journal";
import { normalizeObservationRecord } from "../services/evolution/observation-model";
import { removeEvolutionTestRoot } from "./evolution-test-support";

const PROJECT_ID = "879b2337-d37a-4a55-bc4f-5846c6ebcc4a";
const NOW = new Date("2026-09-25T18:00:00.000Z");

function fixture(): string {
	const root = mkdtempSync(join(tmpdir(), "assisted-proposal-evaluation-"));
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "config.json"),
		JSON.stringify({
			schema_version: 1,
			project: {
				id: PROJECT_ID,
				name: "assisted-eval-fixture",
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
	return root;
}

function appendDay(
	root: string,
	day: number,
	sessionId: string,
	taskType: string,
	observedError: string | null,
): void {
	const evidenceId = `E-${sessionId}`;
	const sessionDir = join(root, ".afol", "wb", sessionId);
	mkdirSync(sessionDir, { recursive: true });
	const createdAt = new Date(Date.UTC(2026, 2, day, 12)).toISOString();
	appendFileSync(
		join(sessionDir, ".evidence.jsonl"),
		`${JSON.stringify({
			id: evidenceId,
			project_id: PROJECT_ID,
			session_id: sessionId,
			task_id: taskType,
			created_at: createdAt,
			command: "bun test",
			result: "passed",
			provenance: "observed",
			exit_code: 0,
			purpose: "completion",
			authorization_type: "execution",
		})}\n`,
	);
	const db = openEvolutionDb(evolutionDbPath(root));
	try {
		appendProductionDayAllocation({
			root,
			db,
			projectId: PROJECT_ID,
			timezone: "UTC",
			sessionId,
			evidenceId,
			now: new Date(createdAt),
		});
		if (observedError !== null)
			appendObservationJournalEvent({
				root,
				db,
				projectId: PROJECT_ID,
				observation: normalizeObservationRecord({
					project_id: PROJECT_ID,
					id: `O-${sessionId}`,
					kind: "workflow_friction",
					session_id: sessionId,
					production_day_sequence: day,
					task_type: taskType,
					impact: "rework",
					error_code: observedError,
					test: "cli/tests/assisted-proposal-evaluation.test.ts",
					command: "bun test",
					path_module: "cli/services/evolution",
					operation: "verify",
					workflow_step: "validation",
					stack_digest: "assisted-eval-stack",
					provider: "codex",
					created_at: createdAt,
					journal_event_id: `J-${sessionId}`,
					source_refs: [{ id: evidenceId, kind: "evidence" }],
				}),
			});
	} finally {
		db.close();
	}
}

describe("assisted proposal evaluation", () => {
	test("uses the frozen baseline, excludes other task types, and waits for real comparable outcomes", () => {
		const root = fixture();
		try {
			for (const day of [1, 2, 3]) {
				const session = `S-base-${day}`;
				appendDay(root, day, session, "documentation", "E-baseline");
				if (day === 1)
					writeFileSync(
						join(root, ".afol", "wb", session, `${session}_report_1.md`),
						"A documentation verification failed and was recorded in the canonical session evidence.\n",
					);
			}
			const artifact = inspectEvolutionArtifacts({
				root,
				sessions: ["S-base-1"],
				artifacts: ["S-base-1_report_1.md"],
			}).items[0]?.artifacts[0];
			if (!artifact) throw new Error("fixture artifact was not indexed");
			const reference = {
				session_id: artifact.session_id,
				path: artifact.path,
				anchor: artifact.anchor,
				content_digest: artifact.content_digest,
				digest_scope: artifact.digest_scope,
				...(artifact.source_identity_digest
					? { source_identity_digest: artifact.source_identity_digest }
					: {}),
			};
			const packetPath = join(root, "proposal.json");
			writeFileSync(
				packetPath,
				JSON.stringify({
					schema_version: 1,
					kind: "durable_restriction",
					observed_fact:
						"The referenced sessions recorded the same documentation verification issue.",
					hypothesis: "A narrow durable guard may prevent recurrence.",
					evidence_refs: [reference],
					intervention: {
						operations: [
							{
								type: "publish_guidance",
								statement:
									"Keep documentation verification evidence linked to the affected change.",
							},
						],
					},
					alternative:
						"Keep current practice and inspect a later comparable sample.",
					validation_plan: {
						commands: [
							"bun test cli/tests/assisted-proposal-evaluation.test.ts",
						],
						expected:
							"Later evaluation reports the available comparable sessions.",
					},
				}),
			);
			const preview = prepareAssistedProposalPreview({ root, packetPath });
			expect(preview.evaluation_baseline?.status).toBe("mapped");
			expect(preview.evaluation_baseline?.contract?.task_type).toBe(
				"documentation",
			);
			storePreparedAssistedProposal(root, preview, NOW);
			appendAssistedProposalEvent({
				root,
				projectId: PROJECT_ID,
				eventType: "decision",
				proposalId: preview.proposal_id,
				versionDigest: preview.version_digest,
				problemIdentity: preview.problem_identity,
				payload: { decision: "approve" },
				now: NOW,
			});
			applyAssistedProposal({
				root,
				projectId: PROJECT_ID,
				proposalId: preview.proposal_id,
				versionDigest: preview.version_digest,
				session: "S-apply",
				taskId: "T-01",
				now: NOW,
			});

			for (const day of [4, 5, 6, 7, 8])
				appendDay(root, day, `S-other-${day}`, "implementation", "E-other");

			const evaluate = () =>
				previewAssistedProposalEvaluation({
					root,
					projectId: PROJECT_ID,
					proposalId: preview.proposal_id,
					versionDigest: preview.version_digest,
				});
			const noOpportunity = evaluate();
			expect(noOpportunity.comparable_sessions).toBe(0);
			expect(noOpportunity.state).toBe("needs_more_data");

			appendDay(root, 4, "S-followup-1", "documentation", null);
			appendDay(root, 5, "S-followup-2", "documentation", null);
			const insufficient = evaluate();
			expect(insufficient.baseline_status).toBe("mapped");
			expect(insufficient.health).toBe("healthy");
			expect(insufficient.production_day_window).toEqual({
				start: 4,
				end: 8,
				size: 5,
			});
			expect(insufficient.comparable_sessions).toBe(2);
			expect(insufficient.matching_observations).toBe(0);
			expect(insufficient.state).toBe("needs_more_data");
			expect(insufficient.read_only).toBe(true);

			appendDay(root, 6, "S-followup-3", "documentation", "E-new-c");
			const sufficient = evaluate();
			expect(sufficient.comparable_sessions).toBe(3);
			expect(sufficient.matching_observations).toBe(0);
			expect(sufficient.state).toBe("stable");
		} finally {
			removeEvolutionTestRoot(root);
		}
	});
});
