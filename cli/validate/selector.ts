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
				"routing-accuracy",
				"mutation-safety",
				"update-safety",
				"workbench-parity",
				"mcp-parity",
				"runtime-live-agent",
				"token-economy",
			],
			reasons: ["default-no-paths"],
		};
	}
	const selected = new Set<PackId>();
	const reasons: string[] = [];
	for (const changedPath of changedPaths) {
		const normalizedPath = normalizePath(changedPath);
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
