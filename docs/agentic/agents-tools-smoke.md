---
id: TOOL-018
theme: agents-tools-smoke
type: tool-doc
status: active
owner: system
created_at: 2026-02-23 00:00:00-03:00
updated_at: '2026-04-13T19:36:52-03:00'
links:
  tools_json: ./tools-json.md
  agents_tools: ./agents-tools.md
---

# agents-tools-smoke.py - Tools CLI Smoke Tests

## Why It Exists

**Problem:** The tools catalog (`tools.json`) and CLI tools need validation to ensure:

- JSON schema is valid
- All referenced tools exist
- CLI commands work end-to-end
- No broken references

**Solution:** Automated smoke tests that validate tools catalog and CLI functionality.

## Function

Validates tools system:

1. **Schema validation** - Validates `tools.json` structure
2. **Reference check** - Verifies tool files exist
3. **CLI smoke tests** - Tests basic CLI commands
4. **Integration check** - Verifies tool integration

## What It Touches

### Files Read

| File | Purpose |
|------|---------|
| `.agents/tools.json` | Tools catalog |
| `.agents/scripts/*.py` | Tool scripts |

### Files Written

| File | Purpose |
|------|---------|
| None | Read-only validation |

## How to Use

### Direct Execution

```bash
# Run smoke tests
python3 .agents/scripts/agents-tools-smoke.py
```

### Via legacy just command runner

```bash
AFOL-native command pending; do not use legacy just command runners.
```

### In CI/CD

```bash
# Add to CI pipeline
AFOL-native command pending; do not use legacy just command runners.
```

## How to Modify

### Main Functions

```python
def validate_tools_json():
    """Validate tools.json schema."""

def check_tool_references():
    """Verify all tool files exist."""

def run_smoke_tests():
    """Execute CLI smoke tests."""

def check_integration():
    """Verify tool integration."""
```

### Add New Smoke Test

1. Create test function `test_<tool>()`
2. Add to `main()` test suite
3. Update documentation

## Smoke Tests

### Catalog Validation

```python
# Check tools.json is valid JSON
# Check required fields exist
# Check tool IDs are unique
```

### Reference Checks

```python
# Check each tool's script file exists
# Check Make bridge targets exist
# Check wrapper commands work
```

### CLI Tests

```bash
# Test: .agents/agents tools list
# Test: .agents/agents tools info doctor
# Test: .agents/agents tools search validate
```

## Output

### Success

```text
✓ tools.json schema valid
✓ All tool references exist
✓ CLI smoke tests passed
✓ Integration check passed
```

### Failure

```text
❌ tools.json: Missing field 'description'
❌ Tool 'missing-tool': Script not found
❌ CLI test failed: 'agents tools info x' returned 1
```

## Related

- [tools-json.md](./tools-json.md) - Tools catalog
- [agents-tools.md](./agents-tools.md) - Tool discovery

---

*Document: `docs/agentic/agents-tools-smoke.md`*
