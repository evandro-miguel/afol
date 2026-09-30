import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runEvolveCommand } from "../commands/evolve";
import { agentOperationContext } from "../core/operation-context";
import { inspectEvolutionArtifacts } from "../services/evolution/artifact-inspection";
import {
	appendAssistedProposalEvent,
	proposalVersionEvents,
	readAssistedProposalJournal,
	storePreparedAssistedProposal,
} from "../services/evolution/assisted-proposal-journal";
import type { AssistedProposalPreview } from "../services/evolution/assisted-proposal-packet";
import { prepareAssistedProposalPreview } from "../services/evolution/assisted-proposal-packet";
import { removeEvolutionTestRoot } from "./evolution-test-support";

const PROJECT_ID = "479f0a58-f658-4ee0-bbef-0db9a3f2e2c5";
const NOW = new Date("2026-09-25T18:00:00.000Z");

function fixture(): string {
	const root = mkdtempSync(join(tmpdir(), "assisted-proposal-journal-"));
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "config.json"),
		JSON.stringify({
			schema_version: 1,
			project: { id: PROJECT_ID, name: "journal-fixture", timezone: "UTC" },
			paths: { evolution_events_dir: ".afol/data/events/evolution" },
		}),
	);
	return root;
}

function prepare(root: string) {
	const versionDigest = "a".repeat(64);
	const preview = {
		read_only: true,
		approved: false,
		project_id: PROJECT_ID,
		kind: "code",
		proposal_id: `EP-${versionDigest.slice(0, 24)}`,
		version_digest: versionDigest,
		problem_identity: "b".repeat(64),
		intervention_identity: "c".repeat(64),
		observed_fact: "A verified artifact records a problem.",
		hypothesis: "A bounded intervention may address it.",
		evidence_refs: [],
		intervention: { operations: [] },
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
	return preview;
}

function decide(
	root: string,
	preview: AssistedProposalPreview,
	payload: Record<string, unknown>,
) {
	return appendAssistedProposalEvent({
		root,
		projectId: PROJECT_ID,
		eventType: "decision",
		proposalId: preview.proposal_id,
		versionDigest: preview.version_digest,
		problemIdentity: preview.problem_identity,
		payload,
		now: NOW,
	});
}

describe("assisted proposal journal decisions", () => {
	test("preserves rejection history and permits only explicit reasoned reconsideration", () => {
		const root = fixture();
		try {
			const preview = prepare(root);
			decide(root, preview, {
				decision: "reject",
				reason: "The evidence is not enough.",
			});
			expect(() => decide(root, preview, { decision: "approve" })).toThrow(
				"cannot be approved or deferred",
			);
			expect(() =>
				decide(root, preview, {
					decision: "approve",
					reconsider_rejection: true,
				}),
			).toThrow("rejected exact version and an approval reason");
			decide(root, preview, {
				decision: "approve",
				reconsider_rejection: true,
				reason:
					"After reviewing the exact sources, I approve this bounded change.",
			});
			const versionEvents = proposalVersionEvents(
				readAssistedProposalJournal(root, PROJECT_ID),
				preview.proposal_id,
				preview.version_digest,
			);
			expect(
				versionEvents
					.filter((event) => event.event_type === "decision")
					.map((event) => event.payload.decision),
			).toEqual(["reject", "approve"]);
			expect(versionEvents.at(-1)?.payload.reconsider_rejection).toBe(true);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("show pages a maximal valid operation field with exact bytes and digest", async () => {
		const root = fixture();
		try {
			mkdirSync(join(root, "src"), { recursive: true });
			const sessionDir = join(root, ".afol", "wb", "S-large");
			mkdirSync(sessionDir, { recursive: true });
			const reportName = "S-large_report_1.md";
			writeFileSync(
				join(sessionDir, reportName),
				"A reviewed source report.\n",
			);
			const before = "x".repeat(16_000);
			const after = "y".repeat(16_000);
			const targetPath = join(root, "src", "large.ts");
			writeFileSync(targetPath, `const value = "${before}";\n`);
			const reference = inspectEvolutionArtifacts({
				root,
				sessions: ["S-large"],
				artifacts: [reportName],
			}).items[0]?.artifacts[0];
			expect(reference).toBeDefined();
			if (!reference) return;
			const packetPath = join(root, "large-packet.json");
			writeFileSync(
				packetPath,
				JSON.stringify({
					schema_version: 1,
					kind: "code",
					observed_fact: "A supported operation has a large replacement value.",
					hypothesis: "Paged inspection keeps the complete value reviewable.",
					evidence_refs: [
						{
							session_id: reference.session_id,
							path: reference.path,
							anchor: reference.anchor,
							content_digest: reference.content_digest,
							digest_scope: reference.digest_scope,
						},
					],
					intervention: {
						operations: [
							{
								type: "replace_text",
								target: "src/large.ts",
								expected_sha256: createHash("sha256")
									.update(`const value = "${before}";\n`)
									.digest("hex"),
								before,
								after,
							},
						],
					},
					alternative: "Keep current behavior.",
					validation_plan: { commands: ["bun test"], expected: "Tests pass." },
				}),
			);
			const preview = prepareAssistedProposalPreview({ root, packetPath });
			storePreparedAssistedProposal(root, preview, NOW);
			let offset = 0;
			let assembled = "";
			let digest = "";
			while (offset < Buffer.byteLength(after, "utf8")) {
				const stdout: string[] = [];
				const exitCode = await runEvolveCommand(
					"proposal",
					[
						"show",
						preview.proposal_id,
						"--operation",
						"1",
						"--field",
						"after",
						"--offset",
						String(offset),
						"--bytes",
						"8000",
						"--json",
					],
					root,
					{ stdout: (line) => stdout.push(line), stderr: () => {} },
					agentOperationContext(),
					NOW,
				);
				expect(exitCode).toBe(0);
				const payload = JSON.parse(stdout.join("\n"));
				const page = payload.data.operation_field;
				assembled += page.text;
				digest = page.sha256;
				offset = page.next_offset_bytes ?? Buffer.byteLength(after, "utf8");
			}
			expect(assembled).toBe(after);
			expect(digest).toBe(createHash("sha256").update(after).digest("hex"));
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("does not permit reconsideration without a previous exact-version rejection", () => {
		const root = fixture();
		try {
			const preview = prepare(root);
			expect(() =>
				decide(root, preview, {
					decision: "approve",
					reconsider_rejection: true,
					reason: "This is not a reconsideration.",
				}),
			).toThrow("rejected exact version and an approval reason");
			expect(readAssistedProposalJournal(root, PROJECT_ID)).toHaveLength(1);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("revocation cannot be used to imply rollback of an applied code proposal", () => {
		const root = fixture();
		try {
			const preview = prepare(root);
			decide(root, preview, { decision: "approve" });
			appendAssistedProposalEvent({
				root,
				projectId: PROJECT_ID,
				eventType: "applied",
				proposalId: preview.proposal_id,
				versionDigest: preview.version_digest,
				problemIdentity: preview.problem_identity,
				payload: { targets: [], mutation_ids: [] },
				now: NOW,
			});
			expect(() =>
				appendAssistedProposalEvent({
					root,
					projectId: PROJECT_ID,
					eventType: "revoked",
					proposalId: preview.proposal_id,
					versionDigest: preview.version_digest,
					problemIdentity: preview.problem_identity,
					payload: { reason: "This cannot undo an applied code change." },
					now: NOW,
				}),
			).toThrow("only applies to adopted context guidance");
			expect(
				readAssistedProposalJournal(root, PROJECT_ID).some(
					(event) => event.event_type === "revoked",
				),
			).toBe(false);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});
});
