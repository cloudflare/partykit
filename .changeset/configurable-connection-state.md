---
"partyserver": patch
---

Add `configurable: true` to the `state`, `setState`, `serializeAttachment`, and `deserializeAttachment` property descriptors on connection objects. This allows downstream consumers (like the Cloudflare Agents SDK) to redefine these properties with `Object.defineProperty` for namespacing or wrapping internal state storage. Default behavior is unchanged.
