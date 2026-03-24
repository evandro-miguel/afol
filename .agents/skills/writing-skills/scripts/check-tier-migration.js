#!/usr/bin/env bun
/**
 * check-tier-migration.js - Detect skills exceeding size limits
 *
 * Scans skill directories and identifies files that:
 * - Have ≥800 lines (must migrate to Tier 2)
 * - Have >800 lines (error - exceeds max)
 * - Are <250 lines (warning - may be too small)
 * - Are <50 lines (info - very small, consider consolidation)
 * - Empty folders (should be removed)
 *
 * Usage:
 *   bun skills/writing-skills/scripts/check-tier-migration.js
 *   bun skills/writing-skills/scripts/check-tier-migration.js --skills-dir skills
 *   bun skills/writing-skills/scripts/check-tier-migration.js --json
 *
 * Integration:
 *   Add to CI/CD or pre-commit hooks to enforce size limits.
 */

const fs = require("fs");
const path = require("path");

const IDEAL_MIN_LINES = 250;
const IDEAL_MAX_LINES = 800;
const MAX_LINES = 800;
const MIN_LINES_FOR_TIER2 = 800;
const VERY_SMALL_FILE = 50;

function printHelp() {
  console.log(`
Detect skills exceeding size limits

Usage:
  bun check-tier-migration.js [options]

Options:
  --skills-dir <dir>   Skills directory (default: skills)
  --json               Output as JSON
  --check-empty-folders Check for empty directories (default: true)
  --check-small-files  Check for very small files <50 lines (default: true)
  --help               Show help

Exit codes:
  0 - All skills within limits
  1 - Skills found that need migration
`);
}

function parseArgs(argv) {
  const options = {
    skillsDir: "skills",
    json: false,
    help: false,
    checkEmptyFolders: true,
    checkSmallFiles: true,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }

    if (token === "--json") {
      options.json = true;
      continue;
    }

    if (token === "--check-empty-folders") {
      options.checkEmptyFolders = true;
      continue;
    }

    if (token === "--no-check-empty-folders") {
      options.checkEmptyFolders = false;
      continue;
    }

    if (token === "--check-small-files") {
      options.checkSmallFiles = true;
      continue;
    }

    if (token === "--no-check-small-files") {
      options.checkSmallFiles = false;
      continue;
    }

    if (token.startsWith("--")) {
      const key = token.slice(2);
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${token}`);
      }

      if (key === "skills-dir") {
        options.skillsDir = value;
      } else {
        options[key] = value;
      }
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return options;
}

function countLines(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  return content.split(/\r?\n/).length;
}

function listSkillDirs(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => {
      const skillPath = path.join(rootDir, name, "SKILL.md");
      return fs.existsSync(skillPath);
    })
    .sort((a, b) => a.localeCompare(b));
}

function findEmptyFolders(dir) {
  const empty = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") {
      continue;
    }

    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const subEmpty = findEmptyFolders(full);
      empty.push(...subEmpty);

      // Check if this directory is empty (after checking subdirs)
      const subEntries = fs.readdirSync(full, { withFileTypes: true });
      const hasContent = subEntries.some(
        (e) => e.isFile() || (e.isDirectory() && e.name !== ".git" && e.name !== "node_modules")
      );
      if (!hasContent) {
        empty.push(full);
      }
    }
  }

  return empty;
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
    } else if (entry.isFile() && full.endsWith(".md")) {
      output.push(full);
    }
  }

  return output;
}

function analyzeSkill(skillDir, options) {
  const skillFile = path.join(skillDir, "SKILL.md");
  const referencesDir = path.join(skillDir, "references");

  if (!fs.existsSync(skillFile)) {
    return null;
  }

  const skillLineCount = countLines(skillFile);
  const isTier2 = fs.existsSync(referencesDir);
  const isTier3 = fs.existsSync(path.join(skillDir, "products"));

  const result = {
    name: path.basename(skillDir),
    path: skillDir,
    tier: isTier3 ? 3 : isTier2 ? 2 : 1,
    skillFile: {
      path: skillFile,
      lines: skillLineCount,
    },
    totalLines: skillLineCount,
    issues: [],
    needsMigration: false,
    migrationType: null,
  };

  // Check SKILL.md size
  if (skillLineCount >= MIN_LINES_FOR_TIER2 && !isTier2 && !isTier3) {
    result.issues.push({
      type: "ERROR",
      code: "EXCEEDS_TIER1_LIMIT",
      message: `SKILL.md has ${skillLineCount} lines (≥${MIN_LINES_FOR_TIER2}). Must migrate to Tier 2.`,
      file: skillFile,
      lines: skillLineCount,
    });
    result.needsMigration = true;
    result.migrationType = "tier1-to-tier2";
  }

  if (skillLineCount > MAX_LINES) {
    result.issues.push({
      type: "ERROR",
      code: "EXCEEDS_MAX_LIMIT",
      message: `SKILL.md has ${skillLineCount} lines (max ${MAX_LINES}). Split into smaller files.`,
      file: skillFile,
      lines: skillLineCount,
    });
    result.needsMigration = true;
  }

  if (skillLineCount > IDEAL_MAX_LINES && skillLineCount < MIN_LINES_FOR_TIER2) {
    result.issues.push({
      type: "WARNING",
      code: "APPROACHING_LIMIT",
      message: `SKILL.md has ${skillLineCount} lines (ideal: ${IDEAL_MIN_LINES}-${IDEAL_MAX_LINES}). Consider splitting.`,
      file: skillFile,
      lines: skillLineCount,
    });
  }

  if (skillLineCount < IDEAL_MIN_LINES && skillLineCount > 10) {
    result.issues.push({
      type: "INFO",
      code: "BELOW_IDEAL_MIN",
      message: `SKILL.md has ${skillLineCount} lines (ideal: ${IDEAL_MIN_LINES}-${IDEAL_MAX_LINES})`,
      file: skillFile,
      lines: skillLineCount,
    });
  }

  // Check for very small files (<50 lines) - optional warning
  if (options.checkSmallFiles && skillLineCount < VERY_SMALL_FILE && skillLineCount > 10) {
    result.issues.push({
      type: "WARNING",
      code: "VERY_SMALL_FILE",
      message: `SKILL.md has only ${skillLineCount} lines (<${VERY_SMALL_FILE}). Consider consolidating or expanding.`,
      file: skillFile,
      lines: skillLineCount,
    });
  }

  // Analyze reference files for Tier 2/3
  if (isTier2 || isTier3) {
    const refFiles = collectMarkdownFiles(skillDir).filter(
      (f) => path.resolve(f) !== path.resolve(skillFile)
    );

    for (const refFile of refFiles) {
      const refLines = countLines(refFile);
      result.totalLines += refLines;

      const relPath = path.relative(skillDir, refFile);

      if (refLines > MAX_LINES) {
        result.issues.push({
          type: "ERROR",
          code: "REF_EXCEEDS_MAX",
          message: `${relPath} has ${refLines} lines (max ${MAX_LINES}). Split into smaller files.`,
          file: refFile,
          lines: refLines,
        });
      }

      if (refLines > IDEAL_MAX_LINES && refLines <= MAX_LINES) {
        result.issues.push({
          type: "WARNING",
          code: "REF_APPROACHING_LIMIT",
          message: `${relPath} has ${refLines} lines (ideal: ${IDEAL_MIN_LINES}-${IDEAL_MAX_LINES}). Consider splitting.`,
          file: refFile,
          lines: refLines,
        });
      }
    }
  }

  return result;
}

function generateMigrationGuide(skill) {
  const lines = [];
  lines.push(`\n## Migration Guide: ${skill.name}`);
  lines.push(`\n**Current**: Tier ${skill.tier} (${skill.skillFile.lines} lines)`);
  lines.push(`**Target**: Tier 2 structure`);
  lines.push(`\n### Steps:\n`);

  if (skill.migrationType === "tier1-to-tier2") {
    lines.push("1. Create `references/` directory");
    lines.push("2. Identify logical sections in SKILL.md to extract");
    lines.push("3. Move detailed content to reference files:");
    lines.push("   - `references/core/README.md` - Main concepts");
    lines.push("   - `references/patterns/README.md` - Usage patterns");
    lines.push("   - `references/troubleshooting/README.md` - Common issues");
    lines.push("4. Keep SKILL.md as navigation hub (<800 lines)");
    lines.push("5. Add cross-links between files");
    lines.push("\n### Suggested structure:\n");
    lines.push("```");
    lines.push(`${skill.name}/`);
    lines.push("├── SKILL.md (overview + navigation, <800 lines)");
    lines.push("├── gotchas.md (optional)");
    lines.push("└── references/");
    lines.push("    ├── core/");
    lines.push("    │   └── README.md");
    lines.push("    ├── patterns/");
    lines.push("    │   └── README.md");
    lines.push("    └── troubleshooting/");
    lines.push("        └── README.md");
    lines.push("```");
  }

  return lines.join("\n");
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

  const skillsDir = path.resolve(options.skillsDir);

  if (!fs.existsSync(skillsDir)) {
    if (options.json) {
      console.log(JSON.stringify({ error: `Skills directory not found: ${skillsDir}` }));
    } else {
      console.error(`\nError: Skills directory not found: ${skillsDir}\n`);
    }
    process.exit(1);
  }

  const skillNames = listSkillDirs(skillsDir);
  const results = [];
  const errors = [];
  const warnings = [];

  for (const skillName of skillNames) {
    const skillPath = path.join(skillsDir, skillName);
    const analysis = analyzeSkill(skillPath, options);

    if (analysis) {
      results.push(analysis);

      for (const issue of analysis.issues) {
        if (issue.type === "ERROR") {
          errors.push({ skill: skillName, ...issue });
        } else if (issue.type === "WARNING") {
          warnings.push({ skill: skillName, ...issue });
        }
      }
    }
  }

  // Check for empty folders
  const emptyFolders = options.checkEmptyFolders ? findEmptyFolders(skillsDir) : [];
  for (const folder of emptyFolders) {
    warnings.push({
      type: "WARNING",
      code: "EMPTY_FOLDER",
      message: `Empty folder detected: ${folder}. Should be removed.`,
      file: folder,
    });
  }

  // Output
  if (options.json) {
    const output = {
      summary: {
        totalSkills: results.length,
        skillsNeedingMigration: results.filter((r) => r.needsMigration).length,
        errors: errors.length,
        warnings: warnings.length,
        emptyFolders: emptyFolders.length,
      },
      skills: results.map((r) => ({
        name: r.name,
        tier: r.tier,
        totalLines: r.totalLines,
        needsMigration: r.needsMigration,
        issues: r.issues,
      })),
      emptyFolders: emptyFolders.map((f) => ({ path: f })),
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log("\n=== Tier Migration Check ===\n");
    console.log(`Skills analyzed: ${results.length}`);
    console.log(`Errors: ${errors.length}`);
    console.log(`Warnings: ${warnings.length}`);
    if (emptyFolders.length) {
      console.log(`Empty folders: ${emptyFolders.length}`);
    }

    const needsMigration = results.filter((r) => r.needsMigration);
    if (needsMigration.length) {
      console.log(`\n⚠️  Skills requiring migration: ${needsMigration.length}\n`);

      for (const skill of needsMigration) {
        console.log(`## ${skill.name}`);
        console.log(`   Tier: ${skill.tier} → 2`);
        console.log(`   Lines: ${skill.skillFile.lines} (max: ${MAX_LINES})`);

        for (const issue of skill.issues.filter((i) => i.type === "ERROR")) {
          console.log(`   ❌ ${issue.message}`);
        }

        console.log(generateMigrationGuide(skill));
      }
    }

    // Show warnings (small files + empty folders)
    const smallFileWarnings = warnings.filter((w) => w.code === "VERY_SMALL_FILE");
    const emptyFolderWarnings = warnings.filter((w) => w.code === "EMPTY_FOLDER");
    const otherWarnings = warnings.filter((w) => w.code !== "VERY_SMALL_FILE" && w.code !== "EMPTY_FOLDER");

    if (smallFileWarnings.length) {
      console.log("\n📄 Very small files (<50 lines):\n");
      for (const warning of smallFileWarnings) {
        console.log(`- [${warning.skill}] ${warning.message}`);
      }
    }

    if (emptyFolderWarnings.length) {
      console.log("\n📁 Empty folders (should be removed):\n");
      for (const warning of emptyFolderWarnings) {
        console.log(`- ${warning.message}`);
      }
    }

    if (otherWarnings.length && !needsMigration.length) {
      console.log("\n⚠️  Other warnings:\n");
      for (const warning of otherWarnings) {
        console.log(`- [${warning.skill}] ${warning.message}`);
      }
    }

    if (!errors.length && !warnings.length) {
      console.log("\n✅ All skills within ideal size limits!\n");
    }
  }

  // Exit with error if migration needed
  if (errors.length) {
    process.exit(1);
  }
}

main();
