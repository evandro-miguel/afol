import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { boundedSpawn } from "../core/subprocess";
import {
	type AcceptanceContract,
	acceptanceContractDigest,
	evaluateBenchmarkAcceptance,
	parseAcceptanceContract,
} from "../services/benchmark/acceptance";

const repoRoot = resolve(import.meta.dir, "../..");
const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { force: true, recursive: true });
});

function sha256(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}

function currentHead(root: string): string {
	const result = boundedSpawn("git", ["rev-parse", "--verify", "HEAD"], {
		cwd: root,
		timeoutMs: 5_000,
	});
	expect(result.ok).toBe(true);
	return result.stdout.trim();
}

function fixture(): string {
	mkdirSync(join(repoRoot, ".tmp"), { recursive: true });
	const root = mkdtempSync(join(repoRoot, ".tmp", "benchmark-acceptance-"));
	roots.push(root);
	writeFileSync(join(root, "artifact.txt"), "stable", "utf8");
	return root;
}

function passingContract(
	argv: string[] = [
		process.execPath,
		"-e",
		'const fs = require("node:fs"); if (fs.readFileSync("artifact.txt", "utf8") !== "stable") process.exit(1);',
	],
	artifacts = ["artifact.txt"],
): AcceptanceContract {
	return { checks: [{ id: "assert-artifact", argv }], artifacts };
}

function receipt(root: string, contract: AcceptanceContract) {
	return {
		source_commit: currentHead(root),
		contract_sha256: acceptanceContractDigest(contract),
		artifacts: [{ path: "artifact.txt", sha256: sha256("stable") }],
	};
}

describe("benchmark acceptance contract", () => {
	test("rejects empty, duplicate, and malformed contracts", () => {
		for (const value of [
			{ checks: [], artifacts: ["artifact.txt"] },
			{ checks: [{ id: "check", argv: ["true"] }], artifacts: [] },
			{
				checks: [
					{ id: "check", argv: ["true"] },
					{ id: "check", argv: ["false"] },
				],
				artifacts: ["artifact.txt"],
			},
			{ checks: [{ id: "check", argv: [] }], artifacts: ["artifact.txt"] },
			{ checks: [{ id: "check", argv: ["true"] }], artifacts: ["../outside"] },
		]) {
			expect(() => parseAcceptanceContract(value)).toThrow();
		}
	});

	test("passes independent argv checks and exact current artifact evidence", () => {
		const root = fixture();
		const contract = passingContract();
		const result = evaluateBenchmarkAcceptance(
			root,
			contract,
			receipt(root, contract),
		);
		expect(result.passed).toBe(true);
		expect(result.notes).toEqual([]);
		expect(result.checks).toEqual([
			expect.objectContaining({
				id: "assert-artifact",
				status: "passed",
				exit_code: 0,
			}),
		]);
	});

	test("rejects missing, symlinked, outside, and duplicate artifact evidence", () => {
		const root = fixture();
		const missing = passingContract(undefined, ["missing.txt"]);
		const missingResult = evaluateBenchmarkAcceptance(root, missing, {
			...receipt(root, missing),
			artifacts: [{ path: "missing.txt", sha256: sha256("stable") }],
		});
		expect(missingResult.passed).toBe(false);

		writeFileSync(join(root, "outside.txt"), "stable", "utf8");
		symlinkSync("outside.txt", join(root, "link.txt"));
		const link = passingContract(undefined, ["link.txt"]);
		const linkResult = evaluateBenchmarkAcceptance(root, link, {
			...receipt(root, link),
			artifacts: [{ path: "link.txt", sha256: sha256("stable") }],
		});
		expect(linkResult.passed).toBe(false);

		const duplicateEvidence = {
			...receipt(root, passingContract()),
			artifacts: [
				{ path: "artifact.txt", sha256: sha256("stable") },
				{ path: "artifact.txt", sha256: sha256("stable") },
			],
		};
		const duplicateResult = evaluateBenchmarkAcceptance(
			root,
			passingContract(),
			duplicateEvidence,
		);
		expect(duplicateResult.passed).toBe(false);

		const outside = passingContract(undefined, ["../outside.txt"]);
		const outsideResult = evaluateBenchmarkAcceptance(root, outside, {
			...receipt(root, passingContract()),
			artifacts: [{ path: "../outside.txt", sha256: sha256("stable") }],
		});
		expect(outsideResult.passed).toBe(false);
	});

	test("rejects forged source, contract, and artifact digests before executing checks", () => {
		const root = fixture();
		const marker = join(root, "marker.txt");
		const contract = passingContract([
			process.execPath,
			"-e",
			'require("node:fs").writeFileSync("marker.txt", "ran")',
		]);
		const valid = receipt(root, contract);
		for (const forged of [
			{ ...valid, source_commit: "0".repeat(40) },
			{ ...valid, contract_sha256: "0".repeat(64) },
			{
				...valid,
				artifacts: [{ path: "artifact.txt", sha256: "0".repeat(64) }],
			},
		]) {
			expect(evaluateBenchmarkAcceptance(root, contract, forged).passed).toBe(
				false,
			);
			expect(existsSync(marker)).toBe(false);
		}
	});

	test("rejects a failing check and rejects a check that changes an artifact", () => {
		const root = fixture();
		const failed = passingContract([process.execPath, "-e", "process.exit(7)"]);
		const failedResult = evaluateBenchmarkAcceptance(
			root,
			failed,
			receipt(root, failed),
		);
		expect(failedResult.passed).toBe(false);
		expect(failedResult.checks[0]).toMatchObject({
			status: "failed",
			exit_code: 7,
		});

		const changed = passingContract([
			process.execPath,
			"-e",
			'require("node:fs").writeFileSync("artifact.txt", "changed")',
		]);
		const changedResult = evaluateBenchmarkAcceptance(root, changed, {
			...receipt(root, changed),
			artifacts: [{ path: "artifact.txt", sha256: sha256("stable") }],
		});
		expect(changedResult.passed).toBe(false);
		expect(changedResult.notes.join("\n")).toContain("artifact-changed");
	});

	test("blocks no-op and unavailable checks while distinguishing timeout", () => {
		const root = fixture();
		const noop = passingContract(["true"]);
		const noopResult = evaluateBenchmarkAcceptance(
			root,
			noop,
			receipt(root, noop),
		);
		expect(noopResult.passed).toBe(false);
		expect(noopResult.checks[0]?.status).toBe("blocked");

		const unavailable = passingContract(["missing-acceptance-executable"]);
		const unavailableResult = evaluateBenchmarkAcceptance(
			root,
			unavailable,
			receipt(root, unavailable),
		);
		expect(unavailableResult.passed).toBe(false);
		expect(unavailableResult.notes.join("\n")).toContain("check-unavailable");

		const slower = passingContract([
			process.execPath,
			"-e",
			"setTimeout(() => {}, 2100)",
		]);
		expect(
			evaluateBenchmarkAcceptance(root, slower, receipt(root, slower)).passed,
		).toBe(true);

		const timeout = passingContract([
			process.execPath,
			"-e",
			"setTimeout(() => {}, 60000)",
		]);
		const timeoutResult = evaluateBenchmarkAcceptance(
			root,
			timeout,
			receipt(root, timeout),
		);
		expect(timeoutResult.passed).toBe(false);
		expect(timeoutResult.notes.join("\n")).toContain("check-timeout");
	}, 40_000);

	test("ignores forged telemetry and receipt commands", () => {
		const root = fixture();
		const contract = passingContract();
		const result = evaluateBenchmarkAcceptance(root, contract, {
			...receipt(root, contract),
			pass: false,
			check_exit_code: 42,
			command: ["false"],
			events: [{ type: "model.completed", pass: false }],
		});
		expect(result.passed).toBe(true);
	});
});
