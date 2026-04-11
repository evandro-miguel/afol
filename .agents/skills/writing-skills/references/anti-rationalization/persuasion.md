---
description: Psychological principles for making discipline skills bulletproof.
metadata:
  tags: "persuasion, psychology, compliance"
---

# Persuasion Principles for Skills

Why agents ignore rules—and how to make them comply.

## The Problem

Agents rationalize around rules when:

1. The rule seems arbitrary
2. Shortcuts appear beneficial
3. No consequence is visible
4. The "spirit" seems met without the "letter"

## The 7 Principles

Apply these to increase compliance. Each principle exploits a different cognitive bias.

### 1. Authority

**Why it works:** Agents defer to recognized expertise.

```markdown
# ❌ Weak

"You should write tests"

## ✅ Strong

"**Google SRE Standard**: All production code requires 80% test coverage.
Source: Site Reliability Engineering, O'Reilly 2016"
```

### 2. Commitment & Consistency

**Why it works:** Once committed, agents maintain consistency.

```markdown
# ❌ Weak

"Follow the style guide"

## ✅ Strong

"Before making changes, confirm: 'I will follow project conventions.'
Then proceed with implementation."
```

### 3. Scarcity

**Why it works:** Limited resources demand careful use.

```markdown
# ❌ Weak

"Be efficient with API calls"

## ✅ Strong

"⚠️ Rate Limit: 100 calls/minute.
Exceeding triggers 24h lockout. Plan calls carefully."
```

### 4. Social Proof

**Why it works:** Agents follow established patterns.

```markdown
# ❌ Weak

"Use TypeScript"

## ✅ Strong

"This codebase uses TypeScript (see existing files).
Follow the patterns in `src/components/Button.tsx` as reference."
```

### 5. Unity (In-Group)

**Why it works:** Agents align with team identity.

```markdown
# ❌ Weak

"Don't use any"

## ✅ Strong

"On this team, we never use 'any'.
It signals incomplete work and blocks PR approval."
```

### 6. Reciprocity

**Why it works:** Agents reciprocate when given value first.

```markdown
# ❌ Weak

"Document your code"

## ✅ Strong

"This skill provides ready-to-use templates (see examples/).
In return, document any new patterns you create."
```

### 7. Liking

**Why it works:** Agents comply more with approachable instructions.

```markdown
# ❌ Cold

"ERROR: Invalid format. Retry."

## ✅ Warm

"Almost there! The format needs a small fix—
check the example above and try again."
```

---

## Principle × Skill Type Matrix

| Skill Type | Primary Principle | Secondary |
|------------|------------------|-----------|
| Coding Standards | Authority + Unity | Social Proof |
| Security Rules | Scarcity + Authority | Commitment |
| Style Guides | Social Proof + Unity | Liking |
| Process/Workflow | Commitment + Authority | Reciprocity |

---

## Application Checklist

When writing a discipline skill:

- [ ] At least 2 principles applied
- [ ] Critical rules use Authority or Scarcity
- [ ] Examples use Social Proof
- [ ] Instructions use positive framing (Liking)

---

## See Also

- [Anti-Rationalization README](./README.md): Practical techniques
- [Best Practices](../best-practices/README.md): Degrees of Freedom
