import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	findCanonicalSpecDocuments,
	listCanonicalSpecDocuments,
} from "../services/governance/spec-resolver";

function createFixture(): string {
	const root = mkdtempSync(join(tmpdir(), "spec-resolver-test-"));
	mkdirSync(join(root, ".afol", "adm", "specs"), { recursive: true });
	return root;
}

function writeSpec(
	root: string,
	filename: string,
	id: string,
	lineEnding: "\n" | "\r\n",
	parentSpec?: string,
): void {
	const frontmatter = [
		"---",
		"doc_type: spec",
		`id: ${id}`,
		"status: active",
		...(parentSpec ? [`parent_spec: ${parentSpec}`] : []),
		"---",
		"",
		`# ${id}`,
		"",
	].join(lineEnding);
	writeFileSync(join(root, ".afol", "adm", "specs", filename), frontmatter);
}

describe("canonical spec resolver frontmatter", () => {
	test("resolves a CRLF spec by exact id, stem, relative path, and absolute path", () => {
		const root = createFixture();
		try {
			const filename = "crlf-spec.md";
			const relativePath = ".afol/adm/specs/crlf-spec.md";
			const absolutePath = join(root, ".afol", "adm", "specs", filename);
			writeSpec(root, filename, "crlf-spec-id", "\r\n");

			expect(findCanonicalSpecDocuments(root, "crlf-spec-id")).toHaveLength(1);
			expect(findCanonicalSpecDocuments(root, "crlf-spec")).toHaveLength(1);
			expect(findCanonicalSpecDocuments(root, relativePath)).toHaveLength(1);
			expect(findCanonicalSpecDocuments(root, absolutePath)).toHaveLength(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("preserves LF spec resolution", () => {
		const root = createFixture();
		try {
			writeSpec(root, "lf-spec.md", "lf-spec", "\n");
			const [document] = listCanonicalSpecDocuments(root);

			expect(document?.id).toBe("lf-spec");
			expect(findCanonicalSpecDocuments(root, "lf-spec")).toHaveLength(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("does not treat a child parent_spec reference as a parent match", () => {
		const root = createFixture();
		try {
			writeSpec(root, "parent-spec.md", "parent-spec", "\r\n");
			writeSpec(root, "child-spec.md", "child-spec", "\r\n", "parent-spec");

			const matches = findCanonicalSpecDocuments(root, "parent-spec");
			expect(matches.map((document) => document.id)).toEqual(["parent-spec"]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
