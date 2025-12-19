---
"partyserver": patch
---

Add experimental waitUntil API for long-running tasks

Introduces an internal keep-alive WebSocket endpoint and the experimental_waitUntil method to allow Durable Objects to remain alive while executing long-running async functions. This mechanism uses a self-connecting WebSocket with periodic pings and requires the 'enable_ctx_exports' compatibility flag. Additional handling is added to ignore keep-alive sockets in WebSocket event methods.

Based on @eastlondoner's https://github.com/eastlondoner/better-wait-until
