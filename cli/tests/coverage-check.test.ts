import { describe, expect, test } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..", "..");

function runCoverageCheck(coverageOutput: string, args: string[] = []) {
	const root = mkdtempSync(join(tmpdir(), "coverage-check-"));
	const binDir = join(root, "bin");
	mkdirSync(binDir, { recursive: true });
	writeFileSync(
		join(binDir, "bun"),
		["#!/bin/sh", "cat <<'EOF'", coverageOutput, "EOF"].join("\n"),
		"utf8",
	);
	chmodSync(join(binDir, "bun"), 0o755);

	try {
		return {
			result: Bun.spawnSync(
				[
					process.execPath,
					join(repoRoot, "cli/dev/coverage-check.ts"),
					...args,
				],
				{
					cwd: repoRoot,
					env: {
						...process.env,
						PATH: `${binDir}:${process.env.PATH ?? ""}`,
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
});
