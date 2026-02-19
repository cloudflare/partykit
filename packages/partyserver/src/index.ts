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

// Maps kebab-case namespace -> original env binding name (e.g. "my-agent" -> "MyAgent")
const bindingNameCache = new WeakMap<object, Record<string, string>>();

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
  await stub.fetch(req).then((res) => res.text());

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
export interface Lobby<Env = Cloudflare.Env> {
  /**
   * The kebab-case namespace from the URL path (e.g. `"my-agent"`).
   * @deprecated Use `className` instead, which returns the Durable Object class name.
   * In the next major version, `party` will return the class name instead of the kebab-case namespace.
   */
  party: string;
  /** The Durable Object class name / env binding name (e.g. `"MyAgent"`). */
  className: Extract<keyof Env, string>;
  /** The room / instance name extracted from the URL. */
  name: string;
}

export interface PartyServerOptions<
  Env = Cloudflare.Env,
  Props = Record<string, unknown>
> {
  prefix?: string;
  jurisdiction?: DurableObjectJurisdiction;
  locationHint?: DurableObjectLocationHint;
  props?: Props;
  /**
   * Whether to enable CORS for matched routes.
   *
   * When `true`, uses default permissive CORS headers:
   * - Access-Control-Allow-Origin: *
   * - Access-Control-Allow-Methods: GET, POST, HEAD, OPTIONS
   * - Access-Control-Allow-Headers: *
   * - Access-Control-Max-Age: 86400
   *
   * For credentialed requests, pass explicit headers with a specific origin:
   * ```ts
   * cors: {
   *   "Access-Control-Allow-Origin": "https://myapp.com",
   *   "Access-Control-Allow-Credentials": "true",
   *   "Access-Control-Allow-Methods": "GET, POST, HEAD, OPTIONS",
   *   "Access-Control-Allow-Headers": "Content-Type, Authorization"
   * }
   * ```
   *
   * When set to a `HeadersInit` value, uses those as the CORS headers instead.
   * CORS preflight (OPTIONS) requests are handled automatically for matched routes.
   * Non-WebSocket responses on matched routes will also have the CORS headers appended.
   */
  cors?: boolean | HeadersInit;
  onBeforeConnect?: (
    req: Request,
    lobby: Lobby<Env>
  ) => Response | Request | void | Promise<Response | Request | void>;
  onBeforeRequest?: (
    req: Request,
    lobby: Lobby<Env>
  ) =>
    | Response
    | Request
    | void
    | Promise<Response | Request | undefined | void>;
}
/**
 * Resolve CORS options into a concrete headers object (or null if CORS is disabled).
 */
function resolveCorsHeaders(
  cors: boolean | HeadersInit | undefined
): Record<string, string> | null {
  if (cors === true) {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400"
    };
  }
  if (cors && typeof cors === "object") {
    // Convert any HeadersInit shape to a plain record
    const h = new Headers(cors as HeadersInit);
    const record: Record<string, string> = {};
    h.forEach((value, key) => {
      record[key] = value;
    });
    return record;
  }
  return null;
}

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
    const namespaceMap: Record<string, DurableObjectNamespace> = {};
    const bindingNames: Record<string, string> = {};
    for (const [k, v] of Object.entries(env)) {
      if (
        v &&
        typeof v === "object" &&
        "idFromName" in v &&
        typeof v.idFromName === "function"
      ) {
        const kebab = camelCaseToKebabCase(k);
        namespaceMap[kebab] = v as DurableObjectNamespace;
        bindingNames[kebab] = k;
      }
    }
    serverMapCache.set(env, namespaceMap);
    bindingNameCache.set(env, bindingNames);
  }
  const map = serverMapCache.get(env) as unknown as Record<
    string,
    DurableObjectNamespace<T>
  >;
  const bindingNames = bindingNameCache.get(env) as Record<string, string>;

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

    // Resolve CORS headers for this matched route
    const corsHeaders = resolveCorsHeaders(options?.cors);
    const isWebSocket =
      req.headers.get("Upgrade")?.toLowerCase() === "websocket";

    // Helper: append CORS headers to a response (skipped for WebSocket upgrades)
    function withCorsHeaders(response: Response): Response {
      if (!corsHeaders || isWebSocket) return response;
      const newResponse = new Response(response.body, response);
      for (const [key, value] of Object.entries(corsHeaders)) {
        newResponse.headers.set(key, value);
      }
      return newResponse;
    }

    // Handle CORS preflight requests for matched routes
    if (req.method === "OPTIONS" && corsHeaders) {
      return new Response(null, { headers: corsHeaders });
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

    const className = bindingNames[namespace] as Extract<keyof Env, string>;
    let partyDeprecationWarned = false;
    const lobby: Lobby<Env> = {
      get party() {
        if (!partyDeprecationWarned) {
          partyDeprecationWarned = true;
          console.warn(
            'lobby.party is deprecated and currently returns the kebab-case namespace (e.g. "my-agent"). ' +
              'Use lobby.className instead to get the Durable Object class name (e.g. "MyAgent"). ' +
              "In the next major version, lobby.party will return the class name."
          );
        }
        return namespace;
      },
      className,
      name
    };

    if (isWebSocket) {
      if (options?.onBeforeConnect) {
        const reqOrRes = await options.onBeforeConnect(req, lobby);
        if (reqOrRes instanceof Request) {
          req = reqOrRes;
        } else if (reqOrRes instanceof Response) {
          return reqOrRes;
        }
      }
    } else {
      if (options?.onBeforeRequest) {
        const reqOrRes = await options.onBeforeRequest(req, lobby);
        if (reqOrRes instanceof Request) {
          req = reqOrRes;
        } else if (reqOrRes instanceof Response) {
          return withCorsHeaders(reqOrRes);
        }
      }
    }

    return withCorsHeaders(await stub.fetch(req));
  } else {
    return null;
  }
}

export class Server<
  Env extends Cloudflare.Env = Cloudflare.Env,
  Props extends Record<string, unknown> = Record<string, unknown>
> extends DurableObject<Env> {
  static options: { hibernate?: boolean } = {
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
    try {
      // Set the props in-mem if the request included them.
      const props = request.headers.get("x-partykit-props");
      if (props) {
        this.#_props = JSON.parse(props);
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
      } else {
        const room = request.headers.get("x-partykit-room");
        if (room && room !== this.#_name) {
          throw new Error(
            `Room name mismatch: this server is "${this.#_name}" but request has room "${room}"`
          );
        }
        if (this.#status !== "started") {
          // Name was set by a previous request but initialization failed.
          // Retry initialization so the server can recover from transient
          // onStart failures.
          await this.#initialize();
        }
      }
      const url = new URL(request.url);

      // TODO: this is a hack to set the server name,
      // it'll be replaced with RPC later
      if (url.pathname === "/cdn-cgi/partyserver/set-name/") {
        // we can just return a 200 for now
        return Response.json({ ok: true });
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
          tags: [] as string[],
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
        `Error in ${this.#ParentClass.name}:${this.#_name ?? "<unnamed>"} fetch:`,
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
    // Ignore websockets accepted outside PartyServer (e.g. via
    // `state.acceptWebSocket()` in user code). These sockets won't have the
    // `__pk` attachment namespace required to rehydrate a Connection.
    if (!isPartyServerWebSocket(ws)) {
      return;
    }

    try {
      const connection = createLazyConnection(ws);

      // rehydrate the server name if it's woken up
      await this.setName(connection.server);
      // TODO: ^ this shouldn't be async

      return this.onMessage(connection, message);
    } catch (e) {
      console.error(
        `Error in ${this.#ParentClass.name}:${this.#_name ?? "<unnamed>"} webSocketMessage:`,
        e
      );
    }
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean
  ): Promise<void> {
    if (!isPartyServerWebSocket(ws)) {
      return;
    }

    try {
      const connection = createLazyConnection(ws);

      // rehydrate the server name if it's woken up
      await this.setName(connection.server);
      // TODO: ^ this shouldn't be async

      return this.onClose(connection, code, reason, wasClean);
    } catch (e) {
      console.error(
        `Error in ${this.#ParentClass.name}:${this.#_name ?? "<unnamed>"} webSocketClose:`,
        e
      );
    }
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    if (!isPartyServerWebSocket(ws)) {
      return;
    }

    try {
      const connection = createLazyConnection(ws);

      // rehydrate the server name if it's woken up
      await this.setName(connection.server);
      // TODO: ^ this shouldn't be async

      return this.onError(connection, error);
    } catch (e) {
      console.error(
        `Error in ${this.#ParentClass.name}:${this.#_name ?? "<unnamed>"} webSocketError:`,
        e
      );
    }
  }

  async #initialize(): Promise<void> {
    let error: unknown;
    await this.ctx.blockConcurrencyWhile(async () => {
      if (!this.#_name) {
        const stored =
          await this.ctx.storage.get<string>("__partyserver_name");
        if (stored) this.#_name = stored;
      }
      this.#status = "starting";
      try {
        await this.onStart(this.#_props);
        this.#status = "started";
      } catch (e) {
        this.#status = "zero";
        error = e;
      }
    });
    // Re-throw outside blockConcurrencyWhile so the DO's input gate
    // isn't permanently broken, allowing subsequent requests to retry.
    if (error) throw error;
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
    await this.ctx.storage.put("__partyserver_name", name);

    if (this.#status !== "started") {
      await this.#initialize();
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
    if (!this.#_name) {
      console.warn(
        `${this.#ParentClass.name} alarm fired but this.name is not available. ` +
          `The server must be fetched at least once (via routePartykitRequest or getServerByName) before this.name can be used in onAlarm.`
      );
    }
    await this.onAlarm();
  }
}
