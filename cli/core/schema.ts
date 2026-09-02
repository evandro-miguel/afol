import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join, parse, resolve } from "node:path";
import type { Result } from "./result";
import { err, ok } from "./result";

export type SchemaObject = Record<string, unknown>;

export function isSchemaObject(value: unknown): value is SchemaObject {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isMissingPathError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "ENOENT"
	);
}

function rejectSymlinkedPath(path: string): Result<void, string> {
	const absolutePath = resolve(path);
	const parsed = parse(absolutePath);
	let candidate = parsed.root;
	for (const part of absolutePath
		.slice(parsed.root.length)
		.split(/[\\/]+/)
		.filter((segment) => segment.length > 0)) {
		candidate = join(candidate, part);
		try {
			if (lstatSync(candidate).isSymbolicLink()) {
				return err(`Refusing symlinked path component: ${path}`);
			}
		} catch (error) {
			if (isMissingPathError(error)) {
				return err(`Missing required file: ${path}`);
			}
			return err(`Cannot inspect ${path}: ${(error as Error).message}`);
		}
	}
	return ok(undefined);
}

export function loadJsonObject(path: string): Result<SchemaObject, string> {
	if (!existsSync(path)) {
		return err(`Missing required file: ${path}`);
	}
	const symlinkCheck = rejectSymlinkedPath(path);
	if (!symlinkCheck.ok) {
		return symlinkCheck;
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
	const symlinkCheck = rejectSymlinkedPath(path);
	if (!symlinkCheck.ok) {
		return symlinkCheck;
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
