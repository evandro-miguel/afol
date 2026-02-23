---
doc_type: standard
id: "structure-map-standard"
status: active
created_at: "2026-02-23T00:00:00Z"
updated_at: "2026-02-23T00:00:00Z"
---

# Structure Map Standard

## Purpose

Define the strategy for auto-generating project structure documentation using `agents-structure-map.py`.

## Overview

This standard establishes a **hybrid approach**:

| Approach | Tool | Purpose | When |
|----------|------|---------|------|
| **Auto-generated** | `agents-structure-map.py` | File inventory, line counts, descriptions | Large projects (200+ files) |
| **Manual** | `TEMPLATE_structure.md` | Conventions, rules, import patterns | All projects |

## Script: agents-structure-map.py

### What It Does

- Scans project directory recursively
- Classifies files into sections (frontend, backend, types, tests, data)
- Generates markdown documentation with:
  - File inventory
  - Line counts and sizes
  - Auto-generated descriptions
- Uses cache for incremental updates

### Usage

```bash
# First run (full scan)
python .agents/scripts/agents-structure-map.py <project-path> --output <output-dir>

# Example: Current project
python .agents/scripts/agents-structure-map.py . --output .agents/arc/structure/

# Example: External project
python .agents/scripts/agents-structure-map.py /home/ozy/apps/gre-test-app --output .agents/arc/structure/
```

### Output Files

| File | Content |
|------|---------|
| `README.md` | Overview with metrics, section links |
| `frontend.md` | Components, hooks, UI (tsx/jsx/vue) |
| `backend.md` | Services, utils, API (ts/js/py/go) |
| `types.md` | Type definitions (ts/d.ts) |
| `tests.md` | Test files (test.ts/spec.ts) |
| `data.md` | Data, constants, config (json/ts) |
| `.structure-cache.json` | Cache for incremental updates |

### File Classification

| Section | Path Patterns | Extensions |
|---------|---------------|------------|
| frontend | components, hooks, pages, views, ui, screens, features | .tsx, .jsx, .vue, .svelte |
| backend | services, api, controllers, routes, utils, lib, core, domain | .ts, .js, .py, .go, .rs, .java |
| types | types, interfaces, models, schemas, entities | .ts, .tsx, .d.ts |
| tests | tests, specs, __tests__, e2e, integration | .test.ts, .test.tsx, .spec.ts, .test.py |
| data | data, constants, config, fixtures, mocks | .json, .ts, .js |

### Description Generation

Descriptions are generated heuristically:

| Naming Pattern | Generated Description |
|----------------|----------------------|
| `*View.tsx` | View component; view component (stateful) |
| `*Page.tsx` | Page component; view component (stateful) |
| `*Controller.ts` | Controller; handles business logic (stateful) |
| `*Service.ts` | Service; external API integration |
| `use*.tsx` | Custom hook; reusable logic |
| `*Model.ts` | Data model; schema definition |
| `*.test.ts` | Test file; unit tests |
| `*Utils.ts` | Utilities; helper functions |

### Incremental Updates

The script uses a cache system:

1. **First run**: Full scan, all files processed
2. **Subsequent runs**:
   - Load `.structure-cache.json`
   - Compare file hashes
   - Only regenerate changed files
   - Update cache

**Benefit**: Fast updates on large projects.

## Strategy

### When to Run

| Trigger | Action |
|---------|--------|
| New project setup | Run full scan |
| After major refactor | Run incremental update |
| Before documentation audit | Run full scan |
| Weekly (optional) | Run incremental |

### Where to Store

**Default**: `.agents/arc/structure/`

**Alternative**: `<project>/.agent/docs/structure/` (project-specific)

### What to Commit

- ✅ `README.md` - Main index
- ✅ `*.md` - Section files
- ✅ `.structure-cache.json` - Cache for incremental updates

### Integration with Workflow

```bash
# 1. Create workstream
python .agents/scripts/agents-new.py my-feature --spec

# 2. Implement feature...

# 3. After major changes, update structure
python .agents/scripts/agents-structure-map.py . --output .agents/arc/structure/

# 4. Validate
python .agents/scripts/agents-doctor.py

# 5. Update indexes
python .agents/scripts/agents-index.py
```

## Examples

### Example 1: Small Project (< 50 files)

```bash
$ python .agents/scripts/agents-structure-map.py ./my-app --output docs/

============================================================
SUMMARY
============================================================
Total files documented: 45
Total lines: 8,234

Sections:
  frontend: 25 files
  backend: 12 files
  types: 5 files
  tests: 3 files
```

### Example 2: Large Project (gre-test-app)

```bash
$ python .agents/scripts/agents-structure-map.py /home/ozy/apps/gre-test-app --output .agent/docs/structure-auto/

============================================================
SUMMARY
============================================================
Total files documented: 719
Total lines: 620,484

Sections:
  data: 296 files
  backend: 210 files
  frontend: 184 files
  types: 16 files
  tests: 13 files
```

### Example 3: Incremental Update

```bash
$ python .agents/scripts/agents-structure-map.py . --output .agents/arc/structure/

✓ Loaded cache: 719 entries
Scanning: /home/ozy/apps/gre-test-app
✓ Created: README.md
✓ Created: frontend.md
...
✓ Saved cache: 719 entries
```

## Customization

### Add Custom Section

Edit `DEFAULT_SECTIONS` in `agents-structure-map.py`:

```python
"mobile": {
    "patterns": ["mobile", "native", "react-native"],
    "extensions": [".tsx", ".ts"],
    "title": "Mobile",
    "description": "React Native components",
}
```

### Override Descriptions

After generation, manually edit `.md` files to refine descriptions.

### Change Classification Logic

Modify `classify_file()` method in the script.

## Best Practices

1. **Run after major refactors** - Keep docs current
2. **Review auto-generated descriptions** - May need refinement
3. **Commit cache file** - `.structure-cache.json` should be versioned
4. **Combine with manual docs** - Auto for inventory, manual for conventions
5. **Skip node_modules** - Script already excludes common ignore folders

## Troubleshooting

### No Files Found

**Cause**: Wrong path or running from inside `.agents/`

**Fix**:
```bash
# Run from project root
cd /path/to/project
python .agents/scripts/agents-structure-map.py . --output .agents/arc/structure/
```

### Cache Not Working

**Cause**: Cache file missing or corrupted

**Fix**:
```bash
# Delete cache and regenerate
rm .agents/arc/structure/.structure-cache.json
python .agents/scripts/agents-structure-map.py . --output .agents/arc/structure/
```

### Wrong Classification

**Options**:
1. Manually edit the `.md` file
2. Modify `classify_file()` logic in script
3. Add custom section for project-specific patterns

## Related Documents

- `.agents/arc/structure/README.md` - Structure folder overview
- `.agents/arc/structure/TEMPLATE_structure.md` - Manual structure template
- `.agents/scripts/README.md` - All available scripts
- `.agents/a-docs/standards/workflow.md` - General workflow standard

---
*Standard: `.agents/a-docs/standards/structure-map.md`*
