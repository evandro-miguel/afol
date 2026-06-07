---
id: TOOL-020
theme: check-links
type: tool-doc
status: active
owner: system
created_at: '2026-02-23T00:00:00Z'
updated_at: '2026-04-13T19:36:54-03:00'
links:
  tools_json: ./tools-json.md
  lint_docs: ./agents-lint-docs.md
---

# check-links.py - Broken Link Detector

## Why It Exists

**Problem:** Markdown documentation can accumulate broken links over time:

- Files moved or renamed
- Directories restructured
- Typos in link paths
- External links become stale

**Solution:** Automated link checker that scans markdown files and reports broken links.

## Function

Scans and validates links:

1. **Extract links** - Finds all markdown, HTML, and image links
2. **Resolve paths** - Converts relative links to absolute paths
3. **Validate targets** - Checks if link targets exist
4. **Report issues** - Generates detailed broken link report
5. **Fix script** - Can generate helper script for fixes

## What It Touches

### Files Read

| File | Purpose |
|------|---------|
| `**/*.md` | Markdown files to scan |
| Link targets | Validates existence |

### Files Written

| File | Purpose |
|------|---------|
| None (default) | Read-only check |
| `fix_links.sh` (with --fix) | Fix helper script |
| Report file (with --output) | Saved report |

## How to Use

### Basic Usage

```bash
# Check default directory (docs/)
python3 .agents/scripts/check-links.py

# Check specific directory
python3 .agents/scripts/check-links.py docs/agentic/

# Check multiple directories
python3 .agents/scripts/check-links.py docs/ docs/arc/
```

### Options

```bash
# Verbose mode - show all links
python3 .agents/scripts/check-links.py --verbose

# Quiet mode - only broken links
python3 .agents/scripts/check-links.py --quiet

# Generate fix script
python3 .agents/scripts/check-links.py --fix

# Save report to file
python3 .agents/scripts/check-links.py --output report.txt
```

### Via legacy just command runner (add target)

```just
# Add to legacy just command runner:
check-links:
  python3 .agents/scripts/check-links.py

check-links-verbose:
  python3 .agents/scripts/check-links.py --verbose
```

## Output Examples

### Success

```text
Checking docs/...

============================================================
LINK CHECK REPORT
============================================================

Total links checked: 110
Valid links: 110
Broken links: 0

✅ All links are valid!
============================================================
```

### Broken Links Found

```text
Checking docs/...

============================================================
LINK CHECK REPORT
============================================================

Total links checked: 110
Valid links: 107
Broken links: 3

BROKEN LINKS:
------------------------------------------------------------

docs/templates/task.md:
  Line 36: ../standards/checkbox-protocol.md
    Reason: Target not found
  Line 43: ../lessons/general-lessons.md
    Reason: Target not found

============================================================
❌ Found 3 broken link(s)
============================================================
```

### Verbose Mode

```text
Checking docs/agentic/...
  ✓ docs/agentic/agents-tools.md:25 ./tools-json.md (File exists)
  ✓ docs/agentic/agents-doctor.md:30 ./agents-config.md (File exists)
  ✗ docs/agentic/INDEX.md:50 ./missing.md (Target not found)
```

## Link Types Checked

| Type | Pattern | Example |
|------|---------|---------|
| Markdown | `[text](url)` | `[Guide](file.md)` |
| Images | `![alt](url)` | `![Logo](image.png)` |
| HTML | `href` attribute | `page.html` |

## Link Resolution

### Skipped (Not Checked)

- External links (`http://`, `https://`)
- Email links (`mailto:`)
- Anchor links (`#section`)
- FTP links (`ftp://`)

### Checked

- Relative paths (`./file.md`, `../dir/file.md`)
- Directory links (`./docs/`)
- Root-relative paths (`/docs/file.md`)

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All links valid |
| `1` | Broken links found |
| `2` | Configuration or execution error |

## How to Modify

### Main Functions

```python
def extract_links(content, filepath):
    """Extract all links from markdown content."""

def resolve_link(link, current_file):
    """Resolve relative link to absolute path."""

def check_link(link_path):
    """Check if link target exists."""

def check_directory(directory, verbose):
    """Check all markdown files in directory."""
```

### Add New Link Pattern

Edit `extract_links()` function:

```python
# Add new regex pattern
new_pattern = re.compile(r'your-pattern')

for match in new_pattern.finditer(line):
    url = match.group(1)
    links.append((line_num, url))
```

## Integration

### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

python3 .agents/scripts/check-links.py --quiet
if [ $? -ne 0 ]; then
    echo "❌ Broken links found. Fix before commit."
    exit 1
fi
```

### CI/CD Pipeline

```yaml
# GitHub Actions example
- name: Check links
  run: python3 .agents/scripts/check-links.py --quiet
```

### With lint-md

```bash
# Run both checks
lint-md "**/*.md" --strict && \
python3 .agents/scripts/check-links.py --quiet
```

## Related

- [agents-lint-docs.md](./agents-lint-docs.md) - Markdown linting
- [tools-json.md](./tools-json.md) - Tool catalog

---

*Document: `docs/agentic/check-links.md`*
