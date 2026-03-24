#!/usr/bin/env bun
/**
 * skill-read.js - Read all files from a skill directory
 *
 * Reads and outputs content from all skill files or specific files.
 * Helps agents quickly load complete skill context beyond SKILL.md.
 *
 * Usage:
 *   bun skill-read.js <skill-name>                 # Read all files
 *   bun skill-read.js <skill-name> --file <path>   # Read specific file
 *   bun skill-read.js <skill-name> --section <name> # Read section (root|references|products)
 *   bun skill-read.js <skill-name> --summary       # Show summary only
 */

const fs = require("fs");
const path = require("path");

function printHelp() {
  console.log(`
Read skill files content

Usage:
  bun skill-read.js <skill-name> [options]

Options:
  --file <path>      Read specific file (e.g., references/core/README.md)
  --section <name>   Read section: root, references, products
  --summary          Show summary only (no content)
  --skills-dir       Skills root directory (default: skills)
  --help             Show help

Examples:
  bun skill-read.js writing-skills
  bun skill-read.js writing-skills --file references/cso/README.md
  bun skill-read.js writing-skills --section references
  bun skill-read.js writing-skills --summary
`);
}

function parseArgs(argv) {
  const options = {
    skillName: null,
    file: null,
    section: null,
    summary: false,
    skillsDir: "skills",
    help: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];

    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }

    if (token === "--summary") {
      options.summary = true;
      continue;
    }

    if (token === "--file") {
      options.file = argv[++i];
      continue;
    }

    if (token === "--section") {
      options.section = argv[++i];
      continue;
    }

    if (token === "--skills-dir") {
      options.skillsDir = argv[++i];
      continue;
    }

    if (!token.startsWith("--") && !options.skillName) {
      options.skillName = token;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return options;
}

function getSkillFiles(skillDir) {
  const files = {
    root: [],
    references: [],
    products: [],
    all: [],
  };

  if (!fs.existsSync(skillDir)) {
    return null;
  }

  function walk(dir, relDir = "") {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules") {
        continue;
      }

      const fullPath = path.join(dir, entry.name);
      const relPath = relDir ? path.join(relDir, entry.name) : entry.name;

      if (entry.isDirectory()) {
        walk(fullPath, relPath);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        const file = {
          path: relPath,
          absolute: fullPath,
          name: entry.name,
          content: fs.readFileSync(fullPath, "utf8"),
          lines: fs.readFileSync(fullPath, "utf8").split(/\r?\n/).length,
        };

        files.all.push(file);

        if (relPath.includes("products")) {
          files.products.push(file);
        } else if (relPath.includes("references")) {
          files.references.push(file);
        } else {
          files.root.push(file);
        }
      }
    }
  }

  walk(skillDir);

  return files;
}

function formatFileContent(file, showPath = true) {
  let output = "";
  
  if (showPath) {
    output += `\n${"=".repeat(60)}\n`;
    output += `📄 ${file.path} (${file.lines} lines)\n`;
    output += `${"=".repeat(60)}\n\n`;
  }
  
  output += file.content;
  output += "\n";
  
  return output;
}

function formatSummary(skillName, files) {
  let output = `\n📚 Skill: ${skillName}\n`;
  output += `${"=".repeat(50)}\n\n`;

  const totalLines = files.all.reduce((sum, f) => sum + f.lines, 0);

  output += `📊 Summary:\n`;
  output += `  Total files: ${files.all.length}\n`;
  output += `  Total lines: ${totalLines}\n\n`;

  if (files.root.length > 0) {
    output += `📁 Root (${files.root.length} files):\n`;
    for (const file of files.root) {
      const icon = file.name === "SKILL.md" ? "🔷" : "📄";
      output += `  ${icon} ${file.name} (${file.lines} lines)\n`;
    }
    output += "\n";
  }

  if (files.references.length > 0) {
    output += `📁 References (${files.references.length} files):\n`;
    const bySubdir = {};
    for (const file of files.references) {
      const parts = file.path.split(path.sep);
      const subdir = parts[1] || "root";
      if (!bySubdir[subdir]) {
        bySubdir[subdir] = [];
      }
      bySubdir[subdir].push(file);
    }

    for (const [subdir, subdirFiles] of Object.entries(bySubdir).sort()) {
      output += `    📂 ${subdir}/\n`;
      for (const file of subdirFiles) {
        output += `      📄 ${file.name} (${file.lines} lines)\n`;
      }
    }
    output += "\n";
  }

  if (files.products.length > 0) {
    output += `📁 Products (${files.products.length} files):\n`;
    const byProduct = {};
    for (const file of files.products) {
      const parts = file.path.split(path.sep);
      const product = parts[3];
      if (!byProduct[product]) {
        byProduct[product] = [];
      }
      byProduct[product].push(file);
    }

    for (const [product, productFiles] of Object.entries(byProduct).sort()) {
      output += `    📦 ${product}/\n`;
      for (const file of productFiles) {
        const name = file.name.replace(".md", "");
        output += `      📄 ${name}.md (${file.lines} lines)\n`;
      }
    }
    output += "\n";
  }

  return output;
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

  if (!options.skillName) {
    console.error("\nError: skill-name is required\n");
    printHelp();
    process.exit(1);
  }

  const skillsDir = path.resolve(options.skillsDir);
  const skillDir = path.join(skillsDir, options.skillName);

  if (!fs.existsSync(skillDir)) {
    console.error(`\nError: Skill not found: ${options.skillName}\n`);
    console.error(`Looked in: ${skillDir}`);
    process.exit(1);
  }

  const files = getSkillFiles(skillDir);

  if (!files) {
    console.error(`\nError: Could not read skill directory\n`);
    process.exit(1);
  }

  // Summary mode
  if (options.summary) {
    console.log(formatSummary(options.skillName, files));
    process.exit(0);
  }

  // Specific file mode
  if (options.file) {
    const targetFile = files.all.find(f => f.path === options.file || f.name === options.file);
    
    if (!targetFile) {
      console.error(`\nError: File not found: ${options.file}\n`);
      console.error("Available files:");
      for (const file of files.all) {
        console.error(`  - ${file.path}`);
      }
      process.exit(1);
    }

    console.log(formatFileContent(targetFile));
    process.exit(0);
  }

  // Section mode
  if (options.section) {
    let sectionFiles = [];

    if (options.section === "root") {
      sectionFiles = files.root;
    } else if (options.section === "references") {
      sectionFiles = files.references;
    } else if (options.section === "products") {
      sectionFiles = files.products;
    } else {
      console.error(`\nError: Unknown section: ${options.section}\n`);
      console.error("Valid sections: root, references, products");
      process.exit(1);
    }

    if (sectionFiles.length === 0) {
      console.log(`\nNo files in section: ${options.section}\n`);
      process.exit(0);
    }

    console.log(`\n📁 Section: ${options.section} (${sectionFiles.length} files)\n`);
    for (const file of sectionFiles) {
      console.log(formatFileContent(file));
    }
    process.exit(0);
  }

  // Default: read all files
  console.log(formatSummary(options.skillName, files));
  console.log("\n" + "=".repeat(60));
  console.log("READING ALL FILES");
  console.log("=".repeat(60));

  // Read SKILL.md first
  const skillMd = files.root.find(f => f.name === "SKILL.md");
  if (skillMd) {
    console.log(formatFileContent(skillMd));
  }

  // Then other root files
  for (const file of files.root) {
    if (file.name !== "SKILL.md") {
      console.log(formatFileContent(file));
    }
  }

  // Then references
  for (const file of files.references) {
    console.log(formatFileContent(file));
  }

  // Then products
  for (const file of files.products) {
    console.log(formatFileContent(file));
  }
}

main();
