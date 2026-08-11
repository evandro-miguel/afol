import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { planBootstrapOperations } from "../services/bootstrap/planner";
import type { TemplateFileMap } from "../services/template/payload";

function sha256Hex(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function templateFileMap(entries: Record<string, string>): TemplateFileMap {
	const files: TemplateFileMap = {};
	for (const [path, content] of Object.entries(entries)) {
		files[path] = {
			path,
			contentBase64: Buffer.from(content, "utf8").toString("base64"),
			sha256: sha256Hex(content),
			bytes: Buffer.byteLength(content),
		};
	}
	return files;
}

const LEGACY_SPECS_INDEX = [
	"---",
	'id: "specs-index"',
	'type: "index"',
	'desc: "AFOL specs index"',
	'created: "2026-06-20"',
	'updated: "2026-06-20"',
	"---",
	"",
	"# Specs INDEX",
	"",
	"- Parent spec:",
	"- Child spec:",
	"",
	"Keep this index updated in downstream projects as new specs are added.",
	"",
].join("\n");

describe("bootstrap planner conflict handling", () => {
	test("marks conflict when managed file drifted from manifest hash", () => {
		const templateFiles = templateFileMap({
			"managed-drift.md": "template-new",
		});
		const plan = planBootstrapOperations({
			templateFiles,
			currentFiles: {
				"managed-drift.md": "user-edited",
			},
			manifest: {
				"managed-drift.md": {
					owner: "managed",
					hash: sha256Hex("managed-old"),
				},
			},
		});

		expect(plan.operations).toHaveLength(1);
		expect(plan.operations[0]?.kind).toBe("conflict");
		expect(plan.operations[0]?.owner).toBe("conflict");
		expect(plan.operations[0]?.diffPreview?.length).toBeGreaterThan(0);
		expect(plan.operations[0]?.diffPreview).toContain("@@");
	});

	test("marks conflict when ownership is unknown and content differs", () => {
		const templateFiles = templateFileMap({
			"unknown-owner.md": "template-v2",
		});
		const plan = planBootstrapOperations({
			templateFiles,
			currentFiles: {
				"unknown-owner.md": "project-version",
			},
			manifest: {},
		});

		expect(plan.operations).toHaveLength(1);
		expect(plan.operations[0]?.kind).toBe("conflict");
		expect(plan.operations[0]?.owner).toBe("conflict");
		expect(plan.operations[0]?.diffPreview?.length).toBeGreaterThan(0);
		expect(plan.operations[0]?.diffPreview).toContain("@@");
	});

	test("filters forbidden paths even if input map is contaminated", () => {
		const templateFiles = templateFileMap({
			".agents/runtime/server.py": "print('x')",
			"docs/arc/policy.md": "x",
			"safe/readme.md": "ok",
		});
		const plan = planBootstrapOperations({
			templateFiles,
			currentFiles: {},
			manifest: {},
		});

		expect(plan.operations).toHaveLength(1);
		expect(plan.operations[0]?.path).toBe("safe/readme.md");
		expect(plan.filteredForbiddenCount).toBe(2);
	});

	test("seeds missing project-owned baselines and migrates the untouched legacy index", () => {
		const plan = planBootstrapOperations({
			templateFiles: templateFileMap({
				".afol/adm/specs/INDEX.md": "current index\n",
				"docs/standards/user-journey-registry.md": "registry\n",
				"docs/templates/ux-journey.md": "journey\n",
			}),
			currentFiles: {
				".afol/adm/specs/INDEX.md": LEGACY_SPECS_INDEX,
			},
			manifest: {
				".afol/adm/specs/INDEX.md": { owner: "project-owned" },
				"docs/standards/user-journey-registry.md": {
					owner: "project-owned",
				},
				"docs/templates/ux-journey.md": { owner: "project-owned" },
			},
		});

		const operations = new Map(
			plan.operations.map((operation) => [operation.path, operation]),
		);
		expect(
			operations.get("docs/standards/user-journey-registry.md"),
		).toMatchObject({
			kind: "create",
			owner: "project-owned",
		});
		expect(operations.get("docs/templates/ux-journey.md")).toMatchObject({
			kind: "create",
			owner: "project-owned",
		});
		expect(operations.get(".afol/adm/specs/INDEX.md")).toMatchObject({
			kind: "update-managed",
			owner: "generated",
			reason: "legacy-template-index",
		});
	});

	test("preserves a project-owned index with local changes", () => {
		const plan = planBootstrapOperations({
			templateFiles: templateFileMap({
				".afol/adm/specs/INDEX.md": "current index\n",
			}),
			currentFiles: {
				".afol/adm/specs/INDEX.md": `${LEGACY_SPECS_INDEX}local change\n`,
			},
			manifest: {
				".afol/adm/specs/INDEX.md": { owner: "project-owned" },
			},
		});

		expect(plan.operations[0]).toMatchObject({
			kind: "preserve-project-owned",
			path: ".afol/adm/specs/INDEX.md",
		});
	});
});
