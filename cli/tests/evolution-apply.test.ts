import { describe, expect, test } from "bun:test";
import {
	existsSync,
	linkSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	appendProductionDayAllocation,
	evolutionDbPath,
	normalizeObservationRecord,
	openEvolutionDb,
} from "../services/evolution";
import {
	analyzeEvolutionProject,
	type EvolutionProposalPreview,
} from "../services/evolution/analysis";
import {
	applyDigest,
	readApplyJournal,
	unmatchedApplyPrepares,
} from "../services/evolution/apply-journal";
import {
	applyEvolutionProposal,
	recoverEvolutionApplies,
	rollbackEvolutionProposal,
} from "../services/evolution/apply-service";
import { appendObservationJournalEvent } from "../services/evolution/observation-journal";
import {
	appendMutationRecord,
	createMutationId,
	mutationJournalPath,
} from "../services/mutations/journal";
import { newWorkstream, startTask } from "../services/workbench/lifecycle";

const PROJECT_ID = "db97afff-2026-4eb1-a799-5d34fd505267";
const NOW = new Date("2026-07-18T12:00:00.000Z");

function configure(
	root: string,
	mode: "none" | "canary" | "lessons_memory_only" = "none",
): void {
	mkdirSync(join(root, ".afol"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "config.json"),
		JSON.stringify(
			{
				schema_version: 1,
				project: { id: PROJECT_ID, name: "apply-fixture", timezone: "UTC" },
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
						auto_apply_mode: mode,
					},
				},
			},
			null,
			2,
		),
	);
}

function seedCandidate(root: string): EvolutionProposalPreview {
	const evidence = [1, 2, 3].map((index) => ({
		id: `E-apply-${index}`,
		project_id: PROJECT_ID,
		session_id: `S-apply-${index % 2}`,
		created_at: `2026-07-${10 + index}T00:00:00.000Z`,
		result: "passed" as const,
		provenance: "observed" as const,
		exit_code: 0 as const,
	}));
	for (const sessionId of new Set(evidence.map((row) => row.session_id))) {
		const dir = join(root, ".afol", "wb", sessionId);
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, ".evidence.jsonl"),
			`${evidence
				.filter((row) => row.session_id === sessionId)
				.map((row) => JSON.stringify(row))
				.join("\n")}\n`,
		);
	}
	const db = openEvolutionDb(evolutionDbPath(root));
	try {
		for (const [index, row] of evidence.entries()) {
			appendProductionDayAllocation({
				root,
				db,
				projectId: PROJECT_ID,
				timezone: "UTC",
				sessionId: row.session_id,
				evidenceId: row.id,
			});
			appendObservationJournalEvent({
				root,
				db,
				projectId: PROJECT_ID,
				observation: normalizeObservationRecord({
					project_id: PROJECT_ID,
					id: `O-apply-${index + 1}`,
					kind: "workflow_friction",
					session_id: row.session_id,
					production_day_sequence: index + 1,
					task_type: "documentation",
					impact: "rework",
					created_at: row.created_at,
					journal_event_id: `J-apply-${index + 1}`,
					source_refs: [{ id: row.id, kind: "evidence" }],
					command: "bun test",
				}),
			});
		}
	} finally {
		db.close();
	}
	const analysis = analyzeEvolutionProject(root, { now: NOW });
	const proposal = analysis.proposals[0];
	if (!proposal)
		throw new Error(
			`fixture produced no proposal: ${JSON.stringify(analysis)}`,
		);
	return proposal;
}

function governed(root: string): { session: string; taskId: string } {
	const stream = newWorkstream(root, "evolution apply", {
		noSpecRequiredReason: "test fixture",
	});
	startTask(root, { session: stream.session, taskId: "T-01" });
	return { session: stream.session, taskId: "T-01" };
}

function fixture(mode: "none" | "canary" | "lessons_memory_only" = "none") {
	const root = mkdtempSync(join(tmpdir(), "evolution-apply-"));
	configure(root, mode);
	const proposal = seedCandidate(root);
	const task = governed(root);
	return { root, proposal, task };
}

function applyInput(
	root: string,
	proposal: EvolutionProposalPreview,
	task: { session: string; taskId: string },
	invocationClass: "explicit_local" | "policy_canary" = "explicit_local",
	policyMode: "none" | "canary" | "lessons_memory_only" = "none",
) {
	return {
		root,
		projectId: PROJECT_ID,
		proposal,
		invocationClass,
		policyMode,
		session: task.session,
		taskId: task.taskId,
		now: NOW,
	};
}

function rewriteApplyJournal(root: string, events: unknown[]): void {
	const path = join(
		root,
		".afol",
		"data",
		"events",
		"evolution",
		"applies.jsonl",
	);
	writeFileSync(
		path,
		`${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
	);
}

function requireTargetPath(result: { target_path?: string }): string {
	if (!result.target_path) throw new Error("missing target path fixture");
	return result.target_path;
}

describe("evolution apply service", () => {
	test("applies a manual lesson, is idempotent, and rolls back explicitly", () => {
		const { root, proposal, task } = fixture();
		try {
			const first = applyEvolutionProposal(applyInput(root, proposal, task));
			expect(first.status).toBe("applied");
			expect(first.duplicate).toBe(false);
			expect(existsSync(join(root, requireTargetPath(first)))).toBe(true);
			const second = applyEvolutionProposal(applyInput(root, proposal, task));
			expect(second).toMatchObject({
				status: "applied",
				duplicate: true,
				mutation_id: first.mutation_id,
			});
			const rolled = rollbackEvolutionProposal({
				root,
				projectId: PROJECT_ID,
				proposalId: proposal.id,
				invocationClass: "explicit_local",
				session: task.session,
				taskId: task.taskId,
				now: NOW,
			});
			expect(rolled.status).toBe("rolled_back");
			expect(existsSync(join(root, requireTargetPath(first)))).toBe(false);
			expect(() =>
				rollbackEvolutionProposal({
					root,
					projectId: PROJECT_ID,
					proposalId: proposal.id,
					invocationClass: "explicit_local",
					session: task.session,
					taskId: task.taskId,
					now: NOW,
				}),
			).toThrow("already rolled back");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("none policy blocks policy canary and agent-facing stale/fake proposals", () => {
		const { root, proposal, task } = fixture("none");
		try {
			applyEvolutionProposal(applyInput(root, proposal, task));
			expect(() =>
				applyEvolutionProposal({
					...applyInput(root, proposal, task, "policy_canary"),
					policyMode: "none",
				}),
			).toThrow("invocation or policy denied");
			expect(() =>
				applyEvolutionProposal({
					...applyInput(root, { ...proposal, recommendation: "fake" }, task),
					invocationClass: "explicit_local",
				}),
			).toThrow("stale");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("canary policy writes only a generated artifact and permits explicit rollback", () => {
		const { root, proposal, task } = fixture("canary");
		try {
			const applied = applyEvolutionProposal(
				applyInput(root, proposal, task, "policy_canary", "canary"),
			);
			const targetPath = requireTargetPath(applied);
			expect(targetPath).toBe(
				`.afol/data/evolution/generated/${proposal.id}.md`,
			);
			expect(readFileSync(join(root, targetPath), "utf8")).toContain(
				"doc_type: evolution_canary",
			);
			expect(
				rollbackEvolutionProposal({
					root,
					projectId: PROJECT_ID,
					proposalId: proposal.id,
					invocationClass: "explicit_local",
					policyMode: "canary",
					session: task.session,
					taskId: task.taskId,
					now: NOW,
				}),
			).toMatchObject({ status: "rolled_back" });
			expect(existsSync(join(root, targetPath))).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("journal rejects symlink and hardlink targets", () => {
		const { root, proposal, task } = fixture();
		try {
			const first = applyEvolutionProposal(applyInput(root, proposal, task));
			const journal = join(
				root,
				".afol",
				"data",
				"events",
				"evolution",
				"applies.jsonl",
			);
			const bytes = readFileSync(journal);
			const alias = join(root, "journal-alias.jsonl");
			linkSync(journal, alias);
			expect(() => readApplyJournal(root)).toThrow("must not be hardlinked");
			rmSync(journal);
			symlinkSync(alias, journal);
			expect(() => readApplyJournal(root)).toThrow(
				/symlink|reparse|regular file/i,
			);
			rmSync(journal);
			writeFileSync(journal, bytes);
			expect(readFileSync(alias)).toEqual(bytes);
			void first;
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("recovery commits an exact unmatched prepare without mutating the artifact", () => {
		const { root, proposal, task } = fixture();
		try {
			const applied = applyEvolutionProposal(applyInput(root, proposal, task));
			const events = readApplyJournal(root);
			rewriteApplyJournal(
				root,
				events.filter((event) => event.phase === "prepare"),
			);
			const targetPath = requireTargetPath(applied);
			const before = readFileSync(join(root, targetPath));
			expect(unmatchedApplyPrepares(root)).toHaveLength(1);
			expect(recoverEvolutionApplies(root)).toMatchObject([
				{ status: "applied", mutation_id: applied.mutation_id },
			]);
			expect(readFileSync(join(root, targetPath))).toEqual(before);
			expect(readApplyJournal(root).at(-1)?.phase).toBe("commit");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("recovery aborts an unmatched prepare when no mutation or artifact exists", () => {
		const { root, proposal, task } = fixture();
		try {
			const applied = applyEvolutionProposal(applyInput(root, proposal, task));
			const events = readApplyJournal(root);
			const mutationPath = mutationJournalPath(root);
			const mutationRows = readFileSync(mutationPath, "utf8")
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line) as Record<string, unknown>);
			writeFileSync(
				mutationPath,
				`${mutationRows
					.filter((row) => row.id !== applied.mutation_id)
					.map((row) => JSON.stringify(row))
					.join("\n")}\n`,
			);
			rmSync(join(root, requireTargetPath(applied)));
			rewriteApplyJournal(
				root,
				events.filter((event) => event.phase === "prepare"),
			);
			expect(recoverEvolutionApplies(root)).toMatchObject([
				{ status: "blocked", mutation_id: applied.mutation_id },
			]);
			expect(readApplyJournal(root).at(-1)?.phase).toBe("abort");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("recovery terminalizes an exact prepared mutation when the artifact is absent", () => {
		const { root, proposal, task } = fixture();
		try {
			const applied = applyEvolutionProposal(applyInput(root, proposal, task));
			const applyEvents = readApplyJournal(root);
			rewriteApplyJournal(
				root,
				applyEvents.filter((event) => event.phase === "prepare"),
			);
			const mutationPath = mutationJournalPath(root);
			const mutationRows = readFileSync(mutationPath, "utf8")
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line) as Record<string, unknown>)
				.filter(
					(row) => row.id !== applied.mutation_id || row.status === "prepared",
				);
			writeFileSync(
				mutationPath,
				`${mutationRows.map((row) => JSON.stringify(row)).join("\n")}\n`,
			);
			rmSync(join(root, requireTargetPath(applied)));
			expect(recoverEvolutionApplies(root)).toMatchObject([
				{ status: "blocked", mutation_id: applied.mutation_id },
			]);
			expect(readApplyJournal(root).at(-1)?.phase).toBe("abort");
			const terminalRows = readFileSync(mutationPath, "utf8")
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line) as Record<string, unknown>);
			expect(
				terminalRows.some(
					(row) =>
						row.id === applied.mutation_id && row.status === "rolled_back",
				),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("recovery compensates an exact prepared mutation after its physical write", () => {
		const { root, proposal, task } = fixture();
		try {
			const applied = applyEvolutionProposal(applyInput(root, proposal, task));
			rewriteApplyJournal(
				root,
				readApplyJournal(root).filter((event) => event.phase === "prepare"),
			);
			const mutationPath = mutationJournalPath(root);
			const mutationRows = readFileSync(mutationPath, "utf8")
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line) as Record<string, unknown>)
				.filter(
					(row) => row.id !== applied.mutation_id || row.status === "prepared",
				);
			writeFileSync(
				mutationPath,
				`${mutationRows.map((row) => JSON.stringify(row)).join("\n")}\n`,
			);
			expect(existsSync(join(root, requireTargetPath(applied)))).toBe(true);
			expect(recoverEvolutionApplies(root)).toMatchObject([
				{ status: "blocked", mutation_id: applied.mutation_id },
			]);
			expect(existsSync(join(root, requireTargetPath(applied)))).toBe(false);
			expect(readApplyJournal(root).at(-1)?.phase).toBe("abort");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("recovery commits a physically completed undo and records semantic rollback", () => {
		const { root, proposal, task } = fixture();
		try {
			const applied = applyEvolutionProposal(applyInput(root, proposal, task));
			const targetPath = requireTargetPath(applied);
			appendMutationRecord(root, {
				id: createMutationId(),
				ts: NOW.toISOString(),
				kind: "undo",
				status: "prepared",
				dryRun: false,
				session: task.session,
				taskId: task.taskId,
				reason: `undo ${applied.mutation_id}`,
				targetMutationId: applied.mutation_id ?? "",
				sourcePath: targetPath,
				destinationPath: targetPath,
			});
			rmSync(join(root, targetPath));
			expect(recoverEvolutionApplies(root)).toEqual([]);
			expect(readApplyJournal(root).at(-1)?.phase).toBe("rollback");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rollback rejects a commit bound to another project identity", () => {
		const { root, proposal, task } = fixture();
		try {
			applyEvolutionProposal(applyInput(root, proposal, task));
			const nextProjectId = "7b7d91ca-496b-4f0c-8537-5c4993810d15";
			const configPath = join(root, ".afol", "config.json");
			const config = JSON.parse(readFileSync(configPath, "utf8"));
			config.project.id = nextProjectId;
			writeFileSync(configPath, JSON.stringify(config));
			expect(() =>
				rollbackEvolutionProposal({
					root,
					projectId: nextProjectId,
					proposalId: proposal.id,
					invocationClass: "explicit_local",
					session: task.session,
					taskId: task.taskId,
					now: NOW,
				}),
			).toThrow("committed project identity mismatch");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("recovery compensates a stale prepared commit and leaves no artifact", () => {
		const { root, proposal, task } = fixture();
		try {
			const applied = applyEvolutionProposal(applyInput(root, proposal, task));
			const events = readApplyJournal(root);
			rewriteApplyJournal(
				root,
				events.filter((event) => event.phase === "prepare"),
			);
			const configPath = join(root, ".afol", "config.json");
			const config = JSON.parse(readFileSync(configPath, "utf8"));
			config.project.id = "7b7d91ca-496b-4f0c-8537-5c4993810d15";
			writeFileSync(configPath, JSON.stringify(config));
			expect(recoverEvolutionApplies(root)).toMatchObject([
				{ status: "blocked", mutation_id: applied.mutation_id },
			]);
			expect(existsSync(join(root, requireTargetPath(applied)))).toBe(false);
			expect(readApplyJournal(root).at(-1)?.phase).toBe("abort");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("recovery fails closed on validator-version mismatch after compensation", () => {
		const { root, proposal, task } = fixture();
		try {
			const applied = applyEvolutionProposal(applyInput(root, proposal, task));
			const prepare = readApplyJournal(root).find(
				(event) => event.phase === "prepare",
			);
			if (!prepare) throw new Error("missing prepare fixture");
			const binding = {
				...prepare.binding,
				validator_version:
					"old-validator" as typeof prepare.binding.validator_version,
			};
			const base = {
				...prepare,
				binding,
				payload_digest: applyDigest(binding),
			};
			const { event_digest: _ignored, ...withoutDigest } = base;
			rewriteApplyJournal(root, [
				{ ...base, event_digest: applyDigest(withoutDigest) },
			]);
			expect(() => recoverEvolutionApplies(root)).toThrow(
				"unsupported evolution apply policy or validator",
			);
			expect(existsSync(join(root, requireTargetPath(applied)))).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("recovery rejects unrelated unmatched prepares and drift", () => {
		const { root, proposal, task } = fixture();
		try {
			const applied = applyEvolutionProposal(applyInput(root, proposal, task));
			const events = readApplyJournal(root);
			rewriteApplyJournal(
				root,
				events.filter((event) => event.phase === "prepare"),
			);
			appendMutationRecord(root, {
				id: createMutationId(),
				ts: NOW.toISOString(),
				kind: "patch",
				status: "prepared",
				dryRun: false,
				session: task.session,
				taskId: task.taskId,
				reason: "unrelated",
				sourcePath: "docs/lessons/entries/unrelated.md",
				beforeExisted: false,
				beforeHash: "",
				afterHash: "a".repeat(64),
			});
			expect(() => recoverEvolutionApplies(root)).toThrow(
				"mutation journal corrupt",
			);
			rmSync(mutationJournalPath(root));
			writeFileSync(join(root, requireTargetPath(applied)), "drift\n");
			expect(() => recoverEvolutionApplies(root)).toThrow("recovery drift");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
