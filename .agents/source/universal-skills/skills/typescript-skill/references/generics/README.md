---
description: TypeScript generics for reusable components with type constraints and defaults.
metadata:
  tags: "typescript, generics, constraints, type parameters, default types, tsx"
---

# TypeScript Generics

Create reusable components that work with multiple types while maintaining type safety.

## Basic Syntax

### Function Generics

```typescript
function identity<T>(arg: T): T {
  return arg;
}

// Usage
const num = identity<number>(42);    // T is number
const str = identity('hello');        // T is inferred as string
```

### Interface Generics

```typescript
interface Container<T> {
  value: T;
  getValue: () => T;
}

const numberContainer: Container<number> = {
  value: 42,
  getValue: () => 42
};
```

### Class Generics

```typescript
class Stack<T> {
  private items: T[] = [];

  push(item: T) {
    this.items.push(item);
  }

  pop(): T | undefined {
    return this.items.pop();
  }
}

const numberStack = new Stack<number>();
numberStack.push(1);
numberStack.push(2);
```

## TSX Arrow Function Syntax

When using generics in TSX files, add a comma to prevent parser confusion:

```typescript
// ❌ Error: JSX element 'T' has no closing tag
const getFirst = <T>(arr: T[]): T => arr[0];

// ✅ Correct: comma prevents JSX parsing
const getFirst = <T,>(arr: T[]): T => arr[0];

// ✅ Alternative: extends clause
const getFirst = <T extends unknown>(arr: T[]): T => arr[0];
```

## Constraints

Restrict generic types to ensure they have required properties:

```typescript
// Basic constraint
function logId<T extends { id: string | number }>(item: T) {
  console.log(item.id);
}

logId({ id: 1, name: 'John' });     // ✅ OK
logId({ name: 'John' });            // ❌ Error: missing 'id'
```

### Multiple Constraints

```typescript
interface HasId {
  id: string;
}

interface HasName {
  name: string;
}

function process<T extends HasId & HasName>(item: T) {
  console.log(item.id, item.name);
}
```

### keyof Constraint

```typescript
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

const user = { name: 'John', age: 30 };
const name = getProperty(user, 'name');  // Type: string
const age = getProperty(user, 'age');    // Type: number
// const invalid = getProperty(user, 'invalid'); // ❌ Error
```

## Default Types

Provide default types for generics:

```typescript
interface ApiResponse<T = unknown> {
  data: T;
  status: number;
}

// Uses default
const response: ApiResponse = { data: null, status: 200 };

// Explicit type
const userResponse: ApiResponse<User> = { data: user, status: 200 };
```

## Generic Patterns

### Repository Pattern

```typescript
interface Entity {
  id: string;
}

class Repository<T extends Entity> {
  private items: T[] = [];

  findById(id: string): T | undefined {
    return this.items.find(item => item.id === id);
  }

  save(item: T): void {
    const index = this.items.findIndex(i => i.id === item.id);
    if (index >= 0) {
      this.items[index] = item;
    } else {
      this.items.push(item);
    }
  }
}

interface User extends Entity {
  name: string;
  email: string;
}

const userRepo = new Repository<User>();
```

### Factory Pattern

```typescript
interface Constructor<T> {
  new (...args: any[]): T;
}

function createInstance<T>(Constructor: Constructor<T>): T {
  return new Constructor();
}

class User {
  constructor(public name: string) {}
}

const user = createInstance(User);  // Type: User
```

### Mapper Pattern

```typescript
type Mapper<T, U> = (item: T) => U;

function mapArray<T, U>(array: T[], mapper: Mapper<T, U>): U[] {
  return array.map(mapper);
}

const numbers = [1, 2, 3];
const strings = mapArray(numbers, n => n.toString());
// Type: string[]
```

## Conditional Types

Create types based on conditions:

```typescript
type IsString<T> = T extends string ? true : false;

type A = IsString<'string'>;  // true
type B = IsString<123>;       // false
```

### Infer Keyword

```typescript
type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never;

function greet() {
  return 'hello';
}

type GreetReturn = ReturnType<typeof greet>;  // string
```

## Generic Utilities

### Partial with Constraint

```typescript
function update<T extends Record<string, any>>(
  obj: T,
  updates: Partial<T>
): T {
  return { ...obj, ...updates };
}

const user = { id: 1, name: 'John', age: 30 };
const updated = update(user, { name: 'Jane' });
```

### Type-safe Event Emitter

```typescript
interface EventMap {
  'user:created': { id: string; name: string };
  'user:deleted': { id: string };
}

class TypedEmitter<Events extends Record<string, any>> {
  private listeners: { [K in keyof Events]?: Array<(data: Events[K]) => void> } = {};

  on<K extends keyof Events>(event: K, listener: (data: Events[K]) => void) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event]!.push(listener);
  }

  emit<K extends keyof Events>(event: K, data: Events[K]) {
    this.listeners[event]?.forEach(listener => listener(data));
  }
}

const emitter = new TypedEmitter<EventMap>();
emitter.on('user:created', ({ id, name }) => {
  // id and name are properly typed
});
```

## Common Mistakes

### Over-constraining

```typescript
// ❌ Too restrictive
function process<T extends { id: string; name: string }>(item: T) {
  return item.id;
}

// ✅ Only constrain what's needed
function process<T extends { id: string }>(item: T) {
  return item.id;
}
```

### Not Using Constraints

```typescript
// ❌ No type safety
function getId<T>(item: T): string {
  return (item as any).id;  // Dangerous!
}

// ✅ Proper constraint
function getId<T extends { id: string }>(item: T): string {
  return item.id;  // Safe!
}
```

### Forgetting TSX Comma

```typescript
// ❌ JSX error in .tsx files
const Component = <T>() => { ... };

// ✅ Add comma
const Component = <T,>() => { ... };
```

## Best Practices

1. **Use descriptive names**: `T`, `U`, `K`, `V` are standard
2. **Add constraints**: Ensure required properties exist
3. **Provide defaults**: Make generics optional when possible
4. **Leverage inference**: Let TypeScript infer when it can
5. **Use `extends`**: For both constraints and defaults
6. **Document constraints**: Add JSDoc for complex generics

---

*Source: Official TypeScript Documentation - typescriptlang.org*
