# AFOL Hooks

This directory is a static, provider-neutral hook catalog.

Hooks describe context contributions that AFOL may include in a context bundle:
messages, tool hints, validation commands, project-structure refs, memory refs,
library refs, and do-not-load guidance.

Hooks do not execute scripts, install plugins, mutate lifecycle state, or restore
the discontinued `.agents/scripts` or `.agents/runtime` surfaces. If a hook
points at a script-like capability, AFOL treats it as advisory text only; the
actual command must still be run explicitly through normal AFOL or user-invoked
tooling.

Minimal entry:

```json
{
  "hooks": [
    {
      "id": "HOOK-EXAMPLE",
      "events": ["context.bundle"],
      "roles": ["reviewer"],
      "surfaces": ["review"],
      "priority": 80,
      "contributions": {
        "messages": ["Check the provider-specific release notes before review."],
        "validation_commands": ["bun test"]
      }
    }
  ]
}
```
