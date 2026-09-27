import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	appendFileSync,
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { inspectEvolutionArtifacts } from "../services/evolution/artifact-inspection";
import { applyAssistedProposal } from "../services/evolution/assisted-proposal-apply";
import {
	appendAssistedProposalEvent,
	storePreparedAssistedProposal,
} from "../services/evolution/assisted-proposal-journal";
import { prepareAssistedProposalPreview } from "../services/evolution/assisted-proposal-packet";
import { lessonJournalPath } from "../services/evolution/lesson-records";
import { loadMutationJournalStrict } from "../services/mutations/journal";
import { removeEvolutionTestRoot } from "./evolution-test-support";

const PROJECT_ID = "5d95605d-efb6-4c97-9dad-831bdd7906c0";
const NOW = new Date("2026-09-25T18:00:00.000Z");

function hash(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

function fixtureRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "assisted-proposal-apply-"));
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	mkdirSync(join(root, "src"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "config.json"),
		JSON.stringify({
			schema_version: 1,
			project: { id: PROJECT_ID, name: "apply-fixture", timezone: "UTC" },
			paths: {
				wb_dir: ".afol/wb",
				agents_dir: ".agents",
				library_dir: ".afol/library",
			},
		}),
	);
	const evidenceDir = join(root, ".afol", "wb", "S-evidence");
	mkdirSync(evidenceDir, { recursive: true });
	writeFileSync(
		join(evidenceDir, "S-evidence_report_1.md"),
		"A failed validation left the implementation unchanged.\n",
	);
	return root;
}

function prepare(
	root: string,
	operations: Record<string, unknown>[],
	kind = "code",
): ReturnType<typeof prepareAssistedProposalPreview> {
	const reference = inspectEvolutionArtifacts({
		root,
		sessions: ["S-evidence"],
		artifacts: ["S-evidence_report_1.md"],
	}).items[0]?.artifacts[0];
	if (!reference) throw new Error("fixture evidence was not found");
	const evidenceReference = {
		session_id: reference.session_id,
		path: reference.path,
		anchor: reference.anchor,
		content_digest: reference.content_digest,
		digest_scope: reference.digest_scope,
		...(reference.source_identity_digest
			? { source_identity_digest: reference.source_identity_digest }
			: {}),
	};
	const packetPath = join(root, "proposal.json");
	writeFileSync(
		packetPath,
		JSON.stringify({
			schema_version: 1,
			kind,
			observed_fact: "The evidence records a failed validation.",
			hypothesis: "A small code change may resolve the failure.",
			evidence_refs: [evidenceReference],
			intervention: { operations },
			alternative: "Keep the current behavior.",
			validation_plan: {
				commands: ["bun test cli/tests/example.test.ts"],
				expected: "The focused test passes.",
			},
		}),
	);
	const preview = prepareAssistedProposalPreview({ root, packetPath });
	storePreparedAssistedProposal(root, preview, NOW);
	return preview;
}

function approve(
	root: string,
	preview: ReturnType<typeof prepareAssistedProposalPreview>,
): void {
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
}

function appendLessonVersion(
	root: string,
	input: {
		lessonId: string;
		versionId: string;
		version: number;
		supersedes: string | null;
	},
): { versionId: string; fieldSetDigest: string } {
	const fields = {
		problem: "An interrupted proposal needs an exact lesson adoption receipt.",
		applies_when: "cli/services/evolution/assisted-proposal-apply.ts",
		preventive_action: `Verify approved lesson version ${input.version}.`,
		verify: "bun test cli/tests/assisted-proposal-apply.test.ts",
	};
	const fieldSetDigest = hash(
		JSON.stringify({
			applies_when: fields.applies_when,
			preventive_action: fields.preventive_action,
			problem: fields.problem,
			verify: fields.verify,
		}),
	);
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
			version: input.version,
			created_at: NOW.toISOString(),
			fields,
			work_type: {},
			supersedes: input.supersedes,
			contradicts: [],
			field_set_digest: fieldSetDigest,
			source_refs: [],
		})}\n`,
	);
	return { versionId: input.versionId, fieldSetDigest };
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

describe("assisted proposal apply", () => {
	test("refuses before approval and binds application to the exact version", () => {
		const root = fixtureRoot();
		try {
			const target = "src/rule.ts";
			const targetPath = join(root, target);
			const before = "export const limit = 5;\n";
			writeFileSync(targetPath, before);
			const preview = prepare(root, [
				{
					type: "replace_text",
					target,
					expected_sha256: hash(before),
					before: "limit = 5",
					after: "limit = 6",
				},
			]);
			expect(() => apply(root, preview)).toThrow("requires approval");
			expect(readFileSync(targetPath, "utf8")).toBe(before);
			approve(root, preview);
			expect(() =>
				applyAssistedProposal({
					root,
					projectId: PROJECT_ID,
					proposalId: preview.proposal_id,
					versionDigest: "f".repeat(64),
					session: "S-active",
					taskId: "T-01",
					now: NOW,
				}),
			).toThrow("missing or stale");
			expect(readFileSync(targetPath, "utf8")).toBe(before);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("applies only approved operations and records an idempotent mutation receipt", () => {
		const root = fixtureRoot();
		try {
			const target = "src/rule.ts";
			const targetPath = join(root, target);
			const before = "export const limit = 5;\n";
			writeFileSync(targetPath, before);
			const preview = prepare(root, [
				{
					type: "replace_text",
					target,
					expected_sha256: hash(before),
					before: "limit = 5",
					after: "limit = 6",
				},
			]);
			approve(root, preview);
			const result = apply(root, preview);
			expect(result.applied).toBe(true);
			expect(result.duplicate).toBe(false);
			expect(result.targets).toEqual([target]);
			expect(readFileSync(targetPath, "utf8")).toBe(
				"export const limit = 6;\n",
			);
			const mutations = loadMutationJournalStrict(root);
			expect(mutations.issues).toEqual([]);
			expect(mutations.records.map((record) => record.status)).toEqual([
				"prepared",
				"committed",
			]);
			expect(apply(root, preview).duplicate).toBe(true);
			expect(readFileSync(targetPath, "utf8")).toBe(
				"export const limit = 6;\n",
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("applies an exact lesson adoption without recording observed-use mutations", () => {
		const root = fixtureRoot();
		try {
			const lessonId = "L-11111111111111111111";
			const versionId = "LV-22222222222222222222";
			const version = appendLessonVersion(root, {
				lessonId,
				versionId,
				version: 1,
				supersedes: null,
			});
			const preview = prepare(
				root,
				[
					{
						type: "apply_lesson",
						lesson_id: lessonId,
						version_id: version.versionId,
						field_set_digest: version.fieldSetDigest,
					},
				],
				"lesson_adoption",
			);
			approve(root, preview);

			const result = apply(root, preview);
			const adoption = {
				lesson_id: lessonId,
				version_id: version.versionId,
				field_set_digest: version.fieldSetDigest,
			};
			expect(result.applied).toBe(true);
			expect(result.targets).toEqual([`lesson:${lessonId}`]);
			expect(result.mutation_ids).toEqual([]);
			expect(result.lesson_adoptions).toEqual([adoption]);
			expect(loadMutationJournalStrict(root).records).toEqual([]);
			const duplicate = apply(root, preview);
			expect(duplicate.duplicate).toBe(true);
			expect(duplicate.lesson_adoptions).toEqual([adoption]);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("rechecks the exact lesson version after approval", () => {
		const root = fixtureRoot();
		try {
			const lessonId = "L-33333333333333333333";
			const first = appendLessonVersion(root, {
				lessonId,
				versionId: "LV-44444444444444444444",
				version: 1,
				supersedes: null,
			});
			const preview = prepare(
				root,
				[
					{
						type: "apply_lesson",
						lesson_id: lessonId,
						version_id: first.versionId,
						field_set_digest: first.fieldSetDigest,
					},
				],
				"lesson_adoption",
			);
			approve(root, preview);
			appendLessonVersion(root, {
				lessonId,
				versionId: "LV-55555555555555555555",
				version: 2,
				supersedes: first.versionId,
			});

			expect(() => apply(root, preview)).toThrow(
				"missing, stale, or contradicted",
			);
			expect(loadMutationJournalStrict(root).records).toEqual([]);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("reconciles a committed mutation batch after interruption before the proposal receipt", () => {
		const root = fixtureRoot();
		try {
			const target = "src/rule.ts";
			const targetPath = join(root, target);
			const before = "export const limit = 5;\n";
			writeFileSync(targetPath, before);
			const preview = prepare(root, [
				{
					type: "replace_text",
					target,
					expected_sha256: hash(before),
					before: "limit = 5",
					after: "limit = 6",
				},
			]);
			approve(root, preview);
			expect(() =>
				applyAssistedProposal({
					root,
					projectId: PROJECT_ID,
					proposalId: preview.proposal_id,
					versionDigest: preview.version_digest,
					session: "S-active",
					taskId: "T-01",
					now: NOW,
					afterMutationRecordsCommitted: () => {
						throw new Error("simulated process interruption");
					},
				}),
			).toThrow("simulated process interruption");
			const committed = loadMutationJournalStrict(root);
			expect(committed.issues).toEqual([]);
			expect(committed.records.map((record) => record.status)).toEqual([
				"prepared",
				"committed",
			]);
			expect(readFileSync(targetPath, "utf8")).toBe(
				"export const limit = 6;\n",
			);

			const recovered = apply(root, preview);
			const mutationId = committed.records[0]?.id;
			if (!mutationId) throw new Error("committed mutation id was missing");
			expect(recovered.applied).toBe(true);
			expect(recovered.duplicate).toBe(false);
			expect(recovered.targets).toEqual([target]);
			expect(recovered.mutation_ids).toEqual([mutationId]);
			expect(readFileSync(targetPath, "utf8")).toBe(
				"export const limit = 6;\n",
			);
			expect(loadMutationJournalStrict(root).records).toHaveLength(2);
			expect(apply(root, preview).duplicate).toBe(true);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("does not infer recovery when a committed proposal target has drifted", () => {
		const root = fixtureRoot();
		try {
			const target = "src/rule.ts";
			const targetPath = join(root, target);
			const before = "export const limit = 5;\n";
			writeFileSync(targetPath, before);
			const preview = prepare(root, [
				{
					type: "replace_text",
					target,
					expected_sha256: hash(before),
					before: "limit = 5",
					after: "limit = 6",
				},
			]);
			approve(root, preview);
			expect(() =>
				applyAssistedProposal({
					root,
					projectId: PROJECT_ID,
					proposalId: preview.proposal_id,
					versionDigest: preview.version_digest,
					session: "S-active",
					taskId: "T-01",
					now: NOW,
					afterMutationRecordsCommitted: () => {
						throw new Error("simulated process interruption");
					},
				}),
			).toThrow("simulated process interruption");
			writeFileSync(targetPath, "changed outside proposal apply\n");

			expect(() => apply(root, preview)).toThrow();
			expect(readFileSync(targetPath, "utf8")).toBe(
				"changed outside proposal apply\n",
			);
			const eventPath = join(
				root,
				".afol",
				"data",
				"evolution",
				"assisted-proposals.jsonl",
			);
			const events = existsSync(eventPath)
				? readFileSync(eventPath, "utf8")
				: "";
			expect(events).not.toContain('"event_type":"applied"');
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("recovers a partially written mutation batch before retrying the approved operations", () => {
		const root = fixtureRoot();
		try {
			const firstTarget = "src/first.ts";
			const firstPath = join(root, firstTarget);
			const firstBefore = "export const first = 1;\n";
			writeFileSync(firstPath, firstBefore);
			const preview = prepare(root, [
				{
					type: "replace_text",
					target: firstTarget,
					expected_sha256: hash(firstBefore),
					before: "first = 1",
					after: "first = 2",
				},
				{
					type: "create_text",
					target: "src/second.ts",
					content: "export const second = 2;\n",
				},
			]);
			approve(root, preview);
			expect(() =>
				applyAssistedProposal({
					root,
					projectId: PROJECT_ID,
					proposalId: preview.proposal_id,
					versionDigest: preview.version_digest,
					session: "S-active",
					taskId: "T-01",
					now: NOW,
					afterOperationWrittenAbruptly: (_target, index) => {
						if (index === 0)
							throw new Error("simulated interruption during batch write");
					},
				}),
			).toThrow("simulated interruption during batch write");
			expect(readFileSync(firstPath, "utf8")).toBe("export const first = 2;\n");
			expect(existsSync(join(root, "src", "second.ts"))).toBe(false);

			const recovered = apply(root, preview);
			expect(recovered.applied).toBe(true);
			expect(recovered.duplicate).toBe(false);
			expect(readFileSync(firstPath, "utf8")).toBe("export const first = 2;\n");
			expect(readFileSync(join(root, "src", "second.ts"), "utf8")).toBe(
				"export const second = 2;\n",
			);
			const mutations = loadMutationJournalStrict(root);
			expect(mutations.issues).toEqual([]);
			expect(
				mutations.records.filter((record) => record.status === "rolled_back"),
			).toHaveLength(2);
			expect(
				mutations.records.filter((record) => record.status === "committed"),
			).toHaveLength(3);
			expect(recovered.mutation_ids).toHaveLength(2);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("cleans backups when preparation fails after an earlier backup was created", () => {
		const root = fixtureRoot();
		try {
			const first = "src/first.ts";
			const second = "src/second.ts";
			const firstBefore = "export const first = 1;\n";
			const secondBefore = "export const second = 1;\n";
			writeFileSync(join(root, first), firstBefore);
			writeFileSync(join(root, second), secondBefore);
			const preview = prepare(root, [
				{
					type: "replace_text",
					target: first,
					expected_sha256: hash(firstBefore),
					before: "first = 1",
					after: "first = 2",
				},
				{
					type: "replace_text",
					target: second,
					expected_sha256: hash(secondBefore),
					before: "second = 1",
					after: "second = 2",
				},
			]);
			approve(root, preview);
			expect(() =>
				applyAssistedProposal({
					root,
					projectId: PROJECT_ID,
					proposalId: preview.proposal_id,
					versionDigest: preview.version_digest,
					session: "S-active",
					taskId: "T-01",
					now: NOW,
					afterBackupCreated: (_target, index) => {
						if (index === 0) throw new Error("simulated later backup failure");
					},
				}),
			).toThrow("simulated later backup failure");
			expect(readFileSync(join(root, first), "utf8")).toBe(firstBefore);
			expect(readFileSync(join(root, second), "utf8")).toBe(secondBefore);
			expect(
				readdirSync(join(root, ".afol", "data", "mutations", "backups")),
			).toEqual([]);
			expect(loadMutationJournalStrict(root).records).toEqual([]);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("cleans created backups when the mutation prepare append fails", () => {
		const root = fixtureRoot();
		try {
			const target = "src/rule.ts";
			const before = "export const limit = 5;\n";
			writeFileSync(join(root, target), before);
			const preview = prepare(root, [
				{
					type: "replace_text",
					target,
					expected_sha256: hash(before),
					before: "limit = 5",
					after: "limit = 6",
				},
			]);
			approve(root, preview);
			const mutationJournalPath = join(
				root,
				".afol",
				"data",
				"mutations",
				"mutations.jsonl",
			);
			expect(() =>
				applyAssistedProposal({
					root,
					projectId: PROJECT_ID,
					proposalId: preview.proposal_id,
					versionDigest: preview.version_digest,
					session: "S-active",
					taskId: "T-01",
					now: NOW,
					afterBackupCreated: () => mkdirSync(mutationJournalPath),
				}),
			).toThrow(
				"approved proposal preparation failed and cleanup was incomplete",
			);
			expect(readFileSync(join(root, target), "utf8")).toBe(before);
			expect(
				readdirSync(join(root, ".afol", "data", "mutations", "backups")),
			).toEqual([]);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("removes a partially created backup when its write fails", () => {
		const root = fixtureRoot();
		try {
			const target = "src/rule.ts";
			const before = "export const limit = 5;\n";
			writeFileSync(join(root, target), before);
			const preview = prepare(root, [
				{
					type: "replace_text",
					target,
					expected_sha256: hash(before),
					before: "limit = 5",
					after: "limit = 6",
				},
			]);
			approve(root, preview);
			expect(() =>
				applyAssistedProposal({
					root,
					projectId: PROJECT_ID,
					proposalId: preview.proposal_id,
					versionDigest: preview.version_digest,
					session: "S-active",
					taskId: "T-01",
					now: NOW,
					afterBackupReserved: () => {
						throw new Error("simulated backup write failure");
					},
				}),
			).toThrow("simulated backup write failure");
			expect(readFileSync(join(root, target), "utf8")).toBe(before);
			expect(
				readdirSync(join(root, ".afol", "data", "mutations", "backups")),
			).toEqual([]);
			expect(loadMutationJournalStrict(root).records).toEqual([]);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("rolls back a bounded operation list when a later write fails", () => {
		const root = fixtureRoot();
		try {
			const firstTarget = "src/first.ts";
			const firstPath = join(root, firstTarget);
			const firstBefore = "export const first = 1;\n";
			writeFileSync(firstPath, firstBefore);
			const preview = prepare(root, [
				{
					type: "replace_text",
					target: firstTarget,
					expected_sha256: hash(firstBefore),
					before: "first = 1",
					after: "first = 2",
				},
				{
					type: "create_text",
					target: "src/second.ts",
					content: "export const second = 2;\n",
				},
			]);
			approve(root, preview);
			expect(() =>
				applyAssistedProposal({
					root,
					projectId: PROJECT_ID,
					proposalId: preview.proposal_id,
					versionDigest: preview.version_digest,
					session: "S-active",
					taskId: "T-01",
					now: NOW,
					afterOperationWritten: () => {
						throw new Error("simulated second-stage failure");
					},
				}),
			).toThrow("simulated second-stage failure");
			expect(readFileSync(firstPath, "utf8")).toBe(firstBefore);
			expect(existsSync(join(root, "src", "second.ts"))).toBe(false);
			const mutations = loadMutationJournalStrict(root);
			expect(mutations.issues).toEqual([]);
			expect(mutations.records.map((record) => record.status)).toEqual([
				"prepared",
				"prepared",
				"rolled_back",
				"rolled_back",
			]);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("requires an absent create preimage to remain absent after approval", () => {
		const root = fixtureRoot();
		try {
			const targetPath = join(root, "src", "new-file.ts");
			const preview = prepare(root, [
				{
					type: "create_text",
					target: "src/new-file.ts",
					content: "export const safe = true;\n",
				},
			]);
			approve(root, preview);
			writeFileSync(targetPath, "owned by someone else\n");
			expect(() => apply(root, preview)).toThrow("no longer absent");
			expect(readFileSync(targetPath, "utf8")).toBe("owned by someone else\n");
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("preserves executable mode and file ownership when replacing text", () => {
		const root = fixtureRoot();
		try {
			const target = "src/check.sh";
			const targetPath = join(root, target);
			const before = "printf 'before\\n'\n";
			writeFileSync(targetPath, before);
			chmodSync(targetPath, 0o751);
			const original = statSync(targetPath);
			const preview = prepare(root, [
				{
					type: "replace_text",
					target,
					expected_sha256: hash(before),
					before: "before",
					after: "after",
				},
			]);
			approve(root, preview);
			apply(root, preview);
			const updated = statSync(targetPath);
			expect(readFileSync(targetPath, "utf8")).toBe("printf 'after\\n'\n");
			expect(updated.mode & 0o7777).toBe(original.mode & 0o7777);
			expect(updated.uid).toBe(original.uid);
			expect(updated.gid).toBe(original.gid);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});
});
