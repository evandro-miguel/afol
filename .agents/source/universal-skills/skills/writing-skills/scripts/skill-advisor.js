#!/usr/bin/env bun
/**
 * skill-advisor.js
 *
 * Suggests merges/combinations for new skills and highlights
 * consolidation/improvement opportunities across existing skills.
 */

const fs = require("fs");
const path = require("path");

const WORD_RE = /[a-z0-9][a-z0-9-]{1,}/gi;
const STOPWORDS = new Set([
  "use",
  "when",
  "with",
  "from",
  "this",
  "that",
  "into",
  "for",
  "and",
  "the",
  "a",
  "an",
  "or",
  "to",
  "of",
  "in",
  "on",
  "by",
  "is",
  "are",
  "be",
  "as",
  "it",
  "its",
  "you",
  "your",
  "agent",
  "agents",
  "skill",
  "skills",
  "tasks",
  "task",
]);

const ADVICE_MODES = new Set(["warn", "enforce"]);

function printHelp() {
  console.log(`
Skill Advisor (merge/combo suggestions)

Usage:
  bun skills/writing-skills/scripts/skill-advisor.js candidate [options]
  bun skills/writing-skills/scripts/skill-advisor.js scan [options]

Candidate options:
  --name <kebab-case>            Candidate skill name (required)
  --description <text>           Candidate description
  --tags <csv>                   Candidate tags
  --triggers <csv>               Candidate triggers
  --tier <1|2|3>                 Candidate tier (optional)
  --root <dir>                   Skills root (default: skills)
  --top <n>                      Number of suggestions (default: 6)
  --mode <warn|enforce>          warn: suggest only; enforce: exit 2 on high overlap

Scan options:
  --root <dir>                   Skills root (default: skills)
  --top <n>                      Max overlap pairs to show (default: 15)

Examples:
  bun skills/writing-skills/scripts/skill-advisor.js candidate --name api-auth --tier 2
  bun skills/writing-skills/scripts/skill-advisor.js scan --root skills
`);
}

function parseArgs(argv) {
  const out = {
    command: null,
    root: "skills",
    top: 6,
    mode: "warn",
    name: null,
    description: "",
    tags: "",
    triggers: "",
    tier: null,
  };

  const parts = argv.slice(2);
  if (!parts.length || parts[0] === "--help" || parts[0] === "-h") {
    out.help = true;
    return out;
  }

  out.command = parts[0];
  for (let i = 1; i < parts.length; i += 1) {
    const token = parts[i];
    if (token === "--help" || token === "-h") {
      out.help = true;
      break;
    }
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    const value = parts[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${token}`);
    }
    out[key] = value;
    i += 1;
  }

  out.root = path.resolve(out.root);
  out.top = Number.parseInt(String(out.top), 10);
  if (!Number.isFinite(out.top) || out.top <= 0) {
    throw new Error(`Invalid --top: ${out.top}`);
  }
  return out;
}

function parseFrontmatter(content) {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (!lines.length || lines[0].trim() !== "---") {
    return {};
  }
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) {
    return {};
  }

  const data = {};
  const metadata = {};
  let inMetadata = false;
  for (const line of lines.slice(1, end)) {
    const top = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (top) {
      const key = top[1];
      const value = top[2].trim().replace(/^["']|["']$/g, "");
      if (key === "metadata") {
        inMetadata = true;
      } else {
        inMetadata = false;
        data[key] = value;
      }
      continue;
    }
    const nested = line.match(/^\s{2}([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (nested && inMetadata) {
      metadata[nested[1]] = nested[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  data.metadata = metadata;
  return data;
}

function collectSkillDirs(skillsRoot, allowMissing = false) {
  if (!fs.existsSync(skillsRoot)) {
    if (allowMissing) {
      return [];
    }
    throw new Error(`Skills root not found: ${skillsRoot}`);
  }
  return fs
    .readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(skillsRoot, entry.name))
    .filter((dir) => fs.existsSync(path.join(dir, "SKILL.md")));
}

function csvTokens(value) {
  return String(value || "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

function textTokens(value) {
  const found = String(value || "").toLowerCase().match(WORD_RE) || [];
  return found.filter((word) => !STOPWORDS.has(word));
}

function unique(arr) {
  return [...new Set(arr)];
}

function inferTier(skillDir) {
  const refs = path.join(skillDir, "references");
  const gotchas = path.join(skillDir, "gotchas.md");
  if (!fs.existsSync(refs)) {
    return "1";
  }
  const subdirs = fs
    .readdirSync(refs, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(refs, d.name));
  const req = ["README.md", "api.md", "configuration.md", "patterns.md", "gotchas.md"];
  const hasTier3Shape = subdirs.some((dir) =>
    req.every((f) => fs.existsSync(path.join(dir, f)))
  );
  if (hasTier3Shape) {
    return "3";
  }
  if (fs.existsSync(gotchas) || subdirs.length > 0) {
    return "2";
  }
  return "1";
}

function linesCount(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").split(/\r?\n/).length;
  } catch (_error) {
    return 0;
  }
}

function buildSkillRecord(skillDir) {
  const skillMd = path.join(skillDir, "SKILL.md");
  const content = fs.readFileSync(skillMd, "utf8");
  const fm = parseFrontmatter(content);
  const name = fm.name || path.basename(skillDir);
  const description = fm.description || "";
  const tags = fm.metadata?.tags || "";
  const triggers = fm.metadata?.triggers || "";
  const tokens = unique([
    ...textTokens(name.replace(/-/g, " ")),
    ...textTokens(description),
    ...csvTokens(tags),
    ...csvTokens(triggers),
  ]);

  return {
    path: skillDir,
    name,
    description,
    tags,
    triggers,
    tier: inferTier(skillDir),
    lines: linesCount(skillMd),
    hasUseWhen: description.startsWith("Use when"),
    hasTriggers: Boolean(String(triggers).trim()),
    hasTags: Boolean(String(tags).trim()),
    tokens,
  };
}

function jaccard(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  if (!sa.size && !sb.size) {
    return 0;
  }
  let inter = 0;
  for (const item of sa) {
    if (sb.has(item)) {
      inter += 1;
    }
  }
  const union = sa.size + sb.size - inter;
  return union ? inter / union : 0;
}

function scoreSimilarity(candidate, existing) {
  const nameScore = jaccard(textTokens(candidate.name.replace(/-/g, " ")), textTokens(existing.name.replace(/-/g, " ")));
  const tokenScore = jaccard(candidate.tokens, existing.tokens);
  const tagScore = jaccard(csvTokens(candidate.tags), csvTokens(existing.tags));
  const triggerScore = jaccard(csvTokens(candidate.triggers), csvTokens(existing.triggers));
  const tierBonus = candidate.tier && candidate.tier === existing.tier ? 0.05 : 0;
  const score = Math.min(
    1,
    nameScore * 0.35 + tokenScore * 0.4 + tagScore * 0.15 + triggerScore * 0.1 + tierBonus
  );
  return score;
}

function classify(score) {
  if (score >= 0.65) {
    return "duplicate-risk";
  }
  if (score >= 0.45) {
    return "high-overlap";
  }
  if (score >= 0.3) {
    return "related";
  }
  return "distant";
}

function prettyPct(value) {
  return `${Math.round(value * 100)}%`;
}

function tierSuggestion(candidate) {
  const text = `${candidate.name} ${candidate.description} ${candidate.tags} ${candidate.triggers}`.toLowerCase();
  const hasPlatformWords =
    /\b(platform|suite|ecosystem|multi|products?|providers?|integrations?)\b/.test(text);
  const hasSingleTechniqueWords =
    /\b(single|one task|focused|specific|narrow|quick fix|lint fix)\b/.test(text);

  if (candidate.tier === "1" && hasPlatformWords) {
    return "Candidate looks broad for Tier 1. Consider Tier 2 or Tier 3 split.";
  }
  if (candidate.tier === "3" && hasSingleTechniqueWords) {
    return "Candidate may be too narrow for Tier 3. Consider Tier 1 or Tier 2.";
  }
  return null;
}

function runCandidate(args, records) {
  if (!args.name) {
    throw new Error("candidate mode requires --name");
  }
  if (!ADVICE_MODES.has(String(args.mode))) {
    throw new Error(`Invalid --mode ${args.mode}. Use warn or enforce.`);
  }

  const candidate = {
    name: args.name,
    description: args.description || `Use when working with ${args.name.replace(/-/g, " ")} tasks.`,
    tags: args.tags || `${args.name}, tier-${args.tier || "1"}, skill`,
    triggers: args.triggers || args.name.replace(/-/g, ", "),
    tier: args.tier || null,
  };
  candidate.tokens = unique([
    ...textTokens(candidate.name.replace(/-/g, " ")),
    ...textTokens(candidate.description),
    ...csvTokens(candidate.tags),
    ...csvTokens(candidate.triggers),
  ]);

  const ranked = records
    .filter((r) => r.name !== candidate.name)
    .map((r) => ({ skill: r, score: scoreSimilarity(candidate, r) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, args.top);

  const duplicate = ranked.find((item) => item.score >= 0.65);

  console.log(`Skill Advisor :: candidate '${candidate.name}'`);
  console.log(`- root: ${args.root}`);
  console.log(`- mode: ${args.mode}`);
  console.log("");
  console.log("Top overlap suggestions:");
  for (const item of ranked) {
    const label = classify(item.score);
    console.log(
      `- ${item.skill.name}: ${prettyPct(item.score)} (${label})`
    );
  }

  const tierAdvice = tierSuggestion(candidate);
  if (tierAdvice) {
    console.log("");
    console.log(`Tier advice: ${tierAdvice}`);
  }

  if (duplicate) {
    console.log("");
    console.log(
      `Merge recommendation: candidate overlaps strongly with '${duplicate.skill.name}'. Prefer merge/expand existing skill instead of creating a new one.`
    );
  }

  if (args.mode === "enforce" && duplicate) {
    console.error("");
    console.error(
      `Blocking: duplicate-risk detected with '${duplicate.skill.name}' (${prettyPct(duplicate.score)}).`
    );
    process.exit(2);
  }
}

function runScan(args, records) {
  const pairs = [];
  for (let i = 0; i < records.length; i += 1) {
    for (let j = i + 1; j < records.length; j += 1) {
      const left = records[i];
      const right = records[j];
      const score = scoreSimilarity(left, right);
      if (score >= 0.45) {
        pairs.push({ left, right, score });
      }
    }
  }

  pairs.sort((a, b) => b.score - a.score);
  const topPairs = pairs.slice(0, args.top);

  console.log(`Skill Advisor :: scan (${records.length} skills)`);
  if (!topPairs.length) {
    console.log("- No high-overlap pairs found.");
  } else {
    console.log("Merge/combine candidates:");
    for (const item of topPairs) {
      console.log(
        `- ${item.left.name} <-> ${item.right.name}: ${prettyPct(item.score)} (${classify(item.score)})`
      );
    }
  }

  const quality = [];
  for (const r of records) {
    if (!r.hasUseWhen) {
      quality.push(`${r.name}: description should start with "Use when"`);
    }
    if (!r.hasTriggers) {
      quality.push(`${r.name}: missing metadata.triggers`);
    }
    if (!r.hasTags) {
      quality.push(`${r.name}: missing metadata.tags`);
    }
    if (r.lines > 500) {
      quality.push(`${r.name}: SKILL.md has ${r.lines} lines (consider tier split)`);
    }
  }

  console.log("");
  console.log("Improvement candidates:");
  if (!quality.length) {
    console.log("- No structural improvements flagged.");
  } else {
    for (const line of quality.slice(0, args.top * 2)) {
      console.log(`- ${line}`);
    }
  }
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.command || !["candidate", "scan"].includes(args.command)) {
    throw new Error("First argument must be 'candidate' or 'scan'");
  }

  const dirs = collectSkillDirs(args.root, args.command === "candidate");
  const records = dirs.map(buildSkillRecord);

  if (args.command === "candidate") {
    runCandidate(args, records);
    return;
  }
  runScan(args, records);
}

try {
  main();
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
}
