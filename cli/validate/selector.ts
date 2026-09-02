import type { PackId, SelectorInput, SelectorOutput } from "./types";

function defaultPackSelection(changedPaths: string[]): SelectorOutput {
	const normalizePath = (value: string): string =>
		value.replace(/\\/g, "/").replace(/^\.\//, "");
	const hasPrefix = (value: string, prefixes: readonly string[]): boolean =>
		prefixes.some((prefix) => value.startsWith(prefix));
	const isPromptContextDoc = (value: string): boolean => {
		if (!value.startsWith("docs/")) {
			return false;
		}
		const lower = value.toLowerCase();
		return lower.includes("prompt") || lower.includes("context");
	};

	if (changedPaths.length === 0) {
		return {
			selected_pack_ids: [
				"cli-kernel-local",
				"evolution-core",
				"routing-accuracy",
				"mutation-safety",
				"update-safety",
				"workbench-parity",
				"mcp-parity",
				"runtime-live-agent",
				"token-economy",
				"pstr-integrity",
				"context-bundles",
				"state-projection",
				"memory-governance",
				"library-knowledge",
				"governance-history",
				"adm-governance",
			],
			reasons: ["default-no-paths"],
		};
	}
	const selected = new Set<PackId>();
	const reasons: string[] = [];
	for (const changedPath of changedPaths) {
		const normalizedPath = normalizePath(changedPath);
		if (normalizedPath === "cli/validate/runtime-live.ts") {
			selected.add("runtime-live-agent");
			reasons.push(`runtime-live-change:${changedPath}`);
			continue;
		}
		if (hasPrefix(normalizedPath, ["cli/validate/"])) {
			selected.add("token-economy");
			reasons.push(`validation-change:${changedPath}`);
			continue;
		}
		if (
			hasPrefix(normalizedPath, [
				"cli/services/evolution/",
				"cli/commands/evolve.ts",
				"cli/dev/evolve-benchmark-smoke.ts",
			])
		) {
			selected.add("evolution-core");
			reasons.push(`evolution-change:${changedPath}`);
			continue;
		}
		if (
			hasPrefix(normalizedPath, ["cli/services/pstr/", "cli/commands/pstr"])
		) {
			selected.add("pstr-integrity");
			reasons.push(`pstr-change:${changedPath}`);
			continue;
		}
		if (
			hasPrefix(normalizedPath, [
				"cli/services/context/",
				"cli/commands/context",
				"cli/commands/ctx",
			])
		) {
			selected.add("context-bundles");
			reasons.push(`ctx-change:${changedPath}`);
			continue;
		}
		if (
			hasPrefix(normalizedPath, [
				"cli/services/state/",
				"cli/commands/state",
				"cli/commands/hydrate",
			])
		) {
			selected.add("state-projection");
			reasons.push(`state-change:${changedPath}`);
			continue;
		}
		if (
			hasPrefix(normalizedPath, ["cli/services/memory/", "cli/commands/memory"])
		) {
			selected.add("memory-governance");
			reasons.push(`memory-change:${changedPath}`);
			continue;
		}
		if (
			hasPrefix(normalizedPath, [
				"cli/services/library/",
				"cli/commands/library",
			])
		) {
			selected.add("library-knowledge");
			reasons.push(`library-change:${changedPath}`);
			continue;
		}
		if (
			hasPrefix(normalizedPath, [
				"cli/services/spec",
				"cli/services/adr",
				"cli/services/changelog",
				"cli/commands/spec",
				"cli/commands/adr",
				"cli/commands/changelog",
			])
		) {
			selected.add("governance-history");
			reasons.push(`governance-change:${changedPath}`);
			continue;
		}
		if (hasPrefix(normalizedPath, ["cli/services/adm/", "cli/commands/adm"])) {
			selected.add("adm-governance");
			reasons.push(`adm-change:${changedPath}`);
			continue;
		}
		if (hasPrefix(normalizedPath, ["cli/mcp/"])) {
			selected.add("mcp-parity");
			reasons.push(`mcp-change:${changedPath}`);
			continue;
		}
		if (
			hasPrefix(normalizedPath, [
				"cli/rules/",
				"cli/skills/",
				"cli/services/catalog/",
				"cli/commands/catalog.ts",
			])
		) {
			selected.add("routing-accuracy");
			reasons.push(`routing-change:${changedPath}`);
			continue;
		}
		if (
			hasPrefix(normalizedPath, [
				"cli/update/",
				"cli/services/update/",
				"cli/commands/update.ts",
			])
		) {
			selected.add("update-safety");
			reasons.push(`update-change:${changedPath}`);
			continue;
		}
		if (
			hasPrefix(normalizedPath, [
				"cli/files/",
				"cli/commands/file.ts",
				"cli/services/mutations/",
				"cli/services/project/root.ts",
				"cli/services/project/paths.ts",
			])
		) {
			selected.add("mutation-safety");
			reasons.push(`mutation-change:${changedPath}`);
			continue;
		}
		if (hasPrefix(normalizedPath, ["cli/"])) {
			selected.add("cli-kernel-local");
			reasons.push(`cli-change:${changedPath}`);
			continue;
		}
		if (hasPrefix(normalizedPath, [".afol/wb/"])) {
			selected.add("workbench-parity");
			reasons.push(`workbench-change:${changedPath}`);
			continue;
		}
		if (isPromptContextDoc(normalizedPath)) {
			selected.add("token-economy");
			reasons.push(`prompt-context-doc-change:${changedPath}`);
		}
	}
	if (selected.size === 0) {
		selected.add("cli-kernel-local");
		reasons.push("fallback-default");
	}
	return {
		selected_pack_ids: [...selected].sort() as PackId[],
		reasons,
	};
}

export function selectPacks(input: SelectorInput): SelectorOutput {
	if (input.scope === "wb") {
		return {
			selected_pack_ids: ["workbench-parity"],
			reasons: ["scope-wb"],
		};
	}
	if (input.scope === "tpl") {
		return {
			selected_pack_ids: ["cli-kernel-local"],
			reasons: ["scope-tpl"],
		};
	}
	if (input.scope === "update") {
		return {
			selected_pack_ids: ["update-safety"],
			reasons: ["scope-update"],
		};
	}
	return defaultPackSelection(input.changedPaths);
}
