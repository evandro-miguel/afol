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

.PHONY: help setup doctor new quick bootstrap fix-symlinks skills-init skills-pull skills-plan skills-apply skills-status skills-check skills-sync wb-touch wb-normalize-time wb-files-changed wb-task wb-status wb-timeline wb-link structure index sync verify lint tools-check test-scripts telemetry-record telemetry-report telemetry-export telemetry-validate patterns-suggest patterns-list patterns-show clean all

# ==============================================================================
# HELP
# ==============================================================================

help:
	@echo "╔═══════════════════════════════════════════════════════════╗"
	@echo "║         Agents System - Available Commands                ║"
	@echo "╠═══════════════════════════════════════════════════════════╣"
	@echo "║  Setup & Maintenance                                      ║"
	@echo "║    make setup        - Initialize UV virtualenv           ║"
	@echo "║    make clean        - Remove .venv and cache files       ║"
	@echo "║    make doctor       - Validate .agents structure         ║"
	@echo "║                                                           ║"
	@echo "║  Documentation                                            ║"
	@echo "║    make structure    - Generate project structure docs    ║"
	@echo "║    make index        - Update SPECS/ADRS indexes          ║"
	@echo "║    make sync         - Sync AGENTS.md to agent files      ║"
	@echo "║    make tools-check  - Validate/discover tools catalog     ║"
	@echo "║                                                           ║"
	@echo "║  Workflows                                                ║"
	@echo "║    make new          - Create workstream (THEME=xxx)      ║"
	@echo "║    make quick        - Use active session for quick task   ║"
	@echo "║    make bootstrap    - Install system into another repo    ║"
	@echo "║    make fix-symlinks - Repair links/copy fallback          ║"
	@echo "║    make wb-touch     - Update updated_at in active session ║"
	@echo "║    make wb-normalize-time - Normalize WB timestamps        ║"
	@echo "║    make wb-files-changed - Refresh report files changed    ║"
	@echo "║    make wb-task      - Mark task by ID in active session   ║"
	@echo "║    make wb-status    - Set doc status in active session    ║"
	@echo "║    make wb-timeline  - Append timeline entry to log        ║"
	@echo "║    make wb-link      - Set links.<key> in doc frontmatter  ║"
	@echo "║    make verify       - Check task completion              ║"
	@echo "║    make lint         - Validate markdown docs             ║"
	@echo "║    make test-scripts - Run Python unit tests for scripts  ║"
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
	@cd .agents/scripts && uv sync
	@echo "✓ Setup complete"

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
	@./.agents/agents structure-map . --output .agents/arc/structure/
	@echo "✓ Structure docs generated"

index:
	@echo "→ Updating SPECS/ADRS indexes..."
	@./.agents/agents index
	@echo "✓ Indexes updated"

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
	@echo "║  Usage: make new THEME=<theme-name> [SPEC=1]              ║"
	@echo "║                                                           ║"
	@echo "║  Examples:                                                ║"
	@echo "║    make new THEME=auth-refactor                           ║"
	@echo "║    make new THEME=api-endpoint SPEC=1                     ║"
	@echo "║    make new THEME=bugfix-login SPEC=lite                  ║"
	@echo "╚═══════════════════════════════════════════════════════════╝"
	@exit 1
else
	@echo "→ Creating workstream: $(THEME)..."
	@if [ "$(SPEC)" = "1" ]; then \
		./.agents/agents new $(THEME) --spec; \
	elif [ "$(SPEC)" = "lite" ]; then \
		./.agents/agents new $(THEME) --spec-lite; \
	else \
		./.agents/agents new $(THEME); \
	fi
	@echo "✓ Workstream created: $(THEME)"
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
	@echo "Usage: make bootstrap TARGET=/path/to/other-repo [FORCE=1] [DRY=1] [SKIP_CHECKS=1]"
	@exit 1
else
	@echo "→ Bootstrapping .agents system into: $(TARGET)"
	@./.agents/agents bootstrap "$(TARGET)" $(if $(FORCE),--force,) $(if $(DRY),--dry-run,) $(if $(SKIP_CHECKS),--skip-checks,)
endif

fix-symlinks:
	@echo "→ Repairing agent symlinks..."
	@./.agents/agents fix-symlinks $(if $(MODE),--mode $(MODE),) $(if $(TARGETS),--targets "$(TARGETS)",) $(if $(FORCE),--force,) $(if $(DRY),--dry-run,)


skills-init:
	@./.agents/agents skills-sync init

skills-pull:
	@./.agents/agents skills-sync pull

skills-plan:
	@./.agents/agents skills-sync plan $(if $(SKILLS),--skills "$(SKILLS)",)

skills-apply:
	@./.agents/agents skills-sync apply $(if $(SKILLS),--skills "$(SKILLS)",)

skills-status:
	@./.agents/agents skills-sync status

skills-check:
	@./.agents/agents skills-sync check $(if $(SKILLS),--skills "$(SKILLS)",)

skills-sync:
	@./.agents/agents skills-sync sync $(if $(SKILLS),--skills "$(SKILLS)",)

wb-touch:
	@./.agents/agents wb-update touch

wb-normalize-time:
	@./.agents/agents wb-update normalize-time --all-wb

wb-files-changed:
	@./.agents/agents wb-update files-changed

wb-task:
ifndef TASK_ID
	@echo "Usage: make wb-task TASK_ID=T-01 ACTION=done|in_progress|pending|ready|blocked|skipped"
	@exit 1
else
	@if [ "$(ACTION)" = "done" ]; then \
		./.agents/agents wb-update task $(TASK_ID) --mark-done; \
	elif [ "$(ACTION)" = "in_progress" ]; then \
		./.agents/agents wb-update task $(TASK_ID) --mark-in-progress; \
	elif [ "$(ACTION)" = "pending" ]; then \
		./.agents/agents wb-update task $(TASK_ID) --mark-pending; \
	elif [ "$(ACTION)" = "ready" ]; then \
		./.agents/agents wb-update task $(TASK_ID) --mark-ready; \
	elif [ "$(ACTION)" = "blocked" ]; then \
		./.agents/agents wb-update task $(TASK_ID) --mark-blocked; \
	elif [ "$(ACTION)" = "skipped" ]; then \
		./.agents/agents wb-update task $(TASK_ID) --mark-skipped; \
	else \
		echo "Invalid ACTION=$(ACTION)"; \
		echo "Use one of: done, in_progress, pending, ready, blocked, skipped"; \
		exit 1; \
	fi
endif

wb-status:
ifndef STATUS
	@echo "Usage: make wb-status STATUS=<value> [FILE=plan|task|spec-lite|report|log|all]"
	@exit 1
else
	@./.agents/agents wb-update status --value "$(STATUS)" --file "$(if $(FILE),$(FILE),all)"
endif

wb-timeline:
ifndef MSG
	@echo "Usage: make wb-timeline MSG=\"your message\""
	@exit 1
else
	@./.agents/agents wb-update timeline --message "$(MSG)"
endif

wb-link:
ifndef FILE
	@echo "Usage: make wb-link FILE=plan|task|spec-lite|report|log KEY=<key> VALUE=<value>"
	@exit 1
endif
ifndef KEY
	@echo "Usage: make wb-link FILE=plan|task|spec-lite|report|log KEY=<key> VALUE=<value>"
	@exit 1
endif
ifndef VALUE
	@echo "Usage: make wb-link FILE=plan|task|spec-lite|report|log KEY=<key> VALUE=<value>"
	@exit 1
endif
	@./.agents/agents wb-update link --file "$(FILE)" --key "$(KEY)" --value "$(VALUE)"

verify:
	@echo "→ Verifying task completion..."
	@./.agents/agents verify-tasks .agents/wb/

lint:
	@echo "→ Linting markdown docs..."
	@./.agents/agents lint-docs .agents/

tools-check:
	@echo "→ Validating tools catalog..."
	@./.agents/agents tools validate
	@echo "→ Running tools smoke tests..."
	@./.agents/agents tools smoke
	@echo "✓ Tools catalog and CLI smoke validated"

test-scripts:
	@echo "→ Running script unit tests..."
	@python3 -m unittest discover -s .agents/scripts/tests -p "test_*.py" -v
	@echo "✓ Script unit tests passed"

# ==============================================================================
# TELEMETRY & PATTERNS
# ==============================================================================

telemetry-record:
	@echo "→ Recording telemetry event..."
	@python3 .agents/scripts/agents-telemetry.py record $(EVENT_TYPE) $(if $(SESSION_ID),--session-id="$(SESSION_ID)",) $(if $(METADATA),--metadata='$(METADATA)',) $(if $(OUTCOME),--outcome="$(OUTCOME)",)

telemetry-report:
	@echo "→ Generating telemetry report..."
	@python3 .agents/scripts/agents-telemetry.py report --period="$(if $(PERIOD),$(PERIOD),weekly)" --format="$(if $(FORMAT),$(FORMAT),text)"

telemetry-export:
	@echo "→ Exporting telemetry data..."
	@python3 .agents/scripts/agents-telemetry.py export --format="$(if $(FORMAT),$(FORMAT),json)" $(if $(OUTPUT),--output="$(OUTPUT)",)

telemetry-validate:
	@echo "→ Validating telemetry data..."
	@python3 .agents/scripts/agents-telemetry.py validate

telemetry-heat:
	@echo "→ Generating heat map..."
	@python3 .agents/scripts/agents-telemetry.py heat $(if $(TYPE),--type=$(TYPE),) $(if $(FORMAT),--format=$(FORMAT),) $(if $(MIN_SCORE),--min-score=$(MIN_SCORE),) $(if $(PERIOD),--period=$(PERIOD),)

telemetry-hot:
	@echo "→ Showing hottest elements..."
	@python3 .agents/scripts/agents-telemetry.py hot $(if $(LIMIT),--limit=$(LIMIT),) $(if $(TYPE),--type=$(TYPE),) $(if $(PERIOD),--period=$(PERIOD),)

telemetry-cold:
	@echo "→ Showing coldest elements..."
	@python3 .agents/scripts/agents-telemetry.py cold $(if $(LIMIT),--limit=$(LIMIT),) $(if $(TYPE),--type=$(TYPE),) $(if $(PERIOD),--period=$(PERIOD),)

patterns-suggest:
	@echo "→ Suggesting patterns..."
	@python3 .agents/scripts/agents-patterns.py suggest $(if $(THEME),--theme="$(THEME)",) $(if $(TAGS),--tags="$(TAGS)",) $(if $(LIMIT),--limit=$(LIMIT),)

patterns-list:
	@echo "→ Listing patterns..."
	@python3 .agents/scripts/agents-patterns.py list $(if $(TYPE),--type=$(TYPE),) $(if $(STATUS),--status=$(STATUS),)

patterns-show:
ifndef PATTERN_ID
	@echo "Usage: make patterns-show PATTERN_ID=PAT-001"
	@exit 1
else
	@python3 .agents/scripts/agents-patterns.py show $(PATTERN_ID)
endif

patterns-apply:
ifndef PATTERN_ID
	@echo "Usage: make patterns-apply PATTERN_ID=PAT-001 [SESSION=xxx]"
	@exit 1
else
	@python3 .agents/scripts/agents-patterns.py apply $(PATTERN_ID) $(if $(SESSION),--session="$(SESSION)",)
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
	@python3 .agents/scripts/agents-patterns.py rate $(PATTERN_ID) --effectiveness=$(EFFECTIVENESS)
endif
endif

# ==============================================================================
# QUICK WORKFLOWS
# ==============================================================================

all: doctor structure index verify skills-check tools-check telemetry-validate
	@echo ""
	@echo "╔═══════════════════════════════════════════════════════════╗"
	@echo "║  ✓ All validations passed                                 ║"
	@echo "╚═══════════════════════════════════════════════════════════╝"

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
dr: doctor

# Common workflows
docs: structure index sync
check: doctor lint verify
init: setup doctor
