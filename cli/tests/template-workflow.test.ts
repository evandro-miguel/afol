import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { splitCommandLine } from "../commands/workbench/verify";

const entrypoint = join(import.meta.dir, "..", "main.ts");

test("the installed agent guide completes both documented workflows", () => {
	const root = mkdtempSync(join(tmpdir(), "afol-guide-workflow-"));
	const run = (command: string, args: string[]) => {
		const result = spawnSync(command, args, {
			cwd: root,
			encoding: "utf8",
			timeout: 30_000,
		});
		if (result.status !== 0) {
			throw new Error(
				`${args.join(" ")} exited ${result.status}: ${result.stderr || result.stdout}`,
			);
		}
		return result.stdout;
	};
	try {
		run("git", ["init", "--quiet"]);
		run(process.execPath, [entrypoint, "init"]);
		writeFileSync(
			join(root, "verify.ts"),
			[
				'const config = await Bun.file(".afol/config.json").json();',
				'if (config.schema_version !== 1) throw new Error("invalid config");',
				'const marker = ".afol/tmp/guide-verifications";',
				'const count = Number(await Bun.file(marker).text().catch(() => "0"));',
				"await Bun.write(marker, String(count + 1));",
			].join("\n"),
		);
		const guide = readFileSync(join(root, "AGENTS.md"), "utf8");
		const commands = [...guide.matchAll(/```bash\n([\s\S]*?)```/g)].flatMap(
			(match) =>
				(match[1] ?? "").split("\n").filter((line) => line.startsWith("afol ")),
		);
		let session: string | undefined;
		for (const command of commands) {
			const args = splitCommandLine(
				command
					.replaceAll("<check>", "bun run verify.ts")
					.replaceAll("<command>", "qt")
					.replaceAll("<F-id>", "F-99")
					.replaceAll("<spec-id>", "guide-fixture-spec"),
			).slice(1);
			const output = run(process.execPath, [entrypoint, ...args]);
			if (args[0] === "n") session = /session created: (\S+)/.exec(output)?.[1];
		}
		expect(
			readFileSync(join(root, ".afol/tmp/guide-verifications"), "utf8"),
		).toBe("2");
		expect(session).toBeDefined();
		expect(
			run(process.execPath, [entrypoint, "vf", session as string, "--strict"]),
		).toContain("All tasks completed.");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
