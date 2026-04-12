# Agents System Makefile
# Operational commands for .agents system management
#
# Usage:
#   make <command> [OPTIONS]
#
# Examples:
#   make doctor
#   make new THEME=auth-refactor
#   make structure
#   make all

.PHONY: help setup setup-runtime doctor new quick bootstrap fix-symlinks skills-init skills-pull skills-update skills-list skills-search skills-plan skills-apply skills-ensure skills-push skills-status skills-check skills-sync memory-status memory-search memory-context memory-recent memory-show wb-touch wb-normalize-time wb-files-changed wb-evidence wb-task wb-status wb-timeline wb-link structure repo-map index knowledge-index knowledge-list knowledge-search knowledge-pull sync verify verify-session verify-active verify-active-if-present verify-strict-if-present lint tools-check test-scripts test-scripts-integration test-scripts-all lint-scripts lint-runtime test-runtime runtime-mcp-smoke lint-fix lint-fix-dry lint-fix-check lint-fix-checkboxes lint-fix-frontmatter telemetry-record telemetry-report telemetry-export telemetry-validate patterns-suggest patterns-list patterns-show clean all

# Use local virtualenv python when available for reproducible script execution
PYTHON := .agents/scripts/.venv/bin/python3
ifeq ($(wildcard $(PYTHON)),)
PYTHON := python3
endif
UV_CACHE_DIR ?= $(CURDIR)/.agents/cache/uv
UV := UV_CACHE_DIR="$(UV_CACHE_DIR)" uv

# ==============================================================================
# HELP
# ==============================================================================

help:
	@echo "╔═══════════════════════════════════════════════════════════╗"
	@echo "║         Agents System - Available Commands                ║"
	@echo "╠═══════════════════════════════════════════════════════════╣"
	@echo "║  Setup & Maintenance                                      ║"
	@echo "║    make setup        - Initialize UV virtualenv           ║"
	@echo "║    make setup-runtime - Initialize central runtime env    ║"
	@echo "║    make clean        - Remove .venv and cache files       ║"
	@echo "║    make doctor       - Validate .agents structure         ║"
	@echo "║                                                           ║"
	@echo "║  Documentation                                            ║"
	@echo "║    make structure    - Generate project structure docs    ║"
	@echo "║    make repo-map     - Generate full repository codemap   ║"
	@echo "║    make index        - Update SPECS/ADRS indexes          ║"
	@echo "║    make knowledge-index - Build knowledge index           ║"
	@echo "║    make knowledge-list - List knowledge artifacts         ║"
	@echo "║    make knowledge-search QUERY=x - Search prior findings  ║"
	@echo "║    make knowledge-pull QUERY=x - Pull compact context     ║"
	@echo "║    make memory-status - Show external memory config       ║"
	@echo "║    make memory-search QUERY=x - Emit memory MCP contract  ║"
	@echo "║    make memory-context TOPIC=x - Emit context contract    ║"
	@echo "║    make sync         - Sync AGENTS.md to agent files      ║"
	@echo "║    make tools-check  - Validate/discover tools catalog     ║"
	@echo "║    make skills-list  - List available source skills        ║"
	@echo "║    make skills-search QUERY=x - Search source skills       ║"
	@echo "║    make skills-ensure SKILL=x - Ensure one project skill   ║"
	@echo "║                                                           ║"
	@echo "║  Workflows                                                ║"
	@echo "║    make new          - Create governed workstream         ║"
	@echo "║    make quick        - Use active session for quick task   ║"
	@echo "║    make bootstrap    - Install system into another repo    ║"
	@echo "║    make fix-symlinks - Repair links/copy fallback          ║"
	@echo "║    make wb-touch     - Update updated_at (SESSION_ID req.) ║"
	@echo "║    make wb-normalize-time - Normalize WB timestamps        ║"
	@echo "║    make wb-files-changed - Refresh report files changed    ║"
	@echo "║    make wb-evidence  - Register evidence for task closure  ║"
	@echo "║    make wb-task      - Mark task by ID (SESSION_ID req.)   ║"
	@echo "║    make wb-status    - Set doc status (SESSION_ID req.)    ║"
	@echo "║    make wb-timeline  - Append timeline (SESSION_ID req.)   ║"
	@echo "║    make wb-link      - Set links key (SESSION_ID req.)     ║"
	@echo "║    make verify       - Check task completion (all sessions)║"
	@echo "║    make verify-session - Check one session (SESSION_ID=)   ║"
	@echo "║    make verify-active - Check active session only          ║"
	@echo "║    make verify-active-if-present - Run active verify if set║"
	@echo "║    make verify-strict - Strict verification with evidence  ║"
	@echo "║    make verify-strict-if-present - Run strict verify if set║"
	@echo "║    make lint         - Validate markdown docs             ║"
	@echo "║    make lint-fix     - Fix common lint issues             ║"
	@echo "║    make lint-fix-dry - Preview lint fixes                 ║"
	@echo "║    make lint-fix-check - Check for lint issues            ║"
	@echo "║    make lint-fix-checkboxes - Fix checkbox separators     ║"
	@echo "║    make lint-fix-frontmatter - Add missing frontmatter    ║"
	@echo "║    make lint-scripts - Lint Python scripts                ║"
	@echo "║    make test-scripts - Run Python unit tests for scripts  ║"
	@echo "║    make lint-runtime - Lint central runtime package       ║"
	@echo "║    make test-runtime - Run central runtime tests          ║"
	@echo "║    make runtime-mcp-smoke - Smoke runtime and MCP CLI     ║"
	@echo "║    make test-scripts-integration - Run isolated integration tests ║"
	@echo "║    make test-scripts-all - Run unit + integration + cov   ║"
	@echo "║                                                           ║"
	@echo "║  Telemetry & Patterns                                     ║"
	@echo "║    make telemetry-record  - Record telemetry event        ║"
	@echo "║    make telemetry-report  - Generate telemetry report     ║"
	@echo "║    make telemetry-export  - Export telemetry data         ║"
	@echo "║    make telemetry-validate- Validate telemetry schema     ║"
	@echo "║    make telemetry-heat    - Show heat map of elements     ║"
	@echo "║    make telemetry-hot     - Show hottest elements         ║"
	@echo "║    make telemetry-cold    - Show coldest elements         ║"
	@echo "║    make patterns-suggest  - Suggest patterns for theme    ║"
	@echo "║    make patterns-list     - List all patterns             ║"
	@echo "║    make patterns-show     - Show pattern details         ║"
	@echo "║                                                           ║"
	@echo "║  Quick Workflows                                          ║"
	@echo "║    make all          - Run full validation                ║"
	@echo "║    make refresh      - Clean + setup + structure          ║"
	@echo "╚═══════════════════════════════════════════════════════════╝"

# ==============================================================================
# SETUP & MAINTENANCE
# ==============================================================================

setup:
	@echo "→ Setting up UV virtualenv..."
	@mkdir -p "$(UV_CACHE_DIR)"
	@cd .agents/scripts && $(UV) sync
	@echo "✓ Setup complete"

setup-runtime:
	@echo "→ Setting up central runtime environment..."
	@mkdir -p "$(UV_CACHE_DIR)"
	@cd .agents/runtime && $(UV) sync --locked
	@echo "✓ Runtime setup complete"

doctor:
	@echo "→ Validating .agents structure..."
	@./.agents/agents doctor

clean:
	@echo "→ Cleaning temporary files..."
	@rm -rf .agents/scripts/.venv
	@rm -rf .agents/scripts/uv.lock
	@find .agents -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	@find .agents -type f -name "*.pyc" -delete 2>/dev/null || true
	@echo "✓ Clean complete"

# ==============================================================================
# DOCUMENTATION
# ==============================================================================

structure:
	@echo "→ Generating project structure documentation..."
	@./.agents/agents structure-map . --output docs/arc/structure/
	@echo "✓ Structure docs generated"

repo-map:
	@echo "→ Generating repository codemap..."
	@./.agents/agents repo-map $(if $(TARGET_PATH),$(TARGET_PATH),.) $(if $(OUTPUT_DIR),--output "$(OUTPUT_DIR)",) $(if $(RUNNER),--runner "$(RUNNER)",) $(if $(IMAGE),--image "$(IMAGE)",) $(if $(DRY),--dry-run,)
	@echo "✓ Repository codemap completed"

index:
	@echo "→ Updating SPECS/ADRS indexes..."
	@./.agents/agents index
	@echo "✓ Indexes updated"

knowledge-index:
	@echo "→ Building reusable knowledge index..."
	@./.agents/agents knowledge index
	@echo "✓ Knowledge index updated"

knowledge-list:
	@./.agents/agents knowledge list $(if $(TYPE),--type $(TYPE),)

knowledge-search:
ifndef QUERY
	@echo "Usage: make knowledge-search QUERY=<term>"
	@exit 1
else
	@./.agents/agents knowledge search "$(QUERY)"
endif

knowledge-pull:
ifndef QUERY
	@echo "Usage: make knowledge-pull QUERY=<term>"
	@exit 1
else
	@./.agents/agents knowledge pull "$(QUERY)"
endif

memory-status:
	@./.agents/agents memory status

memory-search:
ifndef QUERY
	@echo "Usage: make memory-search QUERY=<term> [RUNTIME=<runtime>] [PROJECT=<project>] [LIMIT=<n>]"
	@exit 1
else
	@./.agents/agents memory search "$(QUERY)" $(if $(RUNTIME),--runtime $(RUNTIME),) $(if $(PROJECT),--project "$(PROJECT)",) $(if $(LIMIT),--limit $(LIMIT),)
endif

memory-context:
ifndef TOPIC
	@echo "Usage: make memory-context TOPIC=<topic> [RUNTIME=<runtime>] [PROJECT=<project>] [URL=memory://...] [DEPTH=<n>] [RELATED=<n>] [LIMIT=<n>]"
	@exit 1
else
	@./.agents/agents memory context "$(TOPIC)" $(if $(RUNTIME),--runtime $(RUNTIME),) $(if $(PROJECT),--project "$(PROJECT)",) $(if $(URL),--url "$(URL)",) $(if $(DEPTH),--depth $(DEPTH),) $(if $(RELATED),--max-related $(RELATED),) $(if $(LIMIT),--limit $(LIMIT),)
endif

memory-recent:
	@./.agents/agents memory recent $(if $(RUNTIME),--runtime $(RUNTIME),) $(if $(PROJECT),--project "$(PROJECT)",) $(if $(TIMEFRAME),--timeframe "$(TIMEFRAME)",) $(if $(LIMIT),--limit $(LIMIT),)

memory-show:
ifndef NOTE
	@echo "Usage: make memory-show NOTE=<identifier> [RUNTIME=<runtime>] [PROJECT=<project>]"
	@exit 1
else
	@./.agents/agents memory show "$(NOTE)" $(if $(RUNTIME),--runtime $(RUNTIME),) $(if $(PROJECT),--project "$(PROJECT)",)
endif

sync:
	@echo "→ Syncing AGENTS.md to agent files..."
	@./.agents/agents sync --force
	@echo "✓ Sync complete"

# ==============================================================================
# WORKFLOWS
# ==============================================================================

new:
ifndef THEME
	@echo "╔═══════════════════════════════════════════════════════════╗"
	@echo "║  Error: THEME required                                    ║"
	@echo "╠═══════════════════════════════════════════════════════════╣"
	@echo "║  Usage: make new THEME=<theme> FEATURE_ID=F-01            ║"
	@echo "║         PARENT_SPEC=<parent-spec-id> [SPEC=1|lite]        ║"
	@echo "║         [INTENT=delivery|research|...] [WITH=a,b]         ║"
	@echo "║                                                           ║"
	@echo "║  Examples:                                                ║"
	@echo "║    make new THEME=auth-refactor FEATURE_ID=F-01          ║"
	@echo "║      PARENT_SPEC=my-parent-spec                           ║"
	@echo "║    make new THEME=api-endpoint FEATURE_ID=F-02           ║"
	@echo "║      PARENT_SPEC=my-parent-spec SPEC=1                    ║"
	@echo "║    make new THEME=auth-investigation FEATURE_ID=F-03     ║"
	@echo "║      PARENT_SPEC=my-parent-spec INTENT=research           ║"
	@echo "╚═══════════════════════════════════════════════════════════╝"
	@exit 1
else
ifndef FEATURE_ID
	@echo "Usage: make new THEME=<theme> FEATURE_ID=F-01 PARENT_SPEC=<parent-spec-id> [SPEC=1|lite] [INTENT=delivery|research|planning|brainstorming|exploration|specification|closure] [WITH=doc1,doc2] [CHILD_SPEC=<child-spec-id>]"
	@exit 1
else
ifndef PARENT_SPEC
	@echo "Usage: make new THEME=<theme> FEATURE_ID=F-01 PARENT_SPEC=<parent-spec-id> [SPEC=1|lite] [INTENT=delivery|research|planning|brainstorming|exploration|specification|closure] [WITH=doc1,doc2] [CHILD_SPEC=<child-spec-id>]"
	@exit 1
else
	@echo "→ Creating workstream: $(THEME)..."
	@WITH_FLAGS=$$(printf '%s' "$(WITH)" | tr ',' '\n' | sed '/^$$/d' | sed 's#^# --with "#' | sed 's#$$#"##' | tr -d '\n'); \
	@if [ "$(SPEC)" = "1" ]; then \
		eval ./.agents/agents new $(THEME) --feature-id "$(FEATURE_ID)" --parent-spec "$(PARENT_SPEC)" $(if $(CHILD_SPEC),--child-spec "$(CHILD_SPEC)",) $(if $(INTENT),--intent "$(INTENT)",) $$WITH_FLAGS --spec; \
	elif [ "$(SPEC)" = "lite" ]; then \
		eval ./.agents/agents new $(THEME) --feature-id "$(FEATURE_ID)" --parent-spec "$(PARENT_SPEC)" $(if $(CHILD_SPEC),--child-spec "$(CHILD_SPEC)",) $(if $(INTENT),--intent "$(INTENT)",) $$WITH_FLAGS --spec-lite; \
	else \
		eval ./.agents/agents new $(THEME) --feature-id "$(FEATURE_ID)" --parent-spec "$(PARENT_SPEC)" $(if $(CHILD_SPEC),--child-spec "$(CHILD_SPEC)",) $(if $(INTENT),--intent "$(INTENT)",) $$WITH_FLAGS; \
	fi
	@echo "✓ Workstream created: $(THEME)"
endif
endif
endif

quick:
ifndef THEME
	@echo "Usage: make quick THEME=<quick-task-theme>"
	@exit 1
else
	@echo "→ Registering quick task in active workstream: $(THEME)..."
	@./.agents/agents new $(THEME) --quick
endif

bootstrap:
ifndef TARGET
	@echo "Usage: make bootstrap TARGET=/path/to/other-repo [PARTIAL=1] [FORCE=1] [DRY=1] [SKIP_CHECKS=1]"
	@exit 1
else
	@echo "→ Bootstrapping .agents system into: $(TARGET)"
	@./.agents/agents bootstrap "$(TARGET)" $(if $(PARTIAL),--partial,) $(if $(FORCE),--force,) $(if $(DRY),--dry-run,) $(if $(SKIP_CHECKS),--skip-checks,)
endif

fix-symlinks:
	@echo "→ Repairing agent symlinks..."
	@./.agents/agents fix-symlinks $(if $(MODE),--mode $(MODE),) $(if $(TARGETS),--targets "$(TARGETS)",) $(if $(FORCE),--force,) $(if $(DRY),--dry-run,)


skills-init:
	@./.agents/agents skills-sync init

skills-pull:
	@./.agents/agents skills-sync pull

skills-update:
	@./.agents/agents skills-sync update $(if $(SKILLS),--skills "$(SKILLS)",) $(if $(RUNTIME),--runtime $(RUNTIME),) $(if $(PROFILE),--profile "$(PROFILE)",)

skills-list:
	@./.agents/agents skills-sync list $(if $(RUNTIME),--runtime $(RUNTIME),) $(if $(PROFILE),--profile "$(PROFILE)",) $(if $(SELECTED),--selected,) $(if $(INSTALLED),--installed,)

skills-search:
ifndef QUERY
	@echo "Usage: make skills-search QUERY=<term> [RUNTIME=<runtime>] [PROFILE=<profile>] [LIMIT=<n>] [SELECTED=1]"
	@exit 1
else
	@./.agents/agents skills-sync search "$(QUERY)" $(if $(RUNTIME),--runtime $(RUNTIME),) $(if $(PROFILE),--profile "$(PROFILE)",) $(if $(LIMIT),--limit $(LIMIT),) $(if $(SELECTED),--selected,)
endif

skills-plan:
	@./.agents/agents skills-sync plan $(if $(SKILLS),--skills "$(SKILLS)",)

skills-apply:
	@./.agents/agents skills-sync apply $(if $(SKILLS),--skills "$(SKILLS)",)

skills-ensure:
ifndef SKILL
	@echo "Usage: make skills-ensure SKILL=<name> [RUNTIME=<runtime>] [PROFILE=<profile>] [PERSIST=1] [PULL=1]"
	@exit 1
else
	@./.agents/agents skills-sync ensure "$(SKILL)" $(if $(RUNTIME),--runtime $(RUNTIME),) $(if $(PROFILE),--profile "$(PROFILE)",) $(if $(PERSIST),--persist,) $(if $(PULL),--pull,)
endif

skills-push:
	@./.agents/agents skills-sync push $(if $(SKILL),"$(SKILL)",) $(if $(SKILLS),--skills "$(SKILLS)",) $(if $(BRANCH),--branch "$(BRANCH)",) $(if $(BASE),--base "$(BASE)",) $(if $(COMMIT),--commit,) $(if $(PUSH),--push,) $(if $(PR),--pr,) $(if $(MESSAGE),--message "$(MESSAGE)",) $(if $(TITLE),--title "$(TITLE)",)

skills-status:
	@./.agents/agents skills-sync status

skills-check:
	@./.agents/agents skills-sync check $(if $(SKILLS),--skills "$(SKILLS)",)

skills-sync:
	@./.agents/agents skills-sync sync $(if $(SKILLS),--skills "$(SKILLS)",)

wb-touch:
ifndef SESSION_ID
	@echo "Usage: make wb-touch SESSION_ID=<session-id> [FILE=<path>]"
	@exit 1
else
	@if [ -n "$(FILE)" ]; then \
		./.agents/agents wb-update touch --session "$(SESSION_ID)" --file "$(FILE)"; \
	else \
		./.agents/agents wb-update touch --session "$(SESSION_ID)"; \
	fi
endif

wb-normalize-time:
ifeq ($(strip $(SESSION_ID)$(FILE)$(ALL_WB)),)
	@echo "Usage: make wb-normalize-time SESSION_ID=<session-id> | FILE=<path> | ALL_WB=1"
	@exit 1
else
	@if [ -n "$(FILE)" ]; then \
		./.agents/agents wb-update normalize-time --file "$(FILE)"; \
	elif [ "$(ALL_WB)" = "1" ]; then \
		./.agents/agents wb-update normalize-time --all-wb; \
	else \
		./.agents/agents wb-update normalize-time --session "$(SESSION_ID)"; \
	fi
endif

wb-files-changed:
ifeq ($(strip $(SESSION_ID)$(REPORT)),)
	@echo "Usage: make wb-files-changed SESSION_ID=<session-id> [INCLUDE_WB=1] | REPORT=<report-file>"
	@exit 1
else
	@if [ -n "$(REPORT)" ]; then \
		./.agents/agents wb-update files-changed --report "$(REPORT)" $(if $(INCLUDE_WB),--include-wb,); \
	else \
		./.agents/agents wb-update files-changed --session "$(SESSION_ID)" $(if $(INCLUDE_WB),--include-wb,); \
	fi
endif

wb-evidence:
ifndef SESSION_ID
	@echo "Usage: make wb-evidence SESSION_ID=<session-id> TASK_ID=T-01 CMD=\"...\" RESULT=\"...\" [ARTIFACT=<path>] [NOTE=\"...\"]"
	@exit 1
else
ifndef TASK_ID
	@echo "Usage: make wb-evidence SESSION_ID=<session-id> TASK_ID=T-01 CMD=\"...\" RESULT=\"...\" [ARTIFACT=<path>] [NOTE=\"...\"]"
	@exit 1
else
ifndef CMD
	@echo "Usage: make wb-evidence SESSION_ID=<session-id> TASK_ID=T-01 CMD=\"...\" RESULT=\"...\" [ARTIFACT=<path>] [NOTE=\"...\"]"
	@exit 1
else
ifndef RESULT
	@echo "Usage: make wb-evidence SESSION_ID=<session-id> TASK_ID=T-01 CMD=\"...\" RESULT=\"...\" [ARTIFACT=<path>] [NOTE=\"...\"]"
	@exit 1
else
	@./.agents/agents wb-update evidence "$(TASK_ID)" --session "$(SESSION_ID)" --command "$(CMD)" --result "$(RESULT)" $(if $(ARTIFACT),--artifact "$(ARTIFACT)",) $(if $(NOTE),--note "$(NOTE)",)
endif
endif
endif
endif

wb-task:
ifndef SESSION_ID
	@echo "Usage: make wb-task SESSION_ID=<session-id> TASK_ID=T-01 ACTION=done|in_progress|pending|ready|blocked|skipped [EVIDENCE_ID=E-...] [ALLOW_UNSAFE_DONE=1]"
	@exit 1
else
ifndef TASK_ID
	@echo "Usage: make wb-task SESSION_ID=<session-id> TASK_ID=T-01 ACTION=done|in_progress|pending|ready|blocked|skipped [EVIDENCE_ID=E-...] [ALLOW_UNSAFE_DONE=1]"
	@exit 1
else
	@if [ "$(ACTION)" = "done" ]; then \
		if [ -n "$(EVIDENCE_ID)" ]; then \
			./.agents/agents wb-update task $(TASK_ID) --session "$(SESSION_ID)" --mark-done --evidence-id "$(EVIDENCE_ID)"; \
		elif [ "$(ALLOW_UNSAFE_DONE)" = "1" ]; then \
			./.agents/agents wb-update task $(TASK_ID) --session "$(SESSION_ID)" --mark-done --allow-unsafe-done; \
		else \
			echo "ACTION=done requires EVIDENCE_ID. Use make wb-evidence first or set ALLOW_UNSAFE_DONE=1"; \
			exit 1; \
		fi; \
	elif [ "$(ACTION)" = "in_progress" ]; then \
		./.agents/agents wb-update task $(TASK_ID) --session "$(SESSION_ID)" --mark-in-progress; \
	elif [ "$(ACTION)" = "pending" ]; then \
		./.agents/agents wb-update task $(TASK_ID) --session "$(SESSION_ID)" --mark-pending; \
	elif [ "$(ACTION)" = "ready" ]; then \
		./.agents/agents wb-update task $(TASK_ID) --session "$(SESSION_ID)" --mark-ready; \
	elif [ "$(ACTION)" = "blocked" ]; then \
		./.agents/agents wb-update task $(TASK_ID) --session "$(SESSION_ID)" --mark-blocked; \
	elif [ "$(ACTION)" = "skipped" ]; then \
		./.agents/agents wb-update task $(TASK_ID) --session "$(SESSION_ID)" --mark-skipped; \
	else \
		echo "Invalid ACTION=$(ACTION)"; \
		echo "Use one of: done, in_progress, pending, ready, blocked, skipped"; \
		exit 1; \
	fi
endif
endif

wb-status:
ifndef SESSION_ID
	@echo "Usage: make wb-status SESSION_ID=<session-id> STATUS=<value> [FILE=plan|task|spec-lite|report|log|all]"
	@exit 1
else
ifndef STATUS
	@echo "Usage: make wb-status SESSION_ID=<session-id> STATUS=<value> [FILE=plan|task|spec-lite|report|log|all]"
	@exit 1
else
	@./.agents/agents wb-update status --session "$(SESSION_ID)" --value "$(STATUS)" --file "$(if $(FILE),$(FILE),all)"
endif
endif

wb-timeline:
ifndef SESSION_ID
	@echo "Usage: make wb-timeline SESSION_ID=<session-id> MSG=\"your message\""
	@exit 1
else
ifndef MSG
	@echo "Usage: make wb-timeline SESSION_ID=<session-id> MSG=\"your message\""
	@exit 1
else
	@./.agents/agents wb-update timeline --session "$(SESSION_ID)" --message "$(MSG)"
endif
endif

wb-link:
ifndef SESSION_ID
	@echo "Usage: make wb-link SESSION_ID=<session-id> FILE=plan|task|spec-lite|report|log KEY=<key> VALUE=<value>"
	@exit 1
endif
ifndef FILE
	@echo "Usage: make wb-link SESSION_ID=<session-id> FILE=plan|task|spec-lite|report|log KEY=<key> VALUE=<value>"
	@exit 1
endif
ifndef KEY
	@echo "Usage: make wb-link SESSION_ID=<session-id> FILE=plan|task|spec-lite|report|log KEY=<key> VALUE=<value>"
	@exit 1
endif
ifndef VALUE
	@echo "Usage: make wb-link SESSION_ID=<session-id> FILE=plan|task|spec-lite|report|log KEY=<key> VALUE=<value>"
	@exit 1
endif
	@./.agents/agents wb-update link --session "$(SESSION_ID)" --file "$(FILE)" --key "$(KEY)" --value "$(VALUE)"

verify:
	@echo "→ Verifying task completion across all sessions..."
	@./.agents/agents verify-tasks .agents/wb/

verify-session:
ifndef SESSION_ID
	@echo "Usage: make verify-session SESSION_ID=<session-id>"
	@exit 1
else
	@echo "→ Verifying task completion for session $(SESSION_ID)..."
	@./.agents/agents verify-tasks ".agents/wb/$(SESSION_ID)"
endif

verify-active:
	@ACTIVE_SESSION="$$(cat .agents/wb/.active_session 2>/dev/null || true)"; \
	if [ -z "$$ACTIVE_SESSION" ]; then \
		echo "Usage: make verify-active (requires .agents/wb/.active_session)"; \
		exit 1; \
	fi; \
	echo "→ Verifying active session $$ACTIVE_SESSION..."; \
	./.agents/agents verify-tasks ".agents/wb/$$ACTIVE_SESSION"

verify-active-if-present:
	@ACTIVE_SESSION="$$(cat .agents/wb/.active_session 2>/dev/null || true)"; \
	if [ -z "$$ACTIVE_SESSION" ]; then \
		echo "→ No active session set; skipping active-session verification"; \
	else \
		echo "→ Verifying active session $$ACTIVE_SESSION..."; \
		./.agents/agents verify-tasks ".agents/wb/$$ACTIVE_SESSION"; \
	fi

verify-strict:
	@ACTIVE_SESSION="$$(cat .agents/wb/.active_session 2>/dev/null || true)"; \
	if [ -z "$$ACTIVE_SESSION" ]; then \
		echo "Usage: make verify-strict (requires .agents/wb/.active_session)"; \
		exit 1; \
	fi; \
	echo "→ Running strict verification on active session $$ACTIVE_SESSION..."; \
	./.agents/agents verify-tasks ".agents/wb/$$ACTIVE_SESSION" --strict

verify-strict-if-present:
	@ACTIVE_SESSION="$$(cat .agents/wb/.active_session 2>/dev/null || true)"; \
	if [ -z "$$ACTIVE_SESSION" ]; then \
		echo "→ No active session set; skipping strict active-session verification"; \
	else \
		echo "→ Running strict verification on active session $$ACTIVE_SESSION..."; \
		./.agents/agents verify-tasks ".agents/wb/$$ACTIVE_SESSION" --strict; \
	fi

lint:
	@echo "→ Linting markdown docs..."
	@./.agents/agents lint-docs .agents/ docs/ README.md AGENTS.md OPENCODE.md QWEN.md CLAUDE.md GEMINI.md PLANS.md

tools-check:
	@echo "→ Validating tools catalog..."
	@./.agents/agents tools validate
	@echo "→ Running tools smoke tests..."
	@./.agents/agents tools smoke
	@echo "✓ Tools catalog and CLI smoke validated"

test-scripts:
	@echo "→ Running script unit tests..."
	@mkdir -p "$(UV_CACHE_DIR)"
	@$(UV) run --project .agents/scripts pytest .agents/scripts/tests -m "not integration and not e2e"
	@echo "✓ Script unit tests passed"

test-scripts-integration:
	@echo "→ Running script integration tests..."
	@mkdir -p "$(UV_CACHE_DIR)"
	@$(UV) run --project .agents/scripts pytest .agents/scripts/tests/integration
	@echo "✓ Script integration tests passed"

test-scripts-all:
	@echo "→ Running full script test suite with 80% coverage gate..."
	@mkdir -p "$(UV_CACHE_DIR)"
	@$(UV) run --project .agents/scripts pytest .agents/scripts/tests -m "not e2e" --cov=.agents/scripts --cov-config=.agents/scripts/pyproject.toml --cov-report=term-missing --cov-fail-under=80
	@echo "✓ Full script test suite and coverage gate passed"

lint-scripts:
	@echo "→ Linting Python scripts..."
	@mkdir -p "$(UV_CACHE_DIR)"
	@cd .agents/scripts && $(UV) run ruff check .
	@echo "✓ Python scripts linted"

lint-runtime:
	@echo "→ Linting central runtime package..."
	@mkdir -p "$(UV_CACHE_DIR)"
	@$(UV) run --project .agents/runtime --locked ruff check .agents/runtime
	@echo "✓ Central runtime linted"

test-runtime:
	@echo "→ Running central runtime tests..."
	@mkdir -p "$(UV_CACHE_DIR)"
	@$(UV) run --project .agents/runtime --locked pytest .agents/runtime/tests
	@echo "✓ Central runtime tests passed"

runtime-mcp-smoke:
	@echo "→ Running central runtime and MCP smoke checks..."
	@./.agents/agents runtime manifest >/dev/null
	@./.agents/agents runtime command-registry >/dev/null
	@./.agents/agents mcp validate >/dev/null
	@./.agents/agents status --json >/dev/null
	@./.agents/agents-mcp inspect --depth 1 --max-entries 50 >/dev/null
	@echo "✓ Central runtime and MCP smoke checks passed"

# ==============================================================================
# TELEMETRY & PATTERNS
# ==============================================================================

telemetry-record:
	@echo "→ Recording telemetry event..."
	@$(PYTHON) .agents/scripts/agents-telemetry.py record $(EVENT_TYPE) $(if $(SESSION_ID),--session-id="$(SESSION_ID)",) $(if $(METADATA),--metadata='$(METADATA)',) $(if $(OUTCOME),--outcome="$(OUTCOME)",)

telemetry-report:
	@echo "→ Generating telemetry report..."
	@$(PYTHON) .agents/scripts/agents-telemetry.py report --period="$(if $(PERIOD),$(PERIOD),weekly)" --format="$(if $(FORMAT),$(FORMAT),text)"

telemetry-export:
	@echo "→ Exporting telemetry data..."
	@$(PYTHON) .agents/scripts/agents-telemetry.py export --format="$(if $(FORMAT),$(FORMAT),json)" $(if $(OUTPUT),--output="$(OUTPUT)",)

telemetry-validate:
	@echo "→ Validating telemetry data..."
	@$(PYTHON) .agents/scripts/agents-telemetry.py validate

telemetry-heat:
	@echo "→ Generating heat map..."
	@$(PYTHON) .agents/scripts/agents-telemetry.py heat $(if $(TYPE),--type=$(TYPE),) $(if $(FORMAT),--format=$(FORMAT),) $(if $(MIN_SCORE),--min-score=$(MIN_SCORE),) $(if $(PERIOD),--period=$(PERIOD),)

telemetry-hot:
	@echo "→ Showing hottest elements..."
	@$(PYTHON) .agents/scripts/agents-telemetry.py hot $(if $(LIMIT),--limit=$(LIMIT),) $(if $(TYPE),--type=$(TYPE),) $(if $(PERIOD),--period=$(PERIOD),)

telemetry-cold:
	@echo "→ Showing coldest elements..."
	@$(PYTHON) .agents/scripts/agents-telemetry.py cold $(if $(LIMIT),--limit=$(LIMIT),) $(if $(TYPE),--type=$(TYPE),) $(if $(PERIOD),--period=$(PERIOD),)

patterns-suggest:
	@echo "→ Suggesting patterns..."
	@$(PYTHON) .agents/scripts/agents-patterns.py suggest $(if $(THEME),--theme="$(THEME)",) $(if $(TAGS),--tags="$(TAGS)",) $(if $(LIMIT),--limit=$(LIMIT),)

patterns-list:
	@echo "→ Listing patterns..."
	@$(PYTHON) .agents/scripts/agents-patterns.py list $(if $(TYPE),--type=$(TYPE),) $(if $(STATUS),--status=$(STATUS),)

patterns-show:
ifndef PATTERN_ID
	@echo "Usage: make patterns-show PATTERN_ID=PAT-001"
	@exit 1
else
	@$(PYTHON) .agents/scripts/agents-patterns.py show $(PATTERN_ID)
endif

patterns-apply:
ifndef PATTERN_ID
	@echo "Usage: make patterns-apply PATTERN_ID=PAT-001 [SESSION=xxx]"
	@exit 1
else
	@$(PYTHON) .agents/scripts/agents-patterns.py apply $(PATTERN_ID) $(if $(SESSION),--session="$(SESSION)",)
endif

patterns-rate:
ifndef PATTERN_ID
	@echo "Usage: make patterns-rate PATTERN_ID=PAT-001 EFFECTIVENESS=high|medium|low"
	@exit 1
else
ifndef EFFECTIVENESS
	@echo "Usage: make patterns-rate PATTERN_ID=PAT-001 EFFECTIVENESS=high|medium|low"
	@exit 1
else
	@$(PYTHON) .agents/scripts/agents-patterns.py rate $(PATTERN_ID) --effectiveness=$(EFFECTIVENESS)
endif
endif

# ==============================================================================
# QUICK WORKFLOWS
# ==============================================================================

agents-all: doctor structure index knowledge-index sync lint lint-scripts lint-runtime skills-check tools-check telemetry-validate test-scripts-all test-runtime runtime-mcp-smoke
	@echo ""
	@echo "╔═══════════════════════════════════════════════════════════╗"
	@echo "║  ✓ All validations passed                                 ║"
	@echo "╚═══════════════════════════════════════════════════════════╝"

ifndef AGENTS_PRESERVE_LOCAL_ALL
all: agents-all
endif

refresh: clean setup structure
	@echo ""
	@echo "╔═══════════════════════════════════════════════════════════╗"
	@echo "║  ✓ Refresh complete                                       ║"
	@echo "╚═══════════════════════════════════════════════════════════╝"

# ==============================================================================
# ALIASES (for convenience)
# ==============================================================================

# Short aliases
st: structure
ix: index
sy: sync
vf: verify
va: verify-active
dr: doctor

# Common workflows
docs: structure index knowledge-index sync
check: doctor lint verify-active-if-present
init: setup doctor

# ==============================================================================
# LINT FIX COMMANDS
# ==============================================================================

lint-fix:
	@echo "→ Fixing common lint issues..."
	@$(PYTHON) .agents/scripts/fix-lint-all.py .agents
	@echo "✓ Lint fixes applied"

lint-fix-dry:
	@echo "→ Previewing lint fixes (dry run)..."
	@$(PYTHON) .agents/scripts/fix-lint-all.py --dry-run .agents

lint-fix-check:
	@echo "→ Checking for lint issues..."
	@$(PYTHON) .agents/scripts/fix-lint-all.py --check .agents

lint-fix-checkboxes:
	@echo "→ Fixing missing checkbox separators..."
	@$(PYTHON) .agents/scripts/fix-lint-checkboxes.py .agents

lint-fix-frontmatter:
	@echo "→ Adding missing frontmatter..."
	@$(PYTHON) .agents/scripts/fix-lint-frontmatter.py docs/standards/scripts-usage.md docs/standards/scripts-reference.md .agents/scripts/tests/TEST_STRATEGY.md
