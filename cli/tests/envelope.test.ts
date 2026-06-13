import { describe, expect, test } from "bun:test";
import {
	envelopeErr,
	envelopeOk,
	envelopeWithLegacyKeys,
	stringifyEnvelope,
} from "../core/envelope";

describe("envelope", () => {
	test("ok shape/schema/action/warnings", () => {
		const envelope = envelopeOk(
			{ value: 42 },
			{ action: "build", warnings: ["slow"] },
		);

		expect(envelope).toEqual({
			schema: "afol.result/v1",
			ok: true,
			action: "build",
			exit_code: 0,
			data: { value: 42 },
			warnings: ["slow"],
		});
		expect(envelope.error).toBeUndefined();
	});

	test("err shape/code/hint/exit", () => {
		const envelope = envelopeErr("E_FAIL", "broken", {
			hint: "retry",
			action: "deploy",
			exitCode: 9,
		});

		expect(envelope).toEqual({
			schema: "afol.result/v1",
			ok: false,
			action: "deploy",
			exit_code: 9,
			error: {
				code: "E_FAIL",
				message: "broken",
				hint: "retry",
			},
		});
		expect(envelope.data).toBeUndefined();
	});

	test("legacy keys shallow-copy", () => {
		const nested = { count: 1 };
		const envelope = envelopeOk(
			{ title: "ready", nested, ignored: true },
			{ action: "sync" },
		);
		const legacy = envelopeWithLegacyKeys(envelope, ["title", "nested"]);

		expect(legacy.title).toBe("ready");
		expect(legacy.nested).toBe(nested);
		expect(legacy.data).toEqual({ title: "ready", nested, ignored: true });
	});

	test("missing legacy key not copied", () => {
		type LegacyData = { present: string; absent?: string };
		const envelope = envelopeOk<LegacyData>(
			{ present: "yes" },
			{ action: "sync" },
		);
		const legacy = envelopeWithLegacyKeys(envelope, ["present", "absent"]);

		expect(legacy.present).toBe("yes");
		expect(Object.hasOwn(legacy, "absent")).toBe(false);
	});

	test("JSON string stable parse", () => {
		const envelope = envelopeErr("E_FAIL", "broken", { action: "deploy" });
		const json = stringifyEnvelope(envelope);

		expect(json).toBe(
			'{"schema":"afol.result/v1","ok":false,"exit_code":1,"error":{"code":"E_FAIL","message":"broken"},"action":"deploy"}',
		);
		expect(JSON.parse(json)).toEqual(envelope);
	});
});
