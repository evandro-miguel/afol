---
id: AGENT-001
theme: agentic-tools-documentation
type: index
status: active
owner: system
created_at: 2026-02-23 00:00:00-03:00
updated_at: '2026-03-23T20:38:52-03:00'
links:
  tools_json: ../tools.json
  scripts_dir: ../scripts/
---

# Agentic Tools Documentation

**Purpose:** Technical documentation of `.agents` system tools for autonomous agents.

**Audience:** AI agents (QWEN, CLAUDE, GEMINI) operating in this repository.

---

## Overview

This directory contains detailed technical documentation for each operational tool in the `.agents` system. Each document answers:

1. **Why it exists** - Problem it solves
2. **Function** - What it does
3. **What it touches** - Files it reads/writes
4. **How to configure** - Relevant configurations
5. **How to modify** - Maintenance guide
6. **How to test** - Functionality metrics
7. **Main functions** - Key code

---

## Documented Tools

### Core Tools

| Tool | Type | Document |
|------|------|----------|
| `tools` | discovery | [agents-tools.md](./agents-tools.md) |
| `doctor` | validation | [agents-doctor.md](./agents-doctor.md) |
| `new` | creation | [agents-new.md](./agents-new.md) |
| `index` | documentation | [agents-index.md](./agents-index.md) |
| `lint-docs` | validation | [agents-lint-docs.md](./agents-lint-docs.md) |
| `structure-map` | documentation | [agents-structure-map.md](./agents-structure-map.md) |
| `sync` | synchronization | [sync-agent-docs.md](./sync-agent-docs.md) |
| `verify-tasks` | verification | [verify-tasks.md](./verify-tasks.md) |
| `wb-update` | automation | [agents-wb-update.md](./agents-wb-update.md) |
| `memory` | knowledge | [agents-memory.md](./agents-memory.md) |

### Infrastructure

| Component | Type | Document |
|-----------|------|----------|
| `afol` | public CLI | repo help/status/validate |
| `.agents/agents` | factory-only compatibility wrapper | [agents-wrapper.md](./agents-wrapper.md) |
| `tools.json` | configuration | [tools-json.md](./tools-json.md) |
| `agents_config.py` | library | [agents-config.md](./agents-config.md) |

---

## Documentation Standard

Each tool follows this structure:

```markdown
---
id: TOOL-XXX
theme: <tool-name>
type: tool-doc
status: <draft|active|final>
owner: system
created_at: <date>
updated_at: <date>
---

# <Tool Name>

## Why It Exists

## Function

## What It Touches

## How to Configure

## How to Modify

## How to Test

## Main Functions
```

---

## How to Use This Documentation

### For Agents

1. **Check live state:** Use `afol status` or `afol validate`
2. **Understand tool:** Read the corresponding document in this directory
3. **Use tool:** Follow `afol` examples when they exist; treat legacy commands as compatibility-only when the doc says so
4. **Troubleshoot:** Consult "How to Test" or the compatibility note

### For Humans

1. **Understand system:** Start with [tools-json.md](./tools-json.md)
2. **Modify tool:** Read "How to Modify" in the specific document
3. **Add tool:** Follow documentation standard

---

## Architecture

```text
.agents/
├── agents              # Bash wrapper (CLI entry point)
├── tools.json          # Tool catalog (JSON)
├── agents.config       # Central configuration (YAML)
├── scripts/
│   ├── agents-tools.py         # Discovery
│   ├── agents-doctor.py        # Validation
│   ├── agents-new.py           # Creation
│   ├── agents-index.py         # Indexing
│   ├── agents-lint-docs.py     # Linting
│   ├── agents-memory.py        # External memory contracts
│   ├── agents-structure-map.py # Mapping
│   ├── sync-agent-docs.py      # Synchronization
│   ├── verify-tasks.py         # Verification
│   ├── agents-wb-update.py     # WB Automation
│   └── lib/
│       └── agents_config.py    # Config loader
└── ../docs/
    ├── agentic/        # This documentation
    ├── standards/      # Canonical standards
    └── templates/      # Canonical templates
```

---

## Typical Agent Flow

```text
1. Agent receives task
   ↓
2. Unsure which tool to use?
   → afol status
   → afol validate
   ↓
3. Identifies tool
   → Reads documentation in docs/agentic/
   ↓
4. Gets tool details
   → AFOL-native command pending; use the compatibility note in the tool doc
   ↓
5. Executes tool
   → afol <command> [args] when the verb exists
   ↓
6. Verifies result
   → Checks output and exit code
```

---

## Health Metrics

| Metric | How to Measure | Ideal |
|--------|----------------|-------|
| Functional tools | `afol status --json` | Live repo state |
| Complete documentation | Count files in `agentic/` | 1 doc per tool/infra surface |
| Valid configuration | `jq empty .agents/tools.json` | Valid JSON |
| Functional wrapper | `afol --help` | Lists public commands |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-02-23 | Created agentic documentation |
| 2026-02-23 | Added tools discovery |
| 2026-02-23 | Moved agents.config to .agents/ |

---

*Documentation maintained for autonomous agents to operate efficiently in .agents system*
