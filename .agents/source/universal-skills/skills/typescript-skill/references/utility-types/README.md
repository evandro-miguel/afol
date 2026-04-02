---
description: TypeScript utility types for type transformation and manipulation.
metadata:
  tags: "typescript, utility types, partial, required, pick, omit, record, mapped types, conditional types"
---

# TypeScript Utility Types

Built-in and custom utility types for type transformations.

## Built-in Utility Types

### Partial<Type>

Makes all properties optional.

```typescript
interface User {
  id: string;
  name: string;
  age: number;
}

type PartialUser = Partial<User>;
// { id?: string; name?: string; age?: number; }

// Use case: Update operations
function updateUser(id: string, updates: Partial<User>) {
  // ...
}

updateUser('123', { name: 'Jane' });  // OK, other fields optional
```

### Required<Type>

Makes all properties required.

```typescript
interface Config {
  apiUrl?: string;
  timeout?: number;
}

type RequiredConfig = Required<Config>;
// { apiUrl: string; timeout: number; }
```

### Readonly<Type>

Makes all properties readonly.

```typescript
type ReadonlyUser = Readonly<User>;
// { readonly id: string; readonly name: string; readonly age: number; }

const user: ReadonlyUser = { id: '1', name: 'John', age: 30 };
// user.name = 'Jane';  // ❌ Error: readonly
```

### Record<Keys, Type>

Creates object type with specific keys and value type.

```typescript
type PageInfo = {
  title: string;
};

type Page = 'home' | 'about' | 'contact';

const nav: Record<Page, PageInfo> = {
  home: { title: 'Home' },
  about: { title: 'About' },
  contact: { title: 'Contact' }
};
```

### Pick<Type, Keys>

Selects specific properties from a type.

```typescript
type UserPreview = Pick<User, 'id' | 'name'>;
// { id: string; name: string; }

// Use case: API responses
function getUserPreview(): UserPreview {
  return { id: '1', name: 'John' };
}
```

### Omit<Type, Keys>

Removes specific properties from a type.

```typescript
type UserWithoutPassword = Omit<User, 'password'>;
// All User properties except 'password'

// Use case: Public API responses
function getPublicUser(): Omit<User, 'password' | 'secretKey'> {
  // ...
}
```

### Exclude<Type, ExcludedUnion>

Removes types from a union.

```typescript
type T0 = Exclude<'a' | 'b' | 'c', 'a'>;     // 'b' | 'c'
type T1 = Exclude<'a' | 'b' | 'c', 'a' | 'b'>;  // 'c'
type T2 = Exclude<string | number | (() => void), Function>;  // string | number
```

### Extract<Type, Union>

Extracts types from a union.

```typescript
type T0 = Extract<'a' | 'b' | 'c', 'a' | 'f'>;  // 'a'
type T1 = Extract<string | number | (() => void), Function>;  // () => void
```

### NonNullable<Type>

Removes null and undefined from a type.

```typescript
type T0 = NonNullable<string | number | undefined>;  // string | number
type T1 = NonNullable<string[] | null | undefined>;  // string[]
```

### ReturnType<Type>

Extracts return type of a function.

```typescript
declare function f1(): { a: number; b: string };

type T0 = ReturnType<typeof f1>;  // { a: number; b: string }

// Use case: Type-safe API clients
async function fetchUser(): Promise<ReturnType<typeof getUser>> {
  const response = await api.get('/user');
  return response.data;
}
```

### Parameters<Type>

Extracts parameter types as tuple.

```typescript
declare function f1(arg: { a: number; b: string }): void;

type T0 = Parameters<typeof f1>;  // [{ a: number; b: string }]

// Use case: Wrapper functions
function logWrapper<T extends (...args: any[]) => any>(
  fn: T
): (...args: Parameters<T>) => ReturnType<T> {
  return (...args) => {
    console.log('Calling function');
    return fn(...args);
  };
}
```

### Awaited<Type>

Unwraps Promise type.

```typescript
type T = Awaited<Promise<string>>;  // string

async function fetchData(): Promise<{ data: string }> {
  return { data: 'hello' };
}

type DataType = Awaited<ReturnType<typeof fetchData>>;
// { data: string }
```

## Mapped Types

Transform each property of an existing type.

### Basic Mapped Type

```typescript
type Readonly<T> = {
  readonly [P in keyof T]: T[P];
};

type Optional<T> = {
  [P in keyof T]?: T[P];
};
```

### Property Modifiers

```typescript
// Remove readonly
type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

// Remove optional
type Required<T> = {
  [P in keyof T]-?: T[P];
};
```

### Key Remapping

```typescript
// Rename keys with template literals
type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};

interface User {
  name: string;
  age: number;
}

type UserGetters = Getters<User>;
// { getName: () => string; getAge: () => number }
```

### Filtering Keys

```typescript
// Remove keys of specific type
type RemoveKindField<T> = {
  [K in keyof T as Exclude<K, 'kind'>]: T[K];
};

interface Circle {
  kind: 'circle';
  radius: number;
}

type KindlessCircle = RemoveKindField<Circle>;
// { radius: number }
```

## Custom Utility Types

### Deep Partial

```typescript
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

interface Nested {
  a: {
    b: {
      c: string;
    };
  };
}

type PartialNested = DeepPartial<Nested>;
// All levels are optional
```

### Deep Readonly

```typescript
type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};
```

### Nullable Properties

```typescript
type Nullable<T> = {
  [P in keyof T]: T[P] | null;
};

type NullableUser = Nullable<User>;
// { id: string | null; name: string | null; age: number | null }
```

### Event Payloads

```typescript
type EventPayloads<T extends Record<string, any>> = {
  [K in keyof T]: { type: K; payload: T[K] };
}[keyof T];

interface Events {
  userCreated: { id: string; name: string };
  userDeleted: { id: string };
}

type AppEvent = EventPayloads<Events>;
// { type: 'userCreated'; payload: { id: string; name: string } } | 
// { type: 'userDeleted'; payload: { id: string } }
```

### Flatten Union

```typescript
type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

// Makes complex union types readable
type Complex = { a: string } | { b: number };
type Flat = Prettify<Complex>;  // { a: string; b?: undefined } | { a?: undefined; b: number }
```

## Conditional Types

### Basic Conditional

```typescript
type IsString<T> = T extends string ? true : false;

type A = IsString<'hello'>;  // true
type B = IsString<123>;      // false
```

### Distributive Conditional

```typescript
type ToArray<T> = T extends any ? T[] : never;

type StrOrNumArray = ToArray<string | number>;  // string[] | number[]
```

### Infer Keyword

```typescript
// Extract element type from array
type ElementType<T> = T extends (infer E)[] ? E : never;

type Num = ElementType<number[]>;  // number

// Extract return type
type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never;

// Extract parameters
type Parameters<T> = T extends (...args: infer P) => any ? P : never;
```

## Template Literal Types

```typescript
type EventName<T extends string> = `on${Capitalize<T>}`;

type MouseEvents = EventName<'click' | 'dblclick' | 'mouseup'>;
// 'onClick' | 'onDblclick' | 'onMouseup'
```

### URL Paths

```typescript
type Endpoint<T extends string> = `/api/${T}`;

type UserEndpoints = Endpoint<'users' | 'users/${string}'>;
// '/api/users' | '/api/users/${string}'
```

## Best Practices

1. **Prefer built-in utilities** - They're well-tested and optimized
2. **Keep custom types simple** - Complex types are hard to maintain
3. **Document complex transformations** - Add comments explaining the logic
4. **Use meaningful names** - `UserUpdate` is better than `PartialUser`
5. **Avoid deep nesting** - Prefer composition over deeply nested types
6. **Test your types** - Use `// @ts-expect-error` to verify constraints

## Common Patterns

### API Response Types

```typescript
interface ApiResponse<T> {
  data: T;
  status: number;
  message?: string;
}

type UserResponse = ApiResponse<User>;
type UsersResponse = ApiResponse<User[]>;
```

### Form State Types

```typescript
type FormState<T> = {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  touched: Partial<Record<keyof T, boolean>>;
  isSubmitting: boolean;
};
```

### State Machine Types

```typescript
type StateConfig<S extends string, E extends string> = {
  [K in S]: {
    on?: Partial<Record<E, S>>;
    entry?: () => void;
    exit?: () => void;
  };
};
```

---

*Source: Official TypeScript Documentation - typescriptlang.org*
