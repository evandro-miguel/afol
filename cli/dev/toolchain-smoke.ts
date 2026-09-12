import { createPatch, diffWords } from "diff";
import * as v from "valibot";

const payload = v.parse(
	v.object({
		tool: v.string(),
		count: v.number(),
	}),
	{ tool: "toolchain", count: 1 },
);

const textPatch = createPatch("toolchain", "left", "right");
const wordDiff = diffWords("left side", "right side");

if (payload.tool !== "toolchain" || payload.count !== 1) {
	throw new Error("toolchain smoke failed: valibot parse");
}

if (textPatch.length < 1) {
	throw new Error("toolchain smoke failed: diff createPatch");
}

if (!Array.isArray(wordDiff)) {
	throw new Error("toolchain smoke failed: diffWords output");
}

if (payload.tool === "toolchain" && textPatch && wordDiff) {
	process.stdout.write("toolchain smoke: ok\n");
}
