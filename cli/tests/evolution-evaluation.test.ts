import { describe, expect, test } from "bun:test";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
	writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	appendProductionDayAllocation,
	checkEvolutionDbHealth,
	EVOLUTION_SCHEMA_VERSION,
	normalizeObservationRecord,
} from "../services/evolution";
import { analyzeEvolutionProject } from "../services/evolution/analysis";
import {
	APPLY_VALIDATOR_V1,
	appendApplyEventUnlocked,
	readApplyJournal,
} from "../services/evolution/apply-journal";
import {
	applyEvolutionProposal,
	rollbackEvolutionProposal,
} from "../services/evolution/apply-service";
import { evolutionDbPath, openEvolutionDb } from "../services/evolution/db";
import {
	appendEvaluationEventUnlocked,
	evaluationJournalPath,
	readEvaluationJournal,
	rebuildEvaluationProjection,
	validateEvaluationProjection,
} from "../services/evolution/evaluation-journal";
import {
	previewProposalEvaluation,
	recordProposalEvaluation,
	recordProposalSupersession,
} from "../services/evolution/evaluation-service";
import { appendObservationJournalEvent } from "../services/evolution/observation-journal";
import {
	newWorkstream,
	readActiveSession,
	startTask,
} from "../services/workbench/lifecycle";
import {
	releaseEvolutionTestHandles,
	removeEvolutionTestRoot,
} from "./evolution-test-support";

const PROJECT_ID = "db97afff-2026-4eb1-a799-5d34fd505267";
const NOW = new Date("2026-07-18T12:00:00.000Z");

function configure(root: string): void {
	writeFileSync(
		join(root, ".afol", "config.json"),
		`${JSON.stringify(
			{
				schema_version: 1,
				project: {
					id: PROJECT_ID,
					name: "evaluation-fixture",
					timezone: "UTC",
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
						auto_apply_mode: "canary",
					},
				},
			},
			null,
			2,
		)}\n`,
	);
}

function fixtureRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "evolution-evaluation-"));
	const afol = join(root, ".afol");
	mkdirSync(join(afol, "state"), { recursive: true });
	mkdirSync(join(afol, "wb"), { recursive: true });
	// mkdir via the database path keeps this helper independent of production setup.
	openEvolutionDb(evolutionDbPath(root)).close();
	configure(root);
	return root;
}

function addComparableSession(
	root: string,
	day: number,
	sessionId: string,
	fingerprintSeed = "same",
	observationKind = "workflow_friction",
	includeObservation = true,
	taskType = "documentation",
	productionEvidenceIsCompletion = true,
): void {
	const evidenceId = `E-eval-${day}-${sessionId}`;
	const sessionDir = join(root, ".afol", "wb", sessionId);
	mkdirSync(sessionDir, { recursive: true });
	appendFileSync(
		join(sessionDir, ".evidence.jsonl"),
		`${JSON.stringify({
			id: evidenceId,
			project_id: PROJECT_ID,
			session_id: sessionId,
			task_id: taskType,
			created_at: `2026-07-${String(day + 1).padStart(2, "0")}T00:00:00.000Z`,
			command: "bun test",
			result: "passed",
			provenance: "observed",
			exit_code: 0,
			...(productionEvidenceIsCompletion
				? {
						purpose: "completion",
						authorization_type: "execution",
					}
				: {}),
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
		});
		if (!includeObservation) return;
		appendObservationJournalEvent({
			root,
			db,
			projectId: PROJECT_ID,
			observation: normalizeObservationRecord({
				project_id: PROJECT_ID,
				id: `O-eval-${day}-${sessionId}`,
				kind: observationKind,
				session_id: sessionId,
				production_day_sequence: day,
				task_type: taskType,
				impact: "rework",
				error_code: `E-${fingerprintSeed}`,
				test: "suite/eval",
				command: "bun test",
				path_module: "cli/services/evolution",
				operation: "run",
				workflow_step: "verify",
				stack_digest: "eval-stack",
				provider: "codex",
				created_at: `2026-07-${String(day + 1).padStart(2, "0")}T00:00:00.000Z`,
				journal_event_id: `J-eval-${day}-${sessionId}`,
				source_refs: [{ id: evidenceId, kind: "evidence" }],
			}),
		});
	} finally {
		db.close();
	}
}

function appendCompletionEvidence(
	root: string,
	day: number,
	sessionId: string,
	taskType = "documentation",
): void {
	appendFileSync(
		join(root, ".afol", "wb", sessionId, ".evidence.jsonl"),
		`${JSON.stringify({
			id: `E-completion-${day}-${sessionId}`,
			project_id: PROJECT_ID,
			session_id: sessionId,
			task_id: taskType,
			created_at: `2026-07-${String(day + 1).padStart(2, "0")}T00:01:00.000Z`,
			command: "bun test",
			result: "passed",
			provenance: "observed",
			exit_code: 0,
			purpose: "completion",
			authorization_type: "execution",
		})}\n`,
	);
}

function appliedFixture(): {
	root: string;
	mutationId: string;
	session: string;
	taskId: string;
} {
	const root = fixtureRoot();
	for (const [day, session] of [
		[1, "S-base-1"],
		[2, "S-base-2"],
		[3, "S-base-3"],
	] as const)
		addComparableSession(root, day, session);
	const proposal = analyzeEvolutionProject(root, { now: NOW }).proposals[0];
	if (!proposal) throw new Error("fixture produced no evolution proposal");
	const stream = newWorkstream(root, "evaluation fixture", {
		noSpecRequiredReason: "test fixture",
	});
	startTask(root, { session: stream.session, taskId: "T-01" });
	const result = applyEvolutionProposal({
		root,
		projectId: PROJECT_ID,
		proposal,
		invocationClass: "policy_canary",
		policyMode: "canary",
		session: stream.session,
		taskId: "T-01",
		now: NOW,
	});
	if (!result.mutation_id)
		throw new Error("fixture apply produced no mutation id");
	return {
		root,
		mutationId: result.mutation_id,
		session: stream.session,
		taskId: "T-01",
	};
}

function expectWindow(
	root: string,
	mutationId: string,
	days: number,
	sessions: number,
): void {
	const preview = previewProposalEvaluation(root, mutationId);
	expect(preview.production_day_window).toEqual({
		start: 4,
		end: 3 + days,
		size: days,
	});
	expect(preview.comparable_sessions).toBe(sessions);
}

function recordEvaluation(
	root: string,
	mutationId: string,
	session = readActiveSession(root) ?? "",
	taskId = "T-01",
) {
	return recordProposalEvaluation({
		root,
		projectId: PROJECT_ID,
		mutationId,
		invocationClass: "explicit_local",
		session,
		taskId,
		now: NOW,
	});
}

describe("Evolution posterior evaluation contracts", () => {
	test("migrates a v7 database to v8 and preserves existing rows", () => {
		const root = fixtureRoot();
		try {
			const db = openEvolutionDb(evolutionDbPath(root));
			db.prepare("INSERT INTO evolution_metadata(key,value) VALUES (?,?)").run(
				"legacy",
				"kept",
			);
			expect(
				(db.query("PRAGMA user_version").get() as { user_version: number })
					.user_version,
			).toBe(EVOLUTION_SCHEMA_VERSION);
			expect(
				db
					.query("SELECT value FROM evolution_metadata WHERE key='legacy'")
					.get(),
			).toEqual({ value: "kept" });
			expect(
				db
					.query(
						"SELECT name FROM sqlite_master WHERE name LIKE '%evaluation%'",
					)
					.all().length,
			).toBeGreaterThan(0);
			db.close();
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("missing apply preview is not_evaluable and cannot be recorded", () => {
		const root = fixtureRoot();
		try {
			const result = previewProposalEvaluation(root, "M-v1-legacy");
			expect(result.state).toBe("not_evaluable");
			expect(result.reason).toMatch(/missing/i);
			expect(() => recordEvaluation(root, "M-v1-legacy")).toThrow();
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("committed v1 apply remains readable and records not_evaluable", () => {
		const source = appliedFixture();
		const root = fixtureRoot();
		try {
			const commit = readApplyJournal(source.root).find(
				(event) =>
					event.phase === "commit" &&
					event.binding.mutation_id === source.mutationId,
			);
			if (!commit) throw new Error("missing source apply commit");
			const binding = structuredClone(commit.binding);
			binding.validator_version = APPLY_VALIDATOR_V1;
			delete binding.cluster_id;
			delete binding.task_type;
			delete binding.contract_version;
			delete binding.evaluation_contract;
			delete binding.evaluation_contract_digest;
			for (const phase of ["prepare", "commit"] as const)
				appendApplyEventUnlocked({
					root,
					phase,
					binding,
					commandSession: binding.session,
					commandTaskId: binding.task_id,
					now: NOW,
				});
			const stream = newWorkstream(root, "v1 evaluation fixture", {
				noSpecRequiredReason: "test fixture",
			});
			startTask(root, { session: stream.session, taskId: "T-01" });
			expect(previewProposalEvaluation(root, binding.mutation_id).state).toBe(
				"not_evaluable",
			);
			expect(
				recordEvaluation(root, binding.mutation_id, stream.session),
			).toMatchObject({ state: "not_evaluable" });
		} finally {
			removeEvolutionTestRoot(source.root);
			removeEvolutionTestRoot(root);
		}
	});

	test("preview is read-only and does not append evaluation events", () => {
		const { root, mutationId } = appliedFixture();
		try {
			const before = readEvaluationJournal(root);
			const preview = previewProposalEvaluation(root, mutationId);
			expect(readEvaluationJournal(root)).toEqual(before);
			expect(preview.mutation_id).toBe(mutationId);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("rejects an apply journal bound to another configured project", () => {
		const { root, mutationId } = appliedFixture();
		try {
			const configPath = join(root, ".afol", "config.json");
			const config = JSON.parse(readFileSync(configPath, "utf8"));
			config.project.id = "7b7d91ca-496b-4f0c-8537-5c4993810d15";
			writeFileSync(configPath, `${JSON.stringify(config)}\n`);
			expect(() => previewProposalEvaluation(root, mutationId)).toThrow(
				/project identity/i,
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("honors configured evolution db and events paths", () => {
		const { root, mutationId } = appliedFixture();
		try {
			const configPath = join(root, ".afol", "config.json");
			const config = JSON.parse(readFileSync(configPath, "utf8"));
			const oldEvents = join(root, ".afol", "data", "events", "evolution");
			const customEvents = join(root, ".afol", "custom-events");
			mkdirSync(customEvents, { recursive: true });
			for (const name of [
				"applies.jsonl",
				"observations.jsonl",
				"production-day-allocations.jsonl",
			]) {
				const source = join(oldEvents, name);
				if (existsSync(source)) renameSync(source, join(customEvents, name));
			}
			const oldDb = join(root, ".afol", "state", "evolution.db");
			const customDb = join(root, ".afol", "state", "custom-evolution.db");
			releaseEvolutionTestHandles();
			renameSync(oldDb, customDb);
			for (const suffix of ["-wal", "-shm"]) {
				if (existsSync(`${oldDb}${suffix}`))
					renameSync(`${oldDb}${suffix}`, `${customDb}${suffix}`);
			}
			config.paths.evolution_events_dir = ".afol/custom-events";
			config.paths.evolution_db = ".afol/state/custom-evolution.db";
			writeFileSync(configPath, `${JSON.stringify(config)}\n`);
			const recorded = recordEvaluation(root, mutationId);
			expect(recorded.journal_event_id).toBeTruthy();
			expect(existsSync(join(customEvents, "evaluations.jsonl"))).toBe(true);
			expect(existsSync(join(oldEvents, "evaluations.jsonl"))).toBe(false);
			const db = openEvolutionDb(customDb);
			try {
				validateEvaluationProjection({
					root,
					db,
					eventsDir: ".afol/custom-events",
				});
			} finally {
				db.close();
			}
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("uses exact N+1..N+5 production-day boundaries and requires three sessions", () => {
		const { root, mutationId } = appliedFixture();
		try {
			for (const [day, session] of [
				[4, "S-post-1"],
				[5, "S-post-2"],
				[6, "S-post-3"],
				[7, "S-post-1"],
				[8, "S-post-2"],
			] as const)
				addComparableSession(root, day, session);
			expectWindow(root, mutationId, 5, 3);
			const result = recordEvaluation(root, mutationId);
			expect(result.production_day_window).toEqual({
				start: 4,
				end: 8,
				size: 5,
			});
			expect(result.comparable_sessions).toBeGreaterThanOrEqual(3);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("anchors the posterior window at the apply-day ordinal without rewriting an older baseline", () => {
		const root = fixtureRoot();
		try {
			for (const [day, session] of [
				[1, "S-anchor-base-1"],
				[2, "S-anchor-base-2"],
				[3, "S-anchor-base-3"],
			] as const)
				addComparableSession(root, day, session);
			addComparableSession(
				root,
				4,
				"S-anchor-gap-1",
				"gap",
				"other",
				false,
				"maintenance",
			);
			addComparableSession(
				root,
				5,
				"S-anchor-gap-2",
				"gap",
				"other",
				false,
				"maintenance",
			);
			const proposal = analyzeEvolutionProject(root, { now: NOW }).proposals[0];
			if (!proposal) throw new Error("fixture produced no evolution proposal");
			expect(
				proposal.evaluation_contract.baseline.production_day_range,
			).toEqual({ start: 1, end: 3 });

			// The maintenance ordinals exist when the proposal is applied, but do
			// not belong to its immutable documentation baseline.
			const stream = newWorkstream(root, "apply ordinal anchor", {
				noSpecRequiredReason: "test fixture",
			});
			startTask(root, { session: stream.session, taskId: "T-01" });
			const applied = applyEvolutionProposal({
				root,
				projectId: PROJECT_ID,
				proposal,
				invocationClass: "policy_canary",
				policyMode: "canary",
				session: stream.session,
				taskId: "T-01",
				now: NOW,
			});
			if (!applied.mutation_id) throw new Error("fixture apply failed");

			const commit = readApplyJournal(root).findLast(
				(event) =>
					event.phase === "commit" &&
					event.binding.mutation_id === applied.mutation_id,
			);
			expect(commit?.binding.evaluation_anchor_production_day_sequence).toBe(5);
			expect(
				commit?.binding.evaluation_contract?.baseline.production_day_range,
			).toEqual({ start: 1, end: 3 });
			expect(
				previewProposalEvaluation(root, applied.mutation_id),
			).toMatchObject({
				production_day_window: { start: 6, end: 10, size: 5 },
				comparable_sessions: 0,
			});

			for (const [day, session] of [
				[6, "S-anchor-post-1"],
				[7, "S-anchor-post-2"],
				[8, "S-anchor-post-3"],
				[9, "S-anchor-post-4"],
				[10, "S-anchor-post-5"],
			] as const)
				addComparableSession(
					root,
					day,
					session,
					"clean",
					"workflow_friction",
					false,
				);
			expect(
				previewProposalEvaluation(root, applied.mutation_id),
			).toMatchObject({
				production_day_window: { start: 6, end: 10, size: 5 },
				comparable_sessions: 5,
			});
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("counts successful completion evidence as comparable outcomes", () => {
		const { root, mutationId } = appliedFixture();
		try {
			for (const [day, session] of [
				[4, "S-clean-1"],
				[5, "S-clean-2"],
				[6, "S-clean-3"],
				[7, "S-clean-4"],
				[8, "S-clean-5"],
			] as const)
				addComparableSession(
					root,
					day,
					session,
					"clean",
					"workflow_friction",
					false,
				);
			const result = previewProposalEvaluation(root, mutationId);
			expect(result.comparable_sessions).toBe(5);
			expect(result.matching_observations).toBe(0);
			expect(result.state).toBe("stable");
			expect(
				(
					result.scorecard_comparison.deltas as {
						outcome: { observed_results: number | null };
					}
				).outcome.observed_results,
			).toBeGreaterThan(0);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("finds task-scoped completion evidence beyond the production-day evidence id", () => {
		const { root, mutationId } = appliedFixture();
		try {
			for (const [day, session] of [
				[4, "S-ledger-1"],
				[5, "S-ledger-2"],
				[6, "S-ledger-3"],
				[7, "S-ledger-4"],
				[8, "S-ledger-5"],
			] as const) {
				addComparableSession(
					root,
					day,
					session,
					"clean",
					"workflow_friction",
					false,
					"documentation",
					false,
				);
				appendCompletionEvidence(root, day, session);
			}
			const result = previewProposalEvaluation(root, mutationId);
			expect(result).toMatchObject({
				state: "stable",
				comparable_sessions: 5,
				matching_observations: 0,
			});
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("reopens immediately when a matching post-apply recurrence appears", () => {
		const { root, mutationId } = appliedFixture();
		try {
			addComparableSession(root, 4, "S-canary");
			const result = previewProposalEvaluation(root, mutationId);
			expect(result.state).toBe("regressed");
			expect(result.reason).toMatch(/recurrence|matching/i);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("preserves protected regressions and gives matching fingerprints immediate regressed precedence", () => {
		const { root, mutationId } = appliedFixture();
		try {
			for (const [day, session] of [
				[4, "S-post-1"],
				[5, "S-post-2"],
				[6, "S-post-3"],
			] as const)
				addComparableSession(root, day, session, "same");
			addComparableSession(root, 7, "S-regression", "same");
			const result = recordEvaluation(root, mutationId);
			expect(result.state).toBe("regressed");
			expect(result.scorecard_comparison.regressions).toBeGreaterThan(0);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("classifies efficiency-only and zero-only changes as needs_more_data, while clean windows are stable", () => {
		const cases = ["efficiency", "zero", "stable"] as const;
		for (const kind of cases) {
			const { root, mutationId } = appliedFixture();
			try {
				for (const [day, session] of [
					[4, "S-post-1"],
					[5, "S-post-2"],
					[6, "S-post-3"],
				] as const)
					addComparableSession(
						root,
						day,
						session,
						kind === "zero" ? "zero" : `${kind}-${day}`,
						kind === "efficiency" ? "latency_outlier" : "workflow_friction",
					);
				for (const [day, session] of [
					[7, "S-clean-4"],
					[8, "S-clean-5"],
				] as const)
					addComparableSession(
						root,
						day,
						session,
						"clean",
						"workflow_friction",
						false,
					);
				const result = recordEvaluation(root, mutationId);
				expect(result.state).toBe(
					kind === "stable" ? "stable" : "needs_more_data",
				);
			} finally {
				removeEvolutionTestRoot(root);
			}
		}
	});

	test("rolled_back takes precedence, valid supersede links replace the subject, invalid links fail closed", () => {
		const { root, mutationId, session, taskId } = appliedFixture();
		try {
			const rolled = recordEvaluation(root, mutationId);
			expect(["stable", "canary", "needs_more_data", "regressed"]).toContain(
				rolled.state,
			);
			for (const [day, successorSession] of [
				[4, "S-successor-1"],
				[5, "S-successor-2"],
				[6, "S-successor-3"],
			] as const)
				addComparableSession(root, day, successorSession);
			const successorProposal = analyzeEvolutionProject(root, {
				now: new Date(NOW.getTime() + 60_000),
			}).proposals[0];
			if (!successorProposal) throw new Error("missing successor proposal");
			const successorApply = applyEvolutionProposal({
				root,
				projectId: PROJECT_ID,
				proposal: successorProposal,
				invocationClass: "policy_canary",
				policyMode: "canary",
				session,
				taskId,
				now: new Date(NOW.getTime() + 60_000),
			});
			const successor = successorApply.mutation_id;
			if (!successor) throw new Error("missing successor mutation");
			const superseded = recordProposalSupersession({
				root,
				projectId: PROJECT_ID,
				subjectMutationId: mutationId,
				successorMutationId: successor,
				reason: "replacement",
				invocationClass: "explicit_local",
				session,
				taskId,
				now: NOW,
			});
			expect(superseded.state).toBe("superseded");
			const applyEvents = readApplyJournal(root);
			const subjectCommit = applyEvents.find(
				(event) =>
					event.phase === "commit" && event.binding.mutation_id === mutationId,
			);
			if (!subjectCommit) throw new Error("missing subject apply commit");
			const successorCommit = applyEvents.find(
				(event) =>
					event.phase === "commit" && event.binding.mutation_id === successor,
			);
			if (!successorCommit) throw new Error("missing successor apply commit");
			const applyJournalSequence = applyEvents.at(-1)?.sequence ?? 0;
			expect(() =>
				appendEvaluationEventUnlocked(root, {
					event_id: "EV-forged-state",
					event_type: "supersession",
					project_id: PROJECT_ID,
					mutation_id: mutationId,
					state: "stable",
					reason: "forged state",
					created_at: NOW.toISOString(),
					apply_commit_digest: subjectCommit.event_digest,
					successor_mutation_id: successor,
					successor_apply_commit_digest: successorCommit.event_digest,
					apply_journal_sequence: applyJournalSequence,
				}),
			).toThrow(/supersession state/i);
			expect(() =>
				appendEvaluationEventUnlocked(root, {
					event_id: "EV-foreign-supersession",
					event_type: "supersession",
					project_id: "7b7d91ca-496b-4f0c-8537-5c4993810d15",
					mutation_id: mutationId,
					state: "superseded",
					reason: "foreign project",
					created_at: NOW.toISOString(),
					apply_commit_digest: subjectCommit.event_digest,
					successor_mutation_id: successor,
					successor_apply_commit_digest: successorCommit.event_digest,
					apply_journal_sequence: applyJournalSequence,
				}),
			).toThrow(/project binding|identity/i);
			expect(() =>
				appendEvaluationEventUnlocked(root, {
					event_id: "EV-forged-order",
					event_type: "supersession",
					project_id: PROJECT_ID,
					mutation_id: successor,
					state: "superseded",
					reason: "forged reverse order",
					created_at: NOW.toISOString(),
					apply_commit_digest: successorCommit.event_digest,
					successor_mutation_id: mutationId,
					successor_apply_commit_digest: subjectCommit.event_digest,
					apply_journal_sequence: applyJournalSequence,
				}),
			).toThrow(/supersession contract/i);
			expect(() =>
				appendEvaluationEventUnlocked(root, {
					event_id: "EV-forged-conflict",
					event_type: "supersession",
					project_id: PROJECT_ID,
					mutation_id: mutationId,
					state: "superseded",
					reason: "second link",
					created_at: NOW.toISOString(),
					apply_commit_digest: subjectCommit.event_digest,
					successor_mutation_id: successor,
					successor_apply_commit_digest: successorCommit.event_digest,
					apply_journal_sequence: applyJournalSequence,
				}),
			).toThrow(/conflicting.*supersession/i);
			rollbackEvolutionProposal({
				root,
				projectId: PROJECT_ID,
				proposalId: subjectCommit.binding.proposal_id,
				invocationClass: "explicit_local",
				policyMode: "canary",
				session,
				taskId,
				now: NOW,
			});
			expect(previewProposalEvaluation(root, mutationId).state).toBe(
				"rolled_back",
			);
			expect(() =>
				recordProposalSupersession({
					root,
					projectId: PROJECT_ID,
					subjectMutationId: mutationId,
					successorMutationId: successor,
					reason: "replacement",
					invocationClass: "explicit_local",
					session,
					taskId,
					now: NOW,
				}),
			).toThrow(/subject.*rolled back/i);
			expect(() =>
				recordProposalSupersession({
					root,
					projectId: PROJECT_ID,
					subjectMutationId: "missing",
					successorMutationId: successor,
					reason: "bad",
					invocationClass: "explicit_local",
					session,
					taskId,
					now: NOW,
				}),
			).toThrow();
			expect(() =>
				recordProposalSupersession({
					root,
					projectId: PROJECT_ID,
					subjectMutationId: mutationId,
					successorMutationId: mutationId,
					reason: "self",
					invocationClass: "explicit_local",
					session,
					taskId,
					now: NOW,
				}),
			).toThrow();
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("evaluation record is idempotent and journals a single event", () => {
		const { root, mutationId } = appliedFixture();
		try {
			const first = recordEvaluation(root, mutationId);
			const db = openEvolutionDb(evolutionDbPath(root));
			try {
				db.exec("DELETE FROM evaluations");
			} finally {
				db.close();
			}
			const second = recordEvaluation(root, mutationId);
			expect(second).toEqual(first);
			const repaired = openEvolutionDb(evolutionDbPath(root));
			try {
				validateEvaluationProjection({ root, db: repaired });
			} finally {
				repaired.close();
			}
			expect(
				readEvaluationJournal(root).filter(
					(event) => event.mutation_id === mutationId,
				),
			).toHaveLength(1);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("keeps the canonical append successful when projection refresh fails and repairs it on retry", () => {
		const { root, mutationId, session, taskId } = appliedFixture();
		try {
			const first = recordProposalEvaluation({
				root,
				projectId: PROJECT_ID,
				mutationId,
				invocationClass: "explicit_local",
				session,
				taskId,
				now: NOW,
				projectionRefresher: () => {
					throw new Error("injected projection refresh failure");
				},
			});
			expect(first.journal_event_id).toBeTruthy();
			expect(readEvaluationJournal(root)).toHaveLength(1);
			const context = {
				root,
				projectId: PROJECT_ID,
				timezone: "UTC",
				evolutionEventsDir: ".afol/data/events/evolution",
			};
			const unhealthy = checkEvolutionDbHealth(
				evolutionDbPath(root),
				PROJECT_ID,
				context,
			);
			expect(unhealthy.ok).toBe(false);
			expect(unhealthy.findings).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						message: expect.stringContaining("evaluation projection differs"),
					}),
				]),
			);

			const recovered = recordProposalEvaluation({
				root,
				projectId: PROJECT_ID,
				mutationId,
				invocationClass: "explicit_local",
				session,
				taskId,
				now: NOW,
			});
			expect(recovered).toEqual(first);
			expect(readEvaluationJournal(root)).toHaveLength(1);
			expect(
				checkEvolutionDbHealth(evolutionDbPath(root), PROJECT_ID, context).ok,
			).toBe(true);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("fences evaluation state to the apply journal rollback anchor", () => {
		const { root, mutationId, session, taskId } = appliedFixture();
		try {
			const commit = readApplyJournal(root).find(
				(event) =>
					event.phase === "commit" && event.binding.mutation_id === mutationId,
			);
			if (!commit) throw new Error("missing apply commit fixture");
			rollbackEvolutionProposal({
				root,
				projectId: PROJECT_ID,
				proposalId: commit.binding.proposal_id,
				invocationClass: "explicit_local",
				policyMode: "canary",
				session,
				taskId,
				now: NOW,
			});

			expect(() =>
				appendEvaluationEventUnlocked(root, {
					event_id: "EV-stable-after-rollback",
					event_type: "evaluation",
					project_id: PROJECT_ID,
					mutation_id: mutationId,
					state: "stable",
					reason: "forged stale result",
					created_at: NOW.toISOString(),
					apply_commit_digest: commit.event_digest,
				}),
			).toThrow(/rollback state/i);

			const recorded = recordProposalEvaluation({
				root,
				projectId: PROJECT_ID,
				mutationId,
				invocationClass: "explicit_local",
				session,
				taskId,
				now: NOW,
			});
			expect(recorded.state).toBe("rolled_back");
			expect(readEvaluationJournal(root)).toHaveLength(1);
			expect(readEvaluationJournal(root)[0]?.apply_journal_sequence).toBe(
				readApplyJournal(root).length,
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("journal rejects tamper and partial append, and rebuild equals the original projection", () => {
		const { root, mutationId } = appliedFixture();
		try {
			recordEvaluation(root, mutationId);
			const path = evaluationJournalPath(root);
			const original = readFileSync(path);
			const events = readEvaluationJournal(root);
			const db = openEvolutionDb(evolutionDbPath(root));
			try {
				validateEvaluationProjection({ root, db });
				db.exec("DELETE FROM evaluations");
				rebuildEvaluationProjection({ root, db });
				validateEvaluationProjection({ root, db });
			} finally {
				db.close();
			}
			writeFileSync(
				path,
				Buffer.concat([original, Buffer.from('{"partial":')]),
			);
			expect(() => readEvaluationJournal(root)).toThrow();
			writeFileSync(path, original);
			const altered = JSON.parse(original.toString().split("\n")[0] ?? "{}");
			altered.state = "stable";
			writeFileSync(path, `${JSON.stringify(altered)}\n`);
			expect(() => readEvaluationJournal(root)).toThrow(
				/digest|hash|tamper|chain/i,
			);
			expect(events.length).toBeGreaterThan(0);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("journal append has no rollback path", () => {
		const { root, mutationId } = appliedFixture();
		try {
			const commit = readApplyJournal(root).find(
				(event) =>
					event.phase === "commit" && event.binding.mutation_id === mutationId,
			);
			if (!commit) throw new Error("missing apply commit fixture");
			const unbound = {
				event_id: "E-eval-manual",
				event_type: "evaluation",
				project_id: PROJECT_ID,
				mutation_id: mutationId,
				state: "canary",
				created_at: NOW.toISOString(),
			} as const;
			expect(() => appendEvaluationEventUnlocked(root, unbound)).toThrow(
				/apply digest|identity/i,
			);
			const event = {
				...unbound,
				event_id: "E-eval-bound",
				apply_commit_digest: commit.event_digest,
			};
			const result = appendEvaluationEventUnlocked(root, event);
			expect(result.event_id).toBe(event.event_id);
			expect(readEvaluationJournal(root)).toHaveLength(1);
			expect("rollback" in result).toBe(false);
			const undefinedOptional = appendEvaluationEventUnlocked(root, {
				...event,
				event_id: "E-eval-undefined-optional",
				reason: undefined,
			});
			expect(undefinedOptional.reason).toBeUndefined();
			expect(readEvaluationJournal(root)).toHaveLength(2);
			const path = evaluationJournalPath(root);
			const original = readFileSync(path);
			expect(() =>
				appendEvaluationEventUnlocked({
					root,
					event: { ...event, event_id: "E-eval-short" },
					writeBytes: () => 1,
				}),
			).toThrow(/incomplete/i);
			expect(readFileSync(path)).toEqual(original);
			const backup = `${path}.original`;
			expect(() =>
				appendEvaluationEventUnlocked({
					root,
					event: { ...event, event_id: "E-eval-replaced" },
					beforeOpen: () => {
						renameSync(path, backup);
						writeFileSync(path, "replacement sentinel\n");
					},
				}),
			).toThrow(/changed during append/i);
			expect(readFileSync(path, "utf8")).toBe("replacement sentinel\n");
			rmSync(path);
			renameSync(backup, path);
			expect(readEvaluationJournal(root)).toHaveLength(2);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("rejects an event larger than the reader limit before changing the journal", () => {
		const { root, mutationId } = appliedFixture();
		try {
			const commit = readApplyJournal(root).find(
				(event) =>
					event.phase === "commit" && event.binding.mutation_id === mutationId,
			);
			if (!commit) throw new Error("missing apply commit fixture");
			const path = evaluationJournalPath(root);
			const before = existsSync(path) ? readFileSync(path) : Buffer.alloc(0);
			expect(() =>
				appendEvaluationEventUnlocked(root, {
					event_id: "E-eval-oversized",
					event_type: "evaluation",
					project_id: PROJECT_ID,
					mutation_id: mutationId,
					state: "canary",
					created_at: NOW.toISOString(),
					apply_commit_digest: commit.event_digest,
					reason: "x".repeat(512 * 1024),
				}),
			).toThrow(/event exceeds size limit/i);
			expect(existsSync(path) ? readFileSync(path) : Buffer.alloc(0)).toEqual(
				before,
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("completes byte-based short writes and aggregates rollback failure", () => {
		const { root, mutationId } = appliedFixture();
		try {
			const commit = readApplyJournal(root).find(
				(event) =>
					event.phase === "commit" && event.binding.mutation_id === mutationId,
			);
			if (!commit) throw new Error("missing apply commit fixture");
			const event = {
				event_id: "E-eval-short-loop",
				event_type: "evaluation",
				project_id: PROJECT_ID,
				mutation_id: mutationId,
				state: "canary",
				created_at: NOW.toISOString(),
				apply_commit_digest: commit.event_digest,
			} as const;
			let shortCalls = 0;
			appendEvaluationEventUnlocked({
				root,
				event,
				writeBytes: (fd, value) => {
					shortCalls += 1;
					const bytes = Buffer.from(value);
					return writeSync(fd, bytes, 0, Math.min(3, bytes.length), null);
				},
			});
			expect(shortCalls).toBeGreaterThan(1);

			let writeCalls = 0;
			let caught: unknown;
			try {
				appendEvaluationEventUnlocked({
					root,
					event: { ...event, event_id: "E-eval-aggregate" },
					writeBytes: (fd, value) => {
						writeCalls += 1;
						if (writeCalls > 1) throw new Error("primary write failure");
						const bytes = Buffer.from(value);
						return writeSync(fd, bytes, 0, Math.min(3, bytes.length), null);
					},
					truncateFile: () => {
						throw new Error("rollback truncate failure");
					},
				});
			} catch (error) {
				caught = error;
			}
			expect(caught).toBeInstanceOf(AggregateError);
			expect(
				(caught as AggregateError).errors.map((error: Error) => error.message),
			).toEqual(["primary write failure", "rollback truncate failure"]);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("rolls back a durable append when directory fsync fails", () => {
		const { root, mutationId } = appliedFixture();
		try {
			const commit = readApplyJournal(root).find(
				(event) =>
					event.phase === "commit" && event.binding.mutation_id === mutationId,
			);
			if (!commit) throw new Error("missing apply commit fixture");
			const path = evaluationJournalPath(root);
			const before = existsSync(path) ? readFileSync(path) : Buffer.alloc(0);
			let directorySyncs = 0;
			expect(() =>
				appendEvaluationEventUnlocked({
					root,
					event: {
						event_id: "E-eval-directory-sync",
						event_type: "evaluation",
						project_id: PROJECT_ID,
						mutation_id: mutationId,
						state: "canary",
						created_at: NOW.toISOString(),
						apply_commit_digest: commit.event_digest,
					},
					syncDirectory: () => {
						directorySyncs += 1;
						if (directorySyncs === 1)
							throw new Error("directory fsync failure");
					},
				}),
			).toThrow("directory fsync failure");
			expect(directorySyncs).toBe(2);
			expect(existsSync(path) ? readFileSync(path) : Buffer.alloc(0)).toEqual(
				before,
			);
			expect(readEvaluationJournal(root)).toEqual([]);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("rejects a same-inode missing tail LF after the pre-open check", () => {
		const { root, mutationId } = appliedFixture();
		try {
			const commit = readApplyJournal(root).find(
				(event) =>
					event.phase === "commit" && event.binding.mutation_id === mutationId,
			);
			if (!commit) throw new Error("missing apply commit fixture");
			const seed = appendEvaluationEventUnlocked(root, {
				event_id: "E-eval-tail-seed",
				event_type: "evaluation",
				project_id: PROJECT_ID,
				mutation_id: mutationId,
				state: "canary",
				created_at: NOW.toISOString(),
				apply_commit_digest: commit.event_digest,
			});
			expect(seed.event_id).toBe("E-eval-tail-seed");
			const path = evaluationJournalPath(root);
			const original = readFileSync(path);
			const withoutTailLf = Buffer.from(original);
			withoutTailLf[withoutTailLf.length - 1] = 0x20;
			expect(() =>
				appendEvaluationEventUnlocked({
					root,
					event: {
						event_id: "E-eval-tail-race",
						event_type: "evaluation",
						project_id: PROJECT_ID,
						mutation_id: mutationId,
						state: "canary",
						created_at: NOW.toISOString(),
						apply_commit_digest: commit.event_digest,
					},
					beforeOpen: () => writeFileSync(path, withoutTailLf),
				}),
			).toThrow(/partial trailing event/i);
			expect(readFileSync(path)).toEqual(withoutTailLf);
			writeFileSync(path, original);
			expect(readEvaluationJournal(root)).toHaveLength(1);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("fails closed when the journal pathname changes after safe fd open", () => {
		if (process.platform === "win32") return;
		const { root, mutationId } = appliedFixture();
		const path = evaluationJournalPath(root);
		const backup = `${path}.read-original`;
		try {
			recordEvaluation(root, mutationId);
			const original = readFileSync(path);
			expect(() =>
				readEvaluationJournal(root, PROJECT_ID, undefined, {
					afterOpen: () => {
						renameSync(path, backup);
						writeFileSync(path, original);
					},
				}),
			).toThrow(/changed during read/i);
		} finally {
			if (existsSync(backup)) {
				rmSync(path, { force: true });
				renameSync(backup, path);
			}
			removeEvolutionTestRoot(root);
		}
	});
});
