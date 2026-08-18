import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAdmCommand } from "../commands/adm";
import { migrateAdm } from "../services/adm/migrator";
import { validateAdmMigration } from "../services/adm/validate";
import { symlinkTestSupport } from "./symlink-test-support";

const symlinkTest = test.skipIf(!symlinkTestSupport.available);

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
	writeFileSync(
		join(root, "docs", "arc", "GENERAL-ROADMAP.md"),
		"roadmap",
		"utf8",
	);
	writeFileSync(
		join(root, "docs", "arc", "PROJECT-MANIFESTO.md"),
		"manifesto",
		"utf8",
	);
	writeFileSync(
		join(root, "docs", "arc", "ARCHITECTURE.md"),
		"architecture",
		"utf8",
	);
	writeFileSync(
		join(root, "docs", "arc", "SPECS", "sample.md"),
		"spec",
		"utf8",
	);
	writeFileSync(
		join(root, "docs", "arc", "SPECS", "nested", "deep.md"),
		"deep-spec",
		"utf8",
	);
	writeFileSync(
		join(root, "docs", "arc", "DECISIONS", "decision.md"),
		"decision",
		"utf8",
	);
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
					(finding) =>
						finding.domain === "adm" && finding.id.endsWith(":missing"),
				),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	symlinkTest(
		"planner rejects symlinked docs/arc sources before reading outside project [requires symlink privilege]",
		() => {
			const root = mkdtempSync(join(tmpdir(), "adm-migrate-symlink-source-"));
			const outside = mkdtempSync(
				join(tmpdir(), "adm-migrate-outside-source-"),
			);
			try {
				mkdirSync(join(root, "docs"), { recursive: true });
				writeFileSync(
					join(outside, "GENERAL-ROADMAP.md"),
					"outside roadmap",
					"utf8",
				);
				symlinkSync(outside, join(root, "docs", "arc"), "dir");

				expect(() => validateAdmMigration(root)).toThrow(/symlink/);
			} finally {
				rmSync(root, { recursive: true, force: true });
				rmSync(outside, { recursive: true, force: true });
			}
		},
	);

	test("applies docs and archives manifest", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			const code = await runAdmCommand(
				"migrate",
				["--json"],
				root,
				captured.io,
			);
			expect(code).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				exit_code: number;
				data: {
					action: string;
					archive_path: string;
					count: number;
					manifest: Array<{ source_path: string; target_path: string }>;
				};
				archive_path: string;
				manifest: Array<{ source_path: string; target_path: string }>;
				count: number;
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.exit_code).toBe(0);
			expect(payload.data.action).toBe("migrate");
			expect(payload.count).toBe(7);
			expect(payload.archive_path).toMatch(/\.afol\/adm\/migrations\//);
			expect(payload.data.archive_path).toBe(payload.archive_path);
			expect(payload.data.count).toBe(payload.count);
			expect(payload.data.manifest).toEqual(payload.manifest);

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
				before.set(
					entry.target_path,
					readFileSync(join(root, entry.target_path)),
				);
			}

			const second = captureIo();
			const secondCode = await runAdmCommand(
				"migrate",
				["--json"],
				root,
				second.io,
			);
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
				expect(
					Buffer.compare(readFileSync(join(root, entry.target_path)), previous),
				).toBe(0);
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("uses suffixed archive path when migration timestamp collides", () => {
		const root = createFixture();
		const fixedDate = new Date("2026-06-20T01:02:03.004Z");
		try {
			const archiveDir = join(root, ".afol", "adm", "migrations");
			const existingArchive = join(
				archiveDir,
				"20260620T010203004Z_adm-migration.json",
			);
			mkdirSync(archiveDir, { recursive: true });
			writeFileSync(existingArchive, "existing archive", "utf8");

			const result = migrateAdm(root, fixedDate);
			expect(result.archive_path).toBe(
				".afol/adm/migrations/20260620T010203004Z_adm-migration-1.json",
			);
			expect(readFileSync(existingArchive, "utf8")).toBe("existing archive");
			expect(existsSync(join(root, result.archive_path))).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("validateAdmMigration reports drift when source or target changes", async () => {
		const root = createFixture();
		try {
			expect(
				await runAdmCommand("migrate", ["--json"], root, captureIo().io),
			).toBe(0);

			writeFileSync(
				join(root, "docs", "arc", "SPECS", "sample.md"),
				"spec v2",
				"utf8",
			);
			let report = validateAdmMigration(root);
			expect(report.ok).toBe(false);
			expect(
				report.findings.some(
					(finding) => finding.domain === "adm" && finding.severity === "warn",
				),
			).toBe(true);

			writeFileSync(
				join(root, "docs", "arc", "SPECS", "sample.md"),
				"spec",
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "adm", "specs", "sample.md"),
				"target v2",
				"utf8",
			);
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
			const beforeCode = await runAdmCommand(
				"validate",
				["--json"],
				root,
				before.io,
			);
			expect(beforeCode).toBe(1);
			const beforePayload = JSON.parse(before.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				exit_code: number;
				findings: Array<{ id: string }>;
				data: {
					action: string;
					ok: boolean;
					findings: Array<{ id: string }>;
				};
			};
			expect(beforePayload.schema).toBe("afol.result/v1");
			expect(beforePayload.ok).toBe(false);
			expect(beforePayload.exit_code).toBe(1);
			expect(beforePayload.data.action).toBe("validate");
			expect(beforePayload.data.ok).toBe(false);
			expect(beforePayload.findings.length).toBeGreaterThan(0);
			expect(beforePayload.data.findings.length).toBe(
				beforePayload.findings.length,
			);

			const migrate = captureIo();
			expect(await runAdmCommand("migrate", ["--json"], root, migrate.io)).toBe(
				0,
			);

			const after = captureIo();
			const afterCode = await runAdmCommand(
				"validate",
				["--json"],
				root,
				after.io,
			);
			expect(afterCode).toBe(0);
			const afterPayload = JSON.parse(after.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				exit_code: number;
				findings: Array<{ id: string }>;
				data: {
					action: string;
					ok: boolean;
					findings: Array<{ id: string }>;
				};
			};
			expect(afterPayload.schema).toBe("afol.result/v1");
			expect(afterPayload.ok).toBe(true);
			expect(afterPayload.exit_code).toBe(0);
			expect(afterPayload.data.action).toBe("validate");
			expect(afterPayload.data.ok).toBe(true);
			expect(afterPayload.findings).toEqual([]);
			expect(afterPayload.data.findings).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
