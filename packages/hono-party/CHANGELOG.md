# hono-party

## 2.1.0

### Minor Changes

- [#378](https://github.com/cloudflare/partykit/pull/378) [`f3ab44f`](https://github.com/cloudflare/partykit/commit/f3ab44f7c095a68df909911b2430eac9cf48229c) Thanks [@threepointone](https://github.com/threepointone)! - Use native `ctx.id.name` to populate `this.name`.

  Durable Objects now expose `ctx.id.name` on every entry point (constructor, fetch, alarm, hibernating websocket handlers) when the DO is addressed via `idFromName()`/`getByName()`. PartyServer now uses this as the primary source of `this.name`, which simplifies routing, eliminates storage writes, and makes `this.name` available inside the constructor.

  Changes in `partyserver`:

  - `this.name` resolves from `this.ctx.id.name`. The apologetic `workerd#2240` error message is gone.
  - `this.name` is now available **inside the constructor** and from class field initializers, not just after `setName()`/`fetch()` has run.
  - `routePartykitRequest` no longer issues a `setName()`/`_initAndFetch()` RPC before `fetch()`. The WebSocket path goes from 2 RPCs to 1; the HTTP path remains 1 RPC. Props, when supplied, are delivered to the DO via the `x-partykit-props` request header, set after `onBeforeConnect`/`onBeforeRequest` hooks run.
  - `getServerByName` continues to perform a single RPC to ensure `onStart()` has completed before returning, so user-defined RPC methods on the returned stub can rely on initialization being done. That RPC is now cheaper internally (no storage write; name is read from `ctx.id.name`).
  - `Server` no longer writes the `__ps_name` record to storage. Existing records remain on disk for backward compatibility and are only read inside `alarm()` as a fallback for alarms that were scheduled before 2026-03-15 (where `ctx.id.name` is not carried into the alarm handler — see the [Durable Objects ID docs](https://developers.cloudflare.com/durable-objects/api/id/#name)).
  - `setName()` and `_initAndFetch()` are marked `@deprecated`. They continue to work for backward compatibility. `setName(name)` now throws if `name` does not match `ctx.id.name`.
  - The `x-partykit-room` header is still accepted as a fallback when `ctx.id.name` is not available.
  - Error message when the name cannot be resolved has been rewritten to list the three real causes (unsupported addressing via `idFromString()`/`newUniqueId()`, runtime too old to expose `ctx.id.name`, or direct `stub.fetch()` without `routePartykitRequest`/`getServerByName`).
  - When reading `this.name` throws, it is because `ctx.id.name` is undefined and no legacy fallback has populated the name: the DO was addressed via `idFromString()` or `newUniqueId()` (both unsupported), the runtime is too old to expose `ctx.id.name`, or a pre-2026-03-15 alarm fired before the legacy storage fallback ran.

  Changes in all affected packages (`partyserver`, `partysub`, `partysync`, `y-partyserver`, `hono-party`):

  - `@cloudflare/workers-types` peer dependency bumped from `^4.20240729.0` to `^4.20260424.1`. The old range predates `ctx.id.name` in the type surface.

  Not supported: addressing PartyServer DOs via `idFromString()` or `newUniqueId()`. These paths return `ctx.id.name === undefined` inside the DO and will surface as a clear error from `this.name`. PartyServer has always assumed name-based addressing via `getServerByName` / `routePartykitRequest`; this release makes that assumption explicit.

## 2.0.3

### Patch Changes

- [`4e315b4`](https://github.com/cloudflare/partykit/commit/4e315b45e1c8f8d60ccfd2c348a8401086f71e26) Thanks [@threepointone](https://github.com/threepointone)! - update

## 2.0.2

### Patch Changes

- [#343](https://github.com/cloudflare/partykit/pull/343) [`c59d33d`](https://github.com/cloudflare/partykit/commit/c59d33d3296983e94a51126cf5bdb650679bb002) Thanks [@threepointone](https://github.com/threepointone)! - update deps

## 2.0.1

### Patch Changes

- [#339](https://github.com/cloudflare/partykit/pull/339) [`d1906a9`](https://github.com/cloudflare/partykit/commit/d1906a9936c352ce0dcd669e5f4ed57fa9dfbcea) Thanks [@threepointone](https://github.com/threepointone)! - Expose Hono context as a third argument to `onBeforeConnect` and `onBeforeRequest` callbacks, giving access to `c.env`, `c.var`, `c.get()`, etc.

## 2.0.0

### Patch Changes

- Updated dependencies [[`eef891a`](https://github.com/cloudflare/partykit/commit/eef891aae465d93b61b6ba36278115c41b3e1b11), [`c15e9d9`](https://github.com/cloudflare/partykit/commit/c15e9d9f85a7dbb9b640a46580d934b9b430a694)]:
  - partyserver@0.2.0

## 1.0.0

### Patch Changes

- Updated dependencies [[`3ec313e`](https://github.com/cloudflare/partykit/commit/3ec313ee4d737cbc33be3621178f002435f2fa2b), [`88474b1`](https://github.com/cloudflare/partykit/commit/88474b1fda322b13aebd543ea4a0638ae87aad32)]:
  - partyserver@0.1.0

## 0.0.20

### Patch Changes

- Updated dependencies [[`7360225`](https://github.com/cloudflare/partykit/commit/7360225fc92978f38edce71f54afb84b25b7bdcb)]:
  - partyserver@0.0.78

## 0.0.19

### Patch Changes

- [#298](https://github.com/cloudflare/partykit/pull/298) [`43bd6cc`](https://github.com/cloudflare/partykit/commit/43bd6ccbf7a94484b1f377c3df0cf26ce8792669) Thanks [@threepointone](https://github.com/threepointone)! - update deps

- Updated dependencies [[`43bd6cc`](https://github.com/cloudflare/partykit/commit/43bd6ccbf7a94484b1f377c3df0cf26ce8792669)]:
  - partyserver@0.0.77

## 0.0.18

### Patch Changes

- Updated dependencies [[`3a48ec9`](https://github.com/cloudflare/partykit/commit/3a48ec97f64885fcd8860b1d9f228bb250789862)]:
  - partyserver@0.0.76

## 0.0.17

### Patch Changes

- [#280](https://github.com/cloudflare/partykit/pull/280) [`501370d`](https://github.com/cloudflare/partykit/commit/501370d4ed5976a073aa96f9eaeea23224053093) Thanks [@threepointone](https://github.com/threepointone)! - update dependencies

- Updated dependencies [[`501370d`](https://github.com/cloudflare/partykit/commit/501370d4ed5976a073aa96f9eaeea23224053093)]:
  - partyserver@0.0.75

## 0.0.16

### Patch Changes

- Updated dependencies [[`537714c`](https://github.com/cloudflare/partykit/commit/537714c8a6d70abcac13710e357ce9a953c7d0d3)]:
  - partyserver@0.0.74

## 0.0.15

### Patch Changes

- Updated dependencies [[`3014f9f`](https://github.com/cloudflare/partykit/commit/3014f9fdb00bcfa6b27f61aa18630c5ba7b3932c)]:
  - partyserver@0.0.73

## 0.0.14

### Patch Changes

- [#266](https://github.com/cloudflare/partykit/pull/266) [`034051c`](https://github.com/cloudflare/partykit/commit/034051cd2851aa8690a87c925558aa11c88ed385) Thanks [@vickyRathee](https://github.com/vickyRathee)! - Clone request to keep the cf and other properties

## 0.0.13

### Patch Changes

- Updated dependencies [[`a462739`](https://github.com/cloudflare/partykit/commit/a4627392628058702dcbb8c5d5acbea35b95be09)]:
  - partyserver@0.0.72

## 0.0.12

### Patch Changes

- [#221](https://github.com/cloudflare/partykit/pull/221) [`20a68a8`](https://github.com/cloudflare/partykit/commit/20a68a841ef67464a41b55d500114cec6a8c6a6e) Thanks [@threepointone](https://github.com/threepointone)! - add homepage in package.jsons

- Updated dependencies [[`20a68a8`](https://github.com/cloudflare/partykit/commit/20a68a841ef67464a41b55d500114cec6a8c6a6e)]:
  - partyserver@0.0.71

## 0.0.11

### Patch Changes

- Updated dependencies [[`3f900b5`](https://github.com/cloudflare/partykit/commit/3f900b5f631ea3f8b8a70197890d1d551be3951d)]:
  - partyserver@0.0.70

## 0.0.10

### Patch Changes

- [`7ec1568`](https://github.com/cloudflare/partykit/commit/7ec15680fd1dcb257263d52d2c9cd5088e2f7c0a) Thanks [@threepointone](https://github.com/threepointone)! - replace url in package.json to point to cloudflare/partykit

- Updated dependencies [[`b0bc59c`](https://github.com/cloudflare/partykit/commit/b0bc59c017484c02b4d9cb9313c92fb66b36941f), [`7ec1568`](https://github.com/cloudflare/partykit/commit/7ec15680fd1dcb257263d52d2c9cd5088e2f7c0a)]:
  - partyserver@0.0.69

## 0.0.9

### Patch Changes

- Updated dependencies [[`a5d2dde`](https://github.com/threepointone/partyserver/commit/a5d2dde164bd9d38e1bac87b2d32d24c06742d2f)]:
  - partyserver@0.0.68

## 0.0.8

### Patch Changes

- [#205](https://github.com/threepointone/partyserver/pull/205) [`b1baf6c`](https://github.com/threepointone/partyserver/commit/b1baf6cdda4c7684a4663a1281070ab1762670fd) Thanks [@threepointone](https://github.com/threepointone)! - update deps

- Updated dependencies [[`b1baf6c`](https://github.com/threepointone/partyserver/commit/b1baf6cdda4c7684a4663a1281070ab1762670fd)]:
  - partyserver@0.0.67

## 0.0.7

### Patch Changes

- Updated dependencies [[`c41057b`](https://github.com/threepointone/partyserver/commit/c41057ba5c738496bc7e2a4968357f1f5b65707b), [`b3701a5`](https://github.com/threepointone/partyserver/commit/b3701a5f5eee278c96587d9e29e42992806733ac)]:
  - partyserver@0.0.66

## 0.0.6

### Patch Changes

- [#181](https://github.com/threepointone/partyserver/pull/181) [`3e56cce`](https://github.com/threepointone/partyserver/commit/3e56cceca2c253d7b4368299e018b73af6deb42b) Thanks [@threepointone](https://github.com/threepointone)! - update dependencies

- Updated dependencies [[`3e56cce`](https://github.com/threepointone/partyserver/commit/3e56cceca2c253d7b4368299e018b73af6deb42b)]:
  - partyserver@0.0.65

## 0.0.5

### Patch Changes

- [`a240942`](https://github.com/threepointone/partyserver/commit/a240942d20540d70fc0076edb779302e6d621c65) Thanks [@threepointone](https://github.com/threepointone)! - update deps, use vite for one fixture

- Updated dependencies [[`a240942`](https://github.com/threepointone/partyserver/commit/a240942d20540d70fc0076edb779302e6d621c65)]:
  - partyserver@0.0.64

## 0.0.4

### Patch Changes

- [`31fd65a`](https://github.com/threepointone/partyserver/commit/31fd65ad4239bf02a564d0fd2759b4bdd8529ac4) Thanks [@threepointone](https://github.com/threepointone)! - again

## 0.0.3

### Patch Changes

- [`d27636b`](https://github.com/threepointone/partyserver/commit/d27636b857e337faa7f66f3f8f33cdb40ca99bba) Thanks [@threepointone](https://github.com/threepointone)! - hono-party: better readme

## 0.0.2

### Patch Changes

- [#157](https://github.com/threepointone/partyserver/pull/157) [`63258e3`](https://github.com/threepointone/partyserver/commit/63258e3d14fe17cbc51f479b6021704469c05419) Thanks [@aulneau](https://github.com/aulneau)! - Add new Hono middleware package for PartyKit/PartyServer integration. Allows for easily exposing many PartyKit servers within a single Hono app.

- Updated dependencies [[`7710635`](https://github.com/threepointone/partyserver/commit/7710635d7fd0ca68047d966e0d1640a9fd3c09bc)]:
  - partyserver@0.0.63
