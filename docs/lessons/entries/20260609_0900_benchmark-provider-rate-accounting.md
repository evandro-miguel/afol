---
doc_type: lesson_entry
id: 20260609_0900_benchmark-provider-rate-accounting
status: active
created_at: '2026-06-09T09:00:00-03:00'
updated_at: '2026-06-09T09:00:00-03:00'
tags: [benchmark, provider, rate-limiting]
---

# Benchmark Providers Need Explicit Rate Accounting

## Context

During Gemini/Gemma benchmark provider sessions, rate accounting was initially
treated as secondary. The provider needed API rate accounting and validation
coverage after initial implementation.

## Lesson

Rate accounting is part of benchmark provider correctness, not an afterthought.
Tool-enabled benchmark providers need explicit tool ownership and end-to-end
event logging. Provider work should be planned before code changes.

## Prevention

- Include rate-accounting tests in the initial provider implementation.
- Log every request/response/tool event explicitly.
- Plan provider architecture before writing code.
