import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { runPstrCommand } from "../commands/pstr";
import { agentOperationContext } from "../core/operation-context";
import { rebuildWorkBenchIndex } from "../services/local-state/workbench-index";
import {
	buildPstrDiff,
	checkPstrStale,
	getPstrAffectedAreas,
	PSTR_AREAS,
	rebuildPstrIndex,
	resolvePstrAreas,
} from "../services/pstr/builder";
import { getPstrWatchTargets } from "../services/pstr/watch";
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
import { symlinkTestSupport } from "./symlink-test-support";

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

function expectEnvelope(
	payload: Record<string, unknown>,
	action: string,
): void {
	expect(payload.schema).toBe("afol.result/v1");
	expect(payload.action).toBe(action);
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForOutput(
	stdout: string[],
	timeoutMs = 1500,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (stdout.length === 0 && Date.now() < deadline) {
		await delay(20);
	}
	expect(stdout.length).toBeGreaterThan(0);
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
	rebuildWorkBenchIndex(root);
	openDb(root).close();
	writeMemoryFile(root, now);
	initGitRepo(root);
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

	test("rebuild --json returns compact summary", async () => {
		const root = createFixture();
		try {
			const io = captureIo();
			expect(await runPstrCommand("rebuild", ["--json"], root, io.io)).toBe(0);
			const output = io.stdout[0] ?? "{}";
			expect(output.length).toBeLessThan(2000);
			const payload = JSON.parse(output) as Record<string, unknown>;
			expectEnvelope(payload, "pstr.rebuild");
			expect(payload.ok).toBe(true);
			expect(payload.exit_code).toBe(0);
			expect(payload.snapshot).toBeUndefined();
			expect(payload.output).toBe("compact");
			expect(payload.hint).toContain("--verbose");
			expect((payload.summary as { kind: string }).kind).toBe("pstr_index_v1");
			const data = payload.data as {
				output: string;
				summary: { kind: string; maps: { count: number } };
				snapshot?: unknown;
			};
			expect(data.output).toBe("compact");
			expect(data.summary.kind).toBe("pstr_index_v1");
			expect(data.summary.maps.count).toBeGreaterThan(0);
			expect(data.snapshot).toBeUndefined();
		} finally {
			cleanup(root);
		}
	});

	test("rebuild --json --verbose returns snapshot", async () => {
		const root = createFixture();
		try {
			const io = captureIo();
			expect(
				await runPstrCommand("rebuild", ["--json", "--verbose"], root, io.io),
			).toBe(0);
			const payload = JSON.parse(io.stdout[0] ?? "{}") as Record<
				string,
				unknown
			>;
			expectEnvelope(payload, "pstr.rebuild");
			expect(payload.ok).toBe(true);
			expect(payload.exit_code).toBe(0);
			expect(payload.output).toBe("verbose");
			expect((payload.snapshot as { kind: string }).kind).toBe("pstr_index_v1");
			expect(
				(payload.data as { snapshot: { kind: string } }).snapshot.kind,
			).toBe("pstr_index_v1");
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

	test("detect --json returns discovered areas", async () => {
		const root = createFixture();
		try {
			const io = captureIo();
			expect(await runPstrCommand("detect", ["--json"], root, io.io)).toBe(0);
			const payload = JSON.parse(io.stdout[0] ?? "{}") as Record<
				string,
				unknown
			>;
			expectEnvelope(payload, "pstr.detect");
			expect(payload.ok).toBe(true);
			expect(Array.isArray(payload.areas)).toBe(true);
			expect(
				(payload.areas as Array<{ id: string }>).some(
					(area) => area.id === "cli",
				),
			).toBe(true);
		} finally {
			cleanup(root);
		}
	});

	test("suggest reports current or rebuild guidance", async () => {
		const root = createFixture();
		try {
			const io = captureIo();
			expect(await runPstrCommand("suggest", ["--json"], root, io.io)).toBe(0);
			const payload = JSON.parse(io.stdout[0] ?? "{}") as Record<
				string,
				unknown
			>;
			expectEnvelope(payload, "pstr.suggest");
			expect(payload.ok).toBe(true);
			expect(Array.isArray(payload.suggestions)).toBe(true);
			expect(
				(payload.suggestions as Array<{ id: string }>).some(
					(suggestion) => suggestion.id === "rebuild-all",
				),
			).toBe(true);
		} finally {
			cleanup(root);
		}
	});

	test("review-candidates can apply rebuild candidate", async () => {
		const root = createFixture();
		try {
			const reviewIo = captureIo();
			expect(
				await runPstrCommand(
					"review-candidates",
					["--json"],
					root,
					reviewIo.io,
				),
			).toBe(0);
			const reviewPayload = JSON.parse(reviewIo.stdout[0] ?? "{}") as Record<
				string,
				unknown
			>;
			expectEnvelope(reviewPayload, "pstr.review-candidates");
			expect(
				(reviewPayload.candidates as Array<{ id: string }>).some(
					(candidate) => candidate.id === "rebuild-all",
				),
			).toBe(true);

			const applyIo = captureIo();
			expect(
				await runPstrCommand(
					"review-candidates",
					["--apply", "rebuild-all", "--json"],
					root,
					applyIo.io,
				),
			).toBe(0);
			const applyPayload = JSON.parse(applyIo.stdout[0] ?? "{}") as Record<
				string,
				unknown
			>;
			expectEnvelope(applyPayload, "pstr.review-candidates");
			expect((applyPayload.applied as { id: string }).id).toBe("rebuild-all");
			expect(existsSync(join(root, ".afol", "pstr", "index.json"))).toBe(true);
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
			const payload = JSON.parse(io.stdout[0] ?? "{}") as Record<
				string,
				unknown
			>;
			expectEnvelope(payload, "pstr.show");
			expect(payload.ok).toBe(true);
			expect(payload.exit_code).toBe(0);
			expect((payload.snapshot as { kind: string }).kind).toBe("pstr_index_v1");
			expect(
				(payload.data as { snapshot: { kind: string } }).snapshot.kind,
			).toBe("pstr_index_v1");
		} finally {
			cleanup(root);
		}
	});

	test("diff --json returns diff payload", async () => {
		const root = createFixture();
		try {
			rebuildPstrIndex(root);
			writeFileSync(join(root, "docs", "readme.md"), "# Docs changed\n");
			const io = captureIo();
			expect(await runPstrCommand("diff", ["--json"], root, io.io)).toBe(0);
			const payload = JSON.parse(io.stdout[0] ?? "{}") as Record<
				string,
				unknown
			>;
			expectEnvelope(payload, "pstr.diff");
			expect(payload.ok).toBe(true);
			expect(payload.exit_code).toBe(0);
			expect(
				(payload.diff as { changed: Array<{ id: string }> }).changed.some(
					(entry) => entry.id === "docs",
				),
			).toBe(true);
			expect(
				Array.isArray(
					(payload.data as { diff: { changed: unknown[] } }).diff.changed,
				),
			).toBe(true);
		} finally {
			cleanup(root);
		}
	});

	test("diff --path limits affected-path reporting", async () => {
		const root = createFixture();
		try {
			rebuildPstrIndex(root);
			writeFileSync(join(root, "cli", "test.ts"), "export const x = 2;\n");
			const io = captureIo();
			expect(
				await runPstrCommand("diff", ["--path", "cli/test.ts"], root, io.io),
			).toBe(0);
			const output = io.stdout[0] ?? "";
			expect(output).toContain("pstr diff: changes detected");
			expect(output).toContain("changed=1");
			expect(output).toContain("cli/test.ts -> cli");
			expect(output).not.toContain("docs/readme.md");
		} finally {
			cleanup(root);
		}
	});

	test("watch --once --json rebuilds incrementally and returns snapshot", async () => {
		const root = createFixture();
		try {
			const initial = rebuildPstrIndex(root);
			const initialCli = initial.maps.find((entry) => entry.id === "cli");
			const initialDocs = initial.maps.find((entry) => entry.id === "docs");
			writeFileSync(join(root, "cli", "test.ts"), "export const x = 3;\n");
			const io = captureIo();
			expect(
				await runPstrCommand(
					"watch",
					["--once", "--json", "--path", "cli/test.ts"],
					root,
					io.io,
				),
			).toBe(0);
			const payload = JSON.parse(io.stdout[0] ?? "{}") as Record<
				string,
				unknown
			>;
			expectEnvelope(payload, "pstr.watch");
			expect(payload.ok).toBe(true);
			expect(payload.exit_code).toBe(0);
			expect(payload.event).toBe("once");
			expect(payload.rebuilt).toBe(true);
			expect(
				(
					payload.diff as {
						affected_paths: Array<{
							path: string;
							area_ids: string[];
							scopes: string[];
						}>;
					}
				).affected_paths,
			).toEqual([
				{
					path: "cli/test.ts",
					area_ids: ["cli"],
					scopes: ["cli"],
				},
			]);
			const snapshot = payload.snapshot as {
				kind: string;
				maps: Array<{ id: string; source_hash: string; updated_at: string }>;
			};
			expect(snapshot.kind).toBe("pstr_index_v1");
			expect(
				snapshot.maps.find((entry) => entry.id === "cli")?.source_hash,
			).not.toBe(initialCli?.source_hash);
			expect(
				snapshot.maps.find((entry) => entry.id === "docs")?.updated_at,
			).toBe(initialDocs?.updated_at);
		} finally {
			cleanup(root);
		}
	});

	test("watch --json observes live file changes and exits on SIGINT", async () => {
		const root = createFixture();
		let running: Promise<number> | null = null;
		try {
			rebuildPstrIndex(root);
			const io = captureIo();
			running = runPstrCommand(
				"watch",
				["--json", "--debounce-ms", "20", "--path", "cli"],
				root,
				io.io,
			);
			await delay(50);
			writeFileSync(join(root, "cli", "test.ts"), "export const x = 4;\n");
			await waitForOutput(io.stdout);
			process.emit("SIGINT");
			expect(await Promise.race([running, delay(1000).then(() => -1)])).toBe(0);
			const payload = JSON.parse(io.stdout.at(-1) ?? "{}") as Record<
				string,
				unknown
			>;
			expectEnvelope(payload, "pstr.watch");
			expect(payload.ok).toBe(true);
			expect(["change", "resync"]).toContain(payload.event as string);
			expect(payload.rebuilt).toBe(true);
		} finally {
			process.emit("SIGINT");
			if (running) {
				await Promise.race([running, delay(1000)]);
			}
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
			const payload = JSON.parse(io.stdout[0] ?? "{}") as Record<
				string,
				unknown
			>;
			expectEnvelope(payload, "pstr.section");
			expect(payload.ok).toBe(true);
			expect(payload.exit_code).toBe(0);
			expect((payload.entry as { id: string }).id).toBe("cli");
			expect(payload.content as string).toContain("# PSTR: cli");
			expect(
				(payload.data as { entry: { id: string }; content: string }).entry.id,
			).toBe("cli");
			expect(
				(payload.data as { entry: { id: string }; content: string }).content,
			).toContain("# PSTR: cli");
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

	test("stale returns 0 while governed sources remain unchanged before expiry", async () => {
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

	test("stale returns 1 when source changes before expiry", async () => {
		const root = createFixture();
		try {
			rebuildPstrIndex(root);
			writeFileSync(join(root, "cli", "test.ts"), "export const x = 2;\n");
			const io = captureIo();
			expect(await runPstrCommand("stale", [], root, io.io)).toBe(1);
			expect(io.stdout[0] ?? "").toContain("stale areas found");
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
			const payload = JSON.parse(io.stdout[0] ?? "{}") as Record<
				string,
				unknown
			>;
			expectEnvelope(payload, "pstr.validate");
			expect(payload.ok).toBe(true);
			expect(payload.exit_code).toBe(0);
			expect((payload.data as { ok: boolean }).ok).toBe(true);
		} finally {
			cleanup(root);
		}
	});

	test("stale --json returns areas when current", async () => {
		const root = createFixture();
		try {
			rebuildPstrIndex(root);
			const io = captureIo();
			expect(await runPstrCommand("stale", ["--json"], root, io.io)).toBe(0);
			const payload = JSON.parse(io.stdout[0] ?? "{}") as Record<
				string,
				unknown
			>;
			expectEnvelope(payload, "pstr.stale");
			expect(payload.ok).toBe(true);
			expect(payload.exit_code).toBe(0);
			expect(Array.isArray(payload.areas)).toBe(true);
			expect(Array.isArray((payload.data as { areas: unknown[] }).areas)).toBe(
				true,
			);
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
			const payload = JSON.parse(io.stdout[0] ?? "{}") as Record<
				string,
				unknown
			>;
			expectEnvelope(payload, "pstr.stale");
			expect(payload.ok).toBe(false);
			expect(payload.exit_code).toBe(1);
			expect((payload.error as { code: string; message: string }).code).toBe(
				"pstr.stale.failed",
			);
			expect(
				(payload.error as { code: string; message: string }).message,
			).toContain("stale");
		} finally {
			cleanup(root);
		}
	});

	test("invalid action --json returns error envelope", async () => {
		const root = createFixture();
		try {
			const io = captureIo();
			expect(await runPstrCommand("bogus", ["--json"], root, io.io)).toBe(2);
			const payload = JSON.parse(io.stdout[0] ?? "{}") as Record<
				string,
				unknown
			>;
			expectEnvelope(payload, "pstr.bogus");
			expect(payload.ok).toBe(false);
			expect(payload.exit_code).toBe(2);
			expect(
				(payload.error as { code: string; message: string }).message,
			).toContain("Unknown pstr action");
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

	test("watch rejects invalid debounce value", async () => {
		const root = createFixture();
		try {
			const io = captureIo();
			expect(
				await runPstrCommand("watch", ["--debounce-ms", "nope"], root, io.io),
			).toBe(2);
			expect(io.stderr[0] ?? "").toContain(
				"Invalid value for --debounce-ms: nope",
			);
		} finally {
			cleanup(root);
		}
	});

	test("watch --json rejects invalid debounce value with error envelope", async () => {
		const root = createFixture();
		try {
			const io = captureIo();
			expect(
				await runPstrCommand(
					"watch",
					["--json", "--debounce-ms", "nope"],
					root,
					io.io,
				),
			).toBe(2);
			expect(io.stderr).toHaveLength(0);
			const payload = JSON.parse(io.stdout[0] ?? "{}") as Record<
				string,
				unknown
			>;
			expectEnvelope(payload, "pstr.watch");
			expect(payload.ok).toBe(false);
			expect(payload.exit_code).toBe(2);
			expect(
				(payload.error as { code: string; message: string }).message,
			).toContain("Invalid value for --debounce-ms: nope");
		} finally {
			cleanup(root);
		}
	});

	test("restricted context denies pstr rebuild", async () => {
		const root = createFixture();
		try {
			const io = captureIo();
			expect(
				await runPstrCommand(
					"rebuild",
					[],
					root,
					io.io,
					agentOperationContext(),
				),
			).toBe(2);
			expect(io.stderr[0] ?? "").toContain(
				"requires local interactive approval",
			);
		} finally {
			cleanup(root);
		}
	});

	test("restricted context denies pstr review-candidates --apply", async () => {
		const root = createFixture();
		try {
			const io = captureIo();
			expect(
				await runPstrCommand(
					"review-candidates",
					["--apply", "rebuild-all"],
					root,
					io.io,
					agentOperationContext(),
				),
			).toBe(2);
			expect(io.stderr[0] ?? "").toContain(
				"requires local interactive approval",
			);
		} finally {
			cleanup(root);
		}
	});

	test("restricted context allows read-only pstr review-candidates", async () => {
		const root = createFixture();
		try {
			const io = captureIo();
			expect(
				await runPstrCommand(
					"review-candidates",
					["--json"],
					root,
					io.io,
					agentOperationContext(),
				),
			).toBe(0);
			const payload = JSON.parse(io.stdout[0] ?? "{}") as Record<
				string,
				unknown
			>;
			expectEnvelope(payload, "pstr.review-candidates");
			expect(Array.isArray(payload.candidates)).toBe(true);
		} finally {
			cleanup(root);
		}
	});

	test("detect without json prints human output", async () => {
		const root = createFixture();
		try {
			const io = captureIo();
			expect(await runPstrCommand("detect", [], root, io.io)).toBe(0);
			expect(io.stdout[0] ?? "").toContain("pstr detect:");
			expect(io.stdout[0] ?? "").toContain("areas");
		} finally {
			cleanup(root);
		}
	});

	test("suggest without json prints human output", async () => {
		const root = createFixture();
		try {
			const io = captureIo();
			expect(await runPstrCommand("suggest", [], root, io.io)).toBe(0);
			expect(io.stdout[0] ?? "").toContain("pstr suggest:");
		} finally {
			cleanup(root);
		}
	});
});

describe("pstr service helpers", () => {
	test("template config exposes additive PSTR areas while preserving defaults", () => {
		const templateConfig = JSON.parse(
			readFileSync(
				join(
					import.meta.dir,
					"..",
					"..",
					"src",
					"project-template",
					".afol",
					"config.json",
				),
				"utf8",
			),
		) as { pstr?: { areas?: unknown } };
		expect(templateConfig.pstr?.areas).toEqual([]);
	});

	test("resolves additive configured areas after the four defaults", () => {
		const root = createFixture();
		try {
			writeFileSync(
				join(root, ".agents", "config.json"),
				JSON.stringify({
					version: "0.1.0",
					pstr: {
						areas: [
							{
								id: "zeta",
								scope: "zeta.scope",
								source_roots: ["docs", "docs/", "./docs"],
								tags: ["custom", "custom"],
							},
							{
								id: "alpha",
								scope: "alpha",
								source_roots: ["cli"],
								tags: ["alpha"],
							},
						],
					},
				}),
			);
			expect(resolvePstrAreas(root).map((area) => area.id)).toEqual([
				"cli",
				"template",
				"docs",
				"config",
				"alpha",
				"zeta",
			]);
			expect(resolvePstrAreas(root).at(-1)?.source_roots).toEqual(["docs/"]);
		} finally {
			cleanup(root);
		}
	});

	test("rejects unsafe or colliding configured areas", () => {
		const root = createFixture();
		try {
			for (const area of [
				{ id: "cli", scope: "extra", source_roots: ["docs"], tags: ["test"] },
				{ id: "extra", scope: "cli", source_roots: ["docs"], tags: ["test"] },
				{
					id: "extra",
					scope: "extra",
					source_roots: ["../outside"],
					tags: ["test"],
				},
				{
					id: "bad/id",
					scope: "extra",
					source_roots: ["docs"],
					tags: ["test"],
				},
				{
					id: "extra",
					scope: "extra",
					source_roots: [".afol/pstr"],
					tags: ["test"],
				},
			]) {
				writeFileSync(
					join(root, ".agents", "config.json"),
					JSON.stringify({ pstr: { areas: [area] } }),
				);
				expect(() => resolvePstrAreas(root)).toThrow();
			}
		} finally {
			cleanup(root);
		}
	});

	test("only an absent pstr key uses defaults", () => {
		const root = createFixture();
		try {
			for (const value of [null, [], "invalid", 1, {}]) {
				writeFileSync(
					join(root, ".agents", "config.json"),
					JSON.stringify({ pstr: value }),
				);
				expect(() => resolvePstrAreas(root)).toThrow(/Invalid pstr/);
			}
			writeFileSync(
				join(root, ".agents", "config.json"),
				JSON.stringify({ version: "0.1.0" }),
			);
			expect(resolvePstrAreas(root).map((area) => area.id)).toEqual([
				"cli",
				"template",
				"docs",
				"config",
			]);
		} finally {
			cleanup(root);
		}
	});

	test("requires at least one safe tag for configured areas", () => {
		const root = createFixture();
		try {
			writeFileSync(
				join(root, ".agents", "config.json"),
				JSON.stringify({
					pstr: {
						areas: [
							{
								id: "custom",
								scope: "custom",
								source_roots: ["docs"],
								tags: [],
							},
						],
					},
				}),
			);
			expect(() => resolvePstrAreas(root)).toThrow(/tags/);
		} finally {
			cleanup(root);
		}
	});

	test("fails when the canonical project config contains invalid JSON", () => {
		const root = createFixture();
		try {
			writeFileSync(join(root, ".afol", "config.json"), "{invalid", "utf8");
			expect(() => resolvePstrAreas(root)).toThrow(/Invalid JSON/);
		} finally {
			cleanup(root);
		}
	});

	test("rejects .afol source roots case-insensitively", () => {
		const root = createFixture();
		try {
			writeFileSync(
				join(root, ".agents", "config.json"),
				JSON.stringify({
					pstr: {
						areas: [
							{
								id: "private",
								scope: "private",
								source_roots: [".AFOL/pstr"],
								tags: ["test"],
							},
						],
					},
				}),
			);
			expect(() => resolvePstrAreas(root)).toThrow(/source root/);
		} finally {
			cleanup(root);
		}
	});

	test("materializes configured areas alongside defaults", () => {
		const root = createFixture();
		try {
			mkdirSync(join(root, "os", "kernel"), { recursive: true });
			mkdirSync(join(root, "os", "userland"), { recursive: true });
			writeFileSync(join(root, "os", "kernel", "README.md"), "kernel\n");
			writeFileSync(join(root, "os", "userland", "README.md"), "userland\n");
			writeFileSync(
				join(root, ".agents", "config.json"),
				JSON.stringify({
					pstr: {
						areas: [
							{
								id: "kernel",
								scope: "os.kernel",
								source_roots: ["os/kernel"],
								tags: ["os"],
							},
							{
								id: "userland",
								scope: "os.userland",
								source_roots: ["os/userland"],
								tags: ["os"],
							},
						],
					},
				}),
			);
			const snapshot = rebuildPstrIndex(root);
			expect(snapshot.maps.map((entry) => entry.id)).toEqual([
				"cli",
				"template",
				"docs",
				"config",
				"kernel",
				"userland",
			]);
			expect(existsSync(join(root, ".afol", "pstr", "kernel.md"))).toBe(true);
			expect(existsSync(join(root, ".afol", "pstr", "userland.md"))).toBe(true);
		} finally {
			cleanup(root);
		}
	});

	test("config changes force a full rebuild of the PSTR registry", () => {
		const root = createFixture();
		try {
			rebuildPstrIndex(root);
			mkdirSync(join(root, "os", "kernel"), { recursive: true });
			writeFileSync(join(root, "os", "kernel", "README.md"), "kernel\n");
			writeFileSync(
				join(root, ".afol", "config.json"),
				JSON.stringify({
					pstr: {
						areas: [
							{
								id: "kernel",
								scope: "os.kernel",
								source_roots: ["os/kernel"],
								tags: ["os"],
							},
						],
					},
				}),
			);

			const snapshot = rebuildPstrIndex(root, {
				changedPaths: [".afol/config.json"],
			});

			expect(snapshot.maps.map((entry) => entry.id)).toContain("kernel");
			expect(existsSync(join(root, ".afol", "pstr", "kernel.md"))).toBe(true);
		} finally {
			cleanup(root);
		}
	});

	test("traverses configured directories whose names contain dots", () => {
		const root = createFixture();
		try {
			mkdirSync(join(root, "packages", "app.v2"), { recursive: true });
			writeFileSync(
				join(root, "packages", "app.v2", "index.ts"),
				"export {};\n",
			);
			writeFileSync(
				join(root, ".afol", "config.json"),
				JSON.stringify({
					pstr: {
						areas: [
							{
								id: "dotted-app",
								scope: "packages.app-v2",
								source_roots: ["packages/app.v2"],
								tags: ["packages"],
							},
						],
					},
				}),
			);

			const snapshot = rebuildPstrIndex(root);
			const dotted = snapshot.maps.find((entry) => entry.id === "dotted-app");
			expect(dotted?.file_count).toBe(1);
			expect(dotted?.source_paths).toEqual(["packages/app.v2/index.ts"]);
		} finally {
			cleanup(root);
		}
	});

	test("preserves explicit directory intent after a configured root is removed", () => {
		const root = createFixture();
		try {
			mkdirSync(join(root, "packages", "app"), { recursive: true });
			writeFileSync(join(root, "packages", "app", "index.ts"), "export {};\n");
			writeFileSync(
				join(root, ".afol", "config.json"),
				JSON.stringify({
					pstr: {
						areas: [
							{
								id: "removed-app",
								scope: "packages.removed-app",
								source_roots: ["packages/app/"],
								tags: ["packages"],
							},
						],
					},
				}),
			);
			rebuildPstrIndex(root);
			rmSync(join(root, "packages", "app"), { recursive: true });

			const snapshot = rebuildPstrIndex(root, {
				changedPaths: ["packages/app/index.ts"],
			});

			expect(snapshot.maps.some((entry) => entry.id === "removed-app")).toBe(
				false,
			);
			expect(existsSync(join(root, ".afol", "pstr", "removed-app.md"))).toBe(
				false,
			);
		} finally {
			cleanup(root);
		}
	});

	test.skipIf(!symlinkTestSupport.available)(
		"watch rejects configured roots whose symlink leaves the project",
		() => {
			const root = createFixture();
			const outside = mkdtempSync(join(tmpdir(), "pstr-outside-"));
			try {
				mkdirSync(join(outside, "secret"), { recursive: true });
				symlinkSync(join(outside, "secret"), join(root, "outside-link"));
				writeFileSync(
					join(root, ".agents", "config.json"),
					JSON.stringify({
						pstr: {
							areas: [
								{
									id: "outside",
									scope: "outside",
									source_roots: ["outside-link"],
									tags: ["test"],
								},
							],
						},
					}),
				);
				expect(() => resolvePstrAreas(root)).toThrow(/symlink|escapes/);
				expect(getPstrWatchTargets(root, ["outside-link"])).toEqual([]);
			} finally {
				cleanup(root);
				cleanup(outside);
			}
		},
	);

	test("registry and affected-area matching stay stable", () => {
		const root = createFixture();
		try {
			expect(PSTR_AREAS.map((area) => area.id)).toEqual([
				"cli",
				"template",
				"docs",
				"config",
			]);

			const affected = getPstrAffectedAreas(root, [
				".\\cli\\test.ts",
				"docs/readme.md",
				".agents/manifest.json",
				"README.md",
			]);
			expect(affected.find((entry) => entry.path === "cli/test.ts")).toEqual({
				path: "cli/test.ts",
				area_ids: ["cli"],
				scopes: ["cli"],
			});
			expect(affected.find((entry) => entry.path === "docs/readme.md")).toEqual(
				{
					path: "docs/readme.md",
					area_ids: ["docs"],
					scopes: ["docs"],
				},
			);
			expect(
				affected.find((entry) => entry.path === ".agents/manifest.json"),
			).toEqual({
				path: ".agents/manifest.json",
				area_ids: ["config"],
				scopes: ["config"],
			});
			expect(affected.find((entry) => entry.path === "README.md")).toEqual({
				path: "README.md",
				area_ids: [],
				scopes: [],
			});
		} finally {
			cleanup(root);
		}
	});

	test("incremental rebuild updates only affected areas and refreshes manifest", () => {
		const root = createFixture();
		try {
			const initial = rebuildPstrIndex(root);
			const initialCli = initial.maps.find((entry) => entry.id === "cli");
			const initialDocs = initial.maps.find((entry) => entry.id === "docs");

			writeFileSync(join(root, "cli", "test.ts"), "export const x = 2;\n");

			const next = rebuildPstrIndex(root, { changedPaths: ["cli/test.ts"] });
			const nextCli = next.maps.find((entry) => entry.id === "cli");
			const nextDocs = next.maps.find((entry) => entry.id === "docs");
			const manifest = next.manifest;

			expect(initialCli?.source_hash).not.toBe(nextCli?.source_hash);
			expect(nextDocs).toEqual(initialDocs);
			expect(manifest).toBeDefined();
			expect(manifest?.areas.cli?.source_hash).toBe(nextCli?.source_hash);
			expect(manifest?.areas.docs?.updated_at).toBe(initialDocs?.updated_at);
		} finally {
			cleanup(root);
		}
	});

	test("incremental rebuild removes dropped areas and stale markdown", () => {
		const root = createFixture();
		try {
			rebuildPstrIndex(root);
			rmSync(join(root, "docs", "readme.md"));

			const snapshot = rebuildPstrIndex(root, {
				changedPaths: ["docs/readme.md"],
			});

			expect(snapshot.maps.some((entry) => entry.id === "docs")).toBe(false);
			expect(existsSync(join(root, ".afol", "pstr", "docs.md"))).toBe(false);
		} finally {
			cleanup(root);
		}
	});

	test("stale check ignores registry areas with no live source files", () => {
		const root = createFixture(false);
		try {
			rmSync(join(root, "src", "project-template", "index.ts"));

			const snapshot = rebuildPstrIndex(root);
			const stale = checkPstrStale(root);

			expect(snapshot.maps.map((entry) => entry.id)).toEqual([
				"docs",
				"config",
			]);
			expect(stale.map((entry) => entry.id)).toEqual(["docs", "config"]);
			expect(stale.every((entry) => !entry.stale)).toBe(true);
		} finally {
			cleanup(root);
		}
	});

	test("watch targets recurse into existing subdirectories", () => {
		const root = createFixture();
		try {
			mkdirSync(join(root, "cli", "nested", "deep"), { recursive: true });
			const targets = getPstrWatchTargets(root, ["cli/test.ts"]).map((path) =>
				relative(root, path).replaceAll("\\", "/"),
			);
			expect(targets).toEqual(["cli", "cli/nested", "cli/nested/deep"]);
		} finally {
			cleanup(root);
		}
	});

	test("watch targets allow project paths whose names start with two dots", () => {
		const root = createFixture();
		try {
			mkdirSync(join(root, "..hidden_dir", "nested"), { recursive: true });
			const targets = getPstrWatchTargets(root, ["..hidden_dir/file.ts"]).map(
				(path) => relative(root, path).replaceAll("\\", "/"),
			);
			expect(targets).toEqual(["..hidden_dir", "..hidden_dir/nested"]);
		} finally {
			cleanup(root);
		}
	});

	test("buildPstrDiff reports added removed changed missing and affected paths", () => {
		const root = createFixture(false);
		try {
			rebuildPstrIndex(root);
			writeFileSync(join(root, "cli", "test.ts"), "export const x = 1;\n");
			writeFileSync(join(root, "docs", "readme.md"), "# Docs changed\n");
			rmSync(join(root, "src", "project-template", "index.ts"));
			rmSync(join(root, ".afol", "pstr", "config.md"));

			const diff = buildPstrDiff(root, {
				changedPaths: [
					"cli/test.ts",
					"docs/readme.md",
					"src/project-template/index.ts",
				],
			});

			expect(diff.added.map((entry) => entry.id)).toContain("cli");
			expect(diff.changed.map((entry) => entry.id)).toContain("docs");
			expect(diff.removed.map((entry) => entry.id)).toContain("template");
			expect(diff.missing.map((entry) => entry.id)).toContain("config");
			expect(
				diff.affected_paths.find((entry) => entry.path === "cli/test.ts"),
			).toEqual({
				path: "cli/test.ts",
				area_ids: ["cli"],
				scopes: ["cli"],
			});
		} finally {
			cleanup(root);
		}
	});

	test("buildPstrDiff reports stale and unchanged entries", () => {
		const root = createFixture();
		try {
			rebuildPstrIndex(root);
			mutatePstrIndex(root, (snapshot) => {
				const maps = snapshot.maps as Array<{
					id: string;
					stale_after: string;
				}>;
				const docs = maps.find((entry) => entry.id === "docs");
				if (docs) {
					docs.stale_after = "1970-01-01T00:00:00.000Z";
				}
			});

			const diff = buildPstrDiff(root);

			expect(diff.stale.map((entry) => entry.id)).toContain("docs");
			expect(diff.unchanged.map((entry) => entry.id)).toEqual(
				expect.arrayContaining(["cli", "template", "config"]),
			);
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
			rebuildWorkBenchIndex(root);
			writeMemoryFile(root, currentIso());
			initGitRepo(root);
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
			rebuildWorkBenchIndex(root);
			openDb(root).close();
			writeMemoryFile(root, isoDaysAgo(45));
			initGitRepo(root);
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
			rebuildWorkBenchIndex(root);
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
