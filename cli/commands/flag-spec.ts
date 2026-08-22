/**
 * Declarative flag-spec parser shared by workbench command parsers.
 *
 * One imperative loop skeleton replaces the triplicated per-command flag
 * loops; each command declares flags and maps parsed state to its result.
 *
 * User-facing error strings are tested contracts and must stay identical:
 * - `Unknown <context> argument: <arg>`
 * - `Missing value for <name> in <context>.`
 */

export interface FlagCommon {
	/** First entry is the canonical name used in missing-value errors. */
	names: readonly [string, ...string[]];
	/** Override the canonical name used in missing-value errors. */
	errorName?: string;
	/** Interpolate the matched alias text into the missing-value error. */
	useMatchedNameInError?: boolean;
}

export type FlagDef<S> =
	| (FlagCommon & {
			kind: "flag";
			/** State field set to true when no apply override is given. */
			key?: Extract<keyof S, string>;
			apply?: (state: S) => void;
	  })
	| (FlagCommon & {
			kind: "value" | "multi";
			/** Store target when no apply override is given. */
			key?: Extract<keyof S, string>;
			/** Treat a value starting with "-" as missing. */
			rejectDashValue?: boolean;
			/** Runs after the missing-value gate, before storing. May throw. */
			validate?: (state: S, raw: string) => void;
			/** Overrides default storing for value kinds. */
			apply?: (state: S, raw: string) => void;
	  })
	| (FlagCommon & {
			kind: "terminator";
			/** Receives every arg after the terminator token; parsing stops. */
			apply: (state: S, rest: readonly string[]) => void;
	  });

interface FlagSpecProgram<S> {
	flags: readonly FlagDef<S>[];
	/** Command label used in generated error messages, e.g. "done". */
	context: string;
	/** Skip falsy args before matching; default keeps them as errors. */
	skipFalsyArgs?: boolean;
	/**
	 * Capture an unmatched arg; return false to fall through to the
	 * unknown-argument error.
	 */
	positional?: (state: S, arg: string | undefined) => boolean;
}

function storeValue<S extends object>(
	state: S,
	key: Extract<keyof S, string>,
	raw: unknown,
): void {
	(state as Record<string, unknown>)[key] = raw;
}

function pushValue<S extends object>(
	state: S,
	key: Extract<keyof S, string>,
	raw: string,
): void {
	const record = state as Record<string, unknown>;
	const bucket = record[key];
	if (Array.isArray(bucket)) bucket.push(raw);
	else record[key] = [raw];
}

function requireStoreKey<S extends object>(
	def: FlagDef<S>,
): Extract<keyof S, string> {
	if (!("key" in def && def.key)) {
		throw new Error(
			`flag-spec: ${def.names[0]} needs key or apply to store its value.`,
		);
	}
	return def.key;
}

export function parseFlagSpec<S extends object>(
	args: readonly string[],
	program: FlagSpecProgram<S>,
	initialState: S,
): S {
	const lookup = new Map<string, FlagDef<S>>();
	for (const def of program.flags) {
		for (const name of def.names) lookup.set(name, def);
	}
	const state = initialState;
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (program.skipFalsyArgs === true && !arg) continue;
		let def: FlagDef<S> | undefined;
		if (arg !== undefined) def = lookup.get(arg);
		if (!def) {
			if (program.positional?.(state, arg)) continue;
			throw new Error(`Unknown ${program.context} argument: ${arg}`);
		}
		if (def.kind === "flag") {
			if (def.apply) def.apply(state);
			else storeValue(state, requireStoreKey(def), true);
			continue;
		}
		if (def.kind === "terminator") {
			def.apply(state, args.slice(index + 1));
			return state;
		}
		const raw = args[index + 1];
		if (!raw || (def.rejectDashValue === true && raw.startsWith("-"))) {
			const name = def.useMatchedNameInError
				? arg
				: (def.errorName ?? def.names[0]);
			throw new Error(`Missing value for ${name} in ${program.context}.`);
		}
		index += 1;
		def.validate?.(state, raw);
		if (def.apply) def.apply(state, raw);
		else if (def.kind === "value") storeValue(state, requireStoreKey(def), raw);
		else pushValue(state, requireStoreKey(def), raw);
	}
	return state;
}
