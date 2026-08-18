import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evolutionDbPath, openEvolutionDb } from "../services/evolution";
import { removeEvolutionTestRoot } from "./evolution-test-support";

test("closing an initialized evolution database releases its project directory", () => {
	const root = mkdtempSync(join(tmpdir(), "evolution-db-close-"));
	const db = openEvolutionDb(evolutionDbPath(root));
	db.close();
	expect(() => removeEvolutionTestRoot(root)).not.toThrow();
});
