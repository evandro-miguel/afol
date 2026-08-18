import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicWriteText } from "../services/io/atomic";

test("atomicWriteText supports targets beneath long directory paths", () => {
	const root = mkdtempSync(join(tmpdir(), "afol-atomic-"));
	const deepDirectory = join(
		root,
		...Array.from(
			{ length: 10 },
			(_, index) => `segment-${index.toString().padStart(2, "0")}-abcdefghijkl`,
		),
	);
	const target = join(deepDirectory, "plan.md");

	try {
		atomicWriteText(target, "status: closed\n");
		expect(readFileSync(target, "utf8")).toBe("status: closed\n");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
