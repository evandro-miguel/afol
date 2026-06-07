import { Glob } from "bun";
import { existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

export const TEMPLATE_ROOT = "src/project-template";

export const TEMPLATE_FORBIDDEN_PATTERNS = [
  "a",
  "Justfile",
  "**/*.py",
  "**/pyproject.toml",
  "**/uv.lock",
  "**/.venv/**",
  "**/__pycache__/**",
  ".agents/scripts/**",
  ".agents/runtime/**",
  ".agents/tools/**",
  ".agents/agents",
  ".agents/agents-mcp",
  "tests/**",
  "docs/standards/**",
  "docs/agentic/**",
] as const;

export const TEMPLATE_ALLOWED_PATTERNS = [
  "afol",
  "AGENTS.md",
  "CLAUDE.md",
  "RTK.md",
  ".claude/**",
  ".agents/config.json",
  ".agents/lock.json",
  ".agents/manifest.json",
  ".agents/skills-sync.manifest.json",
  ".agents/rules/**",
  ".agents/skills/**",
  ".agents/source/universal-skills/**",
  ".agents/data/**",
  ".agents/tmp/**",
  "docs/arc/**",
  ".afol/wb/**",
  "docs/knowledge/**",
  "docs/lessons/**",
  "docs/telemetry/**",
  "docs/templates/**",
] as const;

const TEMPLATE_INSTRUCTION_FILES = [
  "AGENTS.md",
  "CLAUDE.md",
  "docs/telemetry/README.md",
  "docs/templates/AGENTS_TEMPLATE.md",
] as const;

const TEMPLATE_FORBIDDEN_TEXT_REFERENCES = [
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

const FORBIDDEN_GLOBS = TEMPLATE_FORBIDDEN_PATTERNS.map((pattern) => new Glob(pattern));
const ALLOWED_GLOBS = TEMPLATE_ALLOWED_PATTERNS.map((pattern) => new Glob(pattern));

function toPosixPath(path: string): string {
  return path.split(sep).join("/");
}

async function collectRelativeFilePaths(root: string): Promise<string[]> {
  const paths: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      paths.push(toPosixPath(relative(root, absolutePath)));
    }
  }

  if (!existsSync(root)) {
    return paths;
  }

  await walk(root);
  return paths.sort();
}

export function matchesTemplateForbiddenPattern(relativePath: string): boolean {
  const normalized = toPosixPath(relativePath);
  return FORBIDDEN_GLOBS.some((glob) => glob.match(normalized));
}

export function matchesTemplateAllowedPattern(relativePath: string): boolean {
  const normalized = toPosixPath(relativePath);
  return ALLOWED_GLOBS.some((glob) => glob.match(normalized));
}

export async function scanTemplateForbiddenPaths(templateRoot: string): Promise<string[]> {
  const relativeFilePaths = await collectRelativeFilePaths(templateRoot);
  return relativeFilePaths.filter((relativePath) => matchesTemplateForbiddenPattern(relativePath));
}

export async function scanTemplateUnknownAllowedPaths(templateRoot: string): Promise<string[]> {
  const relativeFilePaths = await collectRelativeFilePaths(templateRoot);
  return relativeFilePaths.filter((relativePath) => !matchesTemplateAllowedPattern(relativePath));
}

export async function scanProjectTemplateForbiddenPaths(projectRoot = process.cwd()): Promise<string[]> {
  return scanTemplateForbiddenPaths(join(projectRoot, TEMPLATE_ROOT));
}

export async function scanProjectTemplateUnknownAllowedPaths(projectRoot = process.cwd()): Promise<string[]> {
  return scanTemplateUnknownAllowedPaths(join(projectRoot, TEMPLATE_ROOT));
}

export function scanProjectTemplateForbiddenTextReferences(projectRoot = process.cwd()): string[] {
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
