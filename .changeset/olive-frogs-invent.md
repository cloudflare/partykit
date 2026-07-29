---
"partyserver": patch
---

Allow user-defined interfaces as `Props`.

Interfaces do not get implicit index signatures in TypeScript, so the previous `Record<string, unknown>` bound rejected them with "Index signature for type 'string' is missing". `Props` is now bounded by `object` on `Server`, `getServerByName`, and `routePartykitRequest`, and the `T` constraints on the latter two are `Server<Env, object>` so subclasses declaring interface `Props` satisfy them too. Generic defaults stay `Record<string, unknown>`, so untyped usage still reads props values as `unknown`.
