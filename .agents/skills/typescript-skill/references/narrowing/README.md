---
description: TypeScript type narrowing with guards, predicates, and discriminated unions.
metadata:
  tags: "typescript, narrowing, type guards, predicates, typeof, instanceof, in operator, exhaustiveness"
---

# Type Narrowing

Refining wide types into more specific ones using type guards and predicates.

## Type Guards

### typeof Guard

Checks primitive types.

```typescript
function process(value: string | number) {
  if (typeof value === 'string') {
    // value is string
    return value.toUpperCase();
  } else {
    // value is number
    return value.toFixed(2);
  }
}
```

**Valid typeof checks:**
- `"string"`
- `"number"`
- `"bigint"`
- `"boolean"`
- `"symbol"`
- `"undefined"`
- `"object"`
- `"function"`

### instanceof Guard

Checks class instances.

```typescript
class Dog {
  bark() {
    console.log('Woof!');
  }
}

class Cat {
  meow() {
    console.log('Meow!');
  }
}

function makeSound(animal: Dog | Cat) {
  if (animal instanceof Dog) {
    animal.bark();  // TypeScript knows it's Dog
  } else {
    animal.meow();  // TypeScript knows it's Cat
  }
}
```

### in Operator

Checks if property exists in object.

```typescript
interface Admin {
  role: 'admin';
  permissions: string[];
}

interface User {
  role: 'user';
}

function checkAccess(person: Admin | User) {
  if ('permissions' in person) {
    // person is Admin
    console.log(person.permissions);
  } else {
    // person is User
    console.log('No special permissions');
  }
}
```

## Type Predicates

Custom type guards using `is` keyword.

```typescript
interface Fish {
  swim: () => void;
}

interface Bird {
  fly: () => void;
}

function isFish(pet: Fish | Bird): pet is Fish {
  return (pet as Fish).swim !== undefined;
}

function move(pet: Fish | Bird) {
  if (isFish(pet)) {
    pet.swim();  // TypeScript knows it's Fish
  } else {
    pet.fly();   // TypeScript knows it's Bird
  }
}
```

### Complex Predicates

```typescript
interface ApiError {
  type: 'error';
  message: string;
  code: number;
}

interface ApiSuccess<T> {
  type: 'success';
  data: T;
}

type ApiResponse<T> = ApiError | ApiSuccess<T>;

function isApiError<T>(response: ApiResponse<T>): response is ApiError {
  return response.type === 'error';
}

function handleResponse<T>(response: ApiResponse<T>) {
  if (isApiError(response)) {
    console.error(response.message, response.code);
  } else {
    console.log(response.data);
  }
}
```

## Equality Narrowing

```typescript
function process(x: string | number, y: string | boolean) {
  if (x === y) {
    // Both are string (only common type)
    x.toUpperCase();
    y.toUpperCase();
  } else {
    // x: string | number
    // y: string | boolean
  }
}
```

## Truthiness Narrowing

```typescript
function printAll(strs: string | string[] | null) {
  if (strs && typeof strs === 'object') {
    // strs is string[]
    for (const s of strs) {
      console.log(s);
    }
  } else if (typeof strs === 'string') {
    // strs is string
    console.log(strs);
  }
}
```

## Array.isArray Narrowing

```typescript
function process(value: string | string[]) {
  if (Array.isArray(value)) {
    // value is string[]
    return value.join(', ');
  }
  // value is string
  return value;
}
```

## Exhaustiveness Checking

Ensure all cases of a union are handled.

```typescript
type Shape = 
  | { kind: 'circle'; radius: number }
  | { kind: 'square'; side: number }
  | { kind: 'rectangle'; width: number; height: number };

function getArea(shape: Shape): number {
  switch (shape.kind) {
    case 'circle':
      return Math.PI * shape.radius ** 2;
    case 'square':
      return shape.side ** 2;
    case 'rectangle':
      return shape.width * shape.height;
    default:
      // Exhaustiveness check
      const _exhaustiveCheck: never = shape;
      return _exhaustiveCheck;
  }
}
```

If you add a new shape type, TypeScript will error at the `never` assignment.

## Assertion Functions

Throw if condition is not met.

```typescript
function assertIsString(value: unknown): asserts value is string {
  if (typeof value !== 'string') {
    throw new Error('Value must be a string');
  }
}

function process(value: unknown) {
  assertIsString(value);
  // value is string here
  console.log(value.toUpperCase());
}
```

### Assert Non-null

```typescript
function assertDefined<T>(value: T | null | undefined): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error('Value must be defined');
  }
}

function getLength(str: string | null) {
  assertDefined(str);
  // str is string here
  return str.length;
}
```

## Control Flow Analysis

TypeScript narrows types based on control flow.

```typescript
function process(value: string | number | boolean) {
  if (typeof value === 'string') {
    // value is string
    return value.length;
  }
  
  // value is number | boolean
  if (typeof value === 'number') {
    // value is number
    return value.toFixed(2);
  }
  
  // value is boolean
  return value ? 'yes' : 'no';
}
```

## Best Practices

1. **Use type predicates** for complex checks
2. **Implement exhaustiveness** for all unions
3. **Prefer `unknown` over `any`** - forces narrowing
4. **Use assertion functions** for runtime validation
5. **Combine guards** for complex conditions
6. **Leverage control flow** - TypeScript tracks narrowing

## Common Patterns

### API Response Handling

```typescript
type ApiResponse<T> = 
  | { status: 'success'; data: T }
  | { status: 'error'; error: string }
  | { status: 'loading' };

function handleResponse<T>(response: ApiResponse<T>): T | null {
  switch (response.status) {
    case 'success':
      return response.data;
    case 'error':
      console.error(response.error);
      return null;
    case 'loading':
      return null;
    default:
      const _exhaustive: never = response;
      return _exhaustive;
  }
}
```

### Form Validation

```typescript
interface ValidationError {
  field: string;
  message: string;
}

function isValidationError(error: unknown): error is ValidationError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'field' in error &&
    'message' in error
  );
}

function handleError(error: unknown) {
  if (isValidationError(error)) {
    showFieldError(error.field, error.message);
  } else {
    showGenericError('An unexpected error occurred');
  }
}
```

### State Machine

```typescript
type State = 
  | { status: 'idle' }
  | { status: 'loading'; requestId: string }
  | { status: 'success'; data: User }
  | { status: 'error'; error: Error };

function getStatusMessage(state: State): string {
  switch (state.status) {
    case 'idle':
      return 'Ready';
    case 'loading':
      return `Loading... (${state.requestId})`;
    case 'success':
      return `Welcome, ${state.data.name}!`;
    case 'error':
      return `Error: ${state.error.message}`;
    default:
      const _exhaustive: never = state;
      return _exhaustive;
  }
}
```

---

*Source: Official TypeScript Documentation - typescriptlang.org*
