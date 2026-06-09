import { existsSync, readFileSync } from "node:fs";
import type { Result } from "./result";
import { err, ok } from "./result";

export type SchemaObject = Record<string, unknown>;

export function isSchemaObject(value: unknown): value is SchemaObject {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function loadJsonObject(path: string): Result<SchemaObject, string> {
	if (!existsSync(path)) {
		return err(`Missing required file: ${path}`);
	}
	let raw: string;
	try {
		raw = readFileSync(path, "utf8");
	} catch (readError) {
		return err(`Cannot read ${path}: ${(readError as Error).message}`);
	}
	try {
		const value = JSON.parse(raw);
		if (!isSchemaObject(value)) {
			return err(`Invalid JSON in ${path}: Top-level JSON must be an object`);
		}
		return ok(value);
	} catch (parseError) {
		const message =
			parseError instanceof Error ? parseError.message : `${parseError}`;
		return err(`Invalid JSON in ${path}: ${message}`);
	}
}

export function loadYamlObject(path: string): Result<SchemaObject, string> {
	if (!existsSync(path)) {
		return err(`Missing required file: ${path}`);
	}
	let raw: string;
	try {
		raw = readFileSync(path, "utf8");
	} catch (readError) {
		return err(`Cannot read ${path}: ${(readError as Error).message}`);
	}
	try {
		const value = Bun.YAML.parse(raw);
		if (!isSchemaObject(value)) {
			return err(`Invalid YAML in ${path}: Top-level YAML must be a mapping`);
		}
		return ok(value);
	} catch (parseError) {
		const message =
			parseError instanceof Error ? parseError.message : `${parseError}`;
		return err(`Invalid YAML in ${path}: ${message}`);
	}
}
