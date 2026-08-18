import { spawnSync } from "node:child_process";

export function fullTestArgs(platform = process.platform): string[] {
	const args = ["test", "--only-failures"];
	if (platform === "win32") {
		args.push("--timeout", "360000", "--max-concurrency", "1");
	}
	return args;
}

export function runFullTest(): number {
	const result = spawnSync(process.execPath, fullTestArgs(), {
		cwd: process.cwd(),
		env: process.env,
		stdio: "inherit",
	});
	if (result.error) {
		throw result.error;
	}
	return result.status ?? 1;
}

if (import.meta.main) {
	process.exitCode = runFullTest();
}
