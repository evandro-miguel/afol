import { describe, expect, test } from "bun:test";
import {
	parseCloseArgs,
	parseDoneArgs,
	parseNewArgs,
	parseSessionTaskArgs,
} from "../commands/workbench/args";
import {
	DEFAULT_VERIFICATION_TIMEOUT_MS,
	MAX_VERIFICATION_TIMEOUT_MS,
	resolveVerificationTimeoutMs,
	runVerification,
	runVerificationAsync,
	splitCommandLine,
} from "../commands/workbench/verify";

describe("workbench parseNewArgs", () => {
	test("preserves repeated --task values in order", () => {
		const parsed = parseNewArgs([
			"alpha",
			"--task",
			"first task",
			"--task",
			"second task",
		]);

		expect(parsed.theme).toBe("alpha");
		expect(parsed.metadata.task).toBe("first task");
		expect(parsed.metadata.tasks).toEqual(["first task", "second task"]);
		expect(parsed.json).toBe(false);
	});

	test("rejects research-only and no-plan modes", () => {
		expect(() => parseNewArgs(["alpha", "--research"])).toThrow(
			"does not support research-only or no-plan sessions",
		);
		expect(() => parseNewArgs(["alpha", "--no-plan"])).toThrow(
			"does not support research-only or no-plan sessions",
		);
	});
});

describe("workbench parseCloseArgs", () => {
	test("requires allow-no-report to carry a reason", () => {
		expect(() =>
			parseCloseArgs(
				["--session", "260530_2256_cli-native", "--reason", "why"],
				process.cwd(),
			),
		).toThrow("Missing --allow-no-report for close reason.");
		expect(() =>
			parseCloseArgs(
				["--session", "260530_2256_cli-native", "--allow-no-report"],
				process.cwd(),
			),
		).toThrow("Missing --reason for close allow-no-report.");

		const parsed = parseCloseArgs(
			[
				"--session",
				"260530_2256_cli-native",
				"--allow-no-report",
				"--reason",
				"research-only session",
			],
			process.cwd(),
		);

		expect(parsed.session).toBe("260530_2256_cli-native");
		expect(parsed.allowNoReport).toBe(true);
		expect(parsed.reason).toBe("research-only session");
		expect(parsed.summary).toBe("");
		expect(parsed.json).toBe(false);
	});

	test("accepts close summary short flag", () => {
		const parsed = parseCloseArgs(
			["--session", "260530_2256_cli-native", "-m", "verified close"],
			process.cwd(),
		);
		expect(parsed.summary).toBe("verified close");
	});

	test("rejects a summary combined with a no-report waiver", () => {
		expect(() =>
			parseCloseArgs(
				[
					"--session",
					"260530_2256_cli-native",
					"--allow-no-report",
					"--reason",
					"research-only session",
					"--summary",
					"different summary",
				],
				process.cwd(),
			),
		).toThrow("Cannot combine --summary with --allow-no-report.");
	});

	test("accepts --admit-legacy-baseline and defaults it to false", () => {
		const parsed = parseCloseArgs(
			["--session", "260530_2256_cli-native", "--admit-legacy-baseline"],
			process.cwd(),
		);
		expect(parsed.session).toBe("260530_2256_cli-native");
		expect(parsed.admitLegacyBaseline).toBe(true);
		expect(parsed.allowNoReport).toBe(false);

		const strict = parseCloseArgs(
			["--session", "260530_2256_cli-native"],
			process.cwd(),
		);
		expect(strict.admitLegacyBaseline).toBe(false);
	});

	test("rejects unknown close flags next to --admit-legacy-baseline", () => {
		expect(() =>
			parseCloseArgs(
				[
					"--session",
					"260530_2256_cli-native",
					"--admit-legacy-baseline",
					"--unknown-flag",
				],
				process.cwd(),
			),
		).toThrow("Unknown close argument: --unknown-flag");
	});
});

describe("workbench parseSessionTaskArgs", () => {
	test("expands compact task lists and ranges", () => {
		const parsed = parseSessionTaskArgs(
			["--session", "260530_2256_cli-native", "T-01,T-03..T-05,T-03"],
			"start",
			process.cwd(),
		);

		expect(parsed.taskId).toBe("T-01");
		expect(parsed.taskIds).toEqual(["T-01", "T-03", "T-04", "T-05"]);
	});

	test("rejects reversed task ranges", () => {
		expect(() =>
			parseSessionTaskArgs(
				["--session", "260530_2256_cli-native", "T-05..T-01"],
				"start",
				process.cwd(),
			),
		).toThrow("Task range must be ascending");
	});

	test("keeps canonical widths across the 99 to 100 boundary", () => {
		const parsed = parseSessionTaskArgs(
			["--session", "260530_2256_cli-native", "T-99..T-100"],
			"start",
			process.cwd(),
		);
		expect(parsed.taskIds).toEqual(["T-99", "T-100"]);
	});

	test("bounds a selector to 100 tasks", () => {
		expect(() =>
			parseSessionTaskArgs(
				["--session", "260530_2256_cli-native", "T-01..T-101"],
				"start",
				process.cwd(),
			),
		).toThrow("at most 100 tasks");
	});

	test("supports --brief shorthand", () => {
		const parsed = parseSessionTaskArgs(
			["--brief", "--session", "260530_2256_cli-native", "--task-id", "T-01"],
			"start",
			process.cwd(),
		);

		expect(parsed.brief).toBe(true);
		expect(parsed.briefMode).toBe("compact");
		expect(parsed.compact).toBe(false);
		expect(parsed.json).toBe(false);
		expect(parsed.taskId).toBe("T-01");
		expect(parsed.session).toBe("260530_2256_cli-native");
	});

	test("supports --brief full", () => {
		const parsed = parseSessionTaskArgs(
			[
				"--brief",
				"full",
				"--session",
				"260530_2256_cli-native",
				"--task-id",
				"T-01",
			],
			"start",
			process.cwd(),
		);

		expect(parsed.brief).toBe(true);
		expect(parsed.briefMode).toBe("full");
		expect(parsed.taskId).toBe("T-01");
		expect(parsed.session).toBe("260530_2256_cli-native");
	});
});

describe("parseDoneArgs", () => {
	test("preserves Windows paths and quoted argv in --test", () => {
		const parsed = parseDoneArgs(
			[
				"--session",
				"260530_2256_cli-native",
				"T-01",
				"--test",
				String.raw`bun "C:\Program Files\tool.ts"`,
			],
			process.cwd(),
		);

		expect(parsed.verifications).toEqual([
			{
				mode: "argv",
				executable: "bun",
				args: ["C:\\Program Files\\tool.ts"],
			},
		]);
	});

	test("tokenizes --test argv without collapsing Windows backslashes", () => {
		const slash = "\\";
		expect(
			splitCommandLine(String.raw`bun "C:\Program Files\tool.ts"`),
		).toEqual(["bun", "C:\\Program Files\\tool.ts"]);
		expect(splitCommandLine(String.raw`bun C:\new\test`)).toEqual([
			"bun",
			"C:\\new\\test",
		]);
		expect(splitCommandLine(String.raw`bun \\server\share\tool.ts`)).toEqual([
			"bun",
			"\\\\server\\share\\tool.ts",
		]);
		expect(splitCommandLine(String.raw`bun C:\\cache\\tool.ts`)).toEqual([
			"bun",
			"C:\\\\cache\\\\tool.ts",
		]);
		expect(splitCommandLine(String.raw`bun C:\Program\ Files\tool.ts`)).toEqual(
			["bun", "C:\\Program Files\\tool.ts"],
		);
		expect(splitCommandLine(String.raw`bun "say \"hello\""`)).toEqual([
			"bun",
			'say "hello"',
		]);
		expect(splitCommandLine(String.raw`bun "say \"hello"`)).toEqual([
			"bun",
			'say "hello',
		]);
		expect(splitCommandLine(`bun "say ${slash.repeat(3)}"hello"`)).toEqual([
			"bun",
			'say \\"hello',
		]);
		expect(
			splitCommandLine(String.raw`bun "C:\temp${slash.repeat(2)}"`),
		).toEqual(["bun", `${String.raw`C:\temp`}${slash}`]);
		expect(
			splitCommandLine(String.raw`bun "C:\temp${slash.repeat(4)}"`),
		).toEqual(["bun", `${String.raw`C:\temp`}${slash.repeat(2)}`]);
		expect(
			splitCommandLine(String.raw`bun "\\server\share${slash.repeat(2)}"`),
		).toEqual(["bun", `${String.raw`\\server\share`}${slash}`]);
		expect(
			splitCommandLine(String.raw`bun 'C:\Program\ Files\tool.ts'`),
		).toEqual(["bun", "C:\\Program\\ Files\\tool.ts"]);
		expect(splitCommandLine("bun C:\\temp\\")).toEqual(["bun", "C:\\temp\\"]);
		expect(splitCommandLine(`bun "" ''`)).toEqual(["bun", "", ""]);
		expect(() => splitCommandLine(String.raw`bun "C:\temp${slash}`)).toThrow(
			"Unclosed quote in --test command.",
		);
		expect(() => splitCommandLine(`bun "unclosed`)).toThrow(
			"Unclosed quote in --test command.",
		);
	});

	test("expands a compact batch selector", () => {
		const parsed = parseDoneArgs(
			[
				"--session",
				"260530_2256_cli-native",
				"T-01..T-03",
				"--test",
				"bun test",
			],
			process.cwd(),
		);

		expect(parsed.taskId).toBe("T-01");
		expect(parsed.taskIds).toEqual(["T-01", "T-02", "T-03"]);
	});

	test("preserves repeated --test values in order", () => {
		const parsed = parseDoneArgs(
			[
				"--session",
				"260530_2256_cli-native",
				"T-01",
				"--test",
				"bun run typecheck",
				"--test",
				"bun test",
			],
			process.cwd(),
		);

		expect(parsed.testCommands).toEqual(["bun run typecheck", "bun test"]);
		expect(parsed.verifications).toEqual([
			{ mode: "argv", executable: "bun", args: ["run", "typecheck"] },
			{ mode: "argv", executable: "bun", args: ["test"] },
		]);
	});

	test("defaults verification timeout to the bounded maximum and preserves explicit values", () => {
		const defaultParsed = parseDoneArgs(
			[
				"--session",
				"260530_2256_cli-native",
				"T-01",
				"--test",
				"bun test --only-failures",
			],
			process.cwd(),
		);
		expect(defaultParsed.verificationTimeoutMs).toBe(
			DEFAULT_VERIFICATION_TIMEOUT_MS,
		);
		expect(DEFAULT_VERIFICATION_TIMEOUT_MS).toBe(MAX_VERIFICATION_TIMEOUT_MS);

		const parsed = parseDoneArgs(
			[
				"--session",
				"260530_2256_cli-native",
				"T-01",
				"--test",
				"bun test --only-failures",
				"--verification-timeout-ms",
				"120001",
			],
			process.cwd(),
		);

		expect(parsed.verificationTimeoutMs).toBe(120001);
		expect(resolveVerificationTimeoutMs(MAX_VERIFICATION_TIMEOUT_MS)).toBe(
			MAX_VERIFICATION_TIMEOUT_MS,
		);
		expect(() =>
			parseDoneArgs(
				[
					"--session",
					"260530_2256_cli-native",
					"T-01",
					"--test",
					"true",
					"--verification-timeout-ms",
					String(MAX_VERIFICATION_TIMEOUT_MS + 1),
				],
				process.cwd(),
			),
		).toThrow("between 1 and");
	});

	test("rejects static sequential verification limits before execution", () => {
		const base = ["--session", "260530_2256_cli-native", "T-01"];
		const nineTests = Array.from({ length: 9 }, () => [
			"--test",
			"true",
		]).flat();
		expect(() => parseDoneArgs([...base, ...nineTests], process.cwd())).toThrow(
			"at most 8",
		);
		expect(() =>
			parseDoneArgs(
				[...base, "--test", `bun ${"x".repeat(4097)}`],
				process.cwd(),
			),
		).toThrow("4,096");
		expect(() =>
			parseDoneArgs(
				[
					...base,
					"--test",
					`bun ${"x".repeat(2100)}`,
					"--test",
					`bun ${"y".repeat(2100)}`,
				],
				process.cwd(),
			),
		).toThrow("aggregate limit");
		expect(() =>
			parseDoneArgs(
				[...base, "--test", `bun ${"😀".repeat(1100)}`],
				process.cwd(),
			),
		).toThrow("UTF-8 bytes");
		const tooManyArgv = ["bun", ...Array.from({ length: 128 }, () => "x")];
		expect(() =>
			parseDoneArgs([...base, "--", ...tooManyArgv], process.cwd()),
		).toThrow("128 argv entries");
	});

	test("rejects logically empty verification commands before execution", () => {
		const base = ["--session", "260530_2256_cli-native", "T-01"];
		for (const value of ["   ", '""', "''"]) {
			expect(() =>
				parseDoneArgs([...base, "--test", value], process.cwd()),
			).toThrow("Empty --test command");
		}
		expect(() =>
			parseDoneArgs([...base, "--test-shell", "   "], process.cwd()),
		).toThrow("Empty --test-shell command");
		expect(() => parseDoneArgs([...base, "--", "   "], process.cwd())).toThrow(
			"Empty positional command",
		);
	});

	test("does not tokenize shell syntax while checking --test-shell", () => {
		const parsed = parseDoneArgs(
			[
				"--session",
				"260530_2256_cli-native",
				"T-01",
				"--test-shell",
				"true # 'valid shell comment",
			],
			process.cwd(),
		);
		expect(parsed.testShellCommand).toBe("true # 'valid shell comment");
		const commentOnly = parseDoneArgs(
			[
				"--session",
				"260530_2256_cli-native",
				"T-01",
				"--test-shell",
				"# comment",
			],
			process.cwd(),
		);
		expect(commentOnly.testShellCommand).toBe("# comment");
	});

	test("supports --test-shell", () => {
		const parsed = parseDoneArgs(
			[
				"--session",
				"260530_2256_cli-native",
				"--task-id",
				"T-01",
				"--test-shell",
				"npm run lint && npm run test",
			],
			process.cwd(),
		);

		expect(parsed.testCommands).toEqual([]);
		expect(parsed.testShellCommand).toBe("npm run lint && npm run test");
		expect(parsed.taskId).toBe("T-01");
		expect(parsed.session).toBe("260530_2256_cli-native");
	});

	test("rejects --test and --test-shell together", () => {
		expect(() =>
			parseDoneArgs(
				[
					"--session",
					"260530_2256_cli-native",
					"--task-id",
					"T-01",
					"--test",
					"bun test",
					"--test-shell",
					"bun lint",
				],
				process.cwd(),
			),
		).toThrow("Cannot use both --test and --test-shell in done.");
	});

	test("rejects duplicate --test-shell and positional mixtures", () => {
		expect(() =>
			parseDoneArgs(
				[
					"--session",
					"260530_2256_cli-native",
					"T-01",
					"--test-shell",
					"true",
					"--test-shell",
					"false",
				],
				process.cwd(),
			),
		).toThrow("only one --test-shell");
		expect(() =>
			parseDoneArgs(
				[
					"--session",
					"260530_2256_cli-native",
					"T-01",
					"--test",
					"true",
					"--",
					"false",
				],
				process.cwd(),
			),
		).toThrow("Cannot combine positional verification");
	});

	test("captures positional argv verification after -- without normalization", () => {
		const parsed = parseDoneArgs(
			[
				"--session",
				"260530_2256_cli-native",
				"T-01",
				"--",
				"bun",
				"-e",
				"console.log('--test -x')",
			],
			process.cwd(),
		);

		expect(parsed.testCommands).toEqual([]);
		expect(parsed.testShellCommand).toBeNull();
		expect(parsed.verifications).toEqual([
			{
				mode: "argv",
				executable: "bun",
				args: ["-e", "console.log('--test -x')"],
			},
		]);
	});

	test("runs VerificationSpec argv without reparsing positional tokens", () => {
		const result = runVerification(process.cwd(), {
			mode: "argv",
			executable: process.execPath,
			args: ["-e", "process.exit(0)"],
		});
		expect(result).toEqual({ exitCode: 0 });
	});

	test("preserves Windows executable backslashes when tokenizing --test", () => {
		if (process.platform !== "win32") return;
		const executable = String.raw`D:\projects\active\afol-windows-fix\dist\afol.exe`;
		expect(splitCommandLine(`${executable} --version`)).toEqual([
			executable,
			"--version",
		]);
	});

	test("preserves quoted Windows paths containing spaces", () => {
		if (process.platform !== "win32") return;
		const executable = String.raw`D:\AFOL Windows\dist\afol.exe`;
		expect(splitCommandLine(`"${executable}" --version`)).toEqual([
			executable,
			"--version",
		]);
	});

	test("preserves a trailing separator in a quoted Windows path", () => {
		if (process.platform !== "win32") return;
		const directory = "C:\\AFOL Windows\\tests\\";
		expect(splitCommandLine(`bun test "${directory}"`)).toEqual([
			"bun",
			"test",
			directory,
		]);
	});

	test("executes an unquoted Windows executable path", () => {
		if (process.platform !== "win32") return;
		const executable = process.execPath;
		const command = executable.includes(" ")
			? `"${executable}" --version`
			: `${executable} --version`;
		expect(runVerification(process.cwd(), command)).toEqual({ exitCode: 0 });
	});

	test("runs a verification configured above 120 seconds and rejects an unsafe maximum", async () => {
		const timeoutMs = resolveVerificationTimeoutMs(120_001);
		expect(timeoutMs).toBe(120_001);
		const result = await runVerificationAsync(
			process.cwd(),
			{
				mode: "argv",
				executable: process.execPath,
				args: ["-e", "process.exit(0)"],
			},
			{ timeoutMs },
		);
		expect(result.status).toBe("passed");
		expect(() =>
			resolveVerificationTimeoutMs(MAX_VERIFICATION_TIMEOUT_MS + 1),
		).toThrow("between 1 and");
	});

	test("terminates async verification on timeout without returning raw output", async () => {
		const result = await runVerificationAsync(
			process.cwd(),
			{
				mode: "argv",
				executable: process.execPath,
				args: ["-e", "setTimeout(() => {}, 1000)"],
			},
			{ timeoutMs: 20 },
		);
		expect(result.status).toBe("timed_out");
		expect(result.exitCode).not.toBe(0);
		expect(result).not.toHaveProperty("stdout");
		expect(result).not.toHaveProperty("stderr");
	});

	test("terminates the verification process tree on timeout", async () => {
		const startedAt = Date.now();
		const result = await runVerificationAsync(
			process.cwd(),
			{
				mode: "argv",
				executable: process.execPath,
				args: [
					"-e",
					`require("node:child_process").spawn(${JSON.stringify(process.execPath)}, ["-e", "setTimeout(() => {}, 1000)"], { stdio: "inherit" }); setTimeout(() => {}, 1000);`,
				],
			},
			{ timeoutMs: 20 },
		);
		expect(result.status).toBe("timed_out");
		expect(Date.now() - startedAt).toBeLessThan(500);
	});

	test("terminates async verification at the streaming output limit", async () => {
		const result = await runVerificationAsync(
			process.cwd(),
			{
				mode: "argv",
				executable: process.execPath,
				args: ["-e", "process.stdout.write('x'.repeat(2048))"],
			},
			{ maxOutputBytes: 128 },
		);
		expect(result.status).toBe("output_limit");
		expect(result.exitCode).not.toBe(0);
	});
});
