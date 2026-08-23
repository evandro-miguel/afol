import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DEFAULT_TEMPLATE_FILES } from "../../generated/template";
import { rebuildProjectIndexes } from "../local-state/project-indexes";
import { rebuildWorkBenchIndex } from "../local-state/workbench-index";
import { FLEET_MAX_PROJECTS, runFleetCheck, runFleetRepair } from "./index";

type TemplateUpdatePath = keyof typeof DEFAULT_TEMPLATE_FILES & string;
const TEMPLATE_UPDATE_PATHS = Object.keys(
	DEFAULT_TEMPLATE_FILES,
) as TemplateUpdatePath[];

const trackedRoots: string[] = [];
const testGitEnv = {
	...process.env,
	GIT_AUTHOR_NAME: "AFOL Fleet Test",
	GIT_AUTHOR_EMAIL: "afol-test@example.com",
	GIT_COMMITTER_NAME: "AFOL Fleet Test",
	GIT_COMMITTER_EMAIL: "afol-test@example.com",
};

function withCleanupRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "fleet-service-"));
	trackedRoots.push(root);
	return root;
}

function runGitCommand(root: string, args: string[]): void {
	const command = spawnSync("git", args, {
		cwd: root,
		encoding: "utf8",
		env: testGitEnv,
	});
	if (command.status !== 0) {
		throw new Error(`git command failed: git ${args.join(" ")} (${root})`);
	}
}

function initCleanGitRoot(root: string): void {
	runGitCommand(root, ["init"]);
	runGitCommand(root, ["add", "."]);
	runGitCommand(root, ["commit", "-m", "fleet test baseline"]);
}

function writeJson(path: string, value: unknown): void {
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function templateText(path: TemplateUpdatePath): string {
	const entry = DEFAULT_TEMPLATE_FILES[path];
	if (!entry) {
		throw new Error(`missing template entry: ${path}`);
	}
	return Buffer.from(entry.contentBase64, "base64").toString("utf8");
}

function canonicalRoot(): string {
	const root = withCleanupRoot();
	mkdirSync(join(root, ".afol"), { recursive: true });
	writeJson(join(root, ".afol", "config.json"), {
		schema_version: 1,
		project: {
			name: "fleet-service-canonical",
		},
	});
	return root;
}

function legacyRoot(): string {
	const root = withCleanupRoot();
	mkdirSync(join(root, ".agents"), { recursive: true });
	writeJson(join(root, ".agents", "config.json"), {
		schema_version: 1,
		project: {
			name: "fleet-service-legacy",
		},
	});
	return root;
}

function canonicalHealthyRoot(): string {
	const root = withCleanupRoot();
	cpSync(join(process.cwd(), "src", "project-template"), root, {
		recursive: true,
	});
	const manifestPath = join(root, ".agents", "manifest.json");
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
		commands?: Record<string, unknown>;
	};
	delete manifest.commands?.fleet;
	writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
	rebuildWorkBenchIndex(root);
	rebuildProjectIndexes(root);
	return root;
}

function canonicalTemplateAlignedRoot(): string {
	const root = withCleanupRoot();
	cpSync(join(process.cwd(), "src", "project-template"), root, {
		recursive: true,
	});
	rebuildWorkBenchIndex(root);
	rebuildProjectIndexes(root);
	initCleanGitRoot(root);
	return root;
}

function canonicalDerivedRepairableRoot(): string {
	const root = canonicalHealthyRoot();
	rmSync(join(root, ".afol", "data", "index", "rules.json"));
	return root;
}

function canonicalDerivedRepairableGitRoot(): string {
	const root = canonicalDerivedRepairableRoot();
	initCleanGitRoot(root);
	return root;
}

function canonicalTemplateConflictedRoot(conflictFiles: number): string {
	const root = canonicalRoot();
	const selectedPaths = TEMPLATE_UPDATE_PATHS.filter(
		(path) =>
			!path.endsWith(".lock.json") &&
			!path.endsWith(".manifest.json") &&
			path !== ".agents/lock.json" &&
			path !== ".agents/manifest.json",
	).slice(0, conflictFiles);
	for (const path of selectedPaths) {
		const target = join(root, path);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(
			target,
			`${templateText(path)}\n# fleet-conflict-${path}\n`,
			"utf8",
		);
	}
	return root;
}

describe("fleet core service", () => {
	test("check canonical roots emit preview-update when conflicted", async () => {
		const root = canonicalHealthyRoot();
		const result = await runFleetCheck({ roots: [root] });

		expect(result.ok).toBe(true);
		expect(result.projects).toHaveLength(1);

		const project = result.projects[0];
		expect(project).toBeDefined();
		if (!project) {
			throw new Error("expected a single check result");
		}
		expect(project.decision.action).toBe("preview-update");
		expect(project.decision.blockers).not.toContain("history-failed");
		expect(project.decision.axes.history.state).toBe("ok");
		expect(project.decision.axes.git.state).toBe("blocked");
		expect(project.decision.axes.derived.state).toBe("ok");
		expect(project.decision.next_command).toBe(
			`cd '${root}' && 'afol' update preview --json`,
		);
	});

	test("check marks legacy+dirty projects as manual-review with dirty blocker", async () => {
		const root = legacyRoot();
		initCleanGitRoot(root);
		const dirty = join(root, "dirty.txt");
		writeFileSync(dirty, "dirty", "utf8");

		const result = await runFleetCheck({ roots: [root] });
		const project = result.projects[0];

		expect(project?.decision.action).toBe("manual-review");
		expect(project?.decision.blockers).toContain("dirty-git-worktree");
		expect(project?.decision.blockers).not.toContain("history-failed");
		expect(project?.classification).toBe("mixed");
	});

	test("ignores only AFOL-owned dirty paths and keeps other temporary paths advisory", async () => {
		const root = canonicalTemplateAlignedRoot();
		const afolDirty = join(root, ".afol", "tmp", "fleet-note.txt");
		mkdirSync(dirname(afolDirty), { recursive: true });
		writeFileSync(afolDirty, "derived", "utf8");

		const afolOnly = await runFleetCheck({ roots: [root] });
		expect(afolOnly.projects[0]?.git.state).toBe("clean");
		expect(afolOnly.projects[0]?.decision.blockers).not.toContain(
			"dirty-git-worktree",
		);

		const externalTemp = join(root, "notes", "user-note.txt");
		mkdirSync(dirname(externalTemp), { recursive: true });
		writeFileSync(externalTemp, "user-owned", "utf8");
		const mixed = await runFleetCheck({ roots: [root] });
		expect(mixed.projects[0]?.git.state).toBe("dirty");
		expect(mixed.projects[0]?.git.dirty_paths).toContain("notes/user-note.txt");
		expect(mixed.projects[0]?.decision.axes.git.state).toBe("warn");
		expect(mixed.projects[0]?.decision.blockers).toContain(
			"dirty-git-worktree",
		);
	});

	test("check marks critical lock conflict as manual-review without next command", async () => {
		const root = canonicalRoot();
		mkdirSync(join(root, ".agents"), { recursive: true });
		writeJson(join(root, ".agents", "lock.json"), {
			revision: "broken",
			extra: true,
		});

		const result = await runFleetCheck({
			roots: [root],
			entrypoint: "fleet-tool",
		});
		const project = result.projects[0];

		expect(project?.decision.action).toBe("manual-review");
		expect(project?.decision.blockers).toContain("critical-scaffold-conflict");
		expect(project?.decision.next_command).toBeNull();
	});

	test("check marks healthy clean roots as noop with no next command", async () => {
		const root = canonicalTemplateAlignedRoot();
		const result = await runFleetCheck({ roots: [root] });
		const project = result.projects[0];

		expect(project?.decision.action).toBe("noop");
		expect(project?.classification).toBe("healthy");
		expect(project?.decision.blockers).toHaveLength(0);
		expect(project?.decision.axes.git.state).toBe("ok");
		expect(project?.decision.axes.derived.state).toBe("ok");
		expect(project?.decision.axes.scaffold.state).toBe("ok");
		expect(project?.decision.axes.history.state).toBe("ok");
		expect(project?.decision.next_command).toBeNull();
	});

	test("check repairs derived drift only when clean", async () => {
		const root = canonicalDerivedRepairableGitRoot();

		const result = await runFleetCheck({ roots: [root] });
		const project = result.projects[0];

		expect(project?.decision.action).toBe("repair-derived");
		expect(project?.decision.axes.derived.state).toBe("warn");
		expect(project?.decision.blockers).not.toContain("history-failed");
		expect(project?.decision.axes.history.state).toBe("ok");
		expect(project?.decision.next_command).toBe(
			`'afol' fleet repair --derived --dry-run --root '${root}' --json`,
		);
	});

	test("check marks clean template conflicts as preview-update", async () => {
		const root = canonicalTemplateConflictedRoot(1);

		const result = await runFleetCheck({ roots: [root] });
		const project = result.projects[0];

		expect(project?.decision.action).toBe("preview-update");
		expect(project?.decision.axes.scaffold.state).toBe("warn");
		expect(project?.decision.blockers).not.toContain("history-failed");
		expect(project?.decision.next_command).toBe(
			`cd '${root}' && 'afol' update preview --json`,
		);
	});

	test("check repair-derived command uses quoted unsafe entrypoint", async () => {
		const root = canonicalDerivedRepairableGitRoot();
		const entrypoint = "/opt/AFOL Build/bin/afol;safe";

		const result = await runFleetCheck({
			roots: [root],
			entrypoint,
		});
		const project = result.projects[0];

		expect(project?.decision.action).toBe("repair-derived");
		expect(project?.decision.next_command).toBe(
			`'${entrypoint}' fleet repair --derived --dry-run --root '${root}' --json`,
		);
	});

	test("check preview-update command uses quoted unsafe entrypoint", async () => {
		const root = canonicalTemplateConflictedRoot(1);
		const entrypoint = "/opt/AFOL Build/bin/afol;safe";

		const result = await runFleetCheck({
			roots: [root],
			entrypoint,
		});
		const project = result.projects[0];

		expect(project?.decision.action).toBe("preview-update");
		expect(project?.decision.next_command).toBe(
			`cd '${root}' && '${entrypoint}' update preview --json`,
		);
	});

	test("check stays read-only and reports validation/template/posture", async () => {
		const canonical = canonicalRoot();
		const legacy = legacyRoot();

		const result = await runFleetCheck({ roots: [canonical, legacy] });

		expect(result.ok).toBe(false);
		expect(result.projects).toHaveLength(2);

		const canonicalEntry = result.projects.find(
			(entry) => entry.config_source === "canonical",
		);
		const legacyEntry = result.projects.find(
			(entry) => entry.config_source === "legacy",
		);

		expect(canonicalEntry).toBeDefined();
		expect(legacyEntry).toBeDefined();
		if (!canonicalEntry || !legacyEntry) {
			throw new Error("expected canonical and legacy entries");
		}

		expect(["validation-blocked", "update-conflicted"]).toContain(
			canonicalEntry.classification,
		);
		expect(legacyEntry.classification).toBe("mixed");
		expect(canonicalEntry.health_summary.ok).toBe(true);
		expect(canonicalEntry.validation.ok).toBe(true);
		expect(canonicalEntry.validation.failed_check_ids).toEqual([]);
		expect(
			canonicalEntry.template_update.operation_summary.total,
		).toBeGreaterThan(0);

		expect(
			existsSync(join(canonical, ".afol", "data", "index", "rules.json")),
		).toBe(false);
	});

	test("check classifies template conflicts as update-conflicted", async () => {
		const root = canonicalRoot();
		mkdirSync(join(root, ".agents"), { recursive: true });
		writeJson(join(root, ".agents", "manifest.json"), {});

		const result = await runFleetCheck({ roots: [root] });
		const entry = result.projects[0];

		expect(entry).toBeDefined();
		if (!entry) {
			throw new Error("expected a single check result");
		}
		expect(entry.classification).toBe("update-conflicted");
		expect(entry.template_update.operation_summary.conflict).toBeGreaterThan(0);
		expect(entry.template_update.conflict_paths).toContain(
			".agents/manifest.json",
		);
	});

	test("check caps template conflict paths and flags overflow", async () => {
		const root = canonicalTemplateConflictedRoot(60);

		const defaultResult = await runFleetCheck({ roots: [root] });
		const defaultEntry = defaultResult.projects[0];
		expect(defaultResult.max_projects).toBe(FLEET_MAX_PROJECTS);
		expect(defaultResult.truncated).toBe(false);
		expect(defaultEntry).toBeDefined();
		if (!defaultEntry) {
			throw new Error("expected a single check result");
		}

		expect(
			defaultEntry.template_update.operation_summary.conflict,
		).toBeGreaterThan(3);
		expect(defaultEntry.template_update.conflict_paths).toHaveLength(3);
		expect(defaultEntry.template_update.conflict_paths_overflow).toBe(true);
		expect(defaultEntry.classification).toBe("update-conflicted");

		const explicitResult = await runFleetCheck({
			roots: [root],
			max_paths: 5,
		});
		const explicitEntry = explicitResult.projects[0];
		expect(explicitEntry).toBeDefined();
		if (!explicitEntry) {
			throw new Error("expected a single check result");
		}
		expect(explicitEntry.template_update.conflict_paths).toHaveLength(5);
	});

	test("check keeps fleet report compact under 25 high-conflict roots", async () => {
		const roots = Array.from({ length: FLEET_MAX_PROJECTS }, () =>
			canonicalTemplateConflictedRoot(60),
		);
		const result = await runFleetCheck({ roots });
		const compactPayloadSize = Buffer.byteLength(
			JSON.stringify(
				result.projects.map((project) => ({
					classification: project.classification,
					template_update: {
						operation_summary: project.template_update.operation_summary,
						conflict_paths: project.template_update.conflict_paths,
						conflict_paths_overflow:
							project.template_update.conflict_paths_overflow,
					},
				})),
			),
			"utf8",
		);

		expect(result.truncated).toBe(false);
		expect(result.projects).toHaveLength(FLEET_MAX_PROJECTS);
		expect(compactPayloadSize).toBeLessThan(16 * 1024);
		for (const project of result.projects) {
			expect(project.template_update.conflict_paths.length).toBe(3);
			expect(project.template_update.conflict_paths_overflow).toBe(true);
			expect(
				project.template_update.operation_summary.conflict,
			).toBeGreaterThan(3);
		}
	});

	test("validation failure keeps failed ids visible including session evidence", async () => {
		const root = canonicalRoot();
		const session = "260812_1508_validation";
		const sessionDir = join(root, ".afol", "wb", session);
		mkdirSync(join(sessionDir), { recursive: true });
		writeFileSync(
			join(sessionDir, `${session}_task_01.md`),
			[
				"# Tasks",
				"",
				"| Task | State | Owner | Notes |",
				"|------|-------|-------|-------|",
				"| T-01 | done | worker | session with missing evidence |",
				"",
			].join("\n"),
			"utf8",
		);
		rebuildWorkBenchIndex(root);

		const result = await runFleetCheck({ roots: [root] });
		const entry = result.projects[0];

		expect(result.truncated).toBe(false);
		expect(entry).toBeDefined();
		if (!entry) {
			throw new Error("expected a single check result");
		}
		expect(entry.decision.action).toBe("manual-review");
		expect(entry.decision.blockers).toContain("history-failed");
		expect(entry.decision.axes.history.state).toBe("blocked");
		expect(["validation-blocked", "update-conflicted"]).toContain(
			entry.classification,
		);
		expect(entry.validation.failed_check_ids).toContain("session_evidence");
	});

	test("check deduplicates roots before truncation", async () => {
		const canonical = canonicalRoot();
		const roots = [
			canonical,
			canonical,
			...Array.from({ length: FLEET_MAX_PROJECTS - 1 }, (_, index) =>
				join(tmpdir(), `fleet-dup-${index}`),
			),
		];

		const result = await runFleetCheck({ roots });

		expect(result.truncated).toBe(false);
		expect(result.projects).toHaveLength(FLEET_MAX_PROJECTS);
	});

	test("check truncates at max 25 unique roots", async () => {
		const missing = Array.from({ length: FLEET_MAX_PROJECTS + 1 }, (_, index) =>
			join(tmpdir(), `fleet-missing-${index}`),
		);
		const result = await runFleetCheck({ roots: missing });

		expect(result.truncated).toBe(true);
		expect(result.max_projects).toBe(FLEET_MAX_PROJECTS);
		expect(result.projects).toHaveLength(FLEET_MAX_PROJECTS);
	});

	test("repair preview is read-only and preserves dirty local files", async () => {
		const root = canonicalRoot();
		const dirty = join(root, "dirty.txt");
		const dirtyPayload = "keep-me";
		writeFileSync(dirty, dirtyPayload, "utf8");

		const preview = await runFleetRepair({
			root,
			dry_run: true,
			reason: "read-only-preview",
		});

		expect(preview.mode).toBe("preview");
		expect(preview.target).toBe("derived");
		expect(preview.reason).toBe("read-only-preview");
		expect(preview.writes_performed).toBe(false);
		expect(preview.changed).toBe(false);
		expect(preview.eligible).toBe(false);
		expect(preview.eligibility_reason).toBe(
			"not-eligible:non-repairable-classification",
		);
		expect(["validation-blocked", "update-conflicted"]).toContain(
			preview.before.classification,
		);
		expect(preview.after).toEqual(preview.before);
		expect(readFileSync(dirty, "utf8")).toBe(dirtyPayload);
	});

	test("repair apply rebuilds derived local-state and writes missing index state", async () => {
		const root = canonicalDerivedRepairableGitRoot();

		const before = await runFleetRepair({
			root,
			dry_run: true,
			reason: "derived-preview",
		});
		const applied = await runFleetRepair({
			root,
			reason: "derived-apply",
		});

		expect(before.mode).toBe("preview");
		expect(applied.mode).toBe("apply");
		expect(applied.target).toBe("derived");
		expect(before.eligible).toBe(true);
		expect(before.eligibility_reason).toBe("eligible");
		expect(applied.writes_performed).toBe(true);
		expect(before.reason).toBe("derived-preview");
		expect(applied.reason).toBe("derived-apply");
		expect(applied.eligible).toBe(true);
		expect(applied.eligibility_reason).toBe("eligible");
		expect(["derived-repairable", "legacy", "mixed", "conflicted"]).toContain(
			before.before.classification,
		);
		expect(["derived-repairable", "legacy", "mixed", "conflicted"]).toContain(
			applied.before.classification,
		);
		expect([
			"derived-repairable",
			"legacy",
			"mixed",
			"conflicted",
			"healthy",
		]).toContain(applied.after.classification);
		expect(applied.changed).toBe(true);
		expect(existsSync(join(root, ".afol", "data", "index", "rules.json"))).toBe(
			true,
		);
		expect(
			existsSync(join(root, ".afol", "data", "index", "skills.json")),
		).toBe(true);
		expect(existsSync(join(root, ".afol", "data", "index", "specs.json"))).toBe(
			true,
		);
		expect(existsSync(join(root, ".afol", "state"))).toBe(true);
	});

	test("repair apply skips dirty git worktree and writes nothing", async () => {
		const root = canonicalDerivedRepairableGitRoot();
		const dirty = join(root, "dirty.txt");
		writeFileSync(dirty, "tracked-baseline", "utf8");
		runGitCommand(root, ["add", "dirty.txt"]);
		runGitCommand(root, ["commit", "-m", "fleet dirty test baseline"]);
		writeFileSync(dirty, "tracked-dirty", "utf8");

		const applied = await runFleetRepair({
			root,
			reason: "dirty-worktree",
		});

		expect(applied.mode).toBe("apply");
		expect(applied.reason).toBe("dirty-worktree");
		expect(applied.writes_performed).toBe(false);
		expect(applied.changed).toBe(false);
		expect(applied.eligible).toBe(false);
		expect(applied.eligibility_reason).toBe("not-eligible:dirty-git-worktree");
		expect(readFileSync(dirty, "utf8")).toBe("tracked-dirty");
		expect(existsSync(join(root, ".afol", "data", "index", "rules.json"))).toBe(
			false,
		);
		expect(existsSync(join(root, ".afol", "state"))).toBe(false);
	});

	test("repair apply skips targets without config", async () => {
		const root = withCleanupRoot();

		const applied = await runFleetRepair({
			root,
			reason: "missing-config",
		});

		expect(applied.mode).toBe("apply");
		expect(applied.reason).toBe("missing-config");
		expect(applied.writes_performed).toBe(false);
		expect(applied.changed).toBe(false);
		expect(applied.eligible).toBe(false);
		expect(applied.eligibility_reason).toBe("not-eligible:missing-config");
		expect(applied.before.classification).toBe("blocked");
		expect(existsSync(join(root, ".afol", "data", "index", "rules.json"))).toBe(
			false,
		);
	});

	test("repair apply skips already healthy targets", async () => {
		const root = canonicalHealthyRoot();

		const applied = await runFleetRepair({
			root,
			reason: "already-healthy",
		});

		expect(applied.mode).toBe("apply");
		expect(applied.reason).toBe("already-healthy");
		expect(applied.writes_performed).toBe(false);
		expect(applied.changed).toBe(false);
		expect(applied.eligible).toBe(false);
		expect(applied.eligibility_reason).toBe(
			"not-eligible:non-repairable-classification",
		);
		expect(applied.before.classification).toBe("healthy");
		expect(existsSync(join(root, ".afol", "data", "index", "rules.json"))).toBe(
			true,
		);
	});

	test("repair apply skips template-conflicted targets", async () => {
		const root = canonicalRoot();
		mkdirSync(join(root, ".agents"), { recursive: true });
		writeJson(join(root, ".agents", "manifest.json"), {});

		const applied = await runFleetRepair({
			root,
			reason: "template-conflict",
		});

		expect(applied.mode).toBe("apply");
		expect(applied.reason).toBe("template-conflict");
		expect(applied.eligible).toBe(false);
		expect(applied.eligibility_reason).toBe(
			"not-eligible:non-repairable-classification",
		);
		expect(applied.writes_performed).toBe(false);
		expect(applied.before.classification).toBe("update-conflicted");
	});

	test("repair apply skips non-derived validation failures", async () => {
		const root = canonicalRoot();
		const session = "260812_1508_validation";
		const sessionDir = join(root, ".afol", "wb", session);
		mkdirSync(join(sessionDir), { recursive: true });
		writeFileSync(
			join(sessionDir, `${session}_task_01.md`),
			[
				"# Tasks",
				"",
				"| Task | State | Owner | Notes |",
				"|------|-------|-------|-------|",
				"| T-01 | done | worker | session with missing evidence |",
				"",
			].join("\n"),
			"utf8",
		);
		rebuildWorkBenchIndex(root);

		const applied = await runFleetRepair({
			root,
			reason: "validation-fail",
		});

		expect(applied.mode).toBe("apply");
		expect(applied.reason).toBe("validation-fail");
		expect(applied.eligible).toBe(false);
		expect(applied.eligibility_reason).toBe(
			"not-eligible:non-repairable-classification",
		);
		expect(applied.writes_performed).toBe(false);
		expect(["validation-blocked", "update-conflicted"]).toContain(
			applied.before.classification,
		);
		expect(applied.before.validation.failed_check_ids).toContain(
			"session_evidence",
		);
	});

	test("repair enforces absolute root", async () => {
		await expect(runFleetRepair({ root: "relative/path" })).rejects.toThrow();
	});
});

afterEach(() => {
	for (const root of trackedRoots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});
