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

.PHONY: help setup doctor new structure index sync verify lint clean all

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
	@echo "║                                                           ║"
	@echo "║  Workflows                                                ║"
	@echo "║    make new          - Create workstream (THEME=xxx)      ║"
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

verify:
	@echo "→ Verifying task completion..."
	@./.agents/agents verify-tasks .agents/wb/

lint:
	@echo "→ Linting markdown docs..."
	@./.agents/agents lint-docs .agents/

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
