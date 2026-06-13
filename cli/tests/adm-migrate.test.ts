import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAdmCommand } from "../commands/adm";

type CapturedIo = {
	stdout: string[];
	stderr: string[];
	io: {
		stdout: (message: string) => void;
		stderr: (message: string) => void;
	};
};

function captureIo(): CapturedIo {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		stdout,
		stderr,
		io: {
			stdout: (message: string) => {
				stdout.push(message);
			},
			stderr: (message: string) => {
				stderr.push(message);
			},
		},
	};
}

function createFixture(): string {
	const root = mkdtempSync(join(tmpdir(), "adm-migrate-"));
	mkdirSync(join(root, "docs", "arc", "SPECS", "nested"), { recursive: true });
	mkdirSync(join(root, "docs", "arc", "DECISIONS"), { recursive: true });
	writeFileSync(join(root, "docs", "arc", "GENERAL-ROADMAP.md"), "roadmap", "utf8");
	writeFileSync(join(root, "docs", "arc", "PROJECT-MANIFESTO.md"), "manifesto", "utf8");
	writeFileSync(join(root, "docs", "arc", "ARCHITECTURE.md"), "architecture", "utf8");
	writeFileSync(join(root, "docs", "arc", "SPECS", "sample.md"), "spec", "utf8");
	writeFileSync(
		join(root, "docs", "arc", "SPECS", "nested", "deep.md"),
		"deep-spec",
		"utf8",
	);
	writeFileSync(join(root, "docs", "arc", "DECISIONS", "decision.md"), "decision", "utf8");
	writeFileSync(join(root, "docs", "arc", "CHANGELOG.md"), "changelog", "utf8");
	return root;
}

describe("adm migrate", () => {
	test("applies docs and archives manifest", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			const code = await runAdmCommand("migrate", ["--json"], root, captured.io);
			expect(code).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				archive_path: string;
				manifest: Array<{ source_path: string; target_path: string }>;
				count: number;
			};
			expect(payload.count).toBe(7);
			expect(payload.archive_path).toMatch(/\.afol\/adm\/migrations\//);

			for (const entry of payload.manifest) {
				const source = join(root, entry.source_path);
				const target = join(root, entry.target_path);
				expect(existsSync(source)).toBe(true);
				expect(existsSync(target)).toBe(true);
				expect(readFileSync(target)).toEqual(readFileSync(source));
			}

			const archivePath = join(root, payload.archive_path);
			expect(existsSync(archivePath)).toBe(true);
			const archive = JSON.parse(readFileSync(archivePath, "utf8")) as {
				count: number;
				manifest: Array<{ source_path: string }>;
			};
			expect(archive.count).toBe(7);
			expect(archive.manifest).toHaveLength(7);

			const before = new Map<string, Buffer>();
			for (const entry of payload.manifest) {
				before.set(entry.target_path, readFileSync(join(root, entry.target_path)));
			}

			const second = captureIo();
			const secondCode = await runAdmCommand("migrate", ["--json"], root, second.io);
			expect(secondCode).toBe(0);
			const secondPayload = JSON.parse(second.stdout[0] ?? "{}") as {
				archive_path: string;
				manifest: Array<{ target_path: string }>;
			};
			for (const entry of secondPayload.manifest) {
				const previous = before.get(entry.target_path);
				if (previous === undefined) {
					throw new Error(`missing baseline for ${entry.target_path}`);
				}
				expect(Buffer.compare(readFileSync(join(root, entry.target_path)), previous)).toBe(0);
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
