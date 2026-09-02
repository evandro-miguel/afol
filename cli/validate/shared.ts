import { existsSync, readFileSync } from "node:fs";

export function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function asString(value: unknown, key: string): string {
	if (typeof value !== "string" || value.trim() === "") {
		throw new Error(`Invalid or missing string field: ${key}`);
	}
	return value;
}

export function asNumberRecord(
	value: unknown,
	key: string,
): Record<string, number> {
	if (!isObject(value)) {
		throw new Error(`Invalid or missing object field: ${key}`);
	}
	const result: Record<string, number> = {};
	for (const [entryKey, entryValue] of Object.entries(value)) {
		if (typeof entryValue !== "number" || Number.isNaN(entryValue)) {
			throw new Error(`Invalid numeric threshold field: ${key}.${entryKey}`);
		}
		result[entryKey] = entryValue;
	}
	return result;
}

export function asOptionalNumber(
	value: unknown,
	key: string,
): number | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value !== "number" || Number.isNaN(value)) {
		throw new Error(`Invalid numeric field: ${key}`);
	}
	return value;
}

export function asOptionalObject(
	value: unknown,
	key: string,
): Record<string, unknown> | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (!isObject(value)) {
		throw new Error(`Invalid object field: ${key}`);
	}
	return value;
}

export function asBoolean(value: unknown, key: string): boolean {
	if (typeof value !== "boolean") {
		throw new Error(`Invalid boolean field: ${key}`);
	}
	return value;
}

export function asOptionalString(
	value: unknown,
	key: string,
): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value !== "string" || value.trim() === "") {
		throw new Error(`Invalid optional string field: ${key}`);
	}
	return value;
}

export function loadJsonObject(path: string): Record<string, unknown> {
	if (!existsSync(path)) {
		throw new Error(`Missing required file: ${path}`);
	}
	const parsed = JSON.parse(readFileSync(path, "utf8"));
	if (!isObject(parsed)) {
		throw new Error(`Invalid JSON object: ${path}`);
	}
	return parsed;
}
