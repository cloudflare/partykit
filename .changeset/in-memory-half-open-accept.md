---
"partyserver": patch
---

Accept non-hibernating WebSocket connections in half-open mode (`accept({ allowHalfOpen: true })`).

On compatibility dates `>= 2026-04-07` the `web_socket_auto_reply_to_close` flag makes the runtime send a reciprocal Close frame and tear the socket down automatically. For a non-hibernating PartyServer (`hibernate: false`), the Durable Object sits on the server end of a connection that the runtime tunnels back to the client, so that auto-teardown could fire through an already-severed tunnel — surfacing as a spurious retryable `Network connection lost.` rejection (for example when a Durable Object is reset while a connection is still open). Half-open mode keeps PartyServer's existing close handling in control; it already reciprocates the peer's Close frame on every compatibility date, so client behavior is unchanged.

Also in this release, two related WebSocket fixes that keep behavior consistent across all compatibility dates:

- **Pin `binaryType` to `"arraybuffer"` for non-hibernating connections.** On compatibility dates `>= 2026-03-17` the `websocket_standard_binary_type` flag flips the default server-side `binaryType` from `"arraybuffer"` to `"blob"`, so binary frames arrived as `Blob` instead of `ArrayBuffer` on the in-memory path. PartyServer (and frameworks built on it, e.g. Cloudflare Agents) have always received `ArrayBuffer`, so it is now pinned back in `accept()`. This is a no-op on older dates and corrective on newer ones; the Hibernation API is unaffected (it always delivers `ArrayBuffer`).
- **Stop reporting transport-teardown errors as `onError`.** A retryable `Network connection lost.` / `WebSocket peer disconnected` error that fires on an already closing/closed connection is the socket going away during the close handshake, not an application error. It is now suppressed when the connection is `CLOSING`/`CLOSED` (detected via the structured `retryable` flag, with a message fallback), so it no longer spams logs on abrupt client disconnects. Genuine mid-connection (`OPEN`) errors still reach `onError`.
