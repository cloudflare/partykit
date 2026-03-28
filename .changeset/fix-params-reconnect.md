---
"y-partyserver": patch
---

Fix params() not being re-evaluated on WebSocket reconnect

When `params` was passed as a function to `YProvider`, it was only evaluated on the initial connection. On automatic reconnects (e.g. after a network drop), the params function was not called again, causing dynamic values like auth tokens to go stale.

The reconnection path now goes through an overridable `_reconnectWS()` method that `YProvider` uses to re-resolve params before re-establishing the WebSocket.
