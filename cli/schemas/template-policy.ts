import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";
import { collectRelativeFilePaths, toPosixPath } from "../core/file-paths";

export const TEMPLATE_ROOT = "src/project-template";

export const TEMPLATE_FORBIDDEN_PATTERNS = [
	"a",
	"afol",
	"Justfile",
	"**/.env",
	"**/.env.*",
	"**/*.key",
	"**/*.pem",
	"**/*.p12",
	"**/*.pfx",
	"**/*.py",
	"**/pyproject.toml",
	"**/uv.lock",
	"**/.venv/**",
	"**/__pycache__/**",
	".agents/scripts/**",
	".agents/runtime/**",
	".agents/hooks/**",
	".agents/rules/**",
	".agents/source/**",
	".agents/tools/**",
	".agents/tools.json",
	".agents/agents",
	".agents/agents-mcp",
	".afol/skills/**",
	"CLAUDE.md",
	".claude/**",
	"docs/arc/**",
	"tests/**",
	"docs/agentic/**",
	"docs/knowledge/**",
] as const;

export const TEMPLATE_ALLOWED_PATTERNS = [
	"AGENTS.md",
	"RTK.md",
	".afol/config.json",
	".agents/lock.json",
	".agents/manifest.json",
	".agents/skills-sync.manifest.json",
	".afol/adm/hooks/**",
	".agents/skills/**",
	".afol/adm/rules/**",
	".afol/adm/source/universal-skills/**",
	".afol/adm/**",
	".afol/data/**",
	".afol/pstr/**",
	".afol/library/**",
	".afol/memory/**",
	".afol/tmp/**",
	".afol/wb/**",
	"docs/lessons/**",
	"docs/standards/**",
	"docs/telemetry/**",
	"docs/templates/**",
] as const;

const TEMPLATE_INSTRUCTION_FILES = [
	"AGENTS.md",
	"docs/telemetry/README.md",
	"docs/templates/AGENTS_TEMPLATE.md",
] as const;

const TEMPLATE_FORBIDDEN_TEXT_REFERENCES = [
	"./afol",
	"`./afol`",
	"./a",
	"`./a`",
	" or `./a`",
	"`afol` or `./a`",
	"just ",
	"`just",
	"Justfile",
	"./.agents/agents",
	".agents/agents ",
	".agents/agents`",
	".agents/hooks",
	".agents/rules",
	".agents/source",
	".agents/tools.json",
	".agents/scripts",
	".agents/runtime",
	"python3 .agents/scripts",
	"afol knowledge",
	"afol memory",
	"afol wb-update",
	"afol sync",
	"afol skills-sync",
	"`skills-sync sync`",
	"`skills-sync update`",
	"`skills-sync pull`",
	"`skills-sync push`",
	"Use `skills-sync` flow",
	"just wb-touch",
] as const;

const FORBIDDEN_GLOBS = TEMPLATE_FORBIDDEN_PATTERNS.map(
	(pattern) => new Glob(pattern),
);
const ALLOWED_GLOBS = TEMPLATE_ALLOWED_PATTERNS.map(
	(pattern) => new Glob(pattern),
);

export function matchesTemplateForbiddenPattern(relativePath: string): boolean {
	const normalized = toPosixPath(relativePath);
	return (
		isAllowedSecretExample(normalized) === false &&
		FORBIDDEN_GLOBS.some((glob) => glob.match(normalized))
	);
}

export function matchesTemplateAllowedPattern(relativePath: string): boolean {
	const normalized = toPosixPath(relativePath);
	return ALLOWED_GLOBS.some((glob) => glob.match(normalized));
}

function isAllowedSecretExample(relativePath: string): boolean {
	const fileName = relativePath.split("/").at(-1);
	return fileName === ".env.example";
}

export async function scanTemplateForbiddenPaths(
	templateRoot: string,
): Promise<string[]> {
	const relativeFilePaths = await collectRelativeFilePaths(templateRoot, {
		missingRoot: "empty",
	});
	return relativeFilePaths.filter((relativePath) =>
		matchesTemplateForbiddenPattern(relativePath),
	);
}

export async function scanTemplateUnknownAllowedPaths(
	templateRoot: string,
): Promise<string[]> {
	const relativeFilePaths = await collectRelativeFilePaths(templateRoot, {
		missingRoot: "empty",
	});
	return relativeFilePaths.filter(
		(relativePath) =>
			!matchesTemplateForbiddenPattern(relativePath) &&
			!matchesTemplateAllowedPattern(relativePath),
	);
}

export async function scanProjectTemplateForbiddenPaths(
	projectRoot = process.cwd(),
): Promise<string[]> {
	return scanTemplateForbiddenPaths(join(projectRoot, TEMPLATE_ROOT));
}

export async function scanProjectTemplateUnknownAllowedPaths(
	projectRoot = process.cwd(),
): Promise<string[]> {
	return scanTemplateUnknownAllowedPaths(join(projectRoot, TEMPLATE_ROOT));
}

export function scanProjectTemplateForbiddenTextReferences(
	projectRoot = process.cwd(),
): string[] {
	const templateRoot = join(projectRoot, TEMPLATE_ROOT);
	const matches: string[] = [];

	for (const relativePath of TEMPLATE_INSTRUCTION_FILES) {
		const absolutePath = join(templateRoot, relativePath);
		if (!existsSync(absolutePath)) {
			continue;
		}
		const content = readFileSync(absolutePath, "utf8");
		for (const forbidden of TEMPLATE_FORBIDDEN_TEXT_REFERENCES) {
			if (content.includes(forbidden)) {
				matches.push(`${relativePath}: ${forbidden}`);
			}
		}
	}

	return matches.sort();
}

/** Claimed tools that documentation says must be available in the environment. */
export const CLAIMED_TOOLS = ["bun", "afol"] as const;

export type ToolchainClaim = {
	tool: string;
	available: boolean;
	critical: boolean;
	error?: string;
};

/**
 * Verify that each claimed tool is actually available in the environment.
 * - `bun` is CRITICAL — must be available for any operation
 * - `afol` is ADVISORY — expected after bootstrap but may not exist in CI/fresh env
 */
export function scanTemplateToolchainClaims(): ToolchainClaim[] {
	return CLAIMED_TOOLS.map((tool): ToolchainClaim => {
		const critical = tool === "bun";
		const result = spawnSync(tool, ["--version"], {
			stdio: "ignore",
			timeout: 5000,
		});
		if (!result.error && result.status === 0) {
			return { tool, available: true, critical };
		}
		return {
			tool,
			available: false,
			critical,
			error: `"${tool}" not found in PATH or not responding`,
		};
	});
}
