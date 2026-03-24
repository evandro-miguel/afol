#!/usr/bin/env bun
/**
 * skill-files.js - List all files in a skill directory
 *
 * Shows the complete structure of a skill including all reference files.
 * Helps agents discover and read relevant skill files beyond SKILL.md.
 *
 * Usage:
 *   bun skill-files.js <skill-name>
 *   bun skill-files.js <skill-name> --tree
 *   bun skill-files.js <skill-name> --json
 */

const fs = require("fs");
const path = require("path");

function printHelp() {
  console.log(`
List all files in a skill directory

Usage:
  bun skill-files.js <skill-name> [options]

Options:
  --tree           Show tree structure
  --json           Output as JSON
  --skills-dir     Skills root directory (default: skills)
  --help           Show help

Examples:
  bun skill-files.js writing-skills
  bun skill-files.js writing-skills --tree
  bun skill-files.js writing-skills --json
`);
}

function parseArgs(argv) {
  const options = {
    skillName: null,
    tree: false,
    json: false,
    skillsDir: "skills",
    help: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];

    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }

    if (token === "--tree") {
      options.tree = true;
      continue;
    }

    if (token === "--json") {
      options.json = true;
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
  const files = [];
  const rootFiles = [];
  const referencesFiles = [];
  const productsFiles = [];

  if (!fs.existsSync(skillDir)) {
    return null;
  }

  // Extract description from frontmatter
  function extractDescription(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return null;
    
    const frontmatter = match[1];
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
    return descMatch ? descMatch[1].trim().replace(/^["']|["']$/g, '') : null;
  }

  // Collect all markdown files
  function walk(dir, prefix = "") {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules") {
        continue;
      }

      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(skillDir, fullPath);

      if (entry.isDirectory()) {
        walk(fullPath, relPath);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        const content = fs.readFileSync(fullPath, "utf8");
        const file = {
          path: relPath,
          absolute: fullPath,
          name: entry.name,
          size: fs.statSync(fullPath).size,
          lines: content.split(/\r?\n/).length,
          description: extractDescription(content),
        };

        files.push(file);

        if (relPath.includes("products")) {
          productsFiles.push(file);
        } else if (relPath.includes("references")) {
          referencesFiles.push(file);
        } else {
          rootFiles.push(file);
        }
      }
    }
  }

  walk(skillDir);

  return {
    all: files,
    root: rootFiles,
    references: referencesFiles,
    products: productsFiles,
  };
}

function formatTree(files, skillName) {
  let output = `${skillName}/\n\n`;

  // Root files
  for (const file of files.root) {
    const icon = file.name === "SKILL.md" ? "🔷" : "📄";
    output += `├── ${file.name} (${file.lines} lines)\n`;
    if (file.description) {
      output += `│   └─ ${file.description}\n`;
    }
  }

  // References
  if (files.references.length > 0) {
    output += `└── references/\n`;
    
    // Group by subdirectory
    const bySubdir = {};
    for (const file of files.references) {
      const parts = file.path.split(path.sep);
      const subdir = parts[1] || "root";
      if (!bySubdir[subdir]) {
        bySubdir[subdir] = [];
      }
      bySubdir[subdir].push(file);
    }

    const subdirs = Object.keys(bySubdir).sort();
    for (let i = 0; i < subdirs.length; i++) {
      const subdir = subdirs[i];
      const isLast = i === subdirs.length - 1;
      output += `    ${isLast ? "└── " : "├── "}${subdir}/\n`;
      
      const filesInSubdir = bySubdir[subdir];
      for (let j = 0; j < filesInSubdir.length; j++) {
        const file = filesInSubdir[j];
        const fileIsLast = j === filesInSubdir.length - 1;
        output += `    ${isLast ? "    " : "│   "}${fileIsLast ? "└── " : "├── "}${file.name} (${file.lines} lines)\n`;
        if (file.description) {
          output += `    ${isLast ? "    " : "│   "}${fileIsLast ? "    " : "│   "}└─ ${file.description}\n`;
        }
      }
    }
  }

  // Products
  if (files.products.length > 0) {
    output += `└── references/products/\n`;
    
    const byProduct = {};
    for (const file of files.products) {
      const parts = file.path.split(path.sep);
      const product = parts[3]; // references/products/<product>/file.md
      if (!byProduct[product]) {
        byProduct[product] = [];
      }
      byProduct[product].push(file);
    }

    const products = Object.keys(byProduct).sort();
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const isLast = i === products.length - 1;
      output += `    ${isLast ? "└── " : "├── "}${product}/\n`;
      
      const filesInProduct = byProduct[product];
      for (let j = 0; j < filesInProduct.length; j++) {
        const file = filesInProduct[j];
        const fileIsLast = j === filesInProduct.length - 1;
        const fileName = file.name.replace(".md", "");
        output += `    ${isLast ? "    " : "│   "}${fileIsLast ? "└── " : "├── "}${fileName}.md (${file.lines} lines)\n`;
        if (file.description) {
          output += `    ${isLast ? "    " : "│   "}${fileIsLast ? "    " : "│   "}└─ ${file.description}\n`;
        }
      }
    }
  }

  const totalLines = files.all.reduce((sum, f) => sum + f.lines, 0);
  output += `\nTotal: ${files.all.length} files, ${totalLines} lines`;

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

  if (options.json) {
    const output = {
      skill: options.skillName,
      directory: skillDir,
      totalFiles: files.all.length,
      totalLines: files.all.reduce((sum, f) => sum + f.lines, 0),
      files: {
        root: files.root.map(f => ({ path: f.path, lines: f.lines, description: f.description })),
        references: files.references.map(f => ({ path: f.path, lines: f.lines, description: f.description })),
        products: files.products.map(f => ({ path: f.path, lines: f.lines, description: f.description })),
      },
    };
    console.log(JSON.stringify(output, null, 2));
    process.exit(0);
  }

  if (options.tree) {
    console.log(formatTree(files, options.skillName));
    process.exit(0);
  }

  // Default output
  console.log(`\n📁 Skill: ${options.skillName}`);
  console.log(`📂 Directory: ${skillDir}`);
  console.log(`\n📄 Files (${files.all.length} total):\n`);

  if (files.root.length > 0) {
    console.log("Root:");
    for (const file of files.root) {
      const icon = file.name === "SKILL.md" ? "🔷" : "📄";
      console.log(`  ${icon} ${file.path} (${file.lines} lines)`);
      if (file.description) {
        console.log(`     └─ ${file.description}`);
      }
    }
    console.log("");
  }

  if (files.references.length > 0) {
    console.log("References:");
    for (const file of files.references) {
      console.log(`  📄 ${file.path} (${file.lines} lines)`);
      if (file.description) {
        console.log(`     └─ ${file.description}`);
      }
    }
    console.log("");
  }

  if (files.products.length > 0) {
    console.log("Products:");
    for (const file of files.products) {
      console.log(`  📦 ${file.path} (${file.lines} lines)`);
      if (file.description) {
        console.log(`     └─ ${file.description}`);
      }
    }
    console.log("");
  }

  const totalLines = files.all.reduce((sum, f) => sum + f.lines, 0);
  console.log(`Total: ${totalLines} lines\n`);
}

main();
