# 🎨 Backend Structure

**Generated:** 2026-02-27T15:00:37+00:00
**Last Update:** First run

Services, utilities, and business logic.

---

## 📁 Directory Overview

**Stats:** 92 files, 23,371 lines, 843.7 KB

### Files

| File | Lines | Size | Description |
|------|-------|------|-------------|
| `.agents/cache/universal-skills/scripts/skillpool.js` | 984 | 32.9 KB | Module; functionality |
| `.agents/scripts/verify-tasks.py` | 712 | 29.0 KB | Module; functionality |
| `.agents/scripts/agents-telemetry.py` | 662 | 29.4 KB | Module; functionality |
| `.agents/skills/writing-skills/scripts/create-skill.js` | 630 | 16.3 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/writing-skills/scripts/create-skill.js` | 630 | 16.3 KB | Module; functionality |
| `.agents/scripts/agents-wb-update.py` | 553 | 22.2 KB | Module; functionality |
| `.agents/scripts/agents-update/agents-update.py` | 526 | 20.2 KB | Module; functionality |
| `.agents/scripts/agents-tools.py` | 516 | 19.3 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/inline-task-planner/scripts/inline_tasks.ts` | 470 | 14.4 KB | Module; functionality |
| `.agents/skills/writing-skills/scripts/check-skill.js` | 454 | 13.0 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/writing-skills/scripts/check-skill.js` | 454 | 13.0 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/ux-skill/scripts/design_system.py` | 418 | 20.4 KB | Module; functionality |
| `.agents/skills/writing-skills/scripts/skill-advisor.js` | 417 | 12.0 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/writing-skills/scripts/skill-advisor.js` | 417 | 12.0 KB | Module; functionality |
| `.agents/scripts/agents-structure-map.py` | 413 | 16.7 KB | Module; functionality |
| `.agents/scripts/agents-lint-docs.py` | 408 | 16.3 KB | Module; functionality |
| `C:/Users/evand/.claude/plugins/marketplaces/claude-plugins-official/plugins/skill-creator/skills/skill-creator/eval-viewer/generate_review.py` | 407 | 16.0 KB | Module; functionality |
| `.agents/scripts/agents-new.py` | 392 | 15.9 KB | Module; functionality |
| `.agents/scripts/agents-doctor.py` | 381 | 14.6 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/product-manager-toolkit/scripts/customer_interview_analyzer.py` | 363 | 16.7 KB | Module; functionality |
| `.agents/scripts/agents-patterns.py` | 355 | 14.1 KB | Module; functionality |
| `.agents/scripts/agents-update/conflict.py` | 354 | 13.7 KB | Module; functionality |
| `.agents/skills/writing-skills/scripts/fix-skill.js` | 339 | 9.9 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/writing-skills/scripts/fix-skill.js` | 339 | 9.9 KB | Module; functionality |
| `C:/Users/evand/.claude/plugins/marketplaces/claude-plugins-official/plugins/skill-creator/skills/skill-creator/scripts/aggregate_benchmark.py` | 334 | 14.0 KB | Module; functionality |
| `.agents/scripts/agents-update/backup.py` | 324 | 12.9 KB | Module; functionality |
| `.agents/scripts/check-links.py` | 319 | 11.4 KB | Module; functionality |
| `.agents/cache/universal-skills/scripts/universal-contract.js` | 313 | 9.1 KB | Module; functionality |
| `.agents/scripts/agents-bootstrap.py` | 295 | 10.8 KB | Module; functionality |
| `C:/Users/evand/.claude/plugins/marketplaces/claude-plugins-official/plugins/skill-creator/skills/skill-creator/scripts/generate_report.py` | 287 | 12.5 KB | Module; functionality |
| `.agents/cache/universal-skills/scripts/doctor-all.js` | 286 | 8.6 KB | Module; functionality |
| `C:/Users/evand/.claude/plugins/marketplaces/claude-plugins-official/plugins/skill-creator/skills/skill-creator/scripts/run_loop.py` | 284 | 13.4 KB | Module; functionality |
| `.agents/skills/writing-skills/scripts/check-universal-skills-sync.js` | 278 | 8.3 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/writing-skills/scripts/check-universal-skills-sync.js` | 278 | 8.3 KB | Module; functionality |
| `.agents/scripts/agents-skills-sync.py` | 272 | 10.0 KB | Module; functionality |
| `C:/Users/evand/.claude/plugins/marketplaces/claude-plugins-official/plugins/skill-creator/skills/skill-creator/scripts/run_eval.py` | 266 | 11.2 KB | Module; functionality |
| `.agents/scripts/agents-update/upstream.py` | 264 | 10.1 KB | Module; functionality |
| `.agents/scripts/agents-update/manifest.py` | 261 | 9.4 KB | Module; functionality |
| `C:/Users/evand/.claude/plugins/marketplaces/claude-plugins-official/plugins/hookify/core/rule_engine.py` | 259 | 10.5 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/product-manager-toolkit/scripts/rice_prioritizer.py` | 250 | 11.6 KB | Module; functionality |
| `C:/Users/evand/.claude/plugins/marketplaces/claude-plugins-official/plugins/hookify/core/config_loader.py` | 243 | 9.5 KB | Module; functionality |
| `.agents/cache/universal-skills/scripts/publish-skill.js` | 241 | 8.0 KB | Module; functionality |
| `C:/Users/evand/.claude/plugins/marketplaces/claude-plugins-official/.github/scripts/validate-frontmatter.ts` | 235 | 7.2 KB | Module; functionality |
| `.agents/scripts/agents-update/swap.py` | 232 | 9.0 KB | Module; functionality |
| `.agents/cache/universal-skills/scripts/release-prepare.js` | 232 | 6.9 KB | Module; functionality |
| `C:/Users/evand/.claude/plugins/marketplaces/claude-plugins-official/plugins/security-guidance/hooks/security_reminder_hook.py` | 229 | 10.5 KB | Module; functionality |
| `.agents/scripts/agents-update/ownership.py` | 223 | 8.3 KB | Module; functionality |
| `.agents/cache/universal-skills/scripts/ensure-skill.js` | 221 | 6.8 KB | Module; functionality |
| `.agents/cache/universal-skills/scripts/quick-install.js` | 220 | 7.1 KB | Module; functionality |
| `.agents/scripts/agents-update/lock.py` | 214 | 7.5 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/ux-skill/scripts/core.py` | 214 | 10.1 KB | Module; functionality |
| `.agents/scripts/fix-lint-all.py` | 212 | 8.7 KB | Module; functionality |
| `C:/Users/evand/.claude/plugins/marketplaces/claude-plugins-official/plugins/skill-creator/skills/skill-creator/scripts/improve_description.py` | 205 | 10.5 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/inline-task-planner/scripts/old_inline_tasks.js` | 199 | 5.4 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/inline-task-planner/scripts/inline_tasks.js` | 195 | 5.4 KB | Module; functionality |
| `.agents/scripts/agents-fix-symlinks.py` | 192 | 6.7 KB | Module; functionality |
| `.agents/cache/universal-skills/scripts/bootstrap-skills.js` | 191 | 5.7 KB | Module; functionality |
| `.agents/scripts/sync-agent-docs.py` | 183 | 7.5 KB | Module; functionality |
| `.agents/cache/universal-skills/scripts/sync-skills.js` | 183 | 5.6 KB | Module; functionality |
| `.agents/scripts/agents-index.py` | 179 | 6.5 KB | Module; functionality |
| `.agents/scripts/agents-update/version.py` | 179 | 6.4 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/seo-audit/references/seo-fundamentals/scripts/seo_checker.py` | 170 | 6.4 KB | Module; functionality |
| `.agents/scripts/agents-update/staging.py` | 169 | 7.1 KB | Module; functionality |
| `.agents/cache/universal-skills/scripts/normalize-skill-frontmatter.js` | 168 | 5.0 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/personal-security/scripts/clean_codex_sessions.py` | 167 | 6.2 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/typescript-skill/scripts/ts_diagnostic.py` | 166 | 6.1 KB | Module; functionality |
| `.agents/cache/universal-skills/scripts/source-checksum.js` | 160 | 4.2 KB | Module; functionality |
| `.agents/scripts/lib/agents_config.py` | 154 | 5.5 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/doc-standards/cli.ts` | 151 | 4.8 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/systematic-debugging/condition-based-waiting-example.ts` | 144 | 4.9 KB | Module; functionality |
| `.agents/scripts/fix-lint-doctypes.py` | 137 | 5.6 KB | Module; functionality |
| `.agents/scripts/fix-lint-checkboxes.py` | 122 | 4.4 KB | Module; functionality |
| `.agents/cache/universal-skills/scripts/smoke-adapters.js` | 115 | 3.1 KB | Module; functionality |
| `.agents/cache/universal-skills/scripts/install-skills.js` | 113 | 3.1 KB | Module; functionality |
| `.agents/scripts/fix-lint-frontmatter.py` | 112 | 4.0 KB | Module; functionality |
| `.agents/cache/universal-skills/scripts/upgrade-project.js` | 111 | 2.9 KB | Module; functionality |
| `C:/Users/evand/.claude/plugins/marketplaces/claude-plugins-official/plugins/skill-creator/skills/skill-creator/scripts/package_skill.py` | 109 | 4.1 KB | Module; functionality |
| `.agents/scripts/migrate-task-board.py` | 87 | 3.9 KB | Module; functionality |
| `C:/Users/evand/.claude/plugins/marketplaces/claude-plugins-official/plugins/skill-creator/skills/skill-creator/scripts/quick_validate.py` | 87 | 3.9 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/ux-skill/scripts/search.py` | 65 | 3.2 KB | Module; functionality |
| `.agents/scripts/agents-tools-smoke.py` | 57 | 2.3 KB | Module; functionality |
| `C:/Users/evand/.claude/plugins/marketplaces/claude-plugins-official/plugins/hookify/hooks/pretooluse.py` | 51 | 1.8 KB | Module; functionality |
| `C:/Users/evand/.claude/plugins/marketplaces/claude-plugins-official/plugins/hookify/hooks/posttooluse.py` | 48 | 1.6 KB | Module; functionality |
| `C:/Users/evand/.claude/plugins/marketplaces/claude-plugins-official/plugins/hookify/hooks/stop.py` | 42 | 1.4 KB | Module; functionality |
| `C:/Users/evand/.claude/plugins/marketplaces/claude-plugins-official/plugins/hookify/hooks/userpromptsubmit.py` | 41 | 1.4 KB | Custom hook; reusable logic |
| `C:/Users/evand/.claude/plugins/marketplaces/claude-plugins-official/plugins/skill-creator/skills/skill-creator/scripts/utils.py` | 38 | 1.6 KB | Module; functionality |
| `.agents/scripts/lib/__init__.py` | 1 | 0.1 KB | Module; functionality |
| `C:/Users/evand/.claude/plugins/marketplaces/claude-plugins-official/plugins/skill-creator/skills/skill-creator/scripts/__init__.py` | 0 | 0.0 KB | Module; functionality |
| `C:/Users/evand/.claude/plugins/marketplaces/claude-plugins-official/plugins/hookify/core/__init__.py` | 0 | 0.0 KB | Module; functionality |
| `C:/Users/evand/.claude/plugins/marketplaces/claude-plugins-official/plugins/hookify/matchers/__init__.py` | 0 | 0.0 KB | Module; functionality |
| `C:/Users/evand/.claude/plugins/marketplaces/claude-plugins-official/plugins/hookify/hooks/__init__.py` | 0 | 0.0 KB | Module; functionality |
| `C:/Users/evand/.claude/plugins/marketplaces/claude-plugins-official/plugins/hookify/utils/__init__.py` | 0 | 0.0 KB | Module; functionality |

---
*Generated by `agents-structure-map.py`*
