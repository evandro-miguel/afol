import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_EVOLUTION_SETTINGS } from "../services/evolution/config";

test("automatic evolution observation is opt-in on the close hot path", () => {
	const defaults = DEFAULT_EVOLUTION_SETTINGS.autonomy as Record<
		string,
		unknown
	>;
	const template = JSON.parse(
		readFileSync(
			join(
				import.meta.dir,
				"..",
				"..",
				"src",
				"project-template",
				".afol",
				"config.json",
			),
			"utf8",
		),
	) as { evolution: { autonomy: { auto_observe: boolean } } };

	expect(defaults.auto_observe).toBe(false);
	expect(template.evolution.autonomy.auto_observe).toBe(false);
});
