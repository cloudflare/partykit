import invariant from "tiny-invariant";
import { parse } from "cookie";
import * as jose from "jose";

const unauthorizedResponse = () =>
  new Response("unauthorized", {
    status: 401
  });

interface Config {
  /**
   * Cloudflare Realtime SFU App ID. Get it here:
   * https://dash.cloudflare.com/?to=/:account/realtime/sfu/create
   */
  appId: string;
  /**
   * Cloudflare Realtime SFU App Token. Get it here:
   * https://dash.cloudflare.com/?to=/:account/realtime/sfu/create
   */
  token: string;
  /**
   * The part of the pathname in the original request URL that should be replaced.
   * For example, if your proxy path is /api/partytracks/*, the value should be "/api/partytracks"
   */
  prefix?: string;
  /**
   * The base URL for the Cloudflare Realtime API
   */
  realtimeApiBaseUrl?: string;
  /**
   * The original request
   */
  request: Request;
  /**
   * Creates a JWT cookie for the initial request that created the session and
   * prevents anyone who doesn't have a valid JWT from manipulating the session.
   * On by default. Disabl
   */
  lockSessionToInitiator?: boolean;
  /**
   * TURN Server App ID. Get it here:
   * http://dash.cloudflare.com/?to=/:account/realtime/turn/create
   * What is TURN? https://developers.cloudflare.com/realtime/turn/what-is-turn/
   */
  turnServerAppId?: string;
  /**
   * TURN Server App Token. Get it here:
   * http://dash.cloudflare.com/?to=/:account/realtime/turn/create
   * What is TURN? https://developers.cloudflare.com/realtime/turn/what-is-turn/
   */
  turnServerAppToken?: string;
  /*
   * How long the generated credentials should be valid.
   * Defaults to 86400 seconds, which is 24 hours.
   */
  turnServerCredentialTTL?: number;
}

export const routePartyTracksRequest = async ({
  appId,
  token,
  realtimeApiBaseUrl = "https://rtc.live.cloudflare.com/v1",
  prefix = "/partytracks",
  request,
  lockSessionToInitiator = process.env.NODE_ENV === "production",
  turnServerAppToken,
  turnServerAppId,
  turnServerCredentialTTL: ttl = 86400 // 24 hours
}: Config) => {
  const { headers, body, url, method } = request;
  const previousUrl = new URL(url);

  if (!previousUrl.pathname.startsWith(prefix)) {
    return new Response(null, { status: 404 });
  }

  // Forward headers while adding auth
  const newHeaders = new Headers(headers);
  newHeaders.set("Authorization", `Bearer ${token}`);
  const realtimeInit: RequestInit = {
    headers: newHeaders,
    method
  };

  const contentLength = headers.get("Content-Length");
  if (contentLength !== null) {
    const parsedContentLength = Number(contentLength);
    invariant(
      !Number.isNaN(parsedContentLength),
      "Content-Length header is not a number"
    );
    if (parsedContentLength > 0 || headers.has("Transfer-Encoding")) {
      realtimeInit.body = body;
    }
  }

  if (previousUrl.pathname === `${prefix}/generate-ice-servers`) {
    if (turnServerAppToken && turnServerAppId) {
      return fetch(
        `${realtimeApiBaseUrl}/turn/keys/${turnServerAppId}/credentials/generate-ice-servers`,
        {
          method: "POST",
          body: JSON.stringify({ ttl }),
          headers: {
            Authorization: `Bearer ${turnServerAppToken}`
          }
        }
      );
    } else {
      return new Response(
        JSON.stringify({
          iceServers: [
            {
              urls: [
                "stun:stun.cloudflare.com:3478",
                "stun:stun.cloudflare.com:53"
              ]
            }
          ]
        }),
        {
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }
  }

  const realtimeUrl = new URL(`${realtimeApiBaseUrl}/apps/${appId}`);
  realtimeUrl.pathname = previousUrl.pathname.replace(
    prefix,
    realtimeUrl.pathname
  );
  realtimeUrl.search = previousUrl.search;

  if (!lockSessionToInitiator) {
    return fetch(realtimeUrl, realtimeInit);
  }

  const isCreatingNewSession =
    previousUrl.pathname === `${prefix}/sessions/new`;

  if (isCreatingNewSession) {
    const createdSessionResponse = await fetch(realtimeUrl, realtimeInit);
    const { sessionId } = await createdSessionResponse.clone().json();
    const jwt = await new jose.SignJWT({
      sessionId
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .sign(new TextEncoder().encode(token));

    const headers = new Headers(createdSessionResponse.headers);
    headers.append(
      "Set-Cookie",
      `partytracks-session-${sessionId}=${jwt}; HttpOnly; Secure; SameSite=Strict; Path=${prefix};`
    );
    const newSessionResponse = new Response(createdSessionResponse.body, {
      ...createdSessionResponse,
      headers
    });
    return newSessionResponse;
  }

  const [sessionId] = previousUrl.pathname
    .replace(`${prefix}/sessions/`, "")
    .split("/");

  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return unauthorizedResponse();
  const sessionCookie = parse(cookieHeader)[`partytracks-session-${sessionId}`];
  if (!sessionCookie) return unauthorizedResponse();

  try {
    const result = await jose.jwtVerify(
      sessionCookie,
      new TextEncoder().encode(token)
    );
    invariant(result.payload.sessionId === sessionId);
  } catch (e) {
    return unauthorizedResponse();
  }
  return fetch(realtimeUrl, realtimeInit);
};
