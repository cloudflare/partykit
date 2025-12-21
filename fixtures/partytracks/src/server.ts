import { Hono } from "hono";
import { routePartyTracksRequest } from "partytracks/server";
import { env } from "cloudflare:workers";

const app = new Hono();

app.all("/partytracks/*", (c) =>
  routePartyTracksRequest({
    appId: env.REALTIME_SFU_APP_ID,
    token: env.REALTIME_SFU_APP_TOKEN,
    turnServerAppId: env.REALTIME_TURN_SERVER_APP_ID,
    turnServerAppToken: env.REALTIME_TURN_SERVER_APP_TOKEN,
    request: c.req.raw
  })
);

export default app;
