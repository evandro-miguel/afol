import { existsSync, lstatSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadJsonObject } from "../../core/schema";
import { atomicWriteText } from "../io/atomic";
import {
	CANONICAL_PROJECT_CONFIG_PATH,
	resolveProjectConfigPath,
} from "../project/paths";
import { resolveProjectWritePath } from "../project/root";

export const ADAPTER_IDS = ["antigravity"] as const;
export type AdapterId = (typeof ADAPTER_IDS)[number];
export type AdapterMutationAction = "enable" | "disable" | "sync";
export type AdapterConfigState = "enabled" | "disabled" | "unreadable";
export type AdapterOwnership = "missing" | "managed" | "user-owned";

type AdapterDefinition = {
	id: AdapterId;
	mirrorPath: string;
	content: string;
};

function managedContent(provider: AdapterId, importLine: string): string {
	return `<!-- AFOL-MANAGED: provider=${provider} source=AGENTS.md version=1 -->\n${importLine}\n`;
}

export const ADAPTER_DEFINITIONS: Readonly<
	Record<AdapterId, AdapterDefinition>
> = Object.freeze({
	antigravity: {
		id: "antigravity",
		mirrorPath: ".agents/rules/afol.md",
		content: managedContent(
			"antigravity",
			"Read and follow the canonical project instructions in `../../AGENTS.md` before starting work.",
		),
	},
});

export class AdapterOperationError extends Error {
	readonly code: "ADAPTER_CONFLICT" | "ADAPTER_INVALID";

	constructor(code: "ADAPTER_CONFLICT" | "ADAPTER_INVALID", message: string) {
		super(message);
		this.code = code;
		this.name = "AdapterOperationError";
	}
}

export type AdapterState = {
	id: AdapterId;
	enabled: boolean;
	configState: AdapterConfigState;
	mirrorPath: string;
	ownership: AdapterOwnership;
	inSync: boolean;
	artifactsPresent: boolean;
};

export type AdapterMutationResult = {
	id: AdapterId;
	outcome: "changed" | "unchanged";
	changedPaths: string[];
	dryRun: boolean;
	previous: AdapterState;
	next: AdapterState;
	ownership: AdapterOwnership;
};

type LoadedConfig = {
	path: string;
	value: Record<string, unknown>;
	raw: string;
};

function objectValue(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function objectValueOrEmpty(value: unknown): Record<string, unknown> {
	return objectValue(value) ?? {};
}

function validateAdapterConfig(config: Record<string, unknown>): void {
	if (config.adapters === undefined) return;
	const adapters = objectValue(config.adapters);
	if (!adapters) {
		throw new AdapterOperationError(
			"ADAPTER_INVALID",
			"project config adapters must be an object",
		);
	}
	for (const id of ADAPTER_IDS) {
		if (adapters[id] === undefined) continue;
		const provider = objectValue(adapters[id]);
		if (!provider) {
			throw new AdapterOperationError(
				"ADAPTER_INVALID",
				`project config adapters.${id} must be an object`,
			);
		}
		if (
			provider.enabled !== undefined &&
			typeof provider.enabled !== "boolean"
		) {
			throw new AdapterOperationError(
				"ADAPTER_INVALID",
				`project config adapters.${id}.enabled must be a boolean`,
			);
		}
	}
}

function adapterWritePath(projectRoot: string, relativePath: string): string {
	const resolved = resolveProjectWritePath(projectRoot, relativePath);
	if (!resolved.ok) {
		throw new AdapterOperationError(
			"ADAPTER_INVALID",
			`unsafe target path: ${resolved.error}`,
		);
	}
	return resolved.value.path;
}

function loadConfig(projectRoot: string): LoadedConfig {
	let resolved: ReturnType<typeof resolveProjectConfigPath>;
	try {
		resolved = resolveProjectConfigPath(projectRoot);
	} catch (error) {
		throw new AdapterOperationError(
			"ADAPTER_INVALID",
			`project config is unreadable: ${(error as Error).message}`,
		);
	}
	const relativePath = resolved?.relativePath ?? CANONICAL_PROJECT_CONFIG_PATH;
	const path = adapterWritePath(projectRoot, relativePath);
	if (!existsSync(path)) {
		throw new AdapterOperationError(
			"ADAPTER_INVALID",
			"missing .afol/config.json; run `afol init` first",
		);
	}
	const loaded = loadJsonObject(path);
	if (!loaded.ok) {
		throw new AdapterOperationError(
			"ADAPTER_INVALID",
			`project config is unreadable: ${loaded.error}`,
		);
	}
	validateAdapterConfig(loaded.value);
	return { path, value: loaded.value, raw: readFileSync(path, "utf8") };
}

function configStateFromValue(
	config: Record<string, unknown>,
	id: AdapterId,
): AdapterConfigState {
	const adapters = objectValue(config.adapters);
	const provider = objectValue(adapters?.[id]);
	return provider?.enabled === true ? "enabled" : "disabled";
}

export function readAdapterConfigState(
	projectRoot: string,
	id: AdapterId,
): AdapterConfigState {
	try {
		return configStateFromValue(loadConfig(projectRoot).value, id);
	} catch {
		return "unreadable";
	}
}

function mirrorOwnership(projectRoot: string, id: AdapterId): AdapterOwnership {
	const definition = ADAPTER_DEFINITIONS[id];
	const path = join(projectRoot, definition.mirrorPath);
	let stats: ReturnType<typeof lstatSync> | null = null;
	try {
		stats = lstatSync(path);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
		return "user-owned";
	}
	if (!stats.isFile() || stats.isSymbolicLink()) return "user-owned";
	try {
		return readFileSync(path, "utf8") === definition.content
			? "managed"
			: "user-owned";
	} catch {
		return "user-owned";
	}
}

export function describeAdapter(
	projectRoot: string,
	id: AdapterId,
): AdapterState {
	const configState = readAdapterConfigState(projectRoot, id);
	const ownership = mirrorOwnership(projectRoot, id);
	return {
		id,
		enabled: configState === "enabled",
		configState,
		mirrorPath: ADAPTER_DEFINITIONS[id].mirrorPath,
		ownership,
		inSync: ownership === "managed",
		artifactsPresent: ownership !== "missing",
	};
}

function configWithStates(
	config: Record<string, unknown>,
	desired: ReadonlyMap<AdapterId, boolean>,
): string {
	const adapters = { ...objectValueOrEmpty(config.adapters) };
	for (const [id, enabled] of desired) {
		adapters[id] = {
			...objectValueOrEmpty(adapters[id]),
			enabled,
		};
	}
	return `${JSON.stringify({ ...config, adapters }, null, 2)}\n`;
}

function requiredMapValue<K, V>(map: ReadonlyMap<K, V>, key: K): V {
	const value = map.get(key);
	if (value === undefined) {
		throw new AdapterOperationError(
			"ADAPTER_INVALID",
			"internal adapter plan is incomplete",
		);
	}
	return value;
}

export function mutateAdapters(
	projectRoot: string,
	ids: readonly AdapterId[],
	action: AdapterMutationAction,
	dryRun: boolean,
): AdapterMutationResult[] {
	const config = loadConfig(projectRoot);
	const agentsPath = join(projectRoot, "AGENTS.md");
	const previous = new Map(
		ids.map((id) => [id, describeAdapter(projectRoot, id)]),
	);
	const desired = new Map<AdapterId, boolean>();
	for (const id of ids) {
		const before = requiredMapValue(previous, id);
		const enabled =
			action === "enable"
				? true
				: action === "disable"
					? false
					: before.enabled;
		desired.set(id, enabled);
		if (enabled && before.ownership === "user-owned") {
			throw new AdapterOperationError(
				"ADAPTER_CONFLICT",
				`${before.mirrorPath} is user-owned or modified; no files were changed`,
			);
		}
	}
	if ([...desired.values()].some(Boolean)) {
		if (!existsSync(agentsPath) || !lstatSync(agentsPath).isFile()) {
			throw new AdapterOperationError(
				"ADAPTER_INVALID",
				"AGENTS.md is missing or is not a regular file",
			);
		}
	}

	const changedById = new Map<AdapterId, string[]>();
	for (const id of ids) {
		const before = requiredMapValue(previous, id);
		const changed: string[] = [];
		if (before.enabled !== desired.get(id))
			changed.push(config.path.slice(projectRoot.length + 1));
		if (desired.get(id)) {
			if (before.ownership === "missing") changed.push(before.mirrorPath);
		} else if (before.ownership === "managed") {
			changed.push(before.mirrorPath);
		}
		changedById.set(id, changed.sort());
	}
	const configText = configWithStates(config.value, desired);
	const configChanged = configText !== config.raw;
	if (configChanged) {
		for (const id of ids) {
			const paths = requiredMapValue(changedById, id);
			const relativeConfig = config.path.slice(projectRoot.length + 1);
			if (!paths.includes(relativeConfig)) paths.push(relativeConfig);
			paths.sort();
		}
	}
	if (!dryRun) applyTransaction(projectRoot, ids, desired, config, configText);

	return ids.map((id) => {
		const before = requiredMapValue(previous, id);
		const enabled = requiredMapValue(desired, id);
		const ownership: AdapterOwnership = enabled
			? "managed"
			: before.ownership === "managed"
				? "missing"
				: before.ownership;
		const next: AdapterState = {
			...before,
			enabled,
			configState: enabled ? "enabled" : "disabled",
			ownership,
			inSync: ownership === "managed",
			artifactsPresent: ownership !== "missing",
		};
		const changedPaths = requiredMapValue(changedById, id);
		return {
			id,
			outcome: changedPaths.length > 0 ? "changed" : "unchanged",
			changedPaths,
			dryRun,
			previous: before,
			next,
			ownership,
		};
	});
}

function applyTransaction(
	projectRoot: string,
	ids: readonly AdapterId[],
	desired: ReadonlyMap<AdapterId, boolean>,
	config: LoadedConfig,
	configText: string,
): void {
	const snapshots = ids.map((id) => {
		const path = adapterWritePath(
			projectRoot,
			ADAPTER_DEFINITIONS[id].mirrorPath,
		);
		const ownership = mirrorOwnership(projectRoot, id);
		return {
			id,
			path,
			ownership,
			content: ownership === "managed" ? readFileSync(path, "utf8") : null,
		};
	});
	try {
		for (const snapshot of snapshots) {
			const definition = ADAPTER_DEFINITIONS[snapshot.id];
			if (desired.get(snapshot.id)) {
				atomicWriteText(snapshot.path, definition.content);
			} else if (mirrorOwnership(projectRoot, snapshot.id) === "managed") {
				rmSync(snapshot.path);
			}
		}
		if (configText !== config.raw) atomicWriteText(config.path, configText);
	} catch (error) {
		for (const snapshot of snapshots.reverse()) {
			if (snapshot.ownership === "user-owned") continue;
			if (snapshot.content === null) {
				if (existsSync(snapshot.path)) rmSync(snapshot.path);
			} else {
				atomicWriteText(snapshot.path, snapshot.content);
			}
		}
		atomicWriteText(config.path, config.raw);
		throw error;
	}
}

export function isAdapterPath(path: string): boolean {
	return ADAPTER_IDS.some((id) => ADAPTER_DEFINITIONS[id].mirrorPath === path);
}
