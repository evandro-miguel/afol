---
doc_type: standard
id: test-strategy
theme: tests
status: active
created_at: '2026-02-23T23:37:47-03:00'
updated_at: '2026-04-02T15:21:56-03:00'
---

# .agents/scripts Test Strategy

## Overview

This document describes the committed test strategy for `.agents/scripts`.
It reflects the suite that actually exists in the repository today.

## Current Goals

- Protect the bootstrap and runtime-compatibility contract for downstream repos.
- Keep workbench governance commands deterministic and locally testable.
- Verify skills-sync, telemetry, lint helpers, knowledge helpers, repo-map
  commands, and execution helpers with focused tests.
- Exercise critical integration flows in an isolated copied repository instead
  of mutating the canonical scaffold checkout.

## Source of Truth

- Pytest configuration: `.agents/scripts/pyproject.toml`
- Test commands: `docs/standards/Makefile`
- Global fixtures and tempdir guards: `.agents/scripts/tests/conftest.py`

## Suite Layout

```text
.agents/scripts/tests/
├── conftest.py
├── unit/
│   ├── test_agents_config_active_session.py
│   ├── test_refactored_functions.py
│   └── test_version.py
├── integration/
│   └── test_critical_workflows.py
└── test_*.py
```

## Test Categories

### Root-level command and contract tests

These files validate CLI-adjacent behavior without requiring a full copied repo.
Examples include:

- `test_runtime_compatibility.py`
- `test_agents_skills_sync.py`
- `test_agents_repo_map.py`
- `test_agents_tools_catalog.py`
- `test_verify_tasks_strict.py`
- `test_execution_command_flow.py`
- `test_execution_command_scenarios.py`

### Unit tests

`tests/unit/` is reserved for small-scope helpers and pure logic with minimal
filesystem or subprocess coupling.

### Integration tests

`tests/integration/test_critical_workflows.py` is the integration harness for
the scaffold. It copies the repository to a temporary location, seeds a local
session, and runs commands against that isolated clone.

### E2E marker policy

The `e2e` pytest marker remains declared in `pyproject.toml` for future use,
but there are currently no committed E2E tests in this repository.
Do not keep placeholder E2E packages, fixtures, or data trees without
executable tests behind them.

## Canonical Commands

```bash
make test-scripts
make test-scripts-integration
make test-scripts-all
make all
```

Equivalent direct pytest commands:

```bash
uv run --project .agents/scripts pytest .agents/scripts/tests -m "not integration and not e2e"
uv run --project .agents/scripts pytest .agents/scripts/tests/integration
uv run --project .agents/scripts pytest .agents/scripts/tests -m "not e2e"
```

## Isolation Rules

- Tests must not write runtime state into the canonical repository checkout.
- Temp directories created during tests must resolve outside the repo root.
- Integration flows must prove behavior through a copied repo, not through the
  active workbench or live telemetry state.
- New test fixtures or data files must have a live consumer in the committed
  suite. If the consumer is removed, remove the asset as part of the same
  change.

## Maintenance Rules

- Prefer one real test over speculative fixture trees.
- Add `@pytest.mark.integration` only when the test needs a copied repo or
  multiple commands working together.
- Reserve `@pytest.mark.e2e` for full user journeys that cannot be proven with
  the integration harness.
- Keep this document synchronized with the actual committed suite. If a file,
  directory, or category disappears from the repo, remove it here too.

## Acceptance

The test strategy is current when:

- the file tree described above matches the committed test tree,
- the Makefile commands still map to the suite described here, and
- no placeholder directories or data files remain without executable coverage.
