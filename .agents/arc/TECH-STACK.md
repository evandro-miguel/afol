---
doc_type: standard
id: 000000_000000_tech-stack_standard_01
status: active
created_at: '2026-03-07T00:00:00Z'
updated_at: '2026-03-06T22:29:30-03:00'
---

# Tech Stack

## Primary Stack
- Python 3.11+ for operational scripts
- Bash and Make for wrapper automation
- `uv` for environment and dependency management
- Markdown, YAML, JSON, and TOML for durable project artifacts

## Runtime Surface
- Canonical governance: `AGENTS.md` and `.agents/*`
- Primary runtimes: OpenCode, Codex, and Qwen
- Additional mirror: Gemini-facing adapter documentation

## Verification Stack
- `pytest` for script unit tests
- `ruff` for Python linting
- `make` targets for aggregate validation (`lint`, `lint-scripts`, `test-scripts`, `all`)
