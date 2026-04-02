---
description: "C++ Bindings (JSC)"
metadata:
  category: development
  tags: "core-web-vitals, bun, scripts, pull-requests, javascript, testing, bindings, bundler"
---

# C++ Bindings (JSC)

**Context**: Deep integration with JavaScriptCore.

1.  **Class**: Inherit `JSC::DestructibleObject`.
2.  **Prototype**: Inherit `JSC::JSNonFinalObject`.
3.  **Constructor**: Inherit `JSC::InternalFunction`.

**Macros**: `JSC_DEFINE_HOST_FUNCTION`, `JSC_DEFINE_CUSTOM_GETTER`.
