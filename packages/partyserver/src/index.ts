// rethink error handling, how to pass it on to the client
// rethink oBC/oBR
// push for durable.setState (in addition to connection.setState)

import { DurableObject, env as defaultEnv } from "cloudflare:workers";
import { nanoid } from "nanoid";

import {
  createLazyConnection,
  HibernatingConnectionManager,
  InMemoryConnectionManager,
  isPartyServerWebSocket
} from "./connection";

import type { ConnectionManager } from "./connection";
import type {
  Connection,
  ConnectionContext,
  ConnectionSetStateFn,
  ConnectionState
} from "./types";

export * from "./types";

export type WSMessage = ArrayBuffer | ArrayBufferView | string;

// Let's cache the server namespace map
// so we don't call it on every request
const serverMapCache = new WeakMap<
  object,
  Record<string, DurableObjectNamespace>
>();

/**
 * For a given server namespace, create a server with a name.
 */
export async function getServerByName<
  Env extends Cloudflare.Env = Cloudflare.Env,
  T extends Server<Env> = Server<Env>,
  Props extends Record<string, unknown> = Record<string, unknown>
>(
  serverNamespace: DurableObjectNamespace<T>,
  name: string,
  options?: {
    jurisdiction?: DurableObjectJurisdiction;
    locationHint?: DurableObjectLocationHint;
    props?: Props;
  }
): Promise<DurableObjectStub<T>> {
  if (options?.jurisdiction) {
    serverNamespace = serverNamespace.jurisdiction(options.jurisdiction);
  }

  const id = serverNamespace.idFromName(name);
  const stub = serverNamespace.get(id, options);

  // TODO: fix this to use RPC

  const req = new Request(
    "http://dummy-example.cloudflare.com/cdn-cgi/partyserver/set-name/"
  );

  req.headers.set("x-partykit-room", name);

  if (options?.props) {
    req.headers.set("x-partykit-props", JSON.stringify(options?.props));
  }

  // unfortunately we have to await this
  await stub
    .fetch(req)
    // drain body
    .then((res) => res.text())
    .catch((e) => {
      console.error("Could not set server name:", e);
    });

  return stub;
}

function camelCaseToKebabCase(str: string): string {
  // If string is all uppercase, convert to lowercase
  if (str === str.toUpperCase() && str !== str.toLowerCase()) {
    return str.toLowerCase().replace(/_/g, "-");
  }

  // Otherwise handle camelCase to kebab-case
  let kebabified = str.replace(
    /[A-Z]/g,
    (letter) => `-${letter.toLowerCase()}`
  );
  kebabified = kebabified.startsWith("-") ? kebabified.slice(1) : kebabified;
  // Convert any remaining underscores to hyphens and remove trailing -'s
  return kebabified.replace(/_/g, "-").replace(/-$/, "");
}
export interface PartyServerOptions<
  // biome-ignore lint/correctness/noUnusedVariables: it's ok, we'll remove this in the next major
  Env = Cloudflare.Env,
  Props = Record<string, unknown>
> {
  prefix?: string;
  jurisdiction?: DurableObjectJurisdiction;
  locationHint?: DurableObjectLocationHint;
  props?: Props;
  onBeforeConnect?: (
    req: Request,
    lobby: {
      party: string;
      name: string;
    }
  ) => Response | Request | void | Promise<Response | Request | void>;
  onBeforeRequest?: (
    req: Request,
    lobby: {
      party: string;
      name: string;
    }
  ) =>
    | Response
    | Request
    | void
    | Promise<Response | Request | undefined | void>;
}
/**
 * A utility function for PartyKit style routing.
 */
export async function routePartykitRequest<
  Env extends Cloudflare.Env = Cloudflare.Env,
  T extends Server<Env> = Server<Env>,
  Props extends Record<string, unknown> = Record<string, unknown>
>(
  req: Request,
  env: Env = defaultEnv as Env,
  options?: PartyServerOptions<Env, Props>
): Promise<Response | null> {
  if (!serverMapCache.has(env)) {
    serverMapCache.set(
      env,
      Object.entries(env).reduce((acc, [k, v]) => {
        if (
          v &&
          typeof v === "object" &&
          "idFromName" in v &&
          typeof v.idFromName === "function"
        ) {
          Object.assign(acc, { [camelCaseToKebabCase(k)]: v });
          return acc;
        }
        return acc;
      }, {})
    );
  }
  const map = serverMapCache.get(env) as unknown as Record<
    string,
    DurableObjectNamespace<T>
  >;

  const prefix = options?.prefix || "parties";
  const prefixParts = prefix.split("/");

  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean); // Remove empty strings

  // Check if the URL starts with the prefix
  const prefixMatches = prefixParts.every(
    (part, index) => parts[index] === part
  );
  if (!prefixMatches || parts.length < prefixParts.length + 2) {
    return null;
  }

  const namespace = parts[prefixParts.length];
  const name = parts[prefixParts.length + 1];

  if (name && namespace) {
    if (!map[namespace]) {
      if (namespace === "main") {
        console.warn(
          "You appear to be migrating a PartyKit project to PartyServer."
        );
        console.warn(`PartyServer doesn't have a "main" party by default. Try adding this to your PartySocket client:\n 
party: "${camelCaseToKebabCase(Object.keys(map)[0])}"`);
      } else {
        console.error(`The url ${req.url}  with namespace "${namespace}" and name "${name}" does not match any server namespace. 
Did you forget to add a durable object binding to the class ${namespace[0].toUpperCase() + namespace.slice(1)} in your wrangler.jsonc?`);
      }
      // we should return a response with a status code that it's an invalid request
      return new Response("Invalid request", { status: 400 });
    }

    let doNamespace = map[namespace];
    if (options?.jurisdiction) {
      doNamespace = doNamespace.jurisdiction(options.jurisdiction);
    }

    const id = doNamespace.idFromName(name);
    const stub = doNamespace.get(id, options);

    // const stub = await getServerByName(map[namespace], name, options); // TODO: fix this
    // make a new request with additional headers

    req = new Request(req);
    req.headers.set("x-partykit-room", name);
    req.headers.set("x-partykit-namespace", namespace);
    if (options?.jurisdiction) {
      req.headers.set("x-partykit-jurisdiction", options.jurisdiction);
    }

    if (options?.props) {
      req.headers.set("x-partykit-props", JSON.stringify(options?.props));
    }

    if (req.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      if (options?.onBeforeConnect) {
        const reqOrRes = await options.onBeforeConnect(req, {
          party: namespace,
          name
        });
        if (reqOrRes instanceof Request) {
          req = reqOrRes;
        } else if (reqOrRes instanceof Response) {
          return reqOrRes;
        }
      }
    } else {
      if (options?.onBeforeRequest) {
        const reqOrRes = await options.onBeforeRequest(req, {
          party: namespace,
          name
        });
        if (reqOrRes instanceof Request) {
          req = reqOrRes;
        } else if (reqOrRes instanceof Response) {
          return reqOrRes;
        }
      }
    }

    return stub.fetch(req);
  } else {
    return null;
  }
}

export class Server<
  Env extends Cloudflare.Env = Cloudflare.Env,
  Props extends Record<string, unknown> = Record<string, unknown>
> extends DurableObject<Env> {
  static options = {
    hibernate: false
  };

  #status: "zero" | "starting" | "started" = "zero";

  #ParentClass: typeof Server = Object.getPrototypeOf(this).constructor;

  #connectionManager: ConnectionManager = this.#ParentClass.options.hibernate
    ? new HibernatingConnectionManager(this.ctx)
    : new InMemoryConnectionManager();

  /**
   * Execute SQL queries against the Server's database
   * @template T Type of the returned rows
   * @param strings SQL query template strings
   * @param values Values to be inserted into the query
   * @returns Array of query results
   */
  sql<T = Record<string, string | number | boolean | null>>(
    strings: TemplateStringsArray,
    ...values: (string | number | boolean | null)[]
  ) {
    let query = "";
    try {
      // Construct the SQL query with placeholders
      query = strings.reduce(
        (acc, str, i) => acc + str + (i < values.length ? "?" : ""),
        ""
      );

      // Execute the SQL query with the provided values
      return [...this.ctx.storage.sql.exec(query, ...values)] as T[];
    } catch (e) {
      console.error(`failed to execute sql query: ${query}`, e);
      throw this.onException(e);
    }
  }

  // biome-ignore lint/complexity/noUselessConstructor: it's fine
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    // TODO: throw error if any of
    // broadcast/getConnection/getConnections/getConnectionTags
    // fetch/webSocketMessage/webSocketClose/webSocketError/alarm
    // have been overridden
  }

  /**
   * Handle incoming requests to the server.
   */
  async fetch(request: Request): Promise<Response> {
    // Set the props in-mem if the request included them.
    const props = request.headers.get("x-partykit-props");
    if (props) {
      try {
        this.#_props = JSON.parse(props);
      } catch {
        // This should never happen but log it just in case
        console.error("Internal error parsing context props.");
      }
    }

    if (!this.#_name) {
      // This is temporary while we solve https://github.com/cloudflare/workerd/issues/2240

      // get namespace and room from headers
      // const namespace = request.headers.get("x-partykit-namespace");
      const room = request.headers.get("x-partykit-room");
      if (
        // !namespace ||
        !room
      ) {
        throw new Error(`Missing namespace or room headers when connecting to ${this.#ParentClass.name}.
Did you try connecting directly to this Durable Object? Try using getServerByName(namespace, id) instead.`);
      }
      await this.setName(room);
    }

    try {
      const url = new URL(request.url);

      // TODO: this is a hack to set the server name,
      // it'll be replaced with RPC later
      if (url.pathname === "/cdn-cgi/partyserver/set-name/") {
        // we can just return a 200 for now
        return Response.json({ ok: true });
      }

      // Handle keep-alive WebSocket endpoint (internal use for waitUntil)
      if (url.pathname === "/cdn-cgi/partyserver/keep-alive/") {
        if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
          const { 0: client, 1: server } = new WebSocketPair();
          // Always use hibernation API for keep-alive (efficient, internal-only)
          this.ctx.acceptWebSocket(server, ["partyserver-keepalive"]);
          return new Response(null, { status: 101, webSocket: client });
        }
        return new Response("WebSocket required", { status: 426 });
      }

      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return await this.onRequest(request);
      } else {
        // Create the websocket pair for the client
        const { 0: clientWebSocket, 1: serverWebSocket } = new WebSocketPair();
        let connectionId = url.searchParams.get("_pk");
        if (!connectionId) {
          connectionId = nanoid();
        }

        let connection: Connection = Object.assign(serverWebSocket, {
          id: connectionId,
          server: this.name,
          state: null as unknown as ConnectionState<unknown>,
          setState<T = unknown>(setState: T | ConnectionSetStateFn<T>) {
            let state: T;
            if (setState instanceof Function) {
              state = setState(this.state as ConnectionState<T>);
            } else {
              state = setState;
            }

            // TODO: deepFreeze object?
            this.state = state as ConnectionState<T>;
            return this.state;
          }
        });

        const ctx = { request };

        const tags = await this.getConnectionTags(connection, ctx);

        // Accept the websocket connection
        connection = this.#connectionManager.accept(connection, {
          tags,
          server: this.name
        });

        if (!this.#ParentClass.options.hibernate) {
          this.#attachSocketEventHandlers(connection);
        }
        await this.onConnect(connection, ctx);

        return new Response(null, { status: 101, webSocket: clientWebSocket });
      }
    } catch (err) {
      console.error(
        `Error in ${this.#ParentClass.name}:${this.name} fetch:`,
        err
      );
      if (!(err instanceof Error)) throw err;
      if (request.headers.get("Upgrade") === "websocket") {
        // Annoyingly, if we return an HTTP error in response to a WebSocket request, Chrome devtools
        // won't show us the response body! So... let's send a WebSocket response with an error
        // frame instead.
        const pair = new WebSocketPair();
        pair[1].accept();
        pair[1].send(JSON.stringify({ error: err.stack }));
        pair[1].close(1011, "Uncaught exception during session setup");
        return new Response(null, { status: 101, webSocket: pair[0] });
      } else {
        return new Response(err.stack, { status: 500 });
      }
    }
  }

  async webSocketMessage(ws: WebSocket, message: WSMessage): Promise<void> {
    // Handle keep-alive pings first (internal waitUntil mechanism)
    const tags = this.ctx.getTags(ws);
    if (tags.includes("partyserver-keepalive")) {
      if (message === "ping") {
        ws.send("pong");
      }
      return;
    }

    // Ignore websockets accepted outside PartyServer (e.g. via
    // `state.acceptWebSocket()` in user code). These sockets won't have the
    // `__pk` attachment namespace required to rehydrate a Connection.
    if (!isPartyServerWebSocket(ws)) {
      return;
    }

    const connection = createLazyConnection(ws);

    // rehydrate the server name if it's woken up
    await this.setName(connection.server);
    // TODO: ^ this shouldn't be async

    if (this.#status !== "started") {
      // This means the server "woke up" after hibernation
      // so we need to hydrate it again
      await this.#initialize();
    }

    return this.onMessage(connection, message);
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean
  ): Promise<void> {
    // Ignore keep-alive socket closes (internal waitUntil mechanism)
    const tags = this.ctx.getTags(ws);
    if (tags.includes("partyserver-keepalive")) {
      return;
    }

    if (!isPartyServerWebSocket(ws)) {
      return;
    }

    const connection = createLazyConnection(ws);

    // rehydrate the server name if it's woken up
    await this.setName(connection.server);
    // TODO: ^ this shouldn't be async

    if (this.#status !== "started") {
      // This means the server "woke up" after hibernation
      // so we need to hydrate it again
      await this.#initialize();
    }
    return this.onClose(connection, code, reason, wasClean);
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    // Ignore keep-alive socket errors (internal waitUntil mechanism)
    const tags = this.ctx.getTags(ws);
    if (tags.includes("partyserver-keepalive")) {
      return;
    }

    if (!isPartyServerWebSocket(ws)) {
      return;
    }

    const connection = createLazyConnection(ws);

    // rehydrate the server name if it's woken up
    await this.setName(connection.server);
    // TODO: ^ this shouldn't be async

    if (this.#status !== "started") {
      // This means the server "woke up" after hibernation
      // so we need to hydrate it again
      await this.#initialize();
    }
    return this.onError(connection, error);
  }

  async #initialize(): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      this.#status = "starting";
      await this.onStart(this.#_props);
      this.#status = "started";
    });
  }

  #attachSocketEventHandlers(connection: Connection) {
    const handleMessageFromClient = (event: MessageEvent) => {
      this.onMessage(connection, event.data)?.catch<void>((e) => {
        console.error("onMessage error:", e);
      });
    };

    const handleCloseFromClient = (event: CloseEvent) => {
      connection.removeEventListener("message", handleMessageFromClient);
      connection.removeEventListener("close", handleCloseFromClient);
      this.onClose(connection, event.code, event.reason, event.wasClean)?.catch(
        (e) => {
          console.error("onClose error:", e);
        }
      );
    };

    const handleErrorFromClient = (e: ErrorEvent) => {
      connection.removeEventListener("message", handleMessageFromClient);
      connection.removeEventListener("error", handleErrorFromClient);
      this.onError(connection, e.error)?.catch((e) => {
        console.error("onError error:", e);
      });
    };

    connection.addEventListener("close", handleCloseFromClient);
    connection.addEventListener("error", handleErrorFromClient);
    connection.addEventListener("message", handleMessageFromClient);
  }

  // Public API

  #_name: string | undefined;

  #_longErrorAboutNameThrown = false;
  /**
   * The name for this server. Write-once-only.
   */
  get name(): string {
    if (!this.#_name) {
      if (!this.#_longErrorAboutNameThrown) {
        this.#_longErrorAboutNameThrown = true;
        throw new Error(
          `Attempting to read .name on ${this.#ParentClass.name} before it was set. The name can be set by explicitly calling .setName(name) on the stub, or by using routePartyKitRequest(). This is a known issue and will be fixed soon. Follow https://github.com/cloudflare/workerd/issues/2240 for more updates.`
        );
      } else {
        throw new Error(
          `Attempting to read .name on ${this.#ParentClass.name} before it was set.`
        );
      }
    }
    return this.#_name;
  }

  // We won't have an await inside this function
  // but it will be called remotely,
  // so we need to mark it as async
  async setName(name: string) {
    if (!name) {
      throw new Error("A name is required.");
    }
    if (this.#_name && this.#_name !== name) {
      throw new Error(
        `This server already has a name: ${this.#_name}, attempting to set to: ${name}`
      );
    }
    this.#_name = name;

    if (this.#status !== "started") {
      await this.ctx.blockConcurrencyWhile(async () => {
        await this.#initialize();
      });
    }
  }

  #sendMessageToConnection(connection: Connection, message: WSMessage): void {
    try {
      connection.send(message);
    } catch (_e) {
      // close connection
      connection.close(1011, "Unexpected error");
    }
  }

  /** Send a message to all connected clients, except connection ids listed in `without` */
  broadcast(
    msg: string | ArrayBuffer | ArrayBufferView,
    without?: string[] | undefined
  ): void {
    for (const connection of this.#connectionManager.getConnections()) {
      if (!without || !without.includes(connection.id)) {
        this.#sendMessageToConnection(connection, msg);
      }
    }
  }

  /** Get a connection by connection id */
  getConnection<TState = unknown>(id: string): Connection<TState> | undefined {
    return this.#connectionManager.getConnection<TState>(id);
  }

  /**
   * Get all connections. Optionally, you can provide a tag to filter returned connections.
   * Use `Server#getConnectionTags` to tag the connection on connect.
   */
  getConnections<TState = unknown>(tag?: string): Iterable<Connection<TState>> {
    return this.#connectionManager.getConnections<TState>(tag);
  }

  /**
   * You can tag a connection to filter them in Server#getConnections.
   * Each connection supports up to 9 tags, each tag max length is 256 characters.
   */
  getConnectionTags(
    // biome-ignore lint/correctness/noUnusedFunctionParameters: for autocomplete
    connection: Connection,
    // biome-ignore lint/correctness/noUnusedFunctionParameters: for autocomplete
    context: ConnectionContext
  ): string[] | Promise<string[]> {
    return [];
  }

  /**
   * Execute a long-running async function while keeping the Durable Object alive.
   *
   * Durable Objects normally terminate 70-140s after the last network request.
   * This method keeps the DO alive by establishing a WebSocket connection to itself
   * and sending periodic ping messages.
   *
   * @experimental This API is experimental and may change in future versions.
   *
   * @param fn - The async function to execute
   * @param timeoutMs - Maximum time to keep the DO alive (default: 30 minutes)
   * @returns The result of the async function
   *
   * @remarks
   * Requires the `enable_ctx_exports` compatibility flag in wrangler.jsonc:
   * ```json
   * {
   *   "compatibility_flags": ["enable_ctx_exports"]
   * }
   * ```
   *
   * @example
   * ```typescript
   * const result = await this.experimental_waitUntil(async () => {
   *   // Long-running operation
   *   await processLargeDataset();
   *   return { success: true };
   * }, 60 * 60 * 1000); // 1 hour timeout
   * ```
   */
  async experimental_waitUntil<T>(
    fn: () => Promise<T>,
    timeoutMs: number = 30 * 60 * 1000 // 30 minutes default
  ): Promise<T> {
    // Get namespace from ctx.exports (requires enable_ctx_exports compatibility flag)
    const exports = (
      this.ctx as DurableObjectState & { exports?: Record<string, unknown> }
    ).exports;
    if (!exports) {
      throw new Error(
        "waitUntil requires the 'enable_ctx_exports' compatibility flag. " +
          'Add it to your wrangler.jsonc: { "compatibility_flags": ["enable_ctx_exports"] }'
      );
    }

    const namespace = exports[this.#ParentClass.name] as
      | DurableObjectNamespace
      | undefined;
    if (!namespace) {
      throw new Error(
        `Could not find namespace for ${this.#ParentClass.name} in ctx.exports. ` +
          "Make sure the class name matches your Durable Object binding."
      );
    }

    const stub = namespace.get(this.ctx.id);

    // Connect to self via WebSocket for keep-alive
    const response = await stub.fetch(
      "http://dummy-example.cloudflare.com/cdn-cgi/partyserver/keep-alive/",
      {
        headers: {
          Upgrade: "websocket",
          "x-partykit-room": this.name
        }
      }
    );

    const ws = response.webSocket;
    if (!ws) {
      throw new Error("Failed to establish keep-alive WebSocket connection");
    }
    ws.accept();

    // Set up ping interval (every 10 seconds)
    const pingInterval = setInterval(() => {
      try {
        ws.send("ping");
      } catch {
        // WebSocket may have closed, ignore
      }
    }, 10_000);

    // Create a timeout promise that rejects after timeoutMs
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new Error(`experimental_waitUntil timed out after ${timeoutMs}ms`)
        );
      }, timeoutMs);
    });

    try {
      // Race the function against the timeout
      const result = await Promise.race([fn(), timeoutPromise]);
      return result;
    } finally {
      clearTimeout(timeoutId!);
      clearInterval(pingInterval);
      try {
        ws.close(1000, "Complete");
      } catch {
        // Ignore close errors
      }
    }
  }

  #_props?: Props;

  // Implemented by the user

  /**
   * Called when the server is started for the first time.
   */
  // biome-ignore lint/correctness/noUnusedFunctionParameters: for autocomplete
  onStart(props?: Props): void | Promise<void> {}

  /**
   * Called when a new connection is made to the server.
   */
  onConnect(
    connection: Connection,
    // biome-ignore lint/correctness/noUnusedFunctionParameters: for autocomplete
    ctx: ConnectionContext
  ): void | Promise<void> {
    console.log(
      `Connection ${connection.id} connected to ${this.#ParentClass.name}:${this.name}`
    );
    // console.log(
    //   `Implement onConnect on ${this.#ParentClass.name} to handle websocket connections.`
    // );
  }

  /**
   * Called when a message is received from a connection.
   */
  // biome-ignore lint/correctness/noUnusedFunctionParameters: for autocomplete
  onMessage(connection: Connection, message: WSMessage): void | Promise<void> {
    console.log(
      `Received message on connection ${this.#ParentClass.name}:${connection.id}`
    );
    console.info(
      `Implement onMessage on ${this.#ParentClass.name} to handle this message.`
    );
  }

  /**
   * Called when a connection is closed.
   */
  onClose(
    // biome-ignore lint/correctness/noUnusedFunctionParameters: for autocomplete
    connection: Connection,
    // biome-ignore lint/correctness/noUnusedFunctionParameters: for autocomplete
    code: number,
    // biome-ignore lint/correctness/noUnusedFunctionParameters: for autocomplete
    reason: string,
    // biome-ignore lint/correctness/noUnusedFunctionParameters: for autocomplete
    wasClean: boolean
  ): void | Promise<void> {}

  /**
   * Called when an error occurs on a connection.
   */
  onError(connection: Connection, error: unknown): void | Promise<void> {
    console.error(
      `Error on connection ${connection.id} in ${this.#ParentClass.name}:${this.name}:`,
      error
    );
    console.info(
      `Implement onError on ${this.#ParentClass.name} to handle this error.`
    );
  }

  /**
   * Called when a request is made to the server.
   */
  onRequest(request: Request): Response | Promise<Response> {
    // default to 404

    console.warn(
      `onRequest hasn't been implemented on ${this.#ParentClass.name}:${this.name} responding to ${request.url}`
    );

    return new Response("Not implemented", { status: 404 });
  }

  /**
   * Called when an exception occurs.
   * @param error - The error that occurred.
   */
  onException(error: unknown): void | Promise<void> {
    console.error(
      `Exception in ${this.#ParentClass.name}:${this.name}:`,
      error
    );
    console.info(
      `Implement onException on ${this.#ParentClass.name} to handle this error.`
    );
  }

  onAlarm(): void | Promise<void> {
    console.log(
      `Implement onAlarm on ${this.#ParentClass.name} to handle alarms.`
    );
  }

  async alarm(): Promise<void> {
    if (this.#status !== "started") {
      // This means the server "woke up" after hibernation
      // so we need to hydrate it again
      await this.#initialize();
    }
    await this.onAlarm();
  }
}
