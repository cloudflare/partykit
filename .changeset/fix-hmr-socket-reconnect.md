---
"partysocket": patch
---

Fix useStableSocket replacing socket on HMR/StrictMode effect re-runs. When Vite HMR fires, React Fast Refresh re-runs all effects — the old code unconditionally created a new socket, breaking downstream references (event listeners, \_pk identity, etc.). Now detects whether connection options actually changed via referential equality on the memoized options object: if unchanged (HMR), calls `socket.reconnect()` to preserve identity; if changed, creates a new socket as before.
