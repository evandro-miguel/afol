import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	rmdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
	writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { evolutionDbPath, openEvolutionDb } from "../services/evolution/db";
import {
	appendImportJournalEventUnlocked,
	importJournalPath,
	readImportJournal,
} from "../services/evolution/import-journal";
import {
	confirmExternalImport,
	previewExternalImport,
} from "../services/evolution/import-service";
import { rebuildExternalImportProjection } from "../services/evolution/import-store";
import { removeEvolutionTestRoot } from "./evolution-test-support";
import {
	directoryReparseTestSupport,
	symlinkTestSupport,
} from "./symlink-test-support";

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

function rewriteArtifactSessionId(
	path: string,
	externalSessionId: string,
): void {
	for (const name of ["sessions.jsonl", "segments.jsonl", "links.jsonl"]) {
		const file = join(path, name);
		const rows = readFileSync(file, "utf8")
			.split(/\r?\n/)
			.filter(Boolean)
			.map((line) => ({
				...(JSON.parse(line) as Record<string, unknown>),
				external_session_id: externalSessionId,
			}));
		writeFileSync(
			file,
			`${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
		);
	}
}

test.skipIf(process.platform !== "win32")(
	"external import persistence fails closed on Windows until DACL verification is available",
	async () => {
		const { root, source } = fixture();
		try {
			await expect(
				confirmExternalImport({
					root,
					provider: "codex",
					source: { provider: "codex", path: source, projectId: PROJECT_ID },
					projectId: PROJECT_ID,
				}),
			).rejects.toThrow(/unavailable on Windows.*owner and DACL safely/i);
			expect(existsSync(join(root, ".afol", "external"))).toBe(false);
		} finally {
			removeEvolutionTestRoot(root);
		}
	},
);

describe.skipIf(process.platform === "win32")("external import service", () => {
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
			removeEvolutionTestRoot(root);
		}
	});

	test("counts the synthesized unscoped session in preview and manifest", async () => {
		const { root, source } = fixture();
		writeFileSync(
			source,
			`${JSON.stringify({ role: "user", content: "first" })}\n${JSON.stringify({ role: "assistant", content: "second" })}\n`,
		);
		try {
			const preview = await previewExternalImport(root, "codex", {
				provider: "codex",
				path: source,
				projectId: PROJECT_ID,
			});
			expect(preview.sessions).toBe(1);
			expect(preview.sessionRecords).toHaveLength(1);
			expect(preview.manifest.session_count).toBe(1);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("namespaces unscoped sessions across distinct imports", async () => {
		const { root, source } = fixture();
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			writeFileSync(
				source,
				`${JSON.stringify({ role: "user", content: "first import" })}\n`,
			);
			const first = await confirmExternalImport({
				root,
				provider: "codex",
				source: { provider: "codex", path: source, projectId: PROJECT_ID },
				projectId: PROJECT_ID,
				db,
			});
			writeFileSync(
				source,
				`${JSON.stringify({ role: "user", content: "second import" })}\n`,
			);
			const second = await confirmExternalImport({
				root,
				provider: "codex",
				source: { provider: "codex", path: source, projectId: PROJECT_ID },
				projectId: PROJECT_ID,
				db,
			});

			expect(first.preview.importId).not.toBe(second.preview.importId);
			expect(first.preview.sessionRecords[0]?.provider_session_id).toBe(
				"unscoped",
			);
			expect(second.preview.sessionRecords[0]?.provider_session_id).toBe(
				"unscoped",
			);
			expect(first.preview.sessionRecords[0]?.external_session_id).not.toBe(
				second.preview.sessionRecords[0]?.external_session_id,
			);
			expect(readImportJournal(root, PROJECT_ID)).toHaveLength(2);
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("versions a named provider session across distinct imports", async () => {
		const { root, source } = fixture();
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			writeFileSync(
				source,
				`${JSON.stringify({ session_id: "provider-session-1", role: "user", content: "first import" })}\n`,
			);
			const first = await confirmExternalImport({
				root,
				provider: "codex",
				source: { provider: "codex", path: source, projectId: PROJECT_ID },
				projectId: PROJECT_ID,
				db,
			});
			writeFileSync(
				source,
				`${JSON.stringify({ session_id: "provider-session-1", role: "user", content: "second import" })}\n${JSON.stringify({ session_id: "provider-session-1", role: "assistant", content: "new response" })}\n`,
			);
			const second = await confirmExternalImport({
				root,
				provider: "codex",
				source: { provider: "codex", path: source, projectId: PROJECT_ID },
				projectId: PROJECT_ID,
				db,
			});

			expect(first.preview.importId).not.toBe(second.preview.importId);
			expect(first.preview.sessionRecords[0]?.provider_session_id).toBe(
				second.preview.sessionRecords[0]?.provider_session_id,
			);
			expect(first.preview.sessionRecords[0]?.external_session_id).not.toBe(
				second.preview.sessionRecords[0]?.external_session_id,
			);
			expect(readImportJournal(root, PROJECT_ID)).toHaveLength(2);
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("keeps an unchanged session identity when another session changes", async () => {
		const { root, source } = fixture();
		try {
			writeFileSync(
				source,
				`${[
					{ session_id: "session-a", role: "user", content: "stable" },
					{ session_id: "session-b", role: "user", content: "before" },
				]
					.map((row) => JSON.stringify(row))
					.join("\n")}\n`,
			);
			const first = await previewExternalImport(root, "codex", {
				provider: "codex",
				path: source,
				projectId: PROJECT_ID,
			});
			writeFileSync(
				source,
				`${[
					{ session_id: "session-a", role: "user", content: "stable" },
					{ session_id: "session-b", role: "user", content: "after" },
				]
					.map((row) => JSON.stringify(row))
					.join("\n")}\n`,
			);
			const second = await previewExternalImport(root, "codex", {
				provider: "codex",
				path: source,
				projectId: PROJECT_ID,
			});
			const secondIds = new Map(
				second.sessionRecords.map((session) => [
					session.provider_session_id,
					session.external_session_id,
				]),
			);
			const comparisons = first.sessionRecords.map(
				(session) =>
					secondIds.get(session.provider_session_id) ===
					session.external_session_id,
			);
			expect(comparisons.filter(Boolean)).toHaveLength(1);
			expect(comparisons.filter((same) => !same)).toHaveLength(1);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("keeps an unchanged session identity when another session shifts line position", async () => {
		const { root, source } = fixture();
		try {
			writeFileSync(
				source,
				[
					{ session_id: "session-a", role: "user", content: "a1" },
					{ session_id: "session-b", role: "user", content: "stable" },
				]
					.map((record) => JSON.stringify(record))
					.join("\n")
					.concat("\n"),
			);
			const first = await previewExternalImport(root, "codex", {
				provider: "codex",
				path: source,
				projectId: PROJECT_ID,
			});
			writeFileSync(
				source,
				[
					{ session_id: "session-a", role: "user", content: "a1" },
					{ session_id: "session-a", role: "user", content: "a2" },
					{ session_id: "session-b", role: "user", content: "stable" },
				]
					.map((record) => JSON.stringify(record))
					.join("\n")
					.concat("\n"),
			);
			const second = await previewExternalImport(root, "codex", {
				provider: "codex",
				path: source,
				projectId: PROJECT_ID,
			});
			const firstStable = first.sessionRecords.find(
				(session) =>
					session.provider_session_id ===
					`SID-${createHash("sha256").update("session-b").digest("hex").slice(0, 32)}`,
			);
			const secondStable = second.sessionRecords.find(
				(session) =>
					session.provider_session_id ===
					`SID-${createHash("sha256").update("session-b").digest("hex").slice(0, 32)}`,
			);
			expect(firstStable?.external_session_id).toBe(
				secondStable?.external_session_id,
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("keeps session identity consistent when redaction makes imports identical", async () => {
		const { root, source } = fixture();
		try {
			writeFileSync(
				source,
				`${JSON.stringify({ id: "fixed-record", session_id: "session-a", role: "user", content: "first secret" })}\n`,
			);
			const first = await previewExternalImport(root, "codex", {
				provider: "codex",
				path: source,
				projectId: PROJECT_ID,
			});
			writeFileSync(
				source,
				`${JSON.stringify({ id: "fixed-record", session_id: "session-a", role: "user", content: "second secret" })}\n`,
			);
			const second = await previewExternalImport(root, "codex", {
				provider: "codex",
				path: source,
				projectId: PROJECT_ID,
			});
			expect(first.importId).toBe(second.importId);
			expect(first.sessionRecords[0]?.external_session_id).toBe(
				second.sessionRecords[0]?.external_session_id,
			);
		} finally {
			removeEvolutionTestRoot(root);
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
			removeEvolutionTestRoot(root);
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
			removeEvolutionTestRoot(first.root);
			removeEvolutionTestRoot(second.root);
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
			removeEvolutionTestRoot(root);
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
			removeEvolutionTestRoot(root);
		}
	});

	test.skipIf(
		process.platform === "win32"
			? !directoryReparseTestSupport.available
			: !symlinkTestSupport.available,
	)("rejects a reparse-point external artifact destination", async () => {
		const { root, source } = fixture();
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			const outside = join(root, "outside");
			mkdirSync(outside);
			symlinkSync(
				outside,
				join(root, ".afol", "external"),
				process.platform === "win32" ? "junction" : "dir",
			);
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
			removeEvolutionTestRoot(root);
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
			removeEvolutionTestRoot(root);
		}
	});

	test.skipIf(
		process.platform === "win32"
			? !directoryReparseTestSupport.available
			: !symlinkTestSupport.available,
	)(
		"rejects a reparse-point project root before staging an import",
		async () => {
			const { root: backingRoot, source } = fixture();
			const linkedRoot = `${backingRoot}-linked`;
			const db = openEvolutionDb(evolutionDbPath(backingRoot));
			try {
				symlinkSync(
					backingRoot,
					linkedRoot,
					process.platform === "win32" ? "junction" : "dir",
				);
				await expect(
					confirmExternalImport({
						root: linkedRoot,
						provider: "codex",
						source: { provider: "codex", path: source, projectId: PROJECT_ID },
						projectId: PROJECT_ID,
						db,
					}),
				).rejects.toThrow(/real directory|reparse/i);
				expect(existsSync(join(backingRoot, ".afol", "external"))).toBe(false);
			} finally {
				db.close();
				if (process.platform === "win32") rmdirSync(linkedRoot);
				else rmSync(linkedRoot, { force: true });
				removeEvolutionTestRoot(backingRoot);
			}
		},
	);

	test("rejects a group/world-writable artifact parent on POSIX", async () => {
		if (process.platform === "win32") return;
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
			const providerPath = dirname(first.artifactPath);
			chmodSync(providerPath, 0o777);
			await expect(
				confirmExternalImport({
					root,
					provider: "codex",
					source: { provider: "codex", path: source, projectId: PROJECT_ID },
					projectId: PROJECT_ID,
					db,
				}),
			).rejects.toThrow("external import destination is group/world writable");
			chmodSync(providerPath, 0o700);
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("retries a canonical import that uses the legacy named-session id", async () => {
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
			const providerSessionId =
				first.event.payload.sessions[0]?.provider_session_id;
			if (!providerSessionId) throw new Error("missing provider session");
			const legacyId = `EXT-${createHash("sha256")
				.update(`codex:${providerSessionId}`)
				.digest("hex")
				.slice(0, 32)}`;
			const firstLinks = first.event.payload.links;
			if (!firstLinks) throw new Error("missing canonical links");
			const legacyPayload = {
				...first.event.payload,
				sessions: first.event.payload.sessions.map((session) => ({
					...session,
					external_session_id: legacyId,
				})),
				links: firstLinks.map((link) => ({
					...link,
					external_session_id: legacyId,
				})),
			};
			rmSync(importJournalPath(root), { force: true });
			appendImportJournalEventUnlocked({
				root,
				projectId: PROJECT_ID,
				payload: legacyPayload,
				eventId: first.event.event_id,
				now: new Date(first.event.timestamp),
			});
			rewriteArtifactSessionId(first.artifactPath, legacyId);
			rebuildExternalImportProjection({
				root,
				projectId: PROJECT_ID,
				db,
			});

			const retry = await confirmExternalImport({
				root,
				provider: "codex",
				source: { provider: "codex", path: source, projectId: PROJECT_ID },
				projectId: PROJECT_ID,
				db,
			});
			expect(retry.duplicate).toBe(true);
			expect(retry.preview.sessionRecords[0]?.external_session_id).toBe(
				legacyId,
			);
			expect(retry.preview.links[0]?.external_session_id).toBe(legacyId);
			expect(readImportJournal(root, PROJECT_ID)).toHaveLength(1);
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("recreates a missing artifact from the canonical import event", async () => {
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
			removeEvolutionTestRoot(first.artifactPath);
			const retry = await confirmExternalImport({
				root,
				provider: "codex",
				source: { provider: "codex", path: source, projectId: PROJECT_ID },
				projectId: PROJECT_ID,
				db,
			});
			expect(retry.duplicate).toBe(true);
			expect(retry.preview.sessionRecords).toEqual(
				first.preview.sessionRecords,
			);
			expect(existsSync(join(first.artifactPath, "manifest.json"))).toBe(true);
			expect(readImportJournal(root, PROJECT_ID)).toHaveLength(1);
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("reuses persisted canonical links when local link evidence drifts", async () => {
		const { root, source } = fixture();
		mkdirSync(join(root, ".afol"), { recursive: true });
		writeFileSync(
			join(root, ".afol", "config.json"),
			JSON.stringify({
				schema_version: 1,
				project: { id: PROJECT_ID, timezone: "UTC", name: "test" },
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
		writeFileSync(join(root, "tracked.txt"), "fixture\n");
		spawnSync("git", ["init", "-q"], { cwd: root });
		spawnSync("git", ["config", "user.email", "test@example.invalid"], {
			cwd: root,
		});
		spawnSync("git", ["config", "user.name", "AFOL Test"], { cwd: root });
		spawnSync("git", ["add", "tracked.txt"], { cwd: root });
		spawnSync("git", ["commit", "-qm", "fixture"], { cwd: root });
		const commit = spawnSync("git", ["rev-parse", "HEAD"], {
			cwd: root,
			encoding: "utf8",
		}).stdout.trim();
		writeFileSync(
			source,
			`${JSON.stringify({
				session_id: "provider-session-1",
				role: "user",
				content: "linked import",
				project_id: PROJECT_ID,
				afol_session_id: "session-1",
				commit_sha: commit,
			})}\n`,
		);
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			const first = await confirmExternalImport({
				root,
				provider: "codex",
				source: { provider: "codex", path: source, projectId: PROJECT_ID },
				projectId: PROJECT_ID,
				db,
			});
			expect(first.preview.links[0]?.link_state).toBe("pending");
			const persistedLinks = readFileSync(
				join(first.artifactPath, "links.jsonl"),
				"utf8",
			);

			mkdirSync(join(root, ".afol", "wb", "session-1"), {
				recursive: true,
			});
			const reevaluated = await previewExternalImport(root, "codex", {
				provider: "codex",
				path: source,
				projectId: PROJECT_ID,
			});
			expect(reevaluated.links[0]?.link_state).toBe("auto_verified");

			const retry = await confirmExternalImport({
				root,
				provider: "codex",
				source: { provider: "codex", path: source, projectId: PROJECT_ID },
				projectId: PROJECT_ID,
				db,
			});
			expect(retry.duplicate).toBe(true);
			expect(retry.preview.links).toEqual(first.preview.links);
			expect(
				readFileSync(join(first.artifactPath, "links.jsonl"), "utf8"),
			).toBe(persistedLinks);
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
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
			removeEvolutionTestRoot(root);
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
			removeEvolutionTestRoot(root);
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
			removeEvolutionTestRoot(root);
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
			const providerSessionId =
				first.preview.sessionRecords[0]?.provider_session_id;
			if (!providerSessionId) throw new Error("missing provider session");
			const legacyId = `EXT-${createHash("sha256")
				.update(`codex:${providerSessionId}`)
				.digest("hex")
				.slice(0, 32)}`;
			rewriteArtifactSessionId(first.artifactPath, legacyId);
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
			expect(retry.preview.sessionRecords[0]?.external_session_id).toBe(
				legacyId,
			);
			expect(retry.duplicate).toBe(false);
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("reuses a legacy unscoped orphan artifact after a crash before journal append", async () => {
		const { root, source } = fixture();
		writeFileSync(
			source,
			`${JSON.stringify({ role: "user", content: "unscoped legacy import" })}\n`,
		);
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
			expect(first.preview.sessionRecords[0]?.provider_session_id).toBe(
				"unscoped",
			);
			const legacyId = `EXT-${createHash("sha256")
				.update(`codex:unscoped:${first.preview.contentDigest}`)
				.digest("hex")
				.slice(0, 32)}`;
			rewriteArtifactSessionId(first.artifactPath, legacyId);

			const retry = await confirmExternalImport({
				root,
				provider: "codex",
				source: { provider: "codex", path: source, projectId: PROJECT_ID },
				projectId: PROJECT_ID,
				db,
			});
			expect(retry.duplicate).toBe(false);
			expect(retry.preview.sessionRecords[0]?.external_session_id).toBe(
				legacyId,
			);
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
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
			removeEvolutionTestRoot(root);
		}
	});

	test("rejects an orphan artifact with missing, extra, or altered files", async () => {
		for (const mutation of ["missing", "extra", "altered", "links"] as const) {
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
				if (mutation === "links")
					writeFileSync(
						join(first.artifactPath, "links.jsonl"),
						`${JSON.stringify({
							...first.preview.links[0],
							link_state: "auto_verified",
							confidence: 1,
							confirmation_required: false,
							eligible_for_learning: true,
						})}\n`,
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
				removeEvolutionTestRoot(root);
			}
		}
	});
});
