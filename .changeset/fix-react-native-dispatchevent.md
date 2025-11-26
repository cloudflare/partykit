---
"partysocket": patch
---

Fix React Native/Expo `dispatchEvent` TypeError

Added React Native environment detection to use Node-style event cloning. React Native/Expo environments have both `process` and `document` polyfilled but not `process.versions.node`, which caused browser-style event cloning to be selected incorrectly. Browser-style cloning produces events that fail `instanceof Event` checks in `event-target-polyfill`.

Fixes #257
