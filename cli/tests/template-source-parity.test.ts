import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import {
	DEFAULT_TEMPLATE_FILES,
	DEFAULT_TEMPLATE_HASH,
	DEFAULT_TEMPLATE_METADATA,
	type GeneratedTemplateFile,
} from "../generated/template";
import {
	buildTemplatePayload,
	type TemplatePayload,
} from "../services/template/payload";

const forbiddenExactPaths = new Set([
	"a",
	"afol",
	"Justfile",
	".agents/agents",
	".agents/agents-mcp",
	".agents/config.json",
]);
const forbiddenPathPrefixes = [".agents/runtime/", ".agents/scripts/"];

type GeneratedTemplate = {
	metadata: typeof DEFAULT_TEMPLATE_METADATA;
	hash: string;
	files: Readonly<Record<string, GeneratedTemplateFile>>;
};

function inspectSourceParity(
	source: TemplatePayload,
	generated: GeneratedTemplate,
): string[] {
	const issues: string[] = [];
	const sourcePaths = Object.keys(source.files).sort();
	const generatedPaths = Object.keys(generated.files).sort();

	if (source.sourceFileCount !== generated.metadata.sourceFileCount) {
		issues.push("source-file-count-mismatch");
	}
	if (source.includedFileCount !== generated.metadata.includedFileCount) {
		issues.push("included-file-count-mismatch");
	}
	if (
		source.excludedForbiddenCount !== generated.metadata.excludedForbiddenCount
	) {
		issues.push("excluded-forbidden-count-mismatch");
	}
	if (source.templateHash !== generated.metadata.templateHash) {
		issues.push("metadata-template-hash-mismatch");
	}
	if (source.templateHash !== generated.hash) {
		issues.push("exported-template-hash-mismatch");
	}
	if (sourcePaths.length === 0 || generatedPaths.length === 0) {
		issues.push("template-payload-empty");
	}

	for (const path of sourcePaths) {
		if (!generated.files[path]) {
			issues.push(`generated-path-missing:${path}`);
		}
	}
	for (const path of generatedPaths) {
		if (!source.files[path]) {
			issues.push(`generated-path-extra:${path}`);
		}
		if (
			isAbsolute(path) ||
			path.includes("\\") ||
			path.split("/").includes("..")
		) {
			issues.push(`unsafe-path:${path}`);
		}
		if (
			forbiddenExactPaths.has(path) ||
			forbiddenPathPrefixes.some((prefix) => path.startsWith(prefix))
		) {
			issues.push(`forbidden-path:${path}`);
		}
	}

	for (const path of sourcePaths) {
		const sourceEntry = source.files[path];
		const generatedEntry = generated.files[path];
		if (!sourceEntry || !generatedEntry) {
			continue;
		}
		for (const field of ["path", "contentBase64", "sha256", "bytes"] as const) {
			if (sourceEntry[field] !== generatedEntry[field]) {
				issues.push(`entry-${field}-mismatch:${path}`);
			}
		}
	}

	if (!source.files[".afol/config.json"]) {
		issues.push("canonical-config-missing");
	}
	if (source.files[".agents/config.json"]) {
		issues.push("legacy-config-present");
	}

	return issues;
}

describe("source-only generated template parity", () => {
	test("canonicalizes CRLF source files before hashing template entries", async () => {
		const crlfRoot = mkdtempSync(join(tmpdir(), "template-crlf-"));
		const lfRoot = mkdtempSync(join(tmpdir(), "template-lf-"));
		try {
			writeFileSync(join(crlfRoot, "AGENTS.md"), "line one\r\nline two\r\n");
			writeFileSync(join(lfRoot, "AGENTS.md"), "line one\nline two\n");

			const [crlfPayload, lfPayload] = await Promise.all([
				buildTemplatePayload(crlfRoot),
				buildTemplatePayload(lfRoot),
			]);

			expect(crlfPayload.templateHash).toBe(lfPayload.templateHash);
			expect(crlfPayload.files["AGENTS.md"]).toEqual(
				lfPayload.files["AGENTS.md"],
			);
		} finally {
			rmSync(crlfRoot, { recursive: true, force: true });
			rmSync(lfRoot, { recursive: true, force: true });
		}
	});

	test("matches the complete source payload without external dependencies", async () => {
		const source = await buildTemplatePayload(
			join(process.cwd(), "src", "project-template"),
		);

		expect(
			inspectSourceParity(source, {
				metadata: DEFAULT_TEMPLATE_METADATA,
				hash: DEFAULT_TEMPLATE_HASH,
				files: DEFAULT_TEMPLATE_FILES,
			}),
		).toEqual([]);
	});

	test("detects semantic drift without regenerating the template", async () => {
		const source = await buildTemplatePayload(
			join(process.cwd(), "src", "project-template"),
		);
		const canonicalConfig = DEFAULT_TEMPLATE_FILES[".afol/config.json"];
		expect(canonicalConfig).toBeDefined();
		if (!canonicalConfig) {
			throw new Error("generated canonical config entry is missing");
		}

		const driftedFiles = {
			...DEFAULT_TEMPLATE_FILES,
			".afol/config.json": {
				...canonicalConfig,
				sha256: "0".repeat(64),
			},
		};
		const issues = inspectSourceParity(source, {
			metadata: DEFAULT_TEMPLATE_METADATA,
			hash: DEFAULT_TEMPLATE_HASH,
			files: driftedFiles,
		});

		expect(issues).toContain("entry-sha256-mismatch:.afol/config.json");
	});
});
