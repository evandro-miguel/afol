---
description: "LLM Pipeline Integration"
metadata:
  category: tools
  tags: "husky, file-api, ui-components, services, validation, images, setup, configuration"
---

# LLM Pipeline Integration

## Overview

Integrate markdownlint into your LLM pipeline to ensure consistent output quality.

## Integration Patterns

### Pattern 1: Post-Processing Hook

Process LLM output before saving/using:

```typescript
// src/llm-markdown-processor.ts
import { $ } from 'bun';

export interface ProcessOptions {
  content: string;
  autoFix?: boolean;
  strict?: boolean;
}

export async function processLLMMarkdown(options: ProcessOptions) {
  const { content, autoFix = true, strict = false } = options;
  
  const tempFile = `/tmp/llm-${Date.now()}.md`;
  await Bun.write(tempFile, content);
  
  try {
    if (autoFix) {
      await $`markdownlint-cli2 --fix ${tempFile}`;
    }
    
    await $`markdownlint-cli2 ${tempFile}`;
    
    const processed = await Bun.file(tempFile).text();
    await $`rm ${tempFile}`;
    
    return { success: true, content: processed };
  } catch (error) {
    await $`rm -f ${tempFile}`;
    
    if (strict) {
      throw new Error('Markdown validation failed');
    }
    
    return { success: false, content };
  }
}
```

Usage:

```typescript
const result = await processLLMMarkdown({
  content: llmOutput,
  autoFix: true,
  strict: true
});

if (result.success) {
  saveDocument(result.content);
} else {
  retryWithBetterPrompt();
}
```

### Pattern 2: Git Pre-commit Hook

Automatically fix markdown on commit:

**.husky/pre-commit**:
```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

bunx lint-staged
```

**package.json**:
```json
{
  "lint-staged": {
    "*.md": [
      "markdownlint-cli2 --fix",
      "git add"
    ]
  }
}
```

### Pattern 3: CI/CD Gate

Block PRs with invalid markdown:

**.github/workflows/markdown.yml**:
```yaml
name: Markdown Lint
on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run lint:md
      - run: bun run lint:md:check
```

### Pattern 4: Docker Integration

Include in Docker build:

**Dockerfile**:
```dockerfile
FROM oven/bun:1

WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install

COPY . .
RUN bun run lint:md

CMD ["bun", "run", "start"]
```

## CI/CD Examples

### GitHub Actions

```yaml
name: LLM Markdown Standard

on:
  push:
    branches: [main]
    paths:
      - '**.md'
  pull_request:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest
      
      - name: Install dependencies
        run: bun install
      
      - name: Run markdownlint
        run: bun run lint:md
      
      - name: Validate configuration
        run: bun run lint:md:check
```

### GitLab CI

```yaml
markdownlint:
  stage: lint
  image: oven/bun:1
  script:
    - bun install
    - bun run lint:md
  only:
    changes:
      - "**/*.md"
```

### Docker Compose

```yaml
version: '3'
services:
  lint:
    build:
      context: .
      dockerfile: Dockerfile.lint
    volumes:
      - .:/app
    command: bun run lint:md
```

## Best Practices

1. **Fail Fast**: Run lint early in CI pipeline
2. **Auto-fix**: Enable auto-fix in pre-commit hooks
3. **Caching**: Cache `node_modules` in CI
4. **Selective Runs**: Only lint changed files with `lint-staged`
5. **Strict Mode**: Use `--strict` for production content

## Performance Tips

- Use `gitignore: true` to skip ignored files
- Limit `line_length` to reduce processing time
- Use `noInlineConfig: false` for faster parsing
- Run `lint-staged` instead of full lint in pre-commit

## Monitoring

Track lint metrics over time:

```bash
# Count violations by rule
bun run lint:md 2>&1 | grep -oE 'MD\d+' | sort | uniq -c | sort -rn

# Track fix rate
bun run lint:md:fix && bun run lint:md | wc -l
```
