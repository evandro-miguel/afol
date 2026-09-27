import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runArtifactCommand } from "../commands/artifact";
import { runEvolveCommand } from "../commands/evolve";
import type { CommandIo } from "../commands/io";
import { agentOperationContext } from "../core/operation-context";
import {
	enumerateOwnerDirectory,
	readArtifactPage,
	resolveRecordDirectory,
} from "../services/artifacts/inventory";
import { saveArtifact } from "../services/artifacts/storage";
import type { ArtifactReferenceV2 } from "../services/artifacts/types";
import { evolutionDbPath } from "../services/evolution/db";
import { verifyArtifactReference } from "../services/evolution/artifact-inspection";
import { observationJournalPath } from "../services/evolution";
import { resolveProjectPaths } from "../services/project/paths";
import { removeEvolutionTestRoot } from "./evolution-test-support";

const PROJECT_ID = "5f2d8c1e-9a44-4d7a-8f21-64c0f0a11c77";

function writeConfig(
	root: string,
	extraPaths: Record<string, string> = {},
): void {
	writeFileSync(
		join(root, ".afol", "config.json"),
		JSON.stringify({
			schema_version: 1,
			project: {
				id: PROJECT_ID,
				name: "artifact-storage",
				timezone: "UTC",
			},
			paths: {
				wb_dir: ".afol/wb",
				agents_dir: ".agents",
				library_dir: ".afol/library",
				...extraPaths,
			},
		}),
	);
}

function fixtureRoot(extraPaths: Record<string, string> = {}): string {
	const root = mkdtempSync(join(tmpdir(), "artifact-storage-"));
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	writeConfig(root, extraPaths);
	return root;
}

function putSessionTask(
	root: string,
	session: string,
	status = "open",
): string {
	const sessionDir = join(root, ".afol", "wb", session);
	mkdirSync(sessionDir, { recursive: true });
	writeFileSync(
		join(sessionDir, `${session}_task_01.md`),
		`---\ndoc_type: "workbench_task"\nid: "${session}_task_01"\nsession_id: "${session}"\nstatus: "${status}"\ncreated_at: "2026-09-26T12:00:00.000Z"\nupdated_at: "2026-09-26T12:00:00.000Z"\n---\n\n## State Board\n\n| Task | State | Owner | Notes |\n| --- | --- | --- | --- |\n| T-01 | ${status === "open" ? "in_progress" : "done"} | agent | note |\n`,
	);
	return sessionDir;
}

function listFilesRecursive(root: string, dir = root): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...listFilesRecursive(root, path));
		else out.push(path);
	}
	return out;
}

function capture(): { stdout: string[]; stderr: string[]; io: CommandIo } {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		stdout,
		stderr,
		io: {
			stdout: (message) => stdout.push(message),
			stderr: (message) => stderr.push(message),
		},
	};
}

describe("artifact save and standalone record access", () => {
	test("save without a session creates one durable artifact and no plan, task, spec, session, or evolution state", async () => {
		const root = fixtureRoot();
		try {
			const out = capture();
			const exitCode = await runArtifactCommand(
				"save",
				[
					"--kind",
					"handoff",
					"--text",
					"Handoff preserved without any session ceremony.",
					"--json",
				],
				root,
				out.io,
				agentOperationContext(),
			);
			expect(exitCode).toBe(0);
			const receipt = JSON.parse(out.stdout[0] ?? "{}").data as {
				persisted: boolean;
				duplicate: boolean;
				owner: { kind: string; id: string };
				path: string;
				content_digest: string;
			};
			expect(receipt.persisted).toBe(true);
			expect(receipt.duplicate).toBe(false);
			expect(receipt.owner.kind).toBe("record");
			expect(receipt.path.startsWith(".afol/records/")).toBe(true);

			const savedPath = join(root, receipt.path);
			expect(existsSync(savedPath)).toBe(true);
			const saved = readFileSync(savedPath, "utf8");
			expect(saved).toContain('doc_type: "work_artifact"');
			expect(saved).toContain(`kind: "handoff"`);
			expect(saved).toContain("Handoff preserved without any session ceremony.");

			// Zero ceremony: no session, plan, task, spec, or active-session
			// file may appear anywhere in the project, and capture never
			// touches the evolution database or journals.
			const files = listFilesRecursive(root).map((path) =>
				path.slice(root.length + 1),
			);
			const workbenchFiles = files.filter((path) => path.startsWith(".afol/wb/"));
			expect(workbenchFiles).toEqual([]);
			expect(files.some((path) => /_plan_|_task_/.test(path))).toBe(false);
			expect(files.some((path) => path.includes("specs"))).toBe(false);
			expect(
				files.some((path) => path.endsWith(".active_session")),
			).toBe(false);
			expect(existsSync(evolutionDbPath(root))).toBe(false);
			expect(existsSync(observationJournalPath(root))).toBe(false);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("direct read works with the evolution database absent, for sessions and standalone records", async () => {
		const root = fixtureRoot();
		try {
			const session = "S-read";
			const marker = "RECORD-MARKER-PAST-THE-EXCERPT-BOUNDARY";
			const filler = "x".repeat(1024);
			const sessionDir = putSessionTask(root, session);
			writeFileSync(
				join(sessionDir, `${session}_report_1.md`),
				`${filler}\n${marker}\n${filler}\n`,
			);
			const saved = saveArtifact({
				root,
				kind: "research",
				text: `${filler}\n${marker}\n${filler}\n`,
			});
			expect(saved.persisted).toBe(true);
			expect(existsSync(evolutionDbPath(root))).toBe(false);

			// Session directed read through the real CLI surface.
			const out = capture();
			const exitCode = await runEvolveCommand(
				"artifacts",
				["--session", session, "--artifact", `${session}_report_1.md`, "--json"],
				root,
				out.io,
				agentOperationContext(),
			);
			expect(exitCode).toBe(0);
			const payload = JSON.parse(out.stdout[0] ?? "{}").data as {
				items: Array<{
					artifacts: Array<{
						page?: { content: string; has_more: boolean };
					}>;
				}>;
			};
			const artifact = payload.items[0]?.artifacts[0];
			expect(artifact?.page?.content).toContain(marker);
			expect(existsSync(evolutionDbPath(root))).toBe(false);

			// Standalone record read through the shared inventory, and the
			// emitted v2 reference must verify without the database.
			const recordId = saved.owner.id;
			const recordDir = resolveRecordDirectory(root, recordId).recordDir;
			const enumeration = enumerateOwnerDirectory({ dir: recordDir });
			const fileName = enumeration.files[0]?.name;
			expect(fileName).toBeDefined();
			const page = readArtifactPage({
				root,
				ownerDir: recordDir,
				relativePath: fileName as string,
				label: "standalone record artifact",
			});
			expect(page.page.content).toContain(marker);
			expect(page.page.coverage).toBe("complete");
			const reference: ArtifactReferenceV2 = {
				schema_version: 2,
				owner: { kind: "record", id: recordId },
				relative_path: fileName as string,
				content_digest: page.rawDigest,
				digest_scope: "range",
				anchor: page.anchor,
				source_identity_digest: page.sourceIdentityDigest,
			};
			verifyArtifactReference(root, reference);
			expect(() =>
				verifyArtifactReference(root, {
					...reference,
					content_digest: "0".repeat(64),
				}),
			).toThrow("source changed");
			expect(existsSync(evolutionDbPath(root))).toBe(false);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("routing: explicit selectors win, incompatible selectors and invalid ids refuse before any write", async () => {
		const root = fixtureRoot();
		try {
			putSessionTask(root, "S-open");
			const before = listFilesRecursive(root).length;

			const out = capture();
			const incompatible = await runArtifactCommand(
				"save",
				["--kind", "note", "--text", "x", "--session", "S-open", "--record", "R-1", "--json"],
				root,
				out.io,
				agentOperationContext(),
			);
			expect(incompatible).toBe(2);
			const invalidSession = await runArtifactCommand(
				"save",
				["--kind", "note", "--text", "x", "--session", "S-missing", "--json"],
				root,
				out.io,
				agentOperationContext(),
			);
			expect(invalidSession).toBe(2);
			expect(listFilesRecursive(root).length).toBe(before);

			// An explicitly inherited AFOL_SESSION routes to that session.
			process.env.AFOL_SESSION = "S-open";
			try {
				const envOut = capture();
				const envExit = await runArtifactCommand(
					"save",
					["--kind", "note", "--text", "belongs to the env session", "--json"],
					root,
					envOut.io,
					agentOperationContext(),
				);
				expect(envExit).toBe(0);
				const envReceipt = JSON.parse(envOut.stdout[0] ?? "{}").data as {
					owner: { kind: string; id: string };
				};
				expect(envReceipt.owner).toEqual({ kind: "session", id: "S-open" });

				// --standalone ignores the implicit association; the global or
				// merely open session is never chosen for a standalone save.
				const standaloneOut = capture();
				const standaloneExit = await runArtifactCommand(
					"save",
					["--kind", "note", "--text", "independent", "--standalone", "--json"],
					root,
					standaloneOut.io,
					agentOperationContext(),
				);
				expect(standaloneExit).toBe(0);
				const standaloneReceipt = JSON.parse(
					standaloneOut.stdout[0] ?? "{}",
				).data as { owner: { kind: string; id: string } };
				expect(standaloneReceipt.owner.kind).toBe("record");
				expect(standaloneReceipt.owner.id).not.toBe("S-open");
			} finally {
				delete process.env.AFOL_SESSION;
			}

			// Without any selector or association, a new record is started even
			// though S-open exists and is open.
			const plainOut = capture();
			const plainExit = await runArtifactCommand(
				"save",
				["--kind", "note", "--text", "unattached", "--json"],
				root,
				plainOut.io,
				agentOperationContext(),
			);
			expect(plainExit).toBe(0);
			const plainReceipt = JSON.parse(plainOut.stdout[0] ?? "{}").data as {
				owner: { kind: string };
			};
			expect(plainReceipt.owner.kind).toBe("record");
		} finally {
			delete process.env.AFOL_SESSION;
			removeEvolutionTestRoot(root);
		}
	});

	test("request-id replays the same receipt and conflicts on a different payload without a second write", async () => {
		const root = fixtureRoot();
		try {
			const first = saveArtifact({
				root,
				kind: "report",
				text: "identical payload",
				requestId: "req-1",
			});
			expect(first.duplicate).toBe(false);
			const replay = saveArtifact({
				root,
				kind: "report",
				text: "identical payload",
				requestId: "req-1",
			});
			expect(replay.duplicate).toBe(true);
			expect(replay.artifact_id).toBe(first.artifact_id);
			expect(replay.path).toBe(first.path);

			const recordDir = resolveRecordDirectory(root, first.owner.id).recordDir;
			const filesBefore = readdirSync(recordDir).length;
			expect(() =>
				saveArtifact({
					root,
					kind: "report",
					text: "different payload",
					requestId: "req-1",
				}),
			).toThrow("different artifact payload");
			expect(readdirSync(recordDir).length).toBe(filesBefore);

			// Independent saves never overwrite: each publishes its own file.
			const second = saveArtifact({
				root,
				kind: "report",
				text: "independent work with the same text",
			});
			expect(second.path).not.toBe(first.path);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("records_dir is honored from the existing path configuration", () => {
		const root = fixtureRoot({ records_dir: ".afol/kept/records" });
		try {
			const saved = saveArtifact({
				root,
				kind: "note",
				text: "custom records root",
			});
			expect(saved.path.startsWith(".afol/kept/records/")).toBe(true);
			expect(existsSync(join(root, saved.path))).toBe(true);
			expect(resolveProjectPaths(root).recordsDir).toBe(".afol/kept/records");
		} finally {
			removeEvolutionTestRoot(root);
		}
	});
});
