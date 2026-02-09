---
"partyserver": patch
---

Fix initialization race conditions and improve error resilience.

- `getServerByName` now propagates errors from the internal `set-name` request instead of silently swallowing them.
- `onStart` failures no longer permanently brick the Durable Object. Errors are caught inside `blockConcurrencyWhile` (preserving the input gate) and the status is reset, allowing subsequent requests to retry initialization.
- `fetch()` now retries initialization when a previous `onStart` attempt failed, instead of skipping it because the name was already set.
- Errors in `fetch()` (including `onStart` failures and malformed props) are now caught and returned as proper 500 responses instead of crashing as unhandled exceptions.
- WebSocket handlers (`webSocketMessage`, `webSocketClose`, `webSocketError`) are now wrapped in try/catch so that transient `onStart` failures don't kill the connection — the next message will retry.
