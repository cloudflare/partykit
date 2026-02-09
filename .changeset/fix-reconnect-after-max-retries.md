---
"partysocket": patch
---

Fix `reconnect()` not working after `maxRetries` has been exhausted. The `_connectLock` was not released when the max retries early return was hit in `_connect()`, preventing any subsequent `reconnect()` call from initiating a new connection.
