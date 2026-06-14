---
"partyserver": patch
---

Encode the `x-partykit-props` header as base64 so props containing non-ASCII characters (e.g. accented names like "Usuário") no longer trigger workerd's "header value contains non-ASCII characters" warning, which would throw a `TypeError` in browser fetch implementations. The header is decoded back to the original Unicode payload on the server, and raw-JSON values from older callers are still accepted for backwards compatibility.
