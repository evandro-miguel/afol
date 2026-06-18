# Coordination Radar Hook

Use this hook when building context for orchestrator delivery work.

The hook adds a reminder to inspect `afol session radar` before delegating or
editing across governed AFOL sessions. Radar output is advisory context, not a
lock. Agents still need to coordinate overlapping files, task ownership, and
open warnings explicitly.

Suggested checks:

```bash
afol session radar
afol session radar --json
```
