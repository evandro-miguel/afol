import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	inspectEvolutionArtifacts,
	verifyArtifactReference,
} from "../services/evolution/artifact-inspection";
import { prepareAssistedProposalPreview } from "../services/evolution/assisted-proposal-packet";
import { evolutionDbPath } from "../services/evolution/db";
import { enumerateEvolutionHistorySessions } from "../services/evolution/history-sessions";
import { redactImported } from "../services/evolution/imports/redaction";
import { resolveProjectPaths } from "../services/project/paths";
import { removeEvolutionTestRoot } from "./evolution-test-support";

const PROJECT_ID = "b672e74e-f8c2-4626-bc9b-1ca590265f99";
const REPO_ROOT = resolve(import.meta.dir, "../..");

function fixtureRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "evolution-artifact-inspection-"));
	mkdirSync(join(root, ".afol", "wb", "_archive"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "config.json"),
		JSON.stringify({
			schema_version: 1,
			project: { id: PROJECT_ID, name: "fixture", timezone: "UTC" },
			paths: {
				evolution_db: ".afol/state/evolution.db",
				evolution_data_dir: ".afol/data/evolution",
				evolution_events_dir: ".afol/data/events/evolution",
			},
		}),
	);
	return root;
}

function writeSessionArtifact(
	root: string,
	session: string,
	name: string,
	content: string,
	archived = false,
): string {
	const directory = archived
		? join(root, ".afol", "wb", "_archive", session)
		: join(root, ".afol", "wb", session);
	mkdirSync(directory, { recursive: true });
	const path = join(directory, name);
	writeFileSync(path, content);
	return path;
}

function addCliProjectMetadata(root: string): void {
	const agents = join(root, ".agents");
	mkdirSync(agents, { recursive: true });
	for (const name of ["lock.json", "manifest.json"])
		writeFileSync(
			join(agents, name),
			readFileSync(join(REPO_ROOT, "src/project-template/.agents", name)),
		);
}

function runArtifactsCli(root: string, args: string[]) {
	return spawnSync(
		process.execPath,
		[join(REPO_ROOT, "cli/main.ts"), "evolve", "artifacts", ...args, "--json"],
		{
			cwd: root,
			encoding: "utf8",
			env: { ...process.env, AGENT: "1", AFOL_SESSION: "" },
		},
	);
}

describe("evolution artifact inspection", () => {
	test("whole-artifact evidence binds valid UTF-8 bytes and rejects invalid UTF-8 in v1, v2, and proposal previews", () => {
		const root = fixtureRoot();
		try {
			const session = "S-byte-evidence";
			const name = `${session}_report_1.md`;
			const path = writeSessionArtifact(root, session, name, "");
			const validBytes = Buffer.from("Evidence: \uFFFD\n", "utf8");
			writeFileSync(path, validBytes);
			const artifact = inspectEvolutionArtifacts({
				root,
				sessions: [session],
			}).items[0]?.artifacts[0];
			if (artifact?.digest_scope !== "artifact")
				throw new Error("whole-artifact reference was not emitted");
			const v1 = {
				session_id: session,
				path: artifact.path,
				anchor: artifact.anchor,
				content_digest: artifact.content_digest,
				digest_scope: artifact.digest_scope,
			};
			const v2 = {
				schema_version: 2 as const,
				owner: { kind: "session" as const, id: session },
				relative_path: name,
				anchor: artifact.anchor,
				content_digest: artifact.content_digest,
				digest_scope: "artifact" as const,
			};
			expect(artifact.digest_scope).toBe("artifact");
			expect(artifact.content_digest).toBe(
				createHash("sha256").update(validBytes).digest("hex"),
			);
			verifyArtifactReference(root, v1);
			verifyArtifactReference(root, v2);

			writeFileSync(
				path,
				Buffer.concat([
					Buffer.from("Evidence: "),
					Buffer.from([0xff]),
					Buffer.from("\n"),
				]),
			);
			expect(() =>
				inspectEvolutionArtifacts({ root, sessions: [session] }),
			).toThrow("valid UTF-8");
			expect(() => verifyArtifactReference(root, v1)).toThrow("valid UTF-8");
			expect(() => verifyArtifactReference(root, v2)).toThrow("valid UTF-8");

			mkdirSync(join(root, "docs"), { recursive: true });
			const packetPath = join(root, "proposal.json");
			writeFileSync(
				packetPath,
				JSON.stringify({
					schema_version: 1,
					kind: "code",
					observed_fact: "The supplied artifact is evidence.",
					hypothesis: "A bounded code change may help.",
					evidence_refs: [v2],
					intervention: {
						operations: [
							{
								type: "create_text",
								target: "docs/proposed.md",
								content: "Review evidence.\n",
							},
						],
					},
					alternative: "Keep current behavior.",
					validation_plan: {
						commands: ["bun test"],
						expected: "Focused validation passes.",
					},
				}),
			);
			expect(() =>
				prepareAssistedProposalPreview({ root, packetPath }),
			).toThrow("valid UTF-8");
			expect(existsSync(join(root, "docs/proposed.md"))).toBe(false);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("rejects supplied invalid artifact paths at history and CLI ingress", () => {
		for (const [key, value] of [
			["mutable_dir", "../outside"],
			["wb_dir", 42],
			["records_dir", ""],
		] as const) {
			const root = fixtureRoot();
			try {
				const configPath = join(root, ".afol/config.json");
				const config = JSON.parse(readFileSync(configPath, "utf8"));
				config.paths = { [key]: value };
				writeFileSync(configPath, JSON.stringify(config));
				mkdirSync(join(root, ".afol/wb/S-default"), { recursive: true });
				writeSessionArtifact(
					root,
					"S-default",
					"S-default_report_1.md",
					"fallback must not be read\n",
				);
				const error = `artifact configuration paths.${key} is invalid`;
				expect(() => resolveProjectPaths(root)).toThrow(error);
				expect(() => enumerateEvolutionHistorySessions(root)).toThrow(error);
				expect(() => inspectEvolutionArtifacts({ root })).toThrow(error);

				if (key === "wb_dir") {
					addCliProjectMetadata(root);
					const cli = runArtifactsCli(root, []);
					expect(cli.status).not.toBe(0);
					expect(cli.stderr).toContain(error);
				}
			} finally {
				removeEvolutionTestRoot(root);
			}
		}
	});

	test("reports live and archived owner conflicts as partial history coverage", () => {
		const root = fixtureRoot();
		try {
			for (const directory of [
				join(root, ".afol/wb/S-duplicate"),
				join(root, ".afol/wb/_archive/S-duplicate"),
			]) {
				mkdirSync(directory, { recursive: true });
				writeFileSync(join(directory, "S-duplicate_report_1.md"), "evidence\n");
			}
			const enumeration = enumerateEvolutionHistorySessions(root);
			expect(enumeration.conflicts).toEqual(["S-duplicate"]);
			const result = inspectEvolutionArtifacts({ root });
			expect(result.status).toBe("partial");
			expect(result.coverage).toBe("partial");
			expect(result.conflicts).toEqual(["S-duplicate"]);
			expect(result.items).toEqual([]);
			expect(result.page).toMatchObject({ total: 0, has_more: false });
			expect(() =>
				inspectEvolutionArtifacts({ root, sessions: ["S-duplicate"] }),
			).toThrow("missing or conflicted");

			addCliProjectMetadata(root);
			const cli = runArtifactsCli(root, []);
			expect(cli.status).toBe(0);
			const payload = JSON.parse(cli.stdout) as {
				data: {
					status: string;
					coverage: string;
					conflicts: string[];
					items: unknown[];
				};
			};
			expect(payload.data).toMatchObject({
				status: "partial",
				coverage: "partial",
				conflicts: ["S-duplicate"],
				items: [],
			});
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("includes open and archived failure artifacts without creating projection state or mutating tasks", () => {
		const root = fixtureRoot();
		try {
			const openTask = writeSessionArtifact(
				root,
				"S-open",
				"S-open_task_1.md",
				"status: in_progress\n",
			);
			writeSessionArtifact(
				root,
				"S-open",
				".evidence.jsonl",
				'{"result":"failed","provenance":"observed","command":"bun test"}\n',
			);
			writeSessionArtifact(
				root,
				"S-archived",
				"S-archived_report_1.md",
				"Archived interrupted run; the task remains open.\n",
				true,
			);
			const taskBefore = readFileSync(openTask);
			const result = inspectEvolutionArtifacts({ root });
			expect(result.items.map((item) => item.session_id)).toEqual([
				"S-archived",
				"S-open",
			]);
			expect(result.items[0]?.location).toBe("archived");
			expect(
				result.items[1]?.artifacts.some((artifact) =>
					artifact.path.endsWith(".evidence.jsonl"),
				),
			).toBe(true);
			expect(readFileSync(openTask)).toEqual(taskBefore);
			expect(result.projection_health).toEqual({
				database: "absent",
				inspected: false,
			});
			expect(existsSync(evolutionDbPath(root))).toBe(false);
			expect(existsSync(join(root, ".afol", "state"))).toBe(false);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("reports omitted files and retrieves an oversized artifact by bounded range", () => {
		const root = fixtureRoot();
		try {
			writeSessionArtifact(
				root,
				"S-large",
				"S-large_analysis_1.md",
				"analysis\n",
			);
			writeSessionArtifact(
				root,
				"S-large",
				"S-large_findings_1.md",
				"findings\n",
			);
			writeSessionArtifact(
				root,
				"S-large",
				"S-large_handoff_1.md",
				"handoff\n",
			);
			writeSessionArtifact(
				root,
				"S-large",
				"S-large_log_1.md",
				"x".repeat(300_000),
			);
			writeSessionArtifact(root, "S-large", "S-large_plan_1.md", "plan\n");
			writeSessionArtifact(root, "S-large", "S-large_report_1.md", "report\n");
			const first = inspectEvolutionArtifacts({ root, sessions: ["S-large"] });
			const firstItem = first.items[0];
			expect(firstItem?.artifact_coverage.canonical_total).toBe(6);
			expect(firstItem?.artifact_coverage.omitted).toBeGreaterThan(0);
			expect(
				firstItem?.warnings.some((warning) =>
					warning.includes("additional_canonical_artifacts"),
				),
			).toBe(true);

			const targeted = inspectEvolutionArtifacts({
				root,
				sessions: ["S-large"],
				artifacts: ["S-large_log_1.md"],
				byteOffset: 16_384,
			});
			const ref = targeted.items[0]?.artifacts[0];
			expect(ref?.digest_scope).toBe("range");
			expect(ref?.anchor).toBe("bytes:16384-24576");
			expect(ref?.source_identity_digest).toMatch(/^[a-f0-9]{64}$/);
			expect(ref?.excerpt.length).toBeLessThanOrEqual(450);
			if (ref) {
				verifyArtifactReference(root, ref);
				expect(() =>
					verifyArtifactReference(root, { ...ref, digest_scope: "artifact" }),
				).toThrow("scope does not match");
			}
			expect(existsSync(join(root, ".afol", "state"))).toBe(false);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("range evidence becomes stale when its source changes outside the excerpt", () => {
		const root = fixtureRoot();
		try {
			const original = `${"a".repeat(32_768)}${"b".repeat(32_768)}`;
			const path = writeSessionArtifact(
				root,
				"S-range",
				"S-range_log_1.md",
				original,
			);
			const result = inspectEvolutionArtifacts({
				root,
				sessions: ["S-range"],
				artifacts: ["S-range_log_1.md"],
				byteOffset: 0,
			});
			const reference = result.items[0]?.artifacts[0];
			expect(reference?.anchor).toBe("bytes:0-8192");
			if (!reference) throw new Error("range reference was not emitted");

			writeFileSync(path, `${"a".repeat(32_768)}${"c".repeat(32_768)}`);
			expect(() => verifyArtifactReference(root, reference)).toThrow(
				"source changed",
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("keeps a terminal checkpoint and only returns newly changed session metadata", () => {
		const root = fixtureRoot();
		try {
			for (const session of ["S-one", "S-two", "S-three"])
				writeSessionArtifact(
					root,
					session,
					`${session}_report_1.md`,
					`${session}\n`,
				);
			const first = inspectEvolutionArtifacts({ root, limit: 1 });
			expect(first.status).toBe("progress");
			const second = inspectEvolutionArtifacts({ root, cursor: first.cursor });
			expect(second.page.offset).toBe(1);
			const third = inspectEvolutionArtifacts({ root, cursor: second.cursor });
			expect(third.page.offset).toBe(2);
			expect(third.page.has_more).toBe(false);
			const unchanged = inspectEvolutionArtifacts({
				root,
				cursor: third.cursor,
			});
			expect(unchanged.status).toBe("complete");
			expect(unchanged.items).toHaveLength(0);

			writeSessionArtifact(
				root,
				"S-new",
				"S-new_handoff_1.md",
				"new handoff\n",
			);
			const delta = inspectEvolutionArtifacts({
				root,
				cursor: unchanged.cursor,
			});
			expect(delta.status).toBe("source_changed");
			expect(delta.items.map((item) => item.session_id)).toEqual(["S-new"]);
			expect(existsSync(join(root, ".afol", "state"))).toBe(false);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("redacts cookies, JSON credentials, standalone Basic auth, and URL credentials", () => {
		const source = [
			"Cookie: sessionid=cookie_secret; theme=dark",
			"Basic standalone_basic_secret",
			["GET https://agent", ":password_secret@example.invalid/path"].join(""),
			'{"sessionid":"json_session_secret","Cookie":"json_cookie_secret"}',
		].join("\n");
		const redacted = String(redactImported(source));
		expect(redacted).not.toContain("cookie_secret");
		expect(redacted).not.toContain("standalone_basic_secret");
		expect(redacted).not.toContain("password_secret");
		expect(redacted).not.toContain("json_session_secret");
		expect(redacted).not.toContain("json_cookie_secret");
	});
});
