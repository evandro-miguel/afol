import { join } from "node:path";
import { resolveProjectWritePath } from "../project/root";
import { assertSafeEvolutionProjectRoot } from "./db";

const JOURNAL_FILE = "preferences.jsonl";

export function preferenceJournalPath(
	root: string,
	eventsDir = ".afol/data/events/evolution",
): string {
	assertSafeEvolutionProjectRoot(root);
	const resolved = resolveProjectWritePath(root, eventsDir);
	if (!resolved.ok) throw new Error(resolved.error);
	return join(resolved.value.path, JOURNAL_FILE);
}
