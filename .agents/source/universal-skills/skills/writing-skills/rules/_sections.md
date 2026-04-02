---
description: Rule groups and impact levels for writing-skills.
metadata:
  tags: "rules, sections, impact, tier-1, tier-2, tier-3"
---

# Sections

This file defines all sections, their ordering, impact levels, and descriptions.
The section ID (in parentheses) is the filename prefix used to group rules.

---

## 1. Frontmatter Compliance (frontmatter)

**Impact:** CRITICAL  
**Applies to:** Tier 1, Tier 2, Tier 3  
**Description:** Every markdown file must have valid frontmatter. Missing or malformed frontmatter breaks skill loading, RAG indexing, and documentation generation.

## 2. File Structure (structure)

**Impact:** CRITICAL  
**Applies to:** Tier 2, Tier 3  
**Description:** Skills must follow the defined directory structure. Tier 2 uses modular references; Tier 3 uses the 5-file pattern per product. Wrong structure makes skills undiscoverable.

## 3. Documentation Quality (quality)

**Impact:** HIGH  
**Applies to:** Tier 1, Tier 2, Tier 3  
**Description:** Content must be clear, actionable, and include practical examples. Poor quality documentation wastes context and leads to incorrect implementations.

## 4. Decision Trees & Routing (routing)

**Impact:** HIGH  
**Applies to:** Tier 2, Tier 3  
**Description:** Dispatcher files (SKILL.md) must use intent-based decision trees. Product references must be loaded only when needed. Bad routing causes context bloat.

## 5. Navigation & Links (navigation)

**Impact:** MEDIUM-HIGH  
**Applies to:** Tier 1, Tier 2, Tier 3  
**Description:** All internal links must be relative and resolvable. Cross-references should stay one level deep. Broken links break the knowledge graph.

## 6. Token Management (tokens)

**Impact:** MEDIUM  
**Applies to:** Tier 1, Tier 2, Tier 3  
**Description:** Keep documentation atomic. Default target is ~512 tokens. Long files waste context and reduce the agent's working memory for the actual task.

## 7. Anti-Patterns Prevention (antipatterns)

**Impact:** MEDIUM  
**Applies to:** Tier 2, Tier 3  
**Description:** Avoid common mistakes like including implementation details in dispatchers, duplicating content across references, or creating circular dependencies.
