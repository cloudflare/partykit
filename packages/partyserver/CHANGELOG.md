# partyflare

## 0.1.0

### Minor Changes

- [#302](https://github.com/cloudflare/partykit/pull/302) [`88474b1`](https://github.com/cloudflare/partykit/commit/88474b1fda322b13aebd543ea4a0638ae87aad32) Thanks [@threepointone](https://github.com/threepointone)! - change Env types to default to Cloudflare.Env

### Patch Changes

- [`3ec313e`](https://github.com/cloudflare/partykit/commit/3ec313ee4d737cbc33be3621178f002435f2fa2b) Thanks [@threepointone](https://github.com/threepointone)! - don't throw when a request doesn't match a namespace

## 0.0.78

### Patch Changes

- [`7360225`](https://github.com/cloudflare/partykit/commit/7360225fc92978f38edce71f54afb84b25b7bdcb) Thanks [@threepointone](https://github.com/threepointone)! - fix publishes

## 0.0.77

### Patch Changes

- [#298](https://github.com/cloudflare/partykit/pull/298) [`43bd6cc`](https://github.com/cloudflare/partykit/commit/43bd6ccbf7a94484b1f377c3df0cf26ce8792669) Thanks [@threepointone](https://github.com/threepointone)! - update deps

## 0.0.76

### Patch Changes

- [#296](https://github.com/cloudflare/partykit/pull/296) [`3a48ec9`](https://github.com/cloudflare/partykit/commit/3a48ec97f64885fcd8860b1d9f228bb250789862) Thanks [@threepointone](https://github.com/threepointone)! - Add experimental waitUntil API for long-running tasks

  Introduces an internal keep-alive WebSocket endpoint and the experimental_waitUntil method to allow Durable Objects to remain alive while executing long-running async functions. This mechanism uses a self-connecting WebSocket with periodic pings and requires the 'enable_ctx_exports' compatibility flag. Additional handling is added to ignore keep-alive sockets in WebSocket event methods.

  Based on @eastlondoner's https://github.com/eastlondoner/better-wait-until

## 0.0.75

### Patch Changes

- [#280](https://github.com/cloudflare/partykit/pull/280) [`501370d`](https://github.com/cloudflare/partykit/commit/501370d4ed5976a073aa96f9eaeea23224053093) Thanks [@threepointone](https://github.com/threepointone)! - update dependencies

## 0.0.74

### Patch Changes

- [`537714c`](https://github.com/cloudflare/partykit/commit/537714c8a6d70abcac13710e357ce9a953c7d0d3) Thanks [@threepointone](https://github.com/threepointone)! - drain body on /set-name

## 0.0.73

### Patch Changes

- [`3014f9f`](https://github.com/cloudflare/partykit/commit/3014f9fdb00bcfa6b27f61aa18630c5ba7b3932c) Thanks [@threepointone](https://github.com/threepointone)! - Allow routing ctx props to Server

## 0.0.72

### Patch Changes

- [#246](https://github.com/cloudflare/partykit/pull/246) [`a462739`](https://github.com/cloudflare/partykit/commit/a4627392628058702dcbb8c5d5acbea35b95be09) Thanks [@threepointone](https://github.com/threepointone)! - add .sql helper

## 0.0.71

### Patch Changes

- [#221](https://github.com/cloudflare/partykit/pull/221) [`20a68a8`](https://github.com/cloudflare/partykit/commit/20a68a841ef67464a41b55d500114cec6a8c6a6e) Thanks [@threepointone](https://github.com/threepointone)! - add homepage in package.jsons

## 0.0.70

### Patch Changes

- [`3f900b5`](https://github.com/cloudflare/partykit/commit/3f900b5f631ea3f8b8a70197890d1d551be3951d) Thanks [@threepointone](https://github.com/threepointone)! - trigger another release

## 0.0.69

### Patch Changes

- [`b0bc59c`](https://github.com/cloudflare/partykit/commit/b0bc59c017484c02b4d9cb9313c92fb66b36941f) Thanks [@threepointone](https://github.com/threepointone)! - trigger a release

- [`7ec1568`](https://github.com/cloudflare/partykit/commit/7ec15680fd1dcb257263d52d2c9cd5088e2f7c0a) Thanks [@threepointone](https://github.com/threepointone)! - replace url in package.json to point to cloudflare/partykit

## 0.0.68

### Patch Changes

- [#217](https://github.com/threepointone/partyserver/pull/217) [`a5d2dde`](https://github.com/threepointone/partyserver/commit/a5d2dde164bd9d38e1bac87b2d32d24c06742d2f) Thanks [@threepointone](https://github.com/threepointone)! - await the call that sets a party's name inside getServerByName

## 0.0.67

### Patch Changes

- [#205](https://github.com/threepointone/partyserver/pull/205) [`b1baf6c`](https://github.com/threepointone/partyserver/commit/b1baf6cdda4c7684a4663a1281070ab1762670fd) Thanks [@threepointone](https://github.com/threepointone)! - update deps

## 0.0.66

### Patch Changes

- [#199](https://github.com/threepointone/partyserver/pull/199) [`c41057b`](https://github.com/threepointone/partyserver/commit/c41057ba5c738496bc7e2a4968357f1f5b65707b) Thanks [@threepointone](https://github.com/threepointone)! - convert UPPERCASE bindings to lowercase as expected

- [#199](https://github.com/threepointone/partyserver/pull/199) [`b3701a5`](https://github.com/threepointone/partyserver/commit/b3701a5f5eee278c96587d9e29e42992806733ac) Thanks [@threepointone](https://github.com/threepointone)! - allow for sub/path/like prefixes on the server

## 0.0.65

### Patch Changes

- [#181](https://github.com/threepointone/partyserver/pull/181) [`3e56cce`](https://github.com/threepointone/partyserver/commit/3e56cceca2c253d7b4368299e018b73af6deb42b) Thanks [@threepointone](https://github.com/threepointone)! - update dependencies

## 0.0.64

### Patch Changes

- [`a240942`](https://github.com/threepointone/partyserver/commit/a240942d20540d70fc0076edb779302e6d621c65) Thanks [@threepointone](https://github.com/threepointone)! - update deps, use vite for one fixture

## 0.0.63

### Patch Changes

- [#157](https://github.com/threepointone/partyserver/pull/157) [`7710635`](https://github.com/threepointone/partyserver/commit/7710635d7fd0ca68047d966e0d1640a9fd3c09bc) Thanks [@aulneau](https://github.com/aulneau)! - Extract and export PartyServerOptions interface for use in other packages.

## 0.0.62

### Patch Changes

- [`2e3a8b0`](https://github.com/threepointone/partyserver/commit/2e3a8b0fe7e701a505ddee54e4bd1e1215bf7c3e) Thanks [@threepointone](https://github.com/threepointone)! - fix readme

## 0.0.61

### Patch Changes

- [#152](https://github.com/threepointone/partyserver/pull/152) [`b1307d2`](https://github.com/threepointone/partyserver/commit/b1307d286272140bb905ae6315c9a69ecbd136c1) Thanks [@threepointone](https://github.com/threepointone)! - implement onBeforeConnect/onBeforeRequest

## 0.0.60

### Patch Changes

- [`ce768f7`](https://github.com/threepointone/partyserver/commit/ce768f757c881461d0e2c7f64dacc2685340c4fb) Thanks [@threepointone](https://github.com/threepointone)! - update dependencies

## 0.0.59

### Patch Changes

- [`b5acc8e`](https://github.com/threepointone/partyserver/commit/b5acc8ebd55830239d5188bb114b718019e850b1) Thanks [@threepointone](https://github.com/threepointone)! - Update dependencies

## 0.0.58

### Patch Changes

- [#95](https://github.com/threepointone/partyserver/pull/95) [`071b3d6`](https://github.com/threepointone/partyserver/commit/071b3d6a0d00d9388880eaa8c1bbdf1ab812227a) Thanks [@threepointone](https://github.com/threepointone)! - Update dependencies

## 0.0.57

### Patch Changes

- [#93](https://github.com/threepointone/partyserver/pull/93) [`d429303`](https://github.com/threepointone/partyserver/commit/d42930390514b0b60d9ef0da6337af754df5447e) Thanks [@third774](https://github.com/third774)! - Filter `.getConnections()` to only include ready connections when in non-hibernating mode

## 0.0.56

### Patch Changes

- [#88](https://github.com/threepointone/partyserver/pull/88) [`ec7a698`](https://github.com/threepointone/partyserver/commit/ec7a698510f1d4810db923656c7e6ab90cb83165) Thanks [@aryasaatvik](https://github.com/aryasaatvik)! - update @cloudflare/workers-types

## 0.0.55

### Patch Changes

- [`d58418c`](https://github.com/threepointone/partyserver/commit/d58418c5aeb1795b17ce2994b7ae51994abf428b) Thanks [@threepointone](https://github.com/threepointone)! - remove the scary warning from the readme

## 0.0.54

### Patch Changes

- [#85](https://github.com/threepointone/partyserver/pull/85) [`5a744fb`](https://github.com/threepointone/partyserver/commit/5a744fbdfd074fce49daaf6a3b8315a6f6588560) Thanks [@threepointone](https://github.com/threepointone)! - Update dependencies

## 0.0.53

### Patch Changes

- [#83](https://github.com/threepointone/partyserver/pull/83) [`ca4a8c5`](https://github.com/threepointone/partyserver/commit/ca4a8c57bc0f15e115ba19cefa52d4ba013ea901) Thanks [@threepointone](https://github.com/threepointone)! - fix: .name available in onStart, faster getServerByName

## 0.0.52

### Patch Changes

- [#81](https://github.com/threepointone/partyserver/pull/81) [`42e6502`](https://github.com/threepointone/partyserver/commit/42e65020dd96c424f98d19977739cef3d06ca3d4) Thanks [@threepointone](https://github.com/threepointone)! - implement onAlarm

## 0.0.51

### Patch Changes

- [`81b2511`](https://github.com/threepointone/partyserver/commit/81b2511e88a7f8d28ba8027a98ced813281bf784) Thanks [@threepointone](https://github.com/threepointone)! - fix readme

## 0.0.50

### Patch Changes

- [`c662425`](https://github.com/threepointone/partyserver/commit/c662425f24b7dcc1ae1f8dbf81def474ffad9261) Thanks [@threepointone](https://github.com/threepointone)! - use kebabcase when converting binding name to a party name

## 0.0.49

### Patch Changes

- [`af89974`](https://github.com/threepointone/partyserver/commit/af89974fea9bcd8d6bbbc31f5d308d9558885211) Thanks [@threepointone](https://github.com/threepointone)! - fix CI failure, run gen-ids tests, tweak warning on "main" party access

## 0.0.48

### Patch Changes

- [`2530531`](https://github.com/threepointone/partyserver/commit/25305313cd2e3901800232ce01e5a144075bb9e4) Thanks [@threepointone](https://github.com/threepointone)! - partyserver: update deps, author email

## 0.0.47

### Patch Changes

- [`6993aec`](https://github.com/threepointone/partyserver/commit/6993aece9de79d8855de8079d27bdebe4b96f3ce) Thanks [@threepointone](https://github.com/threepointone)! - partyserver: better docs

## 0.0.46

### Patch Changes

- [`528adea`](https://github.com/threepointone/partyserver/commit/528adeaced6dce6e888d2f54cc75c3569bf2c277) Thanks [@threepointone](https://github.com/threepointone)! - some fixes and tweaks
  - getServerByName was throwing on all requests
  - `Env` is now an optional arg when defining `Server`
  - `y-partyserver/provider` can now take an optional `prefix` arg to use a custom url to connect
  - `routePartyKitRequest`/`getServerByName` now accepts `jurisdiction`

  bonus:
  - added a bunch of fixtures
  - added stubs for docs

## 0.0.45

### Patch Changes

- [#62](https://github.com/threepointone/partyserver/pull/62) [`f9a0047`](https://github.com/threepointone/partyserver/commit/f9a0047fbcb561a20c9cf001c9808023d0b60288) Thanks [@threepointone](https://github.com/threepointone)! - close connection if sending broadcast message fails

- [#60](https://github.com/threepointone/partyserver/pull/60) [`50883c9`](https://github.com/threepointone/partyserver/commit/50883c9e3715e3a54806d2ba0c514d72bf9fb5d3) Thanks [@threepointone](https://github.com/threepointone)! - feat: catch errors in DO's fetch

  Catch errors in a DO's fetch. Basic.
  We log the error stack right now which isn't a great thing, we'll revisit that later.

## 0.0.44

### Patch Changes

- [`cb884ea`](https://github.com/threepointone/partyserver/commit/cb884ea811e4dcbb2d3056c0c4077b13adc59e21) Thanks [@threepointone](https://github.com/threepointone)! - don't fail when string bindings are in env

## 0.0.43

### Patch Changes

- [`6edd35e`](https://github.com/threepointone/partyserver/commit/6edd35e3f489d047867d3f8097b54566882a9173) Thanks [@threepointone](https://github.com/threepointone)! - A better error when trying to read .name before it's set

## 0.0.42

### Patch Changes

- [`ba68c03`](https://github.com/threepointone/partyserver/commit/ba68c036dc7edf4b7ae355e5570c6831a064a98c) Thanks [@threepointone](https://github.com/threepointone)! - fix: workaround for https://github.com/cloudflare/workerd/issues/2240

  While waiting for https://github.com/cloudflare/workerd/issues/2240 to be fixed, let's instead send the namespace/room name ahead in the first request. This should be fine for all our websocket usecases for now

## 0.0.41

### Patch Changes

- [`fa89266`](https://github.com/threepointone/partyserver/commit/fa89266ccc817a43e0a0274646a9f7265bf46320) Thanks [@threepointone](https://github.com/threepointone)! - update deps

## 0.0.40

### Patch Changes

- [`b54093e`](https://github.com/threepointone/partyserver/commit/b54093e9964ddf2457e9204d809f243c8b5ad808) Thanks [@threepointone](https://github.com/threepointone)! - nope

## 0.0.39

### Patch Changes

- [`2a254db`](https://github.com/threepointone/partyserver/commit/2a254dba427aa509c2fddc26be0ef3bbec881afc) Thanks [@threepointone](https://github.com/threepointone)! - trigger build

## 0.0.38

### Patch Changes

- [`74d7911`](https://github.com/threepointone/partyserver/commit/74d7911174dbb5f0a9a6f6925e9c615a19dbed74) Thanks [@threepointone](https://github.com/threepointone)! - s/Server.partyFetch/routePartyKitRequest

## 0.0.37

### Patch Changes

- [`5b91153`](https://github.com/threepointone/partyserver/commit/5b91153bceef64079eb5e3d86900fa916fbf2cf5) Thanks [@threepointone](https://github.com/threepointone)! - try another release

## 0.0.36

### Patch Changes

- [`eb347bc`](https://github.com/threepointone/partyserver/commit/eb347bc1da9bf4c1a6499b716ab4b33050afec00) Thanks [@threepointone](https://github.com/threepointone)! - trigger a build

## 0.0.35

### Patch Changes

- [`ecec09d`](https://github.com/threepointone/partyserver/commit/ecec09dc329eeeb8789c969135812f7d55e9b8cb) Thanks [@threepointone](https://github.com/threepointone)! - use ts for workflow scripts, add y-partyserver to version-script

## 0.0.34

### Patch Changes

- [`c480e92`](https://github.com/threepointone/partyserver/commit/c480e925647c3634d7ae50232fcdddf3dd7e4ad4) Thanks [@threepointone](https://github.com/threepointone)! - use blockConcurrencyWhile for onStart

## 0.0.33

### Patch Changes

- [`edb1a5a`](https://github.com/threepointone/partyserver/commit/edb1a5a461f58c3aacf240b75fbc7bc7a13db3b3) Thanks [@threepointone](https://github.com/threepointone)! - trigger a release

## 0.0.32

### Patch Changes

- [`41927c4`](https://github.com/threepointone/partyflare/commit/41927c43e032db30adb186787e5838df2005f08f) Thanks [@threepointone](https://github.com/threepointone)! - avoid string drama

## 0.0.31

### Patch Changes

- [`f877021`](https://github.com/threepointone/partyflare/commit/f8770218e04f93a45a81d182f6f4d89aaa4ac6b2) Thanks [@threepointone](https://github.com/threepointone)! - configurable prefix for .partyFetch

## 0.0.30

### Patch Changes

- [`96d153c`](https://github.com/threepointone/partyflare/commit/96d153c090d2c5ffde5c7fa2196c46136304ee85) Thanks [@threepointone](https://github.com/threepointone)! - bump

## 0.0.29

### Patch Changes

- [`df3f51a`](https://github.com/threepointone/partyflare/commit/df3f51a18ffbe0599090db870fe77e97c81fc80d) Thanks [@threepointone](https://github.com/threepointone)! - add some more docs

## 0.0.28

### Patch Changes

- [`d1da6d7`](https://github.com/threepointone/partyflare/commit/d1da6d74b16f3905ba9797f471de53d237f855b9) Thanks [@threepointone](https://github.com/threepointone)! - fix: rehydrate server name on websocket based hydration

## 0.0.27

### Patch Changes

- [`246ccc5`](https://github.com/threepointone/partyflare/commit/246ccc51a00e9fdfe8767a0793aa4221550fa49f) Thanks [@threepointone](https://github.com/threepointone)! - more doc stuff

## 0.0.26

### Patch Changes

- [`5494f87`](https://github.com/threepointone/partyflare/commit/5494f870bfbb1c102359fcfb383750b0b08828bd) Thanks [@threepointone](https://github.com/threepointone)! - s/Server.withName/getServerByName, s/Server.fetchServerForRequest/Server.partyFetch

## 0.0.25

### Patch Changes

- [`4010235`](https://github.com/threepointone/partyflare/commit/4010235412711aa08511f7115611544a62a737c0) Thanks [@threepointone](https://github.com/threepointone)! - rename a bunch of things
  - Party -> Server
  - .room -> .name
  - withRoom -> withName
  - fetchRoomForRequest -> fetchServerForRequest

## 0.0.24

### Patch Changes

- [`5126257`](https://github.com/threepointone/partyflare/commit/51262570bc94456651abd5a5b17056204bc0052a) Thanks [@threepointone](https://github.com/threepointone)! - tweak some more warnings

## 0.0.23

### Patch Changes

- [`3e33acf`](https://github.com/threepointone/partyflare/commit/3e33acfe34ed42622ade605899a576b4b2ce0ba2) Thanks [@threepointone](https://github.com/threepointone)! - chatgpt readme

## 0.0.22

### Patch Changes

- [`569fa76`](https://github.com/threepointone/partyflare/commit/569fa7648f82f6f80b4b5b701eff1e95e04ebd95) Thanks [@threepointone](https://github.com/threepointone)! - more stuff in readme

## 0.0.21

### Patch Changes

- [`f328fcb`](https://github.com/threepointone/partyflare/commit/f328fcba8bbd541fa12af08bbbd6d99c9b815fdb) Thanks [@threepointone](https://github.com/threepointone)! - tweak some error messages

## 0.0.20

### Patch Changes

- [`1e61151`](https://github.com/threepointone/partyflare/commit/1e6115113667e1c6e78fbbf01a22d1e2a95d6a37) Thanks [@threepointone](https://github.com/threepointone)! - tighter deps

- [`48ed3df`](https://github.com/threepointone/partyflare/commit/48ed3dfde6bf03055c2f8df371a4560bc78dbaeb) Thanks [@threepointone](https://github.com/threepointone)! - nanoid should be a regular dep

## 0.0.19

### Patch Changes

- [`1be87b0`](https://github.com/threepointone/partyflare/commit/1be87b022f7daa1d8337bc7bae3b7d43d927c04d) Thanks [@threepointone](https://github.com/threepointone)! - remove legacy\_ methods

- [`32f8b08`](https://github.com/threepointone/partyflare/commit/32f8b084eb1f37583e5627fc875dc54589a8f31d) Thanks [@threepointone](https://github.com/threepointone)! - add locationHint, make remix work inside a party, add a workaround for the ordering issue, adds loggin for some unimplemented methods

## 0.0.18

### Patch Changes

- [`b519e51`](https://github.com/threepointone/partyflare/commit/b519e51d747bad1925db28c27709ebb9e30f9e77) Thanks [@threepointone](https://github.com/threepointone)! - s/ Party.match/Party.fetchRoomForRequest

## 0.0.17

### Patch Changes

- [`6e253c8`](https://github.com/threepointone/partyflare/commit/6e253c84f83ac9ce9e26d980606d8edbcbecdb58) Thanks [@threepointone](https://github.com/threepointone)! - Update package.json details

## 0.0.16

### Patch Changes

- [`bc6711e`](https://github.com/threepointone/partyflare/commit/bc6711ea2ea1e410bb57b591eb77fd01cfc7bdd8) Thanks [@threepointone](https://github.com/threepointone)! - Decouples URL and Party identity, Introduce Party.withRoom().

## 0.0.15

### Patch Changes

- [`fdbf419`](https://github.com/threepointone/partyflare/commit/fdbf4196e5e36e249480f337c32ce89fe672cfda) Thanks [@threepointone](https://github.com/threepointone)! - mark public/private methods, add some inline docs

## 0.0.14

### Patch Changes

- [`cf62851`](https://github.com/threepointone/partyflare/commit/cf62851789cf164c1f707e377238d45f35f11b08) Thanks [@threepointone](https://github.com/threepointone)! - Add docs for other methods

## 0.0.13

### Patch Changes

- [`054ff57`](https://github.com/threepointone/partyflare/commit/054ff570fe86fc034cc93c0ade2ba0a267b1ee40) Thanks [@threepointone](https://github.com/threepointone)! - strict lints

## 0.0.12

### Patch Changes

- [`6f52478`](https://github.com/threepointone/partyflare/commit/6f52478d1f52e2c904663324457a36482a21c1fe) Thanks [@threepointone](https://github.com/threepointone)! - call onStart only once

## 0.0.11

### Patch Changes

- [`c6f3dfe`](https://github.com/threepointone/partyflare/commit/c6f3dfefaf58bd4938ab3eab9400c9ae66576260) Thanks [@threepointone](https://github.com/threepointone)! - actually share repo url

## 0.0.10

### Patch Changes

- [`4189013`](https://github.com/threepointone/partyflare/commit/4189013b2151354fbe99dced3c853e2a41437098) Thanks [@threepointone](https://github.com/threepointone)! - Fix default URL parsing

## 0.0.9

### Patch Changes

- [`5c97caf`](https://github.com/threepointone/partyflare/commit/5c97cafd88004b20d44b07118fa8616cc9d7a8fe) Thanks [@threepointone](https://github.com/threepointone)! - Better errors when onRequest hasn't been implemented or connection.room isn't available

## 0.0.8

### Patch Changes

- [`c1b8460`](https://github.com/threepointone/partyflare/commit/c1b846009e5f41caa9a00b4f16c36b96bc8ed9b8) Thanks [@threepointone](https://github.com/threepointone)! - Add proper repo to package.json

## 0.0.7

### Patch Changes

- [`24f08ce`](https://github.com/threepointone/partyflare/commit/24f08ce8fb4854d2793c4c3bff267b0a107ef956) Thanks [@threepointone](https://github.com/threepointone)! - Test changeset release

## 0.0.6

### Patch Changes

- [`64be210`](https://github.com/threepointone/partyflare/commit/64be210f388866ec6bb63920c05fda4507dab7a9) Thanks [@threepointone](https://github.com/threepointone)! - Add a note about hibernation

## 0.0.5

### Patch Changes

- [`7f86d79`](https://github.com/threepointone/partyflare/commit/7f86d79daf2a3305682f1f64214d60d9d7f4da14) Thanks [@threepointone](https://github.com/threepointone)! - s/this.id/this.room, added some docs

## 0.0.4

### Patch Changes

- [#3](https://github.com/threepointone/partyflare/pull/3) [`3ee6b5c`](https://github.com/threepointone/partyflare/commit/3ee6b5c608c37bef888a8c7714a3255984644814) Thanks [@threepointone](https://github.com/threepointone)! - fix url parsing

## 0.0.3

### Patch Changes

- [#1](https://github.com/threepointone/partyflare/pull/1) [`e38f6ab`](https://github.com/threepointone/partyflare/commit/e38f6ab4ebaa689c3d900c5cf5eb45a57992dca7) Thanks [@threepointone](https://github.com/threepointone)! - fix builds
