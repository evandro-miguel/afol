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
			"| guidance or rules | `AGENTS.md`, `.afol/adm/rules/README.md`, resolved `.afol/adm/rules/**` |",
			"| tools or commands | `afol help <command>`, `afol schema resolver --json`, `afol validate project` |",
			"| adm or routing docs | `.afol/adm/doctrine/ARCHITECTURE.md#9.4-resolver`, `.afol/adm/specs/260612_afol-administration-project-structure-onion-architecture_spec_01.md` |",
			"| pstr or surface maps | `.afol/pstr/cli.md`, `.afol/pstr/docs.md`, `.afol/pstr/template.md`, `.afol/pstr/config.md` (generated; verify present) |",
			"| memory or library refs | `.afol/memory/memory.md`, `.afol/library/**` (if present), `.afol/adm/specs/260612_global-project-research-library_spec-child_01.md` |",
			"| validation or trust | `bun run typecheck`, `bun test cli/tests/schema-command.test.ts` |",
		]),
		...section("Rules", [
			"- `.afol/adm/rules/README.md`",
			"- `.afol/adm/rules/RULE-006-applicable-rule-resolution.md`",
			"- `.afol/adm/rules/RULE-004-validation-linting.md`",
			"- `.afol/adm/rules/RULE-005-folder-structure.md`",
		]),
		...section("Guidance", [
			"- read `AGENTS.md` before editing",
			"- resolve applicable `.afol/adm/rules/**` before choosing a workflow",
			"- use `afol help <command>` for current flags and side effects",
			"- `.agents/skills/**` is optional and project-specific only",
			"- `agentic-folder-sys` is not an active AFOL route or dependency",
		]),
		...section("Tools", [
			"- `afol schema resolver --json` -> inspect content",
			"- `afol schema resolver --write` -> write the resolver atomically",
			"- `afol validate project` -> project contract check",
			"- `bun run typecheck` -> type safety",
			"- `bun test cli/tests/schema-command.test.ts` -> command coverage",
		]),
		...section("ADM refs", [
			"- `.afol/adm/doctrine/ARCHITECTURE.md#9.4-resolver`",
			"- `.afol/adm/specs/260612_afol-administration-project-structure-onion-architecture_spec_01.md`",
			"- `.afol/adm/specs/260612_afol-brain-shape-retrieval-doctor-trust_spec-child_01.md`",
		]),
		...section("PSTR refs", [
			"- `.afol/pstr/cli.md`",
			"- `.afol/pstr/docs.md`",
			"- `.afol/pstr/template.md`",
			"- `.afol/pstr/config.md`",
		]),
		...section("Memory refs", [
			"- `.afol/memory/memory.md`",
			"- `.afol/adm/specs/260612_agent-operational-state-context-library_spec_01.md`",
		]),
		...section("Library refs", [
			"- `.afol/library/**`",
			"- `.afol/adm/specs/260612_global-project-research-library_spec-child_01.md`",
		]),
		...section("Validation commands", [
			"- `bun run typecheck`",
			"- `bun test cli/tests/schema-command.test.ts`",
			"- `afol validate project`",
		]),
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
