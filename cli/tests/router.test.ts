import { describe, expect, test } from "bun:test";
import { DIRECT_DISPATCH_KINDS, SUBCOMMAND_DISPATCH_GROUPS } from "../main";
import { kernelRegistry } from "../registry";
import { ROUTED_SUBCOMMAND_GROUPS, resolveCommand } from "../router";

describe("router alias grammar", () => {
	test("normalizes compact workflow flags for direct commands", () => {
		expect(
			resolveCommand([
				"e",
				"-S",
				"session-1",
				"-T",
				"T-01",
				"-c",
				"bun test",
				"-o",
				"passed",
			]),
		).toEqual({
			kind: "evidence",
			args: [
				"--session",
				"session-1",
				"--task-id",
				"T-01",
				"--command",
				"bun test",
				"--result",
				"passed",
			],
		});

		expect(
			resolveCommand(["d", "-S", "session-1", "-T", "T-01", "-x", "bun test"]),
		).toEqual({
			kind: "done",
			args: [
				"--session",
				"session-1",
				"--task-id",
				"T-01",
				"--test",
				"bun test",
			],
		});
	});

	test("normalizes scoped action aliases and scope-specific short flags", () => {
		expect(
			resolveCommand(["cx", "bn", "-S", "session-1", "-T", "T-01"]),
		).toEqual({
			kind: "subcommand",
			group: "ctx",
			action: "bundle",
			args: ["--session", "session-1", "--task", "T-01"],
		});

		expect(resolveCommand(["memory", "ls"])).toEqual({
			kind: "subcommand",
			group: "memory",
			action: "list",
			args: [],
		});

		expect(
			resolveCommand([
				"new",
				"aliases",
				"-F",
				"F-1",
				"-P",
				"SPEC-1",
				"-t",
				"shorten commands",
			]),
		).toEqual({
			kind: "new",
			args: [
				"aliases",
				"--feature-id",
				"F-1",
				"--parent-spec",
				"SPEC-1",
				"--task",
				"shorten commands",
			],
		});

		expect(
			resolveCommand([
				"update",
				"ck",
				"-S",
				"session-1",
				"-T",
				"T-01",
				"-r",
				"refresh source",
			]),
		).toEqual({
			kind: "update",
			args: [
				"check",
				"--session",
				"session-1",
				"--task-id",
				"T-01",
				"--reason",
				"refresh source",
			],
		});

		expect(resolveCommand(["local-state", "rb"])).toEqual({
			kind: "localState",
			args: ["rebuild"],
		});

		expect(
			resolveCommand([
				"file",
				"pt",
				"-S",
				"session-1",
				"-T",
				"T-01",
				"-r",
				"fix metadata",
			]),
		).toEqual({
			kind: "file",
			args: [
				"patch",
				"--session",
				"session-1",
				"--task-id",
				"T-01",
				"--reason",
				"fix metadata",
			],
		});
	});

	test("normalizes broad command, action, and flag aliases", () => {
		expect(
			resolveCommand(["qt", "alias-smoke", "-t", "task", "-o", "passed"]),
		).toEqual({
			kind: "quickTask",
			args: ["alias-smoke", "--task", "task", "--result", "passed"],
		});

		expect(
			resolveCommand(["ss", "sw", "-S", "session-1", "-b", "main"]),
		).toEqual({
			kind: "subcommand",
			group: "session",
			action: "switch",
			args: ["--session", "session-1", "--branch", "main"],
		});

		expect(
			resolveCommand([
				"lb",
				"as",
				"-t",
				"runtime",
				"-u",
				"https://example.test",
				"-T",
				"Example",
			]),
		).toEqual({
			kind: "subcommand",
			group: "library",
			action: "add-source",
			args: [
				"--topic",
				"runtime",
				"--url",
				"https://example.test",
				"--title",
				"Example",
			],
		});

		expect(resolveCommand(["mm", "rd"])).toEqual({
			kind: "subcommand",
			group: "memory",
			action: "render",
			args: [],
		});

		expect(resolveCommand(["be", "r", "-s", "cli-help", "-k"])).toEqual({
			kind: "subcommand",
			group: "bench",
			action: "run",
			args: ["--scenario", "cli-help", "--keep-artifacts"],
		});

		expect(resolveCommand(["pb", "rec", "-f", "token-economy"])).toEqual({
			kind: "subcommand",
			group: "projectBenchmark",
			action: "recommend",
			args: ["--for", "token-economy"],
		});

		expect(resolveCommand(["sc", "ap", "-D"])).toEqual({
			kind: "subcommand",
			group: "schema",
			action: "apply",
			args: ["--dry-run"],
		});
	});

	test("normalizes scoped flags when subcommand action is omitted", () => {
		expect(resolveCommand(["ht", "-a", "wb", "-d", "-r"])).toEqual({
			kind: "subcommand",
			group: "health",
			action: "",
			args: ["--area", "wb", "--deep", "--release"],
		});

		expect(resolveCommand(["tel", "-l", "3", "-f", "jsonl"])).toEqual({
			kind: "subcommand",
			group: "telemetry",
			action: "",
			args: ["--limit", "3", "--format", "jsonl"],
		});
	});

	test("keeps routed subcommand groups aligned with main dispatch", () => {
		expect(new Set(ROUTED_SUBCOMMAND_GROUPS)).toEqual(
			new Set(SUBCOMMAND_DISPATCH_GROUPS),
		);
	});

	test("keeps every advertised command on a dispatched surface", () => {
		const directKinds = new Set(DIRECT_DISPATCH_KINDS);
		const subcommandKinds = new Set(SUBCOMMAND_DISPATCH_GROUPS);

		for (const spec of kernelRegistry.commands) {
			expect(directKinds.has(spec.kind) || subcommandKinds.has(spec.kind)).toBe(
				true,
			);
		}
	});
});
