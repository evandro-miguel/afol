import { resolve } from "node:path";

/** AFOL-owned config with no executable settings or target-project preload. */
export const TRUSTED_BUN_CONFIG_PATH = resolve(
	import.meta.dir,
	"..",
	"..",
	"benchmark-bunfig.toml",
);

export type TrustedBunInvocation = {
	command: string;
	args: string[];
};

export function trustedBunInvocation(
	args: readonly string[],
	execPath = process.execPath,
): TrustedBunInvocation {
	return {
		command: execPath,
		args: ["--no-env-file", `--config=${TRUSTED_BUN_CONFIG_PATH}`, ...args],
	};
}
