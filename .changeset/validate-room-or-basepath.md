---
"partysocket": patch
---

Throw a clear error when constructing a `PartySocket` without `room` or `basePath` (and without `startClosed: true`), instead of silently connecting to a malformed URL containing `"undefined"` as the room name.
