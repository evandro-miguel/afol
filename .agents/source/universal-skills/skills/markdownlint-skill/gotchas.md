---
description: "Common Gotchas and Solutions"
metadata:
  category: tools
  tags: "code-review, links, refs, ui-components, file-api, language, lazy-loading, configuration"
---

# Common Gotchas and Solutions

## Installation Issues

### Command not found after installation

**Problem**: `lint-md: command not found`

**Cause**: `~/.local/bin` not in PATH

**Solution**:
```bash
# Add to shell profile (~/.bashrc, ~/.zshrc, etc.)
export PATH="$HOME/.local/bin:$PATH"

# Reload profile
source ~/.bashrc  # or ~/.zshrc
```

**Alternative**: Use full path
```bash
~/.local/bin/lint-md README.md
```

---

## Configuration Issues

### Changes not taking effect

**Problem**: Modified config but linting behavior unchanged

**Cause**: Wrong config file being used

**Solution**: Check which config is active
```bash
# Check with verbose flag
validate-md --verbose

# Or specify config explicitly
lint-md -c ~/.config/llm-markdown/.markdownlint-cli2.jsonc README.md
```

### Local vs Global config confusion

**Problem**: Global config works, local doesn't (or vice versa)

**Cause**: Priority order not understood

**Priority** (highest to lowest):
1. `--config` flag
2. `MARKDOWNLINT_CONFIG` env var
3. Local `.markdownlint-cli2.jsonc`
4. Global `~/.config/llm-markdown/.markdownlint-cli2.jsonc`

**Solution**: Be explicit when testing
```bash
# Force global config
lint-md -c ~/.config/llm-markdown/.markdownlint-cli2.jsonc README.md

# Force local config
lint-md -c ./.markdownlint-cli2.jsonc README.md
```

---

## Linting Issues

### Too many errors on existing files

**Problem**: Running `lint-md` on existing project shows hundreds of errors

**Solutions**:

1. **Auto-fix first**:
```bash
fix-md "**/*.md"
```

2. **Gradual adoption** - Create permissive local config:
```json
{
  "config": {
    "extends": "markdownlint/style/prettier",
    "MD013": false,  // Disable line length temporarily
    "MD024": false   // Disable duplicate heading temporarily
  }
}
```

3. **Ignore legacy files**:
```json
{
  "ignores": [
    "docs/legacy/**",
    "old-*.md"
  ]
}
```

### Line length errors on URLs

**Problem**: Long URLs trigger MD013

**Solution**: Use reference-style links
```markdown
// Instead of:
Check out [this link](https://very-long-url-that-exceeds-the-line-length-limit.com/path/to/resource)

// Use:
Check out [this link][1]

[1]: https://very-long-url-that-exceeds-the-line-length-limit.com/path/to/resource
```

Or disable strict mode:
```json
"line-length": {
  "strict": false,
  "stern": false
}
```

### Prettier conflicts

**Problem**: Prettier and markdownlint fight each other

**Solution**: Use Prettier-compatible base
```json
{
  "config": {
    "extends": "markdownlint/style/prettier"
  }
}
```

Run Prettier first, then markdownlint:
```bash
prettier --write "**/*.md"
lint-md "**/*.md"
```

---

## Fix Issues

### fix-md doesn't fix anything

**Problem**: Running `fix-md` but same errors remain

**Cause**: Errors are not auto-fixable

**Check**: Which rules are fixable
- MD004, MD007, MD009, MD012, MD018, MD019, MD049, MD050 = Fixable
- MD013, MD024, MD041, MD042 = Not fixable

**Solution**: Manual fix for non-auto-fixable rules

### fix-md creates unwanted changes

**Problem**: Auto-fix changes formatting unexpectedly

**Solution**: Preview first
```bash
fix-md "**/*.md" --dry-run
```

Or disable specific rules in config:
```json
{
  "config": {
    "MD004": false  // Disable list style enforcement
  }
}
```

---

## Performance Issues

### lint-md is slow on large projects

**Problem**: Linting takes too long

**Solutions**:

1. **Lint only changed files**:
```bash
# In pre-commit hook
lint-md $(git diff --cached --name-only --diff-filter=ACM | grep '\.md$')
```

2. **Exclude directories**:
```json
{
  "ignores": [
    "node_modules/**",
    "dist/**",
    "build/**",
    "coverage/**"
  ]
}
```

3. **Use quiet mode**:
```bash
lint-md "**/*.md" --quiet
```

---

## CI/CD Issues

### CI fails but local passes

**Problem**: GitHub Actions fails, local machine passes

**Causes**:
1. Different markdownlint-cli2 versions
2. Different configs being used
3. File path differences

**Solutions**:

1. **Pin version**:
```yaml
- run: bun add -g markdownlint-cli2@0.20.0
```

2. **Explicit config**:
```yaml
- run: lint-md -c .markdownlint-cli2.jsonc "**/*.md"
```

3. **Validate first**:
```yaml
- run: validate-md --verbose
- run: lint-md "**/*.md" --strict
```

---

## LLM Integration Issues

### LLM keeps generating invalid markdown

**Problem**: Despite linting, LLM output consistently has errors

**Solutions**:

1. **Add to system prompt**:
```
Always format markdown with:
- Max 100 chars per line
- Use dashes for lists (-)
- Use asterisks for emphasis (*)
- Always specify language in code blocks
- One blank line between sections
```

2. **Post-process all output**:
```bash
# Wrapper script
process_llm_output() {
  local file="$1"
  fix-md "$file"
  lint-md "$file" --strict || echo "Manual review needed: $file"
}
```

3. **Few-shot examples**:
Provide examples of valid/invalid markdown in prompt.

---

## Common Error Messages

### "Cannot find module 'markdownlint/style/prettier'"

**Cause**: markdownlint-cli2 not properly installed

**Solution**:
```bash
bun add -g markdownlint-cli2
validate-md
```

### "ENOENT: no such file or directory"

**Cause**: Glob pattern not matching files

**Solution**: Check pattern syntax
```bash
# Wrong
lint-md *.md  # Shell expands before command

# Right
lint-md "*.md"  # Quotes prevent shell expansion
```

### "EACCES: permission denied"

**Cause**: Commands not executable

**Solution**:
```bash
chmod +x ~/.local/bin/lint-md
chmod +x ~/.local/bin/fix-md
chmod +x ~/.local/bin/validate-md
```

---

## Editor Integration Issues

### Neovim/LazyVim shows different errors than lint-md

**Problem**: Neovim reports MD013 errors on lines that `lint-md` says are correct

**Cause**: Neovim uses `nvim-lint` plugin which may use different configuration or default rules (80 chars instead of 100)

**Solution**: Configure nvim-lint to use your global config

Create `~/.config/nvim/lua/plugins/markdownlint.lua`:
```lua
return {
  {
    "mfussenegger/nvim-lint",
    opts = {
      linters = {
        markdownlint = {
          args = {
            "--config",
            vim.fn.expand("~/.config/llm-markdown/.markdownlint-cli2.jsonc"),
          },
        },
      },
      linters_by_ft = {
        markdown = { "markdownlint" },
      },
    },
  },
}
```

Then restart Neovim or run `:Lazy reload`

### VS Code shows "ambiguous link to document"

**Problem**: VS Code warns about links like `[text](path/file.md)`

**Cause**: VS Code link checker prefers explicit relative paths

**Solution**: Add `./` prefix to all relative links
```markdown
<!-- Instead of: -->
`[Link](references/file.md)`

<!-- Use: -->
`[Link](./references/file.md)`
```

### VS Code/Marksman shows "link to non existent document"

**Problem**: Editor reports `link to non existent document` for local markdown links

**Cause**:
- Link path is wrong relative to the current file
- Target file was renamed or removed
- Link points to a directory instead of an explicit file (`README.md` or `SKILL.md`)

**Solution**:
```markdown
<!-- Prefer explicit relative links -->
`[Windows API](./references/windows-api.md)`
`[Commands Index](./references/commands/README.md)`
```

Quick check for broken local links in one skill:
```bash
skill_dir="skills/markdownlint-skill"
rg -n --pcre2 '\]\((?!https?://|mailto:|#)[^)]+\)' "$skill_dir"
```

If a directory is linked, change it to an explicit target file:
```markdown
<!-- Avoid -->
`Commands -> ./references/commands/`

<!-- Prefer -->
`Commands -> ./references/commands/README.md`
```

### Strict guard fails on `[[wikilink]]`

**Problem**: `links:guard:strict` fails with `MD_WIKILINK_UNSUPPORTED`

**Cause**: strict guard blocks raw wikilinks outside code contexts.

**Solution**:
```bash
# Day-to-day pipeline (recommended for mixed repositories)
bun run lint:docs:full

# Strict pipeline (enforce no raw wikilinks)
bun run lint:docs:full:strict
```

If wikilinks are documentation examples, wrap as inline code:
```markdown
Use `[[Note]]` for examples in generic markdown docs.
```

### Emacs markdown-mode conflicts

**Problem**: Emacs shows different linting results

**Cause**: Emacs may use `markdownlint` npm package directly instead of `markdownlint-cli2`

**Solution**: Configure flycheck/flymake to use `markdownlint-cli2`:
```elisp
(setq flycheck-markdown-markdownlint-executable "markdownlint-cli2")
(setq flycheck-markdown-markdownlint-config "~/.config/llm-markdown/.markdownlint-cli2.jsonc")
```
