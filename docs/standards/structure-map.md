---
doc_type: standard
id: structure-map-standard
status: active
created_at: '2026-02-23T00:00:00Z'
updated_at: '2026-04-13T13:36:54-03:00'
---

# Structure Map Standard

## Purpose

Define the strategy for auto-generating project structure documentation using `agents-structure-map.py`.

This standard covers the lightweight physical-layout current-state evidence
under `docs/map/structure/`.
If a repository also adopts `docs/map/`, treat `structure/` as one
current-state evidence surface within that map, not as the goal-state canon.

## Overview

This standard establishes a **hybrid approach**:

| Approach | Tool | Purpose | When |
|----------|------|---------|------|
| **Auto-generated** | `agents-structure-map.py` | File inventory, line counts, descriptions | Large projects (200+ files) |
| **Manual** | `docs/templates/structure.md` | Conventions, rules, import patterns | All projects |

## Relationship to `docs/map/`

- `docs/map/structure/` documents the **physical structure** of the current
  repository as current-state evidence.
- `docs/map/` may hold a broader **current-state** surface, such as module
  maps, API maps, dependency views, and codemap-style artifacts.
- Use `.agents/agents repo-map` for the full codemap workflow described in [repo-map.md](repo-map.md).
- Neither `structure/` nor `map/` replaces roadmap/spec governance.
- Desired architecture, product intent, roadmap, and specs remain outside `docs/map/`.

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
python .agents/scripts/agents-structure-map.py . --output docs/map/structure/

# Example: External project
python .agents/scripts/agents-structure-map.py /path/to/example-project --output docs/map/structure/
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
| tests | tests, specs, **tests**, e2e, integration | .test.ts, .test.tsx, .spec.ts, .test.py |
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

**Default**: `docs/map/structure/`

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
python .agents/scripts/agents-structure-map.py . --output docs/map/structure/

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

### Example 2: Large Project

```bash
$ python .agents/scripts/agents-structure-map.py /path/to/example-project --output .agent/docs/structure-auto/

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
$ python .agents/scripts/agents-structure-map.py . --output docs/map/structure/

✓ Loaded cache: 719 entries
Scanning: /path/to/example-project
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
python .agents/scripts/agents-structure-map.py . --output docs/map/structure/
```

### Cache Not Working

**Cause**: Cache file missing or corrupted

**Fix**:

```bash
# Delete cache and regenerate
rm docs/map/structure/.structure-cache.json
python .agents/scripts/agents-structure-map.py . --output docs/map/structure/
```

### Wrong Classification

**Options**:

1. Manually edit the `.md` file
2. Modify `classify_file()` logic in script
3. Add custom section for project-specific patterns

## Related Documents

- `docs/map/structure/README.md` - Structure folder overview
- `docs/templates/structure.md` - Manual structure template
- `.agents/scripts/README.md` - All available scripts
- `docs/standards/workflow.md` - General workflow standard

---

*Standard: `docs/standards/structure-map.md`*
