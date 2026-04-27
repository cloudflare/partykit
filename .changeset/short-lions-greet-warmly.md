---
"partyserver": patch
---

Complete the WebSocket close handshake when a client initiates the close. Previously, both the hibernating `webSocketClose` handler and the non-hibernating close-event listener forwarded to user `onClose` but never sent a reciprocal Close frame, leaving clients stuck in `CLOSING` until they timed out and reported `1006` (abnormal closure). The framework now reciprocates the peer's Close frame in a `finally` block on both paths — required by the Hibernation API on every compat date, and required by the standard `accept()` API on compat dates before `2026-04-07` (where the runtime's `web_socket_auto_reply_to_close` flag isn't yet active). Calling `close()` on an already-closed socket is a silent no-op, so user code that already calls `connection.close(...)` from `onClose` is unaffected. Reserved close codes (`1005`, `1006`, `1015`) are normalized to `1000` before reciprocation so they don't throw `InvalidAccessError`. See cloudflare/partykit#389.
