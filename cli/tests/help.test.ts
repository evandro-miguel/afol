import { describe, expect, test } from "bun:test";
import { formatHelpText } from "../help";
import { kernelRegistry } from "../registry";

describe("help formatter", () => {
	test("formats compact deterministic help text", () => {
		const help = formatHelpText();
		const copy = formatHelpText({
			...kernelRegistry,
			commands: [...kernelRegistry.commands],
		});

		expect(help).toBe(copy);
		expect(help.split("\n").length).toBeLessThanOrEqual(30);
		expect(help).toContain("Usage: afol");
		expect(help).toContain("Commands");
		expect(help).toContain("s/status");
		expect(help).toContain("v/validate");
		expect(help).toContain("n/new");
		expect(help).toContain("a=afol");
		expect(help).not.toContain("do/doctor");
	});
});
