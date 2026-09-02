import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLI_PACKAGE_NAME, CLI_VERSION } from "../generated/version";
import { validateMutationRuntime } from "../services/state/validate";

describe("Windows compiled runtime", () => {
	test("requires provenance for an afol.exe invocation", () => {
		const root = mkdtempSync(join(tmpdir(), "afol-windows-runtime-"));
		const binary = join(root, "dist", "afol.exe");
		try {
			mkdirSync(join(root, "dist"), { recursive: true });
			writeFileSync(
				join(root, "package.json"),
				JSON.stringify({ name: CLI_PACKAGE_NAME, version: CLI_VERSION }),
				"utf8",
			);

			const missing = validateMutationRuntime({
				cliRoot: root,
				invocationPath: binary,
				operation: "bootstrap",
			});
			expect(missing.ok).toBe(false);
			expect(missing).toMatchObject({
				message: expect.stringContaining("not locally registered"),
			});

			writeFileSync(
				`${binary}.provenance.json`,
				JSON.stringify({
					package_name: CLI_PACKAGE_NAME,
					version: CLI_VERSION,
				}),
				"utf8",
			);
			expect(
				validateMutationRuntime({
					cliRoot: root,
					invocationPath: binary,
				}),
			).toEqual({ ok: true });
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
