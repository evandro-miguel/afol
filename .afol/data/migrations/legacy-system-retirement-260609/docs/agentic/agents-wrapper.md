---
id: TOOL-011
theme: agents-wrapper
type: tool-doc
status: active
owner: system
created_at: 2026-02-20 00:00:00-03:00
updated_at: '2026-05-04T16:22:15-03:00'
links:
  tools_json: ./tools-json.md
  justfile: ./agents-wrapper.md
---

# agents (Bash Wrapper) - Factory Compatibility Surface

## Why It Exists

**Problem:** Legacy script and wrapper surfaces still need a bridge during migration while `afol` is the public entrypoint.

**Compatibility scope:** legacy interpreter setup and historical command
routing in the factory repo only.

**Solution:** retire downstream documentation for the wrapper and keep any
remaining behavior behind AFOL parity work.

## Function

The wrapper is legacy factory machinery. Do not expose it as a public command
surface. Port behavior to `afol` first, add parity tests, then remove the
wrapper route when downstream bootstrap and release validation pass.

## What It Touches

### Files Read

| File | Purpose |
|------|---------|
| Legacy scripts and runtime package | Factory-only compatibility surface |

### Environment Overrides

Legacy wrapper environment variables are intentionally undocumented as public
usage. Keep them in code comments or factory migration notes only when needed
for retirement work.

### Files Executed

Public execution should use `afol`. Legacy script/runtime execution remains an
internal factory implementation detail until removed.

## How to Configure

### Compatibility Commands

Do not add wrapper commands here. Add or document AFOL-native verbs in the
corresponding `docs/agentic/agents-*.md` file.

### Aliases

Legacy aliases are migration debt and are not part of downstream docs.

## How to Modify

### Add New Command

Implement the AFOL-native command under `cli/**`, add focused Bun tests, and
then update the relevant `docs/agentic` page.

## How to Test

```bash
bun run validate:toolchain
afol validate --json
```

## Output

```text
afol <command> [args...]
```

## Related

- [agents-wrapper.md](./agents-wrapper.md) - factory compatibility wrapper
- [agents-runtime.md](./agents-runtime.md) - Central runtime package
- [agents-mcp.md](./agents-mcp.md) - FastMCP adapter
- [tools-json.md](./tools-json.md) - Tool catalog

---

*Document: `docs/agentic/agents-wrapper.md`*
