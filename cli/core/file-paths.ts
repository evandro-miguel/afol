import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, sep } from "node:path";

export function toPosixPath(path: string): string {
	return path.split(sep).join("/");
}

export async function collectRelativeFilePaths(
	root: string,
	options: { missingRoot?: "empty" } = {},
): Promise<string[]> {
	const paths: string[] = [];

	if (options.missingRoot === "empty" && !existsSync(root)) {
		return paths;
	}

	async function walk(currentDir: string, relativeDir: string): Promise<void> {
		const entries = await readdir(currentDir, { withFileTypes: true });
		for (const entry of entries) {
			const absolutePath = join(currentDir, entry.name);
			const relativePath = relativeDir
				? `${relativeDir}/${entry.name}`
				: entry.name;
			if (entry.isDirectory()) {
				await walk(absolutePath, relativePath);
				continue;
			}
			if (!entry.isFile()) {
				continue;
			}
			paths.push(toPosixPath(relativePath));
		}
	}

	await walk(root, "");
	return paths.sort();
}
