import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	hashManagedFile,
	refreshManagedHashes,
} from "../dev/generate-manifest";

const temporaryRoots: string[] = [];

function makeRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "afol-manifest-hash-"));
	temporaryRoots.push(root);
	mkdirSync(join(root, "docs"), { recursive: true });
	mkdirSync(join(root, "assets"), { recursive: true });
	return root;
}

function expectedRawHash(content: Buffer): string {
	return createHash("sha256").update(content).digest("hex");
}

afterEach(() => {
	for (const root of temporaryRoots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe("managed manifest hashes", () => {
	test("keeps the manifest hash stable across LF and CRLF text files", () => {
		const lfRoot = makeRoot();
		const crlfRoot = makeRoot();
		const lfText = Buffer.from("title: Example\nbody: unchanged\n", "utf8");
		const crlfText = Buffer.from(
			"title: Example\r\nbody: unchanged\r\n",
			"utf8",
		);

		writeFileSync(join(lfRoot, "docs", "rule.md"), lfText);
		writeFileSync(join(crlfRoot, "docs", "rule.md"), crlfText);

		const lfManifest = refreshManagedHashes(lfRoot, ".agents/manifest.json", {
			"docs/rule.md": "stale",
		});
		const crlfManifest = refreshManagedHashes(
			crlfRoot,
			".agents/manifest.json",
			{ "docs/rule.md": "stale" },
		);

		expect(crlfManifest).toEqual(lfManifest);
		expect(crlfManifest?.["docs/rule.md"]).toBe(
			hashManagedFile(join(lfRoot, "docs", "rule.md")),
		);
	});

	test("resolves template managed files with Windows manifest paths", () => {
		const root = makeRoot();
		const templateRoot = join(root, "src", "project-template");
		mkdirSync(join(root, ".afol", "data", "events"), { recursive: true });
		mkdirSync(join(templateRoot, ".afol", "data", "events"), {
			recursive: true,
		});
		writeFileSync(
			join(root, ".afol", "data", "events", "README.md"),
			"root content\n",
			"utf8",
		);
		writeFileSync(
			join(templateRoot, ".afol", "data", "events", "README.md"),
			"template content\n",
			"utf8",
		);

		const manifest = refreshManagedHashes(
			root,
			"src\\project-template\\.agents\\manifest.json",
			{ ".afol/data/events/README.md": "stale" },
		);

		expect(manifest?.[".afol/data/events/README.md"]).toBe(
			hashManagedFile(
				join(templateRoot, ".afol", "data", "events", "README.md"),
			),
		);
	});

	test("does not hide semantic text changes", () => {
		const root = makeRoot();
		const path = join(root, "docs", "rule.md");
		writeFileSync(path, "title: Changed\r\nbody: unchanged\r\n", "utf8");

		const manifest = refreshManagedHashes(root, ".agents/manifest.json", {
			"docs/rule.md": "stale",
		});

		writeFileSync(path, "title: Different\nbody: unchanged\n", "utf8");
		const changedManifest = refreshManagedHashes(
			root,
			".agents/manifest.json",
			{ "docs/rule.md": "stale" },
		);

		expect(changedManifest?.["docs/rule.md"]).not.toBe(
			manifest?.["docs/rule.md"],
		);
	});

	test("preserves raw hashes for binary managed files", () => {
		const root = makeRoot();
		const content = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x00]);
		const path = join(root, "assets", "icon.bin");
		writeFileSync(path, content);

		const manifest = refreshManagedHashes(root, ".agents/manifest.json", {
			"assets/icon.bin": "stale",
		});

		expect(manifest?.["assets/icon.bin"]).toBe(expectedRawHash(content));
		expect(hashManagedFile(path)).toBe(expectedRawHash(content));
	});
});
