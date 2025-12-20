import { Hono } from "hono";
import { routePartyTracksRequest } from "partytracks/server";

type Bindings = {
  REALTIME_SFU_APP_ID: string;
  REALTIME_SFU_APP_TOKEN: string;
  REALTIME_TURN_SERVER_APP_ID: string;
  REALTIME_TURN_SERVER_APP_TOKEN: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.all("/partytracks/*", (c) =>
  routePartyTracksRequest({
    appId: c.env.REALTIME_SFU_APP_ID,
    token: c.env.REALTIME_SFU_APP_TOKEN,
    turnServerAppId: c.env.REALTIME_TURN_SERVER_APP_ID,
    turnServerAppToken: c.env.REALTIME_TURN_SERVER_APP_TOKEN,
    request: c.req.raw
  })
);

export default app;
