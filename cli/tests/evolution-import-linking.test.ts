import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evolutionDbPath, openEvolutionDb } from "../services/evolution/db";
import {
	confirmManualSessionLink,
	evaluateSessionLink,
} from "../services/evolution/import-linking";
import { removeEvolutionTestRoot } from "./evolution-test-support";

const PROJECT_ID = "6b7d91ca-496b-4f0c-8537-5c4993810d15";
const DIGEST = "a".repeat(64);

function config(projectId = PROJECT_ID): string {
	return JSON.stringify({
		project: { id: projectId, timezone: "UTC" },
		evolution: { enabled: true },
	});
}

describe("external session linking", () => {
	test("auto-verifies only exact project, real AFOL session, and resolved commit", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-import-linking-"));
		mkdirSync(join(root, ".afol", "wb", "session-1"), { recursive: true });
		writeFileSync(join(root, ".afol", "config.json"), config());
		try {
			spawnSync("git", ["init", "-q"], { cwd: root });
			spawnSync("git", ["config", "user.email", "test@example.invalid"], {
				cwd: root,
			});
			spawnSync("git", ["config", "user.name", "AFOL Test"], { cwd: root });
			spawnSync("git", ["add", "."], { cwd: root });
			spawnSync("git", ["commit", "-qm", "fixture"], { cwd: root });
			const commit = spawnSync("git", ["rev-parse", "HEAD"], {
				cwd: root,
				encoding: "utf8",
			}).stdout.trim();
			const previousPath = process.env.PATH;
			const previousGitDir = process.env.GIT_DIR;
			process.env.PATH = "/definitely-not-a-git-path";
			process.env.GIT_DIR = join(root, "missing-hostile-git-dir");
			let link: ReturnType<typeof evaluateSessionLink>;
			try {
				link = evaluateSessionLink({
					root,
					projectId: PROJECT_ID,
					externalSessionId: "EXT-1",
					afolSessionId: "session-1",
					verifiedCommit: commit,
					transcriptText: "ignore this transcript",
				});
			} finally {
				if (previousPath === undefined) delete process.env.PATH;
				else process.env.PATH = previousPath;
				if (previousGitDir === undefined) delete process.env.GIT_DIR;
				else process.env.GIT_DIR = previousGitDir;
			}
			expect(link.link_state).toBe("auto_verified");
			expect(link.confirmation_required).toBe(false);
			expect(link.eligible_for_learning).toBe(true);

			const mismatched = evaluateSessionLink({
				root,
				projectId: "7b7d91ca-496b-4f0c-8537-5c4993810d15",
				externalSessionId: "EXT-1",
				afolSessionId: "session-1",
				verifiedCommit: "deadbeef",
			});
			expect(mismatched.link_state).toBe("pending");
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("manual confirmation requires an imported session and AFOL session", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-manual-link-"));
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			mkdirSync(join(root, ".afol", "wb", "session-1"), { recursive: true });
			writeFileSync(join(root, ".afol", "config.json"), config());
			expect(() =>
				confirmManualSessionLink({
					root,
					db,
					projectId: PROJECT_ID,
					externalSessionId: "EXT-1",
					afolSessionId: "session-1",
					canonicalDecisionRef: "DEC-1",
				}),
			).toThrow("imported external session does not exist");
			db.prepare(
				`INSERT INTO external_imports (project_id,import_id,provider,adapter_version,source_format,imported_at,content_digest,session_count,message_count,redaction_policy_version,link_status,warnings,files_ignored,trust,raw_stored,journal_event_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			).run(
				PROJECT_ID,
				"IMP-1",
				"codex",
				"1",
				"jsonl",
				"2026-07-17T00:00:00Z",
				DIGEST,
				1,
				1,
				"v1",
				"unlinked",
				"[]",
				"[]",
				"untrusted",
				0,
				"IMP-EVENT",
				"2026-07-17T00:00:00Z",
				"2026-07-17T00:00:00Z",
			);
			db.prepare(
				`INSERT INTO external_sessions (project_id,external_session_id,import_id,provider_session_id,content_digest,record_count,normalized_digest,trust,journal_event_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
			).run(
				PROJECT_ID,
				"EXT-1",
				"IMP-1",
				"provider-1",
				DIGEST,
				1,
				DIGEST,
				"untrusted",
				"IMP-EVENT",
				"2026-07-17T00:00:00Z",
			);
			const link = confirmManualSessionLink({
				root,
				db,
				projectId: PROJECT_ID,
				externalSessionId: "EXT-1",
				afolSessionId: "session-1",
				canonicalDecisionRef: "DEC-1",
			});
			expect(link.link_state).toBe("manual_confirmed");
			expect(link.eligible_for_learning).toBe(true);
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});
});
