#!/usr/bin/env bun
/**
 * cleanup-empty-folders.js - Remove empty folders from skill directories
 *
 * Scans skill directories and removes empty folders.
 * Use with --dry-run to preview before deleting.
 *
 * Usage:
 *   bun cleanup-empty-folders.js
 *   bun cleanup-empty-folders.js --skills-dir skills
 *   bun cleanup-empty-folders.js --dry-run
 */

const fs = require("fs");
const path = require("path");

function printHelp() {
  console.log(`
Remove empty folders from skill directories

Usage:
  bun cleanup-empty-folders.js [options]

Options:
  --skills-dir <dir>   Skills directory (default: skills)
  --dry-run            Preview without deleting
  --verbose            Show detailed output
  --help               Show help
`);
}

function parseArgs(argv) {
  const options = {
    skillsDir: "skills",
    dryRun: false,
    verbose: false,
    help: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }

    if (token === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (token === "--verbose" || token === "-v") {
      options.verbose = true;
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

function findEmptyFolders(dir, options = {}) {
  const empty = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") {
      continue;
    }

    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Recursively check subdirectories first
      const subEmpty = findEmptyFolders(full, options);
      empty.push(...subEmpty);

      // Check if this directory is empty (after processing subdirs)
      const subEntries = fs.readdirSync(full, { withFileTypes: true });
      const hasContent = subEntries.some(
        (e) =>
          e.isFile() ||
          (e.isDirectory() && e.name !== ".git" && e.name !== "node_modules")
      );
      if (!hasContent) {
        empty.push(full);
      }
    }
  }

  return empty;
}

function removeFolder(folderPath) {
  try {
    fs.rmdirSync(folderPath);
    return true;
  } catch (error) {
    console.error(`Failed to remove ${folderPath}: ${error.message}`);
    return false;
  }
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
    console.error(`\nError: Skills directory not found: ${skillsDir}\n`);
    process.exit(1);
  }

  console.log(`\n=== Empty Folder Cleanup ===\n`);
  console.log(`Scanning: ${skillsDir}`);
  if (options.dryRun) {
    console.log("Mode: DRY RUN (no files will be deleted)\n");
  } else {
    console.log("Mode: LIVE (files will be deleted)\n");
  }

  const emptyFolders = findEmptyFolders(skillsDir);

  if (emptyFolders.length === 0) {
    console.log("✅ No empty folders found!\n");
    process.exit(0);
  }

  console.log(`Found ${emptyFolders.length} empty folder(s):\n`);
  for (const folder of emptyFolders) {
    console.log(`  ${folder}`);
  }
  console.log("");

  if (options.dryRun) {
    console.log("Dry run complete. Run without --dry-run to delete.\n");
    process.exit(0);
  }

  // Remove empty folders (in reverse order to handle nested empties)
  let removed = 0;
  let failed = 0;

  const sorted = emptyFolders.sort((a, b) => b.length - a.length);
  for (const folder of sorted) {
    if (options.verbose) {
      console.log(`Removing: ${folder}`);
    }

    if (removeFolder(folder)) {
      removed++;
    } else {
      failed++;
    }
  }

  console.log(`Cleanup complete: ${removed} removed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
