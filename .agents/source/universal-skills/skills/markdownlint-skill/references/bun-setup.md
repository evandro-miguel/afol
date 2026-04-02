---
description: "Bun Setup Guide"
metadata:
  category: tools
  tags: "husky, file-api, refs, ui-components, validation, language, setup, configuration"
---

# Bun Setup Guide

## Prerequisites

- Bun v1.0.0 or higher
- Git repository initialized

## Installation Steps

### 1. Initialize Project

```bash
mkdir my-llm-project
cd my-llm-project
bun init -y
git init
```

### 2. Install Dependencies

```bash
bun add -d markdownlint-cli2 husky lint-staged
```

### 3. Create Configuration

Create `.markdownlint-cli2.jsonc`:

```jsonc
{
  "config": {
    "extends": "markdownlint/style/prettier",
    "line-length": {
      "line_length": 100,
      "heading_line_length": 100,
      "code_block_line_length": 100,
      "strict": true
    },
    "heading-increment": true,
    "heading-style": {
      "style": "atx"
    },
    "fenced-code-language": {
      "language_only": true
    },
    "ul-style": {
      "style": "dash"
    },
    "emphasis-style": {
      "style": "asterisk"
    },
    "strong-style": {
      "style": "asterisk"
    },
    "no-multiple-blanks": {
      "maximum": 1
    }
  },
  "gitignore": true,
  "ignores": [
    "node_modules/**",
    "dist/**",
    "build/**",
    ".next/**",
    "coverage/**"
  ]
}
```

### 4. Configure package.json

```json
{
  "name": "my-llm-project",
  "type": "module",
  "scripts": {
    "lint:md": "markdownlint-cli2 \"**/*.md\" \"#node_modules\" \"#dist\" \"#build\"",
    "lint:md:fix": "markdownlint-cli2 --fix \"**/*.md\" \"#node_modules\" \"#dist\" \"#build\"",
    "prepare": "husky"
  },
  "lint-staged": {
    "*.md": [
      "markdownlint-cli2 --fix",
      "git add"
    ]
  },
  "devDependencies": {
    "husky": "^9.1.7",
    "lint-staged": "^15.4.3",
    "markdownlint-cli2": "^0.17.2"
  }
}
```

### 5. Setup Husky

```bash
bun run prepare
```

Create `.husky/pre-commit`:

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

echo "🔍 Verificando markdown..."
bunx lint-staged
echo "✅ Markdown validado!"
```

Make it executable:

```bash
chmod +x .husky/pre-commit
```

### 6. Test Setup

```bash
# Create a test file
echo "# Test Document" > test.md

# Run linter
bun run lint:md

# Should show no errors for valid file
```

## Verification

Create test fixtures to verify configuration:

**tests/fixtures/valid.md**:
```markdown
# Valid Document

This is a properly formatted document.

## Section

- Item one
- Item two

```javascript
const x = 1;
```
```

**tests/fixtures/invalid.md**:
```markdown
#Invalid

This line is way too long and exceeds the maximum line length limit configured for LLM output.

-   Bad spacing
*   Mixed style
```

Run validation:

```bash
markdownlint-cli2 tests/fixtures/valid.md      # Should pass
markdownlint-cli2 tests/fixtures/invalid.md    # Should fail
```

## Next Steps

- [Configure CI/CD](./llm-pipeline-integration.md)
- [Learn about rules](./rule-reference.md)
- [Troubleshoot issues](./troubleshooting.md)
