import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBootstrapCommand } from "../commands/bootstrap";

describe("bootstrap legacy evolution compatibility", () => {
	test("preserves an unconfigured legacy project identity", async () => {
		const target = mkdtempSync(join(tmpdir(), "bootstrap-legacy-evolution-"));
		try {
			expect(await runBootstrapCommand([target, "--provider-compatible"])).toBe(
				0,
			);

			const configPath = join(target, ".afol", "config.json");
			const config = JSON.parse(readFileSync(configPath, "utf8")) as {
				project: Record<string, unknown>;
				[key: string]: unknown;
			};
			delete config.evolution;
			config.project.id = "legacy-project-id";
			delete config.project.timezone;
			const legacyContent = `${JSON.stringify(config, null, 2)}\n`;
			writeFileSync(configPath, legacyContent, "utf8");

			expect(await runBootstrapCommand([target, "--provider-compatible"])).toBe(
				0,
			);
			expect(readFileSync(configPath, "utf8")).toBe(legacyContent);
		} finally {
			rmSync(target, { recursive: true, force: true });
		}
	});
});
