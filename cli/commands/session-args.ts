import { type FlagDef, parseFlagSpec } from "./flag-spec";

export const ARCHIVE_CANDIDATE_PAGE_LIMIT = 10;

export type ParsedSessionArgs = {
	json: boolean;
	dryRun: boolean;
	debug: boolean;
	strict: boolean;
	branch: string | null;
	actor: string | null;
	reason: string | null;
	olderThanDays: number;
	candidates: boolean;
	archiveOffset: number;
	archiveLimit: number;
	session: string | null;
	positional: string[];
};

function numericFlag(
	name: string,
	key: "olderThanDays" | "archiveOffset" | "archiveLimit",
	valid: (value: number) => boolean,
	error: string,
): FlagDef<ParsedSessionArgs> {
	return {
		names: [name],
		kind: "value",
		allowEmptyValue: true,
		missingValueError: error,
		apply(state, raw) {
			const value = Number(raw);
			if (!valid(value)) throw new Error(error);
			state[key] = value;
		},
	};
}

const FLAGS: readonly FlagDef<ParsedSessionArgs>[] = [
	{ names: ["--json", "-j"], kind: "flag", key: "json" },
	{ names: ["--dry-run"], kind: "flag", key: "dryRun" },
	{ names: ["--debug"], kind: "flag", key: "debug" },
	{ names: ["--strict"], kind: "flag", key: "strict" },
	{ names: ["--candidates"], kind: "flag", key: "candidates" },
	{
		names: ["--session"],
		kind: "value",
		key: "session",
		rejectDashValue: true,
	},
	{ names: ["--branch"], kind: "value", key: "branch", rejectDashValue: true },
	{ names: ["--actor"], kind: "value", key: "actor", rejectDashValue: true },
	{ names: ["--reason"], kind: "value", key: "reason", rejectDashValue: true },
	numericFlag(
		"--older-than-days",
		"olderThanDays",
		(value) => Number.isFinite(value) && value >= 0,
		"--older-than-days must be a non-negative number.",
	),
	numericFlag(
		"--offset",
		"archiveOffset",
		(value) => Number.isInteger(value) && value >= 0,
		"--offset must be a non-negative integer.",
	),
	numericFlag(
		"--limit",
		"archiveLimit",
		(value) => Number.isInteger(value) && value > 0,
		"--limit must be a positive integer.",
	),
];

export function parseSessionArgs(args: string[]): ParsedSessionArgs {
	return parseFlagSpec<ParsedSessionArgs>(
		args,
		{
			flags: FLAGS,
			context: "session",
			skipFalsyArgs: true,
			positional(state, arg) {
				if (arg !== undefined) state.positional.push(arg);
				return true;
			},
		},
		{
			json: false,
			dryRun: false,
			debug: false,
			strict: false,
			branch: null,
			actor: null,
			reason: null,
			olderThanDays: 90,
			candidates: false,
			archiveOffset: 0,
			archiveLimit: ARCHIVE_CANDIDATE_PAGE_LIMIT,
			session: null,
			positional: [],
		},
	);
}
