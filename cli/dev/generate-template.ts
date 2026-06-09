#!/usr/bin/env bun

import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { TEMPLATE_ROOT } from "../schemas/template-policy";
import {
	buildTemplatePayload,
	renderTemplateModule,
} from "../services/template/payload";

function formatGeneratedTemplate(outputPath: string): void {
	const result = Bun.spawnSync([
		"bunx",
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

async function main(): Promise<void> {
	const repoRoot = resolve(import.meta.dir, "..", "..");
	const sourceRoot = join(repoRoot, TEMPLATE_ROOT);
	const payload = await buildTemplatePayload(sourceRoot);
	payload.sourceRoot = TEMPLATE_ROOT;

	const outputDir = join(repoRoot, "cli", "generated");
	const outputPath = join(outputDir, "template.ts");
	mkdirSync(outputDir, { recursive: true });
	writeFileSync(outputPath, renderTemplateModule(payload), "utf8");
	formatGeneratedTemplate(outputPath);

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
		].join(" "),
	);
}

if (import.meta.main) {
	await main();
}
