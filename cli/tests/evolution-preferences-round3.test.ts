import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultOperationContext } from "../core/operation-context";
import {
	appendProductionDayAllocation,
	checkEvolutionDbHealth,
	evolutionDbPath,
	getEvolutionStatus,
	openEvolutionDb,
	productionDayJournalPath,
	validatePreferenceProjection,
} from "../services/evolution";
import { rebuildProductionDayProjection } from "../services/evolution/journal";
import {
	dispatchPreferenceDecision,
	type PreferenceMutationBinding,
} from "../services/evolution/preference-authority";
import { effectivePreferenceConfidence } from "../services/evolution/preference-decay";
import {
	preferenceDigest,
	preferenceJournalPath,
	readPreferenceJournal,
	rebuildPreferenceProjection,
	withPreferenceMutationLock,
} from "../services/evolution/preference-journal";
import {
	createPreference,
	recordPreferenceEvidence,
} from "../services/evolution/preferences";
import { removeEvolutionTestRoot } from "./evolution-test-support";

const PROJECT_ID = "6b7d91ca-496b-4f0c-8537-5c4993810d15";

function issueAuthority(binding: PreferenceMutationBinding) {
	return dispatchPreferenceDecision({
		projectId: PROJECT_ID,
		preferenceId: binding.preferenceId,
		action: binding.action,
		provenance: binding.provenance,
		operationContext: defaultOperationContext(),
		decisionId: `D-${binding.preferenceId}-${binding.action}`,
		timestamp: "2026-07-17T00:00:00.000Z",
	});
}

function fixture() {
	const root = mkdtempSync(join(tmpdir(), "evolution-round3-"));
	const db = openEvolutionDb(evolutionDbPath(root));
	return { root, db };
}

describe("Evolution preference authority round 3", () => {
	test("fails closed on a production ordinal rewind", () => {
		expect(() => effectivePreferenceConfidence(0.8, 4, 3)).toThrow(
			/preference production ordinal rewound/,
		);
	});

	test("binds the admitted decision to the exact mutation", () => {
		const { root, db } = fixture();
		try {
			const binding = {
				preferenceId: "P-bind",
				action: "create" as const,
				provenance: "explicit" as const,
			};
			const authority = issueAuthority(binding);
			const created = createPreference({
				root,
				db,
				projectId: PROJECT_ID,
				id: "P-bind",
				statement: "Keep the mutation narrow",
				provenance: "explicit",
				timezone: "UTC",
				authority,
				sourceRefs: [{ id: "S-bind", kind: "session" }],
			});
			expect(created.id).toBe("P-bind");
			const event = readPreferenceJournal(root, PROJECT_ID)[0];
			if (!event) throw new Error("missing preference journal event");
			expect(event?.decision).toMatchObject({
				id: "D-P-bind-create",
				projectId: PROJECT_ID,
				preferenceId: "P-bind",
				action: "create",
				provenance: "explicit",
				actor: "project_user",
			});
			expect(event?.decision_digest).toMatch(/^[a-f0-9]{64}$/);
			expect(event?.source_refs).toContainEqual({
				id: event?.decision.id,
				kind: "decision",
				path: ".afol/data/events/evolution/preferences.jsonl",
				digest: event?.decision_digest,
				authority: "canonical",
			});
			const conflictBinding = {
				preferenceId: "P-conflict",
				action: "create" as const,
				provenance: "explicit" as const,
			};
			const conflictAuthority = issueAuthority(conflictBinding);
			createPreference({
				root,
				db,
				projectId: PROJECT_ID,
				id: "P-conflict",
				statement: "Persist only the admitted decision",
				provenance: "explicit",
				timezone: "UTC",
				authority: conflictAuthority,
				sourceRefs: [
					{
						id: "D-P-conflict-create",
						kind: "decision",
						path: ".afol/data/events/evolution/preferences.jsonl",
						digest: "0".repeat(64),
						authority: "canonical",
					},
				],
			});
			const persistedRow = db
				.query("SELECT source_refs FROM preferences WHERE id='P-conflict'")
				.get() as { source_refs: string };
			const persisted = JSON.parse(persistedRow.source_refs) as Array<
				Record<string, string>
			>;
			expect(persisted.some((ref) => ref.digest === "0".repeat(64))).toBe(
				false,
			);
			const copy = { ...authority } as typeof authority;
			expect(() =>
				createPreference({
					root,
					db,
					projectId: PROJECT_ID,
					id: "P-copy",
					statement: "Spoofed authority",
					provenance: "explicit",
					timezone: "UTC",
					authority: copy,
					sourceRefs: [{ id: "S-copy", kind: "session" }],
				}),
			).toThrow(/admitted project_user authority/);
		} finally {
			db.close();
		}
	});

	test("rejects imported and external sources before projection mutation", () => {
		const { root, db } = fixture();
		try {
			const binding = {
				preferenceId: "P-import",
				action: "create" as const,
				provenance: "explicit" as const,
			};
			const authority = issueAuthority(binding);
			expect(() =>
				createPreference({
					root,
					db,
					projectId: PROJECT_ID,
					id: "P-import",
					statement: "Imported instruction",
					provenance: "explicit",
					timezone: "UTC",
					authority,
					sourceRefs: [{ id: "I-1", kind: "import" }],
				}),
			).toThrow(/external or imported/);
			expect(
				db.query("SELECT COUNT(*) AS count FROM preferences").get(),
			).toEqual({ count: 0 });
		} finally {
			db.close();
		}
	});

	test("fails closed when a direct preference rebuild sees a rewound production projection", () => {
		const { root, db } = fixture();
		try {
			const evidenceDir = join(root, ".afol/wb/S-rewind");
			mkdirSync(evidenceDir, { recursive: true });
			writeFileSync(
				join(evidenceDir, ".evidence.jsonl"),
				`${JSON.stringify({
					id: "E-rewind",
					project_id: PROJECT_ID,
					session_id: "S-rewind",
					created_at: "2026-07-17T00:00:00.000Z",
					result: "passed",
					provenance: "observed",
					exit_code: 0,
				})}\n`,
			);
			appendProductionDayAllocation({
				root,
				db,
				projectId: PROJECT_ID,
				timezone: "UTC",
				sessionId: "S-rewind",
				evidenceId: "E-rewind",
			});
			createPreference({
				root,
				db,
				projectId: PROJECT_ID,
				id: "P-stale",
				statement: "Keep canonical reinforcement",
				provenance: "explicit",
				timezone: "UTC",
				authority: issueAuthority({
					preferenceId: "P-stale",
					action: "create",
					provenance: "explicit",
				}),
				sourceRefs: [{ id: "S-rewind", kind: "session" }],
			});
			db.exec("DELETE FROM preference_evidence; DELETE FROM preferences;");
			writeFileSync(productionDayJournalPath(root), "");
			expect(() =>
				rebuildPreferenceProjection({
					root,
					db,
					projectId: PROJECT_ID,
					timezone: "UTC",
				}),
			).toThrow(/production-day journal/);
			expect(
				db.query("SELECT COUNT(*) AS count FROM preferences").get(),
			).toEqual({ count: 0 });
		} finally {
			db.close();
		}
	});

	test("fails before mutation on a semantically invalid rehashed preference event", () => {
		const { root, db } = fixture();
		try {
			createPreference({
				root,
				db,
				projectId: PROJECT_ID,
				id: "P-semantic",
				statement: "Keep semantic journal validation",
				provenance: "explicit",
				timezone: "UTC",
				authority: issueAuthority({
					preferenceId: "P-semantic",
					action: "create",
					provenance: "explicit",
				}),
				sourceRefs: [{ id: "S-semantic", kind: "session" }],
			});
			const event = readPreferenceJournal(root, PROJECT_ID)[0];
			if (!event) throw new Error("missing preference journal event");
			const invalid = { ...event, action: "reject" as const };
			const { event_digest: _digest, ...withoutDigest } = invalid;
			invalid.event_digest = preferenceDigest(withoutDigest);
			writeFileSync(
				preferenceJournalPath(root),
				`${JSON.stringify(invalid)}\n`,
			);
			expect(() =>
				rebuildPreferenceProjection({
					root,
					db,
					projectId: PROJECT_ID,
					timezone: "UTC",
				}),
			).toThrow(/decision binding is invalid/);
			expect(
				db.query("SELECT COUNT(*) AS count FROM preferences").get(),
			).toEqual({ count: 1 });
		} finally {
			db.close();
		}
	});

	test("serializes production and preference writes across two DB connections", () => {
		const { root, db } = fixture();
		const second = openEvolutionDb(evolutionDbPath(root));
		try {
			const evidenceDir = join(root, ".afol/wb/S-lock");
			mkdirSync(evidenceDir, { recursive: true });
			writeFileSync(
				join(evidenceDir, ".evidence.jsonl"),
				`${JSON.stringify({
					id: "E-lock",
					project_id: PROJECT_ID,
					session_id: "S-lock",
					created_at: "2026-07-17T00:00:00.000Z",
					result: "passed",
					provenance: "observed",
					exit_code: 0,
				})}\n`,
			);
			appendProductionDayAllocation({
				root,
				db,
				projectId: PROJECT_ID,
				timezone: "UTC",
				sessionId: "S-lock",
				evidenceId: "E-lock",
			});
			const binding = {
				preferenceId: "P-lock",
				action: "create" as const,
				provenance: "explicit" as const,
			};
			createPreference({
				root,
				db: second,
				projectId: PROJECT_ID,
				id: binding.preferenceId,
				statement: "Observe the shared lock",
				provenance: binding.provenance,
				timezone: "UTC",
				authority: issueAuthority(binding),
				sourceRefs: [{ id: "S-lock", kind: "session" }],
			});
			expect(
				second
					.query(
						"SELECT current_production_day FROM preferences WHERE id='P-lock'",
					)
					.get(),
			).toEqual({
				current_production_day: 1,
			});
		} finally {
			second.close();
			db.close();
		}
	});

	test("blocks an overlapping second process on the shared evolution lock", async () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-overlap-lock-"));
		const firstReady = join(root, "first.ready");
		const release = join(root, "release");
		const secondEntered = join(root, "second.entered");
		const lockModule = join(import.meta.dir, "../services/io/session-lock");
		const script = (ready: string, gate: string, entered?: string) =>
			`import { existsSync, writeFileSync } from "node:fs"; import { withSessionLock } from ${JSON.stringify(lockModule)}; withSessionLock(${JSON.stringify(root)}, "__evolution-journal__", () => { writeFileSync(${JSON.stringify(ready)}, "1"); while (!existsSync(${JSON.stringify(gate)})) Bun.sleepSync(10); ${entered ? `writeFileSync(${JSON.stringify(entered)}, "1");` : ""} });`;
		const first = Bun.spawn(["bun", "-e", script(firstReady, release)], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const deadline = Date.now() + 5_000;
		while (!existsSync(firstReady) && Date.now() < deadline) Bun.sleepSync(10);
		expect(existsSync(firstReady)).toBe(true);
		const second = Bun.spawn(
			["bun", "-e", script(secondEntered, firstReady, secondEntered)],
			{ stdout: "pipe", stderr: "pipe" },
		);
		try {
			Bun.sleepSync(100);
			expect(existsSync(secondEntered)).toBe(false);
			writeFileSync(release, "1");
			expect(await first.exited).toBe(0);
			expect(await second.exited).toBe(0);
			expect(existsSync(secondEntered)).toBe(true);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("invalidates a retained preference appender after releasing the lock", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-scoped-appender-"));
		let retained: ((input: never) => never) | undefined;
		try {
			withPreferenceMutationLock(root, (append) => {
				retained = append as unknown as (input: never) => never;
			});
			expect(() => retained?.(undefined as never)).toThrow(
				/preference mutation appender is no longer active/,
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("fails closed on preference projection drift in mutation, health, and status", () => {
		const { root, db } = fixture();
		const context = { root, projectId: PROJECT_ID, timezone: "UTC" };
		try {
			createPreference({
				root,
				db,
				projectId: PROJECT_ID,
				id: "P-drift",
				statement: "canonical",
				provenance: "explicit",
				timezone: "UTC",
				authority: issueAuthority({
					preferenceId: "P-drift",
					action: "create",
					provenance: "explicit",
				}),
				sourceRefs: [{ id: "S-drift", kind: "session" }],
			});
			const journalBefore = readFileSync(preferenceJournalPath(root), "utf8");
			db.exec(
				"UPDATE preferences SET effective_confidence = 0, current_production_day = 999, status = 'dormant' WHERE id = 'P-drift'",
			);
			expect(() =>
				createPreference({
					root,
					db,
					projectId: PROJECT_ID,
					id: "P-after-drift",
					statement: "must not append",
					provenance: "explicit",
					timezone: "UTC",
					authority: issueAuthority({
						preferenceId: "P-after-drift",
						action: "create",
						provenance: "explicit",
					}),
					sourceRefs: [{ id: "S-after-drift", kind: "session" }],
				}),
			).toThrow(/preference projection differs/);
			expect(readFileSync(preferenceJournalPath(root), "utf8")).toBe(
				journalBefore,
			);
			expect(() =>
				recordPreferenceEvidence({
					root,
					db,
					projectId: PROJECT_ID,
					preferenceId: "P-drift",
					evidenceId: "PE-after-drift",
					kind: "explicit",
					weight: 0.1,
					timezone: "UTC",
					authority: issueAuthority({
						preferenceId: "P-drift",
						action: "reinforce",
						provenance: "explicit",
					}),
					sourceRefs: [{ id: "S-after-drift", kind: "session" }],
				}),
			).toThrow(/preference projection differs/);
			expect(() => validatePreferenceProjection({ ...context, db })).toThrow(
				/preference projection differs/,
			);
			const health = checkEvolutionDbHealth(
				evolutionDbPath(root),
				PROJECT_ID,
				context,
			);
			expect(health.ok).toBe(false);
			expect(health.findings).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						message: expect.stringContaining("preference projection differs"),
					}),
				]),
			);
			expect(() => getEvolutionStatus(db, PROJECT_ID, context)).toThrow(
				/preference projection differs/,
			);
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("preserves configured project identity when rebuilding empty production state", () => {
		const { root, db } = fixture();
		try {
			createPreference({
				root,
				db,
				projectId: PROJECT_ID,
				id: "P-ordinal-zero",
				statement: "identity survives empty rebuild",
				provenance: "explicit",
				timezone: "UTC",
				authority: issueAuthority({
					preferenceId: "P-ordinal-zero",
					action: "create",
					provenance: "explicit",
				}),
				sourceRefs: [{ id: "S-identity", kind: "session" }],
			});
			rebuildProductionDayProjection({
				root,
				db,
				projectId: PROJECT_ID,
				timezone: "UTC",
			});
			expect(
				db
					.query(
						"SELECT value FROM evolution_metadata WHERE key = 'project_id'",
					)
					.get(),
			).toEqual({ value: PROJECT_ID });
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("rolls back a first preference create when parent fsync fails", () => {
		const { root, db } = fixture();
		try {
			expect(() =>
				createPreference({
					root,
					db,
					projectId: PROJECT_ID,
					id: "P-fsync",
					statement: "durable parent",
					provenance: "explicit",
					timezone: "UTC",
					authority: issueAuthority({
						preferenceId: "P-fsync",
						action: "create",
						provenance: "explicit",
					}),
					sourceRefs: [{ id: "S-fsync", kind: "session" }],
					syncDirectory: () => {
						throw new Error("directory fsync failed");
					},
				}),
			).toThrow("directory fsync failed");
			expect(readFileSync(preferenceJournalPath(root), "utf8")).toBe("");
			expect(
				db.query("SELECT COUNT(*) AS count FROM preferences").get(),
			).toEqual({ count: 0 });
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("serializes overlapping production and preference processes", async () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-overlap-operations-"));
		const start = join(root, "start");
		const resultDir = join(root, "results");
		mkdirSync(resultDir, { recursive: true });
		const dbPath = evolutionDbPath(root);
		const modulePath = join(import.meta.dir, "../services/evolution");
		const authorityPath = join(
			import.meta.dir,
			"../services/evolution/preference-authority",
		);
		const contextPath = join(import.meta.dir, "../core/operation-context");
		const evidenceDir = join(root, ".afol/wb/S-overlap");
		mkdirSync(evidenceDir, { recursive: true });
		writeFileSync(
			join(evidenceDir, ".evidence.jsonl"),
			`${JSON.stringify({
				id: "E-overlap",
				project_id: PROJECT_ID,
				session_id: "S-overlap",
				created_at: "2026-07-17T00:00:00.000Z",
				result: "passed",
				provenance: "observed",
				exit_code: 0,
			})}\n`,
		);
		const appendScript = `import { existsSync, writeFileSync } from "node:fs"; import { appendProductionDayAllocation, openEvolutionDb, evolutionDbPath } from ${JSON.stringify(modulePath)}; const root=${JSON.stringify(root)}; while (!existsSync(${JSON.stringify(start)})) Bun.sleepSync(2); const db=openEvolutionDb(evolutionDbPath(root)); try { appendProductionDayAllocation({root,db,projectId:${JSON.stringify(PROJECT_ID)},timezone:"UTC",sessionId:"S-overlap",evidenceId:"E-overlap"}); writeFileSync(${JSON.stringify(join(resultDir, "append.ok"))},"1"); } catch (error) { writeFileSync(${JSON.stringify(join(resultDir, "append.error"))},String(error)); process.exitCode=1; } finally { db.close(); }`;
		const preferenceScript = `import { existsSync, writeFileSync } from "node:fs"; import { openEvolutionDb, evolutionDbPath } from ${JSON.stringify(modulePath)}; import { dispatchPreferenceDecision } from ${JSON.stringify(authorityPath)}; import { defaultOperationContext } from ${JSON.stringify(contextPath)}; import { createPreference } from ${JSON.stringify(join(import.meta.dir, "../services/evolution/preferences"))}; const root=${JSON.stringify(root)}; while (!existsSync(${JSON.stringify(start)})) Bun.sleepSync(2); const db=openEvolutionDb(evolutionDbPath(root)); try { const authority=dispatchPreferenceDecision({projectId:${JSON.stringify(PROJECT_ID)},preferenceId:"P-overlap",action:"create",provenance:"explicit",operationContext:defaultOperationContext(),decisionId:"D-P-overlap"}); createPreference({root,db,projectId:${JSON.stringify(PROJECT_ID)},id:"P-overlap",statement:"serialized preference",provenance:"explicit",timezone:"UTC",authority,sourceRefs:[{id:"S-overlap",kind:"session"}]}); writeFileSync(${JSON.stringify(join(resultDir, "preference.ok"))},"1"); } catch (error) { writeFileSync(${JSON.stringify(join(resultDir, "preference.error"))},String(error)); process.exitCode=1; } finally { db.close(); }`;
		const appendChild = Bun.spawn(["bun", "-e", appendScript], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const preferenceChild = Bun.spawn(["bun", "-e", preferenceScript], {
			stdout: "pipe",
			stderr: "pipe",
		});
		try {
			writeFileSync(start, "1");
			expect(await appendChild.exited).toBe(0);
			expect(await preferenceChild.exited).toBe(0);
			const db = openEvolutionDb(dbPath);
			try {
				expect(
					db.query("SELECT COUNT(*) AS count FROM production_days").get(),
				).toEqual({ count: 1 });
				expect(
					db.query("SELECT COUNT(*) AS count FROM preferences").get(),
				).toEqual({ count: 1 });
			} finally {
				db.close();
			}
			expect(readPreferenceJournal(root, PROJECT_ID)).toHaveLength(1);
			expect(
				readFileSync(productionDayJournalPath(root), "utf8").trim().split("\n"),
			).toHaveLength(1);
		} finally {
			try {
				appendChild.kill();
				preferenceChild.kill();
			} catch {}
			removeEvolutionTestRoot(root);
		}
	});
});
