import { describe, expect, spyOn, test } from "bun:test";
import { spawnSync } from "node:child_process";
import * as nodeFs from "node:fs";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDoctorCommand } from "../commands/doctor";
import { runHealthCommand } from "../commands/health";
import { runMaintenanceCommand } from "../commands/maintenance";
import { agentOperationContext } from "../core/operation-context";
import { buildSectionIndexSnapshot } from "../services/context/section-index";
import { checkHealth } from "../services/health/checker";
import { runDoctor } from "../services/health/doctor";
import {
	maintenanceMonthly,
	maintenanceWeekly,
} from "../services/health/maintenance";
import {
	readMaintenanceReviewSummary,
	recordMaintenanceReview,
	scanLegacyReferences,
} from "../services/health/maintenance-review";
import { collectFreshnessReport } from "../services/local-state/freshness";
import {
	detectSessionHealth,
	rebuildWorkBenchIndex,
} from "../services/local-state/workbench-index";
import { writeMemory as writeProjectMemory } from "../services/memory/crud";
import {
	buildPstrSnapshotManifest,
	rebuildPstrIndex,
} from "../services/pstr/builder";
import { openDb } from "../services/state/db";

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

function initGitRepo(root: string): void {
	const git = (args: string[]): void => {
		const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
		if (result.status !== 0) {
			throw new Error(
				result.stderr || result.stdout || `git ${args.join(" ")}`,
			);
		}
	};
	git(["init"]);
	git(["config", "user.email", "afol@example.test"]);
	git(["config", "user.name", "AFOL Test"]);
	git(["add", "."]);
	git(["commit", "--no-gpg-sign", "-m", "init"]);
}

function createFixture(): string {
	const root = mkdtempSync(join(tmpdir(), "health-test-"));
	mkdirSync(join(root, ".agents"), { recursive: true });
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	mkdirSync(join(root, ".afol", "state"), { recursive: true });
	mkdirSync(join(root, ".afol", "pstr"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "roadmap"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "specs"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "decisions"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "doctrine"), { recursive: true });
	mkdirSync(join(root, ".afol", "memory"), { recursive: true });
	mkdirSync(join(root, ".afol", "library"), { recursive: true });
	mkdirSync(join(root, ".afol", "data", "index"), { recursive: true });
	mkdirSync(join(root, "cli"), { recursive: true });
	mkdirSync(join(root, "src", "project-template"), { recursive: true });
	mkdirSync(join(root, "docs"), { recursive: true });
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
	writeFileSync(join(root, "cli", "main.ts"), "export const cli = true;\n");
	writeFileSync(
		join(root, "src", "project-template", "index.ts"),
		"export const template = true;\n",
	);
	writeFileSync(join(root, "docs", "readme.md"), "# Docs\n");
	return root;
}

function writeMemory(root: string, updatedAt: string): void {
	writeFileSync(
		join(root, ".afol", "memory", "memory.md"),
		[
			"---",
			"doc_type: project_memory",
			`updated_at: ${updatedAt}`,
			"entries: 1",
			"---",
			"",
			"# Project Memory",
			"",
			"## active",
			"### M-1: Test memory",
			"<!--",
			`created_at: ${updatedAt}`,
			`updated_at: ${updatedAt}`,
			"tags: test",
			"-->",
			"body",
		].join("\n"),
		"utf8",
	);
}

function writeSectionIndex(root: string, generatedAt: string): void {
	writeFileSync(
		join(root, ".afol", "adm", "specs", "test.md"),
		[
			"---",
			"doc_type: spec",
			"id: test",
			"roadmap_feature: test",
			"---",
			"",
			"## Overview",
			"",
		].join("\n"),
		"utf8",
	);
	writeFileSync(
		join(root, ".afol", "data", "index", "sections.json"),
		`${JSON.stringify({
			...buildSectionIndexSnapshot(root),
			generated_at: generatedAt,
		})}\n`,
		"utf8",
	);
}

function writePstrIndex(root: string, staleAfter: string): void {
	const snapshot = rebuildPstrIndex(root);
	const maps = snapshot.maps.map((map) => ({
		...map,
		updated_at: staleAfter,
		stale_after: staleAfter,
	}));
	const next = {
		...snapshot,
		generated_at: staleAfter,
		maps,
		manifest: buildPstrSnapshotManifest({ maps }),
	};
	writeFileSync(
		join(root, ".afol", "pstr", "index.json"),
		`${JSON.stringify(next)}\n`,
		"utf8",
	);
}

function hoursAgo(hours: number): string {
	return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function writeSessionLifecycleEvents(
	root: string,
	events: Array<{
		type?: string;
		session?: string;
		event_type?: string;
		session_id?: string;
	}>,
): void {
	const eventsPath = join(root, ".afol", "data", "events", "events.jsonl");
	mkdirSync(join(root, ".afol", "data", "events"), { recursive: true });
	writeFileSync(
		eventsPath,
		`${events
			.map((event, index) =>
				JSON.stringify({
					...(event.type ? { type: event.type } : {}),
					...(event.session ? { session: event.session } : {}),
					...(event.event_type ? { event_type: event.event_type } : {}),
					...(event.session_id ? { session_id: event.session_id } : {}),
					id: `E2E-${index}`,
					ts: hoursAgo(0),
					source: "cli-workbench",
				}),
			)
			.join("\n")}\n`,
		"utf8",
	);
}

function seedHealthyRoot(root: string): void {
	const updatedAt = hoursAgo(-1);
	writeProjectMemory(root, {
		updated_at: updatedAt,
		entries: [
			{
				id: "M-1",
				title: "Healthy memory",
				body: "ok",
				status: "active",
				created_at: updatedAt,
				updated_at: updatedAt,
				tags: [],
			},
		],
	});
	writePstrIndex(root, hoursAgo(-1));
	writeSectionIndex(root, hoursAgo(-1));
	rebuildWorkBenchIndex(root);
	openDb(root).close();
	initGitRepo(root);
}

function seedDeepHealthRoot(root: string): void {
	seedHealthyRoot(root);
	writeSectionIndex(root, hoursAgo(-1));
}

describe("health system", () => {
	test("checkHealth returns report with findings", () => {
		const root = createFixture();
		try {
			writeMemory(root, hoursAgo(24 * 45));
			const report = checkHealth(root, { deep: true });
			expect(report.ok).toBe(true);
			expect(report.findings.length).toBeGreaterThan(0);
			expect(
				report.summary.fail + report.summary.warn + report.summary.info,
			).toBe(report.findings.length);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("health treats missing administration as advisory unless release scoped", async () => {
		const root = createFixture();
		try {
			rmSync(join(root, ".afol", "adm"), { recursive: true, force: true });
			const report = checkHealth(root, { area: "adm" });
			expect(report.ok).toBe(true);
			expect(report.findings[0]?.severity).toBe("warn");
			expect(report.findings[0]?.message).toContain("missing");

			const captured = captureIo();
			expect(
				await runHealthCommand(["--release", "--json"], root, captured.io),
			).toBe(1);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				exit_code: number;
				data: {
					findings: Array<{
						area: string;
						severity: string;
						message: string;
					}>;
				};
			};
			expect(payload.exit_code).toBe(1);
			expect(
				payload.data.findings.some(
					(finding) =>
						finding.area === "adm" &&
						finding.severity === "fail" &&
						finding.message.includes("missing"),
				),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test.skipIf(process.platform === "win32")(
		"checkHealth fails when a child session directory is unreadable",
		() => {
			const root = createFixture();
			const session = "260715_1500_unreadable-health";
			const sessionDir = join(root, ".afol", "wb", session);
			try {
				mkdirSync(sessionDir, { recursive: true });
				rebuildWorkBenchIndex(root);
				chmodSync(sessionDir, 0o000);

				const report = checkHealth(root, {});
				expect(report.ok).toBe(false);
				expect(
					report.findings.some(
						(finding) =>
							finding.area === "wb" &&
							finding.severity === "fail" &&
							finding.message.includes("session directory unreadable"),
					),
				).toBe(true);
			} finally {
				chmodSync(sessionDir, 0o700);
				rmSync(root, { recursive: true, force: true });
			}
		},
	);

	test("checkHealth detects stale PSTR", () => {
		const root = createFixture();
		try {
			writePstrIndex(root, hoursAgo(24 * 45));
			const report = checkHealth(root, { area: "pstr" });
			expect(
				report.findings.some((finding) =>
					finding.message.includes("stale pstr map"),
				),
			).toBe(true);
			expect(report.findings.every((finding) => finding.area === "pstr")).toBe(
				true,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("checkHealth detects PSTR source drift before expiry", () => {
		const root = createFixture();
		try {
			rebuildPstrIndex(root);
			writeFileSync(
				join(root, "cli", "main.ts"),
				"export const cli = false;\n",
			);
			const report = checkHealth(root, { area: "pstr" });
			const canonical = collectFreshnessReport(root, {
				localState: false,
				pstr: true,
			}).findings.find((finding) => finding.id === "pstr:map:cli");
			expect(canonical).toMatchObject({
				surface: "pstr",
				state: "stale",
			});
			expect(
				report.findings.some((finding) =>
					finding.message.includes("stale pstr map: cli"),
				),
			).toBe(true);
			expect(
				report.findings.some(
					(finding) =>
						finding.area === "pstr" &&
						finding.severity === "warn" &&
						finding.hint === "run afol pstr rebuild",
				),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("checkHealth promotes stale PSTR warnings in release scope", () => {
		const root = createFixture();
		try {
			writePstrIndex(root, hoursAgo(24 * 45));
			const routine = checkHealth(root, { area: "pstr" });
			expect(routine.ok).toBe(true);
			expect(
				routine.findings.every((finding) => finding.severity === "warn"),
			).toBe(true);

			const release = checkHealth(root, { area: "pstr", release: true });
			expect(release.ok).toBe(false);
			expect(release.summary.fail).toBe(release.findings.length);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("checkHealth reports an invalid PSTR index without synthesized map failures", () => {
		const root = createFixture();
		try {
			writeFileSync(join(root, ".afol", "pstr", "index.json"), "{", "utf8");
			const report = checkHealth(root, { area: "pstr" });
			expect(report.findings).toEqual([
				expect.objectContaining({
					area: "pstr",
					message: expect.stringContaining("invalid pstr index snapshot"),
				}),
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("checkHealth default ignores auxiliary health surfaces", () => {
		const root = createFixture();
		try {
			writePstrIndex(root, hoursAgo(24 * 45));
			writeMemory(root, hoursAgo(24 * 45));
			rebuildWorkBenchIndex(root);

			const report = checkHealth(root);
			expect(report.ok).toBe(true);
			expect(report.findings).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("detectSessionHealth warns missing session dir without active directory, archive, or migration", () => {
		const root = createFixture();
		const session = "260709_1751_lifecycle-integrity-hardening";
		try {
			writeSessionLifecycleEvents(root, [{ type: "workbench.new", session }]);
			const warnings = detectSessionHealth(root);
			expect(warnings).toEqual([
				{
					type: "missing_session_directory",
					session,
					message: `Session "${session}" has start event but no active workbench directory and no migration/archive fallback.`,
				},
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("detectSessionHealth suppresses missing-session warning when session directory exists", () => {
		const root = createFixture();
		const session = "260709_1751_lifecycle-integrity-hardening";
		try {
			mkdirSync(join(root, ".afol", "wb", session), { recursive: true });
			writeSessionLifecycleEvents(root, [{ type: "workbench.new", session }]);
			const warnings = detectSessionHealth(root);
			expect(
				warnings.some(
					(warning) => warning.type === "missing_session_directory",
				),
			).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("detectSessionHealth suppresses missing-session warning when session archive exists", () => {
		const root = createFixture();
		const session = "260709_1751_lifecycle-integrity-hardening";
		try {
			mkdirSync(join(root, ".afol", "wb", "_archive", session), {
				recursive: true,
			});
			writeSessionLifecycleEvents(root, [{ type: "workbench.new", session }]);
			const warnings = detectSessionHealth(root);
			expect(
				warnings.some(
					(warning) => warning.type === "missing_session_directory",
				),
			).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("detectSessionHealth suppresses missing-session warning when migration record exists", () => {
		const root = createFixture();
		const session = "260709_1751_lifecycle-integrity-hardening";
		try {
			mkdirSync(join(root, ".afol", "data", "migrations", session), {
				recursive: true,
			});
			writeSessionLifecycleEvents(root, [{ type: "workbench.new", session }]);
			const warnings = detectSessionHealth(root);
			expect(
				warnings.some(
					(warning) => warning.type === "missing_session_directory",
				),
			).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("detectSessionHealth scans migration evidence once for multiple missing sessions", () => {
		const root = createFixture();
		const firstSession = "260709_1751_first-migrated-session";
		const secondSession = "260709_1752_second-migrated-session";
		const migrationRoot = join(root, ".afol", "data", "migrations");
		mkdirSync(migrationRoot, { recursive: true });
		writeFileSync(
			join(migrationRoot, "batch.md"),
			`${firstSession}\n${secondSession}\n`,
			"utf8",
		);
		writeSessionLifecycleEvents(root, [
			{ type: "workbench.new", session: firstSession },
			{ type: "workbench.new", session: secondSession },
		]);
		const readdirSpy = spyOn(nodeFs, "readdirSync");
		const readFileSpy = spyOn(nodeFs, "readFileSync");
		try {
			const warnings = detectSessionHealth(root);
			const migrationRootReads = readdirSpy.mock.calls.filter(
				([path]) => String(path) === migrationRoot,
			).length;
			const migrationFileReads = readFileSpy.mock.calls.filter(
				([path]) => String(path) === join(migrationRoot, "batch.md"),
			).length;
			expect(migrationRootReads).toBe(1);
			expect(migrationFileReads).toBe(1);
			expect(
				warnings.some(
					(warning) => warning.type === "missing_session_directory",
				),
			).toBe(false);
		} finally {
			readFileSpy.mockRestore();
			readdirSpy.mockRestore();
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("detectSessionHealth suppresses missing-session warning when session closed", () => {
		const root = createFixture();
		const session = "260709_1751_lifecycle-integrity-hardening";
		try {
			writeSessionLifecycleEvents(root, [
				{ type: "workbench.new", session },
				{ type: "workbench.close", session },
			]);
			const warnings = detectSessionHealth(root);
			expect(
				warnings.some(
					(warning) => warning.type === "missing_session_directory",
				),
			).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("detectSessionHealth warns when latest lifecycle transition reopens session", () => {
		const root = createFixture();
		const session = "260709_1751_lifecycle-integrity-hardening";
		try {
			writeSessionLifecycleEvents(root, [
				{ type: "workbench.new", session },
				{ type: "workbench.close", session },
				{ type: "workbench.new", session },
			]);
			const warnings = detectSessionHealth(root);
			expect(warnings).toEqual([
				{
					type: "missing_session_directory",
					session,
					message: `Session "${session}" has start event but no active workbench directory and no migration/archive fallback.`,
				},
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("checkHealth maps missing session directory warning to explicit remediation hint", () => {
		const root = createFixture();
		const session = "260709_1751_lifecycle-integrity-hardening";
		try {
			rebuildWorkBenchIndex(root);
			writeSessionLifecycleEvents(root, [{ type: "workbench.new", session }]);
			const report = checkHealth(root, { area: "wb" });
			const finding = report.findings.find(
				(finding) =>
					finding.severity === "warn" &&
					finding.message.includes(`Session "${session}"`),
			);
			expect(finding?.hint).toBe(
				"restore from archive, migration pack, or recreate the session directory",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("checkHealth detects missing memory", () => {
		const root = createFixture();
		try {
			const report = checkHealth(root, { area: "memory" });
			expect(report.findings[0]?.severity).toBe("warn");
			expect(report.findings[0]?.message).toContain(
				"missing or invalid project memory",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("checkHealth accepts recent review freshness only for empty memory", () => {
		const root = createFixture();
		const updatedAt = hoursAgo(24 * 31);
		try {
			writeFileSync(
				join(root, ".afol", "memory", "memory.md"),
				[
					"---",
					"doc_type: project_memory",
					`updated_at: ${updatedAt}`,
					"entries: 0",
					"---",
					"",
					"# Project Memory",
					"",
					"## active",
					"",
				].join("\n"),
				"utf8",
			);
			expect(
				checkHealth(root, { area: "memory" }).findings.some((finding) =>
					finding.message.includes("stale project memory"),
				),
			).toBe(true);
			recordMaintenanceReview(root, {
				area: "memory",
				note: "Reviewed empty memory; no reusable candidates.",
			});

			const emptyReport = checkHealth(root, { area: "memory" });
			expect(
				emptyReport.findings.some((finding) =>
					finding.message.includes("stale project memory"),
				),
			).toBe(false);

			writeMemory(root, updatedAt);
			const populatedReport = checkHealth(root, { area: "memory" });
			expect(
				populatedReport.findings.some((finding) =>
					finding.message.includes("stale project memory"),
				),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("checkHealth detects missing state db", () => {
		const root = createFixture();
		try {
			const report = checkHealth(root, { area: "state" });
			expect(report.findings[0]?.severity).toBe("warn");
			expect(report.findings[0]?.message).toContain("missing state db");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test('checkHealth({area: "pstr"}) checks only pstr', () => {
		const root = createFixture();
		try {
			writePstrIndex(root, hoursAgo(24 * 45));
			writeMemory(root, hoursAgo(24 * 45));
			const report = checkHealth(root, { area: "pstr" });
			expect(report.findings.length).toBeGreaterThan(0);
			expect(report.findings.every((finding) => finding.area === "pstr")).toBe(
				true,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("summary counts are consistent", () => {
		const root = createFixture();
		try {
			writePstrIndex(root, hoursAgo(24 * 45));
			writeMemory(root, hoursAgo(24 * 45));
			writeSectionIndex(root, hoursAgo(1));
			const report = checkHealth(root, { deep: true });
			const fail = report.findings.filter(
				(finding) => finding.severity === "fail",
			).length;
			const warn = report.findings.filter(
				(finding) => finding.severity === "warn",
			).length;
			const info = report.findings.filter(
				(finding) => finding.severity === "info",
			).length;
			expect(report.summary).toEqual({ fail, warn, info });
			expect(fail).toBe(0);
			expect(warn).toBeGreaterThan(0);
			expect(info).toBeGreaterThan(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("runDoctor returns scores per area", () => {
		const root = createFixture();
		try {
			writePstrIndex(root, hoursAgo(24 * 45));
			writeMemory(root, hoursAgo(24 * 45));
			const report = runDoctor(root);
			expect(report.scores).toHaveLength(9);
			expect(report.scores.some((score) => score.area === "evolution")).toBe(
				true,
			);
			expect(
				report.scores.some(
					(score) => score.area === "pstr" && score.score < 100,
				),
			).toBe(true);
			expect(
				report.scores.some(
					(score) => score.area === "memory" && score.score < 100,
				),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("runDoctor returns remediation plan", () => {
		const root = createFixture();
		try {
			writePstrIndex(root, hoursAgo(24 * 45));
			writeMemory(root, hoursAgo(24 * 45));
			const report = runDoctor(root);
			expect(report.remediation.length).toBeGreaterThan(0);
			expect(
				report.remediation.every((step, index) => step.step === index + 1),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("remediation is ordered by severity", () => {
		const root = createFixture();
		try {
			writePstrIndex(root, hoursAgo(24 * 45));
			writeMemory(root, hoursAgo(24 * 45));
			const report = runDoctor(root);
			const severities = report.remediation.map((step) => step.severity);
			expect(severities[0]).toBe("warn");
			expect(severities.some((severity) => severity === "warn")).toBe(true);
			expect(severities.every((severity) => severity !== "fail")).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("maintenanceWeekly(root, true) returns plan-only suggestions", () => {
		const root = createFixture();
		try {
			const result = maintenanceWeekly(root, true);
			expect(result.planOnly).toBe(true);
			expect(result.actions).toContain("check PSTR stale");
			expect(result.actions).toContain("archive old sessions");
			expect(result.actions.join("\n")).toContain(
				"review maintenance areas: rules, skills, docs, commands, memory, library, organization",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("maintenanceMonthly(root, false) returns plan-only suggestions", () => {
		const root = createFixture();
		try {
			const result = maintenanceMonthly(root, false);
			expect(result.planOnly).toBe(true);
			expect(result.actions).toContain("rotate logs");
			expect(result.actions).toContain(
				"review roadmap/spec/manifest alignment",
			);
			expect(result.actions).toContain("prune obsolete rules/skills");
			expect(result.actions).toContain(
				"archive closed sessions older than 90 days",
			);
			expect(result.actions).toContain("rebuild stale indexes");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol health --release --json returns JSON report", async () => {
		const root = createFixture();
		try {
			writePstrIndex(root, hoursAgo(24 * 45));
			const captured = captureIo();
			expect(
				await runHealthCommand(["--release", "--json"], root, captured.io),
			).toBe(1);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.exit_code).toBe(1);
			expect(payload.ok).toBe(false);
			expect(payload.findings).toBeUndefined();
			expect(Array.isArray(payload.data.findings)).toBe(true);
			expect(payload.summary).toEqual({
				fail: expect.any(Number),
				warn: expect.any(Number),
				info: expect.any(Number),
			});
			expect(payload.scope).toBe("release");
			expect(payload.checked_areas).toContain("pstr");
			expect(payload.release).toBe(true);
			expect(payload.data.checked_at).toBe(payload.checked_at);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol doctor --json returns JSON", async () => {
		const root = createFixture();
		try {
			writePstrIndex(root, hoursAgo(24 * 45));
			const captured = captureIo();
			expect(await runDoctorCommand(["--json"], root, captured.io)).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.exit_code).toBe(0);
			expect(payload.ok).toBe(true);
			expect(Array.isArray(payload.scores)).toBe(true);
			expect(Array.isArray(payload.remediation)).toBe(true);
			expect(payload.remediation_plan).toBe(false);
			expect(payload.scope).toBe("full");
			expect(payload.configuration.evolution).toMatchObject({
				valid: true,
				configured: false,
				timezone: "UTC",
			});
			expect(payload.data.scores).toHaveLength(payload.scores.length);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol maintenance weekly --json returns plan-only JSON", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			expect(
				await runMaintenanceCommand(["weekly", "--json"], root, captured.io),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				mode: string;
				dry_run: boolean;
				plan_only: boolean;
				actions: string[];
				data?: {
					mode?: string;
					dry_run?: boolean;
					plan_only?: boolean;
					actions?: string[];
				};
			};
			expect(payload.mode).toBe("weekly");
			expect(payload.dry_run).toBe(false);
			expect(payload.plan_only).toBe(true);
			expect(Array.isArray(payload.actions)).toBe(true);
			expect(payload.data?.mode).toBe("weekly");
			expect(payload.data?.dry_run).toBe(false);
			expect(payload.data?.plan_only).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol maintenance monthly --json returns JSON", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			expect(
				await runMaintenanceCommand(
					["monthly", "--dry-run", "--json"],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				exit_code: number;
				mode: string;
				dry_run: boolean;
				plan_only: boolean;
				actions: string[];
				data?: {
					mode?: string;
					dry_run?: boolean;
					plan_only?: boolean;
					actions?: string[];
				};
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.exit_code).toBe(0);
			expect(payload.mode).toBe("monthly");
			expect(payload.dry_run).toBe(true);
			expect(payload.plan_only).toBe(true);
			expect(payload.data?.mode).toBe("monthly");
			expect(payload.data?.dry_run).toBe(true);
			expect(payload.data?.plan_only).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol maintenance review --json records area with configured interval", async () => {
		const root = createFixture();
		try {
			writeFileSync(
				join(root, ".agents", "config.json"),
				JSON.stringify(
					{
						version: "0.1.0",
						maintenance: {
							review_interval_days: 14,
						},
					},
					null,
					2,
				),
				"utf8",
			);
			const captured = captureIo();
			expect(
				await runMaintenanceCommand(
					["review", "--area", "rules", "--note", "checked", "--json"],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				mode: string;
				area: string;
				reviewed_areas: string[];
				note: string;
				review_interval_days: number;
				due_areas: string[];
				data?: {
					mode?: string;
					area?: string;
					reviewed_areas?: string[];
					review_interval_days?: number;
					due_areas?: string[];
				};
			};
			expect(payload.mode).toBe("review");
			expect(payload.area).toBe("rules");
			expect(payload.reviewed_areas).toEqual(["rules"]);
			expect(payload.note).toBe("checked");
			expect(payload.review_interval_days).toBe(14);
			expect(payload.due_areas).toEqual([
				"skills",
				"docs",
				"commands",
				"memory",
				"library",
				"organization",
			]);
			expect(payload.data?.mode).toBe("review");
			expect(payload.data?.area).toBe("rules");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol maintenance review dry-run does not persist and restricted writes are denied", async () => {
		const root = createFixture();
		try {
			const reviewPath = join(
				root,
				".afol",
				"data",
				"maintenance",
				"reviews.json",
			);
			const dryRun = captureIo();
			expect(
				await runMaintenanceCommand(
					["review", "--area", "rules", "--dry-run", "--json"],
					root,
					dryRun.io,
					agentOperationContext(),
				),
			).toBe(0);
			const payload = JSON.parse(dryRun.stdout[0] ?? "{}") as {
				area: string;
				due_areas: string[];
				current_summary: { due_areas: string[]; review_interval_days: number };
				preview_summary: { due_areas: string[]; review_interval_days: number };
				data?: {
					area?: string;
					due_areas?: string[];
					current_summary?: { due_areas?: string[] };
					preview_summary?: { due_areas?: string[] };
				};
			};
			expect(payload.area).toBe("rules");
			expect(payload.due_areas).toEqual([
				"rules",
				"skills",
				"docs",
				"commands",
				"memory",
				"library",
				"organization",
			]);
			expect(payload.current_summary.due_areas).toEqual([
				"rules",
				"skills",
				"docs",
				"commands",
				"memory",
				"library",
				"organization",
			]);
			expect(payload.preview_summary.due_areas).toEqual([
				"skills",
				"docs",
				"commands",
				"memory",
				"library",
				"organization",
			]);
			expect(existsSync(reviewPath)).toBe(false);
			expect(readMaintenanceReviewSummary(root).due_areas).toEqual([
				"rules",
				"skills",
				"docs",
				"commands",
				"memory",
				"library",
				"organization",
			]);

			const denied = captureIo();
			expect(
				await runMaintenanceCommand(
					["review", "--area", "rules"],
					root,
					denied.io,
					agentOperationContext(),
				),
			).toBe(2);
			expect(denied.stderr.join("\n")).toContain(
				"maintenance review requires local interactive approval",
			);
			expect(existsSync(reviewPath)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol maintenance review supports positional area and human output", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			expect(
				await runMaintenanceCommand(
					["review", "docs", "--note", "checked"],
					root,
					captured.io,
				),
			).toBe(0);
			const output = captured.stdout.join("\n");
			expect(output).toContain("maintenance review recorded: docs");
			expect(output).toContain(
				"due next: rules, skills, commands, memory, library, organization",
			);
			const summary = readMaintenanceReviewSummary(root);
			expect(summary.areas.find((entry) => entry.area === "docs")?.note).toBe(
				"checked",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol maintenance review dry-run human output shows preview_summary", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			expect(
				await runMaintenanceCommand(
					["review", "--area", "rules", "--dry-run"],
					root,
					captured.io,
				),
			).toBe(0);
			const output = captured.stdout.join("\n");
			expect(output).toContain("maintenance review preview: rules");
			expect(output).toContain("current due: rules");
			expect(output).toContain(
				"due next: skills, docs, commands, memory, library, organization",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol maintenance review supports inline note values", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			expect(
				await runMaintenanceCommand(
					["review", "--area", "docs", "--note=inline-note", "--json"],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout.join("\n")) as {
				note: string;
				reviewed_areas: string[];
			};
			expect(payload.note).toBe("inline-note");
			expect(payload.reviewed_areas).toEqual(["docs"]);
			const summary = readMaintenanceReviewSummary(root);
			expect(summary.areas.find((entry) => entry.area === "docs")?.note).toBe(
				"inline-note",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol maintenance review rejects missing note values before json aliases", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			expect(
				await runMaintenanceCommand(
					["review", "--area", "rules", "--note", "--json"],
					root,
					captured.io,
				),
			).toBe(2);
			expect(captured.stdout).toEqual([]);
			expect(captured.stderr).toEqual(["Missing value for --note."]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol maintenance review rejects empty inline note values", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			expect(
				await runMaintenanceCommand(
					["review", "--area", "rules", "--note="],
					root,
					captured.io,
				),
			).toBe(2);
			expect(captured.stdout).toEqual([]);
			expect(captured.stderr).toEqual(["Missing value for --note."]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol maintenance review refuses to overwrite malformed review store", async () => {
		const root = createFixture();
		try {
			const reviewDir = join(root, ".afol", "data", "maintenance");
			const reviewPath = join(reviewDir, "reviews.json");
			mkdirSync(reviewDir, { recursive: true });
			writeFileSync(reviewPath, "{bad-json", "utf8");

			const captured = captureIo();
			expect(
				await runMaintenanceCommand(
					["review", "--area", "rules"],
					root,
					captured.io,
				),
			).toBe(2);
			expect(captured.stderr.join("\n")).toContain(
				"Malformed maintenance review store",
			);
			expect(readFileSync(reviewPath, "utf8")).toBe("{bad-json");
			const summary = readMaintenanceReviewSummary(root);
			expect(summary.store_status).toBe("malformed");
			expect(summary.store_error).toContain("JSON");
			expect(summary.due_areas).toEqual([
				"rules",
				"skills",
				"docs",
				"commands",
				"memory",
				"library",
				"organization",
			]);
			expect(maintenanceWeekly(root, true).actions).toContain(
				`repair maintenance review store: ${summary.store_error}`,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol maintenance review refuses to overwrite invalid review store shape", async () => {
		const root = createFixture();
		try {
			const reviewDir = join(root, ".afol", "data", "maintenance");
			const reviewPath = join(reviewDir, "reviews.json");
			const original = JSON.stringify({ version: 2, areas: [] });
			mkdirSync(reviewDir, { recursive: true });
			writeFileSync(reviewPath, original, "utf8");

			const captured = captureIo();
			expect(
				await runMaintenanceCommand(
					["review", "--area", "rules"],
					root,
					captured.io,
				),
			).toBe(2);
			expect(captured.stderr.join("\n")).toContain(
				"Malformed maintenance review store",
			);
			expect(readFileSync(reviewPath, "utf8")).toBe(original);
			const summary = readMaintenanceReviewSummary(root);
			expect(summary.store_status).toBe("malformed");
			expect(summary.store_error).toBe(
				"invalid maintenance review store shape",
			);
			expect(summary.due_areas).toEqual([
				"rules",
				"skills",
				"docs",
				"commands",
				"memory",
				"library",
				"organization",
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("legacy reference scan includes memory and library surfaces", () => {
		const root = createFixture();
		try {
			mkdirSync(join(root, ".afol", "memory"), { recursive: true });
			mkdirSync(join(root, ".afol", "library", "topics"), {
				recursive: true,
			});
			writeFileSync(
				join(root, ".afol", "memory", "memory.md"),
				"Keep this away from .agents/wb references.\n",
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "library", "topics", "legacy.md"),
				"Old docs still say legacy:delegate.\n",
				"utf8",
			);

			const result = scanLegacyReferences(root);

			expect(result.files).toEqual(
				expect.arrayContaining([
					".afol/memory/memory.md",
					".afol/library/topics/legacy.md",
				]),
			);
			expect(result.patterns).toEqual(
				expect.arrayContaining([".agents/wb", "legacy:"]),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("legacy reference scan skips files with allowlist frontmatter", () => {
		const root = createFixture();
		try {
			writeFileSync(
				join(root, "docs", "migration-notes.md"),
				[
					"---",
					"legacy_reference_allowed: true",
					"---",
					"legacy: .agents/wb is documented here on purpose.",
				].join("\n"),
				"utf8",
			);
			writeFileSync(
				join(root, "docs", "migration-warning.md"),
				"legacy:\n",
				"utf8",
			);
			const result = scanLegacyReferences(root);

			expect(result.files).toContain("docs/migration-warning.md");
			expect(result.files).not.toContain("docs/migration-notes.md");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("legacy reference scan skips gotchas/migration/retirement docs by filename", () => {
		const root = createFixture();
		try {
			writeFileSync(join(root, "docs", "gotchas.md"), "legacy:\n", "utf8");
			writeFileSync(
				join(root, "docs", "migration.md"),
				".agents/runtime is retired.",
				"utf8",
			);
			writeFileSync(
				join(root, "docs", "retirement.md"),
				".agents/scripts was moved.",
				"utf8",
			);
			writeFileSync(
				join(root, "docs", "migration-guide.md"),
				"agents.config should be removed.",
				"utf8",
			);

			const result = scanLegacyReferences(root);

			expect(result.files).toEqual(
				expect.not.arrayContaining([
					"docs/gotchas.md",
					"docs/migration.md",
					"docs/retirement.md",
				]),
			);
			expect(result.files).toContain("docs/migration-guide.md");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("legacy reference scan reports unreadable files instead of hiding them", () => {
		const root = createFixture();
		const unreadablePath = join(root, "docs", "unreadable.md");
		try {
			mkdirSync(join(root, "docs"), { recursive: true });
			writeFileSync(unreadablePath, "legacy: maybe\n", "utf8");
			chmodSync(unreadablePath, 0);

			const result = scanLegacyReferences(root);

			if (result.warnings.length === 0) {
				// Some privileged runtimes can still read mode 000 files.
				expect(result.files).toContain("docs/unreadable.md");
			} else {
				expect(result.warnings.join("\n")).toContain(
					"legacy reference scan skipped docs/unreadable.md",
				);
				expect(result.files).not.toContain("docs/unreadable.md");
			}
		} finally {
			if (existsSync(unreadablePath)) {
				chmodSync(unreadablePath, 0o600);
			}
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol health defaults to human output", async () => {
		const root = createFixture();
		try {
			writePstrIndex(root, hoursAgo(24 * 45));
			writeMemory(root, hoursAgo(24 * 45));
			rebuildWorkBenchIndex(root);
			const captured = captureIo();
			expect(await runHealthCommand([], root, captured.io)).toBe(0);
			expect(captured.stdout.join("\n")).toContain("health core: ok");
			expect(captured.stdout.join("\n")).toContain("checked: wb only");
			expect(captured.stdout.join("\n")).not.toContain("pstr");
			expect(captured.stdout.join("\n")).not.toContain("memory");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol health default run stays core-only when auxiliary state exists", async () => {
		const root = createFixture();
		try {
			seedHealthyRoot(root);
			writePstrIndex(root, hoursAgo(24 * 45));
			const captured = captureIo();
			expect(await runHealthCommand([], root, captured.io)).toBe(0);
			expect(captured.stdout.join("\n")).toContain("health core: ok");
			expect(captured.stdout.join("\n")).toContain("checked: wb only");
			expect(captured.stdout.join("\n")).not.toContain("FAIL pstr");

			const full = captureIo();
			expect(await runHealthCommand(["full"], root, full.io)).toBe(0);
			expect(full.stdout.join("\n")).toContain("health full: ok");
			expect(full.stdout.join("\n")).toContain("WARN pstr: stale pstr map");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol health --json returns success on healthy root", async () => {
		const root = createFixture();
		try {
			seedHealthyRoot(root);
			const captured = captureIo();
			expect(await runHealthCommand(["--json"], root, captured.io)).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.exit_code).toBe(0);
			expect(payload.ok).toBe(true);
			expect(payload.summary).toEqual({ fail: 0, warn: 0, info: 0 });
			expect(payload.scope).toBe("core");
			expect(payload.checked_areas).toEqual(["wb"]);
			expect(payload.release).toBe(false);
			expect(payload.data.summary).toEqual({ fail: 0, warn: 0, info: 0 });
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol health full --json compacts repeated state drift under the output budget", async () => {
		const root = createFixture();
		const session = "260830_0900_health-state-drift";
		const sessionDir = join(root, ".afol", "wb", session);
		try {
			mkdirSync(sessionDir, { recursive: true });
			const db = openDb(root);
			try {
				db.query(
					"INSERT INTO sessions (session_id, hydrated_at, source_algorithm, source_hash, session_path) VALUES (?, ?, ?, ?, ?)",
				).run(
					session,
					"2026-08-30T09:00:00.000Z",
					"sha256",
					"a".repeat(64),
					sessionDir,
				);
				const insert = db.query(
					"INSERT INTO source_files (session_id, path, kind, source_hash) VALUES (?, ?, ?, ?)",
				);
				for (let index = 0; index < 200; index += 1) {
					insert.run(
						session,
						`missing-${String(index).padStart(3, "0")}.md`,
						"task",
						"b".repeat(64),
					);
				}
			} finally {
				db.close();
			}

			const captured = captureIo();
			expect(
				await runHealthCommand(["full", "--json"], root, captured.io),
			).toBe(0);
			const output = captured.stdout[0] ?? "";
			expect(new TextEncoder().encode(output).byteLength).toBeLessThanOrEqual(
				20_000,
			);
			const payload = JSON.parse(output) as {
				data: {
					findings: Array<{ area: string; message: string }>;
					findings_omitted: number;
					findings_total: number;
				};
			};
			expect(payload.data.findings_omitted).toBe(199);
			expect(payload.data.findings_total).toBeGreaterThanOrEqual(200);
			expect(payload.data.findings.length).toBeLessThan(
				payload.data.findings_total,
			);
			expect(
				payload.data.findings.some(
					(finding) =>
						finding.area === "state" &&
						finding.message.includes("200 hydrated files drift"),
				),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol health --deep returns deep info", async () => {
		const root = createFixture();
		try {
			seedDeepHealthRoot(root);
			const captured = captureIo();
			expect(await runHealthCommand(["--deep"], root, captured.io)).toBe(0);
			expect(captured.stdout.join("\n")).toContain("info=");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol health --area pstr limits findings", async () => {
		const root = createFixture();
		try {
			writePstrIndex(root, hoursAgo(24 * 45));
			const captured = captureIo();
			expect(
				await runHealthCommand(["--area", "pstr"], root, captured.io),
			).toBe(0);
			expect(captured.stdout.join("\n")).toContain("pstr");
			expect(captured.stdout.join("\n")).not.toContain("memory");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol health rejects invalid area", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			expect(
				await runHealthCommand(["--area", "bogus"], root, captured.io),
			).toBe(2);
			expect(captured.stderr.join("\n")).toContain(
				"Missing or invalid value for --area.",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol doctor defaults to scores output", async () => {
		const root = createFixture();
		try {
			writePstrIndex(root, hoursAgo(24 * 45));
			const captured = captureIo();
			expect(await runDoctorCommand([], root, captured.io)).toBe(0);
			expect(captured.stdout.join("\n")).toContain("doctor scope: full");
			expect(captured.stdout.join("\n")).toContain("evolution config:");
			expect(captured.stdout.join("\n")).toContain("doctor scores:");
			expect(captured.stdout.join("\n")).toContain("pstr:");
			expect(captured.stdout.join("\n")).toContain(
				"afol doctor --remediation-plan",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol doctor --remediation-plan prints plan", async () => {
		const root = createFixture();
		try {
			writePstrIndex(root, hoursAgo(24 * 45));
			const captured = captureIo();
			expect(
				await runDoctorCommand(["--remediation-plan"], root, captured.io),
			).toBe(0);
			expect(captured.stdout.join("\n")).toContain("doctor scope: full");
			expect(captured.stdout.join("\n")).toContain("doctor remediation plan:");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol doctor rejects invalid args", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			expect(await runDoctorCommand(["--bogus"], root, captured.io)).toBe(2);
			expect(captured.stderr.join("\n")).toContain(
				"Unknown doctor argument: --bogus",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol maintenance weekly defaults to human output", async () => {
		const root = createFixture();
		try {
			writePstrIndex(root, hoursAgo(24 * 45));
			const captured = captureIo();
			expect(await runMaintenanceCommand(["weekly"], root, captured.io)).toBe(
				0,
			);
			expect(captured.stdout.join("\n")).toContain("maintenance weekly plan:");
			expect(captured.stdout.join("\n")).toContain(
				"review maintenance areas: rules, skills, docs, commands, memory, library, organization",
			);
			expect(captured.stdout.join("\n")).not.toContain("applied:");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol maintenance monthly dry-run emits JSON", async () => {
		const root = createFixture();
		try {
			writePstrIndex(root, hoursAgo(24 * 45));
			const captured = captureIo();
			expect(
				await runMaintenanceCommand(
					["monthly", "--dry-run", "--json"],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				exit_code: number;
				mode: string;
				dry_run: boolean;
				plan_only: boolean;
				actions: string[];
				data?: {
					mode?: string;
					dry_run?: boolean;
					plan_only?: boolean;
					actions?: string[];
				};
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.exit_code).toBe(0);
			expect(payload.mode).toBe("monthly");
			expect(payload.dry_run).toBe(true);
			expect(payload.plan_only).toBe(true);
			expect(payload.data?.mode).toBe("monthly");
			expect(payload.data?.dry_run).toBe(true);
			expect(payload.data?.plan_only).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol maintenance rejects invalid args", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			expect(await runMaintenanceCommand(["yearly"], root, captured.io)).toBe(
				2,
			);
			expect(captured.stderr.join("\n")).toContain(
				"Unknown maintenance argument: yearly",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
