import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadYamlObject } from "../../core/schema";
import { atomicWriteText } from "../io/atomic";
import { resolveProjectPaths } from "../project/paths";
import type { ShapePack, ShapePageType } from "./types";

type ShapeSource = {
	path: keyof ReturnType<typeof resolveProjectPaths>["abs"];
	name: string;
	prefix: string;
	authority: ShapePageType["authority"];
	inclusion: ShapePageType["inclusion"];
	stalePolicy?: string;
};

const SHAPE_SOURCES: readonly ShapeSource[] = [
	{
		path: "admDir",
		name: "adm",
		prefix: "adm",
		authority: "canonical",
		inclusion: "task-matched",
		stalePolicy: "manual",
	},
	{
		path: "pstrDir",
		name: "pstr",
		prefix: "pstr",
		authority: "observed",
		inclusion: "surface-matched",
		stalePolicy: "rebuild-on-drift",
	},
	{
		path: "wbDir",
		name: "wb",
		prefix: "wb",
		authority: "execution",
		inclusion: "session-matched",
		stalePolicy: "session-age",
	},
	{
		path: "memoryFile",
		name: "memory",
		prefix: "memory",
		authority: "continuity",
		inclusion: "cited-only",
		stalePolicy: "memory-freshness",
	},
	{
		path: "libraryDir",
		name: "library",
		prefix: "library",
		authority: "external-knowledge",
		inclusion: "cited-only",
		stalePolicy: "reference-freshness",
	},
] as const;

function shapePackPath(root: string): string {
	return join(
		resolveProjectPaths(root).abs.admDir,
		"schema",
		"afol-shape.yaml",
	);
}

function toPageType(source: ShapeSource): ShapePageType {
	return {
		name: source.name,
		prefix: source.prefix,
		authority: source.authority,
		inclusion: source.inclusion,
		...(source.stalePolicy ? { stale_policy: source.stalePolicy } : {}),
	};
}

function isShapePageType(value: unknown): value is ShapePageType {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}
	const record = value as Record<string, unknown>;
	return (
		typeof record.name === "string" &&
		typeof record.prefix === "string" &&
		(record.authority === "canonical" ||
			record.authority === "observed" ||
			record.authority === "execution" ||
			record.authority === "continuity" ||
			record.authority === "external-knowledge") &&
		(record.inclusion === "task-matched" ||
			record.inclusion === "surface-matched" ||
			record.inclusion === "session-matched" ||
			record.inclusion === "compact" ||
			record.inclusion === "cited-only") &&
		(!("stale_policy" in record) || typeof record.stale_policy === "string")
	);
}

function isShapePack(value: unknown): value is ShapePack {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}
	const record = value as Record<string, unknown>;
	return (
		typeof record.api_version === "string" &&
		typeof record.name === "string" &&
		typeof record.version === "string" &&
		Array.isArray(record.page_types) &&
		record.page_types.every(isShapePageType)
	);
}

function renderScalar(value: string): string {
	return JSON.stringify(value);
}

function renderPageType(pageType: ShapePageType): string[] {
	const lines = [
		`  - name: ${renderScalar(pageType.name)}`,
		`    prefix: ${renderScalar(pageType.prefix)}`,
		`    authority: ${renderScalar(pageType.authority)}`,
		`    inclusion: ${renderScalar(pageType.inclusion)}`,
	];
	if (pageType.stale_policy) {
		lines.push(`    stale_policy: ${renderScalar(pageType.stale_policy)}`);
	}
	return lines;
}

function renderShapePack(pack: ShapePack): string {
	const lines = [
		`api_version: ${renderScalar(pack.api_version)}`,
		`name: ${renderScalar(pack.name)}`,
		`version: ${renderScalar(pack.version)}`,
		"page_types:",
	];
	for (const pageType of pack.page_types) {
		lines.push(...renderPageType(pageType));
	}
	return `${lines.join("\n")}\n`;
}

function sourceExists(root: string, source: ShapeSource): boolean {
	return existsSync(resolveProjectPaths(root).abs[source.path]);
}

function packByName(pack: ShapePack): Map<string, ShapePageType> {
	return new Map(
		pack.page_types.map((pageType) => [pageType.name, pageType] as const),
	);
}

export function detectShape(root: string): ShapePack {
	return {
		api_version: "1.0.0",
		name: "afol-shape",
		version: "1",
		page_types: SHAPE_SOURCES.filter((source) =>
			sourceExists(root, source),
		).map(toPageType),
	};
}

export function suggestShape(root: string): string[] {
	const detected = detectShape(root);
	const current = readShapePack(root);
	if (!current) {
		return ["write .afol/adm/schema/afol-shape.yaml from detected shape"];
	}

	const suggestions: string[] = [];
	if (
		current.api_version !== detected.api_version ||
		current.name !== detected.name ||
		current.version !== detected.version
	) {
		suggestions.push("update shape pack metadata");
	}

	const currentByName = packByName(current);
	const detectedByName = packByName(detected);
	for (const pageType of detected.page_types) {
		const existing = currentByName.get(pageType.name);
		if (!existing) {
			suggestions.push(`add page_type ${pageType.name}`);
			continue;
		}
		if (
			existing.prefix !== pageType.prefix ||
			existing.authority !== pageType.authority ||
			existing.inclusion !== pageType.inclusion ||
			(existing.stale_policy ?? "") !== (pageType.stale_policy ?? "")
		) {
			suggestions.push(`update page_type ${pageType.name}`);
		}
	}

	for (const pageType of current.page_types) {
		if (!detectedByName.has(pageType.name)) {
			suggestions.push(`remove page_type ${pageType.name}`);
		}
	}

	return suggestions;
}

export function readShapePack(root: string): ShapePack | null {
	const path = shapePackPath(root);
	if (!existsSync(path)) {
		return null;
	}
	const loaded = loadYamlObject(path);
	if (!loaded.ok || !isShapePack(loaded.value)) {
		return null;
	}
	return loaded.value;
}

export function writeShapePack(root: string, pack: ShapePack): void {
	const path = shapePackPath(root);
	mkdirSync(dirname(path), { recursive: true });
	atomicWriteText(path, renderShapePack(pack));
}

export function shapePackPathForRoot(root: string): string {
	return shapePackPath(root);
}
