import { afterEach, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeScopedFlags, normalizeSubcommandAction } from "../aliases";
import { runGovernanceCommand } from "../commands/governance";
import {
	defaultOperationContext,
	remoteOperationContext,
} from "../core/operation-context";
import {
	type PendingSpecEntry,
	readPendingSpecIndex,
	writePendingSpecIndex,
} from "../services/governance/pending-specs";

const tempRoots: string[] = [];
let restoreAfolSession: (() => void) | null = null;

afterEach(() => {
	for (const root of tempRoots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
	restoreAfolSession?.();
	restoreAfolSession = null;
});

function withAfolSession(value: string | undefined): void {
	const previous = process.env.AFOL_SESSION;
	restoreAfolSession = () => {
		if (previous === undefined) {
			delete process.env.AFOL_SESSION;
		} else {
			process.env.AFOL_SESSION = previous;
		}
	};
	if (value === undefined) {
		delete process.env.AFOL_SESSION;
	} else {
		process.env.AFOL_SESSION = value;
	}
}

function createFixture(): string {
	const root = mkdtempSync(join(tmpdir(), "afol-governance-command-"));
	tempRoots.push(root);
	writePendingSpecIndex(root, { schema_version: 1, entries: [] });
	return root;
}

function makeEntry(
	sessionId: string,
	status: PendingSpecEntry["status"] = "open",
): PendingSpecEntry {
	return {
		session_id: sessionId,
		created_at: "2026-01-01T00:00:00.000Z",
		updated_at: "2026-01-01T00:00:00.000Z",
		status,
		theme: "test",
		task_ids: ["T-01"],
		missing: ["roadmap_feature", "parent_spec"],
		resolution_hint: "resolve",
	};
}

function seedSessionTask(root: string, sessionId: string): void {
	const sessionDir = join(root, ".afol", "wb", sessionId);
	mkdirSync(sessionDir, { recursive: true });
	writeFileSync(
		join(sessionDir, `${sessionId}_task_01.md`),
		[
			"---",
			'governance_status: "pending_spec"',
			"pending_spec: true",
			'pending_spec_status: "open"',
			"---",
			"",
			"# Tasks",
			"",
			"| Task | State | Owner | Notes |",
			"|------|-------|-------|-------|",
			"| T-01 | pending | worker | fixture |",
			"",
		].join("\n"),
		"utf8",
	);
}

function seedOpenPending(root: string, sessionIds: string[]): void {
	for (const sessionId of sessionIds) {
		seedSessionTask(root, sessionId);
	}
	writePendingSpecIndex(root, {
		schema_version: 1,
		entries: sessionIds.map((sessionId) => makeEntry(sessionId, "open")),
	});
}

function writeRoadmapFeature(
	root: string,
	featureId: string,
	status: string,
): string {
	const roadmapPath = join(
		root,
		".afol",
		"adm",
		"roadmap",
		"GENERAL-ROADMAP.md",
	);
	mkdirSync(join(root, ".afol", "adm", "roadmap"), { recursive: true });
	writeFileSync(
		roadmapPath,
		[
			"# Roadmap",
			"",
			`### ${featureId} Fixture`,
			"",
			`- Status: ${status}`,
			"",
		].join("\n"),
		"utf8",
	);
	return roadmapPath;
}

function writeParentSpec(
	root: string,
	status: string,
	roadmapFeature = "F-31",
	contentOverrides = "",
	lineEnding = "\n",
): string {
	const path = join(root, ".afol", "adm", "specs", "parent-spec.md");
	mkdirSync(join(root, ".afol", "adm", "specs"), { recursive: true });
	writeFileSync(
		path,
		[
			"---",
			"doc_type: spec",
			"id: parent-spec",
			`status: ${status}`,
			`roadmap_feature: ${roadmapFeature}`,
			contentOverrides.trimEnd(),
			"---",
			"",
			"# Parent",
			"",
		].join(lineEnding),
		"utf8",
	);
	return path;
}

describe("governance command", () => {
	test("returns the pending index through the command envelope", () => {
		const stdout: string[] = [];
		const stderr: string[] = [];
		const exitCode = runGovernanceCommand(
			"pending",
			["--json"],
			createFixture(),
			{
				stdout: (message) => stdout.push(message),
				stderr: (message) => stderr.push(message),
			},
		);

		expect(exitCode).toBe(0);
		expect(stderr).toEqual([]);
		expect(JSON.parse(stdout[0] ?? "{}")).toMatchObject({
			ok: true,
			action: "governance.pending",
			data: { status: "ok", total: 0, entries: [] },
		});
	});

	test("denies governance writes for restricted callers", () => {
		const stderr: string[] = [];
		const io = {
			stdout: () => undefined,
			stderr: (message: string) => stderr.push(message),
		};
		const root = createFixture();

		expect(
			runGovernanceCommand(
				"resolve-spec",
				[
					"--session",
					"fixture",
					"--feature-id",
					"F-11",
					"--parent-spec",
					"fixture-spec",
				],
				root,
				io,
				remoteOperationContext(),
			),
		).toBe(2);
		expect(
			runGovernanceCommand(
				"bulk-waive",
				["--reason", "restricted caller"],
				root,
				io,
				remoteOperationContext(),
			),
		).toBe(2);
		expect(
			runGovernanceCommand(
				"repair-index",
				[],
				root,
				io,
				remoteOperationContext(),
			),
		).toBe(2);
		expect(stderr).toEqual([
			"governance resolve-spec requires local interactive approval",
			"governance bulk-waive requires local interactive approval",
			"governance repair-index requires local interactive approval",
		]);
	});

	test("rejects unknown governance actions", () => {
		const stderr: string[] = [];
		const exitCode = runGovernanceCommand("unknown", [], createFixture(), {
			stdout: () => undefined,
			stderr: (message) => stderr.push(message),
		});

		expect(exitCode).toBe(2);
		expect(stderr).toEqual(["Unknown governance action: unknown"]);
	});

	test("activate-feature transitions planned to active and makes active a no-op", () => {
		const root = createFixture();
		const roadmapPath = writeRoadmapFeature(root, "F-31", "planned");
		const firstStdout: string[] = [];

		expect(
			runGovernanceCommand("activate-feature", ["--feature-id", "F-31"], root, {
				stdout: (message) => firstStdout.push(message),
				stderr: () => undefined,
			}),
		).toBe(0);
		expect(firstStdout).toEqual(["roadmap feature activated: F-31"]);
		const activatedRoadmap = readFileSync(roadmapPath, "utf8");
		expect(activatedRoadmap).toContain("- Status: active");

		const secondStdout: string[] = [];
		expect(
			runGovernanceCommand("activate-feature", ["--feature-id", "F-31"], root, {
				stdout: (message) => secondStdout.push(message),
				stderr: () => undefined,
			}),
		).toBe(0);
		expect(secondStdout).toEqual(["roadmap feature already active: F-31"]);
		expect(readFileSync(roadmapPath, "utf8")).toBe(activatedRoadmap);
	});

	test("activate-feature rejects final features without mutation", () => {
		const root = createFixture();
		const roadmapPath = writeRoadmapFeature(root, "F-31", "final");
		const before = readFileSync(roadmapPath, "utf8");
		const stderr: string[] = [];

		expect(
			runGovernanceCommand("activate-feature", ["--feature-id", "F-31"], root, {
				stdout: () => undefined,
				stderr: (message) => stderr.push(message),
			}),
		).toBe(2);
		expect(stderr[0]).toContain("final");
		expect(readFileSync(roadmapPath, "utf8")).toBe(before);
	});

	test("activate-feature converges the matching planned parent spec and roadmap", () => {
		const root = createFixture();
		const roadmapPath = writeRoadmapFeature(root, "F-31", "planned");
		const specPath = writeParentSpec(root, "planned");
		const stdout: string[] = [];

		expect(
			runGovernanceCommand(
				"activate-feature",
				["--feature-id", "F-31", "--parent-spec", "parent-spec"],
				root,
				{ stdout: (message) => stdout.push(message), stderr: () => undefined },
			),
		).toBe(0);
		expect(readFileSync(roadmapPath, "utf8")).toContain("- Status: active");
		expect(readFileSync(specPath, "utf8")).toContain('status: "active"');
		expect(stdout).toEqual([
			"roadmap feature activated: F-31",
			"parent spec activated: parent-spec",
		]);
	});

	test("activate-feature reports restoration after an injected second-write failure", () => {
		const root = createFixture();
		const roadmapPath = writeRoadmapFeature(root, "F-31", "planned");
		const specPath = writeParentSpec(root, "planned");
		const roadmapBefore = readFileSync(roadmapPath);
		const specBefore = readFileSync(specPath);
		const stderr: string[] = [];

		expect(
			runGovernanceCommand(
				"activate-feature",
				["--feature-id", "F-31", "--parent-spec", "parent-spec"],
				root,
				{ stdout: () => undefined, stderr: (message) => stderr.push(message) },
				defaultOperationContext(),
				{ failOnSecondWrite: true },
			),
		).toBe(2);
		expect(stderr[0]).toContain(
			"Injected governance activation failure on second write",
		);
		expect(stderr[0]).toContain("restoration=complete");
		expect(readFileSync(roadmapPath)).toEqual(roadmapBefore);
		expect(readFileSync(specPath)).toEqual(specBefore);
	});

	test("activate-feature parses a CRLF parent spec", () => {
		const root = createFixture();
		writeRoadmapFeature(root, "F-31", "planned");
		const specPath = writeParentSpec(root, "planned", "F-31", "", "\r\n");

		expect(
			runGovernanceCommand(
				"activate-feature",
				["--feature-id", "F-31", "--parent-spec", "parent-spec"],
				root,
				{ stdout: () => undefined, stderr: () => undefined },
			),
		).toBe(0);
		expect(readFileSync(specPath, "utf8")).toContain('status: "active"');
	});

	test("activate-feature accepts the compact parent-spec flag", () => {
		const root = createFixture();
		writeRoadmapFeature(root, "F-31", "planned");
		writeParentSpec(root, "planned");
		const args = normalizeScopedFlags("governance", [
			"-F",
			"F-31",
			"-P",
			"parent-spec",
		]);
		expect(args).toEqual([
			"--feature-id",
			"F-31",
			"--parent-spec",
			"parent-spec",
		]);
		expect(
			runGovernanceCommand("activate-feature", args, root, {
				stdout: () => undefined,
				stderr: () => undefined,
			}),
		).toBe(0);
	});

	test("activate-feature activates a planned parent when the feature is already active", () => {
		const root = createFixture();
		const roadmapPath = writeRoadmapFeature(root, "F-31", "active");
		const specPath = writeParentSpec(root, "planned");
		const stdout: string[] = [];

		expect(
			runGovernanceCommand(
				"activate-feature",
				["--feature-id", "F-31", "--parent-spec", "parent-spec"],
				root,
				{ stdout: (message) => stdout.push(message), stderr: () => undefined },
			),
		).toBe(0);
		expect(readFileSync(roadmapPath, "utf8")).toContain("- Status: active");
		expect(readFileSync(specPath, "utf8")).toContain('status: "active"');
		expect(stdout).toEqual([
			"roadmap feature already active: F-31",
			"parent spec activated: parent-spec",
		]);
	});

	test("activate-feature validates the parent before mutating the roadmap", () => {
		const root = createFixture();
		const roadmapPath = writeRoadmapFeature(root, "F-31", "planned");
		const specPath = writeParentSpec(root, "final");
		const roadmapBefore = readFileSync(roadmapPath, "utf8");
		const specBefore = readFileSync(specPath, "utf8");
		const stderr: string[] = [];

		expect(
			runGovernanceCommand(
				"activate-feature",
				["--feature-id", "F-31", "--parent-spec", "parent-spec"],
				root,
				{ stdout: () => undefined, stderr: (message) => stderr.push(message) },
			),
		).toBe(2);
		expect(stderr[0]).toContain("cannot be activated");
		expect(readFileSync(roadmapPath, "utf8")).toBe(roadmapBefore);
		expect(readFileSync(specPath, "utf8")).toBe(specBefore);
	});

	test("activate-feature keeps compact output and denies restricted callers", () => {
		const root = createFixture();
		const roadmapPath = writeRoadmapFeature(root, "F-31", "planned");
		const before = readFileSync(roadmapPath, "utf8");
		const stdout: string[] = [];
		const stderr: string[] = [];

		expect(
			runGovernanceCommand(
				"activate-feature",
				["--feature-id", "F-31"],
				root,
				{
					stdout: (message) => stdout.push(message),
					stderr: (message) => stderr.push(message),
				},
				remoteOperationContext(),
			),
		).toBe(2);
		expect(stdout).toEqual([]);
		expect(stderr[0]).toContain(
			"activate-feature requires local interactive approval",
		);
		expect(readFileSync(roadmapPath, "utf8")).toBe(before);

		const localStdout: string[] = [];
		expect(
			runGovernanceCommand("activate-feature", ["--feature-id", "F-31"], root, {
				stdout: (message) => localStdout.push(message),
				stderr: () => undefined,
			}),
		).toBe(0);
		expect(localStdout).toHaveLength(1);
		expect(localStdout[0]).not.toContain("# Roadmap");
	});

	test("resolve-spec short flags expand then waive via long-form args", () => {
		const root = createFixture();
		seedOpenPending(root, ["sess-short"]);
		const action = normalizeSubcommandAction("governance", "rs");
		const expanded = normalizeScopedFlags("governance", [
			"-S",
			"sess-short",
			"--no-spec-required",
			"-r",
			"short flag waiver",
		]);
		const stdout: string[] = [];
		const exitCode = runGovernanceCommand(action, expanded, root, {
			stdout: (message) => stdout.push(message),
			stderr: () => undefined,
		});

		expect(action).toBe("resolve-spec");
		expect(expanded).toEqual([
			"--session",
			"sess-short",
			"--no-spec-required",
			"--reason",
			"short flag waiver",
		]);
		expect(exitCode).toBe(0);
		expect(stdout[0]).toContain("pending_spec waived: sess-short");
		expect(readPendingSpecIndex(root).entries[0]?.status).toBe("waived");
	});

	test("resolve-spec uses default session when --session is omitted", () => {
		const root = createFixture();
		seedOpenPending(root, ["sess-default"]);
		withAfolSession("sess-default");
		const stdout: string[] = [];
		const exitCode = runGovernanceCommand(
			"resolve-spec",
			["--no-spec-required", "--reason", "default session waiver", "--json"],
			root,
			{
				stdout: (message) => stdout.push(message),
				stderr: () => undefined,
			},
		);

		expect(exitCode).toBe(0);
		expect(JSON.parse(stdout[0] ?? "{}")).toMatchObject({
			ok: true,
			action: "governance.resolve-spec",
			data: {
				status: "waived",
				session: "sess-default",
			},
		});
	});

	test("resolve-spec fails closed when no session can be resolved", () => {
		const root = createFixture();
		withAfolSession(undefined);
		const stderr: string[] = [];
		const exitCode = runGovernanceCommand(
			"resolve-spec",
			["--no-spec-required", "--reason", "no session bound"],
			root,
			{
				stdout: () => undefined,
				stderr: (message) => stderr.push(message),
			},
		);

		expect(exitCode).toBe(2);
		expect(stderr[0]).toContain("Missing usable session");
	});

	test("bulk-waive dry-run lists open entries without mutating", () => {
		const root = createFixture();
		seedOpenPending(root, ["a", "b"]);
		const stdout: string[] = [];
		const exitCode = runGovernanceCommand(
			"bulk-waive",
			["--reason", "dry run cemetery", "--dry-run", "--json"],
			root,
			{
				stdout: (message) => stdout.push(message),
				stderr: () => undefined,
			},
		);

		expect(exitCode).toBe(0);
		const envelope = JSON.parse(stdout[0] ?? "{}");
		expect(envelope).toMatchObject({
			ok: true,
			action: "governance.bulk-waive",
			data: {
				waived: ["a", "b"],
				skipped: [],
				errors: [],
				dry_run: true,
				limit: 20,
			},
		});
		expect(
			readPendingSpecIndex(root).entries.every(
				(entry) => entry.status === "open",
			),
		).toBe(true);
	});

	test("bulk-waive applies default limit and skips the remainder", () => {
		const root = createFixture();
		const sessions = Array.from({ length: 5 }, (_, index) => `s${index + 1}`);
		seedOpenPending(root, sessions);
		const stdout: string[] = [];
		const exitCode = runGovernanceCommand(
			"bulk-waive",
			["--reason", "limited cemetery clean", "--limit", "2", "--json"],
			root,
			{
				stdout: (message) => stdout.push(message),
				stderr: () => undefined,
			},
		);

		expect(exitCode).toBe(0);
		const envelope = JSON.parse(stdout[0] ?? "{}");
		expect(envelope.data.waived).toEqual(["s1", "s2"]);
		expect(envelope.data.skipped).toEqual(["s3", "s4", "s5"]);
		expect(envelope.data.limit).toBe(2);
		const index = readPendingSpecIndex(root);
		expect(
			index.entries.filter((entry) => entry.status === "waived"),
		).toHaveLength(2);
		expect(
			index.entries.filter((entry) => entry.status === "open"),
		).toHaveLength(3);
	});

	test("bulk-waive explicit sessions ignore limit and skip non-open", () => {
		const root = createFixture();
		seedOpenPending(root, ["open-1", "open-2"]);
		const index = readPendingSpecIndex(root);
		index.entries.push(makeEntry("already-waived", "waived"));
		writePendingSpecIndex(root, index);
		seedSessionTask(root, "already-waived");

		const stdout: string[] = [];
		const stderr: string[] = [];
		const exitCode = runGovernanceCommand(
			"bulk-waive",
			[
				"--reason",
				"explicit sessions",
				"--session",
				"open-1",
				"--session",
				"already-waived",
				"--session",
				"missing-session",
				"--limit",
				"1",
				"--json",
			],
			root,
			{
				stdout: (message) => stdout.push(message),
				stderr: (message) => stderr.push(message),
			},
		);

		expect(exitCode).toBe(1);
		const envelope = JSON.parse(stdout[0] ?? "{}");
		expect(envelope.data.waived).toEqual(["open-1"]);
		expect(envelope.data.skipped).toEqual(["already-waived"]);
		expect(envelope.data.errors).toEqual([
			{
				session: "missing-session",
				message: "pending_spec entry not found for session missing-session",
			},
		]);
		expect(envelope.data.limit).toBeNull();
		expect(envelope.data.dry_run).toBe(false);
	});

	test("bulk-waive rejects empty reason and denies restricted callers", () => {
		const root = createFixture();
		seedOpenPending(root, ["sess-reason"]);
		const stderr: string[] = [];
		const io = {
			stdout: () => undefined,
			stderr: (message: string) => stderr.push(message),
		};

		expect(
			runGovernanceCommand("bulk-waive", ["--reason", "   "], root, io),
		).toBe(2);
		expect(stderr[0]).toContain("Missing --reason");

		expect(
			runGovernanceCommand(
				"bulk-waive",
				["--reason", "should not run"],
				root,
				io,
				remoteOperationContext(),
			),
		).toBe(2);
		expect(stderr[1]).toContain(
			"governance bulk-waive requires local interactive approval",
		);
		expect(readPendingSpecIndex(root).entries[0]?.status).toBe("open");
	});

	test("bulk-waive human output is compact", () => {
		const root = createFixture();
		seedOpenPending(root, ["h1", "h2"]);
		const stdout: string[] = [];
		const exitCode = runGovernanceCommand(
			"bulk-waive",
			["--reason", "compact output", "--dry-run"],
			root,
			{
				stdout: (message) => stdout.push(message),
				stderr: () => undefined,
			},
		);

		expect(exitCode).toBe(0);
		expect(stdout[0]).toBe("waived: 2; skipped: 0; dry_run: true");
		expect(stdout[1]).toBe("waived_ids: h1, h2");
	});

	test("bulk-waive aliases normalize to bulk-waive", () => {
		expect(normalizeSubcommandAction("governance", "bw")).toBe("bulk-waive");
		expect(normalizeSubcommandAction("governance", "waive-open")).toBe(
			"bulk-waive",
		);
	});
});
