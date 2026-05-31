import { parseArgs, type ParsedArgs } from "citty";
import * as v from "valibot";
import { createPatch, diffWords } from "diff";
// @ts-ignore: jsdiff ships JavaScript-only runtime package without bundled types
import jsdiff from "jsdiff";

const commandName = "toolchain-smoke";

const smokeCommandArgs = {
  json: {
    type: "boolean",
    description: commandName,
    default: false,
  },
} as const;

const parsedArgs: ParsedArgs<typeof smokeCommandArgs> = parseArgs(["--json"], smokeCommandArgs);

const payload = v.parse(
  v.object({
    tool: v.string(),
    count: v.number(),
  }),
  { tool: "toolchain", count: 1 },
);

const textPatch = createPatch("toolchain", "left", "right");
const wordDiff = diffWords("left side", "right side");
const objectDiff = jsdiff({ step: "toolchain" }, { step: "smoke" });

if (!parsedArgs.json) {
  throw new Error("toolchain smoke failed: citty parseArgs output");
}

if (payload.tool !== "toolchain" || payload.count !== 1) {
  throw new Error("toolchain smoke failed: valibot parse");
}

if (textPatch.length < 1) {
  throw new Error("toolchain smoke failed: diff createPatch");
}

if (!Array.isArray(wordDiff)) {
  throw new Error("toolchain smoke failed: diffWords output");
}

if (objectDiff === null || typeof objectDiff !== "object") {
  throw new Error("toolchain smoke failed: jsdiff output");
}

if (payload.tool === "toolchain" && textPatch && wordDiff && typeof objectDiff === "object") {
  process.stdout.write("toolchain smoke: ok\n");
}
