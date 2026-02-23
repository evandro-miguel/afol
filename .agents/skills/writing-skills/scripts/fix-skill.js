#!/usr/bin/env bun
/**
 * fix-skill.js - Auto-fix skill frontmatter issues
 *
 * Automatically fixes common issues:
 * - Converts array tags/triggers to comma-separated strings
 * - Converts multiline list syntax to comma-separated strings
 * - Rewrites simple `>-` frontmatter values to single-line values
 *
 * Usage:
 *   bun fix-skill.js <path-to-SKILL.md>
 *   bun fix-skill.js <skill-dir>
 *   bun fix-skill.js <skill-dir> --all-md
 */

const fs = require("fs");
const path = require("path");
const LINK_PATTERN = /\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

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
Auto-fix skill frontmatter

Usage:
  bun fix-skill.js <path-to-SKILL.md>
  bun fix-skill.js <skill-dir>
  bun fix-skill.js <skill-dir> --all-md

Options:
  --all-md   Fix every markdown file in the target directory recursively
  --backup   Keep .bak backup file for each changed markdown
  SKILLPOOL_GUARD=0   Disable universal-skills sync guard for this run
  --help     Show this help
`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = { target: ".", allMd: false, backup: false, help: false };
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === "--all-md") {
      options.allMd = true;
      continue;
    }
    if (token === "--backup") {
      options.backup = true;
      continue;
    }
    if (token === "--help") {
      options.help = true;
      continue;
    }
    if (token.startsWith("--")) {
      throw new Error(`Unknown argument: ${token}`);
    }
    options.target = token;
  }
  return options;
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

function fixFrontmatter(content) {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (!lines.length || lines[0].trim() !== "---") {
    return { fixed: false, content, message: "No frontmatter found" };
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return { fixed: false, content, message: "No closing ---" };
  }

  const fmLines = lines.slice(1, endIndex);
  const bodyLines = lines.slice(endIndex + 1);
  let modified = false;
  const newFmLines = [];
  let skipNextLine = false;

  for (let i = 0; i < fmLines.length; i += 1) {
    const line = fmLines[i];

    if (skipNextLine) {
      skipNextLine = false;
      continue;
    }

    if (line.match(/^([a-zA-Z0-9_-]+):\s*>-\s*$/)) {
      const key = line.split(":")[0];
      const nextLine = fmLines[i + 1];
      if (nextLine && nextLine.trim()) {
        newFmLines.push(`${key}: ${nextLine.trim()}`);
        skipNextLine = true;
        modified = true;
        continue;
      }
    }

    const arrayMatch = line.match(/^(\s*)(tags|triggers|references):\s*\[(.*)\]\s*$/);
    if (arrayMatch) {
      const indent = arrayMatch[1];
      const key = arrayMatch[2];
      const items = arrayMatch[3]
        .split(",")
        .map((item) => item.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean)
        .join(", ");
      newFmLines.push(`${indent}${key}: "${items}"`);
      modified = true;
      continue;
    }

    if (line.match(/^(\s*)(tags|triggers|references):\s*$/)) {
      const indent = line.match(/^(\s*)/)[1];
      const key = line.match(/(tags|triggers|references)/)[1];
      const items = [];
      let j = i + 1;
      while (j < fmLines.length && fmLines[j].match(/^\s+-\s+/)) {
        const value = fmLines[j]
          .replace(/^\s+-\s+/, "")
          .trim()
          .replace(/^["']|["']$/g, "");
        items.push(value);
        j += 1;
      }
      if (items.length) {
        newFmLines.push(`${indent}${key}: "${items.join(", ")}"`);
        i = j - 1;
        modified = true;
        continue;
      }
    }

    newFmLines.push(line);
  }

  if (!modified) {
    return { fixed: false, content, message: "No fixes needed" };
  }

  const newContent = ["---", ...newFmLines, "---", ...bodyLines].join("\n");
  return { fixed: true, content: newContent, message: "Fixed frontmatter issues" };
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
  if (!pathPart || path.extname(pathPart) !== "") {
    return null;
  }

  const fileDir = path.dirname(filePath);
  const absolute = path.resolve(fileDir, pathPart);
  const looksDirLink =
    pathPart.endsWith("/") || (fs.existsSync(absolute) && fs.statSync(absolute).isDirectory());
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

function normalizeRelativeLink(filePath, rawLink) {
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

function fixAmbiguousLinks(filePath, content) {
  let changed = false;
  const next = content.replace(LINK_PATTERN, (full, rawLink) => {
    const suggestion =
      resolveLinkSuggestion(filePath, rawLink) ||
      normalizeRelativeLink(filePath, rawLink);
    if (!suggestion || suggestion === rawLink) {
      return full;
    }
    changed = true;
    return full.replace(`(${rawLink}`, `(${suggestion}`);
  });
  return { changed, content: next };
}

function fixFile(filePath, options) {
  const original = fs.readFileSync(filePath, "utf8");
  const fm = fixFrontmatter(original);
  const link = fixAmbiguousLinks(filePath, fm.fixed ? fm.content : original);

  const changed = fm.fixed || link.changed;
  if (!changed) {
    return { filePath, fixed: false, message: "No fixes needed" };
  }

  const out = link.changed ? link.content : fm.content;
  const messages = [];
  if (fm.fixed) {
    messages.push("Fixed frontmatter issues");
  }
  if (link.changed) {
    messages.push("Rewrote ambiguous markdown links");
  }

  fs.writeFileSync(filePath, out, "utf8");
  if (options.backup) {
    fs.writeFileSync(`${filePath}.bak`, original, "utf8");
  }
  return {
    filePath,
    fixed: true,
    message: options.backup
      ? `${messages.join("; ")} (backup: ${filePath}.bak)`
      : messages.join("; "),
  };
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

  try {
    runUniversalSkillsGuard();
  } catch (error) {
    console.error(`\nError: ${error.message}\n`);
    process.exit(1);
  }

  const target = path.resolve(options.target);
  if (!fs.existsSync(target)) {
    console.error(`\nError: file or directory not found: ${target}\n`);
    process.exit(1);
  }

  const isDirectory = fs.statSync(target).isDirectory();
  let files = [];
  if (isDirectory && options.allMd) {
    files = collectMarkdownFiles(target);
  } else if (isDirectory) {
    files = [path.join(target, "SKILL.md")];
  } else {
    files = [target];
  }

  files = files.filter((filePath) => fs.existsSync(filePath));
  if (!files.length) {
    console.error("\nNo markdown files found to fix.\n");
    process.exit(1);
  }

  console.log(`\nFixing ${files.length} file(s):\n`);
  let fixedCount = 0;
  for (const filePath of files) {
    const result = fixFile(filePath, options);
    if (result.fixed) {
      fixedCount += 1;
    }
    console.log(`${result.fixed ? "✅" : "ℹ️ "} ${filePath}: ${result.message}`);
  }

  console.log(`\nDone. Updated ${fixedCount}/${files.length} file(s).\n`);
}

main();
