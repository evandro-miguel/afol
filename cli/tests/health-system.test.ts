import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
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
import { checkHealth } from "../services/health/checker";
import { runDoctor } from "../services/health/doctor";
import {
	maintenanceMonthly,
	maintenanceWeekly,
} from "../services/health/maintenance";
import {
	readMaintenanceReviewSummary,
	scanLegacyReferences,
} from "../services/health/maintenance-review";
import { rebuildWorkBenchIndex } from "../services/local-state/workbench-index";
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
	mkdirSync(join(root, "docs", "arc", "SPECS"), { recursive: true });
	mkdirSync(join(root, "docs", "arc", "DECISIONS"), { recursive: true });
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
		join(root, ".afol", "data", "index", "sections.json"),
		`${JSON.stringify({
			kind: "sections_index_v1",
			version: 1,
			generated_at: generatedAt,
			sections: [
				{
					ref: "spec:test#overview",
					title: "Overview",
					level: 2,
					line_start: 1,
					line_end: 2,
					source_path: "docs/arc/SPECS/test.md",
				},
			],
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
			expect(report.ok).toBe(false);
			expect(report.findings.length).toBeGreaterThan(0);
			expect(
				report.summary.fail + report.summary.warn + report.summary.info,
			).toBe(report.findings.length);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

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

	test("checkHealth detects missing memory", () => {
		const root = createFixture();
		try {
			const report = checkHealth(root, { area: "memory" });
			expect(report.findings[0]?.severity).toBe("fail");
			expect(report.findings[0]?.message).toContain(
				"missing or invalid project memory",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("checkHealth detects missing state db", () => {
		const root = createFixture();
		try {
			const report = checkHealth(root, { area: "state" });
			expect(report.findings[0]?.severity).toBe("fail");
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
			expect(fail).toBeGreaterThan(0);
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
			expect(report.scores).toHaveLength(8);
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
			expect(severities[0]).toBe("fail");
			expect(severities.some((severity) => severity === "warn")).toBe(true);
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
			expect(Array.isArray(payload.findings)).toBe(true);
			expect(payload.summary).toEqual({
				fail: expect.any(Number),
				warn: expect.any(Number),
				info: expect.any(Number),
			});
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
			expect(captured.stdout.join("\n")).toContain("health: ok");
			expect(captured.stdout.join("\n")).not.toContain("pstr");
			expect(captured.stdout.join("\n")).not.toContain("memory");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol health default run still checks non-wb areas", async () => {
		const root = createFixture();
		try {
			seedHealthyRoot(root);
			writePstrIndex(root, hoursAgo(24 * 45));
			const captured = captureIo();
			expect(await runHealthCommand([], root, captured.io)).toBe(1);
			expect(captured.stdout.join("\n")).toContain("FAIL pstr: stale pstr map");
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
			expect(payload.release).toBe(false);
			expect(payload.data.summary).toEqual({ fail: 0, warn: 0, info: 0 });
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
			).toBe(1);
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
