import { createHash } from "node:crypto";
import type { CommandSpec } from "../../registry";
import { buildToolCatalog, type ToolProfileId } from "../manifest/tools";

export type FixedHarnessProfile = { id: ToolProfileId; digest: string };

/** Return the fixed, registry-derived profile identity expected in a receipt. */
export function fixedHarnessProfile(
	commands: readonly CommandSpec[],
	profileId: string,
): FixedHarnessProfile | null {
	const catalog = buildToolCatalog(commands);
	const profile = catalog.tool_profiles.profiles.find(
		(candidate) => candidate.id === profileId,
	);
	if (!profile) return null;
	const canonical = JSON.stringify({
		catalog_version: catalog.version,
		profile,
	});
	return {
		id: profile.id,
		digest: createHash("sha256").update(canonical).digest("hex"),
	};
}
