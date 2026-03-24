---
id: lesson_20260323_1847_follow_explicit_deletion_policy_for_reproducible_assets
title: Follow explicit deletion policy for reproducible mirrored assets
status: active
created_at: '2026-03-23T18:47:00-03:00'
updated_at: '2026-03-23T18:44:24-03:00'
owner: orchestrator
related_session: 260323_1827_universal-skills-local-source-and-discovery
---

# Lesson: Follow explicit deletion policy for reproducible mirrored assets

## What happened

- I removed overlapping `universal-skills` content from the global Codex skills path, but I first kept an archive copy even though the assets were fully reproducible from the sibling upstream checkout.
- The user clarified that those overlapping assets did not need archival and could be removed outright.

## Prevention Rule

- When the user explicitly approves deletion of reproducible mirrored assets, do not keep an extra archive by default.
- Only preserve an archive when the user asks for rollback safety or when the asset is not trivially recoverable from a declared source of truth.

## Guardrail

- Before performing cleanup of duplicated assets, explicitly classify them as either `reproducible from source` or `unique/local`.
- For `reproducible from source`, prefer direct removal once the user policy is clear.
