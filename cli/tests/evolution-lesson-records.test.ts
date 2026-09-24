import { describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runEvolveCommand } from "../commands/evolve";
import { buildContextBundle } from "../services/context/bundler";
import { rebuildSectionIndex } from "../services/context/section-index";
import {
	ingestLessonStatements,
	lessonJournalPath,
	readLessonRecords,
	recordLessonApplication,
	selectContextLessons,
} from "../services/evolution/lesson-records";

const PROJECT_ID = "6b7d91ca-496f-4f0c-8537-5c4993810d15";

type EvidenceInput = {
	id: string;
	taskId?: string;
	provenance?: string;
	result?: string;
	exitCode?: number;
	test?: string;
	errorCode?: string;
	path?: string;
	operation?: string;
	createdAt?: string;
};

function evidenceRow(input: EvidenceInput): Record<string, unknown> {
	return {
		id: input.id,
		task_id: input.taskId ?? "T-01",
		result: input.result ?? "passed",
		provenance: input.provenance ?? "observed",
		command: "bun test cli/tests/evolution-lesson-records.test.ts",
		exit_code: input.exitCode ?? 0,
		created_at: input.createdAt ?? "2026-08-11T12:00:00.000Z",
		...(input.test ? { test: input.test } : {}),
		...(input.errorCode ? { error_code: input.errorCode } : {}),
		...(input.path ? { path: input.path } : {}),
		...(input.operation ? { operation: input.operation } : {}),
	};
}

function fixture(withIndex = false): string {
	const root = mkdtempSync(join(tmpdir(), "evolve-lessons-"));
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "specs"), { recursive: true });
	mkdirSync(join(root, ".agents"), { recursive: true });
	mkdirSync(join(root, "docs"), { recursive: true });
	writeFileSync(
		join(root, ".agents", "lock.json"),
		readFileSync(join(process.cwd(), "src/project-template/.agents/lock.json")),
	);
	writeFileSync(
		join(root, ".agents", "manifest.json"),
		readFileSync(
			join(process.cwd(), "src/project-template/.agents/manifest.json"),
		),
	);
	writeFileSync(
		join(root, ".afol", "config.json"),
		JSON.stringify({
			schema_version: 1,
			project: { name: "fixture", id: PROJECT_ID, timezone: "UTC" },
			paths: {
				external_dir: ".afol/external",
				evolution_db: ".afol/state/evolution.db",
				evolution_data_dir: ".afol/data/evolution",
				evolution_events_dir: ".afol/data/events/evolution",
			},
			evolution: {
				enabled: true,
				suggestions: {
					first_session_of_day: true,
					dedupe_scope: "project",
					max_visible_per_day: 1,
					remind_skipped_next_day: true,
					deep_review_after_production_days: 5,
				},
				preferences: {
					soft_decay_after_production_days: 7,
					stop_guiding_after_production_days: 20,
					minimum_effective_confidence: 0.65,
					decay_curve: "linear",
				},
				recurrence: {
					minimum_occurrences: 3,
					minimum_distinct_sessions: 2,
					minimum_distinct_production_days: 2,
				},
				large_change: {
					changed_files: 20,
					changed_lines: 1000,
					critical_paths_trigger: true,
				},
				external: {
					mode: "explicit_import_only",
					storage: "normalized_sections",
					store_raw: false,
					redact_before_persist: true,
				},
				autonomy: {
					auto_observe: true,
					auto_refresh_preference_projections: true,
					auto_clean_derived_state: true,
					auto_apply_mode: "none",
				},
			},
		}),
	);
	if (withIndex) rebuildSectionIndex(root);
	return root;
}

function writeSession(
	root: string,
	session: string,
	statements: readonly string[],
	evidence: readonly Record<string, unknown>[],
): string {
	const dir = join(root, ".afol", "wb", session);
	mkdirSync(dir, { recursive: true });
	const taskPath = join(dir, `${session}_task_01.md`);
	writeFileSync(
		taskPath,
		[
			"---",
			'doc_type: "workbench_task"',
			`id: "${session}_task_01"`,
			`session_id: "${session}"`,
			'status: "closed"',
			'created_at: "2026-08-11T12:00:00.000Z"',
			'updated_at: "2026-08-11T12:00:00.000Z"',
			'closed_at: "2026-08-11T12:00:00.000Z"',
			"---",
			"",
			"## State Board",
			"",
			"| Task | State | Owner | Notes |",
			"| --- | --- | --- | --- |",
			"| T-01 | done | agent | complete |",
			"",
			...statements,
			"",
		].join("\n"),
	);
	writeFileSync(
		join(dir, ".evidence.jsonl"),
		`${evidence.map((row) => JSON.stringify(row)).join("\n")}\n`,
	);
	return taskPath;
}

function statement(input: {
	problem: string;
	appliesWhen: string;
	action: string;
	evidence: string;
	verify: string;
}): string[] {
	return [
		`Problem: ${input.problem}`,
		`Applies when: ${input.appliesWhen}`,
		`Preventive action: ${input.action}`,
		`Evidence: ${input.evidence}`,
		`Verify: ${input.verify}`,
	];
}

describe("evolve lessons", () => {
	test("keeps two different lessons from one session as separate records", () => {
		const root = fixture();
		try {
			writeSession(
				root,
				"S-01",
				[
					...statement({
						problem:
							"The adoption preview dropped the second labeled statement.",
						appliesWhen: "cli/services/evolution/adoption-candidates.ts",
						action:
							"Extract every labeled statement, not only the first match.",
						evidence: "E-01",
						verify: "bun test cli/tests/evolution-candidates.test.ts",
					}),
					"",
					...statement({
						problem: "The lesson journal write raced with the durable reader.",
						appliesWhen: "cli/services/evolution/lesson-records.ts",
						action: "Keep the durable writer under the shared journal lock.",
						evidence: "E-02",
						verify: "bun test cli/tests/evolution-lesson-records.test.ts",
					}),
				],
				[
					evidenceRow({
						id: "E-02",
						result: "failed",
						exitCode: 1,
						test: "lesson-journal-race",
						errorCode: "EBUSY",
						path: "cli/services/evolution/lesson-records.ts",
						operation: "verify",
					}),
					evidenceRow({ id: "E-01" }),
				],
			);
			const result = ingestLessonStatements({
				root,
				session: "S-01",
				now: new Date("2026-08-11T13:00:00.000Z"),
			});
			expect(result.state).toBe("recorded");
			expect(result.appended).toBe(2);
			expect(result.duplicates).toBe(0);
			expect(result.lessons).toHaveLength(2);
			const ids = result.lessons.map((lesson) => lesson.lesson_id);
			expect(new Set(ids).size).toBe(2);
			for (const lesson of result.lessons) {
				expect(lesson.current).toHaveLength(1);
				expect(lesson.contradicted).toBe(false);
				expect(lesson.current[0]?.fields.problem).not.toContain("explicit");
			}
			const failureLesson = result.lessons.find(
				(lesson) => lesson.current[0]?.fields.evidence === "E-02",
			);
			expect(failureLesson?.current[0]?.work_type).toEqual({
				operation: "verify",
				module: "cli/services/evolution/lesson-records.ts",
				test: "lesson-journal-race",
				error: "ebusy",
			});
			expect(failureLesson?.current[0]?.task_id).toBe("T-01");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("does not merge two lessons that only share the task id", () => {
		const root = fixture();
		try {
			const problem = "The durable writer raced with the shared reader.";
			const appliesWhen = "cli/services/io";
			for (const [session, evidenceId, module, test] of [
				["S-A", "E-A", "cli/services/io/writer.ts", "writer-race"],
				["S-B", "E-B", "cli/services/io/reader.ts", "reader-race"],
			] as const) {
				writeSession(
					root,
					session,
					statement({
						problem,
						appliesWhen,
						action: "Take the shared lock before the durable write.",
						evidence: evidenceId,
						verify: "bun test cli/tests/evolution-lesson-records.test.ts",
					}),
					[
						evidenceRow({
							id: evidenceId,
							result: "failed",
							exitCode: 1,
							test,
							errorCode: "EACCES",
							path: module,
							operation: "verify",
						}),
						evidenceRow({ id: `${evidenceId}-OK` }),
					],
				);
				ingestLessonStatements({
					root,
					session,
					now: new Date(
						`2026-08-11T13:0${session.endsWith("A") ? 0 : 1}:00.000Z`,
					),
				});
			}
			const lessons = readLessonRecords(root);
			expect(lessons).toHaveLength(2);
			expect(new Set(lessons.map((lesson) => lesson.lesson_id)).size).toBe(2);
			// Same operation, module, test, and error merges across task ids.
			writeSession(
				root,
				"S-C",
				statement({
					problem,
					appliesWhen,
					action: "Take the shared lock before the durable write.",
					evidence: "E-C",
					verify: "bun test cli/tests/evolution-lesson-records.test.ts",
				}),
				[
					evidenceRow({
						id: "E-C",
						result: "failed",
						exitCode: 1,
						test: "writer-race",
						errorCode: "EACCES",
						path: "cli/services/io/writer.ts",
						operation: "verify",
					}),
					evidenceRow({ id: "E-C-OK" }),
				],
			);
			const merged = ingestLessonStatements({
				root,
				session: "S-C",
				now: new Date("2026-08-11T13:02:00.000Z"),
			});
			expect(merged.appended).toBe(0);
			expect(merged.duplicates).toBe(1);
			expect(readLessonRecords(root)).toHaveLength(2);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("a second identical run does not create another version", () => {
		const root = fixture();
		try {
			writeSession(
				root,
				"S-01",
				statement({
					problem: "The durable writer raced with the shared reader.",
					appliesWhen: "cli/services/io/writer.ts",
					action: "Take the shared lock before the durable write.",
					evidence: "E-01",
					verify: "bun test cli/tests/evolution-lesson-records.test.ts",
				}),
				[evidenceRow({ id: "E-01" })],
			);
			ingestLessonStatements({
				root,
				session: "S-01",
				now: new Date("2026-08-11T13:00:00.000Z"),
			});
			const second = ingestLessonStatements({
				root,
				session: "S-01",
				now: new Date("2026-08-11T13:05:00.000Z"),
			});
			expect(second.state).toBe("recorded");
			expect(second.appended).toBe(0);
			expect(second.duplicates).toBe(1);
			const lessons = readLessonRecords(root);
			expect(lessons).toHaveLength(1);
			expect(lessons[0]?.versions).toHaveLength(1);
			expect(lessons[0]?.versions[0]?.version).toBe(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("a same-session correction replaces the previous version and keeps the origin row", () => {
		const root = fixture();
		try {
			const taskPath = writeSession(
				root,
				"S-01",
				statement({
					problem: "The durable writer raced with the shared reader.",
					appliesWhen: "cli/services/io/writer.ts",
					action: "Take the shared lock before the durable write.",
					evidence: "E-01",
					verify: "bun test cli/tests/evolution-lesson-records.test.ts",
				}),
				[evidenceRow({ id: "E-01" })],
			);
			ingestLessonStatements({
				root,
				session: "S-01",
				now: new Date("2026-08-11T13:00:00.000Z"),
			});
			writeFileSync(
				taskPath,
				readFileSync(taskPath, "utf8").replace(
					"Take the shared lock before the durable write.",
					"Take the shared lock and fsync the directory after the write.",
				),
			);
			const corrected = ingestLessonStatements({
				root,
				session: "S-01",
				now: new Date("2026-08-11T13:05:00.000Z"),
			});
			expect(corrected.appended).toBe(1);
			const lesson = readLessonRecords(root)[0];
			expect(lesson?.versions).toHaveLength(2);
			const [origin, replacement] = lesson?.versions ?? [];
			if (!origin || !replacement)
				throw new Error("correction fixture did not version the lesson");
			expect(origin.superseded).toBe(true);
			expect(origin.fields.preventive_action).toBe(
				"take the shared lock before the durable write.",
			);
			expect(replacement.supersedes).toBe(origin.version_id);
			expect(replacement.superseded).toBe(false);
			expect(replacement.contradicts).toEqual([]);
			expect(lesson?.current ?? []).toEqual([replacement]);
			expect(lesson?.contradicted).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("a cross-session difference is a marked contradiction, not an overwrite", () => {
		const root = fixture();
		try {
			const problem = "The durable writer raced with the shared reader.";
			const evidence = [
				evidenceRow({
					id: "E-FAIL",
					result: "failed",
					exitCode: 1,
					test: "writer-race",
					errorCode: "EACCES",
					path: "cli/services/io/writer.ts",
					operation: "verify",
				}),
				evidenceRow({ id: "E-OK" }),
			];
			writeSession(
				root,
				"S-A",
				statement({
					problem,
					appliesWhen: "cli/services/io",
					action: "Take the shared lock before the durable write.",
					evidence: "E-FAIL",
					verify: "bun test cli/tests/evolution-lesson-records.test.ts",
				}),
				evidence,
			);
			writeSession(
				root,
				"S-B",
				statement({
					problem,
					appliesWhen: "cli/services/io",
					action: "Serialize writers through a single dedicated process.",
					evidence: "E-FAIL",
					verify: "bun test cli/tests/evolution-lesson-records.test.ts",
				}),
				evidence,
			);
			ingestLessonStatements({
				root,
				session: "S-A",
				now: new Date("2026-08-11T13:00:00.000Z"),
			});
			ingestLessonStatements({
				root,
				session: "S-B",
				now: new Date("2026-08-11T13:01:00.000Z"),
			});
			const lesson = readLessonRecords(root)[0];
			expect(lesson?.versions).toHaveLength(2);
			const [origin, contradiction] = lesson?.versions ?? [];
			expect(origin?.session_id).toBe("S-A");
			expect(origin?.fields.preventive_action).toBe(
				"take the shared lock before the durable write.",
			);
			expect(contradiction?.supersedes).toBeNull();
			expect(contradiction?.contradicts).toEqual([origin?.version_id ?? ""]);
			expect(lesson?.current).toHaveLength(2);
			expect(lesson?.contradicted).toBe(true);
			expect(origin?.contradicted).toBe(true);
			expect(contradiction?.contradicted).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("declared success is not evidence while an observed failure is", () => {
		const root = fixture();
		try {
			writeSession(
				root,
				"S-01",
				[
					...statement({
						problem: "A declared pass was trusted as closure evidence.",
						appliesWhen: "cli/services/workbench/verify.ts",
						action: "Accept only observed evidence for closure.",
						evidence: "E-DECLARED",
						verify: "bun test cli/tests/workbench-verify.test.ts",
					}),
					"",
					...statement({
						problem: "The durable writer raced with the shared reader.",
						appliesWhen: "cli/services/io/writer.ts",
						action: "Take the shared lock before the durable write.",
						evidence: "E-FAIL",
						verify: "bun test cli/tests/evolution-lesson-records.test.ts",
					}),
				],
				[
					evidenceRow({
						id: "E-FAIL",
						result: "failed",
						exitCode: 1,
						test: "writer-race",
						errorCode: "EACCES",
						path: "cli/services/io/writer.ts",
						operation: "verify",
					}),
					evidenceRow({
						id: "E-DECLARED",
						provenance: "declared",
					}),
					evidenceRow({ id: "E-OK" }),
				],
			);
			const result = ingestLessonStatements({
				root,
				session: "S-01",
				now: new Date("2026-08-11T13:00:00.000Z"),
			});
			expect(result.appended).toBe(2);
			const byProblem = new Map(
				result.lessons.map((lesson) => [
					lesson.current[0]?.fields.problem ?? "",
					lesson.current[0],
				]),
			);
			const declared = byProblem.get(
				"a declared pass was trusted as closure evidence.",
			);
			expect(declared?.fields.evidence).toBeUndefined();
			expect(declared?.work_type).toEqual({});
			const observed = byProblem.get(
				"the durable writer raced with the shared reader.",
			);
			expect(observed?.fields.evidence).toBe("E-FAIL");
			expect(observed?.work_type.test).toBe("writer-race");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("ingests lessons through the approval-gated command", async () => {
		const root = fixture();
		try {
			writeSession(
				root,
				"S-01",
				statement({
					problem: "The durable writer raced with the shared reader.",
					appliesWhen: "cli/services/io/writer.ts",
					action: "Take the shared lock before the durable write.",
					evidence: "E-01",
					verify: "bun test cli/tests/evolution-lesson-records.test.ts",
				}),
				[evidenceRow({ id: "E-01" })],
			);
			const out = {
				stdout: [] as string[],
				io: {
					stdout: (line: string) => out.stdout.push(line),
					stderr: () => {},
				},
			};
			expect(
				await runEvolveCommand(
					"lessons",
					["--session", "S-01", "--json"],
					root,
					out.io,
				),
			).toBe(0);
			const payload = JSON.parse(out.stdout.join("\n"));
			expect(payload.data).toMatchObject({
				state: "recorded",
				appended: 1,
				session_id: "S-01",
			});
			expect(
				readFileSync(lessonJournalPath(root), "utf8").trim().split("\n"),
			).toHaveLength(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("records an observed application separately from being shown", () => {
		const root = fixture();
		try {
			writeSession(
				root,
				"S-01",
				statement({
					problem: "The durable writer raced with the shared reader.",
					appliesWhen: "cli/services/io/writer.ts",
					action: "Take the shared lock before the durable write.",
					evidence: "E-01",
					verify: "bun test cli/tests/evolution-lesson-records.test.ts",
				}),
				[evidenceRow({ id: "E-01" })],
			);
			const ingested = ingestLessonStatements({
				root,
				session: "S-01",
				now: new Date("2026-08-11T13:00:00.000Z"),
			});
			const lessonId = ingested.lessons[0]?.lesson_id ?? "";
			expect(lessonId).toMatch(/^L-[a-f0-9]{20}$/);
			// Showing the lesson in a bundle never marks it applied.
			expect(
				selectContextLessons(readLessonRecords(root), [
					"cli/services/io/writer.ts",
				])?.shown_lesson_ids,
			).toEqual([lessonId]);
			expect(readLessonRecords(root)[0]?.current[0]?.application_count).toBe(0);
			writeSession(
				root,
				"S-APPLY",
				statement({
					problem: "The durable writer raced with the shared reader.",
					appliesWhen: "cli/services/io/writer.ts",
					action: "Take the shared lock before the durable write.",
					evidence: "E-APPLY-OK",
					verify: "bun test cli/tests/evolution-lesson-records.test.ts",
				}),
				[evidenceRow({ id: "E-APPLY-OK", taskId: "T-01" })],
			);
			const application = recordLessonApplication({
				root,
				session: "S-APPLY",
				lessonId,
				evidenceId: "E-APPLY-OK",
				createdAt: "2026-08-12T10:00:00.000Z",
			});
			expect(application.id).toMatch(/^LA-[a-f0-9]{20}$/);
			const repeated = recordLessonApplication({
				root,
				session: "S-APPLY",
				lessonId,
				evidenceId: "E-APPLY-OK",
				createdAt: "2026-08-12T10:05:00.000Z",
			});
			expect(repeated.id).toBe(application.id);
			const view = readLessonRecords(root).find(
				(lesson) => lesson.lesson_id === lessonId,
			);
			expect(view?.current[0]?.application_count).toBe(1);
			expect(view?.current[0]?.last_applied_at).toBe(
				"2026-08-12T10:00:00.000Z",
			);
			expect(() =>
				recordLessonApplication({
					root,
					session: "S-APPLY",
					lessonId,
					evidenceId: "E-01",
					createdAt: "2026-08-12T10:06:00.000Z",
				}),
			).toThrow("lesson application requires observed successful evidence");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("loads at most two relevant lessons into the next context bundle", () => {
		const root = fixture(true);
		try {
			const statements = [1, 2, 3].map((index) =>
				statement({
					problem: `The durable writer raced with the shared reader ${index}.`,
					appliesWhen: "cli/services/io/writer.ts",
					action: `Take the shared lock before the durable write ${index}.`,
					evidence: "E-01",
					verify: "bun test cli/tests/evolution-lesson-records.test.ts",
				}),
			);
			writeSession(
				root,
				"S-01",
				statements
					.flat()
					.map((line, index) =>
						index % 5 === 0 && index > 0 ? `\n${line}` : line,
					),
				[evidenceRow({ id: "E-01" })],
			);
			ingestLessonStatements({
				root,
				session: "S-01",
				now: new Date("2026-08-11T13:00:00.000Z"),
			});
			const lessons = readLessonRecords(root);
			expect(lessons).toHaveLength(3);
			const bundle = buildContextBundle(root, {
				filePath: "cli/services/io/writer.ts",
				surface: "general",
				mode: "balanced",
			});
			expect(bundle.lessons).toBeDefined();
			expect(bundle.lessons?.lessons).toHaveLength(2);
			expect(bundle.lessons?.bytes).toBeLessThanOrEqual(800);
			expect(bundle.lessons?.truncated).toBe(true);
			expect(bundle.lessons?.shown_lesson_ids).toEqual(
				lessons.slice(0, 2).map((lesson) => lesson.lesson_id),
			);
			expect(bundle.lessons?.lessons[0]?.preventive_action).toBe(
				"take the shared lock before the durable write 3.",
			);
			// Shown ids are recorded without marking any lesson applied.
			expect(
				lessons.every((lesson) => lesson.current[0]?.application_count === 0),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("omits the lesson section entirely for an irrelevant request without growing the bundle", () => {
		const root = fixture(true);
		try {
			const buildIrrelevant = (): string =>
				JSON.stringify(
					buildContextBundle(root, {
						filePath: "docs/unrelated-guide.md",
						surface: "general",
						mode: "balanced",
					}),
				);
			const before = buildIrrelevant();
			writeSession(
				root,
				"S-01",
				statement({
					problem: "The durable writer raced with the shared reader.",
					appliesWhen: "cli/services/io/writer.ts",
					action: "Take the shared lock before the durable write.",
					evidence: "E-01",
					verify: "bun test cli/tests/evolution-lesson-records.test.ts",
				}),
				[evidenceRow({ id: "E-01" })],
			);
			ingestLessonStatements({
				root,
				session: "S-01",
				now: new Date("2026-08-11T13:00:00.000Z"),
			});
			const bundle = buildContextBundle(root, {
				filePath: "docs/unrelated-guide.md",
				surface: "general",
				mode: "balanced",
			});
			expect("lessons" in bundle).toBe(false);
			expect(JSON.stringify(bundle)).not.toContain("durable writer raced");
			expect(buildIrrelevant()).toBe(before);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("keeps the lesson section within the 800-byte cap", () => {
		const root = fixture(true);
		try {
			writeSession(
				root,
				"S-01",
				[
					...statement({
						problem: `Huge ${"x".repeat(400)}`,
						appliesWhen: "cli/services/io/writer.ts",
						action: `Long ${"y".repeat(400)}`,
						evidence: "E-01",
						verify: `Check ${"z".repeat(300)}`,
					}),
					"",
					...statement({
						problem: "The durable writer raced with the shared reader.",
						appliesWhen: "cli/services/io/writer.ts",
						action: "Take the shared lock before the durable write.",
						evidence: "E-01",
						verify: "bun test cli/tests/evolution-lesson-records.test.ts",
					}),
				],
				[evidenceRow({ id: "E-01" })],
			);
			ingestLessonStatements({
				root,
				session: "S-01",
				now: new Date("2026-08-11T13:00:00.000Z"),
			});
			const bundle = buildContextBundle(root, {
				filePath: "cli/services/io/writer.ts",
				surface: "general",
				mode: "balanced",
			});
			expect(bundle.lessons?.lessons).toHaveLength(1);
			expect(bundle.lessons?.bytes).toBeLessThanOrEqual(800);
			expect(bundle.lessons?.bytes).toBeGreaterThan(0);
			expect(bundle.lessons?.truncated).toBe(true);
			expect(bundle.lessons?.lessons[0]?.problem).toBe(
				"the durable writer raced with the shared reader.",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
