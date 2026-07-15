import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTelemetryCommand } from "../commands/telemetry";
import { appendTelemetryEvent } from "../services/events/telemetry";

function mkRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "telemetry-command-"));
	mkdirSync(join(root, ".agents"), { recursive: true });
	writeFileSync(
		join(root, ".agents", "config.json"),
		JSON.stringify({
			schema_version: 1,
			paths: {
				agents_dir: ".agents",
				mutable_dir: ".afol",
				wb_dir: ".afol/wb",
				active_session_file: ".afol/wb/.active_session",
				data_dir: ".afol/data",
				data_index_dir: ".afol/data/index",
				events_file: ".afol/data/events/events.jsonl",
			},
		}),
		"utf8",
	);
	return root;
}

function captureIo() {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		stdout,
		stderr,
		io: {
			stdout: (message: string) => stdout.push(message),
			stderr: (message: string) => stderr.push(message),
		},
	};
}

describe("telemetry command", () => {
	test("telemetry and workbench UUID ids stay unique across processes", () => {
		const root = mkRoot();
		try {
			const script = `import { appendTelemetryEvent } from ${JSON.stringify(join(process.cwd(), "cli/services/events/telemetry.ts"))}; import { appendWorkbenchEvent } from ${JSON.stringify(join(process.cwd(), "cli/services/local-state/workbench-events.ts"))}; const root=process.argv[1]; const tel=appendTelemetryEvent(root,{event_type:"task_start",session_id:"S",task_id:"T-01"}); const wse=appendWorkbenchEvent(root,{type:"workbench.start_task",session:"S",taskId:"T-01"}); console.log(JSON.stringify([tel.id,wse.id]));`;
			const ids = Array.from({ length: 2 }, () => {
				const run = spawnSync("bun", ["-e", script, root], {
					encoding: "utf8",
				});
				expect(run.status).toBe(0);
				return JSON.parse(run.stdout.trim()) as string[];
			}).flat();
			expect(new Set(ids).size).toBe(4);
			for (const id of ids)
				expect(id).toMatch(/^(?:TEL|WSE)-\d+-[0-9a-f-]{36}$/);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
	test("query filters telemetry events", async () => {
		const root = mkRoot();
		try {
			appendTelemetryEvent(root, {
				event_type: "session_start",
				session_id: "S-1",
				cmd_type: "new",
				outcome: "success",
			});
			appendTelemetryEvent(root, {
				event_type: "task_complete",
				session_id: "S-1",
				task_id: "T-01",
				outcome: "success",
			});
			const captured = captureIo();
			const code = await runTelemetryCommand(
				"query",
				["--type", "task_complete", "--json"],
				root,
				captured.io,
			);
			expect(code).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				data: { count: number; events: Array<{ event_type: string }> };
			};
			expect(payload.data.count).toBe(1);
			expect(payload.data.events[0]?.event_type).toBe("task_complete");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("report summarizes events", async () => {
		const root = mkRoot();
		try {
			appendTelemetryEvent(root, {
				event_type: "session_start",
				session_id: "S-1",
				outcome: "success",
			});
			const captured = captureIo();
			const code = await runTelemetryCommand(
				"report",
				["--json"],
				root,
				captured.io,
			);
			expect(code).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				data: {
					total: number;
					sessions: number;
					by_type: Record<string, number>;
				};
			};
			expect(payload.data.total).toBe(1);
			expect(payload.data.sessions).toBe(1);
			expect(payload.data.by_type.session_start).toBe(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("top-level json defaults to query", async () => {
		const root = mkRoot();
		try {
			appendTelemetryEvent(root, {
				event_type: "session_start",
				session_id: "S-1",
				outcome: "success",
			});
			const captured = captureIo();
			const code = await runTelemetryCommand("--json", [], root, captured.io);
			expect(code).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				action: string;
				data: { count: number };
			};
			expect(payload.action).toBe("telemetry.query");
			expect(payload.data.count).toBe(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("query defaults to a compact event limit", async () => {
		const root = mkRoot();
		try {
			for (let index = 0; index < 12; index += 1) {
				appendTelemetryEvent(root, {
					event_type: "tool_exec",
					session_id: "S-1",
					task_id: `T-${String(index + 1).padStart(2, "0")}`,
					outcome: "success",
				});
			}

			const defaultQuery = captureIo();
			expect(
				await runTelemetryCommand("query", [], root, defaultQuery.io),
			).toBe(0);
			expect(defaultQuery.stdout[0]).toContain("telemetry query: 10 latest");

			const defaultJson = captureIo();
			expect(
				await runTelemetryCommand("query", ["--json"], root, defaultJson.io),
			).toBe(0);
			const defaultPayload = JSON.parse(defaultJson.stdout[0] ?? "{}") as {
				data: { count: number };
			};
			expect(defaultPayload.data.count).toBe(10);

			const topLevelLimit = captureIo();
			expect(
				await runTelemetryCommand("--limit", ["3"], root, topLevelLimit.io),
			).toBe(0);
			expect(topLevelLimit.stdout[0]).toContain("telemetry query: 3 latest");

			const explicitLimit = captureIo();
			expect(
				await runTelemetryCommand(
					"query",
					["--limit", "12", "--json"],
					root,
					explicitLimit.io,
				),
			).toBe(0);
			const explicitPayload = JSON.parse(explicitLimit.stdout[0] ?? "{}") as {
				data: { count: number };
			};
			expect(explicitPayload.data.count).toBe(12);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("export defaults to an envelope unless jsonl is requested", async () => {
		const root = mkRoot();
		try {
			appendTelemetryEvent(root, {
				event_type: "session_start",
				session_id: "S-1",
				outcome: "success",
			});
			const captured = captureIo();
			const code = await runTelemetryCommand("export", [], root, captured.io);
			expect(code).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				action: string;
				data: { count: number };
			};
			expect(payload.action).toBe("telemetry.export");
			expect(payload.data.count).toBe(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("json errors use the result envelope", async () => {
		const root = mkRoot();
		try {
			const captured = captureIo();
			const code = await runTelemetryCommand(
				"query",
				["--type", "bogus", "--json"],
				root,
				captured.io,
			);
			expect(code).toBe(2);
			expect(captured.stderr).toHaveLength(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				ok: boolean;
				error: { code: string; message: string };
			};
			expect(payload.ok).toBe(false);
			expect(payload.error.code).toBe("telemetry.command.error");
			expect(payload.error.message).toContain("Unknown telemetry event type");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
