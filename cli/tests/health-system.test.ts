import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDoctorCommand } from "../commands/doctor";
import { runHealthCommand } from "../commands/health";
import { runMaintenanceCommand } from "../commands/maintenance";
import { writeMemory as writeProjectMemory } from "../services/memory";
import { openDb } from "../services/state";
import { checkHealth, runDoctor, maintenanceMonthly, maintenanceWeekly } from "../services/health";

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
	const root = mkdtempSync(join(tmpdir(), "health-test-"));
	mkdirSync(join(root, ".agents"), { recursive: true });
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	mkdirSync(join(root, ".afol", "state"), { recursive: true });
	mkdirSync(join(root, ".afol", "pstr"), { recursive: true });
	mkdirSync(join(root, ".afol", "memory"), { recursive: true });
	mkdirSync(join(root, ".afol", "library"), { recursive: true });
	mkdirSync(join(root, ".afol", "data", "index"), { recursive: true });
	mkdirSync(join(root, "docs", "arc", "SPECS"), { recursive: true });
	mkdirSync(join(root, "docs", "arc", "DECISIONS"), { recursive: true });
	writeFileSync(join(root, ".agents", "config.json"), '{"version":"0.1.0"}', "utf8");
	writeFileSync(join(root, ".agents", "lock.json"), '{"version":"0.1.0"}', "utf8");
	writeFileSync(join(root, ".agents", "manifest.json"), '{"commands":[]}', "utf8");
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
		JSON.stringify({
			kind: "sections_index_v1",
			version: 1,
			generated_at: generatedAt,
			sections: [
				{ ref: "spec:test#overview", title: "Overview", level: 2, line_start: 1, line_end: 2, source_path: "docs/arc/SPECS/test.md" },
			],
		}) + "\n",
		"utf8",
	);
}

function writePstrIndex(root: string, staleAfter: string): void {
	writeFileSync(
		join(root, ".afol", "pstr", "index.json"),
		JSON.stringify({
			kind: "pstr_index_v1",
			version: 1,
			generated_at: staleAfter,
			source: { project_root: root, pstr_dir: join(root, ".afol", "pstr") },
			maps: [
				{ id: "cli", scope: "cli", status: "current", authority: "observed", source_paths: ["cli/main.ts"], source_hash: "hash-cli", file_count: 1, updated_at: staleAfter, stale_after: staleAfter, tags: ["pstr"] },
				{ id: "template", scope: "template", status: "current", authority: "observed", source_paths: ["src/project-template/index.ts"], source_hash: "hash-template", file_count: 1, updated_at: staleAfter, stale_after: staleAfter, tags: ["pstr"] },
				{ id: "docs", scope: "docs", status: "current", authority: "observed", source_paths: ["docs/arc/SPECS/test.md"], source_hash: "hash-docs", file_count: 1, updated_at: staleAfter, stale_after: staleAfter, tags: ["pstr"] },
				{ id: "config", scope: "config", status: "current", authority: "observed", source_paths: [".agents/config.json"], source_hash: "hash-config", file_count: 1, updated_at: staleAfter, stale_after: staleAfter, tags: ["pstr"] },
			],
		}) + "\n",
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
	openDb(root).close();
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
			expect(report.summary.fail + report.summary.warn + report.summary.info).toBe(report.findings.length);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("checkHealth detects stale PSTR", () => {
		const root = createFixture();
		try {
			writePstrIndex(root, hoursAgo(24 * 45));
			const report = checkHealth(root, { area: "pstr" });
			expect(report.findings.some((finding) => finding.message.includes("stale pstr map"))).toBe(true);
			expect(report.findings.every((finding) => finding.area === "pstr")).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("checkHealth detects missing memory", () => {
		const root = createFixture();
		try {
			const report = checkHealth(root, { area: "memory" });
			expect(report.findings[0]?.severity).toBe("fail");
			expect(report.findings[0]?.message).toContain("missing or invalid project memory");
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
			expect(report.findings.every((finding) => finding.area === "pstr")).toBe(true);
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
			const fail = report.findings.filter((finding) => finding.severity === "fail").length;
			const warn = report.findings.filter((finding) => finding.severity === "warn").length;
			const info = report.findings.filter((finding) => finding.severity === "info").length;
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
			expect(report.scores.some((score) => score.area === "pstr" && score.score < 100)).toBe(true);
			expect(report.scores.some((score) => score.area === "memory" && score.score < 100)).toBe(true);
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
			expect(report.remediation.every((step, index) => step.step === index + 1)).toBe(true);
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

	test("maintenanceWeekly(root, true) returns suggestions", () => {
		const root = createFixture();
		try {
			const result = maintenanceWeekly(root, true);
			expect(result.applied).toBe(false);
			expect(result.actions).toContain("check PSTR stale");
			expect(result.actions).toContain("archive old sessions");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("maintenanceMonthly(root, true) returns suggestions", () => {
		const root = createFixture();
		try {
			const result = maintenanceMonthly(root, true);
			expect(result.applied).toBe(false);
			expect(result.actions).toContain("rotate logs");
			expect(result.actions).toContain("rebuild stale indexes");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol health --json returns JSON report", async () => {
		const root = createFixture();
		try {
			writePstrIndex(root, hoursAgo(24 * 45));
			const captured = captureIo();
			expect(await runHealthCommand(["--json"], root, captured.io)).toBe(1);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(typeof payload.ok).toBe("boolean");
			expect(Array.isArray(payload.findings)).toBe(true);
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
			expect(payload.ok).toBe(true);
			expect(Array.isArray(payload.scores)).toBe(true);
			expect(Array.isArray(payload.remediation)).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol maintenance weekly --json returns JSON", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			expect(await runMaintenanceCommand(["weekly", "--dry-run", "--json"], root, captured.io)).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload.mode).toBe("weekly");
			expect(payload.dry_run).toBe(true);
			expect(Array.isArray(payload.actions)).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol maintenance monthly --json returns JSON", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			expect(await runMaintenanceCommand(["monthly", "--dry-run", "--json"], root, captured.io)).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload.mode).toBe("monthly");
			expect(payload.dry_run).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol health defaults to human output", async () => {
		const root = createFixture();
		try {
			seedHealthyRoot(root);
			const captured = captureIo();
			expect(await runHealthCommand([], root, captured.io)).toBe(0);
			expect(captured.stdout.join("\n")).toContain("health: ok");
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
			expect(payload.ok).toBe(true);
			expect(payload.summary).toEqual({ fail: 0, warn: 0, info: 0 });
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
			expect(await runHealthCommand(["--area", "pstr"], root, captured.io)).toBe(1);
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
			expect(await runHealthCommand(["--area", "bogus"], root, captured.io)).toBe(2);
			expect(captured.stderr.join("\n")).toContain("Missing or invalid value for --area.");
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
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol doctor --remediation-plan prints plan", async () => {
		const root = createFixture();
		try {
			writePstrIndex(root, hoursAgo(24 * 45));
			const captured = captureIo();
			expect(await runDoctorCommand(["--remediation-plan"], root, captured.io)).toBe(0);
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
			expect(captured.stderr.join("\n")).toContain("Unknown doctor argument: --bogus");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol maintenance weekly defaults to human output", async () => {
		const root = createFixture();
		try {
			writePstrIndex(root, hoursAgo(24 * 45));
			const captured = captureIo();
			expect(await runMaintenanceCommand(["weekly"], root, captured.io)).toBe(0);
			expect(captured.stdout.join("\n")).toContain("maintenance weekly:");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol maintenance monthly dry-run emits JSON", async () => {
		const root = createFixture();
		try {
			writePstrIndex(root, hoursAgo(24 * 45));
			const captured = captureIo();
			expect(await runMaintenanceCommand(["monthly", "--dry-run", "--json"], root, captured.io)).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload.mode).toBe("monthly");
			expect(payload.dry_run).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol maintenance rejects invalid args", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			expect(await runMaintenanceCommand(["yearly"], root, captured.io)).toBe(2);
			expect(captured.stderr.join("\n")).toContain("Unknown maintenance argument: yearly");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
