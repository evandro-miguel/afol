import { describe, expect, test } from "bun:test";
import { computeSourceHash, sourceHashEquals } from "../core/source-hash";

describe("source-hash", () => {
	test("computes sha256 of content", () => {
		const result = computeSourceHash("hello");
		expect(result.algorithm).toBe("sha256");
		expect(result.hash.length).toBe(64);
	});

	test("same content produces same hash", () => {
		const a = computeSourceHash("test content");
		const b = computeSourceHash("test content");
		expect(sourceHashEquals(a, b)).toBe(true);
	});

	test("different content produces different hash", () => {
		const a = computeSourceHash("content a");
		const b = computeSourceHash("content b");
		expect(sourceHashEquals(a, b)).toBe(false);
	});

	test("empty string produces valid hash", () => {
		const result = computeSourceHash("");
		expect(result.algorithm).toBe("sha256");
		expect(result.hash.length).toBe(64);
	});
});
