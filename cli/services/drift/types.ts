export type DriftSeverity = "fail" | "warn" | "info";

export type DriftFinding = {
	id: string;
	severity: DriftSeverity;
	domain: "adm" | "pstr" | "state";
	message: string;
	expected?: string;
	actual?: string;
	hint?: string;
};

export type DriftReport = {
	ok: boolean;
	checked_at: string;
	findings: DriftFinding[];
};
