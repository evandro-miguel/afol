#!/usr/bin/env bun
/**
 * create-skill.js - Tier-aware skill scaffolder
 *
 * Creates standardized skill structures with canonical frontmatter.
 *
 * Usage:
 *   bun create-skill.js --name my-skill --tier 1
 *   bun create-skill.js --name my-skill --tier 2 --category reference
 *   bun create-skill.js --name cloud-platform --tier 3 --products kv,d1,r2
 *   bun create-skill.js --name my-skill --tier 2 --dry-run
 */

const fs = require("fs");
const path = require("path");

const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VALID_TIERS = new Set(["1", "2", "3"]);
const VALID_TYPES = new Set(["technique", "reference", "discipline", "pattern"]);
const VALID_ADVICE = new Set(["off", "warn", "enforce"]);

function runUniversalSkillsGuard() {
  if (process.env.SKILLPOOL_GUARD === "0") {
    return;
  }

  const guardScript = path.join(__dirname, "check-universal-skills-sync.js");
  if (!fs.existsSync(guardScript)) {
    return;
  }

  const proc = Bun.spawnSync(["bun", guardScript], {
    stdout: "inherit",
    stderr: "inherit",
  });

  if (proc.exitCode !== 0) {
    throw new Error(
      "Universal skills mirror is out of sync. Run `bun run skillpool:sync` before creating/modifying skills."
    );
  }
}

function printHelp() {
  console.log(`
Tier-aware skill scaffolder

Required:
  --name <kebab-case>          Skill directory name
  --tier <1|2|3>               Architecture tier

Optional:
  --root <dir>                 Root folder where skill is created (default: skills)
  --advice <off|warn|enforce>  Duplication/merge suggestions policy (default: warn)
  --category <name>            metadata.category (default: technique)
  --description <text>         Skill description (default generated)
  --tags <csv>                 metadata.tags (default generated)
  --triggers <csv>             metadata.triggers (default generated)
  --type <technique|reference|discipline|pattern>
                               Tier 1 content style (default: technique)
  --products <csv>             Tier 3 product folders (default: core)
  --force                      Overwrite existing files
  --dry-run                    Show files without writing
  SKILLPOOL_GUARD=0            Disable universal-skills sync guard for this run
  --help                       Show this help

Examples:
  bun create-skill.js --name fix-flaky-tests --tier 1 --type technique
  bun create-skill.js --name docs-platform --tier 2 --category documentation
  bun create-skill.js --name cloud-platform --tier 3 --products kv,d1,r2
  bun create-skill.js --name api-auth --tier 2 --advice enforce
`);
}

function runSkillAdvisor(args) {
  if (args.advice === "off") {
    return;
  }

  const advisorScript = path.join(__dirname, "skill-advisor.js");
  if (!fs.existsSync(advisorScript)) {
    return;
  }

  const proc = Bun.spawnSync(
    [
      "bun",
      advisorScript,
      "candidate",
      "--root",
      args.root,
      "--name",
      args.name,
      "--description",
      args.description,
      "--tags",
      args.tags,
      "--triggers",
      args.triggers,
      "--tier",
      args.tier,
      "--mode",
      args.advice === "enforce" ? "enforce" : "warn",
    ],
    {
      stdout: "inherit",
      stderr: "inherit",
    }
  );

  if (proc.exitCode !== 0) {
    throw new Error(
      "Skill advisor blocked creation due to high overlap. Prefer merge into an existing skill or rerun with --advice warn/off."
    );
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === "--help") {
      args.help = true;
      continue;
    }
    if (token === "--force") {
      args.force = true;
      continue;
    }
    if (token === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const withEq = token.includes("=");
    let key;
    let value;

    if (withEq) {
      const split = token.indexOf("=");
      key = token.slice(2, split);
      value = token.slice(split + 1);
    } else {
      key = token.slice(2);
      value = argv[i + 1];
      i += 1;
    }

    if (!value) {
      throw new Error(`Missing value for --${key}`);
    }

    args[key] = value;
  }
  return args;
}

function titleCaseFromKebab(name) {
  return name
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sanitizeCsv(value) {
  return value
    .split(",")
    .map((entry) => entry.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean)
    .join(", ");
}

function csvFromName(name) {
  return sanitizeCsv(name.split("-").join(", "));
}

function yamlQuote(value) {
  return `"${String(value).replace(/"/g, "'")}"`;
}

function buildSkillFrontmatter({
  name,
  description,
  category,
  tags,
  triggers,
  references,
}) {
  const lines = [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    "metadata:",
    `  category: ${category}`,
    `  tags: ${yamlQuote(tags)}`,
    `  triggers: ${yamlQuote(triggers)}`,
  ];

  if (references && references.trim()) {
    lines.push(`  references: ${yamlQuote(references)}`);
  }

  lines.push("---", "");
  return lines.join("\n");
}

function buildDocFrontmatter(description, tags) {
  return [
    "---",
    `description: ${description}`,
    "metadata:",
    `  tags: ${yamlQuote(tags)}`,
    "---",
    "",
  ].join("\n");
}

function writeFile(targetPath, content, ctx) {
  ctx.created.push(targetPath);
  if (ctx.dryRun) {
    return;
  }
  if (!ctx.force && fs.existsSync(targetPath)) {
    throw new Error(`File already exists: ${targetPath}. Use --force to overwrite.`);
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, "utf8");
}

function tier1Template(args) {
  const title = titleCaseFromKebab(args.name);
  const headers = {
    technique: [
      "## Overview",
      "",
      "[One-sentence core technique.]",
      "",
      "## When to Use",
      "",
      "- [Trigger 1]",
      "- [Trigger 2]",
      "",
      "## Step-by-Step",
      "",
      "1. [Step 1]",
      "2. [Step 2]",
      "3. [Step 3]",
      "",
      "## Examples",
      "",
      "```bash",
      "# Example command",
      "```",
      "",
      "## Common Mistakes",
      "",
      "- [Mistake and correction]",
      "",
    ],
    reference: [
      "## Quick Reference",
      "",
      "| Item | Purpose |",
      "|------|---------|",
      "| `x` | [Description] |",
      "",
      "## Common Patterns",
      "",
      "```bash",
      "# Pattern example",
      "```",
      "",
      "## Troubleshooting",
      "",
      "- [Symptom] -> [Fix]",
      "",
    ],
    discipline: [
      "## Iron Law",
      "",
      "**[Absolute rule in one sentence.]**",
      "",
      "## Mandatory Sequence",
      "",
      "1. ALWAYS [required step]",
      "2. NEVER [forbidden step]",
      "3. [final check]",
      "",
      "## Rationalizations and Counters",
      "",
      "| Excuse | Reality |",
      "|--------|---------|",
      "| [Excuse] | [Counter] |",
      "",
      "## Red Flags",
      "",
      "- [Flag 1]",
      "- [Flag 2]",
      "",
    ],
    pattern: [
      "## Pattern",
      "",
      "[One-sentence pattern statement.]",
      "",
      "## Recognition Signs",
      "",
      "- [Sign 1]",
      "- [Sign 2]",
      "",
      "## Before",
      "",
      "```typescript",
      "// Before",
      "```",
      "",
      "## After",
      "",
      "```typescript",
      "// After",
      "```",
      "",
      "## When Not to Use",
      "",
      "- [Case where pattern is unnecessary]",
      "",
    ],
  };

  const body = headers[args.type];
  return `${buildSkillFrontmatter(args)}# ${title}\n\n${body.join("\n")}`;
}

function tier2Files(args, skillDir, ctx) {
  const title = titleCaseFromKebab(args.name);

  const skillMd = [
    buildSkillFrontmatter({
      ...args,
      references: "core, patterns, troubleshooting",
    }),
    `# ${title}`,
    "",
    "Tier 2 dispatcher for a multi-concept skill.",
    "",
    "## Decision Tree",
    "",
    "Need core workflow guidance?",
    "- Start with [Core](references/core/README.md)",
    "",
    "Need recommended usage approaches?",
    "- Open [Patterns](references/patterns/README.md)",
    "",
    "Need to debug or recover from failures?",
    "- Open [Troubleshooting](references/troubleshooting/README.md)",
    "",
    "## Validation",
    "",
    "```bash",
    `bun skills/writing-skills/scripts/check-skill.js ${skillDir} --tier 2`,
    "```",
    "",
  ].join("\n");

  const gotchas = [
    buildDocFrontmatter(
      "Common mistakes and prevention notes for this Tier 2 skill.",
      "gotchas, tier-2, troubleshooting"
    ),
    "# Gotchas",
    "",
    "- Keep `SKILL.md` focused on routing and links.",
    "- Move implementation detail into `references/` files.",
    "- Keep links relative and one level deep from dispatcher.",
    "",
  ].join("\n");

  const coreReadme = [
    buildDocFrontmatter(
      "Core workflow and default path for this skill.",
      "core, workflow, tier-2"
    ),
    "# Core",
    "",
    "## When to Use",
    "",
    "- [Primary use case]",
    "",
    "## Workflow",
    "",
    "1. [Step 1]",
    "2. [Step 2]",
    "3. [Step 3]",
    "",
  ].join("\n");

  const patternsReadme = [
    buildDocFrontmatter(
      "Recommended implementation patterns for this skill.",
      "patterns, examples, tier-2"
    ),
    "# Patterns",
    "",
    "## Pattern A",
    "",
    "```bash",
    "# Example",
    "```",
    "",
    "## Pattern B",
    "",
    "```bash",
    "# Example",
    "```",
    "",
  ].join("\n");

  const troubleshootingReadme = [
    buildDocFrontmatter(
      "Troubleshooting guide and recovery playbook for this skill.",
      "troubleshooting, recovery, tier-2"
    ),
    "# Troubleshooting",
    "",
    "| Symptom | Cause | Fix |",
    "|---------|-------|-----|",
    "| [Issue] | [Cause] | [Fix] |",
    "",
  ].join("\n");

  writeFile(path.join(skillDir, "SKILL.md"), skillMd, ctx);
  writeFile(path.join(skillDir, "gotchas.md"), gotchas, ctx);
  writeFile(path.join(skillDir, "references/core/README.md"), coreReadme, ctx);
  writeFile(
    path.join(skillDir, "references/patterns/README.md"),
    patternsReadme,
    ctx
  );
  writeFile(
    path.join(skillDir, "references/troubleshooting/README.md"),
    troubleshootingReadme,
    ctx
  );
}

function tier3Files(args, skillDir, ctx) {
  const title = titleCaseFromKebab(args.name);
  const products = args.products.split(",").map((item) => item.trim()).filter(Boolean);

  const treeLines = products
    .map((product) => `- ${product}: [${product}](references/${product}/README.md)`)
    .join("\n");

  const skillMd = [
    buildSkillFrontmatter({
      ...args,
      references: products.join(", "),
    }),
    `# ${title}`,
    "",
    "Tier 3 dispatcher for platform-level skills.",
    "",
    "## Decision Tree",
    "",
    "Need a product-specific workflow?",
    treeLines,
    "",
    "## Routing Rules",
    "",
    "- Open `README.md` first for a product.",
    "- Load only `api.md`, `configuration.md`, `patterns.md`, or `gotchas.md` as needed.",
    "- Keep dispatcher focused on intent-based routing only.",
    "",
    "## Validation",
    "",
    "```bash",
    `bun skills/writing-skills/scripts/check-skill.js ${skillDir} --tier 3`,
    "```",
    "",
  ].join("\n");

  writeFile(path.join(skillDir, "SKILL.md"), skillMd, ctx);

  for (const product of products) {
    const base = path.join(skillDir, "references", product);
    const tags = `${args.name}, ${product}, tier-3`;

    const readme = [
      buildDocFrontmatter(
        `Overview and routing guide for ${product} in ${args.name}.`,
        tags
      ),
      `# ${titleCaseFromKebab(product)}`,
      "",
      "## When to Use",
      "",
      "- [Intent-driven trigger]",
      "",
      "## Task Routing",
      "",
      "- New setup -> `configuration.md`",
      "- Feature work -> `api.md` + `patterns.md`",
      "- Incidents -> `gotchas.md`",
      "",
    ].join("\n");

    const api = [
      buildDocFrontmatter(
        `API references and contracts for ${product}.`,
        `${tags}, api`
      ),
      "# API",
      "",
      "## Interfaces",
      "",
      "- [Endpoint / method / contract]",
      "",
    ].join("\n");

    const configuration = [
      buildDocFrontmatter(
        `Configuration and setup guide for ${product}.`,
        `${tags}, configuration`
      ),
      "# Configuration",
      "",
      "## Setup",
      "",
      "1. [Step 1]",
      "2. [Step 2]",
      "",
    ].join("\n");

    const patterns = [
      buildDocFrontmatter(
        `Common implementation patterns for ${product}.`,
        `${tags}, patterns`
      ),
      "# Patterns",
      "",
      "## Default Pattern",
      "",
      "```bash",
      "# Example",
      "```",
      "",
    ].join("\n");

    const gotchas = [
      buildDocFrontmatter(
        `Known pitfalls, limits, and recovery steps for ${product}.`,
        `${tags}, gotchas`
      ),
      "# Gotchas",
      "",
      "| Symptom | Cause | Mitigation |",
      "|---------|-------|------------|",
      "| [Issue] | [Cause] | [Fix] |",
      "",
    ].join("\n");

    writeFile(path.join(base, "README.md"), readme, ctx);
    writeFile(path.join(base, "api.md"), api, ctx);
    writeFile(path.join(base, "configuration.md"), configuration, ctx);
    writeFile(path.join(base, "patterns.md"), patterns, ctx);
    writeFile(path.join(base, "gotchas.md"), gotchas, ctx);
  }
}

function createTierSkeleton(args, skillDir, ctx) {
  if (args.tier === "1") {
    const content = tier1Template(args);
    writeFile(path.join(skillDir, "SKILL.md"), content, ctx);
    return;
  }
  if (args.tier === "2") {
    tier2Files(args, skillDir, ctx);
    return;
  }
  tier3Files(args, skillDir, ctx);
}

function normalizeArgs(raw) {
  if (!raw.name) {
    throw new Error("--name is required");
  }
  if (!raw.tier) {
    throw new Error("--tier is required");
  }
  if (!VALID_TIERS.has(raw.tier)) {
    throw new Error(`Invalid --tier ${raw.tier}. Use 1, 2, or 3.`);
  }
  if (!NAME_PATTERN.test(raw.name)) {
    throw new Error(`Invalid --name "${raw.name}". Use lowercase-kebab-case.`);
  }

  const type = raw.type || "technique";
  if (!VALID_TYPES.has(type)) {
    throw new Error(
      `Invalid --type ${type}. Use technique, reference, discipline, or pattern.`
    );
  }

  const root = raw.root || "skills";
  const advice = raw.advice || "warn";
  if (!VALID_ADVICE.has(advice)) {
    throw new Error(`Invalid --advice ${advice}. Use off, warn, or enforce.`);
  }
  const description =
    raw.description ||
    `Use when working with ${raw.name.replace(/-/g, " ")} tasks.`;
  const category = raw.category || "technique";
  const tags = sanitizeCsv(raw.tags || `${raw.name}, tier-${raw.tier}, skill`);
  const triggers = sanitizeCsv(raw.triggers || csvFromName(raw.name));
  const products = sanitizeCsv(raw.products || "core");

  if (!description.startsWith("Use when")) {
    throw new Error('Description must start with "Use when".');
  }

  return {
    help: Boolean(raw.help),
    force: Boolean(raw.force),
    dryRun: Boolean(raw.dryRun),
    root,
    advice,
    name: raw.name,
    tier: raw.tier,
    category,
    description,
    tags,
    triggers,
    type,
    products,
  };
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv);
    if (args.help) {
      printHelp();
      process.exit(0);
    }
    args = normalizeArgs(args);
  } catch (error) {
    console.error(`\nError: ${error.message}\n`);
    printHelp();
    process.exit(1);
  }

  const skillDir = path.resolve(args.root, args.name);
  const ctx = { created: [], force: args.force, dryRun: args.dryRun };

  try {
    runUniversalSkillsGuard();
    runSkillAdvisor(args);
  } catch (error) {
    console.error(`\nError: ${error.message}\n`);
    process.exit(1);
  }

  if (!args.dryRun) {
    fs.mkdirSync(skillDir, { recursive: true });
  }

  try {
    createTierSkeleton(args, skillDir, ctx);
  } catch (error) {
    console.error(`\nError: ${error.message}`);
    process.exit(1);
  }

  console.log(`\nSkill scaffold ${args.dryRun ? "(dry-run) " : ""}created:`);
  console.log(`- ${skillDir}`);
  for (const file of ctx.created) {
    console.log(`  - ${file}`);
  }
  console.log("\nNext step:");
  console.log(
    `bun skills/writing-skills/scripts/check-skill.js ${skillDir} --tier ${args.tier}`
  );
  console.log("");
}

main();
