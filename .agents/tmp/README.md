# Temporary Workspace

Use `.agents/tmp/` for temporary files, scratch checkouts, and review artifacts
that do not fit the durable scaffold structure yet.

Rules:

- non-canonical only
- inspect before deleting or replacing anything
- safe to remove only after the payload is proven disposable and its useful
  evidence has been copied into a governed location
- never treat content here as final evidence
- move durable artifacts into `.agents/wb/`, `docs/arc/`, `docs/map/`,
  `docs/knowledge/`, `docs/lessons/`, or another governed location once they
  become real project assets

Current hygiene note:

- This folder currently holds generated reference checkouts and scratch
  captures. Review them before cleanup rather than assuming they are throwaway.
