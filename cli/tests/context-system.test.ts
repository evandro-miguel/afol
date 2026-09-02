import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runContextCommand } from "../commands/context";
import { agentOperationContext } from "../core/operation-context";
import { buildContextBundle } from "../services/context/bundler";
import {
	buildSectionIndexSnapshot,
	getSectionIndex,
	rebuildSectionIndex,
	resolveSection,
	SectionIndexTrustError,
} from "../services/context/section-index";
import {
	addClaim,
	invalidateClaim,
	proposeTopic,
} from "../services/library/crud";
import { writeMemory } from "../services/memory/crud";
import { rebuildPstrIndex, validatePstrIndex } from "../services/pstr/builder";
import { hydrateSession } from "../services/state/hydrate";
import { validateState } from "../services/state/validate";
import { removeTestRoot } from "./windows-test-support";

type IoCapture = {
	stdout: string[];
	stderr: string[];
	io: {
		stdout: (message: string) => void;
		stderr: (message: string) => void;
	};
};

function captureIo(): IoCapture {
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

function ruleInjectionStatePath(root: string): string {
	return join(root, ".afol", "data", "rules", "injection-state.json");
}

function sectionIndexPath(root: string): string {
	return join(root, ".afol", "data", "index", "sections.json");
}

function writeInjectableAlphaRule(root: string): void {
	writeFileSync(
		join(root, ".afol", "adm", "rules", "index.json"),
		JSON.stringify({
			rules: [
				{
					id: "RULE-ALPHA",
					name: "alpha rule",
					path: "alpha.md",
					surfaces: ["alpha"],
					work_types: ["delivery"],
					inject: "always",
					priority: 90,
				},
			],
		}),
		"utf8",
	);
}

function createBaseFixture(): string {
	const root = mkdtempSync(join(tmpdir(), "ctx-test-"));
	mkdirSync(join(root, ".agents"), { recursive: true });
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	mkdirSync(join(root, ".afol", "data", "index"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "specs"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "decisions"), { recursive: true });
	mkdirSync(join(root, "docs"), { recursive: true });
	writeFileSync(join(root, "docs", "readme.md"), "# Docs\n", "utf8");
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

function createSectionFixture(): string {
	const root = createBaseFixture();
	writeFileSync(
		join(root, ".afol", "adm", "specs", "alpha-spec.md"),
		[
			"---",
			"doc_type: spec",
			"roadmap_feature: alpha",
			"status: active",
			"---",
			"",
			"# Alpha Spec",
			"",
			"## Overview",
			"",
			"Text.",
			"",
			"### Details",
			"",
			"More text.",
			"",
			"## Notes",
			"",
			"End.",
		].join("\n"),
		"utf8",
	);
	writeFileSync(
		join(root, ".afol", "adm", "decisions", "adr-1.md"),
		[
			"---",
			"doc_type: adr",
			"id: ADR-1",
			"status: accepted",
			"---",
			"",
			"# ADR-1",
			"",
			"## Decision",
			"",
			"Body.",
		].join("\n"),
		"utf8",
	);
	return root;
}

function createBundleFixture(options?: {
	inflate?: boolean;
	pstr?: "valid" | "missing" | "stale";
	memoryRefs?: boolean;
	libraryRefs?: boolean;
}): string {
	const root = createSectionFixture();
	mkdirSync(join(root, ".afol", "adm", "rules"), { recursive: true });
	mkdirSync(join(root, ".agents", "skills", "alpha-helper"), {
		recursive: true,
	});
	mkdirSync(join(root, ".afol", "library"), { recursive: true });
	mkdirSync(join(root, ".afol", "memory"), { recursive: true });
	mkdirSync(join(root, ".afol", "pstr"), { recursive: true });
	mkdirSync(join(root, ".afol", "wb", "session-1"), { recursive: true });

	writeFileSync(
		join(root, ".afol", "adm", "rules", "index.json"),
		JSON.stringify({
			rules: [
				{
					id: "RULE-ALPHA",
					name: "alpha rule",
					path: "alpha.md",
					surfaces: ["alpha"],
					work_types: ["delivery"],
					priority: 90,
				},
			],
		}),
		"utf8",
	);
	writeFileSync(
		join(root, ".afol", "adm", "rules", "alpha.md"),
		"# Alpha rule\n",
		"utf8",
	);

	writeFileSync(
		join(root, ".agents", "skills", "alpha-helper", "SKILL.md"),
		[
			"---",
			"name: alpha helper",
			"description: alpha designer helper",
			"---",
			"",
			"# Alpha helper",
		].join("\n"),
		"utf8",
	);

	writeFileSync(
		join(root, ".afol", "library", "alpha-guide.md"),
		"# Guide\n",
		"utf8",
	);
	writeFileSync(
		join(root, ".afol", "memory", "memory.md"),
		"# Memory\n",
		"utf8",
	);
	if (options?.memoryRefs) {
		writeMemory(root, {
			updated_at: "2026-06-13T00:00:00.000Z",
			entries: [
				{
					id: "MEM-ACTIVE",
					title: "Alpha memory",
					body: "T-01 alpha designer active memory",
					status: "active",
					created_at: "2026-06-13T00:00:00.000Z",
					updated_at: "2026-06-13T00:00:00.000Z",
					tags: ["alpha"],
				},
				{
					id: "MEM-ARCHIVED",
					title: "Alpha memory archived",
					body: "T-01 alpha designer archived memory",
					status: "archived",
					created_at: "2026-06-13T00:00:00.000Z",
					updated_at: "2026-06-13T00:00:00.000Z",
					tags: ["alpha"],
				},
				{
					id: "MEM-REJECTED",
					title: "Alpha memory rejected",
					body: "T-01 alpha designer rejected memory",
					status: "rejected",
					created_at: "2026-06-13T00:00:00.000Z",
					updated_at: "2026-06-13T00:00:00.000Z",
					tags: ["alpha"],
				},
				{
					id: "MEM-INVALIDATED",
					title: "Alpha memory invalidated",
					body: "T-01 alpha designer invalidated memory",
					status: "invalidated",
					created_at: "2026-06-13T00:00:00.000Z",
					updated_at: "2026-06-13T00:00:00.000Z",
					tags: ["alpha"],
				},
			],
		});
	}
	if (options?.libraryRefs) {
		proposeTopic(root, "alpha", "Alpha library", [
			{
				id: "SRC-1",
				url: "https://example.com/alpha",
				title: "Alpha source",
				accessed_at: "2026-06-13T00:00:00.000Z",
			},
		]);
		addClaim(root, "alpha", {
			id: "CLAIM-CURRENT",
			text: "T-01 alpha designer current claim",
			source_ids: ["SRC-1"],
			status: "current",
			created_at: "2026-06-13T00:00:00.000Z",
		});
		addClaim(root, "alpha", {
			id: "CLAIM-INVALID",
			text: "T-01 alpha designer invalidated claim",
			source_ids: ["SRC-1"],
			status: "current",
			created_at: "2026-06-13T00:00:00.000Z",
		});
		invalidateClaim(root, "alpha", "CLAIM-INVALID", "wrong");
	}
	if (options?.pstr !== "missing") {
		writeFileSync(
			join(root, ".afol", "pstr", "index.json"),
			JSON.stringify({
				kind: "pstr_index_v1",
				version: 1,
				generated_at: "2026-06-13T00:00:00.000Z",
				source: {
					project_root: root,
					pstr_dir: join(root, ".afol", "pstr"),
				},
				maps: [
					{
						id: "alpha-map",
						scope: "alpha",
						status: "current",
						authority: "observed",
						source_paths: ["docs/arc/SPECS/alpha-spec.md"],
						source_hash: "hash-alpha",
						file_count: 1,
						updated_at: "2026-06-13T00:00:00.000Z",
						stale_after: "2026-06-14T00:00:00.000Z",
						tags: ["alpha"],
					},
				],
			}),
			"utf8",
		);
	}

	writeFileSync(
		join(root, ".afol", "wb", "session-1", "plan.md"),
		"# Plan\n",
		"utf8",
	);
	writeFileSync(
		join(root, ".afol", "wb", "session-1", "alpha_task_1.md"),
		[
			"---",
			"feature_id: alpha",
			"---",
			"",
			"# Task",
			"",
			"| Task | State | Owner | Notes |",
			"|------|-------|-------|-------|",
			"| T-01 | pending | worker | alpha task |",
		].join("\n"),
		"utf8",
	);

	if (options?.inflate) {
		writeFileSync(
			join(root, ".afol", "adm", "specs", "alpha-spec.md"),
			[
				"---",
				"doc_type: spec",
				"roadmap_feature: alpha",
				"status: active",
				"---",
				"",
				"# Alpha Spec",
				"",
				`## ${"Overview ".repeat(240)}`,
				"",
				"Text.",
				"",
				`### ${"Details ".repeat(240)}`,
				"",
				"More text.",
				"",
				`## ${"Notes ".repeat(240)}`,
				"",
				"End.",
			].join("\n"),
			"utf8",
		);
		writeFileSync(
			join(root, ".afol", "pstr", "index.json"),
			JSON.stringify({
				kind: "pstr_index_v1",
				version: 1,
				generated_at: "2026-06-13T00:00:00.000Z",
				source: {
					project_root: root,
					pstr_dir: join(root, ".afol", "pstr"),
				},
				maps: Array.from({ length: 5 }, (_, index) => ({
					id: `${"alpha".repeat(20)}-${index}`,
					scope: "alpha",
					status: "current",
					authority: "observed",
					source_paths: ["docs/arc/SPECS/alpha-spec.md"],
					source_hash: `hash-${index}`,
					file_count: 1,
					updated_at: "2026-06-13T00:00:00.000Z",
					stale_after: "2026-06-14T00:00:00.000Z",
					tags: ["alpha"],
				})),
			}),
			"utf8",
		);
	}

	if (options?.pstr === "stale") {
		writeFileSync(
			join(root, ".afol", "adm", "specs", "alpha-spec.md"),
			[
				"---",
				"doc_type: spec",
				"roadmap_feature: alpha",
				"status: active",
				"---",
				"",
				"# Alpha Spec",
				"",
				"## Overview",
				"",
				"Text updated.",
				"",
				"### Details",
				"",
				"More text.",
				"",
				"## Notes",
				"",
				"End.",
			].join("\n"),
			"utf8",
		);
	}

	rebuildSectionIndex(root);
	return root;
}

function writeAlphaHook(root: string): void {
	mkdirSync(join(root, ".afol", "adm", "hooks"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "adm", "hooks", "index.json"),
		JSON.stringify({
			hooks: [
				{
					id: "HOOK-ALPHA",
					name: "alpha hook",
					path: "alpha-hook.md",
					events: ["context.bundle"],
					roles: ["designer"],
					surfaces: ["alpha"],
					work_types: ["delivery"],
					priority: 90,
					contributions: {
						messages: ["Use alpha hook message."],
						tools: ["afol hook resolve --event context.bundle"],
						validation_commands: ["bun run alpha-check"],
						pstr_refs: ["pstr:hook-map"],
						memory_refs: ["memory:hook-alpha"],
						library_refs: ["library:hook-alpha"],
						do_not_load: ["raw plugin payloads"],
					},
				},
			],
		}),
		"utf8",
	);
}

function writeCoordinationRadarHook(root: string): void {
	mkdirSync(join(root, ".afol", "adm", "hooks"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "adm", "hooks", "index.json"),
		JSON.stringify({
			hooks: [
				{
					id: "COORDINATION-RADAR",
					name: "coordination radar reminder",
					path: "coordination-radar.md",
					events: ["context.bundle"],
					roles: ["orchestrator"],
					work_types: ["delivery", "all"],
					priority: 90,
					contributions: {
						messages: [
							"Before delegating or editing across governed AFOL sessions, review `afol session radar`.",
						],
						tools: ["afol session radar", "afol session radar --json"],
					},
				},
			],
		}),
		"utf8",
	);
}

describe("context system", () => {
	test("rebuildSectionIndex creates valid index from spec and adr files", () => {
		const root = createSectionFixture();
		try {
			const snapshot = rebuildSectionIndex(root);
			expect(snapshot.kind).toBe("sections_index_v2");
			expect(snapshot.version).toBe(2);
			expect(snapshot.sections.length).toBe(4);
			expect(snapshot.sections[0]?.title).toBe("Decision");
			expect(
				snapshot.sections.some(
					(entry) => entry.ref === "spec:alpha/specs-alpha-spec#overview",
				),
			).toBe(true);
			expect(
				snapshot.sections.some(
					(entry) => entry.ref === "spec:alpha/specs-alpha-spec#details",
				),
			).toBe(true);
			expect(
				snapshot.sections.some(
					(entry) => entry.ref === "spec:alpha/specs-alpha-spec#notes",
				),
			).toBe(true);
		} finally {
			removeTestRoot(root);
		}
	});

	test("rebuildSectionIndex handles empty dirs gracefully", () => {
		const root = createBaseFixture();
		try {
			const snapshot = rebuildSectionIndex(root);
			expect(snapshot.sections).toEqual([]);
			expect(getSectionIndex(root)?.sections).toEqual([]);
		} finally {
			removeTestRoot(root);
		}
	});

	test("getSectionIndex returns null when no index exists", () => {
		const root = createBaseFixture();
		try {
			expect(getSectionIndex(root)).toBeNull();
		} finally {
			removeTestRoot(root);
		}
	});

	test("getSectionIndex returns parsed index when exists", () => {
		const root = createSectionFixture();
		try {
			rebuildSectionIndex(root);
			const index = getSectionIndex(root);
			expect(index?.sections.length).toBe(4);
			expect(index?.sections[0]?.title).toBe("Decision");
		} finally {
			removeTestRoot(root);
		}
	});

	test("buildSectionIndexSnapshot does not persist index", () => {
		const root = createSectionFixture();
		try {
			const snapshot = buildSectionIndexSnapshot(root);
			expect(snapshot.sections.length).toBe(4);
			expect(getSectionIndex(root)).toBeNull();
		} finally {
			removeTestRoot(root);
		}
	});

	test("resolveSection finds section by ref", () => {
		const root = createSectionFixture();
		try {
			rebuildSectionIndex(root);
			const section = resolveSection(root, "spec:alpha#overview");
			expect(section?.title).toBe("Overview");
			expect(section?.level).toBe(2);
			expect(section?.line_start).toBe(9);
			expect(section?.line_end).toBe(16);
		} finally {
			removeTestRoot(root);
		}
	});

	test("resolveSection fails closed and does not persist a missing index", () => {
		const root = createSectionFixture();
		try {
			expect(() => resolveSection(root, "spec:alpha#overview")).toThrow(
				SectionIndexTrustError,
			);
			expect(getSectionIndex(root)).toBeNull();
		} finally {
			removeTestRoot(root);
		}
	});

	test("resolveSection returns null for unknown ref", () => {
		const root = createSectionFixture();
		try {
			rebuildSectionIndex(root);
			expect(resolveSection(root, "spec:alpha#missing")).toBeNull();
		} finally {
			removeTestRoot(root);
		}
	});

	test("section parsing extracts title level and line numbers", () => {
		const root = createSectionFixture();
		try {
			const snapshot = rebuildSectionIndex(root);
			const details = snapshot.sections.find(
				(entry) => entry.ref === "spec:alpha/specs-alpha-spec#details",
			);
			expect(details).toEqual({
				ref: "spec:alpha/specs-alpha-spec#details",
				title: "Details",
				level: 3,
				line_start: 13,
				line_end: 16,
				source_path: ".afol/adm/specs/alpha-spec.md",
			});
		} finally {
			removeTestRoot(root);
		}
	});

	test("multiple headings in same file produce multiple entries", () => {
		const root = createSectionFixture();
		try {
			const snapshot = rebuildSectionIndex(root);
			const specEntries = snapshot.sections.filter(
				(entry) => entry.source_path === ".afol/adm/specs/alpha-spec.md",
			);
			expect(specEntries.map((entry) => entry.ref)).toEqual([
				"spec:alpha/specs-alpha-spec#overview",
				"spec:alpha/specs-alpha-spec#details",
				"spec:alpha/specs-alpha-spec#notes",
			]);
		} finally {
			removeTestRoot(root);
		}
	});

	test("buildContextBundle returns bundle with correct shape", () => {
		const root = createBundleFixture();
		try {
			const bundle = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				role: "designer",
				surface: "alpha",
			});
			expect(bundle.task_id).toBe("T-01");
			expect(bundle.role).toBe("designer");
			expect(bundle.surface).toBe("alpha");
			expect(bundle.mode).toBe("balanced");
			expect(Array.isArray(bundle.refs)).toBe(true);
			expect(Array.isArray(bundle.rules)).toBe(true);
			expect(Array.isArray(bundle.hooks)).toBe(true);
			expect(Array.isArray(bundle.hook_messages)).toBe(true);
			expect(Array.isArray(bundle.hook_contributions)).toBe(true);
			expect(Array.isArray(bundle.skills)).toBe(true);
			expect(Array.isArray(bundle.tools)).toBe(true);
			expect(Array.isArray(bundle.validation_commands)).toBe(true);
			expect(Array.isArray(bundle.do_not_load)).toBe(true);
			expect(bundle.budget.total_tokens).toBe(2000);
		} finally {
			removeTestRoot(root);
		}
	});

	test("buildContextBundle includes pstr refs rules skills and validation commands", () => {
		const root = createBundleFixture();
		try {
			const bundle = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				role: "designer",
				surface: "alpha",
			});
			expect(bundle.pstr_refs).toEqual(["pstr:alpha-map"]);
			expect(bundle.rules).toContain("RULE-ALPHA");
			expect(bundle.skills).toContain("alpha helper");
			expect(bundle.validation_commands).toContain(
				"afol state validate -S session-1",
			);
			expect(bundle.validation_commands).toContain("bun test");
		} finally {
			removeTestRoot(root);
		}
	});

	test("buildContextBundle includes matching hook contributions", () => {
		const root = createBundleFixture();
		try {
			writeAlphaHook(root);
			const bundle = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				role: "designer",
				surface: "alpha",
			});
			expect(bundle.hooks).toEqual(["HOOK-ALPHA"]);
			expect(bundle.hook_messages).toEqual(["Use alpha hook message."]);
			expect(bundle.hook_contributions).toEqual([
				{
					id: "HOOK-ALPHA",
					path: ".afol/adm/hooks/alpha-hook.md",
					messages: ["Use alpha hook message."],
					tools: ["afol hook resolve --event context.bundle"],
					validation_commands: ["bun run alpha-check"],
					pstr_refs: ["pstr:hook-map"],
					memory_refs: ["memory:hook-alpha"],
					library_refs: ["library:hook-alpha"],
					do_not_load: ["raw plugin payloads"],
				},
			]);
			expect(bundle.tools).toContain(
				"afol hook resolve --event context.bundle",
			);
			expect(bundle.validation_commands).toContain("bun run alpha-check");
			expect(bundle.pstr_refs).toContain("pstr:hook-map");
			expect(bundle.memory_refs).toContain("memory:hook-alpha");
			expect(bundle.library_refs).toContain("library:hook-alpha");
			expect(bundle.do_not_load).toContain("raw plugin payloads");
		} finally {
			removeTestRoot(root);
		}
	});

	test("buildContextBundle includes coordination radar only for orchestrators", () => {
		const root = createBundleFixture();
		try {
			writeCoordinationRadarHook(root);
			const orchestrator = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				role: "orchestrator",
				surface: "alpha",
			});
			const designer = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				role: "designer",
				surface: "alpha",
			});

			expect(orchestrator.hooks).toEqual(["COORDINATION-RADAR"]);
			expect(orchestrator.hook_messages.join("\n")).toContain(
				"afol session radar",
			);
			expect(orchestrator.tools).toContain("afol session radar");
			expect(orchestrator.tools).toContain("afol session radar --json");
			expect(designer.hooks).not.toContain("COORDINATION-RADAR");
			expect(designer.tools).not.toContain("afol session radar");
		} finally {
			removeTestRoot(root);
		}
	});

	test("buildContextBundle injects matching rules once per identity and persists state", () => {
		const root = createBundleFixture();
		try {
			writeInjectableAlphaRule(root);

			const first = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				role: "designer",
				surface: "alpha",
				persistRuleInjection: true,
			});
			expect(first.rule_injection.first_use).toBe(true);
			expect(first.rule_injection.injected.map((rule) => rule.id)).toEqual([
				"RULE-ALPHA",
			]);
			expect(first.rule_injection.already_injected).toEqual([]);
			expect(first.rule_injection.state_path).toBe(
				".afol/data/rules/injection-state.json",
			);

			const state = JSON.parse(
				readFileSync(
					join(root, ".afol", "data", "rules", "injection-state.json"),
					"utf8",
				),
			) as {
				identities: Record<
					string,
					{
						file_path: string | null;
						rules: Record<string, unknown>;
					}
				>;
			};
			const identities = Object.keys(state.identities);
			const expectedIdentity = [
				`${["sess", "ion"].join("")}:session-1`,
				"task:T-01",
				"role:designer",
				"surface:alpha",
			].join("|");
			expect(identities).toEqual([expectedIdentity]);
			expect(state.identities[identities[0] ?? ""]?.file_path).toBeNull();
			expect(
				Object.keys(state.identities[identities[0] ?? ""]?.rules ?? {}),
			).toEqual(["RULE-ALPHA"]);

			const second = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				role: "designer",
				surface: "alpha",
				persistRuleInjection: true,
			});
			expect(second.rule_injection.first_use).toBe(false);
			expect(second.rule_injection.injected).toEqual([]);
			expect(
				second.rule_injection.already_injected.map((rule) => rule.id),
			).toEqual(["RULE-ALPHA"]);
		} finally {
			removeTestRoot(root);
		}
	});

	test("buildContextBundle injects rule body without YAML frontmatter", () => {
		const root = createBundleFixture();
		try {
			writeFileSync(
				join(root, ".agents", "config.json"),
				JSON.stringify({
					version: "0.1.0",
					rules: {
						resolver: {
							max_chars_per_rule: 20,
							max_chars_total: 30,
						},
					},
				}),
				"utf8",
			);
			writeInjectableAlphaRule(root);
			const body = "# Alpha rule\nBody.\n";
			writeFileSync(
				join(root, ".afol", "adm", "rules", "alpha.md"),
				[
					"---",
					`summary: ${"x".repeat(80)}`,
					"status: active",
					"---",
					"",
					body,
				].join("\n"),
				"utf8",
			);

			const bundle = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				role: "designer",
				surface: "alpha",
				persistRuleInjection: true,
			});
			expect(bundle.rule_injection.injected[0]?.content).toBe(body);
			expect(bundle.rule_injection.injected[0]?.char_count).toBe(body.length);
			expect(bundle.rule_injection.omitted).toEqual([]);

			const state = JSON.parse(
				readFileSync(ruleInjectionStatePath(root), "utf8"),
			) as {
				identities: Record<
					string,
					{ rules: Record<string, { char_count?: number }> }
				>;
			};
			const identity = Object.keys(state.identities)[0] ?? "";
			expect(state.identities[identity]?.rules["RULE-ALPHA"]?.char_count).toBe(
				body.length,
			);
		} finally {
			removeTestRoot(root);
		}
	});

	test("buildContextBundle does not reinject when only rule frontmatter changes", () => {
		const root = createBundleFixture();
		try {
			writeInjectableAlphaRule(root);
			const body = "# Alpha rule\n\nStable governance text.\n";
			writeFileSync(
				join(root, ".afol", "adm", "rules", "alpha.md"),
				["---", "summary: first", "---", "", body].join("\n"),
				"utf8",
			);

			const first = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				role: "designer",
				surface: "alpha",
				persistRuleInjection: true,
			});
			expect(first.rule_injection.injected[0]?.content).toBe(body);
			expect(first.rule_injection.injected[0]?.char_count).toBe(body.length);

			const initialState = JSON.parse(
				readFileSync(ruleInjectionStatePath(root), "utf8"),
			) as {
				identities: Record<
					string,
					{
						rules: Record<
							string,
							{ char_count?: number; content_hash?: string }
						>;
					}
				>;
			};
			const identity = Object.keys(initialState.identities)[0] ?? "";
			const initialRuleState =
				initialState.identities[identity]?.rules["RULE-ALPHA"];

			writeFileSync(
				join(root, ".afol", "adm", "rules", "alpha.md"),
				["---", "summary: second", "status: active", "---", "", body].join(
					"\n",
				),
				"utf8",
			);

			const second = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				role: "designer",
				surface: "alpha",
				persistRuleInjection: true,
			});
			expect(second.rule_injection.injected).toEqual([]);
			expect(
				second.rule_injection.already_injected.map((rule) => rule.id),
			).toEqual(["RULE-ALPHA"]);

			const nextState = JSON.parse(
				readFileSync(ruleInjectionStatePath(root), "utf8"),
			) as typeof initialState;
			const nextRuleState = nextState.identities[identity]?.rules["RULE-ALPHA"];
			expect(nextRuleState?.char_count).toBe(initialRuleState?.char_count);
			expect(nextRuleState?.content_hash).toBe(initialRuleState?.content_hash);
		} finally {
			removeTestRoot(root);
		}
	});

	test("buildContextBundle reinjects matching rules when markdown content changes", () => {
		const root = createBundleFixture();
		try {
			writeInjectableAlphaRule(root);
			writeFileSync(
				join(root, ".afol", "adm", "rules", "alpha.md"),
				"# Alpha rule\n\nInitial governance text.\n",
				"utf8",
			);

			const first = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				role: "designer",
				surface: "alpha",
				persistRuleInjection: true,
			});
			expect(first.rule_injection.injected[0]?.content).toContain("Initial");

			writeFileSync(
				join(root, ".afol", "adm", "rules", "alpha.md"),
				"# Alpha rule\n\nUpdated governance text.\n",
				"utf8",
			);

			const second = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				role: "designer",
				surface: "alpha",
				persistRuleInjection: true,
			});
			expect(second.rule_injection.injected.map((rule) => rule.id)).toEqual([
				"RULE-ALPHA",
			]);
			expect(second.rule_injection.injected[0]?.content).toContain("Updated");
			expect(second.rule_injection.already_injected).toEqual([]);

			const state = JSON.parse(
				readFileSync(ruleInjectionStatePath(root), "utf8"),
			) as {
				identities: Record<
					string,
					{ rules: Record<string, { content_hash?: string }> }
				>;
			};
			const identity = Object.keys(state.identities)[0] ?? "";
			expect(
				state.identities[identity]?.rules["RULE-ALPHA"]?.content_hash,
			).toBeTruthy();
		} finally {
			removeTestRoot(root);
		}
	});

	test("buildContextBundle omits optional injected rules with missing markdown files and does not persist them", () => {
		const root = createBundleFixture();
		try {
			writeFileSync(
				join(root, ".afol", "adm", "rules", "index.json"),
				JSON.stringify({
					rules: [
						{
							id: "RULE-PRESENT",
							name: "present rule",
							path: "present.md",
							surfaces: ["alpha"],
							work_types: ["delivery"],
							inject: "always",
							priority: 100,
						},
						{
							id: "RULE-MISSING",
							name: "missing rule",
							path: "missing.md",
							surfaces: ["alpha"],
							work_types: ["delivery"],
							inject: "always",
							priority: 90,
						},
					],
				}),
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "adm", "rules", "present.md"),
				"# Present rule\n",
				"utf8",
			);

			const bundle = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				role: "designer",
				surface: "alpha",
				persistRuleInjection: true,
			});
			expect(bundle.rule_injection.injected.map((rule) => rule.id)).toEqual([
				"RULE-PRESENT",
			]);
			expect(bundle.rule_injection.omitted.map((rule) => rule.id)).toEqual([
				"RULE-MISSING",
			]);
			expect(bundle.rule_injection.omitted[0]?.reason).toContain(
				"rule markdown file missing",
			);
			expect(bundle.rule_injection.omitted[0]?.reason).toContain("missing.md");

			const state = JSON.parse(
				readFileSync(ruleInjectionStatePath(root), "utf8"),
			) as {
				identities: Record<string, { rules: Record<string, unknown> }>;
			};
			const identity = Object.keys(state.identities)[0] ?? "";
			expect(Object.keys(state.identities[identity]?.rules ?? {})).toEqual([
				"RULE-PRESENT",
			]);
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx bundle --json rejects corrupt rule injection state without overwriting it", async () => {
		const root = createBundleFixture();
		try {
			writeInjectableAlphaRule(root);
			writeFileSync(
				join(root, ".afol", "adm", "rules", "alpha.md"),
				"# Alpha rule\n",
				"utf8",
			);
			const statePath = ruleInjectionStatePath(root);
			mkdirSync(join(root, ".afol", "data", "rules"), { recursive: true });
			writeFileSync(statePath, "{not-json\n", "utf8");

			const captured = captureIo();
			expect(
				await runContextCommand(
					"bundle",
					[
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
						"--json",
					],
					root,
					captured.io,
				),
			).toBe(1);
			expect(captured.stderr).toEqual([]);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				error: { code: string; message: string };
			};
			expect(payload.error.code).toBe("CTX_RULE_INJECTION_ERROR");
			expect(payload.error.message).toContain("Invalid rule injection state");
			expect(readFileSync(statePath, "utf8")).toBe("{not-json\n");
		} finally {
			removeTestRoot(root);
		}
	});

	test("buildContextBundle infers TS surface and language from file path", () => {
		const root = createBundleFixture();
		try {
			mkdirSync(join(root, "cli", "commands"), { recursive: true });
			writeFileSync(
				join(root, "cli", "commands", "context.ts"),
				"export {};\n",
			);
			writeFileSync(
				join(root, ".afol", "adm", "rules", "index.json"),
				JSON.stringify({
					rules: [
						{
							id: "RULE-CONTEXT-TS",
							name: "context ts rule",
							path: "context-ts.md",
							domains: ["cli"],
							surfaces: ["context"],
							work_types: ["delivery"],
							languages: ["ts"],
							inject: "always",
							priority: 95,
						},
					],
				}),
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "adm", "rules", "context-ts.md"),
				"# Context TS rule\n",
				"utf8",
			);

			const bundle = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				role: "designer",
				filePath: "cli/commands/context.ts",
				persistRuleInjection: true,
			});
			expect(bundle.surface).toBe("context");
			expect(bundle.file_path).toBe("cli/commands/context.ts");
			expect(bundle.rules).toContain("RULE-CONTEXT-TS");
			expect(bundle.rule_injection.injected.map((rule) => rule.id)).toEqual([
				"RULE-CONTEXT-TS",
			]);
			expect(bundle.rule_injection.identity).toContain(
				"|file:cli/commands/context.ts",
			);
		} finally {
			removeTestRoot(root);
		}
	});

	test("buildContextBundle omits optional injected rules that exceed total budget", () => {
		const root = createBundleFixture();
		try {
			writeFileSync(
				join(root, ".agents", "config.json"),
				JSON.stringify({
					version: "0.1.0",
					rules: {
						resolver: {
							max_chars_per_rule: 2000,
							max_chars_total: 30,
						},
					},
				}),
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "adm", "rules", "index.json"),
				JSON.stringify({
					rules: [
						{
							id: "RULE-FIRST",
							name: "first rule",
							path: "first.md",
							surfaces: ["alpha"],
							work_types: ["delivery"],
							inject: "always",
							priority: 100,
						},
						{
							id: "RULE-SECOND",
							name: "second rule",
							path: "second.md",
							surfaces: ["alpha"],
							work_types: ["delivery"],
							inject: "always",
							priority: 90,
						},
					],
				}),
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "adm", "rules", "first.md"),
				"A".repeat(18),
			);
			writeFileSync(
				join(root, ".afol", "adm", "rules", "second.md"),
				"B".repeat(18),
			);

			const bundle = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				role: "designer",
				surface: "alpha",
				persistRuleInjection: true,
			});
			expect(bundle.rule_injection.injected.map((rule) => rule.id)).toEqual([
				"RULE-FIRST",
			]);
			expect(bundle.rule_injection.omitted.map((rule) => rule.id)).toEqual([
				"RULE-SECOND",
			]);
			expect(bundle.rule_injection.omitted[0]?.reason).toContain(
				"max_total_chars",
			);
			expect(bundle.rule_injection.budget.used_chars).toBe(18);
		} finally {
			removeTestRoot(root);
		}
	});

	test("buildContextBundle omits injected rule content that would exceed token budget", () => {
		const root = createBundleFixture();
		try {
			writeFileSync(
				join(root, ".agents", "config.json"),
				JSON.stringify({
					version: "0.1.0",
					rules: {
						resolver: {
							max_chars_per_rule: 20000,
							max_chars_total: 20000,
						},
					},
				}),
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "adm", "rules", "index.json"),
				JSON.stringify({
					rules: [
						{
							id: "RULE-BIG",
							name: "big rule",
							path: "big.md",
							surfaces: ["alpha"],
							work_types: ["delivery"],
							inject: "always",
							priority: 100,
						},
					],
				}),
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "adm", "rules", "big.md"),
				"Budget pressure.\n".repeat(1000),
				"utf8",
			);

			const bundle = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				role: "designer",
				surface: "alpha",
				persistRuleInjection: true,
			});

			expect(bundle.budget.used_tokens).toBeLessThanOrEqual(
				bundle.budget.total_tokens,
			);
			expect(bundle.rule_injection.injected).toEqual([]);
			expect(bundle.rule_injection.omitted.map((rule) => rule.id)).toContain(
				"RULE-BIG",
			);
			expect(bundle.rule_injection.omitted[0]?.reason).toContain(
				"bundle token budget",
			);

			const state = JSON.parse(
				readFileSync(ruleInjectionStatePath(root), "utf8"),
			) as {
				identities: Record<
					string,
					{ rules: Record<string, { content_hash?: string }> }
				>;
			};
			const identity = Object.keys(state.identities)[0] ?? "";
			expect(state.identities[identity]?.rules["RULE-BIG"]).toBeUndefined();
		} finally {
			removeTestRoot(root);
		}
	});

	test("buildContextBundle respects token budget", () => {
		const root = createBundleFixture({ inflate: true });
		try {
			const bundle = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				role: "designer",
				surface: "alpha",
			});
			expect(bundle.budget.used_tokens).toBeLessThanOrEqual(
				bundle.budget.total_tokens,
			);
			expect(bundle.refs.length).toBeGreaterThan(0);
			expect(bundle.rules.length).toBeGreaterThan(0);
			expect(bundle.skills.length).toBeGreaterThan(0);
		} finally {
			removeTestRoot(root);
		}
	});

	test("compact mode uses 1000 token budget and no expanded sections", () => {
		const root = createBundleFixture();
		try {
			writeAlphaHook(root);
			const bundle = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				role: "designer",
				surface: "alpha",
				mode: "compact",
			});
			expect(bundle.mode).toBe("compact");
			expect(bundle.budget.total_tokens).toBe(1000);
			expect(bundle.hooks).toEqual([]);
			expect(bundle.hook_messages).toEqual([]);
			expect(bundle.hook_contributions).toEqual([]);
			expect(bundle.expanded_sections).toBeUndefined();
		} finally {
			removeTestRoot(root);
		}
	});

	test("deep mode includes expanded sections", () => {
		const root = createBundleFixture();
		try {
			const bundle = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				role: "designer",
				surface: "alpha",
				mode: "deep",
			});
			expect(bundle.mode).toBe("deep");
			expect(bundle.budget.total_tokens).toBe(4000);
			expect(bundle.expanded_sections?.length).toBeGreaterThan(0);
			expect(bundle.expanded_sections?.[0]?.snippet).toContain("## Overview");
		} finally {
			removeTestRoot(root);
		}
	});

	test("tokenmax mode uses 8000 token budget", () => {
		const root = createBundleFixture();
		try {
			const bundle = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				role: "designer",
				surface: "alpha",
				mode: "tokenmax",
			});
			expect(bundle.mode).toBe("tokenmax");
			expect(bundle.budget.total_tokens).toBe(8000);
		} finally {
			removeTestRoot(root);
		}
	});

	test("buildContextBundle populates gaps when session and task are missing", () => {
		const root = createBundleFixture();
		try {
			const bundle = buildContextBundle(root, {
				surface: "alpha",
				role: "designer",
			});
			expect(bundle.gaps).toContain("missing session");
			expect(bundle.gaps).toContain("missing task record");
			expect(bundle.gaps).toContain("no hydrated session state");
		} finally {
			removeTestRoot(root);
		}
	});

	test("buildContextBundle reports a section gap instead of unrelated fallback content", () => {
		const root = createBundleFixture();
		try {
			const bundle = buildContextBundle(root, {
				surface: "surface-with-no-match",
				role: "designer",
			});
			expect(bundle.refs).toEqual([]);
			expect(bundle.gaps).toContain("no matching spec sections");
		} finally {
			removeTestRoot(root);
		}
	});

	test("buildContextBundle populates do_not_load list", () => {
		const root = createBundleFixture();
		try {
			const bundle = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				role: "designer",
				surface: "alpha",
			});
			expect(bundle.do_not_load).toEqual([
				"full docs/arc/** trees",
				"whole .afol/wb session dumps",
				"raw .afol/state/afol.db",
				"entire .afol/library/** trees",
				"entire .afol/memory/** trees",
			]);
		} finally {
			removeTestRoot(root);
		}
	});

	test("buildContextBundle includes active memory refs and excludes inactive statuses", () => {
		const root = createBundleFixture({ memoryRefs: true });
		try {
			const bundle = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				role: "designer",
				surface: "alpha",
			});
			expect(bundle.memory_refs).toEqual(["memory:MEM-ACTIVE"]);
			expect(bundle.memory_refs.join(" ")).not.toContain("MEM-ARCHIVED");
			expect(bundle.memory_refs.join(" ")).not.toContain("MEM-REJECTED");
			expect(bundle.memory_refs.join(" ")).not.toContain("MEM-INVALIDATED");
		} finally {
			removeTestRoot(root);
		}
	});

	test("buildContextBundle queries memory and library refs by separate terms with dedupe", () => {
		const root = createBundleFixture();
		try {
			writeMemory(root, {
				updated_at: "2026-06-13T00:00:00.000Z",
				entries: [
					{
						id: "MEM-TASK",
						title: "Task-only memory",
						body: "T-01 isolated memory",
						status: "active",
						created_at: "2026-06-13T00:00:00.000Z",
						updated_at: "2026-06-13T00:00:00.000Z",
						tags: [],
					},
					{
						id: "MEM-SURFACE",
						title: "Surface-only memory",
						body: "alpha isolated memory",
						status: "active",
						created_at: "2026-06-13T00:00:00.000Z",
						updated_at: "2026-06-13T00:00:00.000Z",
						tags: [],
					},
					{
						id: "MEM-BOTH",
						title: "Shared memory",
						body: "T-01 alpha shared memory",
						status: "active",
						created_at: "2026-06-13T00:00:00.000Z",
						updated_at: "2026-06-13T00:00:00.000Z",
						tags: [],
					},
				],
			});
			proposeTopic(root, "alpha", "Alpha library", [
				{
					id: "SRC-ALPHA",
					url: "https://example.com/alpha",
					title: "Alpha source",
					accessed_at: "2026-06-13T00:00:00.000Z",
				},
			]);
			addClaim(root, "alpha", {
				id: "CLAIM-BOTH",
				text: "T-01 alpha shared claim",
				source_ids: ["SRC-ALPHA"],
				status: "current",
				created_at: "2026-06-13T00:00:00.000Z",
			});
			proposeTopic(root, "task-only", "Task-only library", [
				{
					id: "SRC-TASK",
					url: "https://example.com/task",
					title: "Task source",
					accessed_at: "2026-06-13T00:00:00.000Z",
				},
			]);
			addClaim(root, "task-only", {
				id: "CLAIM-TASK",
				text: "T-01 isolated claim",
				source_ids: ["SRC-TASK"],
				status: "current",
				created_at: "2026-06-13T00:00:00.000Z",
			});
			proposeTopic(root, "surface-only", "Surface-only library", [
				{
					id: "SRC-SURFACE",
					url: "https://example.com/surface",
					title: "Surface source",
					accessed_at: "2026-06-13T00:00:00.000Z",
				},
			]);
			addClaim(root, "surface-only", {
				id: "CLAIM-SURFACE",
				text: "alpha isolated claim",
				source_ids: ["SRC-SURFACE"],
				status: "current",
				created_at: "2026-06-13T00:00:00.000Z",
			});

			const bundle = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				role: "designer",
				surface: "alpha",
			});

			expect(bundle.memory_refs).toEqual([
				"memory:MEM-TASK",
				"memory:MEM-BOTH",
				"memory:MEM-SURFACE",
			]);
			expect(bundle.library_refs).toContain("library:alpha#CLAIM-BOTH");
			expect(bundle.library_refs).toContain("library:task-only#CLAIM-TASK");
			expect(bundle.library_refs).toContain(
				"library:surface-only#CLAIM-SURFACE",
			);
			expect(
				bundle.library_refs.filter((ref) => ref === "library:alpha#CLAIM-BOTH"),
			).toHaveLength(1);
		} finally {
			removeTestRoot(root);
		}
	});

	test("buildContextBundle includes current library claim refs and excludes invalidated claims", () => {
		const root = createBundleFixture({ libraryRefs: true });
		try {
			const bundle = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				role: "designer",
				surface: "alpha",
			});
			expect(bundle.library_refs).toContain("library:alpha#CLAIM-CURRENT");
			expect(
				bundle.library_refs.some((ref) => ref.startsWith("library-graph:")),
			).toBe(true);
			expect(bundle.library_refs.join(" ")).not.toContain("CLAIM-INVALID");
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx build returns 0 and rebuilds sections", async () => {
		const root = createSectionFixture();
		try {
			const captured = captureIo();
			expect(await runContextCommand("build", [], root, captured.io)).toBe(0);
			expect(getSectionIndex(root)?.sections.length).toBe(4);
			expect(captured.stdout[0]).toContain("ctx build: ok sections=4");
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx defaults to summary without rebuilding sections", async () => {
		const root = createSectionFixture();
		try {
			const captured = captureIo();
			expect(await runContextCommand("", [], root, captured.io)).toBe(0);
			expect(getSectionIndex(root)).toBeNull();
			expect(captured.stdout[0]).toContain("ctx: choose an action");
			expect(captured.stdout[0]).toContain("hint: run afol ctx build");
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx --json defaults to summary without rebuilding sections", async () => {
		const root = createSectionFixture();
		try {
			const captured = captureIo();
			expect(await runContextCommand("", ["--json"], root, captured.io)).toBe(
				0,
			);
			expect(getSectionIndex(root)).toBeNull();
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				action: string;
				ok: boolean;
				data: { sections: number; write_actions: string[] };
			};
			expect(payload.action).toBe("ctx.summary");
			expect(payload.ok).toBe(true);
			expect(payload.data.sections).toBe(0);
			expect(payload.data.write_actions).toEqual(["build"]);
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx section fails closed without rebuilding a missing index", async () => {
		const root = createSectionFixture();
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"section",
					["--ref", "spec:alpha#overview"],
					root,
					captured.io,
				),
			).toBe(1);
			expect(getSectionIndex(root)).toBeNull();
			expect(existsSync(sectionIndexPath(root))).toBe(false);
			expect(captured.stderr[0]).toContain("afol ctx build");
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx bundle --full fails closed without rebuilding a missing index", async () => {
		const root = createSectionFixture();
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"bundle",
					["--json", "--full", "--mode", "deep"],
					root,
					captured.io,
				),
			).toBe(1);
			expect(getSectionIndex(root)).toBeNull();
			expect(existsSync(sectionIndexPath(root))).toBe(false);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				error?: { code?: string; message?: string };
			};
			expect(payload.error?.code).toBe("CTX_TRUST_ERROR");
			expect(payload.error?.message).toContain("afol ctx build");
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx explain fails closed without rebuilding a missing index", async () => {
		const root = createSectionFixture();
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"explain",
					["--mode", "deep"],
					root,
					captured.io,
				),
			).toBe(1);
			expect(getSectionIndex(root)).toBeNull();
			expect(existsSync(sectionIndexPath(root))).toBe(false);
			expect(captured.stderr[0]).toContain("afol ctx build");
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx parses leading --json as summary flag", async () => {
		const root = createSectionFixture();
		try {
			const captured = captureIo();
			expect(await runContextCommand("--json", [], root, captured.io)).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				action: string;
				ok: boolean;
			};
			expect(payload.action).toBe("ctx.summary");
			expect(payload.ok).toBe(true);
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx build --json returns JSON", async () => {
		const root = createSectionFixture();
		try {
			const captured = captureIo();
			expect(
				await runContextCommand("build", ["--json"], root, captured.io),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				action: string;
				exit_code: number;
				data: { snapshot: { sections: unknown[] } };
				snapshot: { sections: unknown[] };
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.action).toBe("ctx.build");
			expect(payload.exit_code).toBe(0);
			expect(payload.data.snapshot.sections).toHaveLength(4);
			expect(payload.snapshot.sections).toHaveLength(4);
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx build --json is denied in restricted context", async () => {
		const root = createSectionFixture();
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"build",
					["--json"],
					root,
					captured.io,
					agentOperationContext(),
				),
			).toBe(2);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				ok: boolean;
				action: string;
				error: { code: string };
				exit_code: number;
			};
			expect(payload.ok).toBe(false);
			expect(payload.action).toBe("ctx.build");
			expect(payload.exit_code).toBe(2);
			expect(payload.error.code).toBe("approval-required");
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx bundle returns bundle", async () => {
		const root = createBundleFixture();
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"bundle",
					[
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
					],
					root,
					captured.io,
				),
			).toBe(0);
			expect(captured.stdout[0]).toContain("task: T-01");
			expect(captured.stdout[0]).toContain("mode: balanced");
			expect(captured.stdout[0]).toContain("refs:");
			expect(captured.stdout[0]).toContain("pstr_refs:");
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx bundle resolves the active hydrated session when -S is omitted", async () => {
		const root = createBundleFixture();
		const saved = {
			AFOL_CI: process.env.AFOL_CI,
			CI: process.env.CI,
		};
		try {
			delete process.env.AFOL_CI;
			delete process.env.CI;
			const taskPath = join(
				root,
				".afol",
				"wb",
				"session-1",
				"alpha_task_1.md",
			);
			const task = readFileSync(taskPath, "utf8");
			rmSync(taskPath);
			writeFileSync(
				join(root, ".afol", "wb", "session-1", "session-1_task_01.md"),
				task,
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "wb", ".active_session"),
				"session-1\n",
				"utf8",
			);
			hydrateSession(root, "session-1");
			const captured = captureIo();
			expect(
				await runContextCommand(
					"bundle",
					["-T", "T-01", "--role", "designer", "--surface", "alpha", "--json"],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				data: { task_id: string; gaps: string[] };
			};
			expect(payload.data.task_id).toBe("T-01");
			expect(payload.data.gaps).not.toContain("missing session");
			expect(payload.data.gaps).not.toContain("no hydrated session state");
		} finally {
			if (saved.AFOL_CI === undefined) delete process.env.AFOL_CI;
			else process.env.AFOL_CI = saved.AFOL_CI;
			if (saved.CI === undefined) delete process.env.CI;
			else process.env.CI = saved.CI;
			removeTestRoot(root);
		}
	});

	test("afol ctx bundle warns when applicable rules exceed injection limits", async () => {
		const root = createBundleFixture();
		try {
			writeFileSync(
				join(root, ".agents", "config.json"),
				JSON.stringify({
					version: "0.1.0",
					rules: {
						resolver: {
							max_chars_per_rule: 20,
							max_chars_total: 100,
						},
					},
				}),
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "adm", "rules", "index.json"),
				JSON.stringify({
					rules: [
						{
							id: "RULE-BIG",
							name: "big rule",
							path: "big.md",
							surfaces: ["alpha"],
							work_types: ["delivery"],
							inject: "always",
							priority: 100,
						},
					],
				}),
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "adm", "rules", "big.md"),
				"X".repeat(25),
				"utf8",
			);

			const captured = captureIo();
			expect(
				await runContextCommand(
					"bundle",
					[
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
					],
					root,
					captured.io,
				),
			).toBe(0);
			expect(captured.stdout[0]).toContain(
				"warnings: RULE-BIG: rule exceeds max_chars_per_rule (25/20)",
			);
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx bundle --full works without trusted when pstr is missing", async () => {
		const root = createBundleFixture({ pstr: "missing" });
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"bundle",
					[
						"--full",
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
						"--json",
					],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				action: string;
				exit_code: number;
				data: { pstr_refs: string[] };
				pstr_refs: string[];
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.action).toBe("ctx.bundle");
			expect(payload.exit_code).toBe(0);
			expect(payload.data.pstr_refs).toEqual([]);
			expect(payload.pstr_refs).toEqual([]);
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx bundle --trusted fails when pstr is missing", async () => {
		const root = createBundleFixture({ pstr: "missing" });
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"bundle",
					[
						"--trusted",
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
					],
					root,
					captured.io,
				),
			).toBe(1);
			expect(captured.stderr[0]).toContain("missing pstr index snapshot");
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx bundle --trusted fails with compact json on stale pstr", async () => {
		const root = createBundleFixture({ pstr: "stale" });
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"bundle",
					[
						"--trusted",
						"--json",
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
					],
					root,
					captured.io,
				),
			).toBe(1);
			expect(captured.stderr).toHaveLength(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				exit_code: number;
				error: { message: string };
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(false);
			expect(payload.exit_code).toBe(1);
			expect(payload.error.message).toContain("stale pstr index snapshot");
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx explain --trusted fails on stale pstr", async () => {
		const root = createBundleFixture({ pstr: "stale" });
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"explain",
					[
						"--trusted",
						"--json",
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
					],
					root,
					captured.io,
				),
			).toBe(1);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				exit_code: number;
				error: { message: string };
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(false);
			expect(payload.exit_code).toBe(1);
			expect(payload.error.message).toContain("stale pstr index snapshot");
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx bundle --json returns compact JSON", async () => {
		const root = createBundleFixture();
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"bundle",
					[
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
						"--json",
					],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				action: string;
				exit_code: number;
				data: {
					task_id: string;
					mode: string;
					refs: number;
					hooks: number;
					pstr_refs: string[];
				};
				task_id: string;
				mode: string;
				refs: number;
				hooks: number;
				pstr_refs: string[];
				rules: string[];
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.action).toBe("ctx.bundle");
			expect(payload.exit_code).toBe(0);
			expect(payload.data.task_id).toBe("T-01");
			expect(payload.task_id).toBe("T-01");
			expect(payload.mode).toBe("balanced");
			expect(payload.refs).toBeGreaterThan(0);
			expect(payload.data.refs).toBe(payload.refs);
			expect(payload.pstr_refs).toEqual(["pstr:alpha-map"]);
			expect(Array.isArray(payload.rules)).toBe(true);
			expect(typeof payload.hooks).toBe("number");
			expect(typeof payload.data.hooks).toBe("number");
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx bundle --json --summary returns compact explanation JSON", async () => {
		const root = createBundleFixture();
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"bundle",
					[
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
						"--json",
						"--summary",
					],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				action: string;
				exit_code: number;
				data: {
					why: { included: string[]; excluded: string[] };
					bundle_size: { refs: number; pstr_refs: number };
					bundle?: unknown;
					refs?: unknown;
				};
				bundle?: unknown;
				bundle_size?: { refs: number };
				refs?: unknown;
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.action).toBe("ctx.bundle");
			expect(payload.exit_code).toBe(0);
			expect(payload.data.why.included.length).toBeGreaterThan(0);
			expect(payload.data.bundle_size.refs).toBeGreaterThan(0);
			expect(payload.data.bundle_size.pstr_refs).toBe(1);
			expect(payload.bundle_size?.refs).toBe(payload.data.bundle_size.refs);
			expect(payload.data.bundle).toBeUndefined();
			expect(payload.bundle).toBeUndefined();
			expect(payload.data.refs).toBeUndefined();
			expect(payload.refs).toBeUndefined();
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx bundle --json returns injection error when a required rule exceeds budget", async () => {
		const root = createBundleFixture();
		try {
			writeFileSync(
				join(root, ".agents", "config.json"),
				JSON.stringify({
					version: "0.1.0",
					rules: {
						resolver: {
							max_chars_per_rule: 10,
							max_chars_total: 10,
						},
					},
				}),
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "adm", "rules", "index.json"),
				JSON.stringify({
					rules: [
						{
							id: "RULE-REQUIRED",
							name: "required rule",
							path: "required.md",
							required: true,
							surfaces: ["alpha"],
							work_types: ["delivery"],
							inject: "always",
							priority: 100,
						},
					],
				}),
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "adm", "rules", "required.md"),
				"01234567890",
				"utf8",
			);

			const captured = captureIo();
			expect(
				await runContextCommand(
					"bundle",
					[
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
						"--json",
					],
					root,
					captured.io,
				),
			).toBe(1);
			expect(captured.stderr).toEqual([]);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				exit_code: number;
				error: {
					code: string;
					message: string;
				};
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(false);
			expect(payload.exit_code).toBe(1);
			expect(payload.error.code).toBe("CTX_RULE_INJECTION_ERROR");
			expect(payload.error.message).toContain("RULE-REQUIRED");
			expect(payload.error.message).toContain("max_chars_per_rule");
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx bundle --json returns injection error when a required rule file is missing", async () => {
		const root = createBundleFixture();
		try {
			writeFileSync(
				join(root, ".afol", "adm", "rules", "index.json"),
				JSON.stringify({
					rules: [
						{
							id: "RULE-REQUIRED",
							name: "required rule",
							path: "required.md",
							required: true,
							surfaces: ["alpha"],
							work_types: ["delivery"],
							inject: "always",
							priority: 100,
						},
					],
				}),
				"utf8",
			);

			const captured = captureIo();
			expect(
				await runContextCommand(
					"bundle",
					[
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
						"--json",
					],
					root,
					captured.io,
				),
			).toBe(1);
			expect(captured.stderr).toEqual([]);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				exit_code: number;
				error: {
					code: string;
					message: string;
				};
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(false);
			expect(payload.exit_code).toBe(1);
			expect(payload.error.code).toBe("CTX_RULE_INJECTION_ERROR");
			expect(payload.error.message).toContain("RULE-REQUIRED");
			expect(payload.error.message).toContain("rule markdown file missing");
			expect(existsSync(ruleInjectionStatePath(root))).toBe(false);
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx bundle --json rejects invalid indexed rules before fallback injection", async () => {
		const root = createBundleFixture();
		try {
			writeFileSync(
				join(root, ".afol", "adm", "rules", "index.json"),
				"{not-json\n",
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "adm", "rules", "RULE-001-fallback.md"),
				"# Fallback\n",
				"utf8",
			);

			const captured = captureIo();
			expect(
				await runContextCommand(
					"bundle",
					[
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
						"--json",
					],
					root,
					captured.io,
				),
			).toBe(1);
			expect(captured.stderr).toEqual([]);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				error: { code: string; message: string };
			};
			expect(payload.error.code).toBe("CTX_RULE_INJECTION_ERROR");
			expect(payload.error.message).toContain("Invalid rules index");
			expect(existsSync(ruleInjectionStatePath(root))).toBe(false);
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx bundle --trusted passes after pstr rebuild and hydrated state", async () => {
		const root = createBundleFixture({ pstr: "missing" });
		try {
			mkdirSync(join(root, "cli"), { recursive: true });
			mkdirSync(join(root, "src", "project-template"), { recursive: true });
			writeFileSync(
				join(root, "cli", "trusted.ts"),
				"export const trusted = true;\n",
				"utf8",
			);
			writeFileSync(
				join(root, "src", "project-template", "index.ts"),
				"export const template = true;\n",
				"utf8",
			);
			rebuildSectionIndex(root);
			rebuildPstrIndex(root);
			expect(validatePstrIndex(root).ok).toBe(true);
			hydrateSession(root, "session-1");
			expect(validateState(root, "session-1").ok).toBe(true);
			const captured = captureIo();
			expect(
				await runContextCommand(
					"bundle",
					[
						"--trusted",
						"--json",
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
					],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				action: string;
				exit_code: number;
				data: { pstr_refs: string[] };
				pstr_refs: string[];
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.action).toBe("ctx.bundle");
			expect(payload.exit_code).toBe(0);
			expect(payload.data.pstr_refs.length).toBeGreaterThan(0);
			expect(payload.pstr_refs.length).toBeGreaterThan(0);
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx bundle --json returns JSON with graph refs and project_health", async () => {
		const root = createBundleFixture();
		try {
			writeInjectableAlphaRule(root);
			const captured = captureIo();
			expect(
				await runContextCommand(
					"bundle",
					[
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
						"--json",
					],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				action: string;
				exit_code: number;
				data: {
					task_id: string;
					mode: string;
					refs: number;
					pstr_refs: string[];
					memory_refs: string[];
					library_refs: string[];
				};
				task_id: string;
				mode: string;
				refs: number;
				pstr_refs: string[];
				memory_refs: string[];
				library_refs: string[];
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.action).toBe("ctx.bundle");
			expect(payload.exit_code).toBe(0);
			expect(payload.data.task_id).toBe("T-01");
			expect(payload.task_id).toBe("T-01");
			expect(payload.mode).toBe("balanced");
			expect(payload.refs).toBeGreaterThan(0);
			expect(payload.data.refs).toBe(payload.refs);
			expect(payload.pstr_refs).toEqual(["pstr:alpha-map"]);
			expect(Array.isArray(payload.data.memory_refs)).toBe(true);
			expect(Array.isArray(payload.data.library_refs)).toBe(true);
			expect(Array.isArray(payload.memory_refs)).toBe(true);
			expect(Array.isArray(payload.library_refs)).toBe(true);
			expect(existsSync(ruleInjectionStatePath(root))).toBe(false);
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx bundle persists rule injection state only with explicit flag", async () => {
		const root = createBundleFixture();
		try {
			writeInjectableAlphaRule(root);
			const captured = captureIo();
			expect(
				await runContextCommand(
					"bundle",
					[
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
						"--persist-rule-injection",
						"--json",
					],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				data: {
					rule_injection: {
						first_use: boolean;
						injected: Array<{ id: string }>;
					};
				};
			};
			expect(payload.data.rule_injection.first_use).toBe(true);
			expect(
				payload.data.rule_injection.injected.map((rule) => rule.id),
			).toEqual(["RULE-ALPHA"]);
			expect(existsSync(ruleInjectionStatePath(root))).toBe(true);
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx bundle rejects rule injection persistence in compact mode", async () => {
		const root = createBundleFixture();
		try {
			writeInjectableAlphaRule(root);
			const captured = captureIo();
			expect(
				await runContextCommand(
					"bundle",
					[
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
						"--mode",
						"compact",
						"--persist-rule-injection",
						"--json",
					],
					root,
					captured.io,
				),
			).toBe(2);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				ok: boolean;
				error: { code: string; message: string };
			};
			expect(payload.ok).toBe(false);
			expect(payload.error.code).toBe("CTX_USAGE_ERROR");
			expect(payload.error.message).toContain(
				"requires ctx bundle mode balanced, deep, or tokenmax",
			);
			expect(existsSync(ruleInjectionStatePath(root))).toBe(false);
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx bundle rejects explicit rule injection persistence for restricted callers", async () => {
		const root = createBundleFixture();
		try {
			writeInjectableAlphaRule(root);
			const captured = captureIo();
			expect(
				await runContextCommand(
					"bundle",
					[
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
						"--persist-rule-injection",
						"--json",
					],
					root,
					captured.io,
					agentOperationContext(),
				),
			).toBe(2);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				ok: boolean;
				error: { code: string; message: string };
			};
			expect(payload.ok).toBe(false);
			expect(payload.error.code).toBe("approval-required");
			expect(payload.error.message).toContain(
				"requires local interactive approval",
			);
			expect(existsSync(ruleInjectionStatePath(root))).toBe(false);
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx tools does not consume first-use rule injection state", async () => {
		const root = createBundleFixture();
		try {
			writeInjectableAlphaRule(root);
			const captured = captureIo();
			expect(
				await runContextCommand(
					"tools",
					[
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
					],
					root,
					captured.io,
				),
			).toBe(0);
			expect(existsSync(ruleInjectionStatePath(root))).toBe(false);

			const bundleOutput = captureIo();
			expect(
				await runContextCommand(
					"bundle",
					[
						"--json",
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
					],
					root,
					bundleOutput.io,
				),
			).toBe(0);
			const payload = JSON.parse(bundleOutput.stdout[0] ?? "{}") as {
				data: {
					rule_injection: {
						first_use: boolean;
						injected: Array<{ id: string }>;
					};
				};
			};
			expect(payload.data.rule_injection.first_use).toBe(true);
			expect(
				payload.data.rule_injection.injected.map((rule) => rule.id),
			).toEqual(["RULE-ALPHA"]);
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx explain and bundle --explain do not consume first-use rule injection state", async () => {
		const root = createBundleFixture();
		try {
			writeInjectableAlphaRule(root);
			for (const [action, args] of [
				[
					"explain",
					[
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
					],
				],
				[
					"bundle",
					[
						"--explain",
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
					],
				],
			] as const) {
				const captured = captureIo();
				expect(
					await runContextCommand(action, [...args], root, captured.io),
				).toBe(0);
				expect(existsSync(ruleInjectionStatePath(root))).toBe(false);
			}
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx bundle compact keeps rule injection shape without persistent state", async () => {
		const root = createBundleFixture();
		try {
			writeInjectableAlphaRule(root);
			const captured = captureIo();
			expect(
				await runContextCommand(
					"bundle",
					[
						"--json",
						"--mode",
						"compact",
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
					],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				data: {
					rule_injection: {
						identity: string;
						state_path: string;
						first_use: boolean;
						injected: unknown[];
						already_injected: unknown[];
						omitted: unknown[];
					};
				};
			};
			expect(payload.data.rule_injection.identity).toContain("surface:alpha");
			expect(payload.data.rule_injection.state_path).toBe(
				".afol/data/rules/injection-state.json",
			);
			expect(payload.data.rule_injection.first_use).toBe(false);
			expect(payload.data.rule_injection.injected).toEqual([]);
			expect(payload.data.rule_injection.already_injected).toEqual([]);
			expect(payload.data.rule_injection.omitted).toEqual([]);
			expect(existsSync(ruleInjectionStatePath(root))).toBe(false);
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx bundle rejects invalid rule file paths", async () => {
		const root = createBundleFixture();
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"bundle",
					["--file", "../escape.ts", "--json"],
					root,
					captured.io,
				),
			).toBe(1);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				error: { message: string };
			};
			expect(payload.error.message).toContain(
				"Invalid rule resolve file path: ../escape.ts",
			);
			expect(existsSync(ruleInjectionStatePath(root))).toBe(false);
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx bundle invalid mode exits 2", async () => {
		const root = createBundleFixture();
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"bundle",
					[
						"--mode",
						"nope",
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
					],
					root,
					captured.io,
				),
			).toBe(2);
			expect(captured.stderr[0]).toContain("Invalid ctx mode");
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx bundle --json invalid mode returns envelope exit 2", async () => {
		const root = createBundleFixture();
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"bundle",
					[
						"--mode",
						"nope",
						"--json",
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
					],
					root,
					captured.io,
				),
			).toBe(2);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				exit_code: number;
				error: { message: string };
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(false);
			expect(payload.exit_code).toBe(2);
			expect(payload.error.message).toContain("Invalid ctx mode");
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx section <ref> returns section content", async () => {
		const root = createSectionFixture();
		try {
			rebuildSectionIndex(root);
			const captured = captureIo();
			expect(
				await runContextCommand(
					"section",
					["--ref", "spec:alpha#overview"],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				title: string;
				line_start: number;
			};
			expect(payload.title).toBe("Overview");
			expect(payload.line_start).toBe(9);
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx section --json returns envelope", async () => {
		const root = createSectionFixture();
		try {
			rebuildSectionIndex(root);
			const captured = captureIo();
			expect(
				await runContextCommand(
					"section",
					["--ref", "spec:alpha#overview", "--json"],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				action: string;
				exit_code: number;
				data: { section: { title: string; line_start: number } };
				section: { title: string; line_start: number };
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.action).toBe("ctx.section");
			expect(payload.exit_code).toBe(0);
			expect(payload.data.section.title).toBe("Overview");
			expect(payload.section.line_start).toBe(9);
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx explain returns explanation with gaps and project_health separation", async () => {
		const root = createBundleFixture();
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"explain",
					[
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
					],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				ok: boolean;
				why: unknown;
				gaps: string[];
				project_health: string[];
				freshness: unknown;
				budget: { used_tokens: number; total_tokens: number };
				bundle_size: { refs: number; injected_rules: number };
				evidence_tags: string[];
				create_safety_hints: string[];
				do_not_load: string[];
				bundle?: unknown;
			};
			expect(payload.ok).toBe(true);
			expect(payload.why).toBeDefined();
			expect(payload.gaps).toEqual(expect.any(Array));
			expect(payload.project_health).toEqual(expect.any(Array));
			expect(payload.freshness).toBeDefined();
			expect(payload.budget.total_tokens).toBeGreaterThan(0);
			expect(payload.bundle_size.refs).toBeGreaterThanOrEqual(0);
			expect(payload.bundle_size.injected_rules).toBeGreaterThanOrEqual(0);
			expect(payload.evidence_tags).toEqual(expect.any(Array));
			expect(payload.create_safety_hints).toEqual(expect.any(Array));
			expect(payload.do_not_load).toContain("raw .afol/state/afol.db");
			expect(payload.bundle).toBeUndefined();
			expect(Array.isArray(payload.gaps)).toBe(true);
			expect(Array.isArray(payload.project_health)).toBe(true);
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx explain --full includes the complete bundle", async () => {
		const root = createBundleFixture();
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"explain",
					[
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
						"--full",
					],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				bundle?: { task_id: string };
			};
			expect(payload.bundle?.task_id).toBe("T-01");
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx explain --json returns envelope with gaps and project_health", async () => {
		const root = createBundleFixture();
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"explain",
					[
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
						"--json",
					],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				action: string;
				exit_code: number;
				data: {
					why: unknown;
					gaps: string[];
					project_health: string[];
					freshness: unknown;
					budget: { used_tokens: number; total_tokens: number };
					bundle_size: { refs: number; injected_rules: number };
					evidence_tags: string[];
					create_safety_hints: string[];
					do_not_load: string[];
					bundle?: unknown;
				};
				why: unknown;
				gaps: string[];
				project_health: string[];
				freshness: unknown;
				budget: { used_tokens: number; total_tokens: number };
				bundle_size: { refs: number; injected_rules: number };
				evidence_tags: string[];
				create_safety_hints: string[];
				do_not_load: string[];
				bundle?: unknown;
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.action).toBe("ctx.explain");
			expect(payload.exit_code).toBe(0);
			expect(payload.data.why).toBeDefined();
			expect(payload.why).toBeDefined();
			expect(payload.gaps).toEqual(expect.any(Array));
			expect(payload.data.gaps).toEqual(expect.any(Array));
			expect(payload.project_health).toEqual(expect.any(Array));
			expect(payload.data.project_health).toEqual(expect.any(Array));
			expect(payload.freshness).toBeDefined();
			expect(payload.budget.total_tokens).toBeGreaterThan(0);
			expect(payload.data.budget.total_tokens).toBeGreaterThan(0);
			expect(payload.bundle_size.refs).toBeGreaterThanOrEqual(0);
			expect(payload.data.bundle_size.injected_rules).toBeGreaterThanOrEqual(0);
			expect(payload.evidence_tags).toEqual(expect.any(Array));
			expect(payload.create_safety_hints).toEqual(expect.any(Array));
			expect(payload.do_not_load).toContain("raw .afol/state/afol.db");
			expect(payload.bundle).toBeUndefined();
			expect(payload.data.bundle).toBeUndefined();
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx explain --json --full returns bundle in the envelope", async () => {
		const root = createBundleFixture();
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"explain",
					[
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
						"--json",
						"--full",
					],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				data: { bundle?: { task_id: string } };
				bundle?: { task_id: string };
			};
			expect(payload.data.bundle?.task_id).toBe("T-01");
			expect(payload.bundle?.task_id).toBe("T-01");
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx explain reports health-backed stale PSTR in project_health", async () => {
		const root = createBundleFixture({ pstr: "stale" });
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"explain",
					["-S", "session-1", "-T", "T-01", "--surface", "alpha", "--json"],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				freshness: { pstr: string };
				gaps: string[];
				project_health: string[];
			};
			expect(payload.freshness.pstr).toBe("stale");
			expect(
				payload.project_health.some((entry) => entry.includes("pstr:")),
			).toBe(true);
			expect(payload.gaps).toEqual(expect.any(Array));
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx tools returns tool list", async () => {
		const root = createBundleFixture();
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"tools",
					[
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
					],
					root,
					captured.io,
				),
			).toBe(0);
			expect(captured.stdout[0]).toContain("afol ctx section");
			expect(captured.stdout[0]).toContain("bun test");
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol ctx tools --json returns envelope", async () => {
		const root = createBundleFixture();
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"tools",
					[
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
						"--json",
					],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				action: string;
				exit_code: number;
				data: { tools: string[] };
				tools: string[];
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.action).toBe("ctx.tools");
			expect(payload.exit_code).toBe(0);
			expect(payload.data.tools.join("\n")).toContain("afol ctx section");
			expect(payload.tools.join("\n")).toContain("bun test");
		} finally {
			removeTestRoot(root);
		}
	});
});
