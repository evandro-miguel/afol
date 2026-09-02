export type CommandKind =
	| "status"
	| "feedback"
	| "validate"
	| "init"
	| "bootstrap"
	| "new"
	| "start"
	| "evidence"
	| "legacy"
	| "done"
	| "transition"
	| "close"
	| "log"
	| "quickTask"
	| "verifyTasks"
	| "hook"
	| "rule"
	| "skill"
	| "file"
	| "fleet"
	| "update"
	| "localState"
	| "pstr"
	| "ctx"
	| "state"
	| "hydrate"
	| "library"
	| "memory"
	| "evolve"
	| "adm"
	| "governance"
	| "spec"
	| "ux"
	| "adr"
	| "changelog"
	| "health"
	| "db"
	| "doctor"
	| "maintenance"
	| "sweep"
	| "schema"
	| "catchup"
	| "bench"
	| "projectBenchmark"
	| "preflight"
	| "adapter"
	| "telemetry"
	| "receipt"
	| "session";
export type CommandSideEffect =
	| "read"
	| "preview"
	| "write"
	| "append"
	| "generated";

export type CommandCategory = "core" | "workflow" | "inspect" | "ops";
export type CommandStability = "stable" | "experimental" | "compatibility";

export type CommandSubcommandSpec = {
	usage: string;
	sideEffect: CommandSideEffect;
	description: string;
	requires_approval?: boolean;
};

export type CommandSpec = {
	command: string;
	aliases: readonly string[];
	kind: CommandKind;
	sideEffect: CommandSideEffect;
	description: string;
	capabilities?: readonly string[];
	category?: CommandCategory;
	guidance?: readonly string[];
	subcommands?: readonly CommandSubcommandSpec[];
	requires_approval?: boolean;
	stability: CommandStability;
};

type CommandSpecInput = Omit<CommandSpec, "stability"> & {
	stability?: CommandStability;
};

const COMMAND_SPECS: readonly CommandSpecInput[] = Object.freeze([
	{
		command: "status",
		aliases: ["s"],
		kind: "status",
		sideEffect: "read",
		description: "Show current project status",
		category: "core",
		subcommands: [
			{
				usage: "--json",
				sideEffect: "read",
				description: "Emit machine-readable project status",
			},
			{
				usage: "--health",
				sideEffect: "read",
				description: "Include global health findings",
			},
			{
				usage: "--session <session-id>",
				sideEffect: "read",
				description: "Resolve status around a specific session",
			},
			{
				usage: "--task-id <task-id>",
				sideEffect: "read",
				description: "Resolve a specific task in the selected session",
			},
		],
	},
	{
		command: "feedback",
		aliases: ["fb"],
		kind: "feedback",
		sideEffect: "read",
		description: "Inspect and manage local feedback reports",
		category: "inspect",
		subcommands: [
			{
				usage: "status",
				sideEffect: "read",
				description: "Show feedback mode and count",
			},
			{
				usage: "list",
				sideEffect: "read",
				description: "List feedback reports",
			},
			{
				usage: "show --id <report-id>",
				sideEffect: "read",
				description: "Show one feedback report",
			},
			{
				usage: "preview",
				sideEffect: "preview",
				description: "Preview redacted feedback",
			},
			{
				usage: "annotate --note <text>",
				sideEffect: "write",
				description: "Annotate a feedback report",
			},
			{
				usage: "purge --confirm",
				sideEffect: "write",
				description: "Purge feedback reports",
			},
			{
				usage: "last -m <text>",
				sideEffect: "write",
				description: "Annotate the latest report",
			},
		],
	},
	{
		command: "validate",
		aliases: ["v", "ck", "check"],
		kind: "validate",
		sideEffect: "read",
		description: "Run validation gates",
		category: "core",
		guidance: [
			"Use project validation for scaffold health before and after edits.",
			"Use bench validation when command output, latency, or token budget changes.",
		],
		subcommands: [
			{
				usage: "project --json",
				sideEffect: "read",
				description: "Validate project structure and AFOL indexes",
			},
			{
				usage: "project --check-drift --json",
				sideEffect: "read",
				description: "Validate project structure and include drift checks",
			},
			{
				usage: "project --strict --json",
				sideEffect: "read",
				description:
					"Strict validation keeps failed hygiene checks blocking (release gate)",
			},
			{
				usage: "drift --json",
				sideEffect: "read",
				description: "Run drift validation only",
			},
			{
				usage: "bench --pack <pack-id> --json",
				sideEffect: "read",
				description: "Run one benchmark pack with its configured gates",
			},
			{
				usage: "bench --pack <pack-id> --scenario-id <scenario-id> --json",
				sideEffect: "read",
				description: "Rerun one scored scenario in a benchmark pack",
			},
			{
				usage: "bench --pack governance-history --timing-mode observe --json",
				sideEffect: "read",
				description: "Observe timing; non-timing gates block",
			},
			{
				usage: "select --changed-path <path>",
				sideEffect: "read",
				description: "Show which benchmark packs match changed paths",
			},
			{
				usage: "run --changed-path <path>",
				sideEffect: "read",
				description: "Run benchmark packs selected from changed paths",
			},
		],
	},
	{
		command: "init",
		aliases: ["i"],
		kind: "init",
		sideEffect: "write",
		description: "Install scaffold; use --dry-run to preview writes",
		category: "core",
		guidance: [
			"Read AGENTS.md and resolve .afol/adm/rules before applying changes.",
			"Use afol help init for current flags; preserve existing history and migrations.",
		],
		subcommands: [
			{
				usage: "--dry-run [--json]",
				sideEffect: "read",
				description:
					"Preview scaffold install without writing; --json emits a result envelope",
			},
		],
	},
	{
		command: "start",
		aliases: ["st"],
		kind: "start",
		sideEffect: "write",
		description: "Start a workbench task",
		category: "workflow",
		guidance: ["Task selectors accept comma lists and ascending ranges."],
		subcommands: [
			{
				usage: "--session <session-id> --task-id <task-id>",
				sideEffect: "write",
				description: "Start a specific task in a specific session",
			},
			{
				usage: "--task-id <task-id>",
				sideEffect: "write",
				description: "Start a task in the active or context session",
			},
			{
				usage: "--json",
				sideEffect: "write",
				description: "Emit machine-readable start result",
			},
			{
				usage: "--brief [full]",
				sideEffect: "write",
				description: "Emit project start briefing",
			},
		],
	},
	{
		command: "done",
		aliases: ["d"],
		kind: "done",
		sideEffect: "write",
		description: "Complete a task session",
		category: "workflow",
		guidance: [
			'Prefer -x / batch T-01..T-n: afol d T-01 -x "<cmd>" verifies and completes in one step.',
			"Separate evidence is diagnostic when you need a receipt without completing.",
			"Batch selectors run one shared check for execution-policy tasks.",
			'Use --test-shell "<cmd>" for one shell verification (local operator only).',
		],
		subcommands: [
			{
				usage: 'd T-01 -x "<cmd>"',
				sideEffect: "write",
				description: "Verify with -x and complete one task (preferred)",
			},
			{
				usage: 'd T-01..T-n -x "<cmd>"',
				sideEffect: "write",
				description: "One shared check for a batch range, then complete each",
			},
			{
				usage: "--session <session-id> --task-id <task-id>",
				sideEffect: "write",
				description: "Mark a task complete",
			},
			{
				usage: '--test "<cmd>"',
				sideEffect: "write",
				description:
					"Run ordered argv-only verification steps, record each result, then complete",
			},
			{
				usage: "--verification-timeout-ms <milliseconds>",
				sideEffect: "write",
				description: "Bound each step (default 600000ms; max 600000ms)",
			},
			{
				usage: "-- <argv...>",
				sideEffect: "write",
				description: "Run positional argv verification without shell parsing",
			},
			{
				usage: "--require-spec-check",
				sideEffect: "write",
				description: "Block done when the linked spec check conflicts",
			},
		],
	},
	{
		command: "transition",
		aliases: ["tr"],
		kind: "transition",
		sideEffect: "write",
		description: "Transition a task through the lifecycle state machine",
		category: "workflow",
		subcommands: [
			{
				usage:
					"--session <session-id> --task-id <task-id> --state <state> [--reason <text>]",
				sideEffect: "write",
				description: "Apply one validated task-state transition",
			},
			{
				usage: 'tr T-01 --state problem --reason "<blocker>"',
				sideEffect: "write",
				description:
					"Record a durable blocker reason; required for the problem state",
			},
			{
				usage: "--completion-policy execution|artifact|waiver",
				sideEffect: "write",
				description: "Set typed completion authority in State Board Notes",
			},
		],
	},
	{
		command: "new",
		aliases: ["n"],
		kind: "new",
		sideEffect: "write",
		description: "Create a workbench session",
		category: "core",
		subcommands: [
			{
				usage: "<theme> --task <summary>",
				sideEffect: "write",
				description: "Create a session with one or more initial tasks",
			},
			{
				usage: "<theme> --feature-id <F-id> --parent-spec <spec-id>",
				sideEffect: "write",
				description: "Create a governed session linked to feature/spec",
			},
			{
				usage: "<theme> --no-spec-required --reason <text>",
				sideEffect: "write",
				description: "Create a waived unbound session",
			},
			{
				usage: "<theme> --intent <text>",
				sideEffect: "write",
				description: "Attach explicit intent metadata to the session",
			},
		],
	},
	{
		command: "log",
		aliases: ["l"],
		kind: "log",
		sideEffect: "append",
		description: "Append a session log entry",
		category: "workflow",
		subcommands: [
			{
				usage: "--session <session-id> --message <text>",
				sideEffect: "append",
				description: "Append a timeline note to a session",
			},
			{
				usage: "--json",
				sideEffect: "append",
				description: "Emit machine-readable log result",
			},
		],
	},
	{
		command: "quick-task",
		aliases: ["qt"],
		kind: "quickTask",
		sideEffect: "write",
		description:
			"One-shot lifecycle (single or multi-task); missing governance stays pending",
		category: "workflow",
		subcommands: [
			{
				usage: '<theme> -t <summary> -c "<cmd>"',
				sideEffect: "write",
				description:
					"Create, start, verify once, record evidence, and close one task",
			},
			{
				usage: '<theme> -t <a> -t <b> [-t ...] -c "<cmd>"',
				sideEffect: "write",
				description:
					"One-shot multi-task: shared verification across all -t summaries (max 100)",
			},
			{
				usage: "-F <F-id> -P <spec-id>",
				sideEffect: "write",
				description: "Create the quick task as a governed session",
			},
			{
				usage: "--no-spec-required --reason <text>",
				sideEffect: "write",
				description: "Waive the spec requirement explicitly",
			},
		],
	},
	{
		command: "governance",
		aliases: ["gov"],
		kind: "governance",
		sideEffect: "write",
		description: "Resolve governance metadata gaps",
		category: "workflow",
		subcommands: [
			{
				usage: "pending [--all] [--json]",
				sideEffect: "read",
				description: "List open pending_spec entries",
			},
			{
				usage: "gov rs -S <id> -F <F-id> -P <spec-id>",
				sideEffect: "write",
				description: "Link roadmap feature/spec (session optional if bound)",
			},
			{
				usage: "gov af -F <F-id> [-P <spec-id>]",
				sideEffect: "write",
				description:
					"Activate a planned roadmap feature and optional planned parent spec",
			},
			{
				usage: 'gov rs -S <id> --no-spec-required -r "<reason>"',
				sideEffect: "write",
				description: "Waive with an explicit reason",
			},
			{
				usage: 'bulk-waive --reason "<text>" [--limit N] [--dry-run] [--json]',
				sideEffect: "write",
				description: "Waive open pending_spec entries (default limit 20)",
			},
			{
				usage:
					'bulk-waive --reason "<text>" --session <id> [--session <id2>...]',
				sideEffect: "write",
				description: "Waive explicit open sessions (max 100)",
			},
			{
				usage: "repair-index",
				sideEffect: "write",
				description: "Rebuild the pending_spec index explicitly",
			},
		],
	},
	{
		command: "evidence",
		aliases: ["e"],
		kind: "evidence",
		sideEffect: "append",
		description: "Record, reverify, or narrowly admit task evidence debt",
		category: "workflow",
		subcommands: [
			{
				usage: "--session <session-id> --task-id <task-id>",
				sideEffect: "append",
				description: "Target the task that owns the evidence",
			},
			{
				usage: '--command "<cmd>" --result passed',
				sideEffect: "append",
				description: "Record the verification command and result",
			},
			{
				usage: "--artifact <path> --note <text>",
				sideEffect: "append",
				description: "Attach optional artifact and note metadata",
			},
			{
				usage: "--json",
				sideEffect: "append",
				description: "Emit machine-readable evidence result",
			},
			{
				usage: 'reverify -S <id> -T <id> -x "<cmd>" [--json]',
				sideEffect: "append",
				description:
					"Run and append observed evidence for a closed terminal task without reopening it",
			},
			{
				usage:
					'transition-admit -S <id> -T <id> --policy no-op-evidence-v1 --issue <url> --approval "<text>" [--dry-run|--confirm] [--json]',
				sideEffect: "write",
				description:
					"Hash-bind closed post-cutoff missing evidence debt under the registered no-op policy (preview by default)",
			},
			{
				usage:
					'admit --session <id> --all-missing|--task-id <id> --reason "<text>" [--dry-run|--confirm] [--json]',
				sideEffect: "write",
				description:
					"Admit hash-bound missing/failed evidence for a closed pre-cutoff session (preview by default; --confirm writes)",
			},
		],
	},
	{
		command: "legacy",
		aliases: ["lg"],
		kind: "legacy",
		sideEffect: "write",
		description:
			"Reconcile legacy pre-cutoff evidence debt and close deadlocked sessions",
		category: "workflow",
		subcommands: [
			{
				usage:
					'reconcile --session <id> --reason "<text>" --issue <url> [--task-id <id>] [--dry-run|--confirm] [--summary "<text>"] [--json]',
				sideEffect: "write",
				description:
					"Admit legacy evidence debt and close a pre-cutoff all-done session in one transaction (preview by default; --confirm writes and closes)",
			},
		],
	},
	{
		command: "hook",
		aliases: ["hk"],
		kind: "hook",
		sideEffect: "read",
		description: "Inspect hooks",
		category: "inspect",
		subcommands: [
			{
				usage: "list [--json]",
				sideEffect: "read",
				description: "List configured hooks",
			},
			{
				usage: "show <id> [--json]",
				sideEffect: "read",
				description: "Inspect one hook",
			},
			{
				usage: "resolve --event <event> [--json]",
				sideEffect: "read",
				description: "Resolve hooks for a context/event profile",
			},
		],
	},
	{
		command: "rule",
		aliases: ["r"],
		kind: "rule",
		sideEffect: "read",
		description: "Inspect rules",
		category: "inspect",
		subcommands: [
			{
				usage: "list [--json]",
				sideEffect: "read",
				description: "List configured rules",
			},
			{
				usage: "show <id> [--json]",
				sideEffect: "read",
				description: "Inspect one rule",
			},
			{
				usage: "resolve --surface <surface> --work-type <work-type> [--json]",
				sideEffect: "read",
				description: "Resolve matching rules for a context profile",
			},
		],
	},
	{
		command: "skill",
		aliases: ["sk"],
		kind: "skill",
		sideEffect: "read",
		description: "Inspect skills",
		category: "inspect",
		subcommands: [
			{
				usage: "list [--json] [--verbose]",
				sideEffect: "read",
				description: "List local skills",
			},
			{
				usage: "show <name> [--json]",
				sideEffect: "read",
				description: "Inspect one skill",
			},
			{
				usage: "search <query> [--json]",
				sideEffect: "read",
				description: "Search local skills by name",
			},
		],
	},
	{
		command: "close",
		aliases: ["c"],
		kind: "close",
		sideEffect: "write",
		description: "Close the active session",
		category: "workflow",
		subcommands: [
			{
				usage: "--session <session-id> [-m|--summary <text>]",
				sideEffect: "write",
				description: "Close a specific session after its tasks are complete",
			},
			{
				usage: "--allow-no-report --reason <text>",
				sideEffect: "write",
				description: "Close without a report with an explicit waiver",
			},
			{
				usage: "--carry-open --reason <text>",
				sideEffect: "write",
				description:
					"Move open tasks into one governed continuation and close the completed session",
			},
			{
				usage: "--admit-legacy-baseline",
				sideEffect: "write",
				description:
					"Retry close waiving issues admitted by the legacy evidence baseline",
			},
			{
				usage: "--json",
				sideEffect: "write",
				description: "Emit machine-readable close result",
			},
		],
	},
	{
		command: "file",
		aliases: ["f"],
		kind: "file",
		sideEffect: "write",
		description:
			"Safely append, move, archive, and undo files; supports dry-run",
		category: "ops",
		subcommands: [
			{
				usage: "append|patch --path <path> --dry-run",
				sideEffect: "read",
				description: "Preview appended text diff without writing",
			},
			{
				usage: "append|patch --path <path>",
				sideEffect: "write",
				description: "Append text with backup and mutation journal",
			},
			{
				usage: "mv|move --from <path> --to <path>",
				sideEffect: "write",
				description: "Move file with backup and mutation journal",
			},
			{
				usage: "ar|archive --path <path>",
				sideEffect: "write",
				description: "Archive file with undo support",
			},
			{
				usage: "ud|undo --mutation-id <id>",
				sideEffect: "write",
				description: "Undo a recorded mutation",
			},
		],
	},
	{
		command: "fleet",
		aliases: [],
		kind: "fleet",
		sideEffect: "write",
		description: "Check and repair fleet-managed project state",
		category: "ops",
		guidance: [
			"Use check to inspect; use repair with --dry-run before applying fixes.",
		],
		subcommands: [
			{
				usage: "check --root <path> [--root <path>...] [--json]",
				sideEffect: "read",
				description: "Check one or more explicit project roots",
			},
			{
				usage: "repair --derived --dry-run --root <path> [--json]",
				sideEffect: "read",
				description: "Preview derived-state repair without writing",
			},
			{
				usage: "repair --derived --root <path> --reason <text> [--json]",
				sideEffect: "write",
				requires_approval: true,
				description: "Rebuild derived state for one explicit root",
			},
		],
	},
	{
		command: "update",
		aliases: ["up"],
		kind: "update",
		sideEffect: "write",
		description:
			"Run scaffold updates; preview and apply --dry-run are safe checks",
		category: "ops",
		guidance: [
			"Prefer check, then preview, then apply --dry-run before real apply.",
			"Real apply requires session, task id, and reason metadata.",
		],
		subcommands: [
			{
				usage: "check",
				sideEffect: "read",
				description: "Summarize available scaffold update changes",
			},
			{
				usage: "preview",
				sideEffect: "read",
				description: "Show the planned update manifest without writing",
			},
			{
				usage: "apply --dry-run",
				sideEffect: "read",
				description: "Validate apply behavior without writing files",
			},
			{
				usage: "apply --session <id> --task-id <id> --reason <text>",
				sideEffect: "write",
				description: "Apply managed updates and record mutation metadata",
			},
			{
				usage: "rollback --batch-id <id> --reason <text>",
				sideEffect: "write",
				description:
					"Rollback a committed update batch after hash verification",
			},
		],
	},
	{
		command: "bootstrap",
		aliases: ["b"],
		kind: "bootstrap",
		sideEffect: "write",
		description: "Install scaffold into another repo; use --dry-run to preview",
		category: "workflow",
		guidance: [
			"Read the target AGENTS.md and resolve its .afol/adm/rules when present.",
			"Use afol help bootstrap for current flags; preview first and preserve history and migrations.",
		],
		subcommands: [
			{
				usage: "<target-path> --dry-run",
				sideEffect: "read",
				description: "Preview bootstrap into another repository",
			},
			{
				usage: "<target-path>",
				sideEffect: "write",
				description: "Install the scaffold into the target repository",
			},
		],
	},
	{
		command: "verify",
		aliases: ["vf"],
		kind: "verifyTasks",
		sideEffect: "read",
		description: "Verify workbench tasks",
		category: "workflow",
		subcommands: [
			{
				usage: "[session-path] [--strict] [--verbose]",
				sideEffect: "read",
				description: "Require all tasks in a session path to be complete",
			},
			{
				usage: "--session <session-id> --json",
				sideEffect: "read",
				description: "Verify one session and emit machine-readable output",
			},
		],
	},
	{
		command: "verify-tasks",
		aliases: ["vt"],
		kind: "verifyTasks",
		sideEffect: "read",
		description: "Verify workbench tasks",
		category: "workflow",
		subcommands: [
			{
				usage: "[session-path] [--strict] [--verbose]",
				sideEffect: "read",
				description: "Require all tasks in a session path to be complete",
			},
			{
				usage: "--session <session-id> --json",
				sideEffect: "read",
				description: "Verify one session and emit machine-readable output",
			},
		],
	},
	{
		command: "local-state",
		aliases: ["ls"],
		kind: "localState",
		sideEffect: "generated",
		description: "Inspect local project indexes",
		category: "inspect",
		guidance: [
			"Run rebuild before validation when indexes may be stale.",
			"Use --verbose only when the full index snapshot is needed.",
		],
		subcommands: [
			{
				usage: "freshness|fs --json",
				sideEffect: "read",
				description: "Check whether local-state indexes are fresh",
			},
			{
				usage: "rebuild|rb --json",
				sideEffect: "generated",
				description: "Refresh indexes and emit compact counts",
			},
			{
				usage: "rebuild|rb --json --verbose",
				sideEffect: "generated",
				description: "Refresh indexes and include full snapshots",
			},
		],
	},
	{
		command: "pstr",
		aliases: ["ps"],
		kind: "pstr",
		sideEffect: "read",
		description: "Inspect structure maps",
		category: "inspect",
		subcommands: [
			{
				usage: "show|sh --json",
				sideEffect: "read",
				description: "Show the current PSTR index",
			},
			{
				usage: "rebuild|rb --json",
				sideEffect: "generated",
				requires_approval: true,
				description: "Rebuild observed structure maps",
			},
			{
				usage: "validate|v --json",
				sideEffect: "read",
				description: "Validate PSTR freshness and shape",
			},
			{
				usage: "stale|st --json",
				sideEffect: "read",
				description: "List stale structure maps",
			},
			{
				usage: "section|sec <id> --json",
				sideEffect: "read",
				description: "Read one structure map section",
			},
			{
				usage: "diff --json",
				sideEffect: "read",
				description: "Compare live structure with the snapshot",
			},
			{
				usage: "watch --once --json",
				sideEffect: "generated",
				requires_approval: true,
				description: "Watch and refresh structure maps",
			},
			{
				usage: "detect|det --json",
				sideEffect: "read",
				description: "Detect materialized structure areas",
			},
			{
				usage: "suggest|sug --json",
				sideEffect: "read",
				description: "Suggest structure map maintenance",
			},
			{
				usage: "review-candidates|review|rc --json",
				sideEffect: "read",
				description: "Review map rebuild candidates",
			},
			{
				usage: "review-candidates --apply <id> --json",
				sideEffect: "write",
				requires_approval: true,
				description: "Apply an approved map rebuild candidate",
			},
		],
	},
	{
		command: "ctx",
		aliases: ["cx"],
		kind: "ctx",
		sideEffect: "generated",
		description: "Inspect context bundles",
		category: "inspect",
		subcommands: [
			{
				usage: "build",
				sideEffect: "generated",
				description: "Rebuild the section index",
			},
			{
				usage: "bundle",
				sideEffect: "read",
				description:
					"Build a context bundle; --json for compact output, --json --full for complete payload",
			},
			{
				usage: "bundle --json [--full]",
				sideEffect: "read",
				description:
					"Return compact JSON; pass --full to include the complete bundle",
			},
			{
				usage: "bundle --persist-rule-injection",
				sideEffect: "generated",
				description:
					"Persist first-use rule injection state with local approval",
			},
			{
				usage: "section --ref <ref>",
				sideEffect: "generated",
				description: "Read one section and refresh sections if needed",
			},
			{
				usage: "explain [--full]",
				sideEffect: "read",
				description:
					"Explain bundle inputs; pass --full to include the complete bundle",
			},
			{
				usage: "tools",
				sideEffect: "generated",
				description: "List context helpers and refresh sections if needed",
			},
		],
	},
	{
		command: "state",
		aliases: ["stt"],
		kind: "state",
		sideEffect: "read",
		description: "Inspect state snapshot",
		category: "inspect",
		subcommands: [
			{
				usage: "show|sh [--session <session-id>] [--json]",
				sideEffect: "read",
				description: "Show the hydrated session state",
			},
			{
				usage: "validate|v [--session <session-id>] [--json]",
				sideEffect: "read",
				description: "Validate stored session-state source hashes",
			},
			{
				usage: "sync|sy [--session <session-id>] [--json]",
				sideEffect: "generated",
				description: "Refresh the hydrated session state",
			},
			{
				usage: "export|ex [--session <session-id>] [--json]",
				sideEffect: "read",
				description: "Export the hydrated session snapshot",
			},
		],
	},
	{
		command: "hydrate",
		aliases: ["hy"],
		kind: "hydrate",
		sideEffect: "generated",
		description: "Generate hydrated project state",
		category: "inspect",
		guidance: [
			"Use --session <id> to hydrate one session.",
			"Use --all to hydrate every canonical workbench session.",
		],
	},
	{
		command: "render",
		aliases: [],
		kind: "memory",
		sideEffect: "generated",
		description: "Deprecated alias for memory render",
		category: "inspect",
	},
	{
		command: "library",
		aliases: ["lb"],
		kind: "library",
		sideEffect: "read",
		description: "Inspect library entries",
		category: "inspect",
		subcommands: [
			{
				usage: "list|ls [--json]",
				sideEffect: "read",
				description: "List library topics",
			},
			{
				usage: "topic <topic>|--topic <topic> [--json]",
				sideEffect: "read",
				description: "Inspect one library topic",
			},
			{
				usage: "search <query>|--query <query> [--json]",
				sideEffect: "read",
				description: "Search library topics and claims",
			},
			{
				usage: "graph [--json]",
				sideEffect: "read",
				description: "Render the library topic and claim graph",
			},
			{
				usage: "health [--json]",
				sideEffect: "read",
				description: "Run library health checks",
			},
			{
				usage: "doctor [--json]",
				sideEffect: "read",
				description: "Show library remediation steps",
			},
			{
				usage:
					"propose --topic <topic> --title <title> [--url <url>] [--source <id>] [--json]",
				sideEffect: "write",
				description: "Propose a library topic with an optional source",
			},
			{
				usage:
					"add-source --topic <topic> --url <url> [--title <title>] [--source <id>] [--json]",
				sideEffect: "write",
				description: "Add a source to a library topic",
			},
			{
				usage:
					"add-claim --topic <topic> --claim <text> --source <id>[,<id>...] [--json]",
				sideEffect: "write",
				description: "Add a sourced claim to a library topic",
			},
			{
				usage:
					"invalidate --topic <topic> --claim <claim-id> --reason <text> [--json]",
				sideEffect: "write",
				description: "Invalidate a library claim with a reason",
			},
			{
				usage: "rebuild-index [--json]",
				sideEffect: "generated",
				description: "Refresh the generated library index",
			},
		],
	},
	{
		command: "memory",
		aliases: ["mm"],
		kind: "memory",
		sideEffect: "read",
		description: "Inspect memory entries",
		category: "inspect",
		subcommands: [
			{
				usage: "list|ls [--json]",
				sideEffect: "read",
				description: "List memory entries",
			},
			{
				usage: "show|get --id <id> [--json]",
				sideEffect: "read",
				description: "Inspect one memory entry",
			},
			{
				usage: "search|find --query <query> [--json]",
				sideEffect: "read",
				description: "Search memory entries",
			},
			{
				usage: "render [--json]",
				sideEffect: "read",
				description: "Render the memory document",
			},
			{
				usage: "recall --query <query> [--json]",
				sideEffect: "read",
				description: "Recall entries relevant to a query",
			},
			{
				usage:
					"add --id <id> --title <title> --body <text> [--tags <tag>[,<tag>...]] [--json]",
				sideEffect: "write",
				description: "Add an active memory entry",
			},
			{
				usage:
					"update|set --id <id> [--title <title>] [--body <text>] [--tags <tag>[,<tag>...]] [--json]",
				sideEffect: "write",
				description: "Update a memory entry",
			},
			{
				usage: "archive --id <id> [--json]",
				sideEffect: "write",
				description: "Archive a memory entry",
			},
			{
				usage:
					"propose --id <id> --title <title> --body <text> [--tags <tag>[,<tag>...]] [--json]",
				sideEffect: "write",
				description: "Add a proposed memory entry",
			},
			{
				usage: "promote --id <id> [--json]",
				sideEffect: "write",
				description: "Promote a proposed memory entry",
			},
			{
				usage: "reject --id <id> --reason <text> [--json]",
				sideEffect: "write",
				description: "Reject a proposed memory entry",
			},
		],
	},
	{
		command: "evolve",
		aliases: [],
		kind: "evolve",
		sideEffect: "read",
		description: "Analyze project evolution state and proposals",
		capabilities: [
			"evolution.suggest.first-session/v1",
			"evolution.candidates/v1",
		],
		category: "inspect",
		guidance: [
			"Use evolve suggest --first-session; decisions require a shown receipt and reject requires --reason.",
		],
		subcommands: [
			{
				usage: "backfill [--offset <n>] [--limit <1-10>] [--json]",
				sideEffect: "read",
				description:
					"Preview bounded historical observation and adoption coverage without writes",
			},
			{
				usage: "candidates [--session <id>] [--limit <1-10>] [--json]",
				sideEffect: "read",
				description:
					"Derive bounded Memory and Library adoption candidates from completed sessions",
			},
			{
				usage:
					"candidates review --session <id> --id <candidate-id> --decision <approved|rejected> --reason <text> [--approve] [--json]",
				sideEffect: "write",
				description:
					"Append an explicit approval-gated learning review decision",
			},
			{
				usage: "evaluate <id> [--record] [--superseded-by <id>] [-j]",
				sideEffect: "preview",
				description: "Evaluate one proposal deterministically",
			},
			{
				usage: "analyze [--json]",
				sideEffect: "read",
				description: "Analyze recurrence, scorecard, and proposal previews",
			},
			{
				usage: "weekly [--json]",
				sideEffect: "read",
				description: "Run the bounded weekly analysis mode",
			},
			{
				usage: "after-merge <base>..<head> [--json]",
				sideEffect: "read",
				description: "Analyze with a validated local commit range",
			},
			{
				usage: "review <proposal-id> [--json]",
				sideEffect: "read",
				description: "Re-derive one proposal preview by deterministic id",
			},
			{
				usage: "apply <proposal-id> [--json]",
				sideEffect: "write",
				description:
					"Apply one re-derived proposal in the active workbench task",
			},
			{
				usage: "rollback <proposal-id> [--json]",
				sideEffect: "write",
				description:
					"Roll back one applied proposal in the active workbench task",
			},
			{
				usage: "status [--json]",
				sideEffect: "read",
				description:
					"Inspect evolution config, migration, and production-day state",
			},
			{
				usage: "suggest --first-session [--claimed-by <provider>] [--json]",
				sideEffect: "write",
				description: "Show one daily suggestion",
			},
			{
				usage: "skip <suggestion-id> [--json]",
				sideEffect: "write",
				description: "Skip shown suggestion",
			},
			{
				usage: "accept <suggestion-id> [--json]",
				sideEffect: "write",
				description: "Accept shown suggestion",
			},
			{
				usage: "reject <suggestion-id> --reason <reason> [--json]",
				sideEffect: "write",
				description: "Reject shown suggestion",
			},
			{
				usage: "repair [--json]",
				sideEffect: "write",
				description: "Repair evolution derived state",
			},
			{
				usage: "import <codex|pi> --source <path> [--confirm] [--json]",
				sideEffect: "preview",
				description: "Preview or confirm a redacted import",
			},
			{
				usage: "external list [--json]",
				sideEffect: "read",
				description: "List accepted external imports without raw records",
			},
		],
	},
	{
		command: "adm",
		aliases: ["ad"],
		kind: "adm",
		sideEffect: "read",
		description: "Inspect adm paths and files",
		category: "inspect",
	},
	{
		command: "spec",
		aliases: ["sp"],
		kind: "spec",
		sideEffect: "read",
		description: "Inspect specs",
		category: "inspect",
		subcommands: [
			{
				usage: "list [--json] [--verbose]",
				sideEffect: "read",
				description: "List active project specs",
			},
			{
				usage: "check --session <session-id> --task <task-id> --json",
				sideEffect: "read",
				description: "Check task/spec compatibility",
			},
			{
				usage: "conflict --session <session-id> --task <task-id>",
				sideEffect: "read",
				description: "Return success when compatibility is in conflict",
			},
			{
				usage: "waive --session <session-id> --task <task-id> --reason <text>",
				sideEffect: "write",
				description: "Record a task/spec conflict waiver",
			},
		],
	},
	{
		command: "ux",
		aliases: [],
		kind: "ux",
		sideEffect: "write",
		description: "journey coverage",
		category: "workflow",
		subcommands: [
			{
				usage: "list",
				sideEffect: "read",
				description: "List registered and spec-derived UX journeys",
			},
			{
				usage: "show <journey-id>",
				sideEffect: "read",
				description: "Inspect one registered UX journey",
			},
			{
				usage: "validate",
				sideEffect: "read",
				description: "Validate UX registry standards and journey docs",
			},
			{
				usage: "coverage --tool <afol-command>",
				sideEffect: "read",
				description: "Show UX journeys covering one AFOL tool",
			},
			{
				usage: "register --from-spec <spec-id>",
				sideEffect: "write",
				description: "Create a spec-linked UX journey draft",
			},
		],
	},
	{
		command: "adr",
		aliases: [],
		kind: "adr",
		sideEffect: "write",
		description: "Create and manage ADRs",
		category: "inspect",
		subcommands: [
			{
				usage: "new|create <topic>",
				sideEffect: "write",
				description: "Create an ADR",
			},
			{
				usage: "accept|ac <id>",
				sideEffect: "write",
				description: "Accept an ADR",
			},
			{
				usage: "supersede|sp <old-id> <new-id>",
				sideEffect: "write",
				description: "Supersede an ADR",
			},
			{
				usage: "abandon|ab <id> --reason <text>",
				sideEffect: "write",
				description: "Abandon an ADR with a reason",
			},
			{
				usage: "archive|ar <id> --reason <text>",
				sideEffect: "write",
				description: "Archive an ADR with a reason",
			},
		],
	},
	{
		command: "changelog",
		aliases: ["cl"],
		kind: "changelog",
		sideEffect: "append",
		description: "Append changelog entries",
		category: "inspect",
		subcommands: [
			{
				usage: "add|a --type <type> --message <text>",
				sideEffect: "append",
				description: "Append a changelog entry",
			},
		],
	},
	{
		command: "health",
		aliases: ["ht"],
		kind: "health",
		sideEffect: "read",
		description: "Inspect health checks",
		category: "ops",
		subcommands: [
			{
				usage: "[core] [--json]",
				sideEffect: "read",
				description: "Check core workbench health",
			},
			{
				usage: "full [--json]",
				sideEffect: "read",
				description: "Check every health area",
			},
			{
				usage: "release|--release [--json]",
				sideEffect: "read",
				description: "Run release-scoped health checks",
			},
			{
				usage:
					"--area <adm|pstr|wb|memory|library|state|ctx|evolution|token_budget> [--deep] [--json]",
				sideEffect: "read",
				description: "Check one named health area",
			},
			{
				usage: "--deep [--json]",
				sideEffect: "read",
				description: "Check every health area in deep mode",
			},
		],
	},
	{
		command: "db",
		aliases: [],
		kind: "db",
		sideEffect: "read",
		description: "Inspect database state",
		category: "ops",
	},
	{
		command: "doctor",
		aliases: ["dr"],
		kind: "doctor",
		sideEffect: "read",
		description: "Inspect doctor checks",
		category: "ops",
	},
	{
		command: "maintenance",
		aliases: ["mt"],
		kind: "maintenance",
		sideEffect: "write",
		description: "Run maintenance checks",
		category: "ops",
		subcommands: [
			{
				usage: "weekly --dry-run",
				sideEffect: "read",
				description: "Preview weekly maintenance actions",
			},
			{
				usage: "monthly --dry-run",
				sideEffect: "read",
				description: "Preview monthly maintenance actions",
			},
			{
				usage: "review --area <area> --dry-run",
				sideEffect: "read",
				description:
					"Preview rules, skills, docs, commands, memory, library, organization",
			},
			{
				usage: "review --area <area> --note <text>",
				sideEffect: "write",
				description: "Record maintenance review freshness",
			},
		],
	},
	{
		command: "sweep",
		aliases: ["sw"],
		kind: "sweep",
		sideEffect: "read",
		description: "Run repository sweep checks",
		category: "ops",
	},
	{
		command: "schema",
		aliases: ["sc"],
		kind: "schema",
		sideEffect: "write",
		description:
			"Review schema state; apply and resolver --write can write files",
		category: "ops",
		subcommands: [
			{
				usage: "detect",
				sideEffect: "read",
				description: "Detect the project shape without writing",
			},
			{
				usage: "suggest",
				sideEffect: "read",
				description: "Suggest schema actions without writing",
			},
			{
				usage: "review",
				sideEffect: "read",
				description: "Compare detected and current schema",
			},
			{
				usage: "resolver",
				sideEffect: "read",
				description: "Render resolver guidance without writing",
			},
			{
				usage: "resolver --write",
				sideEffect: "write",
				description: "Write resolver guidance for local callers",
			},
			{
				usage: "apply --dry-run",
				sideEffect: "read",
				description: "Preview schema apply without writing",
			},
			{
				usage: "apply",
				sideEffect: "write",
				description: "Write the detected schema pack for local callers",
			},
		],
	},
	{
		command: "bench",
		aliases: ["be"],
		kind: "bench",
		sideEffect: "read",
		description:
			"Run benchmarks: live metrics, CLI token economy, runtime-live dry-run",
		category: "inspect",
		subcommands: [
			{
				usage: "list",
				sideEffect: "read",
				description: "List live benchmark scenarios",
			},
			{
				usage: "run --scenario <id>",
				sideEffect: "read",
				description: "Run one live benchmark scenario",
			},
			{
				usage: "cli",
				sideEffect: "read",
				description: "Run CLI micro benchmarks",
			},
			{
				usage: "report --run <path>",
				sideEffect: "read",
				description: "Summarize a saved benchmark run",
			},
			{
				usage: "runtime-live",
				sideEffect: "read",
				description: "Show runtime-live dry-run profile and validation command",
			},
		],
	},
	{
		command: "project-benchmark",
		aliases: ["pb"],
		kind: "projectBenchmark",
		sideEffect: "generated",
		description: "Compare AFOL against curated reference projects",
		category: "inspect",
		subcommands: [
			{
				usage: "list",
				sideEffect: "read",
				description: "List scored reference projects",
			},
			{
				usage: "show <project-id>",
				sideEffect: "read",
				description: "Inspect one reference project by id or name",
			},
			{
				usage: "matrix --for <axis>",
				sideEffect: "read",
				description:
					"Filter the score matrix by axis; omit --for for the full matrix",
			},
			{
				usage: "recommend --for <axis>",
				sideEffect: "read",
				description: "Rank the best reference projects for one axis",
			},
			{
				usage: "validate --strict",
				sideEffect: "read",
				description:
					"Fail validation on warnings; omit --strict for standard validation",
			},
			{
				usage: "generate --check",
				sideEffect: "read",
				description: "Check generated outputs without writing files",
			},
			{
				usage: "generate",
				sideEffect: "generated",
				description: "Refresh generated outputs with local approval",
			},
		],
	},
	{
		command: "catchup",
		aliases: ["cu"],
		kind: "catchup",
		sideEffect: "read",
		description:
			"Compare active session artifacts against git state and report unsynced context",
		category: "inspect",
		subcommands: [
			{
				usage: "[--session <id>] [--json]",
				sideEffect: "read",
				description:
					"Read-only report of session artifacts, git freshness, and pending_spec",
			},
			{
				usage: "--fix [--json]",
				sideEffect: "write",
				description:
					"Safe repair: unbind corrupt/missing bindings; rebind usable active",
			},
		],
	},
	{
		command: "preflight",
		aliases: ["pf"],
		kind: "preflight",
		sideEffect: "read",
		description: "Search governance context before planning",
		category: "inspect",
		subcommands: [
			{
				usage: "<intent query> [--json]",
				sideEffect: "read",
				description: "Search specs, lessons, rules, and similar systems",
			},
		],
	},
	{
		command: "adapter",
		aliases: ["adp"],
		kind: "adapter",
		sideEffect: "write",
		description: "Enable or disable runtime adapters; use --dry-run to preview",
		category: "ops",
		subcommands: [
			{
				usage: "list [--json]",
				sideEffect: "read",
				description: "List runtime adapter state",
			},
			{
				usage: "enable antigravity [--dry-run] [--json]",
				sideEffect: "write",
				description: "Enable an adapter and create its managed mirror",
			},
			{
				usage: "disable antigravity [--dry-run] [--json]",
				sideEffect: "write",
				description: "Disable an adapter and remove its managed mirror",
			},
			{
				usage: "sync <antigravity|--all> [--dry-run] [--json]",
				sideEffect: "write",
				description: "Reconcile configured provider mirrors",
			},
		],
	},
	{
		command: "telemetry",
		aliases: ["tel"],
		kind: "telemetry",
		sideEffect: "read",
		description: "Query, report, and export AFOL telemetry events",
		category: "inspect",
		subcommands: [
			{
				usage: "query --limit <n>",
				sideEffect: "read",
				description: "Show recent telemetry events; defaults to latest 10",
			},
			{
				usage: "report --limit <n>",
				sideEffect: "read",
				description: "Summarize telemetry counts by session, type, and outcome",
			},
			{
				usage: "export --format jsonl",
				sideEffect: "read",
				description: "Export filtered telemetry events",
			},
		],
	},
	{
		command: "receipt",
		aliases: [],
		kind: "receipt",
		sideEffect: "append",
		description:
			"Ingest a bounded external harness receipt as observed evidence",
		category: "workflow",
		subcommands: [
			{
				usage: "ingest --file <path>",
				sideEffect: "append",
				description:
					"Validate one fixed-profile receipt and record observed evidence",
			},
		],
	},
	{
		command: "session",
		aliases: ["ss"],
		kind: "session",
		sideEffect: "write",
		description: "List, bind, switch, archive, restore, and unbind sessions",
		category: "workflow",
		subcommands: [
			{
				usage: "list",
				sideEffect: "read",
				description: "Show active session, context session, and bindings",
			},
			{
				usage: "radar --json",
				sideEffect: "read",
				description: "Show compact coordination warnings across open sessions",
			},
			{
				usage: "bind --session <id> --dry-run",
				sideEffect: "read",
				description: "Preview binding a session to current branch/worktree",
			},
			{
				usage: "bind --session <id> --actor <name>",
				sideEffect: "write",
				description: "Bind a session to current branch/worktree context",
			},
			{
				usage: "switch <session-id>",
				sideEffect: "write",
				description: "Set active session and bind current context",
			},
			{
				usage: "unbind <session-id>",
				sideEffect: "write",
				description: "Remove a session context binding",
			},
			{
				usage:
					"archive --candidates [--older-than-days <days>] [--offset <n>] [--limit <n>] [--json]",
				sideEffect: "read",
				description: "List closed sessions eligible for logical archiving",
			},
			{
				usage: "archive <id>... --reason <text> [--dry-run] [--json]",
				sideEffect: "write",
				description: "Logically archive closed workbench sessions",
			},
			{
				usage: "restore <id>... --reason <text> [--dry-run] [--json]",
				sideEffect: "write",
				description: "Restore logically archived workbench sessions",
			},
		],
	},
]);

export function requiresApprovalForSideEffect(
	sideEffect: CommandSideEffect,
): boolean {
	return sideEffect !== "read";
}

const EXPERIMENTAL_COMMANDS = new Set([
	"fleet",
	"hydrate",
	"library",
	"memory",
	"evolve",
	"ux",
	"bench",
	"project-benchmark",
	"telemetry",
	"receipt",
]);
const COMPATIBILITY_COMMANDS = new Set(["legacy", "render"]);

function commandStability(command: string): CommandStability {
	if (COMPATIBILITY_COMMANDS.has(command)) return "compatibility";
	if (EXPERIMENTAL_COMMANDS.has(command)) return "experimental";
	return "stable";
}

function withApprovalMetadata(spec: CommandSpecInput): CommandSpec {
	const withMetadata: CommandSpec = {
		...spec,
		requires_approval: requiresApprovalForSideEffect(spec.sideEffect),
		stability: spec.stability ?? commandStability(spec.command),
	};
	if (spec.subcommands) {
		withMetadata.subcommands = spec.subcommands.map((subcommand) => ({
			...subcommand,
			requires_approval: requiresApprovalForSideEffect(subcommand.sideEffect),
		}));
	}
	return withMetadata;
}

const COMMAND_SPECS_WITH_APPROVAL: readonly CommandSpec[] = Object.freeze(
	COMMAND_SPECS.map(withApprovalMetadata),
);

const HELP_ALIASES = Object.freeze(["-h", "--help"] as const);
const JSON_ALIASES = Object.freeze(["-j", "--json"] as const);

const aliasToCommand = new Map<string, string>();
const commandToSpec = new Map<string, CommandSpec>();
const knownTokens = new Set<string>();

for (const spec of COMMAND_SPECS_WITH_APPROVAL) {
	commandToSpec.set(spec.command, spec);
	aliasToCommand.set(spec.command, spec.command);
	knownTokens.add(spec.command);
	for (const alias of spec.aliases) {
		const existing = aliasToCommand.get(alias);
		if (existing && existing !== spec.command) {
			throw new Error(
				`Duplicate top-level alias "${alias}" for ${existing} and ${spec.command}`,
			);
		}
		aliasToCommand.set(alias, spec.command);
		knownTokens.add(alias);
	}
}

function canonicalize(token: string): string {
	return aliasToCommand.get(token) ?? token;
}

export const kernelRegistry = {
	commands: COMMAND_SPECS_WITH_APPROVAL,
	flags: {
		help: HELP_ALIASES,
		json: JSON_ALIASES,
	},
	canonicalize,
	isHelpAlias(value: string): boolean {
		return HELP_ALIASES.includes(value as (typeof HELP_ALIASES)[number]);
	},
	isJsonAlias(value: string): boolean {
		return JSON_ALIASES.includes(value as (typeof JSON_ALIASES)[number]);
	},
	resolveKind(value: string): CommandKind | null {
		const canonical = canonicalize(value);
		const spec = commandToSpec.get(canonical);
		return spec?.kind ?? null;
	},
	knownCanonicalCommands(): readonly string[] {
		return [...commandToSpec.keys()];
	},
	knownTokens(): readonly string[] {
		return [...knownTokens.values()];
	},
};
