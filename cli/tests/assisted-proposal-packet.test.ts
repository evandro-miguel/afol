import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectEvolutionArtifacts } from "../services/evolution/artifact-inspection";
import {
	ASSISTED_PROPOSAL_PACKET_EXAMPLE,
	ASSISTED_PROPOSAL_PACKET_SCHEMA,
	parseAssistedProposalPacket,
	prepareAssistedProposalPreview,
} from "../services/evolution/assisted-proposal-packet";
import { removeEvolutionTestRoot } from "./evolution-test-support";

const PROJECT_ID = "a3155842-ef4c-460b-883b-4e98d51e64ba";

function fixtureRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "assisted-proposal-packet-"));
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "config.json"),
		JSON.stringify({
			schema_version: 1,
			project: { id: PROJECT_ID, name: "proposal-fixture", timezone: "UTC" },
			paths: {
				wb_dir: ".afol/wb",
				agents_dir: ".agents",
				library_dir: ".afol/library",
			},
		}),
	);
	const session = "S-20260925-proposal";
	const sessionDir = join(root, ".afol", "wb", session);
	mkdirSync(sessionDir, { recursive: true });
	writeFileSync(
		join(sessionDir, `${session}_report_1.md`),
		"A validation command failed while the task remained open.\n",
	);
	return root;
}

function packetFor(
	root: string,
	kind: string,
	operations: unknown[],
	additional: Record<string, unknown> = {},
): string {
	const session = "S-20260925-proposal";
	const reference = inspectEvolutionArtifacts({
		root,
		sessions: [session],
		artifacts: [`${session}_report_1.md`],
	}).items[0]?.artifacts[0];
	if (!reference) throw new Error("fixture artifact reference was not emitted");
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
			observed_fact: "The session records a failed validation command.",
			hypothesis: "A bounded change may prevent the repeat failure.",
			evidence_refs: [evidenceReference],
			intervention: { operations },
			alternative: "Keep the current behavior and clarify its limits.",
			validation_plan: {
				commands: ["bun test"],
				expected: "The focused validation passes.",
			},
			...additional,
		}),
	);
	return packetPath;
}

function sha256(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

describe("assisted proposal packet contract", () => {
	test("exports strict operation variants matching the accepted packet contract", () => {
		type OperationSchema = {
			additionalProperties: boolean;
			required: readonly string[];
			properties: { type: { const: string }; [key: string]: unknown };
		};
		const schema = ASSISTED_PROPOSAL_PACKET_SCHEMA as unknown as {
			properties: {
				evidence_refs: {
					items: {
						oneOf: { properties: Record<string, unknown> }[];
					};
				};
				intervention: {
					properties: {
						operations: { items: { oneOf: OperationSchema[] } };
					};
				};
			};
		};
		const variants =
			schema.properties.intervention.properties.operations.items.oneOf;
		const evidenceVariants = schema.properties.evidence_refs.items.oneOf;
		expect(evidenceVariants).toHaveLength(2);
		expect(
			evidenceVariants.some((variant) =>
				JSON.stringify(variant).includes('"const":"artifact"'),
			),
		).toBe(true);
		expect(
			evidenceVariants.some((variant) =>
				JSON.stringify(variant).includes('"const":"range"'),
			),
		).toBe(true);
		expect(variants).toHaveLength(5);
		const requiredByOperation: Record<string, string[]> = {
			replace_text: ["type", "target", "expected_sha256", "before", "after"],
			create_text: ["type", "target", "content"],
			activate_skill: ["type", "target", "expected_sha256", "rationale"],
			publish_guidance: ["type", "statement"],
			apply_lesson: ["type", "lesson_id", "version_id", "field_set_digest"],
		};
		for (const variant of variants) {
			expect(variant.additionalProperties).toBe(false);
			const operationType = variant.properties.type.const;
			const required = requiredByOperation[operationType];
			expect(required).toBeDefined();
			if (required) expect([...variant.required]).toEqual(required);
		}
		expect(
			Object.keys(requiredByOperation).every((type) =>
				variants.some((variant) => variant.properties.type.const === type),
			),
		).toBe(true);
	});

	test("schema example uses neutral canonical session evidence and no fixture-specific fix", () => {
		const example = ASSISTED_PROPOSAL_PACKET_EXAMPLE;
		expect(example.evidence_refs[0]?.session_id).toBe("S-20260925-example");
		expect(example.evidence_refs[0]?.path).toBe(
			".afol/wb/S-20260925-example/S-20260925-example_report_1.md",
		);
		expect(JSON.stringify(example)).toContain("normalize('NFC')");
		expect(JSON.stringify(example)).not.toContain("discount");
	});

	test("parser preserves byte-range evidence scope", () => {
		const base = {
			schema_version: 1,
			kind: "code",
			observed_fact: "The session records a failed validation command.",
			hypothesis: "A documented invocation may be incomplete.",
			evidence_refs: [
				{
					session_id: "S-20260925-example",
					path: ".afol/wb/S-20260925-example/S-20260925-example_report_1.md",
					anchor: "bytes:0-20",
					content_digest: "a".repeat(64),
					digest_scope: "range",
					source_identity_digest: "c".repeat(64),
				},
			],
			intervention: {
				operations: [
					{
						type: "replace_text",
						target: "src/example.ts",
						expected_sha256: "b".repeat(64),
						before: "oldText()",
						after: "newText()",
					},
				],
			},
			alternative: "Keep the current behavior and clarify its boundary.",
			validation_plan: {
				commands: ["bun test"],
				expected: "The focused check passes.",
			},
		};
		const parsed = parseAssistedProposalPacket(base);
		expect(parsed.evidence_refs[0]?.digest_scope).toBe("range");
		expect(parsed.evidence_refs[0]?.source_identity_digest).toBe(
			"c".repeat(64),
		);
	});

	test("rejects a byte range labeled as a whole artifact and vice versa", () => {
		const base = {
			schema_version: 1,
			kind: "code",
			observed_fact: "The session records a failed validation command.",
			hypothesis: "A documented invocation may be incomplete.",
			evidence_refs: [
				{
					session_id: "S-20260925-example",
					path: ".afol/wb/S-20260925-example/S-20260925-example_report_1.md",
					anchor: "bytes:0-20",
					content_digest: "a".repeat(64),
					digest_scope: "artifact",
				},
			],
			intervention: {
				operations: [
					{
						type: "replace_text",
						target: "src/example.ts",
						expected_sha256: "b".repeat(64),
						before: "oldText()",
						after: "newText()",
					},
				],
			},
			alternative: "Keep the current behavior and clarify its boundary.",
			validation_plan: {
				commands: ["bun test"],
				expected: "The focused check passes.",
			},
		};
		expect(() => parseAssistedProposalPacket(base)).toThrow(
			"digest_scope does not match its anchor",
		);

		const byteRange = structuredClone(base);
		const byteRangeRef = byteRange.evidence_refs[0];
		if (!byteRangeRef) throw new Error("test evidence reference missing");
		byteRangeRef.anchor = "line:4";
		byteRangeRef.digest_scope = "range";
		expect(() => parseAssistedProposalPacket(byteRange)).toThrow(
			"digest_scope does not match its anchor",
		);
	});

	test("enforces skill operation-kind and existence rules during preparation", () => {
		const root = fixtureRoot();
		try {
			const absentSkillTarget = ".agents/skills/new/SKILL.md";
			const updatePacket = packetFor(root, "skill_update", [
				{
					type: "create_text",
					target: absentSkillTarget,
					content: "# New guidance\n",
				},
			]);
			expect(() =>
				prepareAssistedProposalPreview({ root, packetPath: updatePacket }),
			).toThrow(
				"intervention.operations[0]: operation create_text is not valid for skill_update",
			);

			const existingSkillTarget = ".agents/skills/existing/SKILL.md";
			mkdirSync(join(root, ".agents", "skills", "existing"), {
				recursive: true,
			});
			writeFileSync(join(root, existingSkillTarget), "# Existing guidance\n");
			const existing = "# Existing guidance\n";
			const createPacket = packetFor(
				root,
				"skill_create",
				[
					{
						type: "replace_text",
						target: existingSkillTarget,
						expected_sha256: sha256(existing),
						before: "Existing",
						after: "Updated",
					},
				],
				{
					skill_search: {
						queried: ["existing skill inventory"],
						existing_results: ["existing"],
						rationale: "The existing skill is the relevant target.",
					},
				},
			);
			expect(() =>
				prepareAssistedProposalPreview({ root, packetPath: createPacket }),
			).toThrow(
				"intervention.operations[0]: operation replace_text is not valid for skill_create",
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("accepts singular test paths and rejects credential or runtime targets", () => {
		const root = fixtureRoot();
		try {
			const testPacket = packetFor(root, "code", [
				{
					type: "create_text",
					target: "test/regression.test.ts",
					content: "test('regression', () => {});\n",
				},
			]);
			const preview = prepareAssistedProposalPreview({
				root,
				packetPath: testPacket,
			});
			expect(preview.target_baselines[0]?.target).toBe(
				"test/regression.test.ts",
			);

			for (const target of ["secrets/token.txt", ".afol/state/new.json"]) {
				const packetPath = packetFor(root, "code", [
					{ type: "create_text", target, content: "not allowed\n" },
				]);
				expect(() =>
					prepareAssistedProposalPreview({ root, packetPath }),
				).toThrow("target is not allowed for code");
			}
		} finally {
			removeEvolutionTestRoot(root);
		}
	});
});
