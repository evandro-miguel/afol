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

.PHONY: help setup doctor new quick wb-touch wb-normalize-time wb-files-changed wb-task wb-status wb-timeline wb-link structure index sync verify lint tools-check clean all

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
	@echo "║    make wb-touch     - Update updated_at in active session ║"
	@echo "║    make wb-normalize-time - Normalize WB timestamps        ║"
	@echo "║    make wb-files-changed - Refresh report files changed    ║"
	@echo "║    make wb-task      - Mark task by ID in active session   ║"
	@echo "║    make wb-status    - Set doc status in active session    ║"
	@echo "║    make wb-timeline  - Append timeline entry to log        ║"
	@echo "║    make wb-link      - Set links.<key> in doc frontmatter  ║"
	@echo "║    make verify       - Check task completion              ║"
	@echo "║    make lint         - Validate markdown docs             ║"
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
	@python3 .agents/scripts/agents-tools-smoke.py
	@echo "✓ Tools catalog and CLI smoke validated"

# ==============================================================================
# QUICK WORKFLOWS
# ==============================================================================

all: doctor structure index verify
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
