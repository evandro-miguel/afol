# Plans

Versioned execution plans and governed task evidence live here.

Use this directory for durable ExecPlans and workbench artifacts that should
survive local runtime state cleanup. The active-session pointer is
`.afol/wb/.active_session`; events, caches, indexes, and disposable runtime
state stay under `.afol/data/` or the configured mutable data directory.

Legacy `.agents/wb/` content is discontinued and local-only.
