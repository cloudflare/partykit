---
"partysocket": patch
---

Narrow the exported `Message` type from `ArrayBufferView` to `ArrayBufferView<ArrayBuffer>` so it matches the DOM `WebSocket.send()` overloads under newer `@cloudflare/workers-types` / lib.dom.d.ts, where the default `ArrayBufferView<ArrayBufferLike>` includes `SharedArrayBuffer`-backed views that `send()` does not accept. Runtime behaviour is unchanged — `WebSocket.send()` already rejected shared-buffer views at runtime.
