import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPstrCommand } from "../commands/pstr";
import { rebuildPstrIndex } from "../services/pstr/builder";
import {
	detectShape,
	readShapePack,
	shapePackPathForRoot,
	suggestShape,
	writeShapePack,
} from "../services/schema/detector";
import { openDb } from "../services/state/db";
import {
	sweepDaily,
	sweepMonthly,
	sweepWeekly,
} from "../services/sweep/runner";

function createFixture(includeSource = true): string {
	const root = mkdtempSync(join(tmpdir(), "pss-test-"));
	mkdirSync(join(root, ".agents"), { recursive: true });
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	mkdirSync(join(root, ".afol", "pstr"), { recursive: true });
	mkdirSync(join(root, ".afol", "state"), { recursive: true });
	mkdirSync(join(root, ".afol", "memory"), { recursive: true });
	mkdirSync(join(root, "cli"), { recursive: true });
	mkdirSync(join(root, "docs"), { recursive: true });
	mkdirSync(join(root, "src", "project-template"), { recursive: true });
	writeFileSync(join(root, ".agents", "config.json"), '{"version":"0.1.0"}');
	writeFileSync(join(root, ".agents", "lock.json"), '{"version":"0.1.0"}');
	writeFileSync(join(root, ".agents", "manifest.json"), '{"commands":[]}');
	writeFileSync(join(root, "docs", "readme.md"), "# Docs\n");
	writeFileSync(
		join(root, "src", "project-template", "index.ts"),
		"export const template = true;\n",
	);
	if (includeSource) {
		writeFileSync(join(root, "cli", "test.ts"), "export const x = 1;\n");
	}
	return root;
}

function cleanup(root: string): void {
	rmSync(root, { recursive: true, force: true });
}

function captureIo(): {
	stdout: string[];
	stderr: string[];
	io: { stdout: (message: string) => void; stderr: (message: string) => void };
} {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		stdout,
		stderr,
		io: {
			stdout: (message: string) => stdout.push(message),
			stderr: (message: string) => stderr.push(message),
		},
	};
}

function currentIso(): string {
	return new Date().toISOString();
}

function isoDaysAgo(days: number): string {
	return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function writeMemoryFile(root: string, updatedAt: string): void {
	const path = join(root, ".afol", "memory", "memory.md");
	writeFileSync(
		path,
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
			"### M-1: Memory",
			"<!--",
			`created_at: ${updatedAt}`,
			`updated_at: ${updatedAt}`,
			"tags: ",
			"-->",
			"Body",
			"",
		].join("\n"),
	);
}

function prepareCurrentSweepRoot(): string {
	const root = createFixture();
	const now = currentIso();
	rebuildPstrIndex(root);
	openDb(root).close();
	writeMemoryFile(root, now);
	return root;
}

function writeActiveSession(
	root: string,
	sessionId: string,
	staleDays = 0,
): void {
	const sessionDir = join(root, ".afol", "wb", sessionId);
	mkdirSync(sessionDir, { recursive: true });
	const taskPath = join(sessionDir, "task.md");
	writeFileSync(
		taskPath,
		[
			"| Task | State | Owner | Notes |",
			"| ---- | ---- | ---- | ---- |",
			"| T-01 | open | bot | keep moving |",
			"",
		].join("\n"),
	);
	const mtime = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);
	utimesSync(taskPath, mtime, mtime);
	utimesSync(sessionDir, mtime, mtime);
	writeFileSync(join(root, ".afol", "wb", ".active_session"), sessionId);
}

function mutatePstrIndex(
	root: string,
	mutate: (snapshot: Record<string, unknown>) => void,
): void {
	const path = join(root, ".afol", "pstr", "index.json");
	const snapshot = JSON.parse(readFileSync(path, "utf8")) as Record<
		string,
		unknown
	>;
	mutate(snapshot);
	writeFileSync(path, `${JSON.stringify(snapshot)}\n`);
}

describe("pstr command", () => {
	test("rebuild returns 0 and writes index.json", async () => {
		const root = createFixture();
		try {
			const io = captureIo();
			expect(await runPstrCommand("rebuild", [], root, io.io)).toBe(0);
			expect(existsSync(join(root, ".afol", "pstr", "index.json"))).toBe(true);
		} finally {
			cleanup(root);
		}
	});

	test("rebuild --json returns snapshot", async () => {
		const root = createFixture();
		try {
			const io = captureIo();
			expect(await runPstrCommand("rebuild", ["--json"], root, io.io)).toBe(0);
			const payload = JSON.parse(io.stdout[0] ?? "{}") as {
				ok: boolean;
				snapshot: { kind: string; maps: unknown[] };
			};
			expect(payload.ok).toBe(true);
			expect(payload.snapshot.kind).toBe("pstr_index_v1");
			expect(payload.snapshot.maps.length).toBeGreaterThan(0);
		} finally {
			cleanup(root);
		}
	});

	test("show returns 0 when index exists", async () => {
		const root = createFixture();
		try {
			rebuildPstrIndex(root);
			const io = captureIo();
			expect(await runPstrCommand("show", [], root, io.io)).toBe(0);
			expect(io.stdout[0] ?? "").toContain("pstr show:");
		} finally {
			cleanup(root);
		}
	});

	test("show returns 1 when no index", async () => {
		const root = createFixture();
		try {
			const io = captureIo();
			expect(await runPstrCommand("show", [], root, io.io)).toBe(1);
			expect(io.stderr[0] ?? "").toContain("no index found");
		} finally {
			cleanup(root);
		}
	});

	test("show --json returns snapshot", async () => {
		const root = createFixture();
		try {
			rebuildPstrIndex(root);
			const io = captureIo();
			expect(await runPstrCommand("show", ["--json"], root, io.io)).toBe(0);
			const payload = JSON.parse(io.stdout[0] ?? "{}") as {
				ok: boolean;
				snapshot: { kind: string };
			};
			expect(payload.ok).toBe(true);
			expect(payload.snapshot.kind).toBe("pstr_index_v1");
		} finally {
			cleanup(root);
		}
	});

	test("section returns content after rebuild", async () => {
		const root = createFixture();
		try {
			rebuildPstrIndex(root);
			const io = captureIo();
			expect(await runPstrCommand("section", ["cli"], root, io.io)).toBe(0);
			expect(io.stdout[0] ?? "").toBe(
				readFileSync(join(root, ".afol", "pstr", "cli.md"), "utf8"),
			);
		} finally {
			cleanup(root);
		}
	});

	test("sec --json returns entry and content", async () => {
		const root = createFixture();
		try {
			rebuildPstrIndex(root);
			const io = captureIo();
			expect(await runPstrCommand("sec", ["cli", "--json"], root, io.io)).toBe(
				0,
			);
			const payload = JSON.parse(io.stdout[0] ?? "{}") as {
				ok: boolean;
				action: string;
				entry: { id: string };
				content: string;
			};
			expect(payload.ok).toBe(true);
			expect(payload.action).toBe("section");
			expect(payload.entry.id).toBe("cli");
			expect(payload.content).toContain("# PSTR: cli");
		} finally {
			cleanup(root);
		}
	});

	test("section returns 1 when missing", async () => {
		const root = createFixture();
		try {
			rebuildPstrIndex(root);
			const io = captureIo();
			expect(await runPstrCommand("section", ["missing"], root, io.io)).toBe(1);
			expect(io.stderr[0] ?? "").toContain("not found");
		} finally {
			cleanup(root);
		}
	});

	test("section returns 2 without id", async () => {
		const root = createFixture();
		try {
			rebuildPstrIndex(root);
			const io = captureIo();
			expect(await runPstrCommand("section", [], root, io.io)).toBe(2);
			expect(io.stderr[0] ?? "").toContain(
				"Usage: afol pstr section <id> [--json]",
			);
		} finally {
			cleanup(root);
		}
	});

	test("validate returns 0 when valid", async () => {
		const root = createFixture();
		try {
			rebuildPstrIndex(root);
			const io = captureIo();
			expect(await runPstrCommand("validate", [], root, io.io)).toBe(0);
			expect(io.stdout[0] ?? "").toContain("ok");
		} finally {
			cleanup(root);
		}
	});

	test("validate returns 1 when stale", async () => {
		const root = createFixture();
		try {
			rebuildPstrIndex(root);
			mutatePstrIndex(root, (snapshot) => {
				const source = snapshot.source as { project_root: string };
				source.project_root = "/tmp/stale";
			});
			const io = captureIo();
			expect(await runPstrCommand("validate", [], root, io.io)).toBe(1);
			expect(io.stdout[0] ?? "").toContain("stale");
		} finally {
			cleanup(root);
		}
	});

	test("stale returns 0 when all current", async () => {
		const root = createFixture();
		try {
			rebuildPstrIndex(root);
			const io = captureIo();
			expect(await runPstrCommand("stale", [], root, io.io)).toBe(0);
			expect(io.stdout[0] ?? "").toContain("all current");
		} finally {
			cleanup(root);
		}
	});

	test("stale returns 1 when stale", async () => {
		const root = createFixture();
		try {
			rebuildPstrIndex(root);
			mutatePstrIndex(root, (snapshot) => {
				const maps = snapshot.maps as Array<{ stale_after: string }>;
				if (maps[0]) {
					maps[0].stale_after = "1970-01-01T00:00:00.000Z";
				}
			});
			const io = captureIo();
			expect(await runPstrCommand("stale", [], root, io.io)).toBe(1);
			expect(io.stdout[0] ?? "").toContain("stale areas found");
		} finally {
			cleanup(root);
		}
	});

	test("invalid action returns error code 2", async () => {
		const root = createFixture();
		try {
			const io = captureIo();
			expect(await runPstrCommand("bogus", [], root, io.io)).toBe(2);
			expect(io.stderr[0] ?? "").toContain("Unknown pstr action");
		} finally {
			cleanup(root);
		}
	});

	test("rebuild without json prints human output", async () => {
		const root = createFixture();
		try {
			const io = captureIo();
			expect(await runPstrCommand("rebuild", [], root, io.io)).toBe(0);
			expect(io.stdout[0] ?? "").toContain("pstr rebuild: ok");
		} finally {
			cleanup(root);
		}
	});

	test("validate --json returns validation payload", async () => {
		const root = createFixture();
		try {
			rebuildPstrIndex(root);
			const io = captureIo();
			expect(await runPstrCommand("validate", ["--json"], root, io.io)).toBe(0);
			const payload = JSON.parse(io.stdout[0] ?? "{}");
			expect(payload.action).toBe("validate");
			expect(payload.ok).toBe(true);
		} finally {
			cleanup(root);
		}
	});

	test("stale --json returns stale areas", async () => {
		const root = createFixture();
		try {
			rebuildPstrIndex(root);
			mutatePstrIndex(root, (snapshot) => {
				const maps = snapshot.maps as Array<{ stale_after: string }>;
				if (maps[0]) {
					maps[0].stale_after = "1970-01-01T00:00:00.000Z";
				}
			});
			const io = captureIo();
			expect(await runPstrCommand("stale", ["--json"], root, io.io)).toBe(1);
			const payload = JSON.parse(io.stdout[0] ?? "{}");
			expect(payload.action).toBe("stale");
			expect(payload.ok).toBe(false);
		} finally {
			cleanup(root);
		}
	});

	test("pstr command rejects invalid argument", async () => {
		const root = createFixture();
		try {
			const io = captureIo();
			expect(await runPstrCommand("show", ["--bogus"], root, io.io)).toBe(2);
			expect(io.stderr[0] ?? "").toContain("Unknown pstr argument: --bogus");
		} finally {
			cleanup(root);
		}
	});
});

describe("schema detector", () => {
	test("detectShape returns shape with page types", () => {
		const root = createFixture();
		try {
			const shape = detectShape(root);
			expect(shape.page_types.length).toBeGreaterThan(0);
		} finally {
			cleanup(root);
		}
	});

	test("detectShape detects pstr type when .afol/pstr exists", () => {
		const root = createFixture();
		try {
			const shape = detectShape(root);
			expect(
				shape.page_types.some((pageType) => pageType.name === "pstr"),
			).toBe(true);
		} finally {
			cleanup(root);
		}
	});

	test("detectShape detects wb type when .afol/wb exists", () => {
		const root = createFixture();
		try {
			const shape = detectShape(root);
			expect(shape.page_types.some((pageType) => pageType.name === "wb")).toBe(
				true,
			);
		} finally {
			cleanup(root);
		}
	});

	test("readShapePack returns null when no yaml", () => {
		const root = createFixture();
		try {
			expect(readShapePack(root)).toBeNull();
		} finally {
			cleanup(root);
		}
	});

	test("readShapePack returns pack when yaml exists", () => {
		const root = createFixture();
		try {
			const pack = detectShape(root);
			writeShapePack(root, pack);
			expect(readShapePack(root)).toEqual(pack);
		} finally {
			cleanup(root);
		}
	});

	test("writeShapePack writes yaml file", () => {
		const root = createFixture();
		try {
			const pack = detectShape(root);
			writeShapePack(root, pack);
			expect(existsSync(shapePackPathForRoot(root))).toBe(true);
		} finally {
			cleanup(root);
		}
	});

	test("suggestShape returns suggestions array", () => {
		const root = createFixture();
		try {
			const suggestions = suggestShape(root);
			expect(Array.isArray(suggestions)).toBe(true);
			expect(suggestions.length).toBeGreaterThan(0);
		} finally {
			cleanup(root);
		}
	});
});

describe("sweep runner", () => {
	test("sweepDaily returns checked/issues counts", () => {
		const root = createFixture();
		try {
			const report = sweepDaily(root);
			expect(report.checked).toBeGreaterThan(0);
			expect(report.issues).toBeGreaterThanOrEqual(0);
		} finally {
			cleanup(root);
		}
	});

	test("sweepDaily detects stale PSTR", () => {
		const root = prepareCurrentSweepRoot();
		try {
			mutatePstrIndex(root, (snapshot) => {
				const maps = snapshot.maps as Array<{ stale_after: string }>;
				if (maps[0]) {
					maps[0].stale_after = "1970-01-01T00:00:00.000Z";
				}
			});
			const report = sweepDaily(root);
			expect(report.actions).toContain("rebuild pstr");
			expect(report.issues).toBe(1);
		} finally {
			cleanup(root);
		}
	});

	test("sweepDaily detects missing state db", () => {
		const root = createFixture();
		try {
			rebuildPstrIndex(root);
			writeMemoryFile(root, currentIso());
			const report = sweepDaily(root);
			expect(report.actions).toContain("initialize state database");
			expect(report.issues).toBe(1);
		} finally {
			cleanup(root);
		}
	});

	test("sweepDaily detects stale memory", () => {
		const root = createFixture();
		try {
			rebuildPstrIndex(root);
			openDb(root).close();
			writeMemoryFile(root, isoDaysAgo(45));
			const report = sweepDaily(root);
			expect(report.actions).toContain("refresh project memory");
			expect(report.issues).toBe(1);
		} finally {
			cleanup(root);
		}
	});

	test("sweepWeekly includes daily checks + more", () => {
		const root = createFixture();
		try {
			rebuildPstrIndex(root);
			openDb(root).close();
			writeMemoryFile(root, currentIso());
			writeActiveSession(root, "000001_0001_demo");
			const daily = sweepDaily(root);
			const weekly = sweepWeekly(root);
			expect(weekly.checked).toBeGreaterThan(daily.checked);
			expect(weekly.issues).toBeGreaterThanOrEqual(daily.issues);
			expect(weekly.issues).toBeGreaterThan(0);
		} finally {
			cleanup(root);
		}
	});

	test("sweepMonthly includes weekly checks + more", () => {
		const root = createFixture();
		try {
			rebuildPstrIndex(root);
			openDb(root).close();
			writeMemoryFile(root, currentIso());
			writeActiveSession(root, "000001_0001_demo");
			const weekly = sweepWeekly(root);
			const archiveDir = join(root, ".afol", "wb", "000002_0002_archive");
			mkdirSync(archiveDir, { recursive: true });
			const old = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
			utimesSync(archiveDir, old, old);
			const monthly = sweepMonthly(root);
			expect(monthly.checked).toBeGreaterThan(weekly.checked);
			expect(monthly.issues).toBeGreaterThanOrEqual(weekly.issues);
			expect(monthly.actions).toContain("archive closed workbench sessions");
			expect(statSync(archiveDir).isDirectory()).toBe(true);
		} finally {
			cleanup(root);
		}
	});

	test("sweep handles empty project gracefully", () => {
		const root = createFixture(false);
		try {
			const report = sweepDaily(root);
			expect(report.checked).toBeGreaterThan(0);
			expect(report.issues).toBeGreaterThanOrEqual(0);
		} finally {
			cleanup(root);
		}
	});
});
