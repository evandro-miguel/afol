#!/usr/bin/env bun

import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { TEMPLATE_ROOT } from "../schemas/template-policy";
import {
	buildTemplatePayload,
	renderBuiltinAssetsModule,
	renderTemplateModule,
} from "../services/template/payload";

function formatGeneratedTemplate(outputPath: string): void {
	const result = Bun.spawnSync([
		process.execPath,
		"x",
		"--bun",
		"@biomejs/biome",
		"format",
		"--write",
		outputPath,
	]);
	if (!result.success) {
		throw new Error(
			`failed to format generated template: ${result.stderr.toString().trim()}`,
		);
	}
}

function renderFormattedTemplate(rendered: string): string {
	const scratchDir = mkdtempSync(join(tmpdir(), "afol-template-check-"));
	const scratchPath = join(scratchDir, "template.ts");
	try {
		writeFileSync(scratchPath, rendered, "utf8");
		formatGeneratedTemplate(scratchPath);
		return readFileSync(scratchPath, "utf8");
	} finally {
		rmSync(scratchDir, { recursive: true, force: true });
	}
}

async function main(): Promise<void> {
	const check = process.argv.includes("--check");
	const repoRoot = resolve(import.meta.dir, "..", "..");
	const sourceRoot = join(repoRoot, TEMPLATE_ROOT);
	const payload = await buildTemplatePayload(sourceRoot);
	payload.sourceRoot = TEMPLATE_ROOT;
	const builtinSourceRoot = join(repoRoot, "src", "builtin-assets");
	const builtinPayload = await buildTemplatePayload(builtinSourceRoot);
	builtinPayload.sourceRoot = "src/builtin-assets";

	const outputDir = join(repoRoot, "cli", "generated");
	const outputPath = join(outputDir, "template.ts");
	const rendered = renderTemplateModule(payload);
	const builtinOutputPath = join(outputDir, "builtin-assets.ts");
	const builtinRendered = renderBuiltinAssetsModule(builtinPayload);

	if (check) {
		const expected = renderFormattedTemplate(rendered);
		const current = readFileSync(outputPath, "utf8");
		const expectedBuiltin = renderFormattedTemplate(builtinRendered);
		const currentBuiltin = readFileSync(builtinOutputPath, "utf8");
		if (current !== expected || currentBuiltin !== expectedBuiltin) {
			throw new Error(
				"generated template payload is stale; run `bun run template:generate`",
			);
		}
		console.log(
			[
				`template payload already synced`,
				`source=${relative(repoRoot, sourceRoot)}`,
				`output=${relative(repoRoot, outputPath)}`,
				`template_hash=${payload.templateHash}`,
				`builtin_assets_hash=${builtinPayload.templateHash}`,
			].join(" "),
		);
		return;
	}

	mkdirSync(outputDir, { recursive: true });
	writeFileSync(outputPath, rendered, "utf8");
	formatGeneratedTemplate(outputPath);
	writeFileSync(builtinOutputPath, builtinRendered, "utf8");
	formatGeneratedTemplate(builtinOutputPath);

	const relativeSource = relative(repoRoot, sourceRoot);
	const relativeOutput = relative(repoRoot, outputPath);
	console.log(
		[
			`generated template payload`,
			`source=${relativeSource}`,
			`output=${relativeOutput}`,
			`source_files=${payload.sourceFileCount}`,
			`included=${payload.includedFileCount}`,
			`forbidden_excluded=${payload.excludedForbiddenCount}`,
			`template_hash=${payload.templateHash}`,
			`builtin_assets=${builtinPayload.includedFileCount}`,
			`builtin_assets_hash=${builtinPayload.templateHash}`,
		].join(" "),
	);
}

if (import.meta.main) {
	await main();
}
