import type { Database } from "bun:sqlite";

export type DecayPreferenceStatus = "active" | "aging" | "dormant" | "rejected";

export function preferenceFreshness(age: number): number {
	if (!Number.isFinite(age) || age < 0)
		throw new Error("preference age must be non-negative");
	if (age < 7) return 1;
	if (age >= 20) return 0;
	return (20 - age) / 13;
}

export function effectivePreferenceConfidence(
	confidence: number,
	lastReinforcedProductionDay: number,
	currentProductionDay: number,
): number {
	if (currentProductionDay < lastReinforcedProductionDay)
		throw new Error("preference production ordinal rewound");
	const bounded = Math.max(0, Math.min(1, confidence));
	return (
		bounded *
		preferenceFreshness(currentProductionDay - lastReinforcedProductionDay)
	);
}

export function preferenceStatus(
	confidence: number,
	lastReinforcedProductionDay: number,
	currentProductionDay: number,
	status: DecayPreferenceStatus = "active",
): DecayPreferenceStatus {
	if (currentProductionDay < lastReinforcedProductionDay)
		throw new Error("preference production ordinal rewound");
	if (status === "rejected") return "rejected";
	const age = currentProductionDay - lastReinforcedProductionDay;
	if (
		effectivePreferenceConfidence(
			confidence,
			lastReinforcedProductionDay,
			currentProductionDay,
		) <= 0
	)
		return "dormant";
	return age >= 7 ? "aging" : "active";
}

export function refreshPreferenceDecayProjection(
	db: Database,
	projectId: string,
	currentProductionDay: number,
): void {
	if (!Number.isInteger(currentProductionDay) || currentProductionDay < 0)
		throw new Error("current production day must be a non-negative integer");
	const rows = db
		.query(
			"SELECT id, confidence, last_reinforced_production_day, status FROM preferences WHERE project_id = ?",
		)
		.all(projectId) as Array<Record<string, unknown>>;
	for (const row of rows) {
		const confidence = Number(row.confidence);
		const reinforced = Number(row.last_reinforced_production_day);
		db.prepare(
			"UPDATE preferences SET current_production_day = ?, effective_confidence = ?, status = ? WHERE project_id = ? AND id = ?",
		).run(
			currentProductionDay,
			effectivePreferenceConfidence(
				confidence,
				reinforced,
				currentProductionDay,
			),
			preferenceStatus(
				confidence,
				reinforced,
				currentProductionDay,
				String(row.status) as DecayPreferenceStatus,
			),
			projectId,
			String(row.id),
		);
	}
}
