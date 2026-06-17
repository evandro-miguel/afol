import type { ProjectBenchmarkIssue } from "./types";

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function pushProjectBenchmarkIssue(
	issues: ProjectBenchmarkIssue[],
	severity: ProjectBenchmarkIssue["severity"],
	code: string,
	file: string,
	message: string,
): void {
	issues.push({ severity, code, file, message });
}

export function hasDateShape(value: unknown): boolean {
	if (typeof value !== "string") {
		return false;
	}
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) {
		return false;
	}
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(Date.UTC(year, month - 1, day));
	return (
		date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
	);
}

export function hasAbsoluteUriShape(value: unknown): boolean {
	if (typeof value !== "string" || value.length === 0) {
		return false;
	}
	try {
		const url = new URL(value);
		return url.protocol.length > 0;
	} catch {
		return false;
	}
}

export function pushUnexpectedProperties(
	issues: ProjectBenchmarkIssue[],
	file: string,
	record: Record<string, unknown>,
	allowed: readonly string[],
	code: string,
	label: string,
): void {
	const allowedKeys = getAllowedKeySet(allowed);
	for (const key of Object.keys(record)) {
		if (!allowedKeys.has(key)) {
			pushProjectBenchmarkIssue(
				issues,
				"error",
				code,
				file,
				`Unexpected ${label} property: ${key}`,
			);
		}
	}
}

const allowedKeySets = new WeakMap<readonly string[], ReadonlySet<string>>();

function getAllowedKeySet(allowed: readonly string[]): ReadonlySet<string> {
	let allowedKeys = allowedKeySets.get(allowed);
	if (!allowedKeys) {
		allowedKeys = new Set(allowed);
		allowedKeySets.set(allowed, allowedKeys);
	}
	return allowedKeys;
}

export function validateEnum(
	issues: ProjectBenchmarkIssue[],
	value: unknown,
	allowed: readonly string[],
	code: string,
	file: string,
	field: string,
): void {
	if (typeof value !== "string" || !allowed.includes(value)) {
		pushProjectBenchmarkIssue(
			issues,
			"error",
			code,
			file,
			`Invalid ${field}: ${String(value ?? "missing")}`,
		);
	}
}
