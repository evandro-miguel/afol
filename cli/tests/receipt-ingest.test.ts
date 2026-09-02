import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
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
import { kernelRegistry } from "../registry";
import {
	type ExternalReceipt,
	ingestExternalReceipt,
	MAX_RECEIPT_FUTURE_SKEW_MS,
	readExternalReceipt,
	receiptLockTesting,
} from "../services/receipts/ingest";
import { fixedHarnessProfile } from "../services/receipts/profiles";

const EMPTY_DIFF_SHA256 =
	"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

function fixture(): { root: string; receipt: ExternalReceipt } {
	const root = mkdtempSync(join(tmpdir(), "receipt-recovery-"));
	const session = "receipt-session";
	mkdirSync(join(root, ".afol", "wb", session), { recursive: true });
	writeFileSync(
		join(root, ".afol", "config.json"),
		JSON.stringify({
			schema_version: 1,
			project: { id: "123e4567-e89b-12d3-a456-426614174000" },
		}),
	);
	writeFileSync(
		join(root, ".afol", "wb", session, `${session}_task_01.md`),
		"| Task | State | Owner | Notes |\n|---|---|---|---|\n| T-01 | pending | worker | test |\n",
	);
	writeFileSync(join(root, "checked.txt"), "checked\n");
	execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
	execFileSync("git", ["config", "user.email", "receipt@example.test"], {
		cwd: root,
	});
	execFileSync("git", ["config", "user.name", "Receipt Test"], { cwd: root });
	execFileSync("git", ["add", "."], { cwd: root });
	execFileSync("git", ["commit", "-m", "fixture"], {
		cwd: root,
		stdio: "ignore",
	});
	const head = execFileSync("git", ["rev-parse", "HEAD"], {
		cwd: root,
		encoding: "utf8",
	}).trim();
	const profile = fixedHarnessProfile(kernelRegistry.commands, "coder");
	if (!profile) throw new Error("coder profile fixture missing");
	return {
		root,
		receipt: {
			receipt_id: "receipt-recovery-1",
			project_id: "123e4567-e89b-12d3-a456-426614174000",
			session_id: session,
			task_id: "T-01",
			harness_id: "external-harness",
			run_id: "run-1",
			harness_profile_id: profile.id,
			harness_profile_digest: profile.digest,
			source_commit: head,
			head_commit: head,
			diff_hash: EMPTY_DIFF_SHA256,
			checked_paths: ["checked.txt"],
			tool_trace_digest: "b".repeat(64),
			started_at: new Date(Date.now() - 1_000).toISOString(),
			finished_at: new Date().toISOString(),
			result: "passed",
		},
	};
}

describe("receipt ingestion recovery", () => {
	test("retries an interrupted reservation without duplicate evidence", () => {
		const { root, receipt } = fixture();
		let attempts = 0;
		try {
			expect(() =>
				ingestExternalReceipt({
					root,
					receipt,
					commands: kernelRegistry.commands,
					recordObservedEvidence: () => {
						attempts += 1;
						throw new Error("injected evidence interruption");
					},
				}),
			).toThrow("injected evidence interruption");
			expect(
				existsSync(join(root, ".afol", "data", "receipts", "external.jsonl")),
			).toBe(true);

			const committed = ingestExternalReceipt({
				root,
				receipt,
				commands: kernelRegistry.commands,
				recordObservedEvidence: () => {
					attempts += 1;
					return { id: "E-recovered" };
				},
			});
			expect(committed).toEqual({
				receipt_id: receipt.receipt_id,
				evidence_id: "E-recovered",
				status: "committed",
			});

			const duplicate = ingestExternalReceipt({
				root,
				receipt,
				commands: kernelRegistry.commands,
				recordObservedEvidence: () => {
					attempts += 1;
					return { id: "E-duplicate" };
				},
			});
			expect(duplicate.status).toBe("duplicate");
			expect(duplicate.evidence_id).toBe("E-recovered");
			expect(attempts).toBe(2);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("does not let a stale owner release its successor lock", () => {
		const { root, receipt } = fixture();
		const lockPath = receiptLockTesting.lockPath(root, receipt.receipt_id);
		const staleToken = "stale-owner-token";
		try {
			mkdirSync(join(root, ".afol", "data", "receipts", "locks"), {
				recursive: true,
			});
			writeFileSync(
				lockPath,
				`${JSON.stringify({
					owner_token: staleToken,
					acquired_at: new Date(Date.now() - 61_000).toISOString(),
				})}\n`,
			);
			const result = ingestExternalReceipt({
				root,
				receipt,
				commands: kernelRegistry.commands,
				recordObservedEvidence: () => {
					expect(receiptLockTesting.releaseIfOwned(lockPath, staleToken)).toBe(
						false,
					);
					expect(existsSync(lockPath)).toBe(true);
					return { id: "E-successor" };
				},
			});
			expect(result.evidence_id).toBe("E-successor");
			expect(existsSync(lockPath)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects receipts beyond the bounded future clock skew", () => {
		const { root, receipt } = fixture();
		const path = join(root, "future-receipt.json");
		try {
			writeFileSync(
				path,
				JSON.stringify({
					...receipt,
					finished_at: new Date(
						Date.now() + MAX_RECEIPT_FUTURE_SKEW_MS + 1_000,
					).toISOString(),
				}),
			);
			expect(() => readExternalReceipt(path)).toThrow(
				"allowed future clock skew",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fails closed on an oversized Git diff before recording evidence", () => {
		const { root, receipt } = fixture();
		let evidenceCalls = 0;
		try {
			writeFileSync(join(root, "oversized.txt"), "x".repeat(90_000), "utf8");
			execFileSync("git", ["add", "oversized.txt"], { cwd: root });
			execFileSync("git", ["commit", "-m", "oversized diff"], {
				cwd: root,
				stdio: "ignore",
			});
			const head = execFileSync("git", ["rev-parse", "HEAD"], {
				cwd: root,
				encoding: "utf8",
			}).trim();
			const diff = execFileSync(
				"git",
				[
					"diff",
					"--no-ext-diff",
					"--binary",
					`${receipt.source_commit}..${head}`,
				],
				{ cwd: root, maxBuffer: 256 * 1024 },
			);
			const oversizedReceipt: ExternalReceipt = {
				...receipt,
				head_commit: head,
				diff_hash: createHash("sha256").update(diff).digest("hex"),
			};

			expect(() =>
				ingestExternalReceipt({
					root,
					receipt: oversizedReceipt,
					commands: kernelRegistry.commands,
					recordObservedEvidence: () => {
						evidenceCalls += 1;
						return { id: "must-not-record" };
					},
				}),
			).toThrow();
			expect(evidenceCalls).toBe(0);
			expect(
				existsSync(
					join(root, ".afol", "wb", receipt.session_id, ".evidence.jsonl"),
				),
			).toBe(false);
			expect(
				existsSync(join(root, ".afol", "data", "receipts", "external.jsonl")),
			).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
