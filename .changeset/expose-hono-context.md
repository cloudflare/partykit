---
"hono-party": patch
---

Expose Hono context as a third argument to `onBeforeConnect` and `onBeforeRequest` callbacks, giving access to `c.env`, `c.var`, `c.get()`, etc.
