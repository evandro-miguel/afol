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
import { runPatchMutation } from "../commands/file/mutations/patch";
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
	writeApplyJournalLine,
} from "../services/evolution/apply-journal";
import {
	applyEvolutionProposal,
	recoverEvolutionApplies,
	rollbackEvolutionProposal,
} from "../services/evolution/apply-service";
import { appendObservationJournalEvent } from "../services/evolution/observation-journal";
import { validateEvolutionProjectionCheckpoint } from "../services/evolution/projection-checkpoint";
import {
	appendMutationRecord,
	createMutationId,
	mutationJournalPath,
} from "../services/mutations/journal";
import { newWorkstream, startTask } from "../services/workbench/lifecycle";
import { removeEvolutionTestRoot } from "./evolution-test-support";
import { symlinkTestSupport } from "./symlink-test-support";

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

function rewriteMutationJournal(
	root: string,
	transform: (
		rows: Array<Record<string, unknown>>,
	) => Array<Record<string, unknown>>,
): void {
	const path = mutationJournalPath(root);
	const rows = readFileSync(path, "utf8")
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line) as Record<string, unknown>);
	writeFileSync(
		path,
		`${transform(rows)
			.map((row) => JSON.stringify(row))
			.join("\n")}\n`,
	);
}

function requireTargetPath(result: { target_path?: string }): string {
	if (!result.target_path) throw new Error("missing target path fixture");
	return result.target_path;
}

function assertCheckpoint(root: string): void {
	const db = openEvolutionDb(evolutionDbPath(root));
	try {
		validateEvolutionProjectionCheckpoint({
			root,
			db,
			projectId: PROJECT_ID,
		});
	} finally {
		db.close();
	}
}

describe("evolution apply service", () => {
	test("keeps a durable terminal authoritative when checkpoint refresh fails", () => {
		const { root, proposal, task } = fixture();
		try {
			let checkpointCalls = 0;
			const result = applyEvolutionProposal({
				...applyInput(root, proposal, task),
				checkpointWriter: () => {
					checkpointCalls += 1;
					if (checkpointCalls > 1)
						throw new Error("checkpoint unavailable after terminal");
					return {} as never;
				},
			});
			expect(result.status).toBe("applied");
			expect(checkpointCalls).toBeGreaterThanOrEqual(2);
			expect(existsSync(join(root, requireTargetPath(result)))).toBe(true);
			expect(
				readApplyJournal(root).some(
					(event) =>
						event.phase === "commit" &&
						event.binding.mutation_id === result.mutation_id,
				),
			).toBe(true);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("duplicate apply repairs a checkpoint left stale by a transient terminal failure", () => {
		const { root, proposal, task } = fixture();
		try {
			let checkpointCalls = 0;
			const first = applyEvolutionProposal({
				...applyInput(root, proposal, task),
				checkpointWriter: () => {
					checkpointCalls += 1;
					if (checkpointCalls > 1)
						throw new Error("transient terminal checkpoint failure");
					return {} as never;
				},
			});
			expect(first).toMatchObject({ status: "applied", duplicate: false });
			expect(() => assertCheckpoint(root)).toThrow(/checkpoint is stale/i);

			const retry = applyEvolutionProposal(applyInput(root, proposal, task));
			expect(retry).toMatchObject({
				status: "applied",
				duplicate: true,
				mutation_id: first.mutation_id,
			});
			assertCheckpoint(root);
			expect(
				readApplyJournal(root).filter(
					(event) =>
						event.phase === "commit" &&
						event.binding.mutation_id === first.mutation_id,
				),
			).toHaveLength(1);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("duplicate rollback repairs a checkpoint left stale by a transient terminal failure", () => {
		const { root, proposal, task } = fixture();
		try {
			const applied = applyEvolutionProposal(applyInput(root, proposal, task));
			const first = rollbackEvolutionProposal({
				root,
				projectId: PROJECT_ID,
				proposalId: proposal.id,
				invocationClass: "explicit_local",
				session: task.session,
				taskId: task.taskId,
				now: NOW,
				checkpointWriter: () => {
					throw new Error("transient rollback checkpoint failure");
				},
			});
			expect(first).toMatchObject({
				status: "rolled_back",
				mutation_id: applied.mutation_id,
			});
			expect(first.duplicate).toBeUndefined();
			expect(() => assertCheckpoint(root)).toThrow(/checkpoint is stale/i);

			const retry = rollbackEvolutionProposal({
				root,
				projectId: PROJECT_ID,
				proposalId: proposal.id,
				invocationClass: "explicit_local",
				session: task.session,
				taskId: task.taskId,
				now: NOW,
			});
			expect(retry).toMatchObject({
				status: "rolled_back",
				duplicate: true,
				mutation_id: applied.mutation_id,
			});
			assertCheckpoint(root);
			expect(
				readApplyJournal(root).filter(
					(event) =>
						event.phase === "rollback" &&
						event.binding.mutation_id === applied.mutation_id,
				),
			).toHaveLength(1);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("fails before artifact mutation when the prepare checkpoint cannot refresh", () => {
		const { root, proposal, task } = fixture();
		try {
			expect(() =>
				applyEvolutionProposal({
					...applyInput(root, proposal, task),
					checkpointWriter: () => {
						throw new Error("prepare checkpoint unavailable");
					},
				}),
			).toThrow("prepare checkpoint unavailable");
			const events = readApplyJournal(root);
			expect(events.map((event) => event.phase)).toEqual(["prepare", "abort"]);
			expect(existsSync(join(root, events[0]?.binding.target_path ?? ""))).toBe(
				false,
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

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
			expect(
				rollbackEvolutionProposal({
					root,
					projectId: PROJECT_ID,
					proposalId: proposal.id,
					invocationClass: "explicit_local",
					session: task.session,
					taskId: task.taskId,
					now: NOW,
				}),
			).toMatchObject({ status: "rolled_back", duplicate: true });
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("apply journal completes short writes and durably truncates a failed append", () => {
		let bytesWritten = 0;
		let fsyncs = 0;
		const completeIo = {
			write: (
				_fd: number,
				_buffer: Buffer,
				_offset: number,
				length: number,
			) => {
				const written = Math.min(3, length);
				bytesWritten += written;
				return written;
			},
			fsync: () => {
				fsyncs += 1;
			},
			truncate: () => {
				throw new Error("unexpected truncate");
			},
		};
		writeApplyJournalLine(1, Buffer.from("abcdefgh"), 4, completeIo);
		expect(bytesWritten).toBe(8);
		expect(fsyncs).toBe(1);

		const truncations: number[] = [];
		let writes = 0;
		const failingIo = {
			write: () => {
				writes += 1;
				if (writes === 2) throw new Error("simulated write failure");
				return 2;
			},
			fsync: () => {
				fsyncs += 1;
			},
			truncate: (_fd: number, length: number) => {
				truncations.push(length);
			},
		};
		expect(() =>
			writeApplyJournalLine(1, Buffer.from("abcdef"), 17, failingIo),
		).toThrow("simulated write failure");
		expect(truncations).toEqual([17]);
		expect(fsyncs).toBe(2);
	});

	test("apply journal rejects an incomplete final record before append", () => {
		const { root, proposal, task } = fixture();
		try {
			applyEvolutionProposal(applyInput(root, proposal, task));
			const journal = join(
				root,
				".afol",
				"data",
				"events",
				"evolution",
				"applies.jsonl",
			);
			const content = readFileSync(journal);
			writeFileSync(journal, content.subarray(0, content.length - 1));
			expect(() => readApplyJournal(root)).toThrow("incomplete final record");
			expect(() =>
				applyEvolutionProposal(applyInput(root, proposal, task)),
			).toThrow("incomplete final record");
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("new-file expectation is rechecked under the resource lock", () => {
		const { root, task } = fixture();
		const path = "docs/lessons/entries/race.md";
		try {
			expect(() =>
				runPatchMutation(
					{
						command: "pt",
						path,
						appendText: "owned by apply\n",
						dryRun: false,
						json: false,
						session: task.session,
						taskId: task.taskId,
						reason: "race fixture",
						expectedBeforeExisted: false,
					},
					root,
					{
						afterInitialRead: () => {
							mkdirSync(join(root, "docs", "lessons", "entries"), {
								recursive: true,
							});
							writeFileSync(join(root, path), "concurrent writer\n");
						},
					},
				),
			).toThrow("stale-before-existence");
			expect(readFileSync(join(root, path), "utf8")).toBe(
				"concurrent writer\n",
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("duplicate apply fails closed when its mutation record is absent", () => {
		const { root, proposal, task } = fixture();
		try {
			const applied = applyEvolutionProposal(applyInput(root, proposal, task));
			rewriteMutationJournal(root, (rows) =>
				rows.filter((row) => row.id !== applied.mutation_id),
			);
			expect(() =>
				applyEvolutionProposal(applyInput(root, proposal, task)),
			).toThrow("mutation binding mismatch");
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("duplicate apply fails closed on mutation binding drift or undo", () => {
		const drift = fixture();
		try {
			const applied = applyEvolutionProposal(
				applyInput(drift.root, drift.proposal, drift.task),
			);
			rewriteMutationJournal(drift.root, (rows) =>
				rows.map((row) =>
					row.id === applied.mutation_id
						? { ...row, sourcePath: "docs/lessons/entries/other.md" }
						: row,
				),
			);
			expect(() =>
				applyEvolutionProposal(
					applyInput(drift.root, drift.proposal, drift.task),
				),
			).toThrow("mutation binding mismatch");
		} finally {
			removeEvolutionTestRoot(drift.root);
		}

		const undone = fixture();
		try {
			const applied = applyEvolutionProposal(
				applyInput(undone.root, undone.proposal, undone.task),
			);
			appendMutationRecord(undone.root, {
				id: createMutationId(),
				ts: NOW.toISOString(),
				kind: "undo",
				status: "committed",
				dryRun: false,
				session: undone.task.session,
				taskId: undone.task.taskId,
				reason: `undo ${applied.mutation_id}`,
				targetMutationId: applied.mutation_id ?? "",
				sourcePath: requireTargetPath(applied),
				destinationPath: requireTargetPath(applied),
			});
			expect(() =>
				applyEvolutionProposal(
					applyInput(undone.root, undone.proposal, undone.task),
				),
			).toThrow("mutation was undone");
		} finally {
			removeEvolutionTestRoot(undone.root);
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
			removeEvolutionTestRoot(root);
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
			removeEvolutionTestRoot(root);
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
			if (!symlinkTestSupport.available) return;
			symlinkSync(alias, journal);
			expect(() => readApplyJournal(root)).toThrow(
				/symlink|reparse|regular file/i,
			);
			rmSync(journal);
			writeFileSync(journal, bytes);
			expect(readFileSync(alias)).toEqual(bytes);
			void first;
		} finally {
			removeEvolutionTestRoot(root);
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
			removeEvolutionTestRoot(root);
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
			removeEvolutionTestRoot(root);
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
			removeEvolutionTestRoot(root);
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
			removeEvolutionTestRoot(root);
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
			removeEvolutionTestRoot(root);
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
			removeEvolutionTestRoot(root);
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
			removeEvolutionTestRoot(root);
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
			removeEvolutionTestRoot(root);
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
			removeEvolutionTestRoot(root);
		}
	});
});
