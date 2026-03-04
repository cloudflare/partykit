---
"partyserver": patch
---

Add `__unsafe_ensureInitialized()` method to `Server` for frameworks that receive calls via native DO RPC, bypassing the standard fetch/alarm/webSocket entry points where name hydration and `onStart()` normally happen.
