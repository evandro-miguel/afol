import { describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runAdrCommand } from "../commands/adr";
import { runChangelogCommand } from "../commands/changelog";
import { runSpecCommand } from "../commands/spec";
import {
	activateRoadmapFeature,
	resolveGovernanceCatalog,
	resolvePendingSpec,
} from "../services/governance/pending-specs";
import { listCanonicalSpecDocuments } from "../services/governance/spec-resolver";
import {
	abandonAdr,
	acceptAdr,
	createAdr,
	supersedeAdr,
} from "../services/spec-gate/adr";
import { addChangelogEntry } from "../services/spec-gate/changelog";
import {
	checkSpecCompatibility,
	getSpecCheck,
	waiveSpecCheck,
} from "../services/spec-gate/checker";

type CapturedIo = {
	stdout: string[];
	stderr: string[];
	io: {
		stdout: (message: string) => void;
		stderr: (message: string) => void;
	};
};

function captureIo(): CapturedIo {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		stdout,
		stderr,
		io: {
			stdout: (message: string) => {
				stdout.push(message);
			},
			stderr: (message: string) => {
				stderr.push(message);
			},
		},
	};
}

function createFixture(): string {
	const root = mkdtempSync(join(tmpdir(), "spec-gate-test-"));
	mkdirSync(join(root, ".agents"), { recursive: true });
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	mkdirSync(join(root, ".afol", "state"), { recursive: true });
	mkdirSync(join(root, ".afol", "pstr"), { recursive: true });
	mkdirSync(join(root, ".afol", "memory"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "specs"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "decisions"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "changelog"), { recursive: true });
	mkdirSync(join(root, "docs", "arc", "SPECS"), { recursive: true });
	writeFileSync(
		join(root, ".agents", "config.json"),
		'{"version":"0.1.0"}',
		"utf8",
	);
	writeFileSync(
		join(root, ".agents", "lock.json"),
		'{"version":"0.1.0"}',
		"utf8",
	);
	writeFileSync(
		join(root, ".agents", "manifest.json"),
		'{"commands":[]}',
		"utf8",
	);
	return root;
}

function writeTask(
	root: string,
	sessionId: string,
	taskId: string,
	parentSpec = "",
): string {
	const sessionDir = join(root, ".afol", "wb", sessionId);
	mkdirSync(sessionDir, { recursive: true });
	const path = join(sessionDir, "plan_task_001.md");
	writeFileSync(
		path,
		[
			"---",
			`feature_id: feature-${sessionId}`,
			`parent_spec: ${parentSpec ? `"${parentSpec}"` : ""}`,
			"---",
			"",
			"# Tasks",
			"",
			"| Task | State | Owner | Notes |",
			"|------|-------|-------|-------|",
			`| ${taskId} | pending | worker | test |`,
			"",
		].join("\n"),
		"utf8",
	);
	return path;
}

function writeSpec(root: string, id: string, status: string): string {
	const path = join(root, ".afol", "adm", "specs", `${id}.md`);
	writeFileSync(
		path,
		[
			"---",
			"doc_type: spec",
			`id: "${id}"`,
			`status: ${status}`,
			"---",
			"",
			`# ${id}`,
		].join("\n"),
		"utf8",
	);
	return path;
}

function writePendingGovernanceFixture(
	root: string,
	specStatus = "active",
	specFeature = "F-22",
	roadmapLayout: "nested" | "flat" = "nested",
) {
	const roadmapPath =
		roadmapLayout === "flat"
			? join(root, ".afol", "adm", "roadmap.md")
			: join(root, ".afol", "adm", "roadmap", "GENERAL-ROADMAP.md");
	mkdirSync(dirname(roadmapPath), { recursive: true });
	writeFileSync(
		roadmapPath,
		"# Roadmap\n\n### F-22 Integrity\n\n- Status: active\n- Governing spec: .afol/adm/specs/spec-22.md\n",
		"utf8",
	);
	const taskPath = writeTask(root, "S-GOV", "T-01");
	writeFileSync(
		join(root, ".afol", "adm", "specs", "spec-22.md"),
		`---\ndoc_type: spec\nid: spec-22\nstatus: ${specStatus}\nroadmap_feature: ${specFeature}\n---\n\n# Spec\n`,
		"utf8",
	);
	const indexPath = join(
		root,
		".afol",
		"data",
		"governance",
		"pending-specs.json",
	);
	mkdirSync(join(root, ".afol", "data", "governance"), { recursive: true });
	writeFileSync(
		indexPath,
		`${JSON.stringify({ schema_version: 1, entries: [{ session_id: "S-GOV", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", status: "open", theme: "test", task_ids: ["T-01"], missing: ["roadmap_feature", "parent_spec"], resolution_hint: "resolve" }] }, null, 2)}\n`,
		"utf8",
	);
	return { taskPath, indexPath };
}

function writeFinalFeatureResidualFixture(
	root: string,
	children: ReadonlyArray<{
		id: string;
		status: string;
		docType?: "spec" | "spec-child";
	}>,
): void {
	mkdirSync(join(root, ".afol", "adm", "roadmap"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "adm", "roadmap", "GENERAL-ROADMAP.md"),
		"# Roadmap\n\n### F-03 Finalized feature\n\n- Status: final\n- Governing spec: .afol/adm/specs/final-parent.md\n",
		"utf8",
	);
	writeFileSync(
		join(root, ".afol", "adm", "specs", "final-parent.md"),
		"---\ndoc_type: spec\nid: final-parent\nstatus: final\nroadmap_feature: F-03\n---\n\n# Final parent\n",
		"utf8",
	);
	for (const child of children) {
		writeFileSync(
			join(root, ".afol", "adm", "specs", `${child.id}.md`),
			`---\ndoc_type: ${child.docType ?? "spec-child"}\nid: ${child.id}\nstatus: ${child.status}\nroadmap_feature: F-03\nparent_spec: final-parent\n---\n\n# Residual child\n`,
			"utf8",
		);
	}
}

function writeLegacySpec(root: string, id: string, status: string): string {
	const path = join(root, "docs", "arc", "SPECS", `${id}.md`);
	writeFileSync(
		path,
		[
			"---",
			"doc_type: spec",
			`id: "${id}"`,
			`status: ${status}`,
			"---",
			"",
			`# ${id}`,
		].join("\n"),
		"utf8",
	);
	return path;
}

function supportsSymlink(type: "file" | "dir" | "junction"): boolean {
	const root = mkdtempSync(join(tmpdir(), "spec-gate-symlink-probe-"));
	const target = join(root, type === "file" ? "target.md" : "target");
	const link = join(root, "link");
	try {
		if (type === "file") writeFileSync(target, "probe\n", "utf8");
		else mkdirSync(target);
		symlinkSync(target, link, type);
		return true;
	} catch {
		return false;
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

const supportsFileSymlink = supportsSymlink("file");
const supportsDirectoryLink = supportsSymlink(
	process.platform === "win32" ? "junction" : "dir",
);

describe("spec-gate system", () => {
	test.skipIf(!supportsFileSymlink)(
		"governance catalog rejects a symlinked flat roadmap outside the project root",
		() => {
			const root = createFixture();
			const outside = mkdtempSync(join(tmpdir(), "spec-gate-roadmap-outside-"));
			try {
				const roadmapPath = join(root, ".afol", "adm", "roadmap.md");
				const outsideRoadmap = join(outside, "roadmap.md");
				writeFileSync(
					outsideRoadmap,
					"# Roadmap\n\n### F-22 Integrity\n\n- Status: active\n- Governing spec: .afol/adm/specs/spec-22.md\n",
					"utf8",
				);
				symlinkSync(outsideRoadmap, roadmapPath, "file");
				writeFileSync(
					join(root, ".afol", "adm", "specs", "spec-22.md"),
					"---\ndoc_type: spec\nid: spec-22\nstatus: active\nroadmap_feature: F-22\n---\n\n# Spec\n",
					"utf8",
				);

				expect(() => resolveGovernanceCatalog(root, "F-22", "spec-22")).toThrow(
					/symlink|reparse|outside|unsafe/i,
				);
			} finally {
				rmSync(root, { recursive: true, force: true });
				rmSync(outside, { recursive: true, force: true });
			}
		},
	);

	test.skipIf(!supportsDirectoryLink)(
		"governance activation rejects a linked roadmap directory even when it resolves inside the project root",
		() => {
			const root = createFixture();
			try {
				const targetDirectory = join(root, "roadmap-target");
				mkdirSync(targetDirectory);
				writeFileSync(
					join(targetDirectory, "GENERAL-ROADMAP.md"),
					"# Roadmap\n\n### F-31 Fixture\n\n- Status: planned\n",
					"utf8",
				);
				symlinkSync(
					targetDirectory,
					join(root, ".afol", "adm", "roadmap"),
					process.platform === "win32" ? "junction" : "dir",
				);

				expect(() => activateRoadmapFeature(root, "F-31")).toThrow(
					/symlink|reparse|unsafe/i,
				);
				expect(
					readFileSync(join(targetDirectory, "GENERAL-ROADMAP.md"), "utf8"),
				).toContain("- Status: planned");
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		},
	);

	test("canonical spec resolution parses LF and CRLF without changing content", () => {
		const root = createFixture();
		try {
			const documents = [
				["lf-spec", "\n"],
				["crlf-spec", "\r\n"],
			] as const;
			for (const [id, lineEnding] of documents) {
				const content = [
					"---",
					"doc_type: spec",
					`id: ${id}`,
					"status: active",
					"roadmap_feature: F-29",
					"---",
					"",
					`# ${id}`,
				].join(lineEnding);
				writeFileSync(
					join(root, ".afol", "adm", "specs", `${id}.md`),
					content,
					"utf8",
				);
			}
			const found = listCanonicalSpecDocuments(root);
			expect(found.map((document) => document.id)).toEqual([
				"crlf-spec",
				"lf-spec",
			]);
			expect(found.map((document) => document.content)).toEqual([
				readFileSync(
					join(root, ".afol", "adm", "specs", "crlf-spec.md"),
					"utf8",
				),
				readFileSync(join(root, ".afol", "adm", "specs", "lf-spec.md"), "utf8"),
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("governance catalog falls back to the flat roadmap layout", () => {
		const root = createFixture();
		try {
			writePendingGovernanceFixture(root, "active", "F-22", "flat");
			expect(resolveGovernanceCatalog(root, "F-22", "spec-22")).toMatchObject({
				roadmapPath: ".afol/adm/roadmap.md",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("governance catalog prefers the nested roadmap when both layouts exist", () => {
		const root = createFixture();
		try {
			writePendingGovernanceFixture(root);
			writeFileSync(
				join(root, ".afol", "adm", "roadmap.md"),
				"# Roadmap\n\n### F-22 Other\n\n- Status: planned\n",
				"utf8",
			);
			expect(resolveGovernanceCatalog(root, "F-22", "spec-22")).toMatchObject({
				roadmapPath: ".afol/adm/roadmap/GENERAL-ROADMAP.md",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("governance resolution accepts platform paths and rejects paths outside the root", () => {
		const root = createFixture();
		try {
			const roadmapPath = join(
				root,
				".afol",
				"adm",
				"roadmap",
				"GENERAL-ROADMAP.md",
			);
			mkdirSync(dirname(roadmapPath), { recursive: true });
			const platformSpecPath = join(".afol", "adm", "specs", "spec-22.md");
			const outsideSpecPath = join(root, "..", "outside-spec.md");
			writeFileSync(
				roadmapPath,
				`# Roadmap\n\n### F-22 Integrity\n\n- Status: active\n- Governing spec: ${outsideSpecPath}\n- Governing spec: ${platformSpecPath}\n`,
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "adm", "specs", "spec-22.md"),
				"---\ndoc_type: spec\nid: spec-22\nstatus: active\nroadmap_feature: F-22\n---\n\n# Spec\n",
				"utf8",
			);
			expect(resolveGovernanceCatalog(root, "F-22", "spec-22")).toMatchObject({
				specPath: ".afol/adm/specs/spec-22.md",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
	test("governance catalog requires an active canonical roadmap feature section", () => {
		for (const roadmap of [
			"# Roadmap\n\nF-22 appears only in prose.\n",
			"# Roadmap\n\n### F-22 Integrity\n\n- Status: final\n- Governing spec: .afol/adm/specs/spec-22.md\n",
		]) {
			const root = createFixture();
			try {
				writePendingGovernanceFixture(root);
				writeFileSync(
					join(root, ".afol", "adm", "roadmap", "GENERAL-ROADMAP.md"),
					roadmap,
					"utf8",
				);
				expect(() =>
					resolveGovernanceCatalog(root, "F-22", "spec-22"),
				).toThrow();
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		}
	});

	test("governance catalog requires explicit Governing spec for the feature", () => {
		const root = createFixture();
		try {
			writePendingGovernanceFixture(root);
			writeFileSync(
				join(root, ".afol", "adm", "roadmap", "GENERAL-ROADMAP.md"),
				"# Roadmap\n\n### F-22 Integrity\n\n- Status: active\n- Why this feature mentions spec-22 in prose only.\n",
				"utf8",
			);
			expect(() => resolveGovernanceCatalog(root, "F-22", "spec-22")).toThrow();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("governance catalog canonicalizes internal governing spec paths and rejects outside paths", () => {
		const root = createFixture();
		try {
			writePendingGovernanceFixture(root);
			const roadmapPath = join(
				root,
				".afol",
				"adm",
				"roadmap",
				"GENERAL-ROADMAP.md",
			);
			const acceptedPaths = [
				".afol/adm/specs/spec-22.md",
				join(".afol", "adm", "specs", "spec-22.md"),
				join(root, ".afol", "adm", "specs", "spec-22.md"),
			];
			for (const governingSpecPath of acceptedPaths) {
				writeFileSync(
					roadmapPath,
					`# Roadmap\n\n### F-22 Integrity\n\n- Status: active\n- Governing spec: ${governingSpecPath}\n`,
					"utf8",
				);
				expect(resolveGovernanceCatalog(root, "F-22", "spec-22")).toMatchObject(
					{
						specPath: ".afol/adm/specs/spec-22.md",
					},
				);
			}
			for (const governingSpecPath of [
				join(`${root}-sibling`, ".afol", "adm", "specs", "spec-22.md"),
				join(tmpdir(), "outside-governance-root", "spec-22.md"),
			]) {
				writeFileSync(
					roadmapPath,
					`# Roadmap\n\n### F-22 Integrity\n\n- Status: active\n- Governing spec: ${governingSpecPath}\n`,
					"utf8",
				);
				expect(() => resolveGovernanceCatalog(root, "F-22", "spec-22")).toThrow(
					"Roadmap feature governing spec mismatch",
				);
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("governance catalog accepts an active residual child under a final parent", () => {
		const root = createFixture();
		try {
			mkdirSync(join(root, ".afol", "adm", "roadmap"), { recursive: true });
			writeFileSync(
				join(root, ".afol", "adm", "roadmap", "GENERAL-ROADMAP.md"),
				"# Roadmap\n\n### F-22 Integrity\n\n- Status: active\n- Governing spec: .afol/adm/specs/parent-spec.md\n",
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "adm", "specs", "parent-spec.md"),
				"---\ndoc_type: spec\nid: parent-spec\nstatus: final\nroadmap_feature: F-22\n---\n\n# Parent\n",
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "adm", "specs", "child-spec.md"),
				"---\ndoc_type: spec-child\nid: child-spec\nstatus: active\nroadmap_feature: F-22\nparent_spec: parent-spec\n---\n\n# Child\n",
				"utf8",
			);

			const catalog = resolveGovernanceCatalog(root, "F-22", "parent-spec");
			expect(catalog).toMatchObject({
				specId: "child-spec",
				specPath: ".afol/adm/specs/child-spec.md",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("governance catalog resolves final F-03 through exactly one active residual child", () => {
		const root = createFixture();
		try {
			writeFinalFeatureResidualFixture(root, [
				{ id: "final-child", status: "active" },
			]);

			const catalog = resolveGovernanceCatalog(root, "F-03", "final-parent");
			expect(catalog).toMatchObject({
				specId: "final-child",
				specPath: ".afol/adm/specs/final-child.md",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("final F-03 stays unresolved without exactly one valid active residual child", () => {
		for (const children of [
			[],
			[{ id: "inactive-child", status: "draft" }],
			[
				{ id: "active-child-a", status: "active" },
				{ id: "active-child-b", status: "active" },
			],
		] as const) {
			const root = createFixture();
			try {
				writeFinalFeatureResidualFixture(root, children);
				expect(() =>
					resolveGovernanceCatalog(root, "F-03", "final-parent"),
				).toThrow(
					"Parent spec is final without one active residual child: final-parent",
				);
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		}
	});

	test("final F-03 rejects an active spec document as a residual", () => {
		const root = createFixture();
		try {
			writeFinalFeatureResidualFixture(root, [
				{ id: "active-spec", status: "active", docType: "spec" },
			]);

			expect(() =>
				resolveGovernanceCatalog(root, "F-03", "final-parent"),
			).toThrow(
				"Parent spec is final without one active residual child: final-parent",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("activateRoadmapFeature activates planned features and leaves active features unchanged", () => {
		const root = createFixture();
		try {
			mkdirSync(join(root, ".afol", "adm", "roadmap"), { recursive: true });
			const roadmapPath = join(
				root,
				".afol",
				"adm",
				"roadmap",
				"GENERAL-ROADMAP.md",
			);
			writeFileSync(
				roadmapPath,
				"# Roadmap\n\n### F-31 Fixture\n\n- Status: planned\n",
				"utf8",
			);
			expect(activateRoadmapFeature(root, "F-31")).toEqual({
				featureId: "F-31",
				status: "activated",
			});
			const activeRoadmap = readFileSync(roadmapPath, "utf8");
			expect(activateRoadmapFeature(root, "F-31")).toEqual({
				featureId: "F-31",
				status: "already_active",
			});
			expect(readFileSync(roadmapPath, "utf8")).toBe(activeRoadmap);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("activateRoadmapFeature updates the flat roadmap fallback", () => {
		const root = createFixture();
		try {
			const roadmapPath = join(root, ".afol", "adm", "roadmap.md");
			writeFileSync(
				roadmapPath,
				"# Roadmap\n\n### F-31 Fixture\n\n- Status: planned\n",
				"utf8",
			);
			expect(activateRoadmapFeature(root, "F-31")).toEqual({
				featureId: "F-31",
				status: "activated",
			});
			expect(readFileSync(roadmapPath, "utf8")).toContain("- Status: active");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("activateRoadmapFeature prefers the nested roadmap when both layouts exist", () => {
		const root = createFixture();
		try {
			const nestedPath = join(
				root,
				".afol",
				"adm",
				"roadmap",
				"GENERAL-ROADMAP.md",
			);
			const flatPath = join(root, ".afol", "adm", "roadmap.md");
			mkdirSync(dirname(nestedPath), { recursive: true });
			writeFileSync(
				nestedPath,
				"# Roadmap\n\n### F-31 Fixture\n\n- Status: planned\n",
				"utf8",
			);
			writeFileSync(
				flatPath,
				"# Roadmap\n\n### F-31 Fixture\n\n- Status: active\n",
				"utf8",
			);
			expect(activateRoadmapFeature(root, "F-31")).toEqual({
				featureId: "F-31",
				status: "activated",
			});
			expect(readFileSync(nestedPath, "utf8")).toContain("- Status: active");
			expect(readFileSync(flatPath, "utf8")).toContain("- Status: active");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("activateRoadmapFeature converges after an interruption between parent and roadmap writes", () => {
		const root = createFixture();
		try {
			const roadmapPath = join(
				root,
				".afol",
				"adm",
				"roadmap",
				"GENERAL-ROADMAP.md",
			);
			const parentPath = join(root, ".afol", "adm", "specs", "parent-spec.md");
			mkdirSync(dirname(roadmapPath), { recursive: true });
			writeFileSync(
				roadmapPath,
				"# Roadmap\n\n### F-31 Fixture\n\n- Status: planned\n",
				"utf8",
			);
			writeFileSync(
				parentPath,
				"---\ndoc_type: spec\nid: parent-spec\nstatus: planned\nroadmap_feature: F-31\n---\n\n# Parent\n",
				"utf8",
			);
			expect(() =>
				activateRoadmapFeature(root, "F-31", "parent-spec", {
					failAfterFirstWrite: true,
				}),
			).toThrow("Injected governance activation failure");
			expect(readFileSync(roadmapPath, "utf8")).toContain("- Status: planned");
			expect(readFileSync(parentPath, "utf8")).toContain('status: "active"');

			expect(activateRoadmapFeature(root, "F-31", "parent-spec")).toMatchObject(
				{
					featureId: "F-31",
					status: "activated",
					parentSpec: "parent-spec",
					parentStatus: "already_active",
				},
			);
			expect(readFileSync(roadmapPath, "utf8")).toContain("- Status: active");
			expect(readFileSync(parentPath, "utf8")).toContain('status: "active"');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("activateRoadmapFeature restores bytes after an injected second-write failure", () => {
		const root = createFixture();
		try {
			const roadmapPath = join(
				root,
				".afol",
				"adm",
				"roadmap",
				"GENERAL-ROADMAP.md",
			);
			const parentPath = join(root, ".afol", "adm", "specs", "parent-spec.md");
			mkdirSync(dirname(roadmapPath), { recursive: true });
			writeFileSync(
				roadmapPath,
				"# Roadmap\n\n### F-31 Fixture\n\n- Status: planned\n",
				"utf8",
			);
			writeFileSync(
				parentPath,
				"---\ndoc_type: spec\nid: parent-spec\nstatus: planned\nroadmap_feature: F-31\n---\n\n# Parent\n",
				"utf8",
			);
			const roadmapBefore = readFileSync(roadmapPath);
			const parentBefore = readFileSync(parentPath);

			expect(() =>
				activateRoadmapFeature(root, "F-31", "parent-spec", {
					failOnSecondWrite: true,
				}),
			).toThrow(
				"Injected governance activation failure on second write; restoration=complete",
			);
			expect(readFileSync(roadmapPath).equals(roadmapBefore)).toBe(true);
			expect(readFileSync(parentPath).equals(parentBefore)).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("activateRoadmapFeature preserves structured parent spec frontmatter", () => {
		const root = createFixture();
		try {
			const roadmapPath = join(
				root,
				".afol",
				"adm",
				"roadmap",
				"GENERAL-ROADMAP.md",
			);
			const parentPath = join(root, ".afol", "adm", "specs", "parent-spec.md");
			mkdirSync(dirname(roadmapPath), { recursive: true });
			writeFileSync(
				roadmapPath,
				"# Roadmap\n\n### F-31 Fixture\n\n- Status: planned\n",
				"utf8",
			);
			const original = [
				"---",
				"doc_type: spec",
				"id: parent-spec",
				"status: planned",
				"roadmap_feature: F-31",
				"owners:",
				"  - product",
				"  - platform",
				"links:",
				"  roadmap: .afol/adm/roadmap.md",
				"  plan: .afol/adm/plans/parent.md",
				"---",
				"",
				"# Parent",
				"",
			].join("\n");
			writeFileSync(parentPath, original, "utf8");

			activateRoadmapFeature(root, "F-31", "parent-spec");

			expect(readFileSync(parentPath, "utf8")).toBe(
				original.replace("status: planned", 'status: "active"'),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("activateRoadmapFeature rejects final features without rewriting the roadmap", () => {
		const root = createFixture();
		try {
			mkdirSync(join(root, ".afol", "adm", "roadmap"), { recursive: true });
			const roadmapPath = join(
				root,
				".afol",
				"adm",
				"roadmap",
				"GENERAL-ROADMAP.md",
			);
			writeFileSync(
				roadmapPath,
				"# Roadmap\n\n### F-31 Fixture\n\n- Status: final\n",
				"utf8",
			);
			const before = readFileSync(roadmapPath, "utf8");
			expect(() => activateRoadmapFeature(root, "F-31")).toThrow(
				"final and cannot be reopened",
			);
			expect(readFileSync(roadmapPath, "utf8")).toBe(before);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("governance resolution rejects fake, inactive, and mismatched catalog bindings", () => {
		for (const variant of [
			"fake-feature",
			"fake-spec",
			"inactive",
			"mismatch",
		] as const) {
			const root = createFixture();
			try {
				writePendingGovernanceFixture(
					root,
					variant === "inactive" ? "archived" : "active",
					variant === "mismatch" ? "F-99" : "F-22",
				);
				const input = {
					session: "S-GOV",
					featureId: variant === "fake-feature" ? "F-404" : "F-22",
					parentSpec: variant === "fake-spec" ? "missing" : "spec-22",
				};
				expect(() => resolvePendingSpec(root, input)).toThrow();
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		}
	});

	test("governance resolution rolls back frontmatter and index after an injected failure", () => {
		const root = createFixture();
		try {
			const { taskPath, indexPath } = writePendingGovernanceFixture(root);
			const taskBefore = readFileSync(taskPath, "utf8");
			const indexBefore = readFileSync(indexPath, "utf8");
			expect(() =>
				resolvePendingSpec(
					root,
					{ session: "S-GOV", featureId: "F-22", parentSpec: "spec-22" },
					{ failAfterFrontmatter: true },
				),
			).toThrow("Injected governance failure");
			expect(readFileSync(taskPath, "utf8")).toBe(taskBefore);
			expect(readFileSync(indexPath, "utf8")).toBe(indexBefore);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("governance resolution rejects re-waiving a resolved session", () => {
		const root = createFixture();
		try {
			const { taskPath } = writePendingGovernanceFixture(root);
			resolvePendingSpec(root, {
				session: "S-GOV",
				featureId: "F-22",
				parentSpec: "spec-22",
			});
			expect(() =>
				resolvePendingSpec(root, {
					session: "S-GOV",
					noSpecRequiredReason: "must not downgrade governed state",
				}),
			).toThrow("pending_spec entry is not open");
			const task = readFileSync(taskPath, "utf8");
			expect(task).toContain('governance_status: "governed"');
			expect(task).toContain('parent_spec: "spec-22"');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("resolved residual child remains compatible through the spec gate", () => {
		const root = createFixture();
		try {
			writePendingGovernanceFixture(root);
			writeFinalFeatureResidualFixture(root, [
				{ id: "final-child", status: "active" },
			]);
			resolvePendingSpec(root, {
				session: "S-GOV",
				featureId: "F-03",
				parentSpec: "final-parent",
			});
			const result = checkSpecCompatibility(root, "S-GOV", "T-01");
			expect(result.status).toBe("compatible");
			expect(result.spec_id).toBe("final-child");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
	test("checkSpecCompatibility returns not_applicable when no spec linked", () => {
		const root = createFixture();
		try {
			writeTask(root, "session-a", "T-01");
			const result = checkSpecCompatibility(root, "session-a", "T-01");
			expect(result.status).toBe("not_applicable");
			expect(result.spec_id).toBe("");
			expect(getSpecCheck(root, "session-a", "T-01")).toEqual(result);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("readStore throws on malformed JSON, never silently returns empty", () => {
		const root = createFixture();
		try {
			// Create a session with a task so that checkSpecCompatibility/waiveSpecCheck
			// can reach readStore before failing on task lookup.
			writeTask(root, "session-a", "T-01", "spec-001");
			writeSpec(root, "spec-001", "active");

			const storePath = join(root, ".afol", "state", "spec-gate.json");
			mkdirSync(dirname(storePath), { recursive: true });

			// Write a valid store with one waiver first
			writeFileSync(
				storePath,
				JSON.stringify({
					version: 1,
					results: {
						"session-a::T-01": {
							task_id: "T-01",
							session_id: "session-a",
							spec_id: "spec-001",
							status: "waived",
							checked_at: "2026-01-01T00:00:00.000Z",
							waiver_reason: "existing waiver",
						},
					},
				}),
				"utf8",
			);

			// Verify existing waiver is readable
			const before = getSpecCheck(root, "session-a", "T-01");
			expect(before).not.toBeNull();
			if (before === null) {
				throw new Error("Expected existing spec waiver");
			}
			expect(before.status).toBe("waived");

			// Corrupt the store — write invalid JSON
			writeFileSync(storePath, "{invalid json\n", "utf8");

			// readStore is called internally by checkSpecCompatibility / getSpecCheck
			// — must throw instead of silently returning empty
			const expectedMsg = "Malformed spec-gate store";
			expect(() => getSpecCheck(root, "session-a", "T-01")).toThrow(
				expectedMsg,
			);
			expect(() => checkSpecCompatibility(root, "session-a", "T-01")).toThrow(
				expectedMsg,
			);
			expect(() =>
				waiveSpecCheck(root, "session-a", "T-01", "override"),
			).toThrow(expectedMsg);

			// Original file content is preserved
			const stored = readFileSync(storePath, "utf8");
			expect(stored).toBe("{invalid json\n");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("readStore throws on empty file (fail closed), nonexistent file is valid first-run", () => {
		const root = createFixture();
		try {
			writeTask(root, "session-a", "T-01");
			const storePath = join(root, ".afol", "state", "spec-gate.json");
			mkdirSync(dirname(storePath), { recursive: true });

			// Nonexistent file is valid first-run — readStore returns empty store
			const noFile = getSpecCheck(root, "session-a", "T-01");
			expect(noFile).toBeNull();

			// Write an empty file — must fail closed like malformed content
			writeFileSync(storePath, "", "utf8");
			expect(() => getSpecCheck(root, "session-a", "T-01")).toThrow(
				"Malformed spec-gate store",
			);
			expect(() => checkSpecCompatibility(root, "session-a", "T-01")).toThrow(
				"Malformed spec-gate store",
			);

			// File content is preserved
			expect(readFileSync(storePath, "utf8")).toBe("");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("readStore throws on invalid structure, never silently returns empty", () => {
		const root = createFixture();
		try {
			const storePath = join(root, ".afol", "state", "spec-gate.json");
			mkdirSync(dirname(storePath), { recursive: true });

			// Valid JSON but wrong shape (not a SpecStore)
			writeFileSync(
				storePath,
				JSON.stringify({ version: 2, data: [] }),
				"utf8",
			);

			expect(() => getSpecCheck(root, "session-a", "T-01")).toThrow(
				"Malformed spec-gate store",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("readStore rejects malformed result entries", () => {
		const root = createFixture();
		try {
			const storePath = join(root, ".afol", "state", "spec-gate.json");
			mkdirSync(dirname(storePath), { recursive: true });
			writeFileSync(
				storePath,
				JSON.stringify({ version: 1, results: { "session-a::T-01": "bad" } }),
				"utf8",
			);

			expect(() => getSpecCheck(root, "session-a", "T-01")).toThrow(
				"Malformed spec-gate store",
			);
			expect(() =>
				waiveSpecCheck(root, "session-a", "T-01", "override"),
			).toThrow("Malformed spec-gate store");

			writeFileSync(
				storePath,
				JSON.stringify({
					version: 1,
					results: {
						"session-a::T-01": {
							session_id: "other-session",
							task_id: "T-99",
							spec_id: "spec-001",
							status: "waived",
							checked_at: "2026-07-15T00:00:00.000Z",
							waiver_reason: "mismatched key",
						},
					},
				}),
				"utf8",
			);
			expect(() => getSpecCheck(root, "session-a", "T-01")).toThrow(
				"Malformed spec-gate store",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("checkSpecCompatibility returns conflict for open pending_spec", () => {
		const root = createFixture();
		try {
			const sessionDir = join(root, ".afol", "wb", "session-pending");
			mkdirSync(sessionDir, { recursive: true });
			writeFileSync(
				join(sessionDir, "session-pending_task_01.md"),
				[
					"---",
					'feature_id: ""',
					'parent_spec: ""',
					"governance_status: pending_spec",
					"pending_spec: true",
					"pending_spec_status: open",
					"---",
					"",
					"# Tasks",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | pending | worker | missing governing spec |",
					"",
				].join("\n"),
				"utf8",
			);
			const result = checkSpecCompatibility(root, "session-pending", "T-01");
			expect(result.status).toBe("conflict");
			expect(result.spec_id).toBe("pending_spec");
			expect(getSpecCheck(root, "session-pending", "T-01")).toEqual(result);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("checkSpecCompatibility reads open pending_spec from governance index", () => {
		const root = createFixture();
		try {
			const sessionDir = join(root, ".afol", "wb", "session-index-pending");
			mkdirSync(sessionDir, { recursive: true });
			writeFileSync(
				join(sessionDir, "session-index-pending_task_01.md"),
				[
					"# Tasks",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | pending | worker | missing governing spec |",
					"",
				].join("\n"),
				"utf8",
			);
			mkdirSync(join(root, ".afol", "data", "governance"), {
				recursive: true,
			});
			writeFileSync(
				join(root, ".afol", "data", "governance", "pending-specs.json"),
				JSON.stringify(
					{
						schema_version: 1,
						entries: [
							{
								session_id: "session-index-pending",
								created_at: "2026-07-05T00:00:00.000Z",
								updated_at: "2026-07-05T00:00:00.000Z",
								status: "open",
								theme: "index pending",
								task_ids: ["T-01"],
								missing: ["roadmap_feature", "parent_spec"],
								resolution_hint:
									"run afol governance resolve-spec --session <session>",
							},
						],
					},
					null,
					2,
				),
				"utf8",
			);

			const result = checkSpecCompatibility(
				root,
				"session-index-pending",
				"T-01",
			);
			expect(result.status).toBe("conflict");
			expect(result.spec_id).toBe("pending_spec");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("checkSpecCompatibility returns compatible when spec exists and active", () => {
		const root = createFixture();
		try {
			writeTask(root, "session-a", "T-01", "spec-001");
			writeSpec(root, "spec-001", "active");
			const result = checkSpecCompatibility(root, "session-a", "T-01");
			expect(result.status).toBe("compatible");
			expect(result.spec_id).toBe("spec-001");
			expect(getSpecCheck(root, "session-a", "T-01")).toEqual(result);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("checkSpecCompatibility rejects legacy docs arc specs", () => {
		const root = createFixture();
		try {
			writeTask(root, "session-a", "T-01", "spec-legacy");
			writeLegacySpec(root, "spec-legacy", "active");
			const result = checkSpecCompatibility(root, "session-a", "T-01");
			expect(result.status).toBe("conflict");
			expect(result.spec_id).toBe("spec-legacy");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("checkSpecCompatibility returns conflict when spec missing", () => {
		const root = createFixture();
		try {
			writeTask(root, "session-a", "T-01", "spec-missing");
			const result = checkSpecCompatibility(root, "session-a", "T-01");
			expect(result.status).toBe("conflict");
			expect(result.spec_id).toBe("spec-missing");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("waiveSpecCheck creates waiver with reason", () => {
		const root = createFixture();
		try {
			writeTask(root, "session-a", "T-01", "spec-missing");
			const result = waiveSpecCheck(
				root,
				"session-a",
				"T-01",
				" needs waiver ",
				" ADR-9 ",
			);
			expect(result.status).toBe("waived");
			expect(result.waiver_reason).toBe("needs waiver");
			expect(result.adr_ref).toBe("ADR-9");
			expect(getSpecCheck(root, "session-a", "T-01")).toEqual(result);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("getSpecCheck returns stored result", () => {
		const root = createFixture();
		try {
			writeTask(root, "session-a", "T-01", "spec-001");
			writeSpec(root, "spec-001", "active");
			const result = checkSpecCompatibility(root, "session-a", "T-01");
			expect(getSpecCheck(root, "session-a", "T-01")).toEqual(result);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("createAdr creates file with next sequential number", () => {
		const root = createFixture();
		try {
			const existing = join(
				root,
				".afol",
				"adm",
				"decisions",
				"ADR-001-existing.md",
			);
			writeFileSync(
				existing,
				[
					"---",
					"doc_type: adr",
					"id: ADR-001",
					"title: Existing",
					"status: accepted",
					'created_at: "2026-01-01T00:00:00.000Z"',
					'updated_at: "2026-01-01T00:00:00.000Z"',
					'decision_type: "architecture"',
					'supersedes: ""',
					'superseded_by: ""',
					"affected_specs: []",
					"affected_rules: []",
					"affected_skills: []",
					"affected_commands: []",
					'archive_reason: ""',
					"---",
					"",
				].join("\n"),
				"utf8",
			);
			const path = createAdr(root, "Next decision");
			expect(path).toContain("ADR-002-next-decision.md");
			expect(readFileSync(path, "utf8")).toContain('id: "ADR-002"');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("createAdr handles slugification", () => {
		const root = createFixture();
		try {
			const path = createAdr(root, "  Hello, World! / Test  ");
			expect(path).toContain("ADR-001-hello-world-test.md");
			expect(readFileSync(path, "utf8")).toContain(
				'title: "Hello, World! / Test"',
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("acceptAdr updates status", () => {
		const root = createFixture();
		try {
			const path = createAdr(root, "Accept me");
			acceptAdr(root, "ADR-001");
			expect(readFileSync(path, "utf8")).toContain("status: accepted");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("supersedeAdr updates superseded_by", () => {
		const root = createFixture();
		try {
			createAdr(root, "Old decision");
			createAdr(root, "New decision");
			supersedeAdr(root, "ADR-001", "ADR-002");
			const content = readFileSync(
				join(root, ".afol", "adm", "decisions", "ADR-001-old-decision.md"),
				"utf8",
			);
			expect(content).toContain("status: superseded");
			expect(content).toContain('superseded_by: "ADR-002"');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("abandonAdr updates status with reason", () => {
		const root = createFixture();
		try {
			const path = createAdr(root, "Abandon me");
			abandonAdr(root, "ADR-001", " no longer needed ");
			expect(readFileSync(path, "utf8")).toContain("status: abandoned");
			expect(readFileSync(path, "utf8")).toContain(
				'archive_reason: "no longer needed"',
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("addChangelogEntry creates file if missing", () => {
		const root = createFixture();
		try {
			const path = addChangelogEntry(root, "fix", "test entry");
			expect(readFileSync(path, "utf8")).toContain("# Changelog");
			expect(readFileSync(path, "utf8")).toContain("- fix: test entry");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("addChangelogEntry appends to existing", () => {
		const root = createFixture();
		try {
			const path = join(root, ".afol", "adm", "changelog", "CHANGELOG.md");
			writeFileSync(
				path,
				["# Changelog", "", "## old", "- fix: prior", ""].join("\n"),
				"utf8",
			);
			addChangelogEntry(root, "behavior", " appended test ");
			const content = readFileSync(path, "utf8");
			expect(content).toContain("## old");
			expect(content).toContain("- fix: prior");
			expect(content).toContain("- behavior: appended test");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol spec check --json returns check result", async () => {
		const root = createFixture();
		try {
			writeTask(root, "session-a", "T-01", "spec-001");
			writeSpec(root, "spec-001", "active");
			const captured = captureIo();
			expect(
				await runSpecCommand(
					"check",
					["-S", "session-a", "-T", "T-01", "--json"],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				exit_code: number;
				action: string;
				status: string;
				spec_id: string;
				data: { action: string; status: string; spec_id: string };
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.exit_code).toBe(0);
			expect(payload.action).toBe("check");
			expect(payload.status).toBe("compatible");
			expect(payload.spec_id).toBe("spec-001");
			expect(payload.data).toMatchObject({
				action: "check",
				status: "compatible",
				spec_id: "spec-001",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol spec check prints human output", async () => {
		const root = createFixture();
		try {
			writeTask(root, "session-a", "T-01", "spec-001");
			writeSpec(root, "spec-001", "active");
			const captured = captureIo();
			expect(
				await runSpecCommand(
					"check",
					["-S", "session-a", "-T", "T-01"],
					root,
					captured.io,
				),
			).toBe(0);
			expect(captured.stdout.join("\n")).toContain("spec check: compatible");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol spec list --json lists adm specs", async () => {
		const root = createFixture();
		try {
			writeSpec(root, "spec-001", "active");
			writeSpec(root, "spec-002", "draft");
			const captured = captureIo();
			expect(await runSpecCommand("list", ["--json"], root, captured.io)).toBe(
				0,
			);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				exit_code: number;
				action: string;
				count: number;
				data: {
					action: string;
					count: number;
					specs: { id: string; status?: string }[];
				};
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.exit_code).toBe(0);
			expect(payload.action).toBe("list");
			expect(payload.count).toBe(2);
			expect(payload.data.specs.map((spec) => spec.id)).toEqual([
				"spec-001",
				"spec-002",
			]);
			expect(payload.data).toMatchObject({
				action: "list",
				count: 2,
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol spec list prints compact human output", async () => {
		const root = createFixture();
		try {
			writeSpec(root, "spec-001", "active");
			const captured = captureIo();
			expect(await runSpecCommand("list", [], root, captured.io)).toBe(0);
			expect(captured.stdout.join("\n")).toContain("specs: 1");
			expect(captured.stdout.join("\n")).toContain(
				"- spec-001 status=active path=.afol/adm/specs/spec-001.md",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol spec help prints usage without requiring task args", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			expect(await runSpecCommand("", ["--help"], root, captured.io)).toBe(0);
			expect(captured.stdout.join("\n")).toContain("Usage: afol spec");
			expect(captured.stdout.join("\n")).toContain("list");
			expect(captured.stderr.join("\n")).toBe("");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol adr new --json creates ADR", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			expect(
				await runAdrCommand(
					"new",
					["JSON output test", "--json"],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				exit_code: number;
				action: string;
				path: string;
				data: { action: string; path: string };
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.exit_code).toBe(0);
			expect(payload.action).toBe("new");
			expect(readFileSync(payload.path, "utf8")).toContain("Json Output Test");
			expect(payload.data).toMatchObject({ action: "new", path: payload.path });
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol changelog add --json adds entry", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			expect(
				await runChangelogCommand(
					"add",
					["--type", "fix", "--message", "test", "--json"],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				exit_code: number;
				action: string;
				path: string;
				data: { action: string; path: string };
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.exit_code).toBe(0);
			expect(payload.action).toBe("add");
			expect(readFileSync(payload.path, "utf8")).toContain("- fix: test");
			expect(payload.data).toMatchObject({ action: "add", path: payload.path });
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol spec conflict reports conflict", async () => {
		const root = createFixture();
		try {
			writeTask(root, "session-a", "T-01", "spec-missing");
			const captured = captureIo();
			expect(
				await runSpecCommand(
					"conflict",
					["-S", "session-a", "-T", "T-01"],
					root,
					captured.io,
				),
			).toBe(0);
			expect(captured.stdout.join("\n")).toContain("spec conflict: conflict");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol spec waive requires reason", async () => {
		const root = createFixture();
		try {
			writeTask(root, "session-a", "T-01", "spec-missing");
			const captured = captureIo();
			expect(
				await runSpecCommand(
					"waive",
					["-S", "session-a", "-T", "T-01"],
					root,
					captured.io,
				),
			).toBe(2);
			expect(captured.stderr.join("\n")).toContain(
				"Missing --reason for spec waive.",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol spec waive with adr returns waived result", async () => {
		const root = createFixture();
		try {
			writeTask(root, "session-a", "T-01", "spec-missing");
			const captured = captureIo();
			expect(
				await runSpecCommand(
					"waive",
					[
						"-S",
						"session-a",
						"-T",
						"T-01",
						"--reason",
						"needs override",
						"--adr",
						"ADR-9",
						"--json",
					],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload.action).toBe("waive");
			expect(payload.status).toBe("waived");
			expect(payload.waiver_reason).toBe("needs override");
			expect(payload.adr_ref).toBe("ADR-9");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol adr command covers accept supersede abandon archive", async () => {
		const root = createFixture();
		try {
			const created = captureIo();
			expect(
				await runAdrCommand("new", ["First decision"], root, created.io),
			).toBe(0);
			const firstPath = created.stdout[0] ?? "";
			expect(firstPath).toContain("ADR-001-first-decision.md");

			const accepted = captureIo();
			expect(
				await runAdrCommand("accept", ["ADR-001"], root, accepted.io),
			).toBe(0);
			expect(accepted.stdout[0] ?? "").toContain("adr accept:");

			const second = captureIo();
			expect(
				await runAdrCommand(
					"new",
					["Second decision", "--json"],
					root,
					second.io,
				),
			).toBe(0);
			const secondPayload = JSON.parse(second.stdout[0] ?? "{}");
			expect(secondPayload.path).toContain("ADR-002-second-decision.md");

			const superseded = captureIo();
			expect(
				await runAdrCommand(
					"supersede",
					["ADR-001", "ADR-002"],
					root,
					superseded.io,
				),
			).toBe(0);
			expect(superseded.stdout[0] ?? "").toContain("adr supersede:");

			const abandoned = captureIo();
			expect(
				await runAdrCommand(
					"abandon",
					["ADR-002", "--reason", "unused"],
					root,
					abandoned.io,
				),
			).toBe(0);
			expect(abandoned.stdout[0] ?? "").toContain("adr abandon:");

			const archived = captureIo();
			expect(
				await runAdrCommand(
					"archive",
					["ADR-002", "--reason", "old"],
					root,
					archived.io,
				),
			).toBe(0);
			expect(archived.stdout[0] ?? "").toContain("adr archive:");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol changelog add writes human output", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			expect(
				await runChangelogCommand(
					"a",
					["--type", "behavior", "--message", "plain output"],
					root,
					captured.io,
				),
			).toBe(0);
			expect(captured.stdout[0] ?? "").toContain("changelog add:");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
