import {
  createExecutionContext,
  env
  // waitOnExecutionContext
} from "cloudflare:test";
import { describe, expect, it } from "vitest";

// Could import any other source file/function here
import worker from "./worker";

import type { Env } from "./worker";

declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {}
}

describe("Server", () => {
  it("can be connected with a url", async () => {
    const ctx = createExecutionContext();
    const request = new Request("http://example.com/parties/stateful/123");
    const response = await worker.fetch(request, env, ctx);
    expect(await response.json()).toEqual({
      name: "123"
    });
  });

  it("can be connected with a websocket", async () => {
    const ctx = createExecutionContext();
    const request = new Request("http://example.com/parties/stateful/123", {
      headers: {
        Upgrade: "websocket"
      }
    });
    const response = await worker.fetch(request, env, ctx);
    const ws = response.webSocket!;

    const { promise, resolve, reject } = Promise.withResolvers<void>();
    ws.accept();
    ws.addEventListener("message", (message) => {
      try {
        expect(JSON.parse(message.data as string)).toEqual({
          name: "123"
        });
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        ws.close();
      }
    });

    return promise;
  });

  it("calls onStart only once, and does not process messages or requests until it is resolved", async () => {
    const ctx = createExecutionContext();

    async function makeConnection() {
      const request = new Request(
        "http://example.com/parties/on-start-server/123",
        {
          headers: {
            Upgrade: "websocket"
          }
        }
      );
      const response = await worker.fetch(request, env, ctx);
      const ws = response.webSocket!;
      ws.accept();
      const { promise, resolve, reject } = Promise.withResolvers<void>();
      ws.addEventListener("message", (message) => {
        try {
          expect(message.data).toEqual("1");
          resolve();
        } catch (err) {
          reject(err);
        } finally {
          ws.close();
        }
      });
      return promise;
    }

    async function makeRequest() {
      const request = new Request(
        "http://example.com/parties/on-start-server/123"
      );
      const response = await worker.fetch(request, env, ctx);
      expect(await response.text()).toEqual("1");
    }

    await Promise.all([makeConnection(), makeConnection(), makeRequest()]);
  });

  it(".name is available inside onStart", async () => {
    const ctx = createExecutionContext();
    const request = new Request(
      "http://example.com/parties/on-start-server/999"
    );
    const response = await worker.fetch(request, env, ctx);
    expect(response.status).toBe(200);
  });

  it("can return an error in onBeforeConnect", async () => {
    const ctx = createExecutionContext();
    const request = new Request(
      "http://example.com/parties/on-start-server/is-error",
      {
        headers: {
          Upgrade: "websocket"
        }
      }
    );
    const response = await worker.fetch(request, env, ctx);
    expect(response.status).toBe(503);
  });

  it("can return a redirect in onBeforeConnect", async () => {
    const ctx = createExecutionContext();
    const request = new Request(
      "http://example.com/parties/on-start-server/is-redirect",
      {
        headers: {
          Upgrade: "websocket"
        }
      }
    );
    const response = await worker.fetch(request, env, ctx);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://example2.com");
  });

  it("can return an error in onBeforeRequest", async () => {
    const ctx = createExecutionContext();
    const request = new Request(
      "http://example.com/parties/on-start-server/is-error"
    );
    const response = await worker.fetch(request, env, ctx);
    expect(response.status).toBe(504);
  });

  it("can return a redirect in onBeforeRequest", async () => {
    const ctx = createExecutionContext();
    const request = new Request(
      "http://example.com/parties/on-start-server/is-redirect"
    );
    const response = await worker.fetch(request, env, ctx);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://example3.com");
  });

  it("ignores foreign hibernated websockets when broadcasting", async () => {
    const ctx = createExecutionContext();

    // Create a websocket that is accepted via the DO hibernation API directly
    // (no PartyServer `__pk` attachment).
    const foreignReq = new Request(
      "http://example.com/parties/mixed/room/foreign",
      {
        headers: { Upgrade: "websocket" }
      }
    );
    const foreignRes = await worker.fetch(foreignReq, env, ctx);
    const foreignWs = foreignRes.webSocket!;
    foreignWs.accept();

    // Now connect via PartyServer. onConnect() will call broadcast(), which must
    // not crash due to the foreign socket.
    const req = new Request("http://example.com/parties/mixed/room", {
      headers: { Upgrade: "websocket" }
    });
    const res = await worker.fetch(req, env, ctx);
    const ws = res.webSocket!;
    ws.accept();

    const { promise, resolve, reject } = Promise.withResolvers<void>();
    ws.addEventListener("message", (message) => {
      try {
        // We should receive at least one message from the server.
        expect(["hello", "connected"]).toContain(message.data);
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        ws.close();
        foreignWs.close();
      }
    });

    return promise;
  });

  it("allows state and setState to be redefined on a connection", async () => {
    const ctx = createExecutionContext();
    const request = new Request(
      "http://example.com/parties/configurable-state/room1",
      {
        headers: {
          Upgrade: "websocket"
        }
      }
    );
    const response = await worker.fetch(request, env, ctx);
    const ws = response.webSocket!;

    const { promise, resolve, reject } = Promise.withResolvers<void>();
    ws.accept();
    ws.addEventListener("message", (message) => {
      try {
        // The server redefines state/setState and uses them to send back
        // { answer: 42 }, proving that Object.defineProperty worked.
        expect(JSON.parse(message.data as string)).toEqual({ answer: 42 });
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        ws.close();
      }
    });

    return promise;
  });

  it("allows state and setState to be redefined on a non-hibernating connection", async () => {
    const ctx = createExecutionContext();
    const request = new Request(
      "http://example.com/parties/configurable-state-in-memory/room1",
      {
        headers: {
          Upgrade: "websocket"
        }
      }
    );
    const response = await worker.fetch(request, env, ctx);
    const ws = response.webSocket!;

    const { promise, resolve, reject } = Promise.withResolvers<void>();
    ws.accept();
    ws.addEventListener("message", (message) => {
      try {
        // The non-hibernating server redefines state/setState and sends back
        // { answer: 99 }, proving Object.defineProperty works on this path too.
        expect(JSON.parse(message.data as string)).toEqual({ answer: 99 });
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        ws.close();
      }
    });

    return promise;
  });

  it("persists state through setState and reads it back via state getter", async () => {
    const ctx = createExecutionContext();
    const request = new Request(
      "http://example.com/parties/state-round-trip/room1",
      {
        headers: { Upgrade: "websocket" }
      }
    );
    const response = await worker.fetch(request, env, ctx);
    const ws = response.webSocket!;
    ws.accept();

    // Collect all messages to verify the full round-trip
    const messages: unknown[] = [];
    const { promise, resolve, reject } = Promise.withResolvers<void>();

    ws.addEventListener("message", (event) => {
      try {
        messages.push(JSON.parse(event.data as string));

        if (messages.length === 1) {
          // First response: "get" should return the initial state set in onConnect
          expect(messages[0]).toEqual({ count: 1 });
          // Now ask the server to increment using the updater function form
          ws.send("increment");
        } else if (messages.length === 2) {
          // Second response: state should reflect the increment
          expect(messages[1]).toEqual({ count: 2 });
          resolve();
        }
      } catch (e) {
        reject(e);
      }
    });

    // Ask the server to read back the state that was set in onConnect
    ws.send("get");

    await promise;
    ws.close();
  });

  // it("can be connected with a query parameter");
  // it("can be connected with a header");

  // describe("hibernated");
  // describe("in-memory");
});
