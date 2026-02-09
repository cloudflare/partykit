---
"partyserver": patch
---

Add `lobby.className` to `onBeforeConnect`/`onBeforeRequest` callbacks, providing the Durable Object class name (e.g. `"MyAgent"`). The existing `lobby.party` field is now deprecated (it returns the kebab-case URL namespace) and will be changed to return the class name in the next major version.
