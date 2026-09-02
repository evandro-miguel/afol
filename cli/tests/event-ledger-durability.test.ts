import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import {
	closeSync,
	existsSync,
	linkSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
	writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runLocalStateCommand } from "../commands/local-state";
import { runTelemetryCommand } from "../commands/telemetry";
import {
	appendEventLedgerRecord,
	appendEventLedgerRecords,
	appendValidatedEventLedgerRecords,
	EVENT_LEDGER_LIMITS,
	EventLedgerValidationError,
	inspectEventLedgerText,
	readEventLedgerRecords,
	readEventLedgerRecordsMatching,
	validateEventLedger,
} from "../services/events/ledger";
import { appendTelemetryEvent } from "../services/events/telemetry";
import { checkAreaHealth } from "../services/health/checker";
import { rebuildWorkBenchIndex } from "../services/local-state/workbench-index";
import { validateProjectStructure } from "../services/project/validate";
import {
	closeSession,
	completeObservedTask,
	newWorkstream,
	startTask,
} from "../services/workbench/lifecycle";
import { symlinkTestSupport } from "./symlink-test-support";

function configureRoot(label: string): string {
	const root = mkdtempSync(join(tmpdir(), `afol-event-ledger-${label}-`));
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	mkdirSync(join(root, ".afol", "data", "events"), { recursive: true });
	mkdirSync(join(root, ".afol", "data", "index"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "config.json"),
		`${JSON.stringify({
			schema_version: 1,
			paths: {
				agents_dir: ".agents",
				mutable_dir: ".afol",
				adm_dir: ".afol/adm",
				rules_dir: ".afol/adm/rules",
				hooks_dir: ".afol/adm/hooks",
				skills_dir: ".agents/skills",
				wb_dir: ".afol/wb",
				active_session_file: ".afol/wb/.active_session",
				data_dir: ".afol/data",
				data_index_dir: ".afol/data/index",
				events_file: ".afol/data/events/events.jsonl",
				mutations_dir: ".afol/data/mutations",
				docs_dir: "docs",
			},
		})}\n`,
		"utf8",
	);
	return root;
}

function eventPath(root: string): string {
	return join(root, ".afol", "data", "events", "events.jsonl");
}

function canonicalWorkbenchRecord(id: string): Record<string, unknown> {
	return {
		id,
		type: "workbench.new",
		ts: "2026-07-26T20:00:00.000Z",
		source: "cli-workbench",
		session: "S-01",
	};
}

function canonicalTelemetryRecord(
	id: string,
	session: string,
): Record<string, unknown> {
	return {
		id,
		event_type: "task_complete",
		ts: "2026-07-26T20:00:00.000Z",
		source: "afol-cli",
		schema_version: "1",
		session_id: session,
	};
}

function waitForExit(
	proc: ReturnType<typeof spawn>,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		let stdout = "";
		let stderr = "";
		proc.stdout?.setEncoding("utf8");
		proc.stderr?.setEncoding("utf8");
		proc.stdout?.on("data", (chunk: string) => {
			stdout += chunk;
		});
		proc.stderr?.on("data", (chunk: string) => {
			stderr += chunk;
		});
		proc.once("error", reject);
		proc.once("close", (code) => resolve({ code, stdout, stderr }));
	});
}

async function waitForFile(path: string): Promise<void> {
	const deadline = Date.now() + 3_000;
	while (!existsSync(path)) {
		if (Date.now() >= deadline) throw new Error("timed out waiting for marker");
		await Bun.sleep(10);
	}
}

describe("shared event ledger durability", () => {
	test("validates the full ledger while collecting only matching records", () => {
		const root = configureRoot("filtered-read");
		try {
			const lines = Array.from({ length: 5_000 }, (_, index) =>
				JSON.stringify(canonicalWorkbenchRecord(`WB-${index}`)),
			);
			lines.splice(
				2_500,
				0,
				JSON.stringify(canonicalTelemetryRecord("TEL-TARGET", "S-TARGET")),
			);
			writeFileSync(eventPath(root), `${lines.join("\n")}\n`, "utf8");

			const records = readEventLedgerRecordsMatching(
				root,
				(record) => record.session_id === "S-TARGET",
				{ maxBytes: 1_024, maxLines: 2, maxCandidates: 2 },
			);

			expect(records.map((record) => record.id)).toEqual(["TEL-TARGET"]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("filtered reads remain fail-closed for invalid trailing records", () => {
		const root = configureRoot("filtered-invalid-tail");
		try {
			writeFileSync(
				eventPath(root),
				`${JSON.stringify(canonicalTelemetryRecord("TEL-TARGET", "S-TARGET"))}\n{malformed\n`,
				"utf8",
			);

			expect(() =>
				readEventLedgerRecordsMatching(
					root,
					(record) => record.session_id === "S-TARGET",
					{ maxBytes: 1_024, maxLines: 2, maxCandidates: 2 },
				),
			).toThrow(EventLedgerValidationError);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("filtered reads enforce limits on matches instead of unrelated records", () => {
		const root = configureRoot("filtered-match-limit");
		try {
			writeFileSync(
				eventPath(root),
				`${[
					canonicalTelemetryRecord("TEL-1", "S-TARGET"),
					canonicalTelemetryRecord("TEL-2", "S-TARGET"),
				]
					.map((record) => JSON.stringify(record))
					.join("\n")}\n`,
				"utf8",
			);

			expect(() =>
				readEventLedgerRecordsMatching(
					root,
					(record) => record.session_id === "S-TARGET",
					{ maxBytes: 1_024, maxLines: 1, maxCandidates: 1 },
				),
			).toThrow(/EVENT_LEDGER_LIMIT_EXCEEDED/);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("appends an ordered batch with one durability sync", () => {
		const root = configureRoot("batch-order");
		try {
			let syncCalls = 0;
			const records = [
				canonicalWorkbenchRecord("E-01"),
				canonicalWorkbenchRecord("E-02"),
				canonicalWorkbenchRecord("E-03"),
			];
			expect(
				appendEventLedgerRecords(root, records, {
					syncFile: () => {
						syncCalls += 1;
					},
				}),
			).toEqual(records);
			expect(syncCalls).toBe(1);
			expect(readEventLedgerRecords(root).map((record) => record.id)).toEqual([
				"E-01",
				"E-02",
				"E-03",
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rolls back the complete batch after a partial write failure", () => {
		const root = configureRoot("batch-rollback");
		try {
			const path = eventPath(root);
			const original = `${JSON.stringify(canonicalWorkbenchRecord("E-00"))}\n`;
			writeFileSync(path, original, "utf8");
			let calls = 0;
			expect(() =>
				appendEventLedgerRecords(
					root,
					[canonicalWorkbenchRecord("E-01"), canonicalWorkbenchRecord("E-02")],
					{
						writeBytes: (fd, value) => {
							calls += 1;
							if (calls === 1)
								return writeSync(fd, value, 0, Math.min(7, value.length), null);
							throw new Error("batch write failed");
						},
					},
				),
			).toThrow("batch write failed");
			expect(readFileSync(path, "utf8")).toBe(original);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("validated batch rejects a historical duplicate without mutation", () => {
		const root = configureRoot("validated-batch-duplicate");
		try {
			const path = eventPath(root);
			const original = `${JSON.stringify(canonicalWorkbenchRecord("E-01"))}\n`;
			writeFileSync(path, original, "utf8");
			expect(() =>
				appendValidatedEventLedgerRecords(root, [
					canonicalWorkbenchRecord("E-01"),
				]),
			).toThrow(/EVENT_LEDGER_DUPLICATE_ID/);
			expect(readFileSync(path, "utf8")).toBe(original);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("validated batch rejects an invalid existing ledger without mutation", () => {
		const root = configureRoot("validated-batch-invalid-existing");
		try {
			const path = eventPath(root);
			const original = `${JSON.stringify(canonicalWorkbenchRecord("E-00"))}\n{invalid\n`;
			writeFileSync(path, original, "utf8");
			expect(() =>
				appendValidatedEventLedgerRecords(root, [
					canonicalWorkbenchRecord("E-01"),
				]),
			).toThrow(/EVENT_LEDGER_MALFORMED_JSON/);
			expect(readFileSync(path, "utf8")).toBe(original);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("validated batch rejects a same-inode change after inspection", () => {
		const root = configureRoot("validated-batch-same-inode-race");
		try {
			const path = eventPath(root);
			const original = `${JSON.stringify(canonicalWorkbenchRecord("E-00"))}\n`;
			const intruder = `${JSON.stringify(canonicalWorkbenchRecord("E-X"))}\n`;
			writeFileSync(path, original, "utf8");
			expect(() =>
				appendValidatedEventLedgerRecords(
					root,
					[canonicalWorkbenchRecord("E-01")],
					{
						afterValidation: () => {
							writeFileSync(path, `${original}${intruder}`, "utf8");
						},
					},
				),
			).toThrow("event ledger target changed after validation");
			expect(readFileSync(path, "utf8")).toBe(`${original}${intruder}`);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects a pre-existing partial tail without changing its bytes", () => {
		const root = configureRoot("partial-tail");
		try {
			const path = eventPath(root);
			const original = '{"id":"partial","note":"sensitive';
			writeFileSync(path, original, "utf8");

			expect(() =>
				appendTelemetryEvent(root, {
					event_type: "task_start",
					session_id: "S-01",
					task_id: "T-01",
				}),
			).toThrow(/EVENT_LEDGER_TRUNCATED_TAIL/);
			expect(readFileSync(path, "utf8")).toBe(original);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rolls back a partial write followed by EDQUOT", () => {
		const root = configureRoot("edquot");
		try {
			const path = eventPath(root);
			const original = `${JSON.stringify(canonicalWorkbenchRecord("E-00"))}\n`;
			writeFileSync(path, original, "utf8");
			let calls = 0;
			let caught: unknown;
			try {
				appendEventLedgerRecord(
					root,
					{
						...canonicalWorkbenchRecord("E-01"),
						detail: { token: "payload-must-not-leak" },
					},
					{
						writeBytes: (fd, value) => {
							calls += 1;
							if (calls === 1)
								return writeSync(fd, value, 0, Math.min(7, value.length), null);
							throw Object.assign(new Error("quota exhausted"), {
								code: "EDQUOT",
							});
						},
					},
				);
			} catch (error) {
				caught = error;
			}
			expect(caught).toBeInstanceOf(Error);
			expect((caught as NodeJS.ErrnoException).code).toBe("EDQUOT");
			expect(String(caught)).not.toContain("payload-must-not-leak");
			expect(readFileSync(path, "utf8")).toBe(original);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rolls back an append when the durability sync fails", () => {
		const root = configureRoot("sync-failure");
		try {
			const path = eventPath(root);
			const original = `${JSON.stringify(canonicalWorkbenchRecord("E-00"))}\n`;
			writeFileSync(path, original, "utf8");
			let syncCalls = 0;
			expect(() =>
				appendEventLedgerRecord(root, canonicalWorkbenchRecord("E-01"), {
					syncFile: () => {
						syncCalls += 1;
						if (syncCalls === 1) throw new Error("sync unavailable");
					},
				}),
			).toThrow("sync unavailable");
			expect(syncCalls).toBe(2);
			expect(readFileSync(path, "utf8")).toBe(original);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("preserves primary and rollback failures without event payload", () => {
		const root = configureRoot("aggregate");
		try {
			const path = eventPath(root);
			const original = `${JSON.stringify(canonicalWorkbenchRecord("E-00"))}\n`;
			writeFileSync(path, original, "utf8");
			let caught: unknown;
			try {
				appendEventLedgerRecord(
					root,
					{
						...canonicalWorkbenchRecord("E-01"),
						detail: { token: "aggregate-secret" },
					},
					{
						writeBytes: () => {
							throw new Error("primary write failure");
						},
						truncateFile: () => {
							throw new Error("rollback truncate failure");
						},
					},
				);
			} catch (error) {
				caught = error;
			}
			expect(caught).toBeInstanceOf(AggregateError);
			const errors = (caught as AggregateError).errors as Error[];
			expect(errors.map((error) => error.message)).toEqual([
				"primary write failure",
				"rollback truncate failure",
			]);
			expect(String(caught)).not.toContain("aggregate-secret");
			expect(readFileSync(path, "utf8")).toBe(original);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("loops over byte-based short writes and rejects zero progress", () => {
		const root = configureRoot("short-writes");
		try {
			let writeCalls = 0;
			appendEventLedgerRecord(
				root,
				{
					...canonicalWorkbenchRecord("E-短"),
					detail: { note: "ação 🚀" },
				},
				{
					writeBytes: (fd, value) => {
						writeCalls += 1;
						return writeSync(fd, value, 0, Math.min(3, value.length), null);
					},
				},
			);
			expect(writeCalls).toBeGreaterThan(3);
			expect(readEventLedgerRecords(root)).toHaveLength(1);

			const before = readFileSync(eventPath(root), "utf8");
			expect(() =>
				appendEventLedgerRecord(root, canonicalWorkbenchRecord("E-zero"), {
					writeBytes: () => 0,
				}),
			).toThrow("write was incomplete");
			expect(readFileSync(eventPath(root), "utf8")).toBe(before);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects reported progress that did not change the final byte size", () => {
		const root = configureRoot("false-progress");
		try {
			expect(() =>
				appendEventLedgerRecord(root, canonicalWorkbenchRecord("E-false"), {
					writeBytes: (_fd, value) => value.byteLength,
				}),
			).toThrow("write size is inconsistent");
			expect(readFileSync(eventPath(root), "utf8")).toBe("");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("serializes Unicode and embedded newline data as one JSONL record", () => {
		const root = configureRoot("unicode");
		try {
			appendEventLedgerRecord(root, {
				...canonicalWorkbenchRecord("E-unicode"),
				detail: { note: "linha 1\nlinha 2 — ação 🚀" },
			});
			const text = readFileSync(eventPath(root), "utf8");
			expect(text.split("\n")).toHaveLength(2);
			const parsed = JSON.parse(text.trim()) as {
				detail: { note: string };
			};
			expect(parsed.detail.note).toBe("linha 1\nlinha 2 — ação 🚀");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("does not let close errors mask a primary append failure", () => {
		const root = configureRoot("close-precedence");
		try {
			let caught: unknown;
			try {
				appendEventLedgerRecord(root, canonicalWorkbenchRecord("E-close"), {
					writeBytes: () => {
						throw new Error("primary append failure");
					},
					closeFile: (fd) => {
						closeSync(fd);
						throw new Error("close failure");
					},
				});
			} catch (error) {
				caught = error;
			}
			expect((caught as Error).message).toBe("primary append failure");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("accepts documented legacy/CRLF/missing-LF records with bounded advisories", () => {
		const text = [
			"",
			JSON.stringify({
				id: "LEG-W",
				type: "workbench.new",
				session: "S-01",
			}),
			JSON.stringify({
				id: "LEG-T",
				event_type: "session_start",
				session_id: "S-01",
				source: "cli-workbench",
			}),
		].join("\r\n");
		const result = inspectEventLedgerText(text);
		expect(result.ok).toBe(true);
		expect(result.record_count).toBe(2);
		expect(result.warning_count).toBeGreaterThanOrEqual(3);
		expect(
			result.issues.some(
				(issue) => issue.code === "EVENT_LEDGER_MISSING_FINAL_NEWLINE",
			),
		).toBe(true);
	});

	test("reports missing final LF when the final valid record follows a malformed line", () => {
		const result = inspectEventLedgerText(
			`{malformed\n${JSON.stringify(canonicalWorkbenchRecord("FINAL-VALID"))}`,
		);
		expect(result).toMatchObject({
			ok: false,
			record_count: 1,
			error_count: 1,
			warning_count: 1,
			omitted_issue_count: 0,
		});
		expect(result.issues).toEqual([
			{
				code: "EVENT_LEDGER_MALFORMED_JSON",
				severity: "error",
				line: 1,
			},
			{
				code: "EVENT_LEDGER_MISSING_FINAL_NEWLINE",
				severity: "warning",
				line: 2,
			},
		]);
	});

	test("bounds malformed, non-object, duplicate, and invalid-schema findings", () => {
		const root = configureRoot("bounded-findings");
		const sensitive = "raw-secret-must-not-appear";
		try {
			const lines = [
				JSON.stringify(canonicalWorkbenchRecord("DUP")),
				JSON.stringify(canonicalWorkbenchRecord("DUP")),
				"null",
				JSON.stringify({ id: "BAD", type: "workbench.new" }),
				JSON.stringify({
					id: "BAD-2",
					event_type: "error",
					session_id: "S",
					schema_version: "2",
				}),
				JSON.stringify({
					id: "BAD-3",
					type: "workbench.close",
					session: "S",
					detail: sensitive,
				}),
				"{malformed",
			];
			writeFileSync(eventPath(root), `${lines.join("\n")}\n`, "utf8");
			const result = validateEventLedger(root);
			expect(result.ok).toBe(false);
			expect(result.error_count).toBeGreaterThanOrEqual(6);
			expect(result.issues).toHaveLength(5);
			expect(result.omitted_issue_count).toBeGreaterThan(0);
			expect(JSON.stringify(result)).not.toContain(sensitive);
			expect(
				result.issues.some(
					(issue) => issue.code === "EVENT_LEDGER_DUPLICATE_ID",
				),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("treats unknown structurally valid legacy event types as advisory", () => {
		const result = inspectEventLedgerText(
			`${JSON.stringify({ id: "LEG-X", type: "future.event", session: "S" })}\n`,
		);
		expect(result.ok).toBe(true);
		expect(result.issues).toContainEqual({
			code: "EVENT_LEDGER_UNKNOWN_EVENT_TYPE",
			severity: "warning",
			line: 1,
		});
	});

	test("requires canonical timestamps to use the strict ISO instant form", () => {
		const result = inspectEventLedgerText(
			`${JSON.stringify({
				...canonicalWorkbenchRecord("WB-DATE"),
				ts: "July 26, 2026",
			})}\n`,
		);
		expect(result.ok).toBe(false);
		expect(result.issues).toContainEqual({
			code: "EVENT_LEDGER_SCHEMA_INVALID",
			severity: "error",
			line: 1,
		});
	});

	test("reports an unknown canonical event as schema-invalid, never as a legacy advisory", () => {
		const result = inspectEventLedgerText(
			`${JSON.stringify({
				id: "TEL-X",
				event_type: "future.event",
				session_id: "S",
				schema_version: "1",
				source: "afol-cli",
				ts: "2026-07-26T20:00:00.000Z",
			})}\n`,
		);
		expect(result.ok).toBe(false);
		expect(result.issues).toContainEqual({
			code: "EVENT_LEDGER_SCHEMA_INVALID",
			severity: "error",
			line: 1,
		});
		expect(
			result.issues.some(
				(issue) => issue.code === "EVENT_LEDGER_UNKNOWN_EVENT_TYPE",
			),
		).toBe(false);
	});

	test("validation errors retain only sanitized diagnostics, never parsed records", () => {
		const sensitive = "valid-record-secret";
		const inspection = inspectEventLedgerText(
			[
				JSON.stringify({
					...canonicalWorkbenchRecord("SAFE"),
					detail: { note: sensitive },
				}),
				"{broken",
				"",
			].join("\n"),
		);
		const error = new EventLedgerValidationError(inspection);
		expect(JSON.stringify(error.validation)).not.toContain(sensitive);
		expect(error.validation).not.toHaveProperty("records");
	});

	test("allows the exact byte limit and rejects the next append without mutation", () => {
		const root = configureRoot("byte-boundary");
		try {
			const accepted = canonicalWorkbenchRecord("BYTE-OK");
			const acceptedBytes = Buffer.byteLength(
				`${JSON.stringify(accepted)}\n`,
				"utf8",
			);
			writeFileSync(
				eventPath(root),
				`${" ".repeat(EVENT_LEDGER_LIMITS.maxBytes - acceptedBytes - 1)}\n`,
				"utf8",
			);
			appendEventLedgerRecord(root, accepted);
			const atLimit = readFileSync(eventPath(root));
			expect(atLimit.byteLength).toBe(EVENT_LEDGER_LIMITS.maxBytes);

			expect(() =>
				appendEventLedgerRecord(root, canonicalWorkbenchRecord("BYTE-OVER")),
			).toThrow(/EVENT_LEDGER_LIMIT_EXCEEDED/);
			expect(readFileSync(eventPath(root))).toEqual(atLimit);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("allows exactly 100k lines and rejects the next append without mutation", () => {
		const root = configureRoot("line-boundary");
		try {
			writeFileSync(
				eventPath(root),
				"\n".repeat(EVENT_LEDGER_LIMITS.maxLines - 1),
				"utf8",
			);
			appendEventLedgerRecord(root, canonicalWorkbenchRecord("LINE-100000"));
			const atLimit = readFileSync(eventPath(root));
			expect(
				atLimit.reduce((count, byte) => count + (byte === 10 ? 1 : 0), 0),
			).toBe(EVENT_LEDGER_LIMITS.maxLines);

			expect(() =>
				appendEventLedgerRecord(root, canonicalWorkbenchRecord("LINE-OVER")),
			).toThrow(/EVENT_LEDGER_LIMIT_EXCEEDED/);
			expect(readFileSync(eventPath(root))).toEqual(atLimit);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects a batch that would cross the line limit without mutation", () => {
		const root = configureRoot("batch-line-boundary");
		try {
			writeFileSync(
				eventPath(root),
				"\n".repeat(EVENT_LEDGER_LIMITS.maxLines - 1),
				"utf8",
			);
			const before = readFileSync(eventPath(root));
			expect(() =>
				appendEventLedgerRecords(root, [
					canonicalWorkbenchRecord("LINE-100000"),
					canonicalWorkbenchRecord("LINE-OVER"),
				]),
			).toThrow(/EVENT_LEDGER_LIMIT_EXCEEDED/);
			expect(readFileSync(eventPath(root))).toEqual(before);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects symlink and hardlink event targets without changing their source", () => {
		for (const kind of ["symlink", "hardlink"] as const) {
			const root = configureRoot(`unsafe-${kind}`);
			try {
				const source = join(root, `${kind}-source.jsonl`);
				writeFileSync(source, "source-safe\n", "utf8");
				if (kind === "symlink") {
					if (!symlinkTestSupport.available) continue;
					symlinkSync(source, eventPath(root));
				} else linkSync(source, eventPath(root));
				expect(() =>
					appendEventLedgerRecord(root, canonicalWorkbenchRecord(`E-${kind}`)),
				).toThrow(/regular file|hardlinked|reparse|symbolic|symlink/i);
				expect(readFileSync(source, "utf8")).toBe("source-safe\n");
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		}
	});

	test("never truncates a pathname replacement during rollback", () => {
		if (process.platform === "win32") return;
		const root = configureRoot("pathname-swap");
		try {
			const path = eventPath(root);
			writeFileSync(
				path,
				`${JSON.stringify(canonicalWorkbenchRecord("E-0"))}\n`,
			);
			let replaced = false;
			expect(() =>
				appendEventLedgerRecord(root, canonicalWorkbenchRecord("E-1"), {
					writeBytes: (fd, value) => {
						if (!replaced) {
							replaced = true;
							unlinkSync(path);
							writeFileSync(path, "replacement\n", "utf8");
						}
						writeSync(fd, value, 0, Math.min(5, value.length), null);
						throw new Error("injected write failure");
					},
				}),
			).toThrow("append and rollback failed");
			expect(readFileSync(path, "utf8")).toBe("replacement\n");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("serializes concurrent workbench and telemetry writers across sessions", async () => {
		const root = configureRoot("cross-process");
		try {
			const workbenchModule = join(
				process.cwd(),
				"cli/services/local-state/workbench-events.ts",
			);
			const telemetryModule = join(
				process.cwd(),
				"cli/services/events/telemetry.ts",
			);
			const scripts = [
				...["S-A", "S-B"].map(
					(_session) =>
						`import {appendWorkbenchEvent as append} from ${JSON.stringify(workbenchModule)}; for(let i=0;i<20;i++) append(process.argv[1],{type:"workbench.append_log",session:process.argv[2],detail:{i}});`,
				),
				...["S-C", "S-D"].map(
					() =>
						`import {appendTelemetryEvent as append} from ${JSON.stringify(telemetryModule)}; for(let i=0;i<20;i++) append(process.argv[1],{event_type:"tool_exec",session_id:process.argv[2],task_id:"T-01"});`,
				),
			];
			const sessions = ["S-A", "S-B", "S-C", "S-D"];
			const results = await Promise.all(
				scripts.map((script, index) =>
					waitForExit(
						spawn("bun", ["-e", script, root, sessions[index] as string], {
							stdio: ["ignore", "pipe", "pipe"],
						}),
					),
				),
			);
			expect(results.map((result) => result.code)).toEqual([0, 0, 0, 0]);
			expect(results.map((result) => result.stderr)).toEqual(["", "", "", ""]);
			const validation = validateEventLedger(root);
			expect(validation.ok).toBe(true);
			expect(validation.record_count).toBe(80);
			const records = readEventLedgerRecords(root);
			expect(new Set(records.map((record) => record.id)).size).toBe(80);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("readers wait for a writer rollback window instead of observing a partial line", async () => {
		const root = configureRoot("reader-writer");
		try {
			const marker = join(root, "writer-partial.marker");
			const module = join(process.cwd(), "cli/services/events/ledger.ts");
			const writerScript = `import {writeFileSync,writeSync} from "node:fs"; import {appendEventLedgerRecord} from ${JSON.stringify(module)}; let first=true; appendEventLedgerRecord(process.argv[1],{id:"E-lock",type:"workbench.new",session:"S",source:"cli-workbench",ts:new Date().toISOString()},{writeBytes:(fd,value)=>{if(first){first=false;const n=Math.min(5,value.length);const written=writeSync(fd,value,0,n,null);writeFileSync(process.argv[2],"ready");Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,350);return written;}return writeSync(fd,value,0,value.length,null);}});`;
			const readerScript = `import {readEventLedgerRecords} from ${JSON.stringify(module)}; console.log(JSON.stringify(readEventLedgerRecords(process.argv[1]).map(row=>row.id)));`;
			const writer = spawn("bun", ["-e", writerScript, root, marker], {
				stdio: ["ignore", "pipe", "pipe"],
			});
			const writerPromise = waitForExit(writer);
			await waitForFile(marker);
			const startedAt = Date.now();
			const readerResult = await waitForExit(
				spawn("bun", ["-e", readerScript, root], {
					stdio: ["ignore", "pipe", "pipe"],
				}),
			);
			const elapsed = Date.now() - startedAt;
			const writerResult = await writerPromise;
			expect(writerResult.code).toBe(0);
			expect(readerResult.code).toBe(0);
			expect(JSON.parse(readerResult.stdout.trim())).toEqual(["E-lock"]);
			expect(elapsed).toBeGreaterThanOrEqual(150);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("telemetry command fails closed with a stable line-aware error", async () => {
		const root = configureRoot("telemetry-error");
		try {
			writeFileSync(
				eventPath(root),
				`${JSON.stringify(canonicalWorkbenchRecord("E"))}\n{secret-line\n`,
				"utf8",
			);
			const stdout: string[] = [];
			const stderr: string[] = [];
			const code = await runTelemetryCommand("query", ["--json"], root, {
				stdout: (value) => stdout.push(value),
				stderr: (value) => stderr.push(value),
			});
			expect(code).toBe(2);
			expect(stderr).toEqual([]);
			expect(stdout.join("\n")).toContain("EVENT_LEDGER_MALFORMED_JSON line=2");
			expect(stdout.join("\n")).not.toContain("secret-line");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("close fails before task/report mutation when the shared ledger is invalid", () => {
		const root = mkdtempSync(join(tmpdir(), "afol-event-ledger-close-"));
		try {
			const created = newWorkstream(root, "ledger close preflight");
			startTask(root, { session: created.session, taskId: "T-01" });
			completeObservedTask(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				exitCode: 0,
			});
			const taskBefore = readFileSync(created.taskPath, "utf8");
			writeFileSync(eventPath(root), "{invalid\n", { flag: "a" });

			expect(() => closeSession(root, created.session)).toThrow(
				/EVENT_LEDGER_MALFORMED_JSON/,
			);
			expect(readFileSync(created.taskPath, "utf8")).toBe(taskBefore);
			expect(
				existsSync(
					join(
						root,
						".afol",
						"wb",
						created.session,
						`${created.session}_report_01.md`,
					),
				),
			).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("project validation exposes a blocking bounded event-ledger check", async () => {
		const root = configureRoot("validation");
		try {
			writeFileSync(
				eventPath(root),
				'{"id":"E-01","type":"workbench.new","session":"S-01"}\nnot-json\n',
				"utf8",
			);

			const report = await validateProjectStructure(root);
			const check = report.checks.find(
				(candidate) => candidate.id === "event_ledger",
			);
			expect(check).toMatchObject({
				id: "event_ledger",
				ok: false,
			});
			expect(check?.message).toContain("EVENT_LEDGER_MALFORMED_JSON");
			expect(check?.message).not.toContain("not-json");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("workbench health exposes an invalid ledger as a blocking failure", () => {
		const root = configureRoot("health");
		try {
			writeFileSync(eventPath(root), "{broken\n", "utf8");
			const findings = checkAreaHealth(root, "wb");
			expect(findings).toContainEqual(
				expect.objectContaining({
					area: "wb",
					severity: "fail",
					message: expect.stringContaining("EVENT_LEDGER_MALFORMED_JSON"),
				}),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("workbench rebuild fails before mutating its snapshot on corruption", () => {
		const root = configureRoot("rebuild");
		try {
			const snapshotPath = join(
				root,
				".afol",
				"data",
				"index",
				"workbench.json",
			);
			const original = '{"sentinel":"unchanged"}\n';
			writeFileSync(snapshotPath, original, "utf8");
			writeFileSync(eventPath(root), '{"id":"partial"', "utf8");

			expect(() => rebuildWorkBenchIndex(root)).toThrow(
				/EVENT_LEDGER_TRUNCATED_TAIL/,
			);
			expect(existsSync(snapshotPath)).toBe(true);
			expect(readFileSync(snapshotPath, "utf8")).toBe(original);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("local-state rebuild command fails before mutating any derived index", async () => {
		const root = configureRoot("command-rebuild");
		try {
			const indexDir = join(root, ".afol", "data", "index");
			const sentinels = ["workbench", "rules", "skills", "specs", "files"];
			for (const name of sentinels)
				writeFileSync(join(indexDir, `${name}.json`), `${name}-sentinel\n`);
			writeFileSync(eventPath(root), "{partial", "utf8");
			const stdout: string[] = [];
			const stderr: string[] = [];

			const code = await runLocalStateCommand(["rebuild", "--json"], root, {
				stdout: (value) => stdout.push(value),
				stderr: (value) => stderr.push(value),
			});
			expect(code).toBe(2);
			expect(stdout).toEqual([]);
			expect(stderr.join("\n")).toContain("EVENT_LEDGER_TRUNCATED_TAIL");
			for (const name of sentinels)
				expect(readFileSync(join(indexDir, `${name}.json`), "utf8")).toBe(
					`${name}-sentinel\n`,
				);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
