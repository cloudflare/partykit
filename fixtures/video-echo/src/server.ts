import { routePartyTracksRequest } from "partytracks/server";

type Env = {
  CALLS_APP_ID: string;
  CALLS_APP_TOKEN: string;
};

// TODO: test the expiration stuff
export default {
  async fetch(request: Request, env: Env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/partytracks/")) {
      return await routePartyTracksRequest({
        appId: env.CALLS_APP_ID,
        token: env.CALLS_APP_TOKEN,
        request
      });
    }
    return new Response("Not found", { status: 404 });
  }
};
