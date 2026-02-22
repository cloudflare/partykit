import { env } from "hono/adapter";
import { createMiddleware } from "hono/factory";
import { routePartykitRequest } from "partyserver";

import type { Context, Env } from "hono";
import type { Lobby, PartyServerOptions } from "partyserver";

/**
 * Extended options for the Hono middleware that pass the Hono context
 * to `onBeforeConnect` and `onBeforeRequest` as a third argument,
 * giving access to `c.env`, `c.var`, `c.get()`, etc.
 */
export type HonoPartyServerOptions<E extends Env> = Omit<
  PartyServerOptions,
  "onBeforeConnect" | "onBeforeRequest"
> & {
  onBeforeConnect?: (
    req: Request,
    lobby: Lobby,
    c: Context<E>
  ) => Response | Request | void | Promise<Response | Request | void>;
  onBeforeRequest?: (
    req: Request,
    lobby: Lobby,
    c: Context<E>
  ) =>
    | Response
    | Request
    | void
    | Promise<Response | Request | undefined | void>;
};

/**
 * Configuration options for the PartyServer middleware
 */
type PartyServerMiddlewareContext<E extends Env> = {
  /** PartyServer-specific configuration options */
  options?: HonoPartyServerOptions<E>;
  /** Optional error handler for caught errors */
  onError?: (error: Error) => void;
};

/**
 * Creates a middleware for handling PartyServer WebSocket and HTTP requests
 * Processes both WebSocket upgrades and standard HTTP requests, delegating them to PartyServer
 */
export function partyserverMiddleware<E extends Env = Env>(
  ctx?: PartyServerMiddlewareContext<E>
) {
  return createMiddleware<E>(async (c, next) => {
    try {
      const options = wrapOptionsWithContext(ctx?.options, c);
      const response = isWebSocketUpgrade(c)
        ? await handleWebSocketUpgrade(c, options)
        : await handleHttpRequest(c, options);

      return response === null ? await next() : response;
    } catch (error) {
      if (ctx?.onError) {
        ctx.onError(error as Error);
        return next();
      }
      throw error;
    }
  });
}

/**
 * Wraps the Hono-specific options into standard PartyServerOptions by
 * closing over the Hono context so callbacks receive it as a third arg.
 */
function wrapOptionsWithContext<E extends Env>(
  options: HonoPartyServerOptions<E> | undefined,
  c: Context<E>
): PartyServerOptions | undefined {
  if (!options) return undefined;

  const { onBeforeConnect, onBeforeRequest, ...rest } = options;
  return {
    ...rest,
    ...(onBeforeConnect && {
      onBeforeConnect: (req: Request, lobby: Lobby) =>
        onBeforeConnect(req, lobby, c)
    }),
    ...(onBeforeRequest && {
      onBeforeRequest: (req: Request, lobby: Lobby) =>
        onBeforeRequest(req, lobby, c)
    })
  };
}

/**
 * Checks if the incoming request is a WebSocket upgrade request
 * Looks for the 'upgrade' header with a value of 'websocket' (case-insensitive)
 */
function isWebSocketUpgrade(c: Context): boolean {
  return c.req.header("upgrade")?.toLowerCase() === "websocket";
}

/**
 * Creates a new Request object from the Hono context
 * Preserves the original request's URL, method, headers, and body
 */
function createRequestFromContext(c: Context) {
  return c.req.raw.clone();
}

/**
 * Handles WebSocket upgrade requests
 * Returns a WebSocket upgrade response if successful, null otherwise
 */
async function handleWebSocketUpgrade(
  c: Context,
  options?: PartyServerOptions
) {
  const req = createRequestFromContext(c);
  const response = await routePartykitRequest(req, env(c), options);

  if (!response?.webSocket) {
    return null;
  }

  return new Response(null, {
    status: 101,
    webSocket: response.webSocket
  });
}

/**
 * Handles standard HTTP requests
 * Forwards the request to PartyServer and returns the response
 */
async function handleHttpRequest(c: Context, options?: PartyServerOptions) {
  const req = createRequestFromContext(c);
  return routePartykitRequest(req, env(c), options);
}
