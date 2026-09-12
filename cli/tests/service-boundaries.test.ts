import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

test("runtime services do not import command adapters", () => {
	const cli = resolve(import.meta.dir, "..");
	const services = join(cli, "services");
	const commands = `${join(cli, "commands")}${sep}`;
	const transpiler = new Bun.Transpiler({ loader: "ts" });
	const violations: string[] = [];
	for (const relativePath of new Bun.Glob("**/*.ts").scanSync({
		cwd: services,
	})) {
		if (relativePath.endsWith(".test.ts")) continue;
		const sourcePath = join(services, relativePath);
		for (const dependency of transpiler.scanImports(readFileSync(sourcePath))) {
			if (!dependency.path.startsWith(".")) continue;
			if (resolve(dirname(sourcePath), dependency.path).startsWith(commands)) {
				violations.push(`${relativePath}: ${dependency.path}`);
			}
		}
	}
	expect(violations).toEqual([]);
});
