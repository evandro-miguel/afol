import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evolutionDbPath, openEvolutionDb } from "../services/evolution/db";
import { checkEvolutionDbHealth } from "../services/evolution/health";
import {
	appendImportJournalEventUnlocked,
	importJournalPath,
	readImportJournal,
} from "../services/evolution/import-journal";
import {
	acceptExternalImport,
	listExternalImports,
	readImportCheckpoint,
	rebuildExternalImportProjection,
	validateExternalImportProjection,
} from "../services/evolution/import-store";

const PROJECT_ID = "6b7d91ca-496b-4f0c-8537-5c4993810d15";
const EXTERNAL_SESSION_ID = `EXT-${"b".repeat(32)}`;
const PROVIDER_SESSION_ID = `SID-${"c".repeat(32)}`;

function payload(seed = "default") {
	const digest = createHash("sha256").update(seed).digest("hex");
	const importId = `IMP-codex-${digest}`;
	return {
		project_id: PROJECT_ID,
		manifest: {
			import_id: importId,
			provider: "codex",
			adapter_version: "jsonl-v1",
			source_format: "jsonl-v1",
			imported_at: "2026-07-17T12:00:00.000Z",
			content_digest: digest,
			session_count: 1,
			message_count: 1,
			redaction_policy_version: "v1",
			warnings: [],
			files_ignored: [],
			redacted: true as const,
			raw_stored: false as const,
		},
		sessions: [
			{
				external_session_id: EXTERNAL_SESSION_ID,
				provider_session_id: PROVIDER_SESSION_ID,
				content_digest: digest,
				record_count: 1,
				normalized_digest: digest,
			},
		],
		checkpoint: {
			cursor: "1",
			status: "complete" as const,
			content_digest: digest,
		},
	};
}

describe("external import acceptance store", () => {
	test("does not expose import mutation internals through the public barrel", async () => {
		const evolution = await import("../services/evolution");
		expect("acceptExternalImport" in evolution).toBe(false);
		expect("appendImportJournalEventUnlocked" in evolution).toBe(false);
	});

	test("accepts once and reuses the idempotency key", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-import-store-"));
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			const importId = payload().manifest.import_id;
			const first = acceptExternalImport({
				root,
				db,
				projectId: PROJECT_ID,
				payload: payload(),
			});
			const second = acceptExternalImport({
				root,
				db,
				projectId: PROJECT_ID,
				payload: payload(),
			});
			expect(first.duplicate).toBe(false);
			expect(second.duplicate).toBe(true);
			expect(second.event.event_id).toBe(first.event.event_id);
			expect(readImportJournal(root, PROJECT_ID)).toHaveLength(1);
			expect(listExternalImports(db, PROJECT_ID)).toHaveLength(1);
			expect(readImportCheckpoint(db, PROJECT_ID, importId)?.cursor).toBe("1");
		} finally {
			db.close();
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rolls back projection and journal together on a failed transaction", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-import-rollback-"));
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			expect(() =>
				acceptExternalImport({
					root,
					db,
					projectId: PROJECT_ID,
					payload: payload("IMP-fail"),
					beforeCommit: () => {
						throw new Error("injected commit failure");
					},
				}),
			).toThrow("injected commit failure");
			expect(listExternalImports(db, PROJECT_ID)).toHaveLength(0);
			expect(readImportJournal(root, PROJECT_ID)).toHaveLength(0);
		} finally {
			db.close();
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("restores the journal after a partial write or fsync failure", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-import-io-rollback-"));
		try {
			appendImportJournalEventUnlocked({
				root,
				projectId: PROJECT_ID,
				payload: payload("first"),
			});
			const path = importJournalPath(root);
			const before = readFileSync(path);
			let writes = 0;
			expect(() =>
				appendImportJournalEventUnlocked({
					root,
					projectId: PROJECT_ID,
					payload: payload("partial"),
					io: {
						write: (fd, buffer, offset, length, position) => {
							if (writes++ > 0) throw new Error("injected EDQUOT");
							return writeSync(
								fd,
								buffer,
								offset,
								Math.min(17, length),
								position,
							);
						},
					},
				}),
			).toThrow("injected EDQUOT");
			expect(readFileSync(path)).toEqual(before);
			expect(readImportJournal(root, PROJECT_ID)).toHaveLength(1);

			expect(() =>
				appendImportJournalEventUnlocked({
					root,
					projectId: PROJECT_ID,
					payload: payload("fsync"),
					io: {
						fsync: () => {
							throw new Error("injected fsync failure");
						},
					},
				}),
			).toThrow("injected fsync failure");
			expect(readFileSync(path)).toEqual(before);
			expect(readImportJournal(root, PROJECT_ID)).toHaveLength(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("reports both append and rollback failures", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-import-io-aggregate-"));
		try {
			expect(() =>
				appendImportJournalEventUnlocked({
					root,
					projectId: PROJECT_ID,
					payload: payload("aggregate"),
					io: {
						write: () => {
							throw new Error("injected write failure");
						},
						truncate: () => {
							throw new Error("injected rollback failure");
						},
					},
				}),
			).toThrow("append and rollback both failed");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("advances provider cursor only after durable commit", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-import-cursor-"));
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			let cursorCommitted = false;
			const cursorPayload = payload("IMP-cursor");
			acceptExternalImport({
				root,
				db,
				projectId: PROJECT_ID,
				payload: cursorPayload,
				commitCursor: () => {
					cursorCommitted = true;
				},
			});
			expect(cursorCommitted).toBe(true);
			expect(readFileSync(importJournalPath(root), "utf8")).toContain(
				cursorPayload.manifest.import_id,
			);
		} finally {
			db.close();
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("detects and rebuilds stale import projections from the journal", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-import-rebuild-"));
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			acceptExternalImport({
				root,
				db,
				projectId: PROJECT_ID,
				payload: payload("IMP-rebuild"),
			});
			db.prepare("DELETE FROM external_sessions WHERE project_id = ?").run(
				PROJECT_ID,
			);
			expect(() =>
				validateExternalImportProjection({ root, projectId: PROJECT_ID, db }),
			).toThrow(/differs from canonical journal/);
			rebuildExternalImportProjection({ root, projectId: PROJECT_ID, db });
			expect(() =>
				validateExternalImportProjection({ root, projectId: PROJECT_ID, db }),
			).not.toThrow();
		} finally {
			db.close();
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("health fails when a v7 import table is missing", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-import-health-"));
		const dbPath = evolutionDbPath(root);
		const db = openEvolutionDb(dbPath);
		try {
			db.exec("DROP TABLE session_links");
		} finally {
			db.close();
		}
		try {
			const health = checkEvolutionDbHealth(dbPath);
			expect(health.ok).toBe(false);
			expect(health.findings.map((finding) => finding.message)).toContain(
				"external import schema is stale or incomplete",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("canonical import acceptance rejects learning-eligible links", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-import-learning-"));
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			const base = payload("IMP-learning");
			expect(() =>
				acceptExternalImport({
					root,
					db,
					projectId: PROJECT_ID,
					payload: {
						...base,
						links: [
							{
								external_session_id: EXTERNAL_SESSION_ID,
								link_state: "auto_verified",
								confidence: 1,
								evidence: [{ kind: "project_uuid_exact_match" }],
								confirmation_required: false,
								eligible_for_learning: true,
							},
						],
					},
				}),
			).toThrow("external import links cannot enter learning");
			expect(readImportJournal(root, PROJECT_ID)).toHaveLength(0);
		} finally {
			db.close();
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("canonical import acceptance rejects unredacted source paths", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-import-source-path-"));
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			const base = payload("IMP-source-path");
			expect(() =>
				acceptExternalImport({
					root,
					db,
					projectId: PROJECT_ID,
					payload: {
						...base,
						manifest: {
							...base.manifest,
							source_path: `github_pat_${"D".repeat(40)}.jsonl`,
						},
					},
				}),
			).toThrow("external import source path must be redacted");
			expect(readImportJournal(root, PROJECT_ID)).toHaveLength(0);
			expect(listExternalImports(db, PROJECT_ID)).toHaveLength(0);
		} finally {
			db.close();
			rmSync(root, { recursive: true, force: true });
		}
	});
});
