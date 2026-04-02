#!/usr/bin/env bun
/**
 * check-skill.js - Skill validator with optional tier checks
 *
 * Validates:
 * - Canonical frontmatter in SKILL.md and other markdown files
 * - Name/description/metadata fields
 * - Optional tier-specific structure (1/2/3)
 *
 * Usage:
 *   bun check-skill.js <skill-dir>
 *   bun check-skill.js <skill-dir> --tier 2
 *   bun check-skill.js <path-to-SKILL.md>
 */

const fs = require("fs");
const path = require("path");

const MAX_LINES = 800;
const MIN_LINES_FOR_TIER2 = 800;
const IDEAL_MIN_LINES = 250;
const IDEAL_MAX_LINES = 800;
const MAX_DESCRIPTION_LENGTH = 1024;
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TIER_PATTERN = /^(1|2|3)$/;
const REQUIRED_TIER3_FILES = new Set([
  "README.md",
  "api.md",
  "configuration.md",
  "patterns.md",
  "gotchas.md",
]);

const errors = [];
const warnings = [];
const LINK_PATTERN = /\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function addError(message) {
  errors.push(`❌ ${message}`);
}

function addWarning(message) {
  warnings.push(`⚠️  ${message}`);
}

function parseArgs(argv) {
  const options = { target: ".", tier: null };
  const args = argv.slice(2);
  let i = 0;

  while (i < args.length) {
    const token = args[i];
    if (token === "--tier") {
      options.tier = args[i + 1];
      i += 2;
      continue;
    }
    if (token.startsWith("--tier=")) {
      options.tier = token.slice("--tier=".length);
      i += 1;
      continue;
    }
    if (token === "--help") {
      options.help = true;
      i += 1;
      continue;
    }
    if (!token.startsWith("--")) {
      options.target = token;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  if (options.tier && !TIER_PATTERN.test(options.tier)) {
    throw new Error(`Invalid --tier value: ${options.tier}. Use 1, 2, or 3.`);
  }

  return options;
}

function printHelp() {
  console.log(`
Skill validator

Usage:
  bun check-skill.js <skill-dir>
  bun check-skill.js <skill-dir> --tier 2
  bun check-skill.js <path-to-SKILL.md>

Options:
  --tier <1|2|3>   Validate tier-specific structure
  --help           Show this help
`);
}

function parseFrontmatter(content) {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (!lines.length || lines[0].trim() !== "---") {
    return { data: null, hasFrontmatter: false, rawYaml: "" };
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return {
      data: null,
      hasFrontmatter: true,
      rawYaml: "",
      error: "Missing closing ---",
    };
  }

  const frontmatterLines = lines.slice(1, endIndex);
  const rawYaml = frontmatterLines.join("\n");

  const data = {};
  let inMetadata = false;
  const metadata = {};

  for (const line of frontmatterLines) {
    if (line.includes(">-") || line.includes("|-")) {
      return {
        data: null,
        hasFrontmatter: true,
        rawYaml,
        error: "Uses forbidden multiline syntax (>- or |-)",
      };
    }

    if (line.match(/^\s*(tags|triggers|references):\s*\[/)) {
      return {
        data: null,
        hasFrontmatter: true,
        rawYaml,
        error: `Uses array syntax for ${line.split(":")[0].trim()}`,
      };
    }

    const topMatch = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (topMatch) {
      const key = topMatch[1];
      const value = topMatch[2].trim();
      if (key === "metadata") {
        inMetadata = true;
      } else {
        inMetadata = false;
        data[key] = value.replace(/^["']|["']$/g, "");
      }
      continue;
    }

    const nestedMatch = line.match(/^\s{2}([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (nestedMatch && inMetadata) {
      const key = nestedMatch[1];
      const value = nestedMatch[2].trim();
      if (value.startsWith("[")) {
        return {
          data: null,
          hasFrontmatter: true,
          rawYaml,
          error: `metadata.${key} uses array syntax`,
        };
      }
      metadata[key] = value.replace(/^["']|["']$/g, "");
    }
  }

  data.metadata = metadata;
  return { data, hasFrontmatter: true, rawYaml };
}

function collectMarkdownFiles(dir) {
  const output = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      output.push(...collectMarkdownFiles(full));
      continue;
    }
    if (entry.isFile() && full.endsWith(".md")) {
      output.push(full);
    }
  }
  return output;
}

function validateMarkdownFile(filePath, opts = {}) {
  if (!fs.existsSync(filePath)) {
    addError(`File not found: ${filePath}`);
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  const lineCount = content.split(/\r?\n/).length;
  const { data, hasFrontmatter, error } = parseFrontmatter(content);

  if (!hasFrontmatter) {
    addError(`${filePath}: missing YAML frontmatter`);
    return;
  }
  if (error) {
    addError(`${filePath}: ${error}`);
    return;
  }

  if (!data.description) {
    addError(`${filePath}: missing "description" field`);
  } else if (data.description.length > MAX_DESCRIPTION_LENGTH) {
    addError(
      `${filePath}: description too long (${data.description.length} > ${MAX_DESCRIPTION_LENGTH})`
    );
  }

  if (!data.metadata || !data.metadata.tags) {
    addWarning(`${filePath}: missing "metadata.tags" field`);
  }

  if (opts.requireName) {
    if (!data.name) {
      addError(`${filePath}: missing "name" field`);
    } else if (!NAME_PATTERN.test(data.name)) {
      addError(
        `${filePath}: invalid name format "${data.name}" (must be lowercase-kebab)`
      );
    }
    if (data.description && !data.description.startsWith("Use when")) {
      addWarning(`${filePath}: description should start with "Use when"`);
    }
  }

  if (lineCount > MAX_LINES) {
    addError(`${filePath}: file has ${lineCount} lines (max ${MAX_LINES}). Split into smaller files or upgrade to Tier 2 structure.`);
  } else if (lineCount > IDEAL_MAX_LINES) {
    addWarning(`${filePath}: file has ${lineCount} lines (ideal: ${IDEAL_MIN_LINES}-${IDEAL_MAX_LINES}). Consider splitting into smaller files.`);
  } else if (lineCount < IDEAL_MIN_LINES && opts.requireName) {
    addWarning(`${filePath}: file has ${lineCount} lines (ideal: ${IDEAL_MIN_LINES}-${IDEAL_MAX_LINES})`);
  }

  // Check if Tier 1 skill exceeds threshold and should migrate to Tier 2
  if (opts.requireName && lineCount >= MIN_LINES_FOR_TIER2) {
    addError(`${filePath}: file has ${lineCount} lines (≥${MIN_LINES_FOR_TIER2}). Migrate to Tier 2 structure with references/ directory.`);
  }

  if (opts.requireSections && !content.includes("## ")) {
    addWarning(`${filePath}: no markdown sections found (## headers)`);
  }

  validateAmbiguousLinks(filePath, content);

  return data;
}

function resolveLinkSuggestion(filePath, rawLink) {
  const clean = String(rawLink || "").trim();
  if (!clean) {
    return null;
  }
  if (
    clean.startsWith("#") ||
    clean.startsWith("http://") ||
    clean.startsWith("https://") ||
    clean.startsWith("mailto:") ||
    clean.startsWith("skill://") ||
    clean.startsWith("app://") ||
    clean.startsWith("apps://")
  ) {
    return null;
  }

  const hashIndex = clean.indexOf("#");
  const pathPart = hashIndex === -1 ? clean : clean.slice(0, hashIndex);
  const anchor = hashIndex === -1 ? "" : clean.slice(hashIndex);
  if (!pathPart) {
    return null;
  }

  const isLikelyFile = path.extname(pathPart) !== "";
  if (isLikelyFile) {
    return null;
  }

  const fileDir = path.dirname(filePath);
  const absolute = path.resolve(fileDir, pathPart);
  const looksDirLink = pathPart.endsWith("/") || fs.existsSync(absolute) && fs.statSync(absolute).isDirectory();

  if (!looksDirLink) {
    return null;
  }

  let suffix = null;
  if (fs.existsSync(path.join(absolute, "SKILL.md"))) {
    suffix = "SKILL.md";
  } else if (fs.existsSync(path.join(absolute, "README.md"))) {
    suffix = "README.md";
  } else {
    return null;
  }

  const normalizedBase = pathPart.endsWith("/") ? pathPart : `${pathPart}/`;
  let explicit = `${normalizedBase}${suffix}${anchor}`;
  if (
    !explicit.startsWith("./") &&
    !explicit.startsWith("../") &&
    !explicit.startsWith("/")
  ) {
    explicit = `./${explicit}`;
  }
  return explicit;
}

function normalizeRelativeLinkSuggestion(filePath, rawLink) {
  const clean = String(rawLink || "").trim();
  if (!clean) {
    return null;
  }
  if (
    clean.startsWith("#") ||
    clean.startsWith("http://") ||
    clean.startsWith("https://") ||
    clean.startsWith("mailto:") ||
    clean.startsWith("skill://") ||
    clean.startsWith("app://") ||
    clean.startsWith("apps://") ||
    clean.startsWith("./") ||
    clean.startsWith("../") ||
    clean.startsWith("/")
  ) {
    return null;
  }

  const hashIndex = clean.indexOf("#");
  const pathPart = hashIndex === -1 ? clean : clean.slice(0, hashIndex);
  const anchor = hashIndex === -1 ? "" : clean.slice(hashIndex);
  if (!pathPart) {
    return null;
  }
  const absolute = path.resolve(path.dirname(filePath), pathPart);
  if (!fs.existsSync(absolute)) {
    return null;
  }
  return `./${pathPart}${anchor}`;
}

function validateAmbiguousLinks(filePath, content) {
  const seen = new Set();
  let match;
  while ((match = LINK_PATTERN.exec(content)) !== null) {
    const rawLink = match[1];
    const suggestion =
      resolveLinkSuggestion(filePath, rawLink) ||
      normalizeRelativeLinkSuggestion(filePath, rawLink);
    if (!suggestion || suggestion === rawLink) {
      continue;
    }
    const key = `${rawLink}->${suggestion}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    addWarning(
      `${filePath}: ambiguous directory link "${rawLink}" should be explicit "${suggestion}"`
    );
  }
}

function validateTier1(skillDir) {
  const referencesDir = path.join(skillDir, "references");
  if (fs.existsSync(referencesDir)) {
    addWarning(
      `${skillDir}: Tier 1 usually keeps single-file architecture (references/ found)`
    );
  }
}

function validateTier2(skillDir) {
  const referencesDir = path.join(skillDir, "references");
  if (!fs.existsSync(referencesDir)) {
    addError(`${skillDir}: Tier 2 requires references/ directory`);
    return;
  }

  const markdownFiles = collectMarkdownFiles(referencesDir);
  if (markdownFiles.length < 2) {
    addWarning(`${skillDir}: Tier 2 should have at least 2 markdown files in references/`);
  }

  const hasReadme = markdownFiles.some(
    (filePath) => path.basename(filePath).toLowerCase() === "readme.md"
  );
  if (!hasReadme) {
    addWarning(`${skillDir}: Tier 2 references/ should include at least one README.md`);
  }

  const gotchas = path.join(skillDir, "gotchas.md");
  if (!fs.existsSync(gotchas)) {
    addWarning(`${skillDir}: Tier 2 should include gotchas.md`);
  }
}

function validateTier3(skillDir) {
  const referencesDir = path.join(skillDir, "references");
  if (!fs.existsSync(referencesDir)) {
    addError(`${skillDir}: Tier 3 requires references/ directory`);
    return;
  }

  const products = fs
    .readdirSync(referencesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  if (products.length === 0) {
    addError(`${skillDir}: Tier 3 requires at least one product folder in references/`);
    return;
  }

  for (const product of products) {
    const productDir = path.join(referencesDir, product);
    const files = fs
      .readdirSync(productDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);

    for (const required of REQUIRED_TIER3_FILES) {
      if (!files.includes(required)) {
        addError(`${productDir}: missing required file ${required}`);
      }
    }
  }
}

function runTierValidation(skillDir, tier) {
  if (tier === "1") {
    validateTier1(skillDir);
    return;
  }
  if (tier === "2") {
    validateTier2(skillDir);
    return;
  }
  validateTier3(skillDir);
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv);
  } catch (error) {
    console.error(`\nError: ${error.message}\n`);
    printHelp();
    process.exit(1);
  }

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  const target = path.resolve(options.target);
  if (!fs.existsSync(target)) {
    console.error(`\nError: target does not exist: ${target}\n`);
    process.exit(1);
  }

  const targetIsDirectory = fs.statSync(target).isDirectory();
  const skillFile = targetIsDirectory ? path.join(target, "SKILL.md") : target;
  const skillDir = targetIsDirectory ? target : path.dirname(target);

  console.log(`\nChecking: ${target}`);
  if (options.tier) {
    console.log(`Tier check: ${options.tier}`);
  }
  console.log("");

  const mainData = validateMarkdownFile(skillFile, {
    requireName: true,
    requireSections: true,
  });

  if (targetIsDirectory && mainData && mainData.name) {
    const dirName = path.basename(skillDir);
    if (mainData.name !== dirName) {
      addWarning(
        `${skillFile}: name "${mainData.name}" does not match directory "${dirName}"`
      );
    }
  }

  if (targetIsDirectory) {
    const markdownFiles = collectMarkdownFiles(skillDir);
    for (const filePath of markdownFiles) {
      if (path.resolve(filePath) === path.resolve(skillFile)) {
        continue;
      }
      validateMarkdownFile(filePath, { requireSections: false });
    }
  }

  if (targetIsDirectory && options.tier) {
    runTierValidation(skillDir, options.tier);
  }

  if (warnings.length) {
    console.log("Warnings:");
    for (const warning of warnings) {
      console.log(`  ${warning}`);
    }
  }

  if (errors.length) {
    console.log("\nErrors:");
    for (const error of errors) {
      console.log(`  ${error}`);
    }
    process.exit(1);
  }

  console.log("✅ Validation passed!\n");
}

main();
