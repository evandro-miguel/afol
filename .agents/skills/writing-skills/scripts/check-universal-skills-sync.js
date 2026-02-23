#!/usr/bin/env bun
/**
 * Guard script: verify local skills mirror is in sync with universal-skills pool.
 *
 * Compares:
 *   skills/<skill-name> <-> apps/universal-skills/skills/<skill-name>
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function printHelp() {
  console.log(`
Check sync between local skills and universal-skills pool

Usage:
  bun skills/writing-skills/scripts/check-universal-skills-sync.js [options]

Options:
  --source <dir>      Source skills dir (default: skills)
  --mirror <dir>      Mirror skills dir (default: apps/universal-skills/skills)
  --skill <csv>       Check only selected skill(s)
  --sync              Run sync command before checking
  --help              Show help

Examples:
  bun skills/writing-skills/scripts/check-universal-skills-sync.js
  bun skills/writing-skills/scripts/check-universal-skills-sync.js --skill writing-skills
  bun skills/writing-skills/scripts/check-universal-skills-sync.js --sync
`);
}

function parseCsv(value) {
  if (!value) {
    return [];
  }
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const options = {
    source: "skills",
    mirror: "apps/universal-skills/skills",
    skills: [],
    sync: false,
    help: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }

    if (token === "--sync") {
      options.sync = true;
      continue;
    }

    if (token.startsWith("--")) {
      const key = token.slice(2);
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${token}`);
      }

      if (key === "skill") {
        options.skills = parseCsv(value);
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

function listSkillDirs(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(rootDir, name, "SKILL.md")))
    .sort((a, b) => a.localeCompare(b));
}

function findUniversalContractScript(startDir) {
  let current = path.resolve(startDir);

  for (let i = 0; i < 10; i += 1) {
    const candidates = [
      path.join(current, "apps", "universal-skills", "scripts", "universal-contract.js"),
      path.join(current, "scripts", "universal-contract.js"),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return null;
}

function runUniversalContractCheck(skillsRoot, label) {
  const script = findUniversalContractScript(process.cwd()) || findUniversalContractScript(__dirname);

  if (!script) {
    throw new Error(
      "Universal contract script not found. Expected apps/universal-skills/scripts/universal-contract.js"
    );
  }

  const proc = Bun.spawnSync(
    ["bun", script, "--skills-root", skillsRoot, "--only-with-skill-md"],
    {
      stdout: "inherit",
      stderr: "inherit",
    }
  );

  if (proc.exitCode !== 0) {
    throw new Error(`Universal contract check failed for ${label}: ${skillsRoot}`);
  }
}

function listFilesRecursive(rootDir) {
  const output = [];
  const stack = [rootDir];

  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name === ".git") {
        continue;
      }

      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        output.push(fullPath);
      }
    }
  }

  output.sort((a, b) => a.localeCompare(b));
  return output;
}

function dirDigest(dirPath) {
  const files = listFilesRecursive(dirPath);
  const manifest = files
    .map((filePath) => {
      const rel = path.relative(dirPath, filePath).replaceAll("\\", "/");
      const hash = crypto
        .createHash("sha256")
        .update(fs.readFileSync(filePath))
        .digest("hex");
      return `${rel}\0${hash}`;
    })
    .join("\n");

  return crypto.createHash("sha256").update(manifest).digest("hex");
}

function runSync(sourceRoot, mirrorRoot) {
  const script = path.resolve("apps/universal-skills/scripts/sync-skills.js");
  if (!fs.existsSync(script)) {
    throw new Error(`Sync script not found: ${script}`);
  }

  const proc = Bun.spawnSync(
    ["bun", script, "--from", sourceRoot, "--to", mirrorRoot],
    {
      stdout: "inherit",
      stderr: "inherit",
    }
  );

  if (proc.exitCode !== 0) {
    throw new Error("Sync command failed.");
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
    return;
  }

  const sourceRoot = path.resolve(options.source);
  const mirrorRoot = path.resolve(options.mirror);

  if (!fs.existsSync(sourceRoot)) {
    console.log("STATUS: BLOCKING");
    console.log("Errors: 1  Warnings: 0");
    console.log(`\nFINDINGS:\n- [ERROR SOURCE_MISSING] ${sourceRoot} not found`);
    process.exit(1);
  }

  if (options.sync) {
    runSync(sourceRoot, mirrorRoot);
  }

  if (!fs.existsSync(mirrorRoot)) {
    console.log("STATUS: BLOCKING");
    console.log("Errors: 1  Warnings: 0");
    console.log(`\nFINDINGS:\n- [ERROR MIRROR_MISSING] ${mirrorRoot} not found`);
    process.exit(1);
  }

  runUniversalContractCheck(sourceRoot, "source");
  runUniversalContractCheck(mirrorRoot, "mirror");

  const sourceSkills = listSkillDirs(sourceRoot);
  const mirrorSkills = listSkillDirs(mirrorRoot);
  const sourceSet = new Set(sourceSkills);
  const mirrorSet = new Set(mirrorSkills);

  const targetSkills = options.skills.length ? options.skills : sourceSkills;

  const findings = [];

  for (const skillName of targetSkills) {
    const sourceSkill = path.join(sourceRoot, skillName);
    const mirrorSkill = path.join(mirrorRoot, skillName);

    if (!fs.existsSync(path.join(sourceSkill, "SKILL.md"))) {
      findings.push({
        level: "ERROR",
        code: "SOURCE_SKILL_MISSING",
        message: `${skillName} missing in source (${sourceSkill})`,
      });
      continue;
    }

    if (!fs.existsSync(path.join(mirrorSkill, "SKILL.md"))) {
      findings.push({
        level: "ERROR",
        code: "MIRROR_SKILL_MISSING",
        message: `${skillName} missing in mirror (${mirrorSkill})`,
      });
      continue;
    }

    const sourceHash = dirDigest(sourceSkill);
    const mirrorHash = dirDigest(mirrorSkill);

    if (sourceHash !== mirrorHash) {
      findings.push({
        level: "ERROR",
        code: "SKILL_DRIFT",
        message: `${skillName} differs between source and mirror`,
      });
    }
  }

  if (!options.skills.length) {
    for (const mirrorSkill of mirrorSkills) {
      if (!sourceSet.has(mirrorSkill)) {
        findings.push({
          level: "WARN",
          code: "EXTRA_MIRROR_SKILL",
          message: `${mirrorSkill} exists in mirror but not in source`,
        });
      }
    }

    for (const sourceSkill of sourceSkills) {
      if (!mirrorSet.has(sourceSkill)) {
        findings.push({
          level: "ERROR",
          code: "MISSING_IN_MIRROR",
          message: `${sourceSkill} exists in source but not in mirror`,
        });
      }
    }
  }

  const errors = findings.filter((item) => item.level === "ERROR");
  const warns = findings.filter((item) => item.level === "WARN");

  const status = errors.length ? "BLOCKING" : findings.length ? "CONCERNS" : "PASS";

  console.log(`STATUS: ${status}`);
  console.log(`Errors: ${errors.length}  Warnings: ${warns.length}`);

  if (findings.length) {
    console.log("\nFINDINGS:");
    findings.forEach((item) => {
      console.log(`- [${item.level} ${item.code}] ${item.message}`);
    });
  }

  if (errors.length) {
    console.log(
      "\nAction: run `bun apps/universal-skills/scripts/sync-skills.js --from skills --to apps/universal-skills/skills`"
    );
    process.exit(1);
  }
}

main();
