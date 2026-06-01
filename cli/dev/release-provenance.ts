import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";

const artifact = "dist/afol";
const checksumPath = "dist/afol.sha256";
const provenancePath = "dist/afol.provenance.json";

if (!existsSync(artifact)) {
  console.error(`missing release artifact: ${artifact}`);
  process.exit(1);
}

const bytes = readFileSync(artifact);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const stats = statSync(artifact);

writeFileSync(checksumPath, `${sha256}  ${artifact}\n`, "utf8");
writeFileSync(
  provenancePath,
  `${JSON.stringify(
    {
      artifact,
      sha256,
      size_bytes: stats.size,
      bun: process.versions.bun ?? "unknown",
      node: process.version,
      generated_at: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(`release provenance: ${checksumPath} ${provenancePath}`);
