import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAdmCommand } from "../commands/adm";
import { validateAdmMigration } from "../services/adm";

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
	test("validateAdmMigration reports missing targets before migrate", () => {
		const root = createFixture();
		try {
			const report = validateAdmMigration(root);
			expect(report.ok).toBe(false);
			expect(
				report.findings.some(
					(finding) => finding.domain === "adm" && finding.id.endsWith(":missing"),
				),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

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
			expect(validateAdmMigration(root).ok).toBe(true);

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

	test("validateAdmMigration reports drift when source or target changes", async () => {
		const root = createFixture();
		try {
			expect(await runAdmCommand("migrate", ["--json"], root, captureIo().io)).toBe(0);

			writeFileSync(join(root, "docs", "arc", "SPECS", "sample.md"), "spec v2", "utf8");
			let report = validateAdmMigration(root);
			expect(report.ok).toBe(false);
			expect(
				report.findings.some((finding) => finding.domain === "adm" && finding.severity === "warn"),
			).toBe(true);

			writeFileSync(join(root, "docs", "arc", "SPECS", "sample.md"), "spec", "utf8");
			writeFileSync(join(root, ".afol", "adm", "specs", "sample.md"), "target v2", "utf8");
			report = validateAdmMigration(root);
			expect(report.ok).toBe(false);
			expect(
				report.findings.some(
					(finding) => finding.id === "adm:.afol/adm/specs/sample.md:stale",
				),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("adm validate command returns a report", async () => {
		const root = createFixture();
		try {
			const before = captureIo();
			const beforeCode = await runAdmCommand("validate", ["--json"], root, before.io);
			expect(beforeCode).toBe(1);
			const beforePayload = JSON.parse(before.stdout[0] ?? "{}") as {
				ok: boolean;
				findings: Array<{ id: string }>;
			};
			expect(beforePayload.ok).toBe(false);
			expect(beforePayload.findings.length).toBeGreaterThan(0);

			const migrate = captureIo();
			expect(await runAdmCommand("migrate", ["--json"], root, migrate.io)).toBe(0);

			const after = captureIo();
			const afterCode = await runAdmCommand("validate", ["--json"], root, after.io);
			expect(afterCode).toBe(0);
			const afterPayload = JSON.parse(after.stdout[0] ?? "{}") as {
				ok: boolean;
				findings: Array<{ id: string }>;
			};
			expect(afterPayload.ok).toBe(true);
			expect(afterPayload.findings).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
