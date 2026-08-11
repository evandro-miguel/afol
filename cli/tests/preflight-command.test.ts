import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPreflightCommand } from "../commands/preflight";
import { runPreflight } from "../services/preflight/search";

function createRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "preflight-command-"));
	mkdirSync(join(root, ".agents"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "rules"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "specs"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "ux"), { recursive: true });
	mkdirSync(join(root, "docs", "lessons", "entries"), { recursive: true });
	mkdirSync(join(root, "cli", "services"), { recursive: true });
	writeFileSync(
		join(root, ".agents", "config.json"),
		`${JSON.stringify({ schema_version: 1, project: { name: "preflight-test" } }, null, 2)}\n`,
		"utf8",
	);
	writeFileSync(
		join(root, ".agents", "lock.json"),
		`${JSON.stringify({ schema_version: 1 }, null, 2)}\n`,
		"utf8",
	);
	writeFileSync(
		join(
			root,
			".afol",
			"adm",
			"specs",
			"260418_test-session-isolation_spec_01.md",
		),
		[
			"---",
			"id: 260418_test-session-isolation_spec_01",
			"theme: session-isolation",
			"status: active",
			"---",
			"",
			"# Session isolation spec",
			"",
			"Search session isolation behavior.",
			"",
		].join("\n"),
		"utf8",
	);
	writeFileSync(
		join(
			root,
			"docs",
			"lessons",
			"entries",
			"20260614_1200_session-isolation-lesson.md",
		),
		[
			"---",
			"doc_type: lesson_entry",
			"id: 20260614_1200_session-isolation-lesson",
			"status: active",
			"---",
			"",
			"# Session isolation lesson",
			"",
			"Keep session isolation checks explicit.",
			"",
		].join("\n"),
		"utf8",
	);
	writeFileSync(
		join(root, ".afol", "adm", "rules", "RULE-123-session-isolation.md"),
		"# Session Isolation Rule\n\nPrefer session isolation over shared state.\n",
		"utf8",
	);
	writeFileSync(
		join(
			root,
			".afol",
			"adm",
			"ux",
			"260701_session-isolation-preflight_ux-journey_01.md",
		),
		[
			"---",
			"doc_type: ux-journey",
			"id: 260701_session-isolation-preflight_ux-journey_01",
			"theme: session-isolation",
			"status: active",
			"roadmap_feature: F-TEST",
			"parent_spec: 260418_test-session-isolation_spec_01",
			"---",
			"",
			"# Session isolation preflight journey",
			"",
			"## Purpose",
			"",
			"Check session isolation before implementation.",
			"",
			"## Entry And Exit",
			"",
			"Entry: `afol preflight session isolation`. Exit: relevant governance is visible.",
			"",
			"## Flow",
			"",
			"Run `afol preflight` for session isolation.",
			"",
			"## Expected Result",
			"",
			"Matching UX journey is listed.",
			"",
			"## Evidence",
			"",
			"Preflight command output.",
			"",
			"## Metrics",
			"",
			"One matching journey.",
			"",
			"## Acceptance",
			"",
			"- [ ] Journey appears in preflight.",
			"",
		].join("\n"),
		"utf8",
	);
	writeFileSync(
		join(root, "cli", "services", "session-isolation-marker.ts"),
		"export const SESSION_ISOLATION_MARKER = true;\n",
		"utf8",
	);
	return root;
}

function capture() {
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

describe("preflight search service", () => {
	test("finds a spec by theme keyword", () => {
		const root = createRoot();
		try {
			const report = runPreflight(root, "session isolation");
			expect(report.specs[0]?.theme).toBe("session-isolation");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("finds a lesson file matching the query", () => {
		const root = createRoot();
		try {
			const report = runPreflight(root, "session isolation");
			expect(report.lessons[0]?.path).toContain("docs/lessons/entries/");
			expect(report.lessons[0]?.title).toContain("Session isolation lesson");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("finds similar code via rg", () => {
		const root = createRoot();
		try {
			const report = runPreflight(root, "session isolation");
			expect(
				report.similar_systems.some((entry) => entry.kind === "code"),
			).toBe(true);
			expect(
				report.similar_systems.some((entry) =>
					entry.path.includes("session-isolation-marker.ts"),
				),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("finds a matching rule", () => {
		const root = createRoot();
		try {
			const report = runPreflight(root, "session isolation");
			expect(report.rules[0]?.path).toBe(
				".afol/adm/rules/RULE-123-session-isolation.md",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("finds a matching UX journey", () => {
		const root = createRoot();
		try {
			const report = runPreflight(root, "session isolation");
			expect(report.ux_journeys[0]?.id).toBe(
				"260701_session-isolation-preflight_ux-journey_01",
			);
			expect(report.ux_journeys[0]?.commands).toContain("afol preflight");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("ranks UX journeys by score with a stable id tie-breaker", () => {
		const root = createRoot();
		try {
			for (const id of [
				"rankingproof-high_ux-journey_01",
				"ranking-alpha_ux-journey_01",
				"ranking-beta_ux-journey_01",
			]) {
				writeFileSync(
					join(root, ".afol", "adm", "ux", `${id}.md`),
					[
						"---",
						"doc_type: ux-journey",
						`id: ${id}`,
						"theme: rankingproof",
						"status: active",
						"roadmap_feature: F-TEST",
						"parent_spec: 260418_test-session-isolation_spec_01",
						"---",
						"",
						"# Rankingproof Journey",
						"",
					].join("\n"),
					"utf8",
				);
			}

			const runs = Array.from({ length: 3 }, () =>
				runPreflight(root, "rankingproof").ux_journeys.map((entry) => entry.id),
			);
			const expected = [
				"rankingproof-high_ux-journey_01",
				"ranking-alpha_ux-journey_01",
				"ranking-beta_ux-journey_01",
			];
			expect(runs).toEqual([expected, expected, expected]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("reports gaps when nothing matches", () => {
		const root = createRoot();
		try {
			const report = runPreflight(root, "unrelated query");
			expect(report.gaps).toContain("no governing spec found");
			expect(report.gaps).toContain("no prior lessons found");
			expect(report.gaps).toContain("no similar system detected");
			expect(report.gaps).toContain("no applicable rules found");
			expect(report.gaps).toContain("no relevant UX journey found");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("recurrence_detected is true when lessons match", () => {
		const root = createRoot();
		try {
			const report = runPreflight(root, "session isolation");
			expect(report.recurrence_detected).toBe(true);
			expect(report.recommendations.join("\n")).toContain(
				"run heavier verification",
			);
			expect(report.recommendations.join("\n")).toContain(
				"propose a rule or lesson",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("recurrence_detected is false when no lessons match", () => {
		const root = createRoot();
		try {
			const report = runPreflight(root, "unrelated query");
			expect(report.recurrence_detected).toBe(false);
			expect(report.recommendations).toEqual([
				"no recurrence detected: treat as a one-off fix unless new evidence emerges",
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("afol preflight command", () => {
	test("text output contains summary and recurrence_detected", async () => {
		const root = createRoot();
		const out = capture();
		try {
			const code = await runPreflightCommand(["session", "isolation"], root, {
				stdout: (message) => out.stdout.push(message),
				stderr: (message) => out.stderr.push(message),
			});
			expect(code).toBe(0);
			const output = out.stdout.join("\n");
			expect(output).toContain("summary:");
			expect(output).toContain("recurrence_detected: true");
			expect(output).toContain("ux journeys");
			expect(output).toContain(
				"260701_session-isolation-preflight_ux-journey_01",
			);
			expect(output).toContain("recommendations");
			expect(output).toContain("run heavier verification");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("--json emits an afol.result envelope and does not mutate governance", async () => {
		const root = createRoot();
		const out = capture();
		try {
			const lessonCount = readdirSync(
				join(root, "docs", "lessons", "entries"),
			).length;
			const ruleCount = readdirSync(join(root, ".afol", "adm", "rules")).length;
			const code = await runPreflightCommand(
				["session", "isolation", "--json"],
				root,
				{
					stdout: (message) => out.stdout.push(message),
					stderr: (message) => out.stderr.push(message),
				},
			);
			expect(code).toBe(0);
			const payload = JSON.parse(out.stdout.join("\n")) as Record<
				string,
				unknown
			>;
			const data = payload.data as
				| {
						query?: string;
						recurrence_detected?: boolean;
						recommendations?: string[];
						ux_journeys?: Array<{ id?: string; commands?: string[] }>;
				  }
				| undefined;
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.action).toBe("preflight");
			expect(data?.query).toBe("session isolation");
			expect(data?.recurrence_detected).toBe(true);
			expect(data?.recommendations?.join("\n")).toContain(
				"propose a rule or lesson",
			);
			expect(data?.ux_journeys?.[0]?.id).toBe(
				"260701_session-isolation-preflight_ux-journey_01",
			);
			expect(data?.ux_journeys?.[0]?.commands).toContain("afol preflight");
			expect(readdirSync(join(root, "docs", "lessons", "entries")).length).toBe(
				lessonCount,
			);
			expect(readdirSync(join(root, ".afol", "adm", "rules")).length).toBe(
				ruleCount,
			);
			expect(
				existsSync(
					join(
						root,
						"docs",
						"lessons",
						"entries",
						"20260614_1200_session-isolation-lesson.md",
					),
				),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("empty query exits 2", async () => {
		const root = createRoot();
		const out = capture();
		try {
			const code = await runPreflightCommand([], root, {
				stdout: (message) => out.stdout.push(message),
				stderr: (message) => out.stderr.push(message),
			});
			expect(code).toBe(2);
			expect(out.stderr.join("\n")).toContain("pass an intent query");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
