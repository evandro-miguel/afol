import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
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

function sha256Hex(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function portablePath(value: string): string {
	return value.replaceAll("\\", "/");
}

function createFixture(): string {
	const root = mkdtempSync(join(tmpdir(), "adm-plan-"));
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

describe("adm plan", () => {
	test("plan json includes manifest entries", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			const code = await runAdmCommand("plan", ["--json"], root, captured.io);
			expect(code).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.exit_code).toBe(0);
			expect(payload.action).toBe("plan");
			expect(Array.isArray(payload.manifest)).toBe(true);
			expect(payload.data).toMatchObject({
				action: "plan",
				manifest: payload.manifest,
			});
			const bySource = new Map(
				(payload.manifest as Array<{ source_path: string }>).map((entry) => [
					portablePath(entry.source_path),
					entry,
				]),
			);
			expect(bySource.get("docs/arc/GENERAL-ROADMAP.md")).toMatchObject({
				target_path: ".afol/adm/roadmap/GENERAL-ROADMAP.md",
				source_hash: sha256Hex("roadmap"),
				size_bytes: 7,
				status: "planned",
			});
			expect(bySource.get("docs/arc/PROJECT-MANIFESTO.md")).toMatchObject({
				target_path: ".afol/adm/doctrine/PROJECT-MANIFESTO.md",
			});
			expect(bySource.get("docs/arc/ARCHITECTURE.md")).toMatchObject({
				target_path: ".afol/adm/doctrine/ARCHITECTURE.md",
			});
			expect(bySource.get("docs/arc/SPECS/sample.md")).toMatchObject({
				target_path: ".afol/adm/specs/sample.md",
			});
			expect(bySource.get("docs/arc/SPECS/nested/deep.md")).toMatchObject({
				target_path: ".afol/adm/specs/nested/deep.md",
			});
			expect(bySource.get("docs/arc/DECISIONS/decision.md")).toMatchObject({
				target_path: ".afol/adm/decisions/decision.md",
			});
			expect(bySource.get("docs/arc/CHANGELOG.md")).toMatchObject({
				target_path: ".afol/adm/changelog/CHANGELOG.md",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("plan hashes stay stable", async () => {
		const root = createFixture();
		try {
			const first = captureIo();
			const second = captureIo();
			await runAdmCommand("plan", ["--json"], root, first.io);
			await runAdmCommand("plan", ["--json"], root, second.io);
			expect(first.stdout[0]).toBe(second.stdout[0]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("dry-run writes nothing and reports dry_run", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			const code = await runAdmCommand(
				"migrate",
				["--dry-run", "--json"],
				root,
				captured.io,
			);
			expect(code).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload.dry_run).toBe(true);
			expect(Array.isArray(payload.manifest)).toBe(true);
			expect(existsSync(join(root, ".afol", "adm"))).toBe(false);
			expect(captured.stderr).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
