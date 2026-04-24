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

const NAME_STORAGE_KEY = "__ps_name";

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
 *
 * Makes a single RPC that awaits the DO's `onStart()` before returning,
 * so callers can invoke user-defined RPC methods on the returned stub and
 * trust that `onStart()` has completed. (User-defined RPC methods don't
 * otherwise pass through `Server.fetch()`, which is where initialization
 * would normally be triggered.)
 *
 * `this.name` inside the DO is always populated from `ctx.id.name`, so
 * the RPC no longer needs to carry the name for bookkeeping; it exists
 * purely to synchronize `onStart()` and to deliver `props`.
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

  await stub.setName(name, options?.props);

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

    req = new Request(req);
    req.headers.set("x-partykit-namespace", namespace);
    if (options?.jurisdiction) {
      req.headers.set("x-partykit-jurisdiction", options.jurisdiction);
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

    // Attach props to the request after the hooks so that user-defined
    // onBeforeConnect / onBeforeRequest callbacks don't see the serialized
    // props header on the inspection request.
    if (options?.props !== undefined) {
      req.headers.set("x-partykit-props", JSON.stringify(options.props));
    }

    // Single RPC for both WS and HTTP: `this.name` is populated from
    // `ctx.id.name` inside the DO, so there's no need for a prior
    // `setName()` round-trip. Props (if any) travel in the request header
    // and are picked up in `Server.fetch()`.
    const response = await stub.fetch(req);
    return isWebSocket ? response : withCorsHeaders(response);
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

  // oxlint-disable-next-line no-useless-constructor
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

      // Name resolution priority: ctx.id.name > x-partykit-room header
      // > legacy __ps_name storage record. Pre-populate from the header
      // BEFORE `#ensureInitialized()` so that `onStart()` sees the name
      // regardless of how it was supplied. `#ensureInitialized()` will
      // fall back to reading storage when neither ctx.id.name nor the
      // header has provided one.
      if (!this.ctx.id.name && !this.#_name) {
        const room = request.headers.get("x-partykit-room");
        if (room) this.#_name = room;
      }

      await this.#ensureInitialized();

      if (!this.ctx.id.name && !this.#_name) {
        throw new Error(`Cannot determine the name for ${this.#ParentClass.name}: this.ctx.id.name is undefined, no legacy __ps_name storage record is present, and no x-partykit-room header was supplied. Likely causes:
  1. The stub was built via idFromString()/newUniqueId(). PartyServer requires name-based addressing (idFromName/getByName).
  2. The workerd/wrangler runtime is too old to expose ctx.id.name — update to a recent wrangler release.
  3. You called stub.fetch() directly without going through routePartykitRequest()/getServerByName(). Prefer those, or set the x-partykit-room header.`);
      }

      const url = new URL(request.url);

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
          uri: request.url,
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
        connection = this.#connectionManager.accept(connection, { tags });

        if (!this.#ParentClass.options.hibernate) {
          this.#attachSocketEventHandlers(connection);
        }
        await this.onConnect(connection, ctx);

        return new Response(null, { status: 101, webSocket: clientWebSocket });
      }
    } catch (err) {
      console.error(
        `Error in ${this.#ParentClass.name}:${this.ctx.id.name ?? this.#_name ?? "<unnamed>"} fetch:`,
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

      await this.#ensureInitialized();
      connection.server = this.name;

      return this.onMessage(connection, message);
    } catch (e) {
      console.error(
        `Error in ${this.#ParentClass.name}:${this.ctx.id.name ?? this.#_name ?? "<unnamed>"} webSocketMessage:`,
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

      await this.#ensureInitialized();
      connection.server = this.name;

      return this.onClose(connection, code, reason, wasClean);
    } catch (e) {
      console.error(
        `Error in ${this.#ParentClass.name}:${this.ctx.id.name ?? this.#_name ?? "<unnamed>"} webSocketClose:`,
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

      await this.#ensureInitialized();
      connection.server = this.name;

      return this.onError(connection, error);
    } catch (e) {
      console.error(
        `Error in ${this.#ParentClass.name}:${this.ctx.id.name ?? this.#_name ?? "<unnamed>"} webSocketError:`,
        e
      );
    }
  }

  /**
   * Read the legacy `__ps_name` storage record as a fallback source of
   * `this.name` when `ctx.id.name` is unavailable. Covers:
   *
   *   1. Pre-2026-03-15 alarms, which fire without `ctx.id.name`
   *      populated on the alarm handler (see the Durable Objects
   *      ID docs: https://developers.cloudflare.com/durable-objects/api/id/#name).
   *   2. Framework-level bootstrap patterns that write `__ps_name`
   *      directly before calling `__unsafe_ensureInitialized()` —
   *      notably Cloudflare Agents facets, which are addressed via
   *      `ctx.facets.get()` rather than `idFromName()` and therefore
   *      do not receive a `ctx.id.name`.
   *
   * PartyServer no longer writes this record itself. Everything that
   * reads it is reading something written by an older version of
   * PartyServer or by a framework that embeds it.
   */
  async #hydrateNameFromLegacyStorage(): Promise<void> {
    if (this.#_name) return;
    const stored = await this.ctx.storage.get<string>(NAME_STORAGE_KEY);
    if (stored) {
      this.#_name = stored;
    }
  }

  /**
   * @internal — Do not use directly. This is an escape hatch for frameworks
   * (like Agents) that receive calls via native DO RPC, bypassing the
   * standard fetch/alarm/webSocket entry points where initialization
   * normally happens. Calling this from application code is unsupported
   * and may break without notice.
   */
  async __unsafe_ensureInitialized(): Promise<void> {
    await this.#ensureInitialized();
  }

  async #ensureInitialized(): Promise<void> {
    if (this.#status === "started") return;

    // Name resolution fallback. The happy path (DO addressed via
    // idFromName/getByName) short-circuits here because `ctx.id.name`
    // is already populated — no storage read. The slow path covers
    // pre-2026-03-15 alarms and framework bootstrap patterns (e.g.
    // Agents facets) that write `__ps_name` directly before the
    // first `onStart()` runs.
    if (!this.ctx.id.name && !this.#_name) {
      await this.#hydrateNameFromLegacyStorage();
    }

    let error: unknown;
    await this.ctx.blockConcurrencyWhile(async () => {
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

  /**
   * The name for this server.
   *
   * Resolves from `this.ctx.id.name` — the native DO id name, populated
   * whenever the stub was created via `idFromName()` or `getByName()`.
   * This is available inside every entry point (including the constructor,
   * alarms, and hibernating websocket handlers).
   *
   * For the narrow case of alarms that were scheduled before 2026-03-15
   * (where `ctx.id.name` is undefined inside the alarm handler), the name
   * is recovered from a legacy storage record written by older versions
   * of PartyServer. See `alarm()`.
   *
   * Throws if neither source is available — typically this means the DO
   * was addressed via `idFromString()` or `newUniqueId()`, which is not
   * supported by PartyServer.
   */
  get name(): string {
    const ctxName = this.ctx.id.name;
    if (ctxName !== undefined) return ctxName;
    if (this.#_name) return this.#_name;
    throw new Error(
      `Attempting to read .name on ${this.#ParentClass.name}, but this.ctx.id.name is not set. PartyServer requires DOs to be addressed via idFromName()/getByName(). If this is a legacy alarm scheduled before 2026-03-15, reschedule it from a fetch handler to restore the name.`
    );
  }

  /**
   * Establish this server's name and trigger `onStart()`.
   *
   * Two distinct use cases:
   *
   *   1. **Framework-level bootstrap of non-`idFromName` DOs** where
   *      `ctx.id.name` is undefined — for example, Cloudflare Agents
   *      facets (spawned via `ctx.facets.get(...)`). `setName()` is the
   *      sanctioned bootstrap primitive: it stashes the name in memory
   *      AND persists it to storage (under `__ps_name`) so the name
   *      survives DO eviction and is recovered on cold wake by
   *      `#ensureInitialized()`.
   *   2. **Delivering initial `props` to `onStart()`** via the optional
   *      second argument.
   *
   * For DOs addressed via `idFromName()` / `getByName()`, calling
   * `setName()` is redundant — `this.name` is available automatically
   * from `ctx.id.name`. Throws if `name` does not match `ctx.id.name`.
   *
   * @deprecated for callers that address DOs via `idFromName()` /
   * `getByName()`. Still the supported API for framework-level
   * bootstrap and props delivery.
   */
  async setName(name: string, props?: Props) {
    if (!name) {
      throw new Error("A name is required.");
    }
    const ctxName = this.ctx.id.name;
    if (ctxName !== undefined && ctxName !== name) {
      throw new Error(
        `This server's Durable Object id was created for name "${ctxName}", cannot setName to "${name}".`
      );
    }
    if (this.#_name && this.#_name !== name) {
      throw new Error(
        `This server already has a name: ${this.#_name}, attempting to set to: ${name}`
      );
    }
    if (props !== undefined) {
      this.#_props = props;
    }
    if (!this.#_name && ctxName === undefined) {
      // Bootstrap path (DO was addressed without idFromName, e.g.
      // Cloudflare Agents facets). Persist to storage AND stash the
      // name in memory so that subsequent cold-wake invocations
      // (fetch, alarm, websocket handlers, RPC via
      // `__unsafe_ensureInitialized`) can recover the name through
      // `#ensureInitialized()`'s legacy fallback.
      //
      // Order matters: write storage first so that if it throws,
      // `#_name` stays undefined and a retry will re-attempt the
      // storage write (instead of silently no-op'ing because the
      // in-memory name was already set).
      await this.ctx.storage.put(NAME_STORAGE_KEY, name);
      this.#_name = name;
    }
    await this.#ensureInitialized();
  }

  /**
   * @internal
   * @deprecated Retained for backward compatibility with older callers.
   * `routePartykitRequest` no longer uses this method; it sends props via
   * the `x-partykit-props` header on the underlying `fetch()` request.
   */
  async _initAndFetch(
    name: string,
    props: Props | undefined,
    request: Request
  ): Promise<Response> {
    await this.setName(name, props);
    return this.fetch(request);
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
    // oxlint-disable-next-line no-unused-vars
    connection: Connection,
    // oxlint-disable-next-line no-unused-vars
    context: ConnectionContext
  ): string[] | Promise<string[]> {
    return [];
  }

  #_props?: Props;

  // Implemented by the user

  /**
   * Called when the server is started for the first time.
   */
  // oxlint-disable-next-line no-unused-vars
  onStart(props?: Props): void | Promise<void> {}

  /**
   * Called when a new connection is made to the server.
   */
  onConnect(
    // oxlint-disable-next-line no-unused-vars
    connection: Connection,
    // oxlint-disable-next-line no-unused-vars
    ctx: ConnectionContext
  ): void | Promise<void> {
    // console.log(
    //   `Connection ${connection.id} connected to ${this.#ParentClass.name}:${this.name}`
    // );
    // console.log(
    //   `Implement onConnect on ${this.#ParentClass.name} to handle websocket connections.`
    // );
  }

  /**
   * Called when a message is received from a connection.
   */
  // oxlint-disable-next-line no-unused-vars
  onMessage(connection: Connection, message: WSMessage): void | Promise<void> {
    // console.log(
    //   `Received message on connection ${this.#ParentClass.name}:${connection.id}`
    // );
    // console.info(
    //   `Implement onMessage on ${this.#ParentClass.name} to handle this message.`
    // );
  }

  /**
   * Called when a connection is closed.
   */
  onClose(
    // oxlint-disable-next-line no-unused-vars
    connection: Connection,
    // oxlint-disable-next-line no-unused-vars
    code: number,
    // oxlint-disable-next-line no-unused-vars
    reason: string,
    // oxlint-disable-next-line no-unused-vars
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
    await this.#ensureInitialized();
    await this.onAlarm();
  }
}
