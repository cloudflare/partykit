# `alarm-restart-e2e`

Reproducer for the runtime contract that motivates partyserver's
`__ps_name` fallback record. Pins down behavior reported in
[cloudflare/partykit#390](https://github.com/cloudflare/partykit/issues/390)
across three Durable Objects in the same Worker:

| DO           | Class                             | Extends                                                                    |
| ------------ | --------------------------------- | -------------------------------------------------------------------------- |
| `RawAlarm`   | `RawAlarm`                        | `DurableObject` (no PartyServer)                                           |
| `StockAlarm` | `StockAlarm` (built from a mixin) | `Server` from `partyserver@0.5.3` (aliased as `partyserver-stock`)         |
| `FixedAlarm` | `FixedAlarm` (built from a mixin) | `Server` from this workspace's local `partyserver` (with the fallback fix) |

Each DO records an observation (`{source, ctxIdName, storedPsName,
partyName, partyNameError, at}`) to its own SQLite-backed storage on
every entry through `fetch()` or `alarm()`. Observations accumulate
across dev-server restarts.

## Run the experiment

```bash
npm install
npm run start
```

In a second shell, schedule an alarm into a fresh room and observe:

```bash
ROOM="cold-strict-$(date +%s)"

# Session A: schedule into a fresh room. This is the only entry into
# the DO instances during session A. After this, the alarm record on
# disk is what carries the DO across the restart.
curl -s "http://localhost:5173/raw/$ROOM?schedule=45"
curl -s "http://localhost:5173/parties/stock-alarm/$ROOM?schedule=45"
curl -s "http://localhost:5173/parties/fixed-alarm/$ROOM?schedule=45"
```

Then kill `vite dev` (Ctrl-C), restart it (`npm run start`), and
**don't touch the room** until well past the 45-second mark. Then:

```bash
curl -s "http://localhost:5173/raw/$ROOM?snapshot=1" | jq
curl -s -i "http://localhost:5173/parties/stock-alarm/$ROOM?snapshot=1" | head -n 12
curl -s "http://localhost:5173/parties/fixed-alarm/$ROOM?snapshot=1" | jq
```

Observed behavior on `workerd@1.20260424.1`,
`compatibility_date: "2026-01-28"`:

- `RawAlarm`: alarm observation has no `ctxIdName` (i.e. `ctx.id.name`
  is `undefined`). Subsequent fetches via `idFromName(...)` ALSO see
  `ctx.id.name === undefined` for the lifetime of that DO instance —
  the instance is "born nameless" and stays that way.

- `StockAlarm`: `Server.fetch` returns 500 with the "Cannot determine
  the name" error. Reproduces the failure reported in cloudflare/partykit#390.

- `FixedAlarm`: `alarm()` runs successfully. `ctx.id.name` is
  `undefined` in the observation, but `this.name` resolves from the
  on-disk `__ps_name` record that PartyServer wrote during session
  A's fetch. `partyserver` recovers the name; the DO continues
  working normally.

## Why three DOs

`RawAlarm` pins down what workerd actually does, free of any
framework. `StockAlarm` reproduces the user-reported bug under
`partyserver@0.5.3`. `FixedAlarm` validates that the workspace fix
restores normal operation under the same conditions.

## Critical: don't warm the DOs before the alarm fires

Any HTTP fetch or websocket message sent to a DO between session B
startup and the alarm firing time will wake the DO via that entry
point first. workerd captures `ctx.id.name` from the first entry
point and that value persists for the instance's lifetime. So a
pre-alarm fetch silently warms `ctx.id.name` and masks the bug. The
critical window is from `vite dev` starting back up until the
expected alarm fire time. Don't open the page in a browser, don't
curl `?snapshot`, don't let any client reconnect to the room. Just
wait.

The frontend `index.html` exists for manual exploration but is
deliberately separate from the cold-DO experiment so a developer
running the page won't accidentally warm a different room. To run
the cold experiment, drive everything from `curl` against rooms the
frontend isn't subscribed to.
