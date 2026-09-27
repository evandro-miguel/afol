import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runEvolveCommand } from "../commands/evolve";
import {
	defaultOperationContext,
	localNonInteractiveOperationContext,
} from "../core/operation-context";
import { listSkills } from "../services/catalog/skills";
import { buildContextBundle } from "../services/context/bundler";
import { rebuildSectionIndex } from "../services/context/section-index";
import {
	appendProductionDayAllocation,
	evolutionDbPath,
	openEvolutionDb,
} from "../services/evolution";
import { inspectEvolutionArtifacts } from "../services/evolution/artifact-inspection";
import { applyAssistedProposal } from "../services/evolution/assisted-proposal-apply";
import {
	appendAssistedProposalEvent,
	readAssistedProposalJournal,
	storePreparedAssistedProposal,
} from "../services/evolution/assisted-proposal-journal";
import { prepareAssistedProposalPreview } from "../services/evolution/assisted-proposal-packet";
import { productionDayJournalPath } from "../services/evolution/journal";
import { lessonJournalPath } from "../services/evolution/lesson-records";
import { observationJournalPath } from "../services/evolution/observation-journal";
import { removeEvolutionTestRoot } from "./evolution-test-support";

const PROJECT_ID = "3e1a5f2c-9b44-4d7a-8f21-64c0f0a11b77";
const NOW = new Date("2026-09-26T12:00:00.000Z");
const KERNEL_PATH = join(process.cwd(), "cli", "main.ts");

function hash(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

function writeConfig(
	root: string,
	extraPaths: Record<string, string> = {},
): void {
	writeFileSync(
		join(root, ".afol", "config.json"),
		JSON.stringify({
			schema_version: 1,
			project: {
				id: PROJECT_ID,
				name: "stage-a-regressions",
				timezone: "UTC",
			},
			paths: {
				wb_dir: ".afol/wb",
				agents_dir: ".agents",
				library_dir: ".afol/library",
				...extraPaths,
			},
		}),
	);
}

function fixtureRoot(extraPaths: Record<string, string> = {}): string {
	const root = mkdtempSync(join(tmpdir(), "stage-a-regressions-"));
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	writeConfig(root, extraPaths);
	const session = "S-stage-a";
	const sessionDir = join(root, ".afol", "wb", session);
	mkdirSync(sessionDir, { recursive: true });
	writeFileSync(
		join(sessionDir, `${session}_report_1.md`),
		"A validation command failed while the task remained open.\n",
	);
	return root;
}

// R1 fixture: a backfill-eligible session whose failed completion evidence
// would be ingested by `evolve backfill --run` if the caller were allowed.
function backfillRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "stage-a-backfill-r1-"));
	const workbench = join(root, ".afol", "wb");
	mkdirSync(join(workbench, ".locks"), { recursive: true });
	mkdirSync(join(workbench, "_archive"), { recursive: true });
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
			project: {
				id: PROJECT_ID,
				name: "stage-a-backfill-r1",
				timezone: "UTC",
			},
			paths: {
				external_dir: ".afol/external",
				wb_dir: ".afol/wb",
				agents_dir: ".agents",
				library_dir: ".afol/library",
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
	const session = "S-backfill-r1";
	const sessionDir = join(workbench, session);
	mkdirSync(sessionDir, { recursive: true });
	writeFileSync(
		join(sessionDir, `${session}_task_01.md`),
		`---\ndoc_type: "workbench_task"\nid: "${session}_task_01"\nsession_id: "${session}"\nstatus: "open"\ncreated_at: "2026-08-11T12:00:00.000Z"\nupdated_at: "2026-08-11T12:00:00.000Z"\n---\n\n## State Board\n\n| Task | State | Owner | Notes |\n| --- | --- | --- | --- |\n| T-01 | in_progress | agent | interrupted |\n`,
	);
	writeFileSync(
		join(sessionDir, ".evidence.jsonl"),
		`${JSON.stringify({
			id: "E-backfill-r1-failure",
			task_id: "T-01",
			project_id: PROJECT_ID,
			session_id: session,
			created_at: "2026-08-11T12:00:00.000Z",
			command: "bun test",
			result: "failed",
			provenance: "observed",
			exit_code: 1,
			purpose: "completion",
			authorization_type: "execution",
		})}\n`,
	);
	return root;
}

function evidenceReference(root: string): Record<string, unknown> {
	const session = "S-stage-a";
	const reference = inspectEvolutionArtifacts({
		root,
		sessions: [session],
		artifacts: [`${session}_report_1.md`],
	}).items[0]?.artifacts[0];
	if (!reference) throw new Error("fixture artifact reference was not emitted");
	return {
		session_id: reference.session_id,
		path: reference.path,
		anchor: reference.anchor,
		content_digest: reference.content_digest,
		digest_scope: reference.digest_scope,
		...(reference.source_identity_digest
			? { source_identity_digest: reference.source_identity_digest }
			: {}),
	};
}

function writePacket(root: string, packet: Record<string, unknown>): string {
	const packetPath = join(root, "proposal.json");
	writeFileSync(packetPath, JSON.stringify(packet));
	return packetPath;
}

function basePacket(
	root: string,
	operations: unknown[],
	kind = "code",
	additional: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		schema_version: 1,
		kind,
		observed_fact: "The session records a failed validation command.",
		hypothesis: "A bounded change may prevent the repeat failure.",
		evidence_refs: [evidenceReference(root)],
		intervention: { operations },
		alternative: "Keep the current behavior and clarify its limits.",
		validation_plan: {
			commands: ["bun test"],
			expected: "The focused validation passes.",
		},
		...additional,
	};
}

function prepareAndStore(
	root: string,
	packet: Record<string, unknown>,
): ReturnType<typeof prepareAssistedProposalPreview> {
	const preview = prepareAssistedProposalPreview({
		root,
		packetPath: writePacket(root, packet),
	});
	storePreparedAssistedProposal(root, preview, NOW);
	return preview;
}

function approve(
	root: string,
	preview: ReturnType<typeof prepareAssistedProposalPreview>,
	payload: Record<string, unknown> = {},
): void {
	appendAssistedProposalEvent({
		root,
		projectId: PROJECT_ID,
		eventType: "decision",
		proposalId: preview.proposal_id,
		versionDigest: preview.version_digest,
		problemIdentity: preview.problem_identity,
		payload: { decision: "approve", ...payload },
		now: NOW,
	});
}

function apply(
	root: string,
	preview: ReturnType<typeof prepareAssistedProposalPreview>,
) {
	return applyAssistedProposal({
		root,
		projectId: PROJECT_ID,
		proposalId: preview.proposal_id,
		versionDigest: preview.version_digest,
		session: "S-active",
		taskId: "T-01",
		now: NOW,
	});
}

function appendLessonVersion(
	root: string,
	input: { lessonId: string; versionId: string },
): { fieldSetDigest: string } {
	const fields = {
		problem: "An interrupted proposal needs an exact lesson adoption receipt.",
		applies_when: "cli/services/evolution/assisted-proposal-apply.ts",
		preventive_action: `Verify approved lesson version ${input.versionId}.`,
		verify: "bun test cli/tests/evolve-repair-regressions.test.ts",
	};
	const fieldSetDigest = hash(JSON.stringify(fields));
	const path = lessonJournalPath(root);
	mkdirSync(dirname(path), { recursive: true });
	appendFileSync(
		path,
		`${JSON.stringify({
			record_type: "lesson_record",
			schema_version: 1,
			version_id: input.versionId,
			lesson_id: input.lessonId,
			project_id: PROJECT_ID,
			session_id: "S-lesson-source",
			version: 1,
			created_at: NOW.toISOString(),
			fields,
			work_type: {},
			supersedes: null,
			contradicts: [],
			field_set_digest: fieldSetDigest,
			source_refs: [],
		})}\n`,
	);
	return { fieldSetDigest };
}

// R4 fixture: many production-day journal events that all share one local
// date. Distinct local dates are the decay unit, so the age must stay 0.
function guidanceFixture(): string {
	const root = mkdtempSync(join(tmpdir(), "stage-a-guidance-"));
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
				name: "stage-a-guidance",
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

function addSameDateProductionEvents(root: string, count: number): void {
	const db = openEvolutionDb(evolutionDbPath(root));
	try {
		for (let index = 1; index <= count; index += 1) {
			const session = `S-same-date-${index}`;
			const evidenceId = `E-SAME-DATE-${index}`;
			// Every event lands on the same UTC calendar date.
			const createdAt = new Date(
				Date.UTC(2026, 7, 1, 12, index % 60, index % 60),
			).toISOString();
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

describe("stage A regressions for the standalone records and evolve repair contract", () => {
	test("R1: real no-TTY backfill --run is refused without DB, journal, or cursor writes", async () => {
		const root = backfillRoot();
		try {
			const session = "S-backfill-r1";
			const taskPath = join(
				root,
				".afol",
				"wb",
				session,
				`${session}_task_01.md`,
			);
			const taskBefore = readFileSync(taskPath, "utf8");

			// A real CLI process without a TTY resolves to a trusted local
			// non-interactive caller; it must not run the writing backfill.
			const proc = spawnSync(
				"bun",
				[KERNEL_PATH, "evolve", "backfill", "--run", "--limit", "1", "--json"],
				{ cwd: root, encoding: "utf8" },
			);
			expect(proc.status).toBe(2);
			const payload = JSON.parse(proc.stdout as string) as {
				ok: boolean;
				action: string;
				exit_code: number;
				error: { code: string };
			};
			expect(payload).toMatchObject({
				ok: false,
				action: "evolve.backfill.run",
				exit_code: 2,
				error: { code: "approval-required" },
			});

			// Refusal leaves zero durable writes: no evolution DB (and with it
			// no backfill cursors), no observation journal, no production-day
			// journal, and the session files untouched.
			expect(existsSync(evolutionDbPath(root))).toBe(false);
			expect(existsSync(observationJournalPath(root))).toBe(false);
			expect(existsSync(productionDayJournalPath(root))).toBe(false);
			expect(readFileSync(taskPath, "utf8")).toBe(taskBefore);

			// The authorized interactive path still ingests the same session.
			const stdout: string[] = [];
			const exitCode = await runEvolveCommand(
				"backfill",
				["--run", "--limit", "1", "--json"],
				root,
				{
					stdout: (message) => stdout.push(message),
					stderr: () => {},
				},
				defaultOperationContext(),
			);
			expect(exitCode).toBe(0);
			expect(readFileSync(observationJournalPath(root), "utf8")).toContain(
				"E-backfill-r1-failure",
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("R2: shared inventory lists and reads a supplementary artifact nested under artifacts/", () => {
		const root = fixtureRoot();
		try {
			const sessionDir = join(root, ".afol", "wb", "S-stage-a");
			const nestedDir = join(sessionDir, "artifacts");
			mkdirSync(nestedDir, { recursive: true });
			writeFileSync(
				join(nestedDir, "20260926-handoff.md"),
				"Supplementary handoff retained by the closed-session review path.\n",
			);

			const listed = inspectEvolutionArtifacts({
				root,
				sessions: ["S-stage-a"],
			});
			expect(
				listed.items[0]?.artifacts.some((artifact) =>
					artifact.path.endsWith("artifacts/20260926-handoff.md"),
				),
			).toBe(true);

			const read = inspectEvolutionArtifacts({
				root,
				sessions: ["S-stage-a"],
				artifacts: ["20260926-handoff.md"],
			});
			expect(
				read.items[0]?.artifacts.some((artifact) =>
					artifact.path.endsWith("artifacts/20260926-handoff.md"),
				),
			).toBe(true);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("R3: approved replace writes the literal approved bytes including $&, $$, $' and $`", () => {
		const root = fixtureRoot();
		try {
			const target = "src/cost-report.md";
			const targetPath = join(root, target);
			mkdirSync(dirname(targetPath), { recursive: true });
			const before = "quarterly-anchor-value";
			const after = "cost[$&]$$pre`fixed'$";
			const original = `Report header.\n${before}\nReport footer.\n`;
			writeFileSync(targetPath, original);

			const preview = prepareAndStore(root, {
				...basePacket(root, [
					{
						type: "replace_text",
						target,
						expected_sha256: hash(original),
						before,
						after,
					},
				]),
			});
			approve(root, preview);
			const result = apply(root, preview);
			expect(result.applied).toBe(true);

			const written = readFileSync(targetPath, "utf8");
			// Literal semantics: the approved bytes, with no ECMAScript
			// replacement-pattern interpretation.
			expect(written).toBe(original.split(before).join(after));
			expect(written).toContain(after);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("R4: twenty same-date production events advance zero decay days since approval", () => {
		const root = guidanceFixture();
		try {
			addSameDateProductionEvents(root, 21);
			const seed = "4";
			const versionDigest = seed.repeat(64).slice(0, 64);
			const proposalId = `EP-${versionDigest.slice(0, 24)}`;
			const preview = {
				read_only: true,
				approved: false,
				project_id: PROJECT_ID,
				kind: "contextual_preference",
				proposal_id: proposalId,
				version_digest: versionDigest,
				problem_identity: "e".repeat(64),
				intervention_identity: "f".repeat(64),
				observed_fact: "Canonical evidence supports this bounded proposal.",
				hypothesis: "The approved guidance may improve matching work.",
				evidence_refs: [],
				intervention: {
					operations: [
						{
							type: "publish_guidance",
							statement: "Prefer short focused validation runs.",
						},
					],
				},
				alternative: "Keep current behavior.",
				validation_plan: {
					commands: ["bun test"],
					expected: "Tests pass.",
					executed: false,
				},
				target_baselines: [],
				problem_reopen_link: null,
			};
			storePreparedAssistedProposal(root, preview as never, NOW);
			appendAssistedProposalEvent({
				root,
				projectId: PROJECT_ID,
				eventType: "decision",
				proposalId,
				versionDigest,
				problemIdentity: preview.problem_identity,
				payload: {
					decision: "approve",
					// Ordinal 1 is the single distinct local date.
					approval_production_day: 1,
				},
				now: NOW,
			});
			appendAssistedProposalEvent({
				root,
				projectId: PROJECT_ID,
				eventType: "applied",
				proposalId,
				versionDigest,
				problemIdentity: preview.problem_identity,
				payload: {
					targets: ["project"],
					mutation_ids: [],
					session: "S-apply",
					task_id: "T-01",
					applied_at: NOW.toISOString(),
				},
				now: NOW,
			});

			const bundle = buildContextBundle(root, {
				surface: "general",
				role: "worker",
				mode: "balanced",
			});
			const guidance = bundle.approved_guidance;
			// 21 journal events share one distinct local date, so the current
			// production day is 1 and the preference has aged zero days.
			expect(guidance?.current_production_day).toBe(1);
			expect(guidance?.items).toContainEqual(
				expect.objectContaining({
					proposal_id: proposalId,
					production_day_age: 0,
					preference_freshness: 1,
				}),
			);
			expect(guidance?.omitted ?? []).not.toContainEqual(
				expect.objectContaining({
					proposal_id: proposalId,
					reason: "preference_expired",
				}),
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("R5: directed read returns a marker placed beyond the first 450 characters", () => {
		const root = fixtureRoot();
		try {
			const session = "S-stage-a";
			const filePath = join(
				root,
				".afol",
				"wb",
				session,
				`${session}_report_1.md`,
			);
			const marker = "NEEDLE-BEYOND-EXCERPT-BOUNDARY";
			const filler = "x".repeat(1024);
			const content = `${filler}\n${marker}\n${filler}\n`;
			writeFileSync(filePath, content);

			const read = inspectEvolutionArtifacts({
				root,
				sessions: [session],
				artifacts: [`${session}_report_1.md`],
			});
			// The read surface must be able to return the relevant text past
			// the summary boundary, not only the file's first lines.
			expect(JSON.stringify(read)).toContain(marker);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("R6: proposal targets honor the configured skills_dir root", () => {
		const root = fixtureRoot({ skills_dir: ".afol/adm/skills" });
		try {
			const skillPath = join(
				root,
				".afol",
				"adm",
				"skills",
				"tooltip",
				"SKILL.md",
			);
			mkdirSync(dirname(skillPath), { recursive: true });
			const before = "Keep the guidance short.\n";
			writeFileSync(
				skillPath,
				`---\nname: tooltip\ndescription: Stage A fixture skill\n---\n\n${before}`,
			);
			// The catalog resolves the configured root; the packet must agree.
			expect(listSkills(root).map((skill) => skill.name)).toContain("tooltip");

			const target = ".afol/adm/skills/tooltip/SKILL.md";
			const preview = prepareAssistedProposalPreview({
				root,
				packetPath: writePacket(
					root,
					basePacket(
						root,
						[
							{
								type: "replace_text",
								target,
								expected_sha256: hash(readFileSync(skillPath, "utf8")),
								before: "Keep the guidance short.",
								after: "Keep the guidance short and specific.",
							},
						],
						"skill_update",
					),
				),
			});
			expect(preview.intervention.operations[0]).toMatchObject({
				type: "replace_text",
				target,
			});
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("R7: prepare refuses oversized output without persisting the proposal first", async () => {
		const root = fixtureRoot();
		try {
			const operations: Array<Record<string, unknown>> = [];
			for (let index = 1; index <= 8; index += 1) {
				const target = `src/bulk-${index}.md`;
				const targetPath = join(root, target);
				mkdirSync(dirname(targetPath), { recursive: true });
				const before = `stage-a-anchor-${index}`.padEnd(32, "-");
				const original = `Header ${index}.\n${before}\nFooter ${index}.\n`;
				writeFileSync(targetPath, original);
				operations.push({
					type: "replace_text",
					target,
					expected_sha256: hash(original),
					before,
					// 240 multibyte characters inflate the summarized receipt.
					after: `£`.repeat(240),
				});
			}
			const packetPath = writePacket(root, {
				...basePacket(root, operations),
				observed_fact: `£`.repeat(240),
				hypothesis: `£`.repeat(240),
				alternative: `£`.repeat(240),
			});

			const stdout: string[] = [];
			const stderr: string[] = [];
			const exitCode = await runEvolveCommand(
				"proposal",
				["prepare", "--packet", packetPath, "--json"],
				root,
				{
					stdout: (message) => stdout.push(message),
					stderr: (message) => stderr.push(message),
				},
				localNonInteractiveOperationContext(),
				NOW,
			);
			const events = readAssistedProposalJournal(root, PROJECT_ID);
			const prepared = events.filter(
				(event) => event.event_type === "prepared",
			);
			// A refusal must leave no durable prepared version behind, and a
			// success receipt must stay within the bounded output contract.
			expect(exitCode === 0 || prepared.length === 0).toBe(true);
			if (exitCode === 0) {
				expect(prepared.length).toBe(1);
				const receipt = stdout[0] ?? "";
				expect(Buffer.byteLength(receipt, "utf8")).toBeLessThanOrEqual(8_000);
			}
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("R8: prepare rejects a replacement whose result exceeds the target size limit", () => {
		const root = fixtureRoot();
		try {
			const target = "src/near-limit.md";
			const targetPath = join(root, target);
			mkdirSync(dirname(targetPath), { recursive: true });
			const before = "expansion-anchor-marker-0123456789abcdef";
			const filler = "y".repeat(250 * 1024 - before.length - 2);
			const original = `${before}\n${filler}\n`;
			writeFileSync(targetPath, original);
			const after = "z".repeat(16_000);
			// original (~250 KiB) - before + after exceeds the 256 KiB cap.
			expect(
				Buffer.byteLength(original, "utf8") -
					Buffer.byteLength(before, "utf8") +
					Buffer.byteLength(after, "utf8"),
			).toBeGreaterThan(256 * 1024);

			expect(() =>
				prepareAssistedProposalPreview({
					root,
					packetPath: writePacket(
						root,
						basePacket(root, [
							{
								type: "replace_text",
								target,
								expected_sha256: hash(original),
								before,
								after,
							},
						]),
					),
				}),
			).toThrow();
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("R9: proposal show exposes the exact lesson identity before approval", async () => {
		const root = fixtureRoot();
		try {
			const lessonId = "L-aaaaaaaaaaaaaaaaaaaa";
			const versionId = "LV-bbbbbbbbbbbbbbbbbbbb";
			const lesson = appendLessonVersion(root, { lessonId, versionId });
			const preview = prepareAndStore(
				root,
				basePacket(
					root,
					[
						{
							type: "apply_lesson",
							lesson_id: lessonId,
							version_id: versionId,
							field_set_digest: lesson.fieldSetDigest,
						},
					],
					"lesson_adoption",
				),
			);

			const stdout: string[] = [];
			const exitCode = await runEvolveCommand(
				"proposal",
				["show", preview.proposal_id, "--json"],
				root,
				{
					stdout: (message) => stdout.push(message),
					stderr: (message) => stdout.push(message),
				},
				defaultOperationContext(),
				NOW,
			);
			expect(exitCode).toBe(0);
			const payload = JSON.parse(stdout[0] ?? "{}");
			const data = payload.data ?? payload;
			// The operator must see which exact lesson version approval binds.
			expect(data.operations?.[0]).toMatchObject({
				lesson_id: lessonId,
				version_id: versionId,
				field_set_digest: lesson.fieldSetDigest,
			});
		} finally {
			removeEvolutionTestRoot(root);
		}
	});
});
