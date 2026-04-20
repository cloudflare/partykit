---
"partysocket": patch
---

Fix `protocols` type in `PartySocketOptions` to accept `ProtocolsProvider` instead of `string[]`, matching the full range of types already supported by the underlying `ReconnectingWebSocket`.
