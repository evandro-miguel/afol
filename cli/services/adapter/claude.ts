import {
	existsSync,
	mkdirSync,
	readdirSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import type { SchemaObject } from "../../core/schema";
import { loadJsonObject } from "../../core/schema";
import { DEFAULT_TEMPLATE_FILES } from "../../generated/template";
import type { TemplateFileMap } from "../template/payload";

/**
 * Runtime adapters are optional integration surfaces that can be toggled off
 * when a downstream project does not want them. The Claude adapter owns any
 * legacy `CLAUDE.md` and `.claude/` artifacts still present in installed
 * projects. `AGENTS.md` is always canonical and is never touched by the adapter
 * system.
 */
export const CLAUDE_ADAPTER_ID = "claude" as const;

/** Repository-relative paths owned by the Claude adapter. */
export const CLAUDE_ADAPTER_PATHS = ["CLAUDE.md", ".claude"] as const;

/** Template file keys owned by the Claude adapter. */
export const CLAUDE_ADAPTER_TEMPLATE_KEYS = Object.keys(
	DEFAULT_TEMPLATE_FILES,
).filter(isClaudeAdapterPath);

export type AdapterState = {
	id: typeof CLAUDE_ADAPTER_ID;
	enabled: boolean;
	/** True when at least one owned artifact is present on disk. */
	artifactsPresent: boolean;
};

/**
 * Read the Claude adapter enabled flag from `.agents/config.json`.
 * Omitted or non-boolean value means enabled (backward compatible with
 * pre-adapter installs that always shipped CLAUDE.md).
 */
export function readClaudeAdapterEnabled(configRoot: string): boolean {
	const configPath = join(configRoot, ".agents", "config.json");
	if (!existsSync(configPath)) {
		return true;
	}
	const loaded = loadJsonObject(configPath);
	if (!loaded.ok) {
		return true;
	}
	const adapters = objectAt(loaded.value, "adapters");
	const claude = adapters ? objectAt(adapters, "claude") : null;
	if (!claude) {
		return true;
	}
	const enabled = claude.enabled;
	return typeof enabled === "boolean" ? enabled : true;
}

/** True when a path is owned by the Claude adapter. */
export function isClaudeAdapterPath(path: string): boolean {
	return path === "CLAUDE.md" || path.startsWith(".claude/");
}

/**
 * Filter Claude-owned files out of a bootstrap template file map. Used when a
 * downstream project is installed with `--without-claude`.
 */
export function filterClaudeAdapterFiles(
	files: TemplateFileMap,
): TemplateFileMap {
	const next: TemplateFileMap = { ...files };
	for (const key of Object.keys(next)) {
		if (isClaudeAdapterPath(key)) {
			delete next[key];
		}
	}
	return next;
}

/**
 * Mark the Claude adapter as enabled/disabled in `.agents/config.json`. The
 * config is read, mutated, and written back atomically. Missing config is an
 * error — adapter commands require an installed project.
 */
export function writeClaudeAdapterEnabled(
	configRoot: string,
	enabled: boolean,
): void {
	const configPath = join(configRoot, ".agents", "config.json");
	if (!existsSync(configPath)) {
		throw new Error(
			"afol adapter: missing .agents/config.json — run `afol init` first",
		);
	}
	const raw = loadJsonObject(configPath);
	const config: SchemaObject = raw.ok ? { ...raw.value } : {};
	const existingAdapters = objectAt(config, "adapters");
	const existingClaude = existingAdapters
		? objectAt(existingAdapters, "claude")
		: null;
	config.adapters = {
		...existingAdapters,
		claude: { ...existingClaude, enabled },
	};
	const payload = `${JSON.stringify(config, null, 2)}\n`;
	mkdirSync(dirname(configPath), { recursive: true });
	writeFileSync(configPath, payload, "utf8");
}

/** Paths on disk owned by the Claude adapter that currently exist. */
export function findClaudeArtifacts(projectRoot: string): string[] {
	const found: string[] = [];
	for (const rel of CLAUDE_ADAPTER_PATHS) {
		if (existsSync(join(projectRoot, rel))) {
			found.push(rel);
		}
	}
	return found;
}

/**
 * Archive Claude-owned artifacts into a timestamped migration folder under
 * `.afol/data/migrations/`. Returns the archive root and the archived relative
 * paths. Artifacts are moved (rename), not copied, so the project tree no longer
 * carries them.
 */
export function archiveClaudeArtifacts(projectRoot: string): {
	archiveRoot: string;
	archived: string[];
} {
	const archiveRoot = nextAdapterArchiveRoot(projectRoot, "claude-disabled");
	const archived: string[] = [];
	for (const rel of CLAUDE_ADAPTER_PATHS) {
		const absolute = join(projectRoot, rel);
		if (!existsSync(absolute)) {
			continue;
		}
		const dest = join(projectRoot, archiveRoot, rel);
		mkdirSync(dirname(dest), { recursive: true });
		renameSync(absolute, dest);
		archived.push(rel);
	}
	return { archiveRoot, archived };
}

/**
 * Restore Claude-owned artifacts from the embedded template when a release
 * still carries adapter files. Current AFOL templates intentionally ship no
 * Claude artifacts, so this normally only flips configuration and returns an
 * empty restored list.
 */
export function restoreClaudeArtifacts(projectRoot: string): string[] {
	const restored: string[] = [];
	for (const key of CLAUDE_ADAPTER_TEMPLATE_KEYS) {
		const entry = DEFAULT_TEMPLATE_FILES[key];
		if (!entry) {
			continue;
		}
		const absolute = join(projectRoot, key);
		mkdirSync(dirname(absolute), { recursive: true });
		writeFileSync(absolute, Buffer.from(entry.contentBase64, "base64"), "utf8");
		restored.push(key);
	}
	// Remove an empty leftover .claude dir if restore produced nothing and it
	// exists as an empty directory.
	const claudeDir = join(projectRoot, ".claude");
	if (
		!restored.some((p) => p.startsWith(".claude/")) &&
		existsSync(claudeDir)
	) {
		try {
			const entries = readdirSync(claudeDir);
			if (entries.length === 0) {
				rmSync(claudeDir, { recursive: true });
			}
		} catch {
			// ignore — non-empty or unreadable dir stays untouched
		}
	}
	return restored;
}

/** Build the full adapter state for reporting. */
export function describeClaudeAdapter(projectRoot: string): AdapterState {
	const enabled = readClaudeAdapterEnabled(projectRoot);
	const artifactsPresent = findClaudeArtifacts(projectRoot).length > 0;
	return {
		id: CLAUDE_ADAPTER_ID,
		enabled,
		artifactsPresent,
	};
}

function objectAt(value: unknown, key: string): Record<string, unknown> | null {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	const next = (value as Record<string, unknown>)[key];
	return next !== null && typeof next === "object" && !Array.isArray(next)
		? (next as Record<string, unknown>)
		: null;
}

function nextAdapterArchiveRoot(projectRoot: string, label: string): string {
	const now = new Date();
	const stamp = [
		now.getFullYear(),
		String(now.getMonth() + 1).padStart(2, "0"),
		String(now.getDate()).padStart(2, "0"),
	].join("");
	const time = [
		String(now.getHours()).padStart(2, "0"),
		String(now.getMinutes()).padStart(2, "0"),
		String(now.getSeconds()).padStart(2, "0"),
	].join("");
	const base = `.afol/data/migrations/${stamp}_${time}_${label}`;
	let candidate = base;
	let suffix = 1;
	while (existsSync(join(projectRoot, candidate))) {
		suffix += 1;
		candidate = `${base}-${suffix}`;
	}
	const absolute = join(projectRoot, candidate);
	mkdirSync(absolute, { recursive: true });
	return relative(projectRoot, absolute);
}
