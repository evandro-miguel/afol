import { spawnSync } from "node:child_process";

export const FULL_TEST_BATCH_SIZE = 20;

export function fullTestArgs(
	platform = process.platform,
	testFiles: readonly string[] = [],
): string[] {
	const args = ["test", "--only-failures", ...testFiles];
	if (platform === "win32") {
		args.push("--timeout", "360000", "--max-concurrency", "1");
	}
	return args;
}

export function fullTestBatches(
	testFiles: readonly string[],
	batchSize = FULL_TEST_BATCH_SIZE,
): string[][] {
	if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
		throw new Error("Full-test batch size must be a positive integer.");
	}
	const sorted = [...testFiles].sort();
	const batches: string[][] = [];
	for (let index = 0; index < sorted.length; index += batchSize) {
		batches.push(sorted.slice(index, index + batchSize));
	}
	return batches;
}

function discoverTestFiles(): string[] {
	return [...new Bun.Glob("**/*.test.ts").scanSync({ cwd: "cli" })].map(
		(path) => `cli/${path}`,
	);
}

export function runFullTest(): number {
	const batches = fullTestBatches(discoverTestFiles());
	if (batches.length === 0) {
		throw new Error("No test files found under cli/**.");
	}
	for (const batch of batches) {
		const result = spawnSync(
			process.execPath,
			fullTestArgs(process.platform, batch),
			{
				cwd: process.cwd(),
				env: process.env,
				stdio: "inherit",
			},
		);
		if (result.error) throw result.error;
		if (result.status !== 0) return result.status ?? 1;
	}
	return 0;
}

if (import.meta.main) {
	process.exitCode = runFullTest();
}
