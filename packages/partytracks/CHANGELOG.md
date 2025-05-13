# partytracks

## 0.0.39

### Patch Changes

- [#216](https://github.com/cloudflare/partykit/pull/216) [`964a1c4`](https://github.com/cloudflare/partykit/commit/964a1c491b3206bf82dcd63f12a328477baa9896) Thanks [@third774](https://github.com/third774)! - Change useOnEmit to useObservable, and allow for error and complete callbacks

- [#216](https://github.com/cloudflare/partykit/pull/216) [`fb6adc2`](https://github.com/cloudflare/partykit/commit/fb6adc2af78b3d1027e3c145f41c9ab916b92013) Thanks [@third774](https://github.com/third774)! - - Add getMic, getCamera, and createAudioSink utils.

  - Lock sessions to their initiator via a cookie w/ JWT.
  - Fixed a bug where toggling a device off and on rapidly could leave it in a "stuck on" state.

- [#216](https://github.com/cloudflare/partykit/pull/216) [`9c9d9df`](https://github.com/cloudflare/partykit/commit/9c9d9dfcbac565e017852a1773dbbe79117b924d) Thanks [@third774](https://github.com/third774)! - Add getScreenshare util

## 0.0.38

### Patch Changes

- [#221](https://github.com/cloudflare/partykit/pull/221) [`20a68a8`](https://github.com/cloudflare/partykit/commit/20a68a841ef67464a41b55d500114cec6a8c6a6e) Thanks [@threepointone](https://github.com/threepointone)! - add homepage in package.jsons

## 0.0.37

### Patch Changes

- [`7ec1568`](https://github.com/cloudflare/partykit/commit/7ec15680fd1dcb257263d52d2c9cd5088e2f7c0a) Thanks [@threepointone](https://github.com/threepointone)! - replace url in package.json to point to cloudflare/partykit

## 0.0.36

### Patch Changes

- [#214](https://github.com/threepointone/partyserver/pull/214) [`2e6f3ca`](https://github.com/threepointone/partyserver/commit/2e6f3ca2b94ba01a73a96132f01af0bfdf04d91d) Thanks [@third774](https://github.com/third774)! - Explicitly emit undefined

## 0.0.35

### Patch Changes

- [#212](https://github.com/threepointone/partyserver/pull/212) [`416abdc`](https://github.com/threepointone/partyserver/commit/416abdc9e643561246e75275407f431c154e4fb4) Thanks [@third774](https://github.com/third774)! - Fix issue with pulling tracks that weren't pushed with simulcast

## 0.0.34

### Patch Changes

- [#207](https://github.com/threepointone/partyserver/pull/207) [`cc542ea`](https://github.com/threepointone/partyserver/commit/cc542ea2a1f23523b34beea48a70a9c1b17a9d12) Thanks [@third774](https://github.com/third774)! - Wait for signalingState instead of connectionState

- [#211](https://github.com/threepointone/partyserver/pull/211) [`c82b772`](https://github.com/threepointone/partyserver/commit/c82b772f68507967402f8e5d8cfcd235262b5617) Thanks [@third774](https://github.com/third774)! - Allow preferredRid to be empty string

## 0.0.33

### Patch Changes

- [#197](https://github.com/threepointone/partyserver/pull/197) [`4c164b6`](https://github.com/threepointone/partyserver/commit/4c164b6c69aa5fa0dfe70d935d2002e8b766d132) Thanks [@third774](https://github.com/third774)! - - Update sendEncodings to be an observable.
  - Only update preferridRid after it has changed.

## 0.0.32

### Patch Changes

- [#195](https://github.com/threepointone/partyserver/pull/195) [`e895f0b`](https://github.com/threepointone/partyserver/commit/e895f0bd13a3bef35bffd4e2f4ba0b7ac451c60c) Thanks [@third774](https://github.com/third774)! - Update track cleanup/close logic to be more stable

## 0.0.31

### Patch Changes

- [#193](https://github.com/threepointone/partyserver/pull/193) [`947e166`](https://github.com/threepointone/partyserver/commit/947e1666c7d8486a990ff5b3a94981a36aafba73) Thanks [@threepointone](https://github.com/threepointone)! - fix effect dependency

- [#192](https://github.com/threepointone/partyserver/pull/192) [`2b190cb`](https://github.com/threepointone/partyserver/commit/2b190cb5b5ccfe0be88bc7905b85552d70a6825d) Thanks [@third774](https://github.com/third774)! - Bug fix: Stop transceiver right before renegotiating. This avoids a potential undesirable outcome where
  a transceiver could be released and _potentially_ re-used in a subsequent negotiation before the track
  is actually closed.

## 0.0.30

### Patch Changes

- [#188](https://github.com/threepointone/partyserver/pull/188) [`08286bd`](https://github.com/threepointone/partyserver/commit/08286bd96acd93a4e30683cd6d91bd77a98c2453) Thanks [@third774](https://github.com/third774)! - Reset useObservableAsValue state when observable changes

## 0.0.29

### Patch Changes

- [#186](https://github.com/threepointone/partyserver/pull/186) [`bdfcdce`](https://github.com/threepointone/partyserver/commit/bdfcdce562f84a94ceb4bc03be133a82d8969839) Thanks [@third774](https://github.com/third774)! - - Enable sending simulcast via sendEncodings

  - Change encodings$ when pushing a track to not be an observable (changing requires renegotiation anyways)

- [#186](https://github.com/threepointone/partyserver/pull/186) [`e5045fd`](https://github.com/threepointone/partyserver/commit/e5045fd052bdb8369b6cfaf54d4c619d3ac32a81) Thanks [@third774](https://github.com/third774)! - Enable pulling simulcast tracks with preferredRid

## 0.0.28

### Patch Changes

- [#184](https://github.com/threepointone/partyserver/pull/184) [`3bcd1d9`](https://github.com/threepointone/partyserver/commit/3bcd1d9d9f9f1819ec2a292d8fd605319aa15c9b) Thanks [@third774](https://github.com/third774)! - Stop transceiver when closing track

## 0.0.27

### Patch Changes

- [#181](https://github.com/threepointone/partyserver/pull/181) [`3e56cce`](https://github.com/threepointone/partyserver/commit/3e56cceca2c253d7b4368299e018b73af6deb42b) Thanks [@threepointone](https://github.com/threepointone)! - update dependencies

## 0.0.26

### Patch Changes

- [#179](https://github.com/threepointone/partyserver/pull/179) [`a0bbb6c`](https://github.com/threepointone/partyserver/commit/a0bbb6c11e7a4a1eae8dc62e30ef477341899b77) Thanks [@third774](https://github.com/third774)! - Remove dtx codec

## 0.0.25

### Patch Changes

- [#177](https://github.com/threepointone/partyserver/pull/177) [`0cd24be`](https://github.com/threepointone/partyserver/commit/0cd24be1284929bd3fe7354273f47bdb0c4a7fd8) Thanks [@third774](https://github.com/third774)! - - Close tracks in bulk requests
  - Remove contentHint from getScreenshare$ utility

## 0.0.24

### Patch Changes

- [#175](https://github.com/threepointone/partyserver/pull/175) [`50f6732`](https://github.com/threepointone/partyserver/commit/50f6732c40506b7a10951e414ca70dfd995e676b) Thanks [@third774](https://github.com/third774)! - Retry forever with exponential backoff

## 0.0.23

### Patch Changes

- [#170](https://github.com/threepointone/partyserver/pull/170) [`de8562b`](https://github.com/threepointone/partyserver/commit/de8562bb5ccbb4b145c95b646b23076c7eedc151) Thanks [@third774](https://github.com/third774)! - Fix API extra params

## 0.0.22

### Patch Changes

- [#161](https://github.com/threepointone/partyserver/pull/161) [`c73b724`](https://github.com/threepointone/partyserver/commit/c73b724685581fe381bcb34d5944e9d4bfa1b17a) Thanks [@joelhooks](https://github.com/joelhooks)! - feat(docs): spruce up readmes

## 0.0.21

### Patch Changes

- [#164](https://github.com/threepointone/partyserver/pull/164) [`7066384`](https://github.com/threepointone/partyserver/commit/7066384e0aba0a5f1f00808d5165ec0d9478586d) Thanks [@third774](https://github.com/third774)! - Clean up request params

## 0.0.20

### Patch Changes

- [#162](https://github.com/threepointone/partyserver/pull/162) [`6baef07`](https://github.com/threepointone/partyserver/commit/6baef071c1239726fd1a672249175f17c36896f0) Thanks [@third774](https://github.com/third774)! - Replace sender$ and receiver$ with transceiver$

## 0.0.19

### Patch Changes

- [#150](https://github.com/threepointone/partyserver/pull/150) [`b0ad94b`](https://github.com/threepointone/partyserver/commit/b0ad94b665a07793efed318eb46f854158534657) Thanks [@third774](https://github.com/third774)! - Emit useValueAsObservable next values in microtask

## 0.0.18

### Patch Changes

- [#149](https://github.com/threepointone/partyserver/pull/149) [`b0b4ce7`](https://github.com/threepointone/partyserver/commit/b0b4ce703b1daacb7506a19003b91c34e1be13c0) Thanks [@third774](https://github.com/third774)! - Rename baseUrl to callsApiBaseUrl and allow pathname

## 0.0.17

### Patch Changes

- [#145](https://github.com/threepointone/partyserver/pull/145) [`200cc1a`](https://github.com/threepointone/partyserver/commit/200cc1a7758b1217a3491e73c26737667fe47395) Thanks [@third774](https://github.com/third774)! - Add baseUrl option to server route handler

## 0.0.16

### Patch Changes

- [#143](https://github.com/threepointone/partyserver/pull/143) [`13bb57b`](https://github.com/threepointone/partyserver/commit/13bb57bd9fe3610b04ab947a138ae9b5475ecc42) Thanks [@third774](https://github.com/third774)! - Add sender$ and receiver$ APIs

## 0.0.15

### Patch Changes

- [#141](https://github.com/threepointone/partyserver/pull/141) [`e2d2d92`](https://github.com/threepointone/partyserver/commit/e2d2d925ccc75dc4ec84005c854768961885a93b) Thanks [@third774](https://github.com/third774)! - Update partytracks readme w/ new api

## 0.0.14

### Patch Changes

- [#138](https://github.com/threepointone/partyserver/pull/138) [`e1bd62f`](https://github.com/threepointone/partyserver/commit/e1bd62f025c038213d9f9083819f9a2b97842ce6) Thanks [@third774](https://github.com/third774)! - Add utils for track acquisition

## 0.0.13

### Patch Changes

- [#136](https://github.com/threepointone/partyserver/pull/136) [`de57577`](https://github.com/threepointone/partyserver/commit/de575776132b3c4a256d072342d18c4731fc2333) Thanks [@third774](https://github.com/third774)! - Set default for maxApiHistory to 100

## 0.0.12

### Patch Changes

- [#133](https://github.com/threepointone/partyserver/pull/133) [`abc383a`](https://github.com/threepointone/partyserver/commit/abc383a33850e0110b5f3f861a7b4db9ec41f40e) Thanks [@third774](https://github.com/third774)! - Remove apiBase config option and replace with optional prefix config option, also renamed server proxy to handlePartyTracksRequest

## 0.0.11

### Patch Changes

- [#131](https://github.com/threepointone/partyserver/pull/131) [`3251b18`](https://github.com/threepointone/partyserver/commit/3251b181abd72e14a064427d66ae32400580749d) Thanks [@third774](https://github.com/third774)! - Remove setting transceivers to inactive when closing tracks

- [#131](https://github.com/threepointone/partyserver/pull/131) [`62553c4`](https://github.com/threepointone/partyserver/commit/62553c407eff604cca7586da633896148178cbdd) Thanks [@third774](https://github.com/third774)! - Add webrtc shim to readme

## 0.0.10

### Patch Changes

- [#129](https://github.com/threepointone/partyserver/pull/129) [`3088712`](https://github.com/threepointone/partyserver/commit/30887129eb3eb0a6d80798447aded96089dd46ef) Thanks [@third774](https://github.com/third774)! - Don't include react in bundle

## 0.0.9

### Patch Changes

- [#127](https://github.com/threepointone/partyserver/pull/127) [`6f624ab`](https://github.com/threepointone/partyserver/commit/6f624abff1278c64a2550d9a211807472b553644) Thanks [@third774](https://github.com/third774)! - Fix bug in useObservableAsValue

## 0.0.8

### Patch Changes

- [#125](https://github.com/threepointone/partyserver/pull/125) [`5240f79`](https://github.com/threepointone/partyserver/commit/5240f798a64b3f3dabece62bb3d0587a703ae875) Thanks [@third774](https://github.com/third774)! - Add react utils and update readme

## 0.0.7

### Patch Changes

- [#123](https://github.com/threepointone/partyserver/pull/123) [`2fe93ca`](https://github.com/threepointone/partyserver/commit/2fe93ca38d70fd333ba61ef6122b9df070e6e8c8) Thanks [@third774](https://github.com/third774)! - Update readme

## 0.0.6

### Patch Changes

- [#120](https://github.com/threepointone/partyserver/pull/120) [`f5e72e5`](https://github.com/threepointone/partyserver/commit/f5e72e58ed0f01cdb30b3c65489d49dc9bd24b22) Thanks [@third774](https://github.com/third774)! - Add client/server entrypoints

- [#122](https://github.com/threepointone/partyserver/pull/122) [`8e99325`](https://github.com/threepointone/partyserver/commit/8e993250de211ab00882e0e5d5c22b23fd375c2a) Thanks [@third774](https://github.com/third774)! - Rename server export and add comments to config params

## 0.0.5

### Patch Changes

- [#118](https://github.com/threepointone/partyserver/pull/118) [`b650dd8`](https://github.com/threepointone/partyserver/commit/b650dd8c4c32d7e1d19987d4693ec09ff702d39c) Thanks [@third774](https://github.com/third774)! - Put logging behind logger util w/ log level

## 0.0.4

### Patch Changes

- [`ebe674d`](https://github.com/threepointone/partyserver/commit/ebe674d1006c9a57da511c18b25c5278def9250b) Thanks [@threepointone](https://github.com/threepointone)! - fix readme

## 0.0.3

### Patch Changes

- [`2f20b6d`](https://github.com/threepointone/partyserver/commit/2f20b6d4341bb5c117b933b53946d67178ed512f) Thanks [@threepointone](https://github.com/threepointone)! - fix partytracks dependencies
