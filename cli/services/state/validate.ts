import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { CLI_PACKAGE_NAME, CLI_VERSION } from "../../generated/version";

export {
	isStale,
	type SessionStateValidation as StateValidationResult,
	validateSessionState as validateState,
} from "./session-state";

type RuntimePackageMetadata = {
	name: string;
	version: string;
};

type RuntimeBinaryProvenance = {
	package_name: string;
	version: string;
};

export type MutationRuntimeValidation =
	| { ok: true }
	| { ok: false; message: string };

export type MutationRuntimeValidationOptions = {
	cliRoot?: string | undefined;
	invocationPath?: string | undefined;
	operation?: string;
};

const DEFAULT_CLI_ROOT = resolve(import.meta.dir, "../../..");

function readRuntimePackageMetadata(
	cliRoot: string,
): RuntimePackageMetadata | null {
	const packagePath = join(cliRoot, "package.json");
	if (!existsSync(packagePath)) {
		return null;
	}
	const raw = JSON.parse(
		readFileSync(packagePath, "utf8"),
	) as Partial<RuntimePackageMetadata>;
	if (typeof raw.name !== "string" || typeof raw.version !== "string") {
		return null;
	}
	return { name: raw.name, version: raw.version };
}

function isBinaryInvocation(invocationPath: string): boolean {
	if (!invocationPath.trim()) {
		return false;
	}
	const binaryPath = resolveBinaryArtifactPath(invocationPath);
	return (
		isAfolBinaryName(invocationPath) ||
		existsSync(`${binaryPath}.provenance.json`)
	);
}

function isAfolBinaryName(path: string): boolean {
	const name = basename(path).toLowerCase();
	return name === "afol" || name === "afol.exe";
}

function resolveBinaryArtifactPath(invocationPath: string): string {
	const resolvedInvocationPath = resolve(invocationPath);
	if (isAfolBinaryName(invocationPath) && isAfolBinaryName(process.execPath)) {
		return resolve(process.execPath);
	}
	return resolvedInvocationPath;
}

function readBinaryProvenance(
	invocationPath: string,
): RuntimeBinaryProvenance | null {
	const provenancePath = `${resolveBinaryArtifactPath(invocationPath)}.provenance.json`;
	if (!existsSync(provenancePath)) {
		return null;
	}
	const raw = JSON.parse(
		readFileSync(provenancePath, "utf8"),
	) as Partial<RuntimeBinaryProvenance>;
	if (typeof raw.package_name !== "string" || typeof raw.version !== "string") {
		return null;
	}
	return {
		package_name: raw.package_name,
		version: raw.version,
	};
}

function refuse(operation: string, detail: string): MutationRuntimeValidation {
	return {
		ok: false,
		message: `Refusing real ${operation}: ${detail}`,
	};
}

export function validateMutationRuntime(
	options: MutationRuntimeValidationOptions = {},
): MutationRuntimeValidation {
	const operation = options.operation?.trim() || "mutation";
	const invocationPath = options.invocationPath ?? process.argv[1] ?? "";
	if (isBinaryInvocation(invocationPath)) {
		const provenancePath = `${resolveBinaryArtifactPath(invocationPath)}.provenance.json`;
		const provenance = readBinaryProvenance(invocationPath);
		if (!provenance) {
			return refuse(
				operation,
				`AFOL binary is not locally registered. Missing or invalid ${provenancePath}.`,
			);
		}
		if (provenance.package_name !== CLI_PACKAGE_NAME) {
			return refuse(
				operation,
				`AFOL binary provenance package ${provenance.package_name} diverges from generated package ${CLI_PACKAGE_NAME}.`,
			);
		}
		if (provenance.version !== CLI_VERSION) {
			return refuse(
				operation,
				`AFOL binary provenance version ${provenance.version} diverges from generated version ${CLI_VERSION}.`,
			);
		}

		return { ok: true };
	}

	const cliRoot = resolve(options.cliRoot ?? DEFAULT_CLI_ROOT);
	const metadata = readRuntimePackageMetadata(cliRoot);
	if (!metadata) {
		return refuse(
			operation,
			`missing or invalid package metadata at ${join(cliRoot, "package.json")}.`,
		);
	}
	if (CLI_PACKAGE_NAME !== metadata.name) {
		return refuse(
			operation,
			`generated package name ${CLI_PACKAGE_NAME} diverges from repo package name ${metadata.name}.`,
		);
	}
	if (CLI_VERSION !== metadata.version) {
		return refuse(
			operation,
			`AFOL runtime version ${CLI_VERSION} diverges from repo package version ${metadata.version}. Run bun run version:generate before mutating repos.`,
		);
	}
	return { ok: true };
}
