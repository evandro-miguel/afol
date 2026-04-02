---
description: "Zig Bindings & System Calls"
metadata:
  category: development
  tags: "handlers, links, ui-components, bun, scripts, typescript, pull-requests, file-api"
---

# Zig Bindings & System Calls

## 1. System Calls (`bun.sys`)

**Context**: Use `bun.sys` instead of `std.fs`/`std.posix` for cross-platform stability.

### File I/O Pattern

```zig
const File = bun.sys.File;

// Open
const file = File.open(path, bun.O.RDWR, 0o644).unwrap();
defer file.close();

// Read/Write
_ = try file.read(buffer).unwrap();
_ = try file.writeAll(data).unwrap();

// Stat
const stat = try file.stat().unwrap();
```

### Low-Level Syscall Pattern

```zig
const sys = bun.sys;

switch (sys.open(path, bun.O.RDONLY, 0)) {
    .result => |fd| {
        defer fd.close();
        // Use fd...
    },
    .err => |e| {
        // Handle e.errno, e.syscall
    },
}
```

## 2. JS Classes in Zig

**Context**: Exposing high-performance Zig structs to JavaScript.

### Interface Definition (`.classes.ts`)

```typescript
define({
  name: "TextDecoder",
  constructor: true,
  JSType: "object",
  finalize: true, // Requires cleanup
  proto: {
    decode: { args: 1 },
    encoding: { getter: true, cache: true }, // Cached property
    fatal: { getter: true },
  },
});
```

### Implementation (`.zig`)

```zig
pub const TextDecoder = struct {
    // Boilerplate linkage
    pub const js = JSC.Codegen.JSTextDecoder;
    pub const toJS = js.toJS;
    pub const fromJS = js.fromJS;

    encoding: []const u8,

    // Constructor
    pub fn constructor(
        global: *JSGlobalObject,
        call: *JSC.CallFrame,
    ) !*TextDecoder {
        return bun.new(TextDecoder, .{ .encoding = "utf-8" });
    }

    // Method
    pub fn decode(
        this: *TextDecoder,
        global: *JSGlobalObject,
        call: *JSC.CallFrame,
    ) !JSC.JSValue {
        return JSC.JSValue.jsString(global, "result");
    }

    // Destructor
    pub fn finalize(this: *TextDecoder) void {
        this.deinit();
        bun.destroy(this);
    }
};
```
