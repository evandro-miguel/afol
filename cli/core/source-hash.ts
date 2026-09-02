import { createHash } from "node:crypto";

export type SourceHash = {
	algorithm: "sha256";
	hash: string;
};

export function computeSourceHash(content: string): SourceHash {
	const hash = createHash("sha256").update(content, "utf8").digest("hex");
	return { algorithm: "sha256", hash };
}

export function sourceHashEquals(a: SourceHash, b: SourceHash): boolean {
	return a.algorithm === b.algorithm && a.hash === b.hash;
}
