---
description: Essential TypeScript patterns including const assertions, satisfies operator, and type safety best practices.
metadata:
  tags: "typescript, const assertion, satisfies, unknown, any, best practices"
---

# TypeScript Core Patterns

Essential patterns for type-safe TypeScript development.

## Const Assertions

Using `as const` turns literals into readonly types and prevents widening.

```typescript
// Without as const (widened)
const COLORS = ['red', 'blue'];
// type: string[]

// With as const (narrowed)
const COLORS = ['red', 'blue'] as const;
// type: readonly ['red', 'blue']

// Object example
const CONFIG = {
  apiUrl: 'https://api.example.com',
  timeout: 5000
} as const;
// type: { readonly apiUrl: 'https://api.example.com'; readonly timeout: 5000 }
```

### Use Cases

- **Tuple types**: Ensure array is treated as tuple
- **Literal types**: Preserve string/number literals
- **Immutable data**: Mark data as readonly
- **Union types**: Create unions from arrays

```typescript
const ACTIONS = ['create', 'update', 'delete'] as const;
type Action = typeof ACTIONS[number]; // 'create' | 'update' | 'delete'
```

## Satisfies Operator

Ensures an object matches a type but keeps its specific inferred shape.

```typescript
type Config = Record<string, string | number>;

// Without satisfies (widened)
const config1: Config = { port: 3000 };
// config1.port is string | number

// With satisfies (narrowed)
const config2 = { port: 3000 } satisfies Config;
// config2.port is number (specific type preserved)
```

### Benefits

- Type checking without widening
- Preserves specific literal types
- Useful for configuration objects
- Better autocomplete in IDEs

### Comparison

| Approach | Type Safety | Specificity | Use Case |
|----------|-------------|-------------|----------|
| `: Type` | ✅ | ❌ Widened | Interface compliance |
| `satisfies` | ✅ | ✅ Preserved | Config validation |
| `as const` | ✅ | ✅ Preserved | Immutable data |

## Unknown vs Any

### Always Prefer `unknown`

`unknown` forces type narrowing before use, while `any` disables all checks.

```typescript
// ❌ Bad: any disables type checking
function processAny(data: any) {
  return data.toUpperCase(); // No error, might crash at runtime
}

// ✅ Good: unknown requires narrowing
function processUnknown(data: unknown) {
  if (typeof data === 'string') {
    return data.toUpperCase(); // Safe, narrowed to string
  }
  throw new Error('Expected string');
}
```

### Type Narrowing Patterns

```typescript
function handleValue(value: unknown) {
  // Type guards
  if (typeof value === 'string') {
    // value is string
  }
  
  if (typeof value === 'number') {
    // value is number
  }
  
  if (Array.isArray(value)) {
    // value is unknown[]
  }
  
  if (value instanceof Date) {
    // value is Date
  }
  
  if (value && typeof value === 'object') {
    // value is object (not null)
  }
}
```

## Type Inference Best Practices

### Let TypeScript Infer When Possible

```typescript
// ✅ Good: TypeScript infers the type
const user = { id: 1, name: 'John' };
// Type: { id: number; name: string }

// ❌ Bad: Unnecessary explicit type
const user: { id: number; name: string } = { id: 1, name: 'John' };
```

### Explicit Types When Needed

```typescript
// Function return types (for documentation)
function fetchUser(id: string): Promise<User> {
  return api.get(`/users/${id}`);
}

// Complex types
interface ApiResponse<T> {
  data: T;
  status: number;
}

// Public API boundaries
export function createUser(data: CreateUserInput): User {
  // ...
}
```

## Common Patterns

### Branded Types

Create nominal types from structural types:

```typescript
type UserId = string & { __brand: 'UserId' };
type OrderId = string & { __brand: 'OrderId' };

function createUserId(id: string): UserId {
  return id as UserId;
}

function createOrderId(id: string): OrderId {
  return id as OrderId;
}

// Prevents mixing IDs
const userId = createUserId('123');
const orderId = createOrderId('456');

// Type error: can't assign OrderId to UserId
const wrong: UserId = orderId;
```

### Template Literal Types

```typescript
type EventName<T extends string> = `on${Capitalize<T>}`;

type MouseEvents = EventName<'click' | 'dblclick' | 'mouseup'>;
// 'onClick' | 'onDblclick' | 'onMouseup'
```

### Recursive Types

```typescript
interface TreeNode<T> {
  value: T;
  children: TreeNode<T>[];
}

type JSONValue = 
  | string 
  | number 
  | boolean 
  | null 
  | JSONValue[] 
  | { [key: string]: JSONValue };
```

## Type Safety Checklist

- [ ] Use `unknown` instead of `any` for unknown values
- [ ] Use `as const` for immutable data
- [ ] Use `satisfies` for config objects
- [ ] Implement type guards for runtime checks
- [ ] Add exhaustiveness checks for unions
- [ ] Prefer inference over explicit types
- [ ] Use branded types for ID differentiation
- [ ] Avoid type assertions (`as`) when possible

---

*Source: Official TypeScript Documentation - typescriptlang.org*
