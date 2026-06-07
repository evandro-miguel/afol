# Plans

Versioned execution plans live here.

Use this directory for durable ExecPlans that should survive local runtime
state cleanup. Runtime pointers, events, caches, and session-local operational
state stay under `.agents/data/` or the configured mutable directory.

Legacy `.agents/wb/` content is discontinued and local-only.
