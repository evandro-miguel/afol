import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	existsSync,
	linkSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	renameSync,
	symlinkSync,
	writeFileSync,
	writeSync,
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
import { observationJournalPath } from "../services/evolution";
import { verifyArtifactReference } from "../services/evolution/artifact-inspection";
import { evolutionDbPath } from "../services/evolution/db";
import { resolveProjectPaths } from "../services/project/paths";
import {
	doneTask,
	newWorkstream,
	startTask,
} from "../services/workbench/lifecycle";
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
	test("verified source copy refuses raw-byte substitution that lossy UTF-8 decoding would conceal", () => {
		const root = fixtureRoot();
		try {
			mkdirSync(join(root, "tmp"));
			const confirmed = Buffer.from(
				"# Confirmed replacement character: \uFFFD\n",
			);
			const changed = Buffer.concat([
				Buffer.from("# Confirmed replacement character: "),
				Buffer.from([0xff, 0x0a]),
			]);
			expect(changed.toString("utf8")).toBe(confirmed.toString("utf8"));
			const confirmedDigest = createHash("sha256")
				.update(confirmed)
				.digest("hex");
			expect(createHash("sha256").update(changed).digest("hex")).not.toBe(
				confirmedDigest,
			);
			writeFileSync(join(root, "tmp/report.md"), changed);
			const before = listFilesRecursive(root);
			expect(() =>
				saveArtifact({
					root,
					kind: "report",
					file: "tmp/report.md",
					expectedSourceDigest: confirmedDigest,
					record: "R-confirmed",
					requestId: "confirmed-copy",
				}),
			).toThrow("source digest does not match");
			expect(listFilesRecursive(root)).toEqual(before);
			expect(readFileSync(join(root, "tmp/report.md"))).toEqual(changed);
			expect(() =>
				saveArtifact({
					root,
					kind: "report",
					file: "tmp/report.md",
					expectedSourceDigest: createHash("sha256")
						.update(changed)
						.digest("hex"),
					record: "R-confirmed",
					requestId: "confirmed-copy",
				}),
			).toThrow("valid UTF-8");
			expect(listFilesRecursive(root)).toEqual(before);
			writeFileSync(join(root, "tmp/report.md"), confirmed);
			const valid = saveArtifact({
				root,
				kind: "report",
				file: "tmp/report.md",
				expectedSourceDigest: confirmedDigest,
				record: "R-confirmed",
				requestId: "confirmed-copy",
			});
			expect(valid.source?.content_digest).toBe(confirmedDigest);
			expect(
				readFileSync(join(root, valid.path)).subarray(-confirmed.length),
			).toEqual(confirmed);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});
	test("structured work references an earlier standalone record without retroactive completion evidence", () => {
		const root = fixtureRoot();
		try {
			const record = saveArtifact({
				root,
				kind: "research",
				text: "Earlier research says passed; this is not observed verification.",
				record: "R-earlier",
			});
			const original = readFileSync(join(root, record.path));
			const reference = `${record.path} sha256=${record.content_digest}`;
			const stream = newWorkstream(root, "follow-up research", {
				intent: `Continue from ${reference}`,
				task: "Verify the earlier research",
			});
			expect(readFileSync(stream.planPath, "utf8")).toContain(reference);
			expect(readFileSync(stream.evidencePath, "utf8")).toBe("");
			startTask(root, { session: stream.session, taskId: "T-01" });
			expect(() =>
				doneTask(root, { session: stream.session, taskId: "T-01" }),
			).toThrow();
			expect(readFileSync(stream.evidencePath, "utf8")).toBe("");
			expect(readFileSync(stream.taskPath, "utf8")).toContain(
				"| T-01 | in_progress |",
			);
			expect(readFileSync(join(root, record.path))).toEqual(original);
			expect(existsSync(observationJournalPath(root))).toBe(false);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("CLI verified source copy returns truthful index state and rejects source drift without another artifact", async () => {
		const root = fixtureRoot();
		try {
			mkdirSync(join(root, "tmp"));
			const source = "Confirmed CLI source.\n";
			writeFileSync(join(root, "tmp/report.md"), source);
			const args = [
				"--kind",
				"report",
				"--file",
				"tmp/report.md",
				"--source-digest",
				createHash("sha256").update(source).digest("hex"),
				"--record",
				"R-cli-copy",
				"--request-id",
				"cli-copy",
				"--json",
			];
			const output = capture();
			expect(
				await runArtifactCommand(
					"save",
					args,
					root,
					output.io,
					agentOperationContext(),
				),
			).toBe(0);
			const receipt = JSON.parse(output.stdout[0] ?? "{}").data;
			expect(receipt.persisted).toBe(true);
			expect(receipt.index.status).toBe("not_requested");
			expect(receipt.source.preserved).toBe(true);
			expect(receipt.source.path).toBe("tmp/report.md");
			const saved = readFileSync(join(root, receipt.path));
			writeFileSync(
				join(root, "tmp/report.md"),
				"Changed by another writer.\n",
			);
			const refused = capture();
			expect(
				await runArtifactCommand(
					"save",
					args,
					root,
					refused.io,
					agentOperationContext(),
				),
			).toBe(2);
			expect(JSON.parse(refused.stdout[0] ?? "{}").error.code).toBe(
				"source-changed",
			);
			expect(readFileSync(join(root, receipt.path))).toEqual(saved);
			expect(readdirSync(join(root, ".afol/records/R-cli-copy"))).toHaveLength(
				1,
			);
			expect(readFileSync(join(root, "tmp/report.md"), "utf8")).toBe(
				"Changed by another writer.\n",
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});
	test("closed and archived reviews preserve original lifecycle files and closure", () => {
		const root = fixtureRoot();
		try {
			const directory = putSessionTask(root, "S-review", "closed");
			const taskPath = join(directory, "S-review_task_01.md");
			writeFileSync(
				taskPath,
				readFileSync(taskPath, "utf8").replace(
					'status: "closed"',
					'status: "closed"\nclosed_at: "2026-09-26T12:00:00.000Z"',
				),
			);
			const report =
				"# Original closed report\n\nClosure evidence is unchanged.\n";
			writeFileSync(join(directory, "S-review_report_1.md"), report);
			const task = readFileSync(taskPath);
			const supplemental = saveArtifact({
				root,
				kind: "report",
				text: "A later independent review.",
				session: "S-review",
			});
			expect(supplemental.path).toContain("S-review/artifacts/");
			expect(readFileSync(taskPath)).toEqual(task);
			expect(
				readFileSync(join(directory, "S-review_report_1.md"), "utf8"),
			).toBe(report);
			mkdirSync(join(root, ".afol/wb/_archive"));
			const archive = join(root, ".afol/wb/_archive/S-review");
			renameSync(directory, archive);
			const before = listFilesRecursive(archive).map((path) => ({
				path,
				bytes: readFileSync(path),
			}));
			expect(() =>
				saveArtifact({
					root,
					kind: "report",
					text: "Forbidden archive edit.",
					session: "S-review",
				}),
			).toThrow();
			const related = saveArtifact({
				root,
				kind: "report",
				file: ".afol/wb/_archive/S-review/S-review_report_1.md",
				expectedSourceDigest: createHash("sha256").update(report).digest("hex"),
				record: "R-archive-review",
				requestId: "archive-review",
			});
			expect(related.owner).toEqual({ kind: "record", id: "R-archive-review" });
			expect(related.source?.path).toContain("_archive/S-review/");
			for (const { path, bytes } of before)
				expect(readFileSync(path)).toEqual(bytes);
			expect(listFilesRecursive(archive)).toEqual(
				before.map((item) => item.path),
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});
	test("verified source copies require matching digest, explicit owner and stable request before writing", () => {
		const root = fixtureRoot();
		try {
			mkdirSync(join(root, "tmp"));
			writeFileSync(join(root, "tmp/report.md"), "Confirmed source report.\n");
			putSessionTask(root, "S-source");
			const digest = createHash("sha256")
				.update("Confirmed source report.\n")
				.digest("hex");
			const before = listFilesRecursive(root);
			for (const overrides of [
				{ expectedSourceDigest: "0".repeat(64) },
				{ session: undefined },
				{ requestId: undefined },
			]) {
				expect(() =>
					saveArtifact({
						root,
						kind: "report",
						file: "tmp/report.md",
						session: "S-source",
						requestId: "confirmed-copy",
						expectedSourceDigest: digest,
						...overrides,
					} as never),
				).toThrow();
				expect(listFilesRecursive(root)).toEqual(before);
			}
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("verified source copy preserves original bytes, links digest and owner, and retries without duplicates", () => {
		const root = fixtureRoot();
		try {
			const sessionDir = putSessionTask(root, "S-source");
			const task = readFileSync(join(sessionDir, "S-source_task_01.md"));
			mkdirSync(join(root, "tmp"));
			const source = Buffer.from("# Confirmed report\n\nUTF-8: ação 🧭\r\n");
			writeFileSync(join(root, "tmp/report.md"), source);
			const digest = createHash("sha256").update(source).digest("hex");
			const input = {
				root,
				kind: "report",
				file: "tmp/report.md",
				session: "S-source",
				requestId: "confirmed-copy",
				expectedSourceDigest: digest,
			};
			const first = saveArtifact(input);
			const retry = saveArtifact(input);
			expect(retry.duplicate).toBe(true);
			expect(retry.path).toBe(first.path);
			expect(first.source).toEqual({
				path: "tmp/report.md",
				content_digest: digest,
				preserved: true,
			});
			const destination = readFileSync(join(root, first.path));
			expect(destination.subarray(-source.length)).toEqual(source);
			expect(destination.toString("utf8")).toContain(
				`content_digest: "${digest}"`,
			);
			expect(readFileSync(join(root, "tmp/report.md"))).toEqual(source);
			expect(readFileSync(join(sessionDir, "S-source_task_01.md"))).toEqual(
				task,
			);
			expect(readdirSync(join(sessionDir, "artifacts"))).toHaveLength(1);
			expect(existsSync(evolutionDbPath(root))).toBe(false);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});
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
			expect(saved).toContain(
				"Handoff preserved without any session ceremony.",
			);

			// Zero ceremony: no session, plan, task, spec, or active-session
			// file may appear anywhere in the project, and capture never
			// touches the evolution database or journals.
			const files = listFilesRecursive(root).map((path) =>
				path.slice(root.length + 1),
			);
			const workbenchFiles = files.filter((path) =>
				path.startsWith(".afol/wb/"),
			);
			expect(workbenchFiles).toEqual([]);
			expect(files.some((path) => /_plan_|_task_/.test(path))).toBe(false);
			expect(files.some((path) => path.includes("specs"))).toBe(false);
			expect(files.some((path) => path.endsWith(".active_session"))).toBe(
				false,
			);
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
				[
					"--session",
					session,
					"--artifact",
					`${session}_report_1.md`,
					"--json",
				],
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
				[
					"--kind",
					"note",
					"--text",
					"x",
					"--session",
					"S-open",
					"--record",
					"R-1",
					"--json",
				],
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
				const standaloneReceipt = JSON.parse(standaloneOut.stdout[0] ?? "{}")
					.data as { owner: { kind: string; id: string } };
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

	test("request replay rejects a changed destination or title before publishing", () => {
		const root = fixtureRoot();
		try {
			const input = {
				root,
				kind: "note",
				text: "same body",
				record: "R-one",
				title: "First",
				requestId: "route",
			};
			saveArtifact(input);
			const before = listFilesRecursive(root);
			expect(() => saveArtifact({ ...input, record: "R-two" })).toThrow(
				"request",
			);
			expect(() => saveArtifact({ ...input, title: "Second" })).toThrow(
				"request",
			);
			expect(listFilesRecursive(root)).toEqual(before);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("replay verifies the saved artifact rather than returning a stale success", () => {
		const root = fixtureRoot();
		try {
			const input = {
				root,
				kind: "note",
				text: "original",
				requestId: "drift",
			};
			const receipt = saveArtifact(input);
			writeFileSync(join(root, receipt.path), "changed by another writer");
			expect(() => saveArtifact(input)).toThrow("integrity");
			expect(readFileSync(join(root, receipt.path), "utf8")).toBe(
				"changed by another writer",
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("final document byte and line limits refuse before any publication", () => {
		const root = fixtureRoot();
		try {
			const before = listFilesRecursive(root);
			for (const text of ["x".repeat(256 * 1024), "x\n".repeat(20_000)]) {
				expect(() =>
					saveArtifact({ root, kind: "note", text, requestId: "oversize" }),
				).toThrow("limit");
				expect(listFilesRecursive(root)).toEqual(before);
			}
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("invalid capture path configuration refuses instead of silently using default records", () => {
		const root = fixtureRoot();
		try {
			for (const value of ["../escape", "/absolute", "", 123]) {
				writeConfig(root, { records_dir: value } as Record<string, string>);
				expect(() =>
					saveArtifact({ root, kind: "note", text: "kept" }),
				).toThrow("config");
				expect(existsSync(join(root, ".afol", "records"))).toBe(false);
			}
			writeFileSync(join(root, ".afol/config.json"), "{");
			expect(() => saveArtifact({ root, kind: "note", text: "kept" })).toThrow(
				"config",
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("unsafe or corrupt request markers do not count as an absent request", () => {
		const root = fixtureRoot();
		try {
			const markerDir = join(root, ".afol/state/artifact-save-receipts");
			mkdirSync(markerDir, { recursive: true });
			const external = join(root, "external.json");
			writeFileSync(external, "{}");
			for (const [id, mode] of [
				["symlink", "symlink"],
				["hardlink", "hardlink"],
				["corrupt", "corrupt"],
			] as const) {
				const path = join(
					markerDir,
					`${createHash("sha256").update(id).digest("hex")}.json`,
				);
				if (mode === "symlink") symlinkSync(external, path);
				else if (mode === "hardlink") linkSync(external, path);
				else writeFileSync(path, "{");
				expect(() =>
					saveArtifact({ root, kind: "note", text: "kept", requestId: id }),
				).toThrow();
				expect(existsSync(join(root, ".afol/records"))).toBe(false);
			}
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("request intent recovers interruptions before and after publication without duplicates", () => {
		for (const phase of ["afterIntent", "afterPublication"] as const) {
			const root = fixtureRoot();
			try {
				const input = {
					root,
					kind: "note",
					text: "recoverable",
					requestId: "interrupted",
				};
				expect(() =>
					saveArtifact(input, {
						[phase]: () => {
							throw new Error("interrupted");
						},
					}),
				).toThrow("interrupted");
				const receipt = saveArtifact(input);
				const replay = saveArtifact(input);
				expect(replay.path).toBe(receipt.path);
				expect(replay.duplicate).toBe(true);
				expect(
					listFilesRecursive(root).filter((p) => p.endsWith(".md")),
				).toHaveLength(1);
			} finally {
				removeEvolutionTestRoot(root);
			}
		}
	});

	test("retry recovers an owned partial publication temp and preserves a mismatched temp", () => {
		for (const prefix of ["---\nschema_", "unrelated bytes"]) {
			const root = fixtureRoot();
			try {
				const input = {
					root,
					kind: "note",
					text: "partial write",
					requestId: "partial",
				};
				expect(() =>
					saveArtifact(input, {
						afterIntent: () => {
							const marker = JSON.parse(
								readFileSync(
									join(
										root,
										".afol/state/artifact-save-receipts",
										`${createHash("sha256").update("partial").digest("hex")}.json`,
									),
									"utf8",
								),
							);
							const target = join(root, marker.receipt.path);
							mkdirSync(join(target, ".."), { recursive: true });
							writeFileSync(
								join(target, "..", `.${target.split("/").at(-1)}.tmp`),
								prefix,
							);
							throw new Error("interrupted");
						},
					}),
				).toThrow("interrupted");
				if (prefix.startsWith("---")) {
					const saved = saveArtifact(input);
					expect(readFileSync(join(root, saved.path), "utf8")).toContain(
						"partial write",
					);
					expect(
						listFilesRecursive(root).filter((p) => p.endsWith(".md")),
					).toHaveLength(1);
				} else {
					expect(() => saveArtifact(input)).toThrow("integrity");
					const temp = listFilesRecursive(root).find((p) => p.endsWith(".tmp"));
					expect(readFileSync(temp as string, "utf8")).toBe(prefix);
				}
			} finally {
				removeEvolutionTestRoot(root);
			}
		}
	});

	test("a destination directory swapped for a symlink cannot publish outside the project", () => {
		const root = fixtureRoot();
		const outside = fixtureRoot();
		try {
			expect(() =>
				saveArtifact(
					{
						root,
						kind: "note",
						text: "contained",
						record: "R-race",
						requestId: "race",
					},
					{
						afterIntent: () => {
							const target = join(root, ".afol/records/R-race");
							mkdirSync(target, { recursive: true });
							renameSync(target, `${target}-moved`);
							symlinkSync(outside, target);
						},
					},
				),
			).toThrow();
			expect(
				listFilesRecursive(outside).filter((p) => p.endsWith(".md")),
			).toEqual([]);
		} finally {
			removeEvolutionTestRoot(root);
			removeEvolutionTestRoot(outside);
		}
	});

	test("empty and partial writes recover, while final marker failure reports durable pending completion", () => {
		for (const prefix of ["", "---\nschema_"]) {
			const root = fixtureRoot();
			try {
				const input = {
					root,
					kind: "note",
					text: "durable recovery",
					requestId: "write-fault",
				};
				expect(() =>
					saveArtifact(input, {
						afterTempOpen: (fd) => {
							writeSync(fd, prefix);
							throw new Error("write interrupted");
						},
					}),
				).toThrow("write interrupted");
				const receipt = saveArtifact(input, {
					beforeCompletion: () => {
						throw new Error("marker unavailable");
					},
				});
				expect(receipt.persisted).toBe(true);
				expect(receipt.request_state).toBe("prepared");
				expect(readFileSync(join(root, receipt.path), "utf8")).toContain(
					"durable recovery",
				);
				const marker = listFilesRecursive(root).find((path) =>
					path.includes("artifact-save-receipts/"),
				);
				const pending = JSON.parse(readFileSync(marker as string, "utf8"));
				expect(pending.state).toBe("prepared");
				expect(pending.receipt.persisted).toBe(false);
				const replay = saveArtifact(input);
				expect(replay.request_state).toBe("committed");
				expect(replay.duplicate).toBe(true);
				expect(
					listFilesRecursive(root).filter((p) => p.endsWith(".md")),
				).toHaveLength(1);
			} finally {
				removeEvolutionTestRoot(root);
			}
		}
	});

	test("a crash after exclusive linking recovers only the matching paired temp", () => {
		const root = fixtureRoot();
		try {
			const input = {
				root,
				kind: "note",
				text: "paired publication",
				requestId: "paired",
			};
			expect(() =>
				saveArtifact(input, {
					afterPublication: () => {
						throw new Error("interrupted");
					},
				}),
			).toThrow("interrupted");
			const final = listFilesRecursive(root).find((path) =>
				path.endsWith(".md"),
			) as string;
			const temp = join(final, "..", `.${final.split("/").at(-1)}.tmp`);
			linkSync(final, temp);
			const receipt = saveArtifact(input);
			expect(receipt.duplicate).toBe(true);
			expect(existsSync(temp)).toBe(false);
			expect(receipt.request_state).toBe("committed");
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("concurrent distinct CLI captures preserve every payload and receipt without overwrite", async () => {
		const root = fixtureRoot();
		try {
			mkdirSync(join(root, ".agents"));
			for (const name of ["lock.json", "manifest.json"])
				writeFileSync(
					join(root, ".agents", name),
					readFileSync(
						join(import.meta.dir, "../../src/project-template/.agents", name),
					),
				);
			const children = Array.from({ length: 4 }, (_, index) =>
				Bun.spawn(
					[
						process.execPath,
						join(import.meta.dir, "../main.ts"),
						"artifact",
						"save",
						"--kind",
						"research",
						"--text",
						`Research item ${index} with handoff`,
						"--record",
						"R-shared-research",
						"--request-id",
						`distinct-seed-20260930-${index}`,
						"--json",
					],
					{ cwd: root, stdout: "pipe", stderr: "pipe" },
				),
			);
			const results = await Promise.all(
				children.map(async (child) => ({
					code: await child.exited,
					output: await new Response(child.stdout).text(),
					error: await new Response(child.stderr).text(),
				})),
			);
			expect(results.filter((result) => result.code !== 0)).toEqual([]);
			const receipts = results.map((result) => JSON.parse(result.output).data);
			expect(new Set(receipts.map((receipt) => receipt.path)).size).toBe(4);
			for (const [index, receipt] of receipts.entries()) {
				expect(receipt.duplicate).toBe(false);
				const bytes = readFileSync(join(root, receipt.path));
				expect(bytes.toString("utf8")).toContain(
					`Research item ${index} with handoff`,
				);
				expect(createHash("sha256").update(bytes).digest("hex")).toBe(
					receipt.content_digest,
				);
				expect(receipt.index.status).toBe("not_requested");
			}
			expect(
				readdirSync(join(root, ".afol/records/R-shared-research")),
			).toHaveLength(4);
			expect(readdirSync(join(root, ".afol/wb"))).toEqual([".locks"]);
			expect(existsSync(evolutionDbPath(root))).toBe(false);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("concurrent real CLI saves with one request id publish one artifact", async () => {
		const root = fixtureRoot();
		try {
			mkdirSync(join(root, ".agents"), { recursive: true });
			for (const name of ["lock.json", "manifest.json"]) {
				writeFileSync(
					join(root, ".agents", name),
					readFileSync(
						join(import.meta.dir, "../../src/project-template/.agents", name),
					),
				);
			}
			const children = Array.from({ length: 4 }, () =>
				Bun.spawn(
					[
						process.execPath,
						join(import.meta.dir, "../main.ts"),
						"artifact",
						"save",
						"--kind",
						"note",
						"--text",
						"concurrent payload",
						"--request-id",
						"seed-20260930",
						"--json",
					],
					{ cwd: root, stdout: "pipe", stderr: "pipe" },
				),
			);
			const results = await Promise.all(
				children.map(async (child) => ({
					code: await child.exited,
					output: await new Response(child.stdout).text(),
					error: await new Response(child.stderr).text(),
				})),
			);
			expect(results.filter((r) => r.code !== 0)).toEqual([]);
			const receipts = results.map(
				(r) =>
					JSON.parse(r.output).data as { path: string; duplicate: boolean },
			);
			expect(new Set(receipts.map((r) => r.path)).size).toBe(1);
			expect(receipts.filter((r) => !r.duplicate)).toHaveLength(1);
			expect(
				listFilesRecursive(root).filter((p) => p.endsWith(".md")),
			).toHaveLength(1);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});
});
