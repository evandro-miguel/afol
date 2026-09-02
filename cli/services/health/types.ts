export type HealthSeverity = "fail" | "warn" | "info";
export type HealthFinding = {
	area: string; // "adm", "pstr", "wb", "memory", "library", "state", "ctx", "evolution", "token_budget"
	severity: HealthSeverity;
	message: string;
	hint?: string;
};
export type HealthReport = {
	ok: boolean;
	checked_at: string;
	findings: HealthFinding[];
	summary: { fail: number; warn: number; info: number };
};
export type DoctorReport = {
	configuration: Record<string, Record<string, unknown>>;
	scores: { area: string; score: number; max: number }[];
	remediation: {
		step: number;
		area: string;
		action: string;
		severity: HealthSeverity;
	}[];
};

export type HealthArea =
	| "adm"
	| "pstr"
	| "wb"
	| "memory"
	| "library"
	| "state"
	| "ctx"
	| "evolution"
	| "token_budget";
