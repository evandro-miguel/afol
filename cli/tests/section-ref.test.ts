import { describe, expect, test } from "bun:test";
import { formatSectionRef, parseSectionRef } from "../core/section-ref";

describe("section-ref", () => {
	test("parses domain:path", () => {
		const ref = parseSectionRef("adm:spec/F-18");
		expect(ref).not.toBeNull();
		expect(ref?.domain).toBe("adm");
		expect(ref?.path).toBe("spec/F-18");
	});

	test("parses domain:path#section", () => {
		const ref = parseSectionRef("pstr:api/auth#Routes");
		expect(ref).not.toBeNull();
		expect(ref?.domain).toBe("pstr");
		expect(ref?.path).toBe("api/auth");
		expect(ref?.section).toBe("Routes");
	});

	test("parses domain:path@anchor", () => {
		const ref = parseSectionRef("memory:context@v2");
		expect(ref).not.toBeNull();
		expect(ref?.domain).toBe("memory");
		expect(ref?.path).toBe("context");
		expect(ref?.anchor).toBe("v2");
	});

	test("parses domain:path#section@anchor", () => {
		const ref = parseSectionRef("wb:session/plan#Tasks@summary");
		expect(ref).not.toBeNull();
		expect(ref?.domain).toBe("wb");
		expect(ref?.path).toBe("session/plan");
		expect(ref?.section).toBe("Tasks");
		expect(ref?.anchor).toBe("summary");
	});

	test("roundtrip format matches parse", () => {
		const original = "pstr:cli/commands#overview";
		const ref = parseSectionRef(original);
		expect(ref).not.toBeNull();
		if (!ref) {
			throw new Error("expected section ref to parse");
		}
		expect(formatSectionRef(ref)).toBe(original);
	});

	test("rejects missing colon", () => {
		expect(parseSectionRef("nocolon")).toBeNull();
	});

	test("rejects empty domain", () => {
		expect(parseSectionRef(":path")).toBeNull();
	});

	test("rejects invalid domain", () => {
		expect(parseSectionRef("invalid:path")).toBeNull();
	});

	test("rejects empty path", () => {
		expect(parseSectionRef("adm:")).toBeNull();
	});
});
