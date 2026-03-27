---
"partyserver": patch
---

Use RPC instead of HTTP headers to pass room name and props to Durable Objects, preventing sensitive information from appearing in logs.

- `getServerByName` now calls `stub.setName()` via RPC instead of sending a dummy fetch request with headers.
- `routePartykitRequest` uses a new internal `_initAndFetch` RPC method for HTTP requests (single round trip), and `setName` + `fetch` for WebSocket upgrades.
- `setName` accepts an optional `props` parameter and short-circuits when the name is already set.
- Removed the `/cdn-cgi/partyserver/set-name/` internal endpoint (no longer needed).
