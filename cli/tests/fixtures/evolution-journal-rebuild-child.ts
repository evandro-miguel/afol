import { evolutionDbPath, openEvolutionDb } from "../../services/evolution/db";
import { rebuildProductionDayProjection } from "../../services/evolution/journal";

const PROJECT_ID = "6b7d91ca-496b-4f0c-8537-5c4993810d15";
const TIMEZONE = "America/Asuncion";
const root = process.cwd();
const db = openEvolutionDb(evolutionDbPath(root));

try {
	rebuildProductionDayProjection({
		root,
		db,
		projectId: PROJECT_ID,
		timezone: TIMEZONE,
	});
} finally {
	db.close();
}
