import { mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { atomicWriteText } from "../io/atomic";
import { resolveProjectPaths } from "../project/paths";

function resolverPath(root: string): string {
	return join(resolveProjectPaths(root).abs.admDir, "routing", "resolver.md");
}

function resolverDisplayPath(root: string): string {
	return (
		relative(root, resolverPath(root)).replace(/\\/g, "/") ||
		".afol/adm/routing/resolver.md"
	);
}

function section(title: string, lines: string[]): string[] {
	return [`## ${title}`, ...lines, ""];
}

export function detectResolver(root: string): string {
	const target = resolverDisplayPath(root);
	return [
		"# Resolver routing",
		"",
		`Target: ${target}`,
		"Scope: canonical-layout routing reference; verify path existence before load.",
		"",
		...section("Signals", [
			"| task signal | load |",
			"| --- | --- |",
			"| rules or skills | `.agents/rules/README.md`, `.agents/rules/RULE-006-applicable-rule-resolution.md`, `.afol/skills/**` (if present) |",
			"| tools or commands | `afol schema resolver --json`, `afol schema resolver --write`, `afol validate project` |",
			"| adm or routing docs | `docs/arc/ARCHITECTURE.md#9.4 Resolver`, `docs/arc/SPECS/260612_afol-administration-project-structure-onion-architecture_spec_01.md` |",
			"| pstr or surface maps | `.afol/pstr/cli.md`, `.afol/pstr/docs.md`, `.afol/pstr/template.md`, `.afol/pstr/config.md` (generated; verify present) |",
			"| memory or library refs | `.afol/memory/memory.md`, `.afol/library/**` (if present), `docs/arc/SPECS/260612_global-project-research-library_spec-child_01.md` |",
			"| validation or trust | `bun run typecheck`, `bun test cli/tests/schema-command.test.ts` |",
		]),
		...section("Rules", [
			"- `.agents/rules/README.md`",
			"- `.agents/rules/RULE-006-applicable-rule-resolution.md`",
			"- `.agents/rules/RULE-004-validation-linting.md`",
			"- `.agents/rules/RULE-005-folder-structure.md`",
		]),
		...section("Skills", [
			"- `.afol/skills/agentic-folder-sys/`",
			"- `.afol/skills/afol-integration-test/`",
			"- `.afol/skills/typescript-expert/`",
			"- `.afol/skills/javascript-testing-patterns/`",
			"- `.afol/skills/bun-development/`",
		]),
		...section("Tools", [
			"- `afol schema resolver --json` -> inspect content",
			"- `afol schema resolver --write` -> write the resolver atomically",
			"- `afol validate project` -> project contract check",
			"- `bun run typecheck` -> type safety",
			"- `bun test cli/tests/schema-command.test.ts` -> command coverage",
		]),
		...section("ADM refs", [
			"- `docs/arc/ARCHITECTURE.md#9.4 Resolver`",
			"- `docs/arc/SPECS/260612_afol-administration-project-structure-onion-architecture_spec_01.md`",
			"- `docs/arc/SPECS/260612_afol-brain-shape-retrieval-doctor-trust_spec-child_01.md`",
		]),
		...section("PSTR refs", [
			"- `.afol/pstr/cli.md`",
			"- `.afol/pstr/docs.md`",
			"- `.afol/pstr/template.md`",
			"- `.afol/pstr/config.md`",
		]),
		...section("Memory refs", [
			"- `.afol/memory/memory.md`",
			"- `docs/arc/SPECS/260612_agent-operational-state-context-library_spec_01.md`",
		]),
		...section("Library refs", [
			"- `.afol/library/**`",
			"- `docs/arc/SPECS/260612_global-project-research-library_spec-child_01.md`",
		]),
		...section("Validation commands", [
			"- `bun run typecheck`",
			"- `bun test cli/tests/schema-command.test.ts`",
			"- `afol validate project`",
		]),
		"",
	].join("\n");
}

export function writeResolver(root: string): string {
	const path = resolverPath(root);
	mkdirSync(dirname(path), { recursive: true });
	atomicWriteText(path, detectResolver(root));
	return path;
}

export function resolverPathForRoot(root: string): string {
	return resolverPath(root);
}
