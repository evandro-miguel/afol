import { describe, expect, test } from "bun:test";
import { FLAG_ALIASES, SUBCOMMAND_ACTION_ALIASES } from "../aliases";
import { DIRECT_DISPATCH_KINDS, SUBCOMMAND_DISPATCH_GROUPS } from "../main";
import { kernelRegistry } from "../registry";
import { ROUTED_SUBCOMMAND_GROUPS, resolveCommand } from "../router";

describe("router alias grammar", () => {
	test("keeps alias tables scoped to dispatched command kinds", () => {
		const commandKinds = new Set<string>(
			kernelRegistry.commands.map((spec) => spec.kind),
		);

		for (const [scope, aliases] of Object.entries(SUBCOMMAND_ACTION_ALIASES)) {
			expect(commandKinds.has(scope)).toBe(true);
			for (const [alias, canonical] of Object.entries(aliases)) {
				expect(alias).not.toBe("");
				expect(canonical).not.toBe("");
				expect(alias).not.toBe(canonical);
				expect(alias.startsWith("-")).toBe(false);
				expect(canonical.startsWith("-")).toBe(false);
				expect(alias.trim()).toBe(alias);
				expect(canonical.trim()).toBe(canonical);
			}
		}

		for (const [scope, aliases] of Object.entries(FLAG_ALIASES)) {
			expect(commandKinds.has(scope)).toBe(true);
			for (const [alias, canonical] of Object.entries(aliases)) {
				expect(alias).not.toBe("");
				expect(canonical).not.toBe("");
				expect(alias).not.toBe(canonical);
				expect(alias.startsWith("-")).toBe(true);
				expect(alias.startsWith("--")).toBe(false);
				expect(canonical.startsWith("--")).toBe(true);
				expect(alias.trim()).toBe(alias);
				expect(canonical.trim()).toBe(canonical);
			}
		}
	});

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

	test("routes feedback aliases without rewriting action or option arguments", () => {
		expect(resolveCommand(["fb", "last", "-m", "fixed", "-j"])).toEqual({
			kind: "feedback",
			args: ["last", "-m", "fixed", "-j"],
		});
	});

	test("routes receipt ingestion as a subcommand", () => {
		expect(
			resolveCommand(["receipt", "ingest", "--file", "receipt.json"]),
		).toEqual({
			kind: "subcommand",
			group: "receipt",
			action: "ingest",
			args: ["--file", "receipt.json"],
		});
	});

	test("stops done flag normalization at the positional verification delimiter", () => {
		expect(
			resolveCommand(["d", "T-01", "-x", "bun", "--", "-x", "--test"]),
		).toEqual({
			kind: "done",
			args: ["T-01", "--test", "bun", "--", "-x", "--test"],
		});
	});

	test("normalizes scoped action aliases and scope-specific short flags", () => {
		expect(
			resolveCommand(["cx", "bn", "-S", "session-1", "-T", "T-01"]),
		).toEqual({
			kind: "subcommand",
			group: "ctx",
			action: "bundle",
			args: ["--session", "session-1", "--task", "T-01", "--mode", "compact"],
		});

		expect(resolveCommand(["ctx", "bundle"])).toEqual({
			kind: "subcommand",
			group: "ctx",
			action: "bundle",
			args: [],
		});

		expect(resolveCommand(["cx", "bundle", "--mode", "deep"])).toEqual({
			kind: "subcommand",
			group: "ctx",
			action: "bundle",
			args: ["--mode", "deep"],
		});

		expect(resolveCommand(["memory", "ls"])).toEqual({
			kind: "subcommand",
			group: "memory",
			action: "list",
			args: [],
		});

		expect(resolveCommand(["sp", "ls", "--json"])).toEqual({
			kind: "subcommand",
			group: "spec",
			action: "list",
			args: ["--json"],
		});

		expect(resolveCommand(["ux", "cov", "-t", "maintenance"])).toEqual({
			kind: "subcommand",
			group: "ux",
			action: "coverage",
			args: ["--tool", "maintenance"],
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

		expect(
			resolveCommand([
				"fleet",
				"check",
				"--root",
				"/abs/A",
				"--root",
				"/abs/B",
			]),
		).toEqual({
			kind: "fleet",
			args: ["check", "--root", "/abs/A", "--root", "/abs/B"],
		});

		expect(
			resolveCommand([
				"fleet",
				"repair",
				"--derived",
				"--dry-run",
				"--root",
				"/abs/C",
			]),
		).toEqual({
			kind: "fleet",
			args: ["repair", "--derived", "--dry-run", "--root", "/abs/C"],
		});
	});

	test("preserves flag-like option values while normalizing scoped aliases", () => {
		expect(
			resolveCommand([
				"memory",
				"add",
				"--id",
				"m",
				"--title",
				"-b",
				"--body",
				"text",
			]),
		).toEqual({
			kind: "subcommand",
			group: "memory",
			action: "add",
			args: ["--id", "m", "--title", "-b", "--body", "text"],
		});

		expect(
			resolveCommand(["memory", "add", "-i", "m", "-t", "-b", "-b", "text"]),
		).toEqual({
			kind: "subcommand",
			group: "memory",
			action: "add",
			args: ["--id", "m", "--title", "-b", "--body", "text"],
		});
	});

	test("normalizes broad command, action, and flag aliases", () => {
		expect(
			resolveCommand(["qt", "alias-smoke", "-t", "task", "-o", "passed"]),
		).toEqual({
			kind: "quickTask",
			args: ["alias-smoke", "--task", "task", "-o", "passed"],
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

	test("keeps deprecated render command routed to memory render", () => {
		expect(resolveCommand(["render"])).toEqual({
			kind: "subcommand",
			group: "memory",
			action: "render",
			args: [],
		});
		expect(resolveCommand(["render", "--json"])).toEqual({
			kind: "subcommand",
			group: "memory",
			action: "render",
			args: ["--json"],
		});
	});

	test("keeps compact command forms behaviorally aligned with canonical forms", () => {
		const cases: Array<{ compact: string[]; canonical: string[] }> = [
			{
				compact: ["ss", "sw", "-S", "session-1", "-b", "main"],
				canonical: [
					"session",
					"switch",
					"--session",
					"session-1",
					"--branch",
					"main",
				],
			},
			{
				compact: ["be", "r", "-s", "cli-help", "-k"],
				canonical: [
					"bench",
					"run",
					"--scenario",
					"cli-help",
					"--keep-artifacts",
				],
			},
			{
				compact: ["pb", "rec", "-f", "token-economy"],
				canonical: ["project-benchmark", "recommend", "--for", "token-economy"],
			},
			{
				compact: ["sc", "ap", "-D"],
				canonical: ["schema", "apply", "--dry-run"],
			},
			{
				compact: ["up", "ck", "-S", "session-1", "-T", "T-01", "-r", "sync"],
				canonical: [
					"update",
					"check",
					"--session",
					"session-1",
					"--task-id",
					"T-01",
					"--reason",
					"sync",
				],
			},
			{
				compact: ["ls", "rb"],
				canonical: ["local-state", "rebuild"],
			},
		];

		for (const { compact, canonical } of cases) {
			expect(resolveCommand(compact)).toEqual(resolveCommand(canonical));
		}
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
