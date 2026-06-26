# Rule Body Budget Hook

Use this hook when context is built for creating or editing files under
`.afol/adm/rules/**/*.md`.

The hook reminds agents that YAML frontmatter is metadata only. AFOL rule
character budgets and injected prompt content use the Markdown body after the
frontmatter fence. Enforceable guidance must live in the body, stay compact, and
avoid duplicating body instructions in YAML.

Suggested check:

```bash
bun test cli/tests/rule-command.test.ts cli/tests/context-system.test.ts
```
