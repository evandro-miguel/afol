import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyDistReleaseReceipts } from "../dev/dist-smoke";

function sha256Hex(bytes: Buffer): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function writeReceiptFixture(root: string): void {
	mkdirSync(join(root, "dist"), { recursive: true });
	writeFileSync(join(root, "dist", "afol"), "artifact-bytes", "utf8");
	const sha256 = sha256Hex(readFileSync(join(root, "dist", "afol")));
	writeFileSync(
		join(root, "dist", "afol.sha256"),
		`${sha256}  dist/afol\n`,
		"utf8",
	);
	writeFileSync(
		join(root, "dist", "afol.provenance.json"),
		`${JSON.stringify(
			{
				artifact: "dist/afol",
				sha256,
				size_bytes: "artifact-bytes".length,
			},
			null,
			2,
		)}\n`,
		"utf8",
	);
}

describe("dist smoke release receipts", () => {
	test("verifyDistReleaseReceipts binds and preserves checksum and provenance", () => {
		const root = mkdtempSync(join(tmpdir(), "dist-smoke-receipts-"));
		try {
			writeReceiptFixture(root);
			const checksumPath = join(root, "dist", "afol.sha256");
			const provenancePath = join(root, "dist", "afol.provenance.json");
			const checksumBefore = readFileSync(checksumPath);
			const provenanceBefore = readFileSync(provenancePath);

			const receipts = verifyDistReleaseReceipts(root);
			expect(receipts.sha256).toBe(
				sha256Hex(readFileSync(join(root, "dist", "afol"))),
			);
			expect(readFileSync(checksumPath).equals(checksumBefore)).toBe(true);
			expect(readFileSync(provenancePath).equals(provenanceBefore)).toBe(true);

			writeFileSync(checksumPath, "deadbeef  dist/afol\n", "utf8");
			expect(() => verifyDistReleaseReceipts(root)).toThrow(/does not bind/);
			writeReceiptFixture(root);

			writeFileSync(
				provenancePath,
				readFileSync(provenancePath, "utf8").replace(
					'"sha256": "',
					'"sha256": "deadbeef',
				),
				"utf8",
			);
			expect(() => verifyDistReleaseReceipts(root)).toThrow(/does not bind/);
			writeReceiptFixture(root);

			rmSync(provenancePath);
			expect(() => verifyDistReleaseReceipts(root)).toThrow(
				/run release provenance before dist smoke/,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
