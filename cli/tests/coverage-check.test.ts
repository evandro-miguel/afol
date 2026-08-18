import { describe, expect, test } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";

const repoRoot = join(import.meta.dir, "..", "..");

function runCoverageCheck(
	coverageOutput: string | ((root: string) => string),
	args: string[] = [],
	options: {
		lcovOutput?: string;
		lcovPath?: string;
		bunScript?: string;
	} = {},
) {
	const root = mkdtempSync(join(tmpdir(), "coverage-check-"));
	const binDir = join(root, "bin");
	mkdirSync(binDir, { recursive: true });
	const lcovPath = join(
		root,
		options.lcovPath ?? join(".coverage", "lcov.info"),
	);
	if (options.lcovOutput) {
		mkdirSync(dirname(lcovPath), { recursive: true });
		writeFileSync(lcovPath, options.lcovOutput, "utf8");
	}
	const output =
		typeof coverageOutput === "function"
			? coverageOutput(root)
			: coverageOutput;
	const bunScript = options.bunScript;
	if (process.platform === "win32") {
		const fixtureScript = join(binDir, "bun-fixture.js");
		writeFileSync(
			fixtureScript,
			[
				`process.stdout.write(${JSON.stringify(output)});`,
				...(bunScript?.includes("kill -TERM $$")
					? ['process.kill(process.pid, "SIGTERM");']
					: []),
			].join("\n"),
			"utf8",
		);
		writeFileSync(
			join(binDir, "bun.cmd"),
			`@echo off\r\n"${process.execPath}" "${fixtureScript}" %*\r\n`,
			"utf8",
		);
	} else {
		writeFileSync(
			join(binDir, "bun"),
			bunScript ?? ["#!/bin/sh", "cat <<'EOF'", output, "EOF"].join("\n"),
			"utf8",
		);
		chmodSync(join(binDir, "bun"), 0o755);
	}

	try {
		return {
			result: Bun.spawnSync(
				[
					process.execPath,
					join(repoRoot, "cli/dev/coverage-check.ts"),
					...args,
				],
				{
					cwd: root,
					env: {
						...process.env,
						PATH: `${binDir}${delimiter}${process.env.PATH ?? process.env.Path ?? ""}`,
					},
					stdout: "pipe",
					stderr: "pipe",
				},
			),
			root,
		};
	} catch (error) {
		rmSync(root, { recursive: true, force: true });
		throw error;
	}
}

function decode(output: Uint8Array<ArrayBufferLike>) {
	return new TextDecoder().decode(output);
}

describe("coverage:check contract", () => {
	test("fails on under-covered files even when the aggregate row passes", () => {
		const { result, root } = runCoverageCheck(
			`
File            | % Funcs | % Lines |
All files       | 95      | 95
cli/good.ts     | 100     | 100
cli/bad.ts      | 10      | 10
`,
			["--include", "cli/bad.ts"],
		);

		try {
			expect(result.exitCode).toBe(1);
			expect(decode(result.stdout)).toContain(
				"coverage cli/bad.ts lines: 10.00% (threshold 80%)",
			);
			expect(decode(result.stdout)).toContain(
				"coverage cli/bad.ts functions: 10.00% (threshold 80%)",
			);
			expect(decode(result.stderr)).toContain("coverage: failed");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("keeps include filtering targeted to the requested prefixes", () => {
		const { result, root } = runCoverageCheck(
			`
File                       | % Funcs | % Lines |
All files                  | 82      | 82
cli/services/good.ts       | 100     | 100
cli/commands/ignored.ts    | 10      | 10
`,
			["--include", "cli/services"],
		);

		try {
			expect(result.exitCode).toBe(0);
			expect(decode(result.stdout)).toContain("coverage: passed");
			expect(decode(result.stdout)).toContain(
				"coverage cli/services/good.ts lines: 100.00% (threshold 80%)",
			);
			expect(decode(result.stdout)).not.toContain("cli/commands/ignored.ts");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fails when any requested include prefix has no coverage row", () => {
		const { result, root } = runCoverageCheck(
			`
File                       | % Funcs | % Lines |
All files                  | 100     | 100
cli/services/good.ts       | 100     | 100
`,
			["--include", "cli/services", "--include", "cli/missing.ts"],
		);

		try {
			expect(result.exitCode).toBe(1);
			expect(decode(result.stderr)).toContain(
				"coverage: missing include prefixes: cli/missing.ts",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("normalizes relative and absolute Windows-style coverage paths", () => {
		const { result, root } = runCoverageCheck(
			(fixtureRoot) => `
File                                  | % Funcs | % Lines |
All files                             | 100     | 100
cli\\services\\relative.ts             | 100     | 100
${join(fixtureRoot, "cli", "services", "absolute.ts").replaceAll("/", "\\")} | 100     | 100
`,
			[
				"--include",
				"cli\\services\\relative.ts",
				"--include",
				"cli/services/absolute.ts",
			],
		);

		try {
			expect(result.exitCode).toBe(0);
			const stdout = decode(result.stdout);
			expect(stdout).toContain("coverage cli/services/relative.ts lines:");
			expect(stdout).toContain("coverage cli/services/absolute.ts lines:");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("prefers LCOV coverage data when present", () => {
		const { result, root } = runCoverageCheck(
			"",
			["--include", "cli/services"],
			{
				lcovOutput: `
SF:cli/services/good.ts
FNF:10
FNH:10
LF:100
LH:100
end_of_record
SF:cli/commands/ignored.ts
FNF:10
FNH:0
LF:100
LH:100
end_of_record
`,
			},
		);

		try {
			expect(result.exitCode).toBe(0);
			expect(decode(result.stdout)).toContain("coverage: passed");
			expect(decode(result.stdout)).toContain(
				"coverage cli/services/good.ts lines: 100.00% (threshold 80%)",
			);
			expect(decode(result.stdout)).not.toContain("cli/commands/ignored.ts");
			expect(decode(result.stderr)).toBe("");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("supports explicit LCOV path", () => {
		const lcovRelativePath = join("tmp", "coverage", "custom.lcov.info");
		const { result, root } = runCoverageCheck(
			"",
			["--lcov-path", lcovRelativePath, "--include", "cli/services"],
			{
				lcovPath: lcovRelativePath,
				lcovOutput: `
SF:cli/services/explicit.ts
FNF:4
FNH:4
LF:20
LH:20
end_of_record
`,
			},
		);

		try {
			expect(result.exitCode).toBe(0);
			expect(decode(result.stdout)).toContain("coverage: passed");
			expect(decode(result.stdout)).toContain(
				"coverage cli/services/explicit.ts lines: 100.00% (threshold 80%)",
			);
			expect(root).not.toBe("");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("reports when bun test is terminated by a signal", () => {
		const { result, root } = runCoverageCheck("", [], {
			bunScript: "#!/bin/sh\nkill -TERM $$",
		});

		try {
			expect(result.exitCode).toBe(1);
			expect(decode(result.stderr)).toContain(
				process.platform === "win32"
					? "coverage: bun test exited with status 1"
					: "coverage: bun test terminated by signal SIGTERM",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
