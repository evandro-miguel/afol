import type { CommandKind } from "./registry";

type FrozenAliasMap = Readonly<Record<string, string>>;

export const SUBCOMMAND_ACTION_ALIASES = Object.freeze({
	adapter: Object.freeze({
		dis: "disable",
		en: "enable",
		ls: "list",
	}),
	adm: Object.freeze({
		mg: "migrate",
		p: "paths",
		pl: "plan",
		sh: "show",
		v: "validate",
	}),
	adr: Object.freeze({
		ac: "accept",
		ab: "abandon",
		ar: "archive",
		create: "new",
		sp: "supersede",
	}),
	bench: Object.freeze({
		bl: "baseline",
		c: "cli",
		ls: "list",
		r: "run",
		rp: "report",
		rl: "runtime-live",
	}),
	changelog: Object.freeze({
		a: "add",
	}),
	file: Object.freeze({
		ar: "archive",
		mv: "move",
		pt: "patch",
		ud: "undo",
	}),
	governance: Object.freeze({
		af: "activate-feature",
		bw: "bulk-waive",
		ls: "pending",
		p: "pending",
		resolve: "resolve-spec",
		rs: "resolve-spec",
		"waive-open": "bulk-waive",
	}),
	ctx: Object.freeze({
		b: "build",
		bn: "bundle",
		ex: "explain",
		se: "section",
		t: "tools",
	}),
	library: Object.freeze({
		ac: "add-claim",
		as: "add-source",
		dr: "doctor",
		g: "graph",
		h: "health",
		inv: "invalidate",
		ls: "list",
		pr: "propose",
		rb: "rebuild-index",
		s: "search",
		t: "topic",
	}),
	localState: Object.freeze({
		fs: "freshness",
		rb: "rebuild",
	}),
	maintenance: Object.freeze({
		m: "monthly",
		w: "weekly",
	}),
	memory: Object.freeze({
		a: "add",
		ar: "archive",
		find: "search",
		get: "show",
		ls: "list",
		pm: "promote",
		pr: "propose",
		rc: "recall",
		rd: "render",
		rj: "reject",
		s: "search",
		set: "update",
		sh: "show",
		u: "update",
	}),
	projectBenchmark: Object.freeze({
		gen: "generate",
		ls: "list",
		mx: "matrix",
		rec: "recommend",
		sh: "show",
		v: "validate",
	}),
	pstr: Object.freeze({
		det: "detect",
		rb: "rebuild",
		rc: "review-candidates",
		review: "review-candidates",
		sec: "section",
		sh: "show",
		st: "stale",
		sug: "suggest",
		v: "validate",
	}),
	spec: Object.freeze({
		cf: "conflict",
		ck: "check",
		ls: "list",
		wv: "waive",
	}),
	ux: Object.freeze({
		cov: "coverage",
		ls: "list",
		reg: "register",
		sh: "show",
		v: "validate",
	}),
	schema: Object.freeze({
		ap: "apply",
		det: "detect",
		res: "resolver",
		rv: "review",
		sug: "suggest",
	}),
	session: Object.freeze({
		b: "bind",
		ls: "list",
		sw: "switch",
		ub: "unbind",
	}),
	state: Object.freeze({
		ex: "export",
		sh: "show",
		sy: "sync",
		v: "validate",
	}),
	sweep: Object.freeze({
		d: "daily",
		m: "monthly",
		w: "weekly",
	}),
	telemetry: Object.freeze({
		ex: "export",
		q: "query",
		r: "report",
	}),
	update: Object.freeze({
		ap: "apply",
		ck: "check",
		plan: "preview",
		pv: "preview",
	}),
} satisfies Partial<Record<CommandKind, FrozenAliasMap>>);

export const FLAG_ALIASES = Object.freeze({
	adm: Object.freeze({
		"-D": "--dry-run",
	}),
	bench: Object.freeze({
		"-a": "--all",
		"-k": "--keep-artifacts",
		"-p": "--run",
		"-s": "--scenario",
	}),
	catchup: Object.freeze({
		"-S": "--session",
	}),
	close: Object.freeze({
		"-S": "--session",
		"-m": "--summary",
	}),
	ctx: Object.freeze({
		"-S": "--session",
		"-T": "--task",
	}),
	done: Object.freeze({
		"-S": "--session",
		"-T": "--task-id",
		"-a": "--artifact",
		"-c": "--command",
		"-n": "--note",
		"-o": "--result",
		"-s": "--require-spec-check",
		"-x": "--test",
	}),
	evidence: Object.freeze({
		"-S": "--session",
		"-T": "--task-id",
		"-a": "--artifact",
		"-c": "--command",
		"-n": "--note",
		"-o": "--result",
		"-r": "--reason",
		"-D": "--dry-run",
	}),
	file: Object.freeze({
		"-D": "--dry-run",
		"-S": "--session",
		"-T": "--task-id",
		"-a": "--append",
		"-i": "--id",
		"-p": "--path",
		"-r": "--reason",
		"-t": "--to",
	}),
	health: Object.freeze({
		"-a": "--area",
		"-d": "--deep",
		"-r": "--release",
	}),
	governance: Object.freeze({
		"-F": "--feature-id",
		"-P": "--parent-spec",
		"-S": "--session",
		"-r": "--reason",
	}),
	hydrate: Object.freeze({
		"-S": "--session",
	}),
	library: Object.freeze({
		"-c": "--claim",
		"-q": "--query",
		"-r": "--reason",
		"-s": "--source",
		"-t": "--topic",
		"-T": "--title",
		"-u": "--url",
	}),
	legacy: Object.freeze({
		"-D": "--dry-run",
		"-S": "--session",
		"-T": "--task-id",
		"-j": "--json",
		"-m": "--summary",
		"-r": "--reason",
	}),
	log: Object.freeze({
		"-S": "--session",
		"-m": "--message",
	}),
	transition: Object.freeze({
		"-S": "--session",
		"-T": "--task-id",
		"-r": "--reason",
	}),
	maintenance: Object.freeze({
		"-D": "--dry-run",
	}),
	memory: Object.freeze({
		"-b": "--body",
		"-g": "--tags",
		"-i": "--id",
		"-q": "--query",
		"-r": "--reason",
		"-t": "--title",
	}),
	new: Object.freeze({
		"-F": "--feature-id",
		"-I": "--intent",
		"-P": "--parent-spec",
		"-T": "--task",
		"-t": "--task",
	}),
	projectBenchmark: Object.freeze({
		"-c": "--check",
		"-f": "--for",
		"-s": "--strict",
	}),
	quickTask: Object.freeze({
		"-F": "--feature-id",
		"-P": "--parent-spec",
		"-T": "--task",
		"-a": "--artifact",
		"-c": "--command",
		"-n": "--note",
		"-t": "--task",
	}),
	schema: Object.freeze({
		"-D": "--dry-run",
		"-w": "--write",
	}),
	session: Object.freeze({
		"-D": "--dry-run",
		"-S": "--session",
		"-a": "--actor",
		"-b": "--branch",
	}),
	spec: Object.freeze({
		"-S": "--session",
		"-T": "--task",
		"-r": "--reason",
	}),
	start: Object.freeze({
		"-S": "--session",
		"-T": "--task-id",
	}),
	state: Object.freeze({
		"-S": "--session",
	}),
	status: Object.freeze({
		"-S": "--session",
	}),
	telemetry: Object.freeze({
		"-S": "--session",
		"-f": "--format",
		"-l": "--limit",
		"-t": "--type",
	}),
	update: Object.freeze({
		"-D": "--dry-run",
		"-S": "--session",
		"-T": "--task-id",
		"-r": "--reason",
	}),
	ux: Object.freeze({
		"-D": "--dry-run",
		"-s": "--from-spec",
		"-t": "--tool",
	}),
	verifyTasks: Object.freeze({
		"-S": "--session",
	}),
} satisfies Record<string, FrozenAliasMap>);

const VALUE_CONSUMING_FLAGS = new Set([
	"--actor",
	"--append",
	"--approval",
	"--area",
	"--artifact",
	"--baseline-id",
	"--body",
	"--branch",
	"--claim",
	"--command",
	"--cutoff-session-id",
	"--feature-id",
	"--for",
	"--format",
	"--from-spec",
	"--id",
	"--intent",
	"--issue",
	"--issue-type",
	"--limit",
	"--message",
	"--note",
	"--parent-spec",
	"--path",
	"--query",
	"--reason",
	"--result",
	"--run",
	"--scenario",
	"--session",
	"--source",
	"--tags",
	"--task",
	"--task-id",
	"--test",
	"--title",
	"--to",
	"--topic",
	"--type",
	"--url",
]);

export function normalizeSubcommandAction(
	group: string,
	action: string | undefined,
): string {
	if (!action) {
		return "";
	}
	const aliases = SUBCOMMAND_ACTION_ALIASES[
		group as keyof typeof SUBCOMMAND_ACTION_ALIASES
	] as FrozenAliasMap | undefined;
	return aliases?.[action] ?? action;
}

export function normalizeScopedFlags(
	scope: string,
	args: readonly string[],
): string[] {
	const aliases = FLAG_ALIASES[scope as keyof typeof FLAG_ALIASES] as
		| FrozenAliasMap
		| undefined;
	if (!aliases) {
		return [...args];
	}
	const normalized: string[] = [];
	let previousConsumesValue = false;
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === undefined) continue;
		if (arg === "--") {
			normalized.push("--", ...args.slice(index + 1));
			break;
		}
		if (previousConsumesValue) {
			normalized.push(arg);
			previousConsumesValue = false;
			continue;
		}
		const value = aliases[arg] ?? arg;
		normalized.push(value);
		previousConsumesValue = VALUE_CONSUMING_FLAGS.has(value);
	}
	return normalized;
}
