import { describe, expect, spyOn, test } from "bun:test";
import * as nodeFs from "node:fs";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { inspectEventLedger } from "../services/events/ledger";
import { collectFreshnessReport } from "../services/local-state/freshness";
import {
	collectWorkBenchSnapshot,
	loadWorkBenchIndexSnapshot,
	rebuildWorkBenchIndex,
	validateWorkBenchIndex,
} from "../services/local-state/workbench-index";
import { collectFreshnessReportFast } from "../services/project/validate-freshness";

const ALPHA = "260901_1000_alpha";
const BETA = "260901_1001_beta";

function createRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "freshness-"));
	mkdirSync(join(root, ".afol", "data", "events"), { recursive: true });
	mkdirSync(join(root, ".afol", "data", "index"), { recursive: true });
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "data", "events", "events.jsonl"),
		"",
		"utf8",
	);
	return root;
}

function writeSession(
	root: string,
	session: string,
	taskId: string,
	state: string,
	owner: string,
): string {
	const sessionDir = join(root, ".afol", "wb", session);
	mkdirSync(sessionDir, { recursive: true });
	const taskPath = join(sessionDir, `${session}_task_1.md`);
	writeFileSync(
		taskPath,
		[
			"# Workbench task",
			"",
			"## State Board",
			"| Task | State | Owner | Notes |",
			"| --- | --- | --- | --- |",
			`| ${taskId} | ${state} | ${owner} | preserved metadata |`,
			"",
			`## ${taskId}`,
			"",
			"- Files planned:",
			"  - cli/example.ts",
			"- Files touched:",
			"  - cli/example.test.ts",
			"",
		].join("\n"),
		"utf8",
	);
	return taskPath;
}

function writeArchiveEvent(root: string, session: string): void {
	writeFileSync(
		join(root, ".afol", "data", "events", "events.jsonl"),
		`${JSON.stringify({
			id: "archive-alpha",
			type: "workbench.archive",
			session,
			ts: "2026-09-01T00:00:00.000Z",
			source: "cli-workbench",
		})}\n`,
		"utf8",
	);
}

function buildFreshFixture(): { root: string; eventLog: string } {
	const root = createRoot();
	writeSession(root, ALPHA, "T-01", "done", "alice");
	writeSession(root, BETA, "T-02", "problem", "bob");
	writeArchiveEvent(root, ALPHA);
	symlinkSync(
		join(root, ".afol", "wb", ALPHA),
		join(root, ".afol", "wb", "symlink-session"),
		"dir",
	);
	rebuildWorkBenchIndex(root);
	return {
		root,
		eventLog: join(root, ".afol", "data", "events", "events.jsonl"),
	};
}

function comparableReport(report: ReturnType<typeof collectFreshnessReport>) {
	return {
		ok: report.ok,
		checks: report.checks,
		findings: report.findings,
	};
}

describe("freshness validation", () => {
	test("keeps ordered report parity and workbench metadata", () => {
		const { root } = buildFreshFixture();
		try {
			const canonical = collectFreshnessReport(root, {
				localState: true,
				pstr: false,
			});
			const project = collectFreshnessReportFast(root, {
				localState: true,
				pstr: false,
				eventLedger: inspectEventLedger(root),
			});

			expect(comparableReport(project)).toEqual(comparableReport(canonical));
			expect(canonical.checks.map((check) => check.id)).toEqual([
				"local-state:rules",
				"local-state:skills",
				"local-state:specs",
				"local-state:files",
				"local-state:workbench",
			]);
			expect(canonical.checks.at(-1)).toMatchObject({
				id: "local-state:workbench",
				state: "current",
				ok: true,
			});

			const snapshot = loadWorkBenchIndexSnapshot(root);
			expect(snapshot?.sessions.map((session) => session.session)).toEqual([
				ALPHA,
				BETA,
			]);
			expect(snapshot?.sessions[0]).toMatchObject({
				session: ALPHA,
				archived: true,
				archived_at: "2026-09-01T00:00:00.000Z",
			});
			expect(snapshot?.tasks[0]).toMatchObject({
				session: ALPHA,
				task_id: "T-01",
				planned_files: [
					{
						path: "cli/example.ts",
						kind: "exact",
						source: "planned",
					},
				],
				touched_files: [
					{
						path: "cli/example.test.ts",
						kind: "exact",
						source: "touched",
					},
				],
			});
			expect(
				snapshot?.sessions.some((session) =>
					session.session.includes("symlink"),
				),
			).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("preserves missing, invalid, and stale classifications", () => {
		const root = createRoot();
		try {
			const missing = collectFreshnessReport(root, {
				localState: true,
				pstr: false,
			});
			expect(missing.checks.at(-1)).toMatchObject({
				id: "local-state:workbench",
				state: "missing",
				ok: false,
				message: expect.stringContaining("missing workbench index snapshot"),
			});

			writeFileSync(
				join(root, ".afol", "data", "index", "workbench.json"),
				JSON.stringify({
					kind: "workbench_index_v1",
					version: 1,
					generated_at: "not-a-date",
					source: {
						wb_dir: ".afol/wb",
						event_log: ".afol/data/events/events.jsonl",
					},
					sessions: [],
					tasks: [],
				}),
				"utf8",
			);
			const invalid = collectFreshnessReport(root, {
				localState: true,
				pstr: false,
			});
			expect(invalid.checks.at(-1)).toMatchObject({
				id: "local-state:workbench",
				state: "invalid",
				ok: false,
				message: expect.stringContaining("invalid workbench index snapshot"),
			});

			writeSession(root, ALPHA, "T-01", "done", "alice");
			writeArchiveEvent(root, ALPHA);
			rebuildWorkBenchIndex(root);
			writeSession(root, BETA, "T-02", "open", "bob");
			const stale = collectFreshnessReport(root, {
				localState: true,
				pstr: false,
			});
			expect(stale.checks.at(-1)).toMatchObject({
				id: "local-state:workbench",
				state: "stale",
				ok: false,
				message: expect.stringContaining("stale workbench index snapshot"),
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("validates multiple sessions with one event-ledger read", () => {
		const { root, eventLog } = buildFreshFixture();
		const openSpy = spyOn(nodeFs, "openSync");
		try {
			const report = collectFreshnessReport(root, {
				localState: true,
				pstr: false,
			});
			const ledgerReads = openSpy.mock.calls.filter(
				([path]) => resolve(String(path)) === resolve(eventLog),
			).length;
			expect(ledgerReads).toBe(1);
			expect(validateWorkBenchIndex(root)).toEqual({
				ok: true,
				message: expect.stringContaining("ok workbench index snapshot"),
			});
			expect(report.checks.at(-1)?.ok).toBe(true);
		} finally {
			openSpy.mockRestore();
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("full live snapshot remains deterministic when queried directly", () => {
		const { root } = buildFreshFixture();
		try {
			const first = collectWorkBenchSnapshot(root);
			const second = collectWorkBenchSnapshot(root);
			expect(second.sessions).toEqual(first.sessions);
			expect(second.tasks).toEqual(first.tasks);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
