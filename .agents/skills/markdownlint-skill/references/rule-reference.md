---
description: "Rule Reference"
metadata:
  category: tools
  tags: "links, refs, ui-components, file-api, images, language, configuration, tables"
---

# Rule Reference

## Core Rules for LLM Standardization

### Line Length (MD013)

**Purpose**: Ensure consistent line wrapping

**Configuration**:
```jsonc
"line-length": {
  "line_length": 100,
  "heading_line_length": 100,
  "code_block_line_length": 100,
  "strict": true,
  "stern": true
}
```

**Why for LLMs**: Forces consistent wrapping that improves readability and diff clarity.

---

### Heading Increment (MD001)

**Purpose**: Headings must increment by one level

**Example**:
```markdown
# Level 1 ✓
## Level 2 ✓
### Level 3 ✓

# Level 1 ✓
### Level 3 ✗ (skips Level 2)
```

**Why for LLMs**: Ensures logical document structure.

---

### First Line Heading (MD041)

**Purpose**: First line must be a top-level heading

**Example**:
```markdown
# Document Title ✓

Content here...

This is content without heading ✗
```

**Why for LLMs**: Standardizes document start format.

---

### Fenced Code Language (MD040)

**Purpose**: Code blocks must specify language

**Example**:
```markdown
```javascript ✓
const x = 1;
```

``` ✗ (missing language)
some code
```
```

**Why for LLMs**: Enables syntax highlighting and better code understanding.

---

### UL Style (MD004)

**Purpose**: Consistent unordered list markers

**Configuration**:
```jsonc
"ul-style": {
  "style": "dash"  // Use - instead of * or +
}
```

**Example**:
```markdown
- Item one ✓
- Item two ✓

* Item one ✗
+ Item one ✗
```

**Why for LLMs**: Consistent list formatting across all outputs.

---

### Emphasis Style (MD049)

**Purpose**: Consistent emphasis markers

**Configuration**:
```jsonc
"emphasis-style": {
  "style": "asterisk"  // Use * instead of _
}
```

**Example**:
```markdown
*emphasis* ✓
_emphasis_ ✗
```

---

### Strong Style (MD050)

**Purpose**: Consistent strong markers

**Configuration**:
```jsonc
"strong-style": {
  "style": "asterisk"  // Use ** instead of __
}
```

**Example**:
```markdown
**strong** ✓
__strong__ ✗
```

---

### No Multiple Blanks (MD012)

**Purpose**: Limit consecutive blank lines

**Configuration**:
```jsonc
"no-multiple-blanks": {
  "maximum": 1
}
```

**Example**:
```markdown
Paragraph one

Paragraph two ✓


Paragraph three ✗ (two blank lines)
```

---

### Blanks Around Headings (MD022)

**Purpose**: Headings must have blank lines around them

**Example**:
```markdown
Text

## Heading ✓

More text

Text
## Heading ✗ (missing blank line before)
```

---

## Complete Rule List

| Code | Rule | Auto-fix | Severity |
|------|------|----------|----------|
| MD001 | heading-increment | No | Error |
| MD003 | heading-style | Yes | Error |
| MD004 | ul-style | Yes | Error |
| MD005 | list-indent | No | Error |
| MD007 | ul-indent | Yes | Error |
| MD009 | no-trailing-spaces | Yes | Error |
| MD010 | no-hard-tabs | Yes | Error |
| MD012 | no-multiple-blanks | Yes | Error |
| MD013 | line-length | No | Error |
| MD018 | no-missing-space-atx | Yes | Error |
| MD019 | no-multiple-space-atx | Yes | Error |
| MD022 | blanks-around-headings | Yes | Error |
| MD024 | no-duplicate-heading | No | Error |
| MD025 | single-title | No | Error |
| MD026 | no-trailing-punctuation | No | Warning |
| MD030 | list-marker-space | Yes | Error |
| MD031 | blanks-around-fences | Yes | Error |
| MD032 | blanks-around-lists | Yes | Error |
| MD033 | no-inline-html | No | Warning |
| MD034 | no-bare-urls | Yes | Warning |
| MD035 | hr-style | Yes | Error |
| MD036 | no-emphasis-as-heading | No | Warning |
| MD037 | no-space-in-emphasis | Yes | Error |
| MD038 | no-space-in-code | Yes | Error |
| MD039 | no-space-in-links | Yes | Error |
| MD040 | fenced-code-language | No | Error |
| MD041 | first-line-heading | No | Error |
| MD042 | no-empty-links | No | Error |
| MD043 | required-headings | No | Error |
| MD044 | proper-names | No | Warning |
| MD045 | no-alt-text | No | Warning |
| MD046 | code-block-style | Yes | Error |
| MD047 | single-trailing-newline | Yes | Error |
| MD048 | code-fence-style | Yes | Error |
| MD049 | emphasis-style | Yes | Error |
| MD050 | strong-style | Yes | Error |
| MD051 | link-fragments | No | Error |
| MD052 | reference-links-images | No | Error |
| MD053 | link-image-reference-definitions | Yes | Error |
| MD054 | link-image-style | No | Warning |
| MD055 | table-pipe-style | Yes | Error |
| MD056 | table-column-count | No | Error |
| MD058 | blanks-around-tables | Yes | Error |
| MD059 | valid-reference-links | No | Error |
| MD060 | non-literal-fence-labels | No | Warning |

## Disabling Rules

### Inline (not recommended for LLM standardization)

```markdown
<!-- markdownlint-disable MD013 -->
This line can be longer than the limit.
<!-- markdownlint-enable MD013 -->
```

### In Configuration

```jsonc
{
  "config": {
    "MD013": false,  // Disable line length
    "MD033": false   // Allow inline HTML
  }
}
```

### For Specific Files

```jsonc
{
  "ignores": [
    "CHANGELOG.md",
    "LICENSE.md"
  ]
}
```
