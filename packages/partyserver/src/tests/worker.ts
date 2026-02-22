import { routePartykitRequest, Server } from "../index";

import type { Connection, ConnectionContext, WSMessage } from "../index";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export type Env = {
  Stateful: DurableObjectNamespace<Stateful>;
  OnStartServer: DurableObjectNamespace<OnStartServer>;
  HibernatingOnStartServer: DurableObjectNamespace<HibernatingOnStartServer>;
  AlarmServer: DurableObjectNamespace<AlarmServer>;
  AlarmNameServer: DurableObjectNamespace<AlarmNameServer>;
  NoNameServer: DurableObjectNamespace<NoNameServer>;
  Mixed: DurableObjectNamespace<Mixed>;
  ConfigurableState: DurableObjectNamespace<ConfigurableState>;
  ConfigurableStateInMemory: DurableObjectNamespace<ConfigurableStateInMemory>;
  StateRoundTrip: DurableObjectNamespace<StateRoundTrip>;
  CorsServer: DurableObjectNamespace<CorsServer>;
  CustomCorsServer: DurableObjectNamespace<CustomCorsServer>;
  FailingOnStartServer: DurableObjectNamespace<FailingOnStartServer>;
  HibernatingNameInMessage: DurableObjectNamespace<HibernatingNameInMessage>;
  TagsServer: DurableObjectNamespace<TagsServer>;
  TagsServerInMemory: DurableObjectNamespace<TagsServerInMemory>;
};

export class Stateful extends Server {
  static options = {
    hibernate: true
  };

  onConnect(
    connection: Connection,
    _ctx: ConnectionContext
  ): void | Promise<void> {
    connection.send(
      JSON.stringify({
        name: this.name
      })
    );
  }

  onRequest(
    _request: Request<unknown, CfProperties<unknown>>
  ): Response | Promise<Response> {
    return Response.json({
      name: this.name
    });
  }
}

export class OnStartServer extends Server {
  counter = 0;
  async onStart() {
    // this stray assert is simply to make sure .name is available
    // inside onStart, it should throw if not
    assert(this.name, "name is not available inside onStart");
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        this.counter++;
        resolve();
      }, 300);
    });
  }
  onConnect(connection: Connection) {
    connection.send(this.counter.toString());
  }
  onRequest(
    _request: Request<unknown, CfProperties<unknown>>
  ): Response | Promise<Response> {
    return new Response(this.counter.toString());
  }
}

/**
 * Like OnStartServer but with hibernate: true.
 * Tests that setName properly initializes the server in the
 * hibernating websocket handler path (webSocketMessage, webSocketClose, etc.)
 */
export class HibernatingOnStartServer extends Server {
  static options = {
    hibernate: true
  };

  counter = 0;

  async onStart() {
    assert(this.name, "name is not available inside onStart");
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        this.counter++;
        resolve();
      }, 300);
    });
  }

  onConnect(connection: Connection) {
    connection.send(this.counter.toString());
  }

  onMessage(connection: Connection, _message: WSMessage) {
    connection.send(`counter:${this.counter}`);
  }

  onRequest(): Response {
    return new Response(this.counter.toString());
  }
}

/**
 * Tests that alarm() properly initializes the server
 * without the redundant blockConcurrencyWhile wrapper.
 */
export class AlarmServer extends Server {
  static options = {
    hibernate: true
  };

  counter = 0;
  alarmCount = 0;

  async onStart() {
    this.counter++;
  }

  onAlarm() {
    this.alarmCount++;
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.searchParams.get("setAlarm")) {
      // Schedule alarm far in the future so it won't auto-fire
      await this.ctx.storage.setAlarm(Date.now() + 60_000);
      return new Response("alarm set");
    }
    return Response.json({
      counter: this.counter,
      alarmCount: this.alarmCount
    });
  }
}

/**
 * Multipurpose test DO for name persistence scenarios.
 * Supports seeding storage directly (bypassing setName), reading back
 * what this.name returned in onStart/onAlarm, and direct fetch without
 * the x-partykit-room header.
 */
export class AlarmNameServer extends Server {
  static options = {
    hibernate: true
  };

  alarmName: string | null = null;
  onStartName: string | null = null;
  nameWasCold = false;

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Seed storage directly, bypassing Server.fetch()/setName().
    // Simulates a DO that was previously named, hibernated, and
    // wakes cold — #_name is unset, only storage has the name.
    if (url.searchParams.get("seed")) {
      const name = url.searchParams.get("name")!;
      this.ctx.storage.kv.put("__ps_name", name);
      await this.ctx.storage.setAlarm(Date.now() + 60_000);
      return new Response("seeded");
    }

    return super.fetch(request);
  }

  async onStart() {
    try {
      this.onStartName = this.name;
    } catch {
      this.onStartName = null;
    }
  }

  onAlarm() {
    this.alarmName = this.name;
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.searchParams.get("setAlarm")) {
      await this.ctx.storage.setAlarm(Date.now() + 60_000);
      return new Response("alarm set");
    }
    return Response.json({
      name: this.name,
      alarmName: this.alarmName,
      onStartName: this.onStartName,
      nameWasCold: this.nameWasCold
    });
  }
}

/**
 * Minimal DO that never has its name set.
 * Used to test that the name getter throws appropriately.
 */
export class NoNameServer extends Server {
  static options = { hibernate: true };

  async onStart() {
    // no-op
  }

  onRequest(): Response {
    return Response.json({ name: this.name });
  }
}

export class Mixed extends Server {
  static options = {
    hibernate: true
  };

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/foreign")) {
      const room = request.headers.get("x-partykit-room");
      if (room) {
        await this.setName(room);
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      // Accept a hibernated websocket that PartyServer does not manage. This is
      // equivalent to user code calling `this.ctx.acceptWebSocket()` directly.
      this.ctx.acceptWebSocket(server, ["foreign"]);
      return new Response(null, { status: 101, webSocket: client });
    }

    return super.fetch(request);
  }

  onConnect(connection: Connection): void {
    // Trigger a broadcast while a foreign hibernated socket exists.
    this.broadcast("hello");
    connection.send("connected");
  }
}

/**
 * Tests that state and setState on a connection can be redefined via
 * Object.defineProperty (configurable: true). This simulates what the
 * Cloudflare Agents SDK does to namespace internal state keys.
 */
export class ConfigurableState extends Server {
  static options = {
    hibernate: true
  };

  onConnect(connection: Connection): void {
    // Redefine state and setState with a custom namespace,
    // similar to what the Agents SDK does.
    let _customState: unknown = { custom: true };

    Object.defineProperty(connection, "state", {
      configurable: true,
      get() {
        return _customState;
      }
    });

    Object.defineProperty(connection, "setState", {
      configurable: true,
      value(newState: unknown) {
        _customState = newState;
        return _customState;
      }
    });

    // Use the redefined setState / state to verify they work
    connection.setState({ answer: 42 });
    connection.send(JSON.stringify(connection.state));
  }
}

/**
 * Tests that setState persists state and the state getter reads it back
 * correctly through the serialization layer (hibernating path).
 */
export class StateRoundTrip extends Server {
  static options = {
    hibernate: true
  };

  onConnect(connection: Connection): void {
    connection.setState({ count: 1 });
  }

  onMessage(connection: Connection, message: string | ArrayBuffer): void {
    if (message === "get") {
      connection.send(JSON.stringify(connection.state));
    } else if (message === "increment") {
      connection.setState((prev: { count: number } | null) => ({
        count: (prev?.count ?? 0) + 1
      }));
      connection.send(JSON.stringify(connection.state));
    }
  }
}

/**
 * Same as ConfigurableState but without hibernation (non-hibernating path).
 * Verifies that the Object.assign path also allows redefinition.
 */
export class ConfigurableStateInMemory extends Server {
  // no hibernate — uses the in-memory Object.assign path
  onConnect(connection: Connection): void {
    let _customState: unknown = { custom: true };

    Object.defineProperty(connection, "state", {
      configurable: true,
      get() {
        return _customState;
      },
      set(v: unknown) {
        _customState = v;
      }
    });

    Object.defineProperty(connection, "setState", {
      configurable: true,
      value(newState: unknown) {
        _customState = newState;
        return _customState;
      }
    });

    connection.setState({ answer: 99 });
    connection.send(JSON.stringify(connection.state));
  }
}

/**
 * Tests that onStart failure resets the status so subsequent requests
 * can retry initialization. The first call to onStart throws; the second
 * succeeds.
 */
export class FailingOnStartServer extends Server {
  counter = 0;
  failCount = 0;

  async onStart() {
    this.counter++;
    if (this.counter === 1) {
      this.failCount++;
      throw new Error("onStart failed on first attempt");
    }
  }

  onRequest(): Response {
    return Response.json({
      counter: this.counter,
      failCount: this.failCount
    });
  }
}

/**
 * Tests that this.name is correctly available in onMessage after a
 * hibernating server wakes up. Sends this.name back in onMessage.
 */
export class HibernatingNameInMessage extends Server {
  static options = {
    hibernate: true
  };

  onConnect(connection: Connection): void {
    connection.send(`connected:${this.name}`);
  }

  onMessage(connection: Connection, _message: WSMessage): void {
    connection.send(`name:${this.name}`);
  }
}

/**
 * Tests that connection.tags is readable in hibernating mode.
 */
export class TagsServer extends Server {
  static options = {
    hibernate: true
  };

  getConnectionTags(
    _connection: Connection,
    _ctx: ConnectionContext
  ): string[] {
    return ["role:admin", "room:lobby"];
  }

  onConnect(connection: Connection): void {
    connection.send(JSON.stringify(connection.tags));
  }

  onMessage(connection: Connection, _message: WSMessage): void {
    // Also verify tags survive hibernation wake-up
    connection.send(JSON.stringify(connection.tags));
  }
}

/**
 * Tests that connection.tags is readable in non-hibernating (in-memory) mode.
 */
export class TagsServerInMemory extends Server {
  // no hibernate — uses the in-memory path

  getConnectionTags(
    _connection: Connection,
    _ctx: ConnectionContext
  ): string[] {
    return ["role:viewer", "room:general"];
  }

  onConnect(connection: Connection): void {
    connection.send(JSON.stringify(connection.tags));
  }
}

export class CorsServer extends Server {
  onRequest(): Response | Promise<Response> {
    return Response.json({ cors: true });
  }
}

export class CustomCorsServer extends Server {
  onRequest(): Response | Promise<Response> {
    return Response.json({ customCors: true });
  }
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const url = new URL(request.url);

    // Route requests under /cors-parties/ with cors: true
    if (url.pathname.startsWith("/cors-parties/")) {
      return (
        (await routePartykitRequest(request, env, {
          prefix: "cors-parties",
          cors: true,
          onBeforeRequest: async (_req, { name }) => {
            if (name === "blocked") {
              return new Response("Forbidden", { status: 403 });
            }
          }
        })) || new Response("Not Found", { status: 404 })
      );
    }

    // Route requests under /custom-cors-parties/ with custom CORS headers
    if (url.pathname.startsWith("/custom-cors-parties/")) {
      return (
        (await routePartykitRequest(request, env, {
          prefix: "custom-cors-parties",
          cors: {
            "Access-Control-Allow-Origin": "https://example.com",
            "Access-Control-Allow-Methods": "GET, POST"
          }
        })) || new Response("Not Found", { status: 404 })
      );
    }

    return (
      (await routePartykitRequest(request, env, {
        onBeforeConnect: async (_request, { className, name }) => {
          if (className === "OnStartServer") {
            if (name === "is-error") {
              return new Response("Error", { status: 503 });
            } else if (name === "is-redirect") {
              return new Response("Redirect", {
                status: 302,
                headers: { Location: "https://example2.com" }
              });
            }
          }
        },
        onBeforeRequest: async (_request, lobby) => {
          if (lobby.className === "OnStartServer") {
            if (lobby.name === "is-error") {
              return new Response("Error", { status: 504 });
            } else if (lobby.name === "is-redirect") {
              return new Response("Redirect", {
                status: 302,
                headers: { Location: "https://example3.com" }
              });
            }
          }
          if (lobby.name === "lobby-info") {
            return Response.json({
              className: lobby.className,
              name: lobby.name
            });
          }
        }
      })) || new Response("Not Found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
