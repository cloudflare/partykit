---
"partyserver": minor
---

Add `uri` property to `Connection` that captures the original WebSocket upgrade request URL

`WebSocketPair` doesn't accept a URL parameter, so the originating URL was previously lost after the handshake. The `uri` is now persisted in the WebSocket attachment alongside `id` and `tags`, so it survives hibernation. Returns `null` for connections established before this change.
