export type CommandKind =
	| "status"
	| "feedback"
	| "validate"
	| "init"
	| "bootstrap"
	| "new"
	| "start"
	| "evidence"
	| "done"
	| "transition"
	| "close"
	| "log"
	| "quickTask"
	| "verifyTasks"
	| "hook"
	| "rule"
	| "skill"
	| "update"
	| "file"
	| "localState"
	| "pstr"
	| "ctx"
	| "state"
	| "hydrate"
	| "library"
	| "memory"
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
	| "session";
export type CommandSideEffect =
	| "read"
	| "preview"
	| "write"
	| "append"
	| "generated";

export type CommandCategory = "core" | "workflow" | "inspect" | "ops";

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
	category?: CommandCategory;
	guidance?: readonly string[];
	subcommands?: readonly CommandSubcommandSpec[];
	requires_approval?: boolean;
};

const COMMAND_SPECS: readonly CommandSpec[] = Object.freeze([
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
		subcommands: [
			{
				usage: "--dry-run",
				sideEffect: "read",
				description: "Preview scaffold install without writing",
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
			"Record evidence first, or repeat --test for up to eight ordered fail-fast checks.",
		],
		subcommands: [
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
		aliases: [],
		kind: "transition",
		sideEffect: "write",
		description: "Transition a task through the lifecycle state machine",
		category: "workflow",
		subcommands: [
			{
				usage: "--session <session-id> --task-id <task-id> --state <state>",
				sideEffect: "write",
				description: "Apply one validated task-state transition",
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
			"Run a single-task lifecycle after executing a verification command",
		category: "workflow",
		subcommands: [
			{
				usage: '<theme> --task <summary> --command "<cmd>"',
				sideEffect: "write",
				description:
					"Create, start, verify, record evidence, and close one task",
			},
			{
				usage: "--feature-id <F-id> --parent-spec <spec-id>",
				sideEffect: "write",
				description: "Create the quick task as a governed session",
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
				usage:
					"resolve-spec --session <id> --feature-id <F-id> --parent-spec <id>",
				sideEffect: "write",
				description: "Link roadmap feature/spec",
			},
			{
				usage: "resolve-spec --session <id> --no-spec-required --reason <text>",
				sideEffect: "write",
				description: "Waive with an explicit reason",
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
		description: "Record task evidence",
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
				usage: "[session-path] --strict",
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
				usage: "[session-path] --strict",
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
	},
	{
		command: "memory",
		aliases: ["mm"],
		kind: "memory",
		sideEffect: "read",
		description: "Inspect memory entries",
		category: "inspect",
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
		sideEffect: "read",
		description: "Inspect ADRs",
		category: "inspect",
	},
	{
		command: "changelog",
		aliases: ["cl"],
		kind: "changelog",
		sideEffect: "read",
		description: "Inspect changelog entries",
		category: "inspect",
	},
	{
		command: "health",
		aliases: ["ht"],
		kind: "health",
		sideEffect: "read",
		description: "Inspect health checks",
		category: "ops",
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
	},
	{
		command: "preflight",
		aliases: ["pf"],
		kind: "preflight",
		sideEffect: "read",
		description: "Search governance context before planning",
		category: "inspect",
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
				usage: "list",
				sideEffect: "read",
				description: "List runtime adapter state",
			},
			{
				usage: "enable <name> --dry-run",
				sideEffect: "read",
				description: "Preview enabling an adapter",
			},
			{
				usage: "disable <name> --dry-run",
				sideEffect: "read",
				description: "Preview disabling an adapter",
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
		command: "session",
		aliases: ["ss"],
		kind: "session",
		sideEffect: "write",
		description: "List, bind, switch, and unbind workbench sessions",
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
		],
	},
]);

export function requiresApprovalForSideEffect(
	sideEffect: CommandSideEffect,
): boolean {
	return sideEffect !== "read";
}

function withApprovalMetadata(spec: CommandSpec): CommandSpec {
	const withMetadata: CommandSpec = {
		...spec,
		requires_approval: requiresApprovalForSideEffect(spec.sideEffect),
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
