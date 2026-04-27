/**
 * Three Durable Objects side-by-side that all do the same thing
 * (schedule an alarm a few seconds out, record what they observe in
 * `alarm()`) so we can disentangle three layers of behavior:
 *
 *   - RawAlarm:   plain `DurableObject`, no PartyServer at all.
 *                 Pins the workerd contract for `ctx.id.name` in
 *                 alarm handlers.
 *
 *   - StockAlarm: extends Server from the unmodified, npm-published
 *                 `partyserver@0.5.3` (aliased here as
 *                 `partyserver-stock`). Reproduces the failure mode
 *                 reported in cloudflare/partykit#390 if the runtime
 *                 truly drops `ctx.id.name` on alarm wake.
 *
 *   - FixedAlarm: extends Server from this workspace's local
 *                 partyserver, which now persists a `__ps_name`
 *                 fallback during initialization. Verifies that the
 *                 fix recovers `this.name` even when `ctx.id.name`
 *                 is absent in the alarm handler.
 *
 * Each DO appends an "observation" to its own SQLite-backed storage
 * every time `alarm()` runs. Observations are never overwritten so
 * we can read them all back across a dev-server restart and see what
 * fired before / after.
 */

import { DurableObject, env } from "cloudflare:workers";
import { Server as FixedServer, routePartykitRequest } from "partyserver";
import { Server as StockServer } from "partyserver-stock";

import type { Connection, WSMessage } from "partyserver";

type Observation = {
  /** Wall clock time when the entry point ran. */
  at: number;
  /** Which entry point recorded this observation. */
  source: "fetch" | "alarm";
  /** Whatever the runtime told us at observation time. */
  ctxIdName: string | undefined;
  /** Snapshot of the legacy `__ps_name` fallback record on disk. */
  storedPsName: string | undefined;
  /**
   * For PartyServer-based DOs only: the value of `this.name`,
   * captured behind a try/catch since the getter throws when it
   * can't resolve.
   */
  partyName: string | null;
  /**
   * For PartyServer-based DOs only: the message thrown by the
   * `this.name` getter, if it threw.
   */
  partyNameError: string | null;
};

const OBSERVATIONS_KEY = "__observations";

async function appendObservation(
  storage: DurableObjectStorage,
  obs: Observation
): Promise<void> {
  const existing = (await storage.get<Observation[]>(OBSERVATIONS_KEY)) ?? [];
  existing.push(obs);
  await storage.put(OBSERVATIONS_KEY, existing);
}

async function readObservations(
  storage: DurableObjectStorage
): Promise<Observation[]> {
  return (await storage.get<Observation[]>(OBSERVATIONS_KEY)) ?? [];
}

/** Read partyserver's legacy fallback record without coupling to internals. */
async function readStoredPsName(
  storage: DurableObjectStorage
): Promise<string | undefined> {
  return storage.get<string>("__ps_name");
}

/**
 * Raw runtime probe. No PartyServer, just a `DurableObject`. Captures
 * `ctx.id.name` from both `fetch()` and `alarm()` so we can see exactly
 * what workerd hands us in each entry point, without any framework
 * fallback in between.
 */
export class RawAlarm extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.searchParams.has("schedule")) {
      const inSeconds = Number(url.searchParams.get("schedule") ?? "0");
      await this.ctx.storage.setAlarm(Date.now() + inSeconds * 1000);
      await appendObservation(this.ctx.storage, {
        at: Date.now(),
        source: "fetch",
        ctxIdName: this.ctx.id.name,
        storedPsName: await readStoredPsName(this.ctx.storage),
        partyName: null,
        partyNameError: null
      });
      return Response.json({ scheduled: true });
    }
    if (url.searchParams.has("snapshot")) {
      return Response.json({
        ctxIdName: this.ctx.id.name,
        observations: await readObservations(this.ctx.storage)
      });
    }
    return new Response("RawAlarm");
  }

  async alarm(): Promise<void> {
    await appendObservation(this.ctx.storage, {
      at: Date.now(),
      source: "alarm",
      ctxIdName: this.ctx.id.name,
      storedPsName: await readStoredPsName(this.ctx.storage),
      partyName: null,
      partyNameError: null
    });
  }
}

/**
 * Mixin that gives a PartyServer-based DO the same observation shape as
 * RawAlarm. Defined as a function so we can apply identical behavior to
 * the stock and the fixed PartyServer subclasses without duplicating
 * the code or relying on inheritance gymnastics across the two
 * versions.
 */
function definePartyServerAlarm<
  S extends typeof FixedServer | typeof StockServer
>(Base: S) {
  // The two `Server` types resolve to incompatible class types because
  // they come from different package versions, so we widen to `any` for
  // the inheritance and recover types at the boundary.
  return class extends (Base as unknown as typeof FixedServer) {
    static options = { hibernate: true };

    /**
     * HTTP-only entry points for the cold-DO experiment. We keep this
     * separate from the websocket flow so we can exercise scenarios
     * where no client is subscribed at all — meaning the alarm is
     * the very first entry into a cold DO instance.
     */
    async onRequest(request: Request): Promise<Response> {
      const url = new URL(request.url);
      if (url.searchParams.has("schedule")) {
        const inSeconds = Number(url.searchParams.get("schedule") ?? "0");
        await this.ctx.storage.setAlarm(Date.now() + inSeconds * 1000);
        await this.#appendObs("fetch");
        return Response.json({ scheduled: true });
      }
      if (url.searchParams.has("snapshot")) {
        const obs = await readObservations(this.ctx.storage);
        const { name, error } = this.#readNameSafely();
        return Response.json({
          ctxIdName: this.ctx.id.name,
          partyName: name,
          partyNameError: error,
          storedPsName: await readStoredPsName(this.ctx.storage),
          observations: obs
        });
      }
      return new Response("ok");
    }

    onConnect(connection: Connection): void {
      const { name, error } = this.#readNameSafely();
      connection.send(
        JSON.stringify({
          type: "connected",
          ctxIdName: this.ctx.id.name,
          partyName: name,
          partyNameError: error
        })
      );
    }

    async onMessage(connection: Connection, message: WSMessage): Promise<void> {
      type Incoming = { type?: string; inSeconds?: number };
      let parsed: Incoming | null = null;
      try {
        parsed = JSON.parse(String(message)) as Incoming;
      } catch {
        parsed = null;
      }
      const incoming = parsed;
      if (incoming?.type === "schedule") {
        const seconds = incoming.inSeconds ?? 0;
        await this.ctx.storage.setAlarm(Date.now() + seconds * 1000);
        await this.#appendObs("fetch");
        connection.send(
          JSON.stringify({ type: "scheduled", inSeconds: seconds })
        );
      } else if (incoming?.type === "snapshot") {
        const obs = await readObservations(this.ctx.storage);
        const { name, error } = this.#readNameSafely();
        connection.send(
          JSON.stringify({
            type: "snapshot",
            ctxIdName: this.ctx.id.name,
            partyName: name,
            partyNameError: error,
            storedPsName: await readStoredPsName(this.ctx.storage),
            observations: obs
          })
        );
      }
    }

    async onAlarm(): Promise<void> {
      await this.#appendObs("alarm");
    }

    async #appendObs(source: "fetch" | "alarm"): Promise<void> {
      const { name, error } = this.#readNameSafely();
      await appendObservation(this.ctx.storage, {
        at: Date.now(),
        source,
        ctxIdName: this.ctx.id.name,
        storedPsName: await readStoredPsName(this.ctx.storage),
        partyName: name,
        partyNameError: error
      });
    }

    #readNameSafely(): { name: string | null; error: string | null } {
      try {
        return { name: this.name, error: null };
      } catch (e) {
        return {
          name: null,
          error: e instanceof Error ? e.message : String(e)
        };
      }
    }
  };
}

export const StockAlarm = definePartyServerAlarm(StockServer);
export const FixedAlarm = definePartyServerAlarm(FixedServer);

/**
 * Single fetch entry point that fans out to whichever DO the URL
 * targeted. We use partyserver's `routePartykitRequest` for the
 * PartyServer-backed DOs (since that's the realistic path) and a
 * direct `idFromName` lookup for `RawAlarm`.
 */
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // /raw/<name>?schedule=N | ?snapshot=1
    if (url.pathname.startsWith("/raw/")) {
      const name = url.pathname.slice("/raw/".length).split("/")[0] ?? "";
      if (!name) return new Response("missing name", { status: 400 });
      const id = env.RawAlarm.idFromName(name);
      const stub = env.RawAlarm.get(id);
      return stub.fetch(request);
    }

    const partykit = await routePartykitRequest(request, env);
    if (partykit) return partykit;

    return new Response("Not Found", { status: 404 });
  }
} satisfies ExportedHandler<Env>;
