import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
	symlinkSync,
	writeFileSync,
	writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evolutionDbPath, openEvolutionDb } from "../services/evolution/db";
import {
	importJournalPath,
	readImportJournal,
} from "../services/evolution/import-journal";
import {
	confirmExternalImport,
	previewExternalImport,
} from "../services/evolution/import-service";

const PROJECT_ID = "6b7d91ca-496b-4f0c-8537-5c4993810d15";

function fixture(): { root: string; source: string } {
	const root = mkdtempSync(join(tmpdir(), "evolution-import-service-"));
	const source = join(root, "source.jsonl");
	writeFileSync(
		source,
		`${JSON.stringify({ session_id: "provider-session-1", role: "user", content: "token=redaction_canary" })}\n`,
	);
	return { root, source };
}

describe("external import service", () => {
	test("previews normalized redacted records without writing state", async () => {
		const { root, source } = fixture();
		try {
			const preview = await previewExternalImport(root, "codex", {
				provider: "codex",
				path: source,
				projectId: PROJECT_ID,
			});
			expect(preview.projectId).toBe(PROJECT_ID);
			expect(preview.importId).toContain(preview.contentDigest);
			expect(preview.records).toBe(1);
			expect(preview.sessionRecords).toHaveLength(1);
			expect(JSON.stringify(preview)).not.toContain("redaction_canary");
			expect(existsSync(join(root, ".afol"))).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fails closed for an ambiguous JSONL format", async () => {
		const { root, source } = fixture();
		writeFileSync(source, `${JSON.stringify({ arbitrary: "value" })}\n`);
		try {
			await expect(
				previewExternalImport(root, "codex", {
					provider: "codex",
					path: source,
					projectId: PROJECT_ID,
				}),
			).rejects.toThrow(/ambiguous/);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("addresses persisted identity to redacted normalized content", async () => {
		const first = fixture();
		const second = fixture();
		writeFileSync(
			first.source,
			`${JSON.stringify({ session_id: "same", role: "user", content: "token=one" })}\n`,
		);
		writeFileSync(
			second.source,
			`${JSON.stringify({ session_id: "same", role: "user", content: "token=two" })}\n`,
		);
		try {
			const one = await previewExternalImport(first.root, "codex", {
				provider: "codex",
				path: first.source,
				projectId: PROJECT_ID,
			});
			const two = await previewExternalImport(second.root, "codex", {
				provider: "codex",
				path: second.source,
				projectId: PROJECT_ID,
			});
			expect(one.contentDigest).toBe(two.contentDigest);
			expect(one.importId).toBe(two.importId);
		} finally {
			rmSync(first.root, { recursive: true, force: true });
			rmSync(second.root, { recursive: true, force: true });
		}
	});

	test("bounds distinct external sessions", async () => {
		const { root, source } = fixture();
		writeFileSync(
			source,
			`${Array.from({ length: 2001 }, (_, index) => JSON.stringify({ session_id: `s-${index}`, content: "bounded" })).join("\n")}\n`,
		);
		try {
			await expect(
				previewExternalImport(root, "codex", {
					provider: "codex",
					path: source,
					projectId: PROJECT_ID,
				}),
			).rejects.toThrow(/maximum session count/);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("never persists or returns credential-shaped source path segments", async () => {
		const { root, source } = fixture();
		const canary = `github_pat_${"B".repeat(40)}`;
		const secretPath = join(root, `${canary}.jsonl`);
		renameSync(source, secretPath);
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			const accepted = await confirmExternalImport({
				root,
				provider: "codex",
				source: { provider: "codex", path: secretPath, projectId: PROJECT_ID },
				projectId: PROJECT_ID,
				db,
			});
			expect(accepted.preview.sourcePath).toBe("<redacted-local-source>");
			expect(accepted.preview.manifest.source_path).toBe(
				"<redacted-local-source>",
			);
			const persisted = [
				readFileSync(join(accepted.artifactPath, "manifest.json")),
				readFileSync(importJournalPath(root)),
				readFileSync(evolutionDbPath(root)),
				...(existsSync(`${evolutionDbPath(root)}-wal`)
					? [readFileSync(`${evolutionDbPath(root)}-wal`)]
					: []),
			];
			expect(persisted.some((value) => value.includes(canary))).toBe(false);
		} finally {
			db.close();
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects a symlinked external artifact destination", async () => {
		const { root, source } = fixture();
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			const outside = join(root, "outside");
			mkdirSync(outside);
			symlinkSync(outside, join(root, ".afol", "external"));
			await expect(
				confirmExternalImport({
					root,
					provider: "codex",
					source: { provider: "codex", path: source, projectId: PROJECT_ID },
					projectId: PROJECT_ID,
					db,
				}),
			).rejects.toThrow(/symlink/);
			expect(readImportJournal(root, PROJECT_ID)).toHaveLength(0);
		} finally {
			db.close();
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("confirms once, persists atomic redacted artifacts, and is idempotent", async () => {
		const { root, source } = fixture();
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			const first = await confirmExternalImport({
				root,
				provider: "codex",
				source: { provider: "codex", path: source, projectId: PROJECT_ID },
				projectId: PROJECT_ID,
				db,
			});
			for (const file of [
				"manifest.json",
				"sessions.jsonl",
				"segments.jsonl",
				"links.jsonl",
				"summary.md",
			])
				expect(
					readFileSync(join(first.artifactPath, file), "utf8"),
				).not.toContain("redaction_canary");
			expect(readFileSync(importJournalPath(root), "utf8")).not.toContain(
				"redaction_canary",
			);
			for (const file of [
				evolutionDbPath(root),
				`${evolutionDbPath(root)}-wal`,
			])
				if (existsSync(file))
					expect(readFileSync(file).toString()).not.toContain(
						"redaction_canary",
					);
			const second = await confirmExternalImport({
				root,
				provider: "codex",
				source: { provider: "codex", path: source, projectId: PROJECT_ID },
				projectId: PROJECT_ID,
				db,
			});
			expect(first.duplicate).toBe(false);
			expect(second.duplicate).toBe(true);
			expect(second.artifactPath).toBe(first.artifactPath);
			expect(readImportJournal(root, PROJECT_ID)).toHaveLength(1);
			for (const file of [
				"manifest.json",
				"sessions.jsonl",
				"segments.jsonl",
				"links.jsonl",
				"summary.md",
			])
				expect(existsSync(join(first.artifactPath, file))).toBe(true);
			expect(
				readFileSync(join(first.artifactPath, "sessions.jsonl"), "utf8"),
			).not.toContain("redaction_canary");
		} finally {
			db.close();
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("completes checked short writes for every artifact", async () => {
		const { root, source } = fixture();
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			let writes = 0;
			const accepted = await confirmExternalImport({
				root,
				provider: "codex",
				source: { provider: "codex", path: source, projectId: PROJECT_ID },
				projectId: PROJECT_ID,
				db,
				artifactWrite: (fd, buffer, offset, length, position) => {
					writes += 1;
					return writeSync(fd, buffer, offset, Math.min(7, length), position);
				},
			});
			expect(writes).toBeGreaterThan(5);
			for (const file of [
				"manifest.json",
				"sessions.jsonl",
				"segments.jsonl",
				"links.jsonl",
				"summary.md",
			])
				expect(existsSync(join(accepted.artifactPath, file))).toBe(true);
			expect(readImportJournal(root, PROJECT_ID)).toHaveLength(1);
			const retry = await confirmExternalImport({
				root,
				provider: "codex",
				source: { provider: "codex", path: source, projectId: PROJECT_ID },
				projectId: PROJECT_ID,
				db,
			});
			expect(retry.duplicate).toBe(true);
		} finally {
			db.close();
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fails closed when an artifact writer makes no progress", async () => {
		const { root, source } = fixture();
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			await expect(
				confirmExternalImport({
					root,
					provider: "codex",
					source: { provider: "codex", path: source, projectId: PROJECT_ID },
					projectId: PROJECT_ID,
					db,
					artifactWrite: () => 0,
				}),
			).rejects.toThrow("file write made no progress");
			expect(readImportJournal(root, PROJECT_ID)).toHaveLength(0);
			expect(existsSync(join(root, ".afol", "external", "imports"))).toBe(
				false,
			);
		} finally {
			db.close();
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("removes staged artifacts when store commit fails", async () => {
		const { root, source } = fixture();
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			await expect(
				confirmExternalImport({
					root,
					provider: "codex",
					source: { provider: "codex", path: source, projectId: PROJECT_ID },
					projectId: PROJECT_ID,
					db,
					beforeCommit: () => {
						throw new Error("injected import failure");
					},
				}),
			).rejects.toThrow("injected import failure");
			expect(readImportJournal(root, PROJECT_ID)).toHaveLength(0);
			expect(existsSync(join(root, ".afol", "external", "imports"))).toBe(
				false,
			);
		} finally {
			db.close();
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("reuses an orphan artifact manifest after a crash before journal append", async () => {
		const { root, source } = fixture();
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			const first = await confirmExternalImport({
				root,
				provider: "codex",
				source: { provider: "codex", path: source, projectId: PROJECT_ID },
				projectId: PROJECT_ID,
				db,
			});
			db.exec(
				"DELETE FROM import_checkpoints; DELETE FROM session_links; DELETE FROM external_sessions; DELETE FROM external_imports;",
			);
			rmSync(importJournalPath(root), { force: true });
			const retry = await confirmExternalImport({
				root,
				provider: "codex",
				source: { provider: "codex", path: source, projectId: PROJECT_ID },
				projectId: PROJECT_ID,
				db,
			});
			expect(retry.preview.manifest.imported_at).toBe(
				first.preview.manifest.imported_at,
			);
			expect(retry.duplicate).toBe(false);
		} finally {
			db.close();
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects an orphan artifact with a tampered timestamp", async () => {
		const { root, source } = fixture();
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			const first = await confirmExternalImport({
				root,
				provider: "codex",
				source: { provider: "codex", path: source, projectId: PROJECT_ID },
				projectId: PROJECT_ID,
				db,
			});
			const manifestPath = join(first.artifactPath, "manifest.json");
			const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
				string,
				unknown
			>;
			manifest.imported_at = "tampered";
			writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
			await expect(
				confirmExternalImport({
					root,
					provider: "codex",
					source: { provider: "codex", path: source, projectId: PROJECT_ID },
					projectId: PROJECT_ID,
					db,
				}),
			).rejects.toThrow(/manifest/);
		} finally {
			db.close();
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects an orphan artifact with missing, extra, or altered files", async () => {
		for (const mutation of ["missing", "extra", "altered"] as const) {
			const { root, source } = fixture();
			const db = openEvolutionDb(evolutionDbPath(root));
			try {
				const first = await confirmExternalImport({
					root,
					provider: "codex",
					source: { provider: "codex", path: source, projectId: PROJECT_ID },
					projectId: PROJECT_ID,
					db,
				});
				db.exec(
					"DELETE FROM import_checkpoints; DELETE FROM session_links; DELETE FROM external_sessions; DELETE FROM external_imports;",
				);
				rmSync(importJournalPath(root), { force: true });
				if (mutation === "missing")
					rmSync(join(first.artifactPath, "segments.jsonl"));
				if (mutation === "extra")
					writeFileSync(join(first.artifactPath, "raw.jsonl"), "forbidden\n");
				if (mutation === "altered")
					writeFileSync(
						join(first.artifactPath, "segments.jsonl"),
						"truncated\n",
					);
				await expect(
					confirmExternalImport({
						root,
						provider: "codex",
						source: {
							provider: "codex",
							path: source,
							projectId: PROJECT_ID,
						},
						projectId: PROJECT_ID,
						db,
					}),
				).rejects.toThrow(/artifact manifest is invalid/);
				expect(readImportJournal(root, PROJECT_ID)).toHaveLength(0);
			} finally {
				db.close();
				rmSync(root, { recursive: true, force: true });
			}
		}
	});
});
