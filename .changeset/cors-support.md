---
"partyserver": patch
---

Add CORS support to `routePartykitRequest`.

Pass `cors: true` for permissive defaults or `cors: { ...headers }` for custom CORS headers. Preflight (OPTIONS) requests are handled automatically for matched routes, and CORS headers are appended to all non-WebSocket responses — including responses returned by `onBeforeRequest`.
