import { expect, test } from "bun:test";
import { runReceiptCommand } from "../commands/receipt";

test("missing receipt action explains the valid invocation without reading a project", async () => {
	const output: string[] = [];
	expect(
		await runReceiptCommand("", [], "/nonexistent", {
			stdout: (line) => output.push(line),
			stderr: (line) => output.push(line),
		}),
	).toBe(2);
	const result = JSON.parse(output[0] ?? "{}");
	expect(result).toMatchObject({ ok: false, exit_code: 2 });
	expect(result.error.message).toContain("afol receipt ingest --file");
	expect(result.error.message).not.toContain("Unknown receipt action:");
});
