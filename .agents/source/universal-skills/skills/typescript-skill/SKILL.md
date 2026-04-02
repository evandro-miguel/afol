---
name: typescript-skill
description: Use when working with TypeScript type system, generics, narrowing, utility types, or discriminated unions. Covers type safety patterns, type guards, and advanced type manipulation.
metadata:
  category: language
  tags: "typescript, generics, narrowing, type guards, utility types, discriminated unions, type safety, inference, constraints"
  triggers: "typescript, generic, type guard, narrowing, utility types, partial, pick, omit, record, discriminated union, type predicate, satisfies, const assertion"
  references: "generics, narrowing, utility-types, discriminated-unions, type-guards"
---
# TypeScript Skill 📘

Mastery of TypeScript type system, patterns, and best practices based on official TypeScript documentation.

## When to Use
- Writing or debugging TypeScript type definitions
- Implementing generics for reusable components
- Creating type guards for narrowing unions
- Using utility types for type transformations
- Building discriminated unions for state management
- Optimizing type inference and constraints

## How It Works
- Identify the type system challenge you're facing
- Choose the appropriate pattern from the decision tree
- Apply the reference documentation for your specific use case
- Follow best practices for type safety

## Examples
- Create a generic repository pattern with proper constraints
- Build a type-safe state machine with discriminated unions
- Implement custom type guards for API response validation
- Use utility types to derive variants from base interfaces

## Common Mistakes
- Using `any` instead of `unknown` for unknown values
- Not leveraging type inference when TypeScript can infer
- Missing exhaustiveness checks in switch statements
- Over-complicating types when simpler solutions exist

## ⚡ Quick Decision Tree

### What do you need?

1. **Reusable Components with Types?**
   - Generic functions, classes, interfaces -> [Generics](./references/generics/README.md)
   - Constraining generic types -> [Generics - Constraints](./references/generics/README.md#constraints)

2. **Refining Union Types?**
   - Type guards and predicates -> [Narrowing](./references/narrowing/README.md)
   - Discriminated unions for state management -> [Narrowing](./references/narrowing/README.md)

3. **Transforming Existing Types?**
   - Built-in utility types (Partial, Pick, Omit) -> [Utility Types](./references/utility-types/README.md)
   - Custom mapped types -> [Utility Types - Mapped Types](./references/utility-types/README.md#mapped-types)

4. **Type Safety Patterns?**
   - Exhaustiveness checking -> [Narrowing - Exhaustiveness](./references/narrowing/README.md#exhaustiveness-checking)
   - Const assertions -> [Core Patterns](./references/core/README.md#const-assertions)
   - Satisfies operator -> [Core Patterns](./references/core/README.md#satisfies)

## 📚 Component Index

| Component | Purpose |
|-----------|---------|
| **[Core Patterns](./references/core/README.md)** | Essential patterns: `const` assertions, `satisfies`, `unknown` vs `any`. |
| **[Generics](./references/generics/README.md)** | Generic functions, constraints, defaults, TSX syntax. |
| **[Narrowing](./references/narrowing/README.md)** | Type guards, predicates, `typeof`, `instanceof`, `in` operator. |
| **[Utility Types](./references/utility-types/README.md)** | Built-in and custom utility types for transformations. |
| **[Discriminated Unions](./references/narrowing/README.md)** | Tagged unions for type-safe state machines. |

## 🚀 Quick Reference

### Generic Function

```typescript
function identity<T>(arg: T): T {
  return arg;
}

// With constraint
function logId<T extends { id: string | number }>(item: T) {
  console.log(item.id);
}
```

### Type Guard

```typescript
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

if (isString(input)) {
  // input is narrowed to string
  console.log(input.toUpperCase());
}
```

### Discriminated Union

```typescript
type Result = 
  | { type: 'success'; data: string }
  | { type: 'error'; error: Error };

function handle(res: Result) {
  switch (res.type) {
    case 'success':
      return res.data; // Narrowed to success
    case 'error':
      throw res.error; // Narrowed to error
    default:
      const _exhaustive: never = res; // Exhaustiveness check
      return _exhaustive;
  }
}
```

### Utility Types

```typescript
interface User {
  id: string;
  name: string;
  age: number;
}

// Make properties optional
type PartialUser = Partial<User>;

// Pick specific properties
type UserPreview = Pick<User, 'id' | 'name'>;

// Omit properties
type UserWithoutAge = Omit<User, 'age'>;

// Create getter methods
type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};

type UserGetters = Getters<User>;
// { getId: () => string; getName: () => string; getAge: () => number }
```

### Const Assertion

```typescript
const COLORS = ['red', 'blue'] as const;
// type: readonly ['red', 'blue']
// NOT: string[]
```

### Satisfies Operator

```typescript
// 1. Basic usage
type Config = Record<string, string | number>;
const config = { port: 3000 } satisfies Config;
// config.port is inferred as number, not string | number

// 2. Configuration files (Vite/Convex) - BEST PRACTICE
// Ensures config matches type but keeps specific literals
import { defineConfig } from 'vite';
import type { UserConfig } from 'vite';

export default {
  server: { port: 3000 },
  build: { target: 'esnext' }
} satisfies UserConfig;
```

## 📋 Type System Cheatsheet

### Narrowing Operators

| Operator | Use Case | Example |
|----------|----------|---------|
| `typeof` | Primitives | `typeof x === 'string'` |
| `instanceof` | Classes | `x instanceof Error` |
| `in` | Property existence | `'name' in obj` |
| Type Predicate | Custom guards | `x is string` |

### Utility Types Quick Reference

| Type | Purpose | Example |
|------|---------|---------|
| `Partial<T>` | All optional | `Partial<User>` |
| `Required<T>` | All required | `Required<User>` |
| `Readonly<T>` | Immutable | `Readonly<User>` |
| `Pick<T, K>` | Select keys | `Pick<User, 'id'>` |
| `Omit<T, K>` | Remove keys | `Omit<User, 'password'>` |
| `Record<K, V>` | Dictionary | `Record<string, User>` |
| `ReturnType<T>` | Function return | `ReturnType<typeof fn>` |
| `Parameters<T>` | Function args | `Parameters<typeof fn>` |

### Generic Constraints

```typescript
// Basic constraint
<T extends string>

// Multiple constraints
<T extends { id: string } & { name: string }>

// Default type
<T = string>

// Keyof constraint
<K extends keyof T>
```

## 🎯 Best Practices

1. **Prefer `unknown` over `any`** - Forces type narrowing
2. **Use `const` assertions** - Prevents type widening
3. **Leverage `satisfies`** - Type checking without widening
4. **Implement exhaustiveness checks** - Catch missing cases
5. **Use utility types** - Keep types DRY
6. **Prefer type guards** - Over manual narrowing
7. **Use discriminated unions** - For state machines
8. **Avoid deep nesting** - Prefer composition over complex types

## 🔗 Related Skills

- **[bun-skill](skill://bun-skill)**: TypeScript configuration with Bun
- **[zod-skill](skill://zod-skill)**: Runtime type validation
- **[trpc-skill](skill://trpc-skill)**: Type-safe APIs

---

*Based on official TypeScript documentation from typescriptlang.org*
