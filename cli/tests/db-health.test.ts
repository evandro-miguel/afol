import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDbCommand } from "../commands/db";
import { openDb } from "../services/state/db";
import { checkDbHealth } from "../services/state/db-health";
import { hydrateSession } from "../services/state/session-state";
import { removeTestRoot } from "./windows-test-support";

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
	const root = mkdtempSync(join(tmpdir(), "db-health-"));
	mkdirSync(join(root, ".agents"), { recursive: true });
	mkdirSync(join(root, ".afol", "wb", "session-a"), { recursive: true });
	writeFileSync(
		join(root, ".agents", "config.json"),
		JSON.stringify({ schema_version: 1 }),
		"utf8",
	);
	writeFileSync(
		join(root, ".agents", "lock.json"),
		JSON.stringify({ schema_version: 1, locked: true }),
		"utf8",
	);
	writeFileSync(
		join(root, ".afol", "wb", "session-a", "plan.md"),
		["# Plan", "", "body"].join("\n"),
		"utf8",
	);
	return root;
}

describe("db health", () => {
	test("missing db fails", async () => {
		const root = createFixture();
		try {
			const report = checkDbHealth(root);
			expect(report.db_exists).toBe(false);
			expect(report.ok).toBe(false);
			expect(report.findings[0]?.severity).toBe("fail");
			expect(report.findings[0]?.message).toContain("missing state db");
			const captured = captureIo();
			expect(await runDbCommand("health", ["--json"], root, captured.io)).toBe(
				1,
			);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(false);
			expect(payload.exit_code).toBe(1);
			expect(payload.db_exists).toBe(false);
			expect(Array.isArray(payload.findings)).toBe(true);
			expect(payload.data.db_exists).toBe(false);
		} finally {
			removeTestRoot(root);
		}
	});

	test("hydrate and openDb produce healthy db", () => {
		const root = createFixture();
		try {
			hydrateSession(root, "session-a");
			openDb(root).close();
			const report = checkDbHealth(root);
			expect(report.db_exists).toBe(true);
			expect(report.schema_ok).toBe(true);
			expect(report.orphan_records).toBe(0);
			expect(report.stale_sources).toBe(0);
			expect(report.ok).toBe(true);
		} finally {
			removeTestRoot(root);
		}
	});

	test("json output has expected shape", async () => {
		const root = createFixture();
		try {
			hydrateSession(root, "session-a");
			const captured = captureIo();
			expect(await runDbCommand("health", ["--json"], root, captured.io)).toBe(
				0,
			);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.exit_code).toBe(0);
			expect(typeof payload.ok).toBe("boolean");
			expect(typeof payload.schema_ok).toBe("boolean");
			expect(typeof payload.db_exists).toBe("boolean");
			expect(typeof payload.wal_enabled).toBe("boolean");
			expect(typeof payload.fts_ok).toBe("boolean");
			expect(typeof payload.orphan_records).toBe("number");
			expect(typeof payload.stale_sources).toBe("number");
			expect(typeof payload.size_bytes).toBe("number");
			expect(Array.isArray(payload.findings)).toBe(true);
			expect(payload.data.schema_ok).toBe(true);
			expect(payload.data.db_exists).toBe(true);
		} finally {
			removeTestRoot(root);
		}
	});

	test("text output is compact", async () => {
		const root = createFixture();
		try {
			hydrateSession(root, "session-a");
			const captured = captureIo();
			expect(await runDbCommand("health", [], root, captured.io)).toBe(0);
			expect(captured.stdout.join("\n")).toContain("db health:");
		} finally {
			removeTestRoot(root);
		}
	});

	test("missing tables are reported", () => {
		const root = createFixture();
		try {
			const dbPath = join(root, ".afol", "state", "afol.db");
			mkdirSync(join(root, ".afol", "state"), { recursive: true });
			const db = new Database(dbPath);
			db.close();
			const report = checkDbHealth(root);
			expect(report.schema_ok).toBe(false);
			expect(
				report.findings.some((finding) =>
					finding.message.includes("missing tables"),
				),
			).toBe(true);
		} finally {
			removeTestRoot(root);
		}
	});
});
