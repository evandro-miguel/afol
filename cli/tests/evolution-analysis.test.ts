import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	truncateSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	publicAnalysisDto,
	runEvolveCommand,
	writeAnalysisPayload,
} from "../commands/evolve";
import { envelopeOk, stringifyEnvelope } from "../core/envelope";
import {
	agentOperationContext,
	defaultOperationContext,
	remoteOperationContext,
	resolveOperationContext,
} from "../core/operation-context";
import { resolveCommand } from "../router";
import {
	analyzeEvolution as analyzeEvolutionCore,
	analyzeEvolutionProject,
	appendObservationJournalEvent,
	appendProductionDayAllocation,
	evolutionDbPath,
	MAX_ANALYSIS_DATABASE_BYTES,
	MAX_ANALYSIS_JOURNAL_BYTES,
	MAX_ANALYSIS_JOURNAL_LINES,
	MAX_EVOLUTION_CRITICAL_ALERTS,
	MAX_EVOLUTION_PROPOSALS,
	MAX_EVOLUTION_RANGE_OBSERVATIONS,
	normalizeObservationRecord,
	observationJournalPath,
	openEvolutionDb,
	preferenceJournalPath,
	productionDayJournalPath,
	redactSensitiveText,
	scorecardFromObservations,
	suggestionJournalPath,
} from "../services/evolution";
import type { SuggestionCandidate } from "../services/evolution/suggestion-model";
import {
	releaseEvolutionTestHandles,
	removeEvolutionTestRoot,
} from "./evolution-test-support";

const PROJECT_ID = "db97afff-2026-4eb1-a799-5d34fd505267";

function analyzeEvolution(
	input: Parameters<typeof analyzeEvolutionCore>[0],
): ReturnType<typeof analyzeEvolutionCore> {
	if (input.observations) return analyzeEvolutionCore(input);
	const observations = (input.candidates ?? []).map((item, index) =>
		normalizeObservationRecord({
			project_id: input.projectId,
			id: `O-fixture-${item.id}`,
			kind: "workflow_friction",
			session_id: item.related_session_ids[0] ?? `S-fixture-${index}`,
			production_day_sequence: 1,
			task_type: item.task_type ?? "documentation",
			impact: item.impact,
			created_at: `2026-07-21T12:${String(index).padStart(2, "0")}:00.000Z`,
			journal_event_id: `J-fixture-${index}`,
			source_refs: item.source_refs,
		}),
	);
	return analyzeEvolutionCore({ ...input, observations });
}

function candidate(index: number, critical = false): SuggestionCandidate {
	return {
		id: `SUG-${index}`,
		project_id: PROJECT_ID,
		local_date: "2026-07-21",
		cluster_id: `cluster-${index}`,
		task_type: "documentation",
		fingerprint_version: 2,
		problem: "workflow friction recurred",
		risk: critical ? "critical" : "low",
		validation: "Compare the next three comparable sessions",
		recommendation: "Add a bounded workflow check",
		related_session_ids: [`S-${index}`],
		occurrence_count: 3,
		distinct_production_day_count: 2,
		impact: "rework",
		evidence_digest: `${index}`.padStart(64, "0"),
		base_confidence: 0.8,
		confidence: 0.8,
		rejected_receipt_count: 0,
		confidence_reason: "no rejected receipts",
		score: 100 - index,
		pending_count: 0,
		critical,
		state: "available",
		source_refs: [{ id: `E-${index}`, kind: "evidence" }],
	};
}

function configure(
	root: string,
	enabled = false,
	minimumProductionDays = 2,
): void {
	mkdirSync(join(root, ".afol"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "config.json"),
		JSON.stringify({
			schema_version: 1,
			project: { id: PROJECT_ID, name: "analysis-fixture", timezone: "UTC" },
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
					minimum_distinct_production_days: minimumProductionDays,
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
		"utf8",
	);
}

function git(root: string, args: string[]): string {
	const result = spawnSync(
		"git",
		[
			"-c",
			"user.name=AFOL Test",
			"-c",
			"user.email=afol@example.invalid",
			"-C",
			root,
			...args,
		],
		{ encoding: "utf8", shell: false },
	);
	if (result.status !== 0) throw new Error("git fixture command failed");
	return result.stdout.trim();
}

function populatedFixture(impact = "rework"): {
	root: string;
	base: string;
	head: string;
} {
	const root = mkdtempSync(join(tmpdir(), "evolution-analysis-populated-"));
	configure(root, true, 1);
	git(root, ["init", "-q"]);
	writeFileSync(join(root, "fixture.txt"), "one\n", "utf8");
	git(root, ["add", "fixture.txt"]);
	git(root, ["commit", "-qm", "first"]);
	const base = git(root, ["rev-parse", "HEAD"]);
	writeFileSync(join(root, "fixture.txt"), "two\n", "utf8");
	git(root, ["commit", "-qam", "second"]);
	const head = git(root, ["rev-parse", "HEAD"]);
	const sessionDir = join(root, ".afol", "wb", "S-day");
	mkdirSync(sessionDir, { recursive: true });
	writeFileSync(
		join(sessionDir, ".evidence.jsonl"),
		`${JSON.stringify({
			id: "E-day",
			project_id: PROJECT_ID,
			session_id: "S-day",
			created_at: "2026-07-21T12:00:00.000Z",
			result: "passed",
			provenance: "observed",
			exit_code: 0,
		})}\n`,
		"utf8",
	);
	const db = openEvolutionDb(evolutionDbPath(root));
	try {
		appendProductionDayAllocation({
			root,
			db,
			projectId: PROJECT_ID,
			timezone: "UTC",
			sessionId: "S-day",
			evidenceId: "E-day",
		});
		for (const [index, commit] of [base, base, head].entries()) {
			const observation = normalizeObservationRecord({
				project_id: PROJECT_ID,
				id: `O-${index}`,
				kind: "workflow_friction",
				session_id: `S-${index}`,
				production_day_sequence: 1,
				task_type: "analysis",
				impact,
				created_at: `2026-07-21T12:0${index}:00.000Z`,
				journal_event_id: `J-${index}`,
				source_refs: [{ id: commit, kind: "commit" }],
			});
			appendObservationJournalEvent({
				root,
				db,
				projectId: PROJECT_ID,
				observation,
				sourceRefs: observation.source_refs,
				eventId: `OBS-${index}`,
			});
		}
	} finally {
		db.close();
	}
	return { root, base, head };
}

function snapshotReadOnlyState(root: string): string {
	const paths = [
		evolutionDbPath(root),
		`${evolutionDbPath(root)}-wal`,
		`${evolutionDbPath(root)}-shm`,
		observationJournalPath(root),
		preferenceJournalPath(root),
		productionDayJournalPath(root),
		suggestionJournalPath(root),
		join(root, ".afol", "wb", ".locks"),
	];
	return JSON.stringify(
		paths.map((path) => ({
			path,
			exists: existsSync(path),
			mtime: existsSync(path) ? statSync(path).mtimeMs : null,
			bytes:
				existsSync(path) && statSync(path).isFile() ? readFileSync(path) : null,
			entries:
				existsSync(path) && statSync(path).isDirectory()
					? readdirSync(path).sort()
					: null,
		})),
	);
}

describe("evolution analysis previews", () => {
	test("excludes v1 clusters while retaining current v2 proposals", () => {
		const legacy = { ...candidate(0), fingerprint_version: 1 };
		const current = { ...candidate(1), fingerprint_version: 2 };
		const analysis = analyzeEvolution({
			projectId: PROJECT_ID,
			state: { ok: true },
			candidates: [legacy, current],
		});
		expect(analysis.legacy_cluster_count).toBe(1);
		expect(analysis.proposals).toHaveLength(1);
		expect(analysis.proposals[0]?.fingerprint_version).toBe(2);
		const dto = publicAnalysisDto(
			analysis as unknown as Record<string, unknown>,
			true,
		);
		expect(dto).toMatchObject({
			legacy_cluster_count: 1,
			recovery_action: "afol evolve repair --json",
		});
	});
	test("reviews any valid bounded proposal, not only displayed proposals", () => {
		const lowerRankedId = analyzeEvolution({
			projectId: PROJECT_ID,
			state: { ok: true },
			candidates: [candidate(4)],
		}).proposals[0]?.id;
		expect(lowerRankedId).toBeTruthy();
		const reviewed = analyzeEvolution({
			projectId: PROJECT_ID,
			state: { ok: true },
			candidates: Array.from({ length: 6 }, (_, index) => candidate(index)),
			...(lowerRankedId ? { reviewProposalId: lowerRankedId } : {}),
		});
		expect(reviewed.proposals).toHaveLength(1);
		expect(reviewed.proposals[0]?.id).toBe(lowerRankedId);
		expect(reviewed.proposals[0]?.rank).toBe(5);
		expect(
			analyzeEvolution({
				projectId: PROJECT_ID,
				state: { ok: true },
				candidates: Array.from({ length: 6 }, (_, index) => candidate(index)),
				reviewProposalId: "EVO-unknown",
			}).proposals,
		).toEqual([]);
	});

	test("enforces structural limits independently", () => {
		expect(MAX_EVOLUTION_RANGE_OBSERVATIONS).toBe(1_000);
		const base = {
			project_id: PROJECT_ID,
			id: "O-limits",
			kind: "workflow_friction",
			session_id: "S-limits",
			production_day_sequence: 0,
			task_type: "analysis",
			impact: "rework",
			created_at: "2026-07-21T00:00:00.000Z",
			journal_event_id: "J-limits",
			source_refs: [{ id: "E-limits", kind: "evidence" }],
		};
		expect(() =>
			normalizeObservationRecord({
				...base,
				source_refs: Array.from({ length: 17 }, () => ({
					id: "E-ref",
					kind: "evidence",
				})),
			}),
		).toThrow("source refs exceed the limit");
		expect(() =>
			normalizeObservationRecord({ ...base, command: "x".repeat(4_001) }),
		).toThrow("text limit");
		expect(() =>
			normalizeObservationRecord({
				...base,
				kind: "k".repeat(500),
				error_code: "e".repeat(500),
				test: "t".repeat(500),
				command: "c".repeat(500),
				path_module: "p".repeat(500),
				operation: "o".repeat(500),
				workflow_step: "w".repeat(500),
				stack_digest: "s".repeat(500),
				provider: "v".repeat(500),
			}),
		).toThrow("normalized fields exceed the limit");
	});

	test("router blocked analysis DTO is safe for every admitted caller", async () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-analysis-router-"));
		configure(root);
		try {
			const route = resolveCommand(["evolve", "analyze", "--json"]);
			if (route.kind !== "subcommand")
				throw new Error("analysis route missing");
			expect(route).toEqual({
				kind: "subcommand",
				group: "evolve",
				action: "analyze",
				args: ["--json"],
			});
			const contexts = [
				resolveOperationContext(route.args, {}).ctx,
				resolveOperationContext(route.args, { AFOL_AGENT: "0" }).ctx,
				agentOperationContext(),
				remoteOperationContext(),
			];
			const payloads: Array<Record<string, unknown>> = [];
			for (const operationContext of contexts) {
				const output: string[] = [];
				expect(
					await runEvolveCommand(
						route.action,
						route.args,
						root,
						{ stdout: (value) => output.push(value), stderr: () => {} },
						operationContext,
					),
				).toBe(0);
				payloads.push(JSON.parse(output[0] ?? "{}").data);
			}
			const firstPayload = payloads[0];
			if (!firstPayload) throw new Error("analysis parity payload missing");
			for (const payload of payloads) {
				expect(Object.keys(payload).sort()).toEqual(
					Object.keys(firstPayload).sort(),
				);
				expect(JSON.stringify(payload)).not.toMatch(
					/(project|session_id|evidence|source|commit|ref|path|digest|token|db)/i,
				);
			}
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("populated analysis redacts adversarial credentials and paths", async () => {
		const privateLinuxPath = [
			"/",
			"home",
			"/",
			"operator",
			"/private.txt",
		].join("");
		const privateWindowsPath = [
			"C:",
			"\\\\",
			"Users",
			"\\\\",
			"operator",
			"\\\\private.txt",
		].join("");
		const { root } = populatedFixture(
			['Authorization: "Bearer', 'persisted-secret"', privateLinuxPath].join(
				" ",
			),
		);
		try {
			const redacted = redactSensitiveText(
				[
					'JSON {"authorization": "Bearer',
					'json-secret"} client secret = spaced-secret',
					privateWindowsPath,
				].join(" "),
				{ redactPaths: true },
			);
			expect(redacted).toContain("<redacted>");
			expect(redacted).toContain("<redacted-path>");
			expect(redacted).not.toMatch(/json-secret|spaced-secret|private\.txt/i);
			const output: string[] = [];
			expect(
				await runEvolveCommand(
					"analyze",
					["--json"],
					root,
					{ stdout: (value) => output.push(value), stderr: () => {} },
					defaultOperationContext(),
				),
			).toBe(0);
			const data = JSON.parse(output[0] ?? "{}").data;
			expect(JSON.stringify(data)).not.toContain("persisted-secret");
			expect(JSON.stringify(data)).not.toContain(privateLinuxPath);
			expect(data.proposals[0]?.impact).toBe("unknown");
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("trusted proposal previews expose bounded decision context while restricted callers stay redacted", async () => {
		const { root } = populatedFixture();
		try {
			const invoke = async (
				operationContext:
					| ReturnType<typeof defaultOperationContext>
					| ReturnType<typeof agentOperationContext>,
			) => {
				const output: string[] = [];
				expect(
					await runEvolveCommand(
						"analyze",
						["--json"],
						root,
						{ stdout: (value) => output.push(value), stderr: () => {} },
						operationContext,
					),
				).toBe(0);
				expect(Buffer.byteLength(output[0] ?? "", "utf8")).toBeLessThanOrEqual(
					4_000,
				);
				return JSON.parse(output[0] ?? "{}").data;
			};

			const trusted = await invoke(defaultOperationContext());
			const proposal = trusted.proposals[0];
			expect(proposal.id).toMatch(/^EVO-[a-f0-9]{32}$/);
			expect(proposal.distinct_session_count).toBe(3);
			expect(proposal.related_session_count).toBe(3);
			expect(proposal.evidence_ref_count).toBe(2);
			expect(proposal.evidence_refs).toEqual([
				expect.objectContaining({ id: expect.any(String), kind: "commit" }),
				expect.objectContaining({ id: expect.any(String), kind: "commit" }),
			]);
			expect(proposal.evidence_refs).toHaveLength(2);
			expect(proposal.related_session_ids).toHaveLength(3);
			expect(proposal.evidence_refs[0]).not.toHaveProperty("digest");
			expect(proposal.baseline).toEqual(
				expect.objectContaining({
					window: "recorded",
					observation_count: 3,
					minimum_comparable_sessions: 3,
					production_day_window: 5,
				}),
			);
			expect(proposal.targets).toEqual(
				expect.objectContaining({
					minimum_comparable_sessions: 3,
					production_day_window: 5,
					state: "canary",
					metrics: expect.any(Object),
				}),
			);
			expect(proposal.approval_policy).toBe("explicit");
			expect(proposal.approval_surface).toBe("governed_workbench");
			expect(proposal).toMatchObject({
				target_kind: "behavior",
				classification: "needs_review",
				approval_required: true,
				execution_surface: "governed_workbench",
				provenance_digest: expect.stringMatching(/^[a-f0-9]{64}$/),
			});
			expect(proposal.target_refs).toEqual([proposal.evidence_refs[0]]);
			expect(proposal).toMatchObject({
				target_ref_count: 2,
				target_refs_truncated: true,
			});

			const restricted = await invoke(agentOperationContext());
			const restrictedProposal = restricted.proposals[0];
			expect(restrictedProposal.related_session_ids).toHaveLength(3);
			expect(restrictedProposal.evidence_refs).toHaveLength(2);
			expect(restrictedProposal).toMatchObject({
				id: expect.stringMatching(/^EVO-[a-f0-9]{32}$/),
				target_kind: "behavior",
				classification: "needs_review",
				approval_required: true,
				execution_surface: "governed_workbench",
				provenance_digest: expect.stringMatching(/^[a-f0-9]{64}$/),
			});
			for (const key of [
				"baseline",
				"targets",
				"approval_policy",
				"approval_surface",
			]) {
				expect(restrictedProposal).not.toHaveProperty(key);
			}
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("trusted evidence references reject secret-like identifiers", () => {
		const unsafeCandidate = {
			...candidate(0),
			source_refs: [
				{ id: "E-safe", kind: "evidence", authority: "token-secretvalue" },
				{ id: "sk-abcdefghijklmnop", kind: "evidence" },
				{ id: "token-supersecretvalue", kind: "evidence" },
				{ id: "E-secret-kind", kind: "access-token" },
			],
		};
		const analysis = analyzeEvolution({
			projectId: PROJECT_ID,
			state: { ok: true },
			candidates: [unsafeCandidate],
		});
		const dto = publicAnalysisDto(
			analysis as unknown as Record<string, unknown>,
			false,
		);
		expect(dto.proposals[0]?.evidence_refs).toEqual([
			{ id: "E-safe", kind: "evidence" },
		]);
		expect(JSON.stringify(dto)).not.toMatch(
			/sk-abcdefghijklmnop|token-(?:supersecretvalue|secretvalue)|access-token/i,
		);
	});

	test("maximum trusted proposal and alert envelope stays within the public output budget", () => {
		const maximalText = "🧪界é".repeat(128);
		const maximalIdentifier = (prefix: string) =>
			`${prefix}${"a".repeat(128 - prefix.length)}`;
		const maximalCandidates = Array.from({ length: 3 }, (_, index) => ({
			...candidate(index),
			cluster_id: `cluster-max-${index}`,
			problem: maximalText,
			recommendation: maximalText,
			risk: maximalText,
			validation: maximalText,
			source_refs: Array.from({ length: 4 }, (_, refIndex) => ({
				id: maximalIdentifier(`E${index}${refIndex}-`),
				kind: maximalIdentifier("kind-"),
				authority: maximalIdentifier("auth-"),
			})),
		}));
		const maximalCriticalAlerts = Array.from({ length: 3 }, (_, index) => ({
			...candidate(index, true),
			problem: maximalText,
			risk: maximalText,
			validation: maximalText,
		}));
		const analysis = analyzeEvolution({
			projectId: PROJECT_ID,
			state: { ok: true },
			candidates: maximalCandidates,
			criticalAlerts: maximalCriticalAlerts,
		});
		const dto = publicAnalysisDto(
			analysis as unknown as Record<string, unknown>,
			false,
		);
		const output = stringifyEnvelope(
			envelopeOk(dto, { action: "evolve.analyze" }),
		);
		expect(dto.proposals).toHaveLength(1);
		expect(dto).toMatchObject({
			proposal_available_count: 3,
			proposal_truncated: true,
			critical_alerts_truncated: true,
		});
		expect(
			dto.proposals.every(
				(proposal) =>
					proposal.evidence_ref_count === 4 &&
					proposal.evidence_refs?.length === 4 &&
					proposal.baseline?.window === "recorded" &&
					proposal.targets?.state === "canary" &&
					proposal.approval_policy === "explicit" &&
					proposal.approval_surface === "governed_workbench" &&
					Buffer.byteLength(proposal.evidence_refs[0]?.id ?? "", "utf8") <=
						64 &&
					Buffer.byteLength(proposal.evidence_refs[0]?.kind ?? "", "utf8") <=
						32 &&
					Buffer.byteLength(
						proposal.evidence_refs[0]?.authority ?? "",
						"utf8",
					) <= 32 &&
					Object.values(proposal.evidence_refs[0] ?? {}).every(
						(value) => typeof value === "string",
					),
			),
		).toBe(true);
		expect(dto.critical_alerts).toHaveLength(1);
		expect(dto.critical_alert_count).toBe(3);
		expect(dto.critical_alert_pending_count).toBe(0);
		for (const proposal of dto.proposals) {
			for (const field of [
				proposal.problem,
				proposal.recommendation,
				proposal.risk,
				proposal.validation,
			]) {
				expect(Buffer.byteLength(field, "utf8")).toBeLessThanOrEqual(160);
				expect(field).not.toContain("\uFFFD");
			}
		}
		for (const alert of dto.critical_alerts) {
			for (const field of [alert.problem, alert.risk, alert.validation]) {
				expect(Buffer.byteLength(field, "utf8")).toBeLessThanOrEqual(128);
				expect(field).not.toContain("\uFFFD");
			}
		}
		expect(Buffer.byteLength(output, "utf8")).toBeLessThanOrEqual(4_000);
		const written: string[] = [];
		expect(() =>
			writeAnalysisPayload(
				{ stdout: (value) => written.push(value), stderr: () => {} },
				true,
				"evolve.analyze",
				analysis as unknown as Record<string, unknown>,
				defaultOperationContext(),
			),
		).not.toThrow();
		expect(Buffer.byteLength(written[0] ?? "", "utf8")).toBeLessThanOrEqual(
			4_000,
		);
	});

	test("missing WAL and SHM stay absent during read-only analysis", () => {
		const { root } = populatedFixture();
		try {
			const dbPath = evolutionDbPath(root);
			releaseEvolutionTestHandles();
			rmSync(`${dbPath}-wal`, { force: true });
			rmSync(`${dbPath}-shm`, { force: true });
			const before = snapshotReadOnlyState(root);
			expect(() => analyzeEvolutionProject(root)).toThrow(
				"requires stable WAL and SHM auxiliaries",
			);
			expect(snapshotReadOnlyState(root)).toBe(before);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("fails closed when the DB target is replaced before opening", () => {
		const { root } = populatedFixture();
		try {
			const dbPath = evolutionDbPath(root);
			const replacement = `${dbPath}.replacement`;
			releaseEvolutionTestHandles();
			for (const suffix of ["-wal", "-shm"])
				writeFileSync(`${dbPath}${suffix}`, "", "utf8");
			expect(() =>
				analyzeEvolutionProject(
					root,
					{},
					{
						beforeOpen: (path) => {
							releaseEvolutionTestHandles();
							renameSync(path, replacement);
							writeFileSync(path, readFileSync(replacement));
						},
					},
				),
			).toThrow("state changed during read-only analysis");
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("enforces fixed DB and canonical journal limits before health validation", () => {
		const oversizedDb = populatedFixture();
		try {
			truncateSync(
				evolutionDbPath(oversizedDb.root),
				MAX_ANALYSIS_DATABASE_BYTES + 1,
			);
			expect(() => analyzeEvolutionProject(oversizedDb.root)).toThrow(
				"database state exceeds the size limit",
			);
		} finally {
			removeEvolutionTestRoot(oversizedDb.root);
		}
		const oversizedJournal = populatedFixture();
		try {
			writeFileSync(
				observationJournalPath(oversizedJournal.root),
				"x".repeat(MAX_ANALYSIS_JOURNAL_BYTES + 1),
				"utf8",
			);
			expect(() => analyzeEvolutionProject(oversizedJournal.root)).toThrow(
				"journals exceed the size limit",
			);
		} finally {
			removeEvolutionTestRoot(oversizedJournal.root);
		}
		const oversizedLines = populatedFixture();
		try {
			writeFileSync(
				observationJournalPath(oversizedLines.root),
				`${"{}\n".repeat(MAX_ANALYSIS_JOURNAL_LINES + 1)}`,
				"utf8",
			);
			expect(() => analyzeEvolutionProject(oversizedLines.root)).toThrow(
				"journals exceed the size limit",
			);
		} finally {
			removeEvolutionTestRoot(oversizedLines.root);
		}
	});

	test("populated facade recomputes scoped recurrence and keeps all four modes read-only", async () => {
		const { root, base, head } = populatedFixture();
		try {
			const full = analyzeEvolutionProject(root, {
				now: new Date("2026-07-21T12:00:00.000Z"),
			});
			expect(full.status).toBe("available");
			expect(full.proposals.length).toBeGreaterThan(0);
			const scoped = analyzeEvolutionProject(root, {
				mode: "after_merge",
				base,
				head,
				commitIds: [head],
				now: new Date("2026-07-21T12:00:00.000Z"),
			});
			expect(scoped.proposals).toEqual([]);
			const reviewId = full.proposals[0]?.id;
			expect(reviewId).toBeTruthy();
			const before = snapshotReadOnlyState(root);
			for (const [action, args] of [
				["analyze", ["--json"]],
				["weekly", ["--json"]],
				["after-merge", [`${base}..${head}`, "--json"]],
				["review", [reviewId ?? "", "--json"]],
			] as const) {
				const output: string[] = [];
				const errors: string[] = [];
				const exitCode = await runEvolveCommand(
					action,
					[...args],
					root,
					{
						stdout: (value) => output.push(value),
						stderr: (value) => errors.push(value),
					},
					defaultOperationContext(),
				);
				expect(exitCode, `${action}: ${errors.join("; ")}`).toBe(0);
				const data = JSON.parse(output[0] ?? "{}").data;
				expect(Buffer.byteLength(output[0] ?? "", "utf8")).toBeLessThanOrEqual(
					4_000,
				);
				expect(data).not.toHaveProperty("project_id");
				expect(snapshotReadOnlyState(root), action).toBe(before);
			}
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("after-merge facade excludes mixed commit refs from every baseline metric", () => {
		const { root, base, head } = populatedFixture();
		const sessionDir = join(root, ".afol", "wb", "S-mixed-range");
		mkdirSync(sessionDir, { recursive: true });
		writeFileSync(
			join(sessionDir, ".evidence.jsonl"),
			`${JSON.stringify({
				id: "E-mixed-range",
				project_id: PROJECT_ID,
				session_id: "S-mixed-range",
				created_at: "2026-07-22T12:00:00.000Z",
				result: "passed",
				provenance: "observed",
				exit_code: 0,
			})}\n`,
			"utf8",
		);
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			appendProductionDayAllocation({
				root,
				db,
				projectId: PROJECT_ID,
				timezone: "UTC",
				sessionId: "S-mixed-range",
				evidenceId: "E-mixed-range",
			});
			const observation = normalizeObservationRecord({
				project_id: PROJECT_ID,
				id: "O-mixed-range",
				kind: "test_failure",
				session_id: "S-mixed-range",
				production_day_sequence: 2,
				task_type: "analysis",
				impact: "rework",
				created_at: "2026-07-22T12:00:00.000Z",
				journal_event_id: "J-mixed-range",
				source_refs: [
					{ id: head, kind: "commit" },
					{ id: base, kind: "commit" },
				],
			});
			appendObservationJournalEvent({
				root,
				db,
				projectId: PROJECT_ID,
				observation,
				sourceRefs: observation.source_refs,
				eventId: "OBS-mixed-range",
			});
		} finally {
			db.close();
		}
		try {
			const analysis = analyzeEvolutionProject(root, {
				mode: "after_merge",
				base,
				head,
				commitIds: [head],
				now: new Date("2026-07-22T12:00:00.000Z"),
			});
			expect(analysis.baseline.observation_count).toBe(1);
			expect(analysis.baseline.production_day_count).toBe(1);
			expect(analysis.scorecard.outcome.observed_results?.value).toBe(1);
			expect(analysis.scorecard.outcome.production_days?.value).toBe(1);
			expect(analysis.scorecard.regressions.failed_again?.value).toBe(0);
			expect(analysis.baseline.scorecard).toEqual(analysis.scorecard);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("after-merge ignores hostile git overrides and does not mutate .git", async () => {
		const { root, base, head } = populatedFixture();
		const fakeGit = join(root, "fake-git");
		const marker = join(root, "fake-git-used");
		const tracePath = join(root, "hostile-trace.log");
		const trace2Path = join(root, "hostile-trace2.log");
		const socketMarker = join(root, "hostile-socket-used");
		writeFileSync(
			fakeGit,
			`#!/bin/sh\ntouch ${JSON.stringify(marker)}\nexit 1\n`,
			"utf8",
		);
		chmodSync(fakeGit, 0o700);
		const gitPaths = ["HEAD", "config", "index", "packed-refs"].map((name) =>
			join(root, ".git", name),
		);
		const before = JSON.stringify(
			gitPaths.map((path) => ({
				path,
				exists: existsSync(path),
				mtime: existsSync(path) ? statSync(path).mtimeMs : null,
				bytes: existsSync(path) ? readFileSync(path) : null,
			})),
		);
		const hostileKeys = [
			"PATH",
			"GIT_DIR",
			"GIT_WORK_TREE",
			"GIT_CONFIG_COUNT",
			"GIT_CONFIG_KEY_0",
			"GIT_CONFIG_VALUE_0",
			"GIT_CONFIG_PARAMETERS",
			"GIT_TRACE",
			"GIT_TRACE2_EVENT",
			"GIT_SSH_COMMAND",
			"GIT_ASKPASS",
			"GIT_OBJECT_DIRECTORY",
			"GIT_ALTERNATE_OBJECT_DIRECTORIES",
			"GIT_EXEC_PATH",
		];
		const original = Object.fromEntries(
			hostileKeys.map((key) => [key, process.env[key]]),
		);
		/*
		 * Keep every hostile override in the child-environment test, including
		 * trace paths and command/socket hooks that would write outside .git.
		 */
		const hostile = {
			PATH: root,
			GIT_DIR: join(root, "outside-git"),
			GIT_WORK_TREE: join(root, "outside-worktree"),
			GIT_CONFIG_COUNT: "1",
			GIT_CONFIG_KEY_0: "core.sshCommand",
			GIT_CONFIG_VALUE_0: "touch hostile-config-used",
			GIT_CONFIG_PARAMETERS: "'core.sshCommand=touch hostile-parameters'",
			GIT_TRACE: tracePath,
			GIT_TRACE2_EVENT: trace2Path,
			GIT_SSH_COMMAND: `touch ${socketMarker}`,
			GIT_ASKPASS: `touch ${socketMarker}`,
			GIT_OBJECT_DIRECTORY: join(root, "hostile-objects"),
			GIT_ALTERNATE_OBJECT_DIRECTORIES: join(root, "hostile-alternates"),
			GIT_EXEC_PATH: join(root, "hostile-exec"),
		};
		for (const [key, value] of Object.entries(hostile))
			process.env[key] = value;
		try {
			const output: string[] = [];
			expect(
				await runEvolveCommand(
					"after-merge",
					[`${base}..${head}`, "--json"],
					root,
					{ stdout: (value) => output.push(value), stderr: () => {} },
					defaultOperationContext(),
				),
			).toBe(0);
			expect(existsSync(marker)).toBe(false);
			expect(existsSync(tracePath)).toBe(false);
			expect(existsSync(trace2Path)).toBe(false);
			expect(existsSync(socketMarker)).toBe(false);
			expect(
				JSON.stringify(
					gitPaths.map((path) => ({
						path,
						exists: existsSync(path),
						mtime: existsSync(path) ? statSync(path).mtimeMs : null,
						bytes: existsSync(path) ? readFileSync(path) : null,
					})),
				),
			).toBe(before);
		} finally {
			for (const [key, value] of Object.entries(original)) {
				if (value === undefined) delete process.env[key];
				else process.env[key] = value;
			}
			removeEvolutionTestRoot(root);
		}
	});

	test("bounds proposals and critical alerts without mutating input", () => {
		const candidates = Array.from({ length: 8 }, (_, index) =>
			candidate(index),
		);
		const criticalAlerts = Array.from({ length: 8 }, (_, index) =>
			candidate(index, true),
		);
		const analysis = analyzeEvolution({
			projectId: PROJECT_ID,
			state: { ok: true },
			candidates,
			criticalAlerts,
			now: new Date("2026-07-21T12:00:00.000Z"),
		});
		expect(analysis.proposals).toHaveLength(MAX_EVOLUTION_PROPOSALS);
		expect(analysis.pending_count).toBe(5);
		expect(analysis.critical_alerts).toHaveLength(
			MAX_EVOLUTION_CRITICAL_ALERTS,
		);
		expect(analysis.critical_alert_count).toBe(8);
		expect(analysis.critical_alert_pending_count).toBe(5);
		expect(candidates).toHaveLength(8);
	});

	test("is deterministic and fails closed for mixed after-merge evidence", () => {
		const head = "a".repeat(40);
		const old = "b".repeat(40);
		const mixed = {
			...candidate(1),
			source_refs: [
				{ id: head, kind: "commit" },
				{ id: old, kind: "commit" },
			],
		};
		const input = {
			projectId: PROJECT_ID,
			state: { ok: true },
			mode: "after_merge" as const,
			base: old,
			head,
			commitIds: [head],
			candidates: [mixed],
		};
		const first = analyzeEvolution(input);
		const second = analyzeEvolution(input);
		expect(first.digest).toBe(second.digest);
		expect(first.proposals).toEqual([]);
	});

	test("scorecard covers recorded observations and blocks stale state", () => {
		const observations = Array.from({ length: 3 }, (_, index) =>
			normalizeObservationRecord({
				project_id: PROJECT_ID,
				id: `O-${index}`,
				kind: "workflow_friction",
				session_id: `S-${index}`,
				production_day_sequence: index + 1,
				task_type: "docs",
				impact: "rework",
				created_at: `2026-07-${10 + index}T00:00:00.000Z`,
				journal_event_id: `J-${index}`,
				source_refs: [{ id: `E-${index}`, kind: "evidence" }],
			}),
		);
		const scorecard = scorecardFromObservations(observations, 3);
		expect(scorecard.outcome.observed_results?.value).toBe(3);
		expect(scorecard.outcome.production_days?.value).toBe(3);
		const blocked = analyzeEvolution({
			projectId: PROJECT_ID,
			state: {
				ok: false,
				stale: true,
				findings: [{ severity: "fail", message: "projection is stale" }],
			},
			candidates: [candidate(1)],
			criticalAlerts: [candidate(2, true), candidate(3, true)],
		});
		expect(blocked.status).toBe("blocked");
		expect(blocked.proposals).toEqual([]);
		expect(blocked.critical_alerts).toEqual([]);
		expect(blocked.critical_alert_count).toBe(0);
		expect(blocked.critical_alert_pending_count).toBe(0);
	});

	test("weekly and after-merge commands stay bounded and read-only", async () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-analysis-modes-"));
		configure(root);
		try {
			git(root, ["init", "-q"]);
			writeFileSync(join(root, "fixture.txt"), "one\n", "utf8");
			git(root, ["add", "fixture.txt"]);
			git(root, ["commit", "-qm", "first"]);
			const base = git(root, ["rev-parse", "HEAD"]);
			writeFileSync(join(root, "fixture.txt"), "two\n", "utf8");
			git(root, ["commit", "-qam", "second"]);
			const head = git(root, ["rev-parse", "HEAD"]);
			for (const [action, args, mode] of [
				["weekly", ["--json"], "weekly"],
				["after-merge", [`${base}..${head}`, "--json"], "after_merge"],
			] as const) {
				const output: string[] = [];
				const exitCode = await runEvolveCommand(
					action,
					[...args],
					root,
					{ stdout: (value) => output.push(value), stderr: () => {} },
					agentOperationContext(),
				);
				expect(exitCode).toBe(0);
				const data = JSON.parse(output[0] ?? "{}").data;
				expect(data.mode).toBe(mode);
				expect(JSON.stringify(data).length).toBeLessThan(4_000);
			}
			expect(existsSync(join(root, ".afol", "state", "evolution.db"))).toBe(
				false,
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("restricted analysis is read-only and redacted at the command boundary", async () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-analysis-boundary-"));
		configure(root);
		try {
			const output: string[] = [];
			const exitCode = await runEvolveCommand(
				"analyze",
				["--json"],
				root,
				{ stdout: (value) => output.push(value), stderr: () => {} },
				agentOperationContext(),
			);
			expect(exitCode).toBe(0);
			const payload = JSON.parse(output[0] ?? "{}");
			expect(payload.data.status).toBe("blocked");
			expect(payload.data.recovery_action).toBe("afol evolve status --json");
			expect(payload.data).not.toHaveProperty("project_id");
			expect(JSON.stringify(payload)).not.toContain(PROJECT_ID);
			expect(existsSync(join(root, ".afol", "state", "evolution.db"))).toBe(
				false,
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});
});
