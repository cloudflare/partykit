import {
  createExecutionContext,
  env,
  runDurableObjectAlarm
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

  it("provides className with the Durable Object class name", async () => {
    const ctx = createExecutionContext();
    const request = new Request(
      "http://example.com/parties/on-start-server/lobby-info"
    );
    const response = await worker.fetch(request, env, ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      className: "OnStartServer",
      name: "lobby-info"
    });
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

describe("Hibernating Server (setName handles initialization)", () => {
  it("calls onStart before processing connections", async () => {
    const ctx = createExecutionContext();
    const request = new Request(
      "http://example.com/parties/hibernating-on-start-server/h-test1",
      {
        headers: { Upgrade: "websocket" }
      }
    );
    const response = await worker.fetch(request, env, ctx);
    const ws = response.webSocket!;
    ws.accept();

    const { promise, resolve, reject } = Promise.withResolvers<void>();
    ws.addEventListener("message", (message) => {
      try {
        // counter should be 1 because onStart completed before onConnect
        expect(message.data).toEqual("1");
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        ws.close();
      }
    });

    return promise;
  });

  it("calls onStart only once with concurrent connections and requests", async () => {
    const ctx = createExecutionContext();

    async function makeConnection() {
      const request = new Request(
        "http://example.com/parties/hibernating-on-start-server/h-test2",
        {
          headers: { Upgrade: "websocket" }
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
        } catch (e) {
          reject(e);
        } finally {
          ws.close();
        }
      });
      return promise;
    }

    async function makeRequest() {
      const request = new Request(
        "http://example.com/parties/hibernating-on-start-server/h-test2"
      );
      const response = await worker.fetch(request, env, ctx);
      expect(await response.text()).toEqual("1");
    }

    await Promise.all([makeConnection(), makeConnection(), makeRequest()]);
  });

  it("handles websocket messages after initialization", async () => {
    const ctx = createExecutionContext();
    const request = new Request(
      "http://example.com/parties/hibernating-on-start-server/h-test3",
      {
        headers: { Upgrade: "websocket" }
      }
    );
    const response = await worker.fetch(request, env, ctx);
    const ws = response.webSocket!;
    ws.accept();

    // Wait for the onConnect message
    const connectMessage = await new Promise<string>((resolve) => {
      ws.addEventListener("message", (e) => resolve(e.data as string), {
        once: true
      });
    });
    expect(connectMessage).toEqual("1");

    // Send a message and verify the server is still initialized
    ws.send("hello");
    const echoMessage = await new Promise<string>((resolve) => {
      ws.addEventListener("message", (e) => resolve(e.data as string), {
        once: true
      });
    });
    expect(echoMessage).toEqual("counter:1");

    ws.close();
  });
});

describe("Error handling", () => {
  it("returns 500 with useful message when room header is missing", async () => {
    // Send a request directly to a DO stub without the x-partykit-room header.
    // This should return a 500 with the "Missing namespace or room headers"
    // message, NOT crash with "Attempting to read .name before it was set".
    const id = env.Stateful.idFromName("no-header-test");
    const stub = env.Stateful.get(id);
    const response = await stub.fetch(
      new Request("http://example.com/some-path")
    );
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toContain("Missing namespace or room headers");
  });
});

describe("onStart failure recovery", () => {
  it("resets status so subsequent requests can retry initialization", async () => {
    const ctx = createExecutionContext();

    // First request: onStart throws on first attempt, returns 500
    const request1 = new Request(
      "http://example.com/parties/failing-on-start-server/recovery-test"
    );
    const response1 = await worker.fetch(request1, env, ctx);
    expect(response1.status).toBe(500);

    // Second request: onStart should succeed on the retry because
    // the status was reset to "zero" (not stuck at "starting"), and
    // the error was caught inside blockConcurrencyWhile so the DO's
    // input gate wasn't permanently broken.
    const request2 = new Request(
      "http://example.com/parties/failing-on-start-server/recovery-test"
    );
    const response2 = await worker.fetch(request2, env, ctx);
    expect(response2.status).toBe(200);
    const data = (await response2.json()) as {
      counter: number;
      failCount: number;
    };
    // counter is 2 because onStart ran twice (first failed, second succeeded)
    expect(data.counter).toEqual(2);
    expect(data.failCount).toEqual(1);
  });
});

describe("Hibernating server name rehydration", () => {
  it("this.name and connection.server are available in onConnect", async () => {
    const ctx = createExecutionContext();
    const request = new Request(
      "http://example.com/parties/hibernating-name-in-message/connect-test",
      {
        headers: { Upgrade: "websocket" }
      }
    );
    const response = await worker.fetch(request, env, ctx);
    const ws = response.webSocket!;
    ws.accept();

    const connectMessage = await new Promise<string>((resolve) => {
      ws.addEventListener("message", (e) => resolve(e.data as string), {
        once: true
      });
    });
    expect(connectMessage).toEqual("connected:connect-test:connect-test");

    ws.close();
  });

  it("this.name and connection.server are available in onMessage after wake-up", async () => {
    const ctx = createExecutionContext();
    const request = new Request(
      "http://example.com/parties/hibernating-name-in-message/rehydrate-test",
      {
        headers: { Upgrade: "websocket" }
      }
    );
    const response = await worker.fetch(request, env, ctx);
    const ws = response.webSocket!;
    ws.accept();

    // Wait for the onConnect message
    await new Promise<string>((resolve) => {
      ws.addEventListener("message", (e) => resolve(e.data as string), {
        once: true
      });
    });

    // Send a message to trigger onMessage after hibernation wake-up
    ws.send("ping");
    const nameMessage = await new Promise<string>((resolve) => {
      ws.addEventListener("message", (e) => resolve(e.data as string), {
        once: true
      });
    });
    expect(nameMessage).toEqual("name:rehydrate-test:rehydrate-test");

    ws.close();
  });
});

describe("Alarm (initialize without redundant blockConcurrencyWhile)", () => {
  it("properly initializes on alarm and calls onAlarm", async () => {
    // Use a single stub for the entire test so runDurableObjectAlarm
    // sees the same DO instance that has the alarm scheduled.
    const id = env.AlarmServer.idFromName("alarm-test1");
    const stub = env.AlarmServer.get(id);

    // Initialize the DO and schedule an alarm in one request
    const res = await stub.fetch(
      new Request(
        "http://example.com/parties/alarm-server/alarm-test1?setAlarm=1",
        {
          headers: { "x-partykit-room": "alarm-test1" }
        }
      )
    );
    expect(await res.text()).toEqual("alarm set");

    // Trigger the alarm
    const ran = await runDurableObjectAlarm(stub);
    expect(ran).toBe(true);

    // Verify state: onStart called once, alarm was triggered once
    const stateRes = await stub.fetch(
      new Request("http://example.com/", {
        headers: { "x-partykit-room": "alarm-test1" }
      })
    );
    const state = (await stateRes.json()) as {
      counter: number;
      alarmCount: number;
    };
    expect(state.counter).toEqual(1);
    expect(state.alarmCount).toEqual(1);
  });
});

describe("Name persistence via storage", () => {
  it("persists name to storage when setName is called", async () => {
    const id = env.Stateful.idFromName("storage-persist-test");
    const stub = env.Stateful.get(id);

    const res = await stub.fetch(
      new Request("http://example.com/parties/stateful/storage-persist-test", {
        headers: { "x-partykit-room": "storage-persist-test" }
      })
    );
    const data = (await res.json()) as { name: string };
    expect(data.name).toBe("storage-persist-test");
  });

  it("this.name is available inside onAlarm after normal setup", async () => {
    const id = env.AlarmNameServer.idFromName("alarm-name-normal");
    const stub = env.AlarmNameServer.get(id);

    const setupRes = await stub.fetch(
      new Request(
        "http://example.com/parties/alarm-name-server/alarm-name-normal?setAlarm=1",
        { headers: { "x-partykit-room": "alarm-name-normal" } }
      )
    );
    expect(await setupRes.text()).toBe("alarm set");

    const ran = await runDurableObjectAlarm(stub);
    expect(ran).toBe(true);

    const stateRes = await stub.fetch(
      new Request("http://example.com/", {
        headers: { "x-partykit-room": "alarm-name-normal" }
      })
    );
    const state = (await stateRes.json()) as {
      name: string;
      alarmName: string | null;
      onStartName: string | null;
    };
    expect(state.name).toBe("alarm-name-normal");
    expect(state.alarmName).toBe("alarm-name-normal");
  });

  it("hydrates name from storage on cold alarm wake (bypassing setName)", async () => {
    // Seed storage directly without calling setName — simulates a DO
    // that was previously named, went to sleep, and wakes cold.
    const id = env.AlarmNameServer.idFromName("alarm-cold-wake");
    const stub = env.AlarmNameServer.get(id);

    const seedRes = await stub.fetch(
      new Request("http://example.com/?seed=1&name=alarm-cold-wake")
    );
    expect(await seedRes.text()).toBe("seeded");

    const ran = await runDurableObjectAlarm(stub);
    expect(ran).toBe(true);

    const stateRes = await stub.fetch(
      new Request("http://example.com/", {
        headers: { "x-partykit-room": "alarm-cold-wake" }
      })
    );
    const state = (await stateRes.json()) as {
      alarmName: string | null;
      onStartName: string | null;
    };
    expect(state.alarmName).toBe("alarm-cold-wake");
  });

  it("this.name is available inside onStart during alarm wake", async () => {
    const id = env.AlarmNameServer.idFromName("alarm-onstart-name");
    const stub = env.AlarmNameServer.get(id);

    const seedRes = await stub.fetch(
      new Request("http://example.com/?seed=1&name=alarm-onstart-name")
    );
    expect(await seedRes.text()).toBe("seeded");

    const ran = await runDurableObjectAlarm(stub);
    expect(ran).toBe(true);

    const stateRes = await stub.fetch(
      new Request("http://example.com/", {
        headers: { "x-partykit-room": "alarm-onstart-name" }
      })
    );
    const state = (await stateRes.json()) as {
      onStartName: string | null;
    };
    expect(state.onStartName).toBe("alarm-onstart-name");
  });

  it("fetch() hydrates name from storage without requiring the header", async () => {
    const id = env.AlarmNameServer.idFromName("fetch-no-header");
    const stub = env.AlarmNameServer.get(id);

    // First request sets the name via the header (normal path)
    await stub.fetch(
      new Request(
        "http://example.com/parties/alarm-name-server/fetch-no-header",
        { headers: { "x-partykit-room": "fetch-no-header" } }
      )
    );

    // Second request: no x-partykit-room header.
    // Should still work because the name is in storage.
    const res = await stub.fetch(new Request("http://example.com/"));
    const data = (await res.json()) as { name: string };
    expect(data.name).toBe("fetch-no-header");
  });

  it("setName is idempotent for the same value", async () => {
    const id = env.AlarmNameServer.idFromName("idempotent-test");
    const stub = env.AlarmNameServer.get(id);

    // First call
    const res1 = await stub.fetch(
      new Request(
        "http://example.com/parties/alarm-name-server/idempotent-test",
        { headers: { "x-partykit-room": "idempotent-test" } }
      )
    );
    expect(res1.status).toBe(200);

    // Second call with same name — should not throw
    const res2 = await stub.fetch(
      new Request("http://example.com/", {
        headers: { "x-partykit-room": "idempotent-test" }
      })
    );
    const data = (await res2.json()) as { name: string };
    expect(data.name).toBe("idempotent-test");
  });

  it("throws when name was never set and is not in storage", async () => {
    const id = env.NoNameServer.idFromName("no-name-test");
    const stub = env.NoNameServer.get(id);

    // Direct fetch without the header — name was never persisted
    const res = await stub.fetch(new Request("http://example.com/"));
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).toContain("Missing namespace or room headers");
  });

  it("getServerByName persists the name for future access", async () => {
    const ctx = createExecutionContext();

    // Use routePartykitRequest to hit the DO and set its name
    const request = new Request(
      "http://example.com/parties/alarm-name-server/gsbn-test"
    );
    const response = await worker.fetch(request, env, ctx);
    expect(response.status).toBe(200);
    const data = (await response.json()) as { name: string };
    expect(data.name).toBe("gsbn-test");

    // Now fetch the same DO directly without the header
    const id = env.AlarmNameServer.idFromName("gsbn-test");
    const stub = env.AlarmNameServer.get(id);
    const directRes = await stub.fetch(new Request("http://example.com/"));
    const directData = (await directRes.json()) as { name: string };
    expect(directData.name).toBe("gsbn-test");
  });
});

describe("CORS", () => {
  it("returns CORS headers on OPTIONS preflight for matched routes", async () => {
    const ctx = createExecutionContext();
    const request = new Request(
      "http://example.com/cors-parties/cors-server/room1",
      { method: "OPTIONS" }
    );
    const response = await worker.fetch(request, env, ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, POST, HEAD, OPTIONS"
    );
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe("*");
    expect(response.headers.get("Access-Control-Max-Age")).toBe("86400");
    // Credentials header should NOT be in defaults (contradicts wildcard origin)
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });

  it("does not handle OPTIONS for unmatched routes (returns 404 from fallback)", async () => {
    const ctx = createExecutionContext();
    const request = new Request("http://example.com/other-path", {
      method: "OPTIONS"
    });
    const response = await worker.fetch(request, env, ctx);
    expect(response.status).toBe(404);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("does not handle OPTIONS for routes without cors enabled", async () => {
    const ctx = createExecutionContext();
    // The default /parties/ prefix has no cors option
    const request = new Request("http://example.com/parties/stateful/room1", {
      method: "OPTIONS"
    });
    const response = await worker.fetch(request, env, ctx);
    // Without cors, OPTIONS goes to the DO like any other request
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("appends CORS headers to regular (non-WebSocket) responses", async () => {
    const ctx = createExecutionContext();
    const request = new Request(
      "http://example.com/cors-parties/cors-server/room1"
    );
    const response = await worker.fetch(request, env, ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ cors: true });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, POST, HEAD, OPTIONS"
    );
  });

  it("does not append CORS headers to WebSocket upgrade responses", async () => {
    const ctx = createExecutionContext();
    const request = new Request(
      "http://example.com/cors-parties/cors-server/room1",
      {
        headers: { Upgrade: "websocket" }
      }
    );
    const response = await worker.fetch(request, env, ctx);
    expect(response.status).toBe(101);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    response.webSocket?.accept();
    response.webSocket?.close();
  });

  it("supports custom HeadersInit CORS headers", async () => {
    const ctx = createExecutionContext();
    const request = new Request(
      "http://example.com/custom-cors-parties/custom-cors-server/room1"
    );
    const response = await worker.fetch(request, env, ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ customCors: true });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://example.com"
    );
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, POST"
    );
    // Should not have the default headers that weren't specified
    expect(response.headers.get("Access-Control-Max-Age")).toBeNull();
  });

  it("supports custom HeadersInit CORS headers on OPTIONS preflight", async () => {
    const ctx = createExecutionContext();
    const request = new Request(
      "http://example.com/custom-cors-parties/custom-cors-server/room1",
      { method: "OPTIONS" }
    );
    const response = await worker.fetch(request, env, ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://example.com"
    );
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, POST"
    );
  });

  it("does not add CORS headers when cors option is not set", async () => {
    const ctx = createExecutionContext();
    const request = new Request("http://example.com/parties/stateful/room1");
    const response = await worker.fetch(request, env, ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("appends CORS headers to responses returned by onBeforeRequest", async () => {
    const ctx = createExecutionContext();
    const request = new Request(
      "http://example.com/cors-parties/cors-server/blocked"
    );
    const response = await worker.fetch(request, env, ctx);
    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Forbidden");
    // CORS headers must be present so the browser can read the error
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, POST, HEAD, OPTIONS"
    );
  });
});

describe("Connection tags", () => {
  it("exposes tags on a hibernating connection", async () => {
    const ctx = createExecutionContext();
    const request = new Request(
      "http://example.com/parties/tags-server/room1",
      {
        headers: { Upgrade: "websocket" }
      }
    );
    const response = await worker.fetch(request, env, ctx);
    const ws = response.webSocket!;
    ws.accept();

    const { promise, resolve, reject } = Promise.withResolvers<void>();
    ws.addEventListener("message", (message) => {
      try {
        const tags = JSON.parse(message.data as string) as string[];
        // Should include the auto-prepended connection id plus the custom tags
        expect(tags).toHaveLength(3);
        expect(tags[0]).toBeTypeOf("string"); // connection id
        expect(tags).toContain("role:admin");
        expect(tags).toContain("room:lobby");
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        ws.close();
      }
    });

    return promise;
  });

  it("exposes tags on a hibernating connection after wake-up", async () => {
    const ctx = createExecutionContext();
    const request = new Request(
      "http://example.com/parties/tags-server/room2",
      {
        headers: { Upgrade: "websocket" }
      }
    );
    const response = await worker.fetch(request, env, ctx);
    const ws = response.webSocket!;
    ws.accept();

    // Wait for the onConnect message
    const connectMessage = await new Promise<string>((resolve) => {
      ws.addEventListener("message", (e) => resolve(e.data as string), {
        once: true
      });
    });
    const connectTags = JSON.parse(connectMessage) as string[];
    expect(connectTags).toContain("role:admin");

    // Send a message to trigger onMessage, which reads tags again
    ws.send("ping");
    const wakeMessage = await new Promise<string>((resolve) => {
      ws.addEventListener("message", (e) => resolve(e.data as string), {
        once: true
      });
    });
    const wakeTags = JSON.parse(wakeMessage) as string[];
    expect(wakeTags).toHaveLength(3);
    expect(wakeTags).toContain("role:admin");
    expect(wakeTags).toContain("room:lobby");

    ws.close();
  });

  it("exposes tags on a non-hibernating (in-memory) connection", async () => {
    const ctx = createExecutionContext();
    const request = new Request(
      "http://example.com/parties/tags-server-in-memory/room1",
      {
        headers: { Upgrade: "websocket" }
      }
    );
    const response = await worker.fetch(request, env, ctx);
    const ws = response.webSocket!;
    ws.accept();

    const { promise, resolve, reject } = Promise.withResolvers<void>();
    ws.addEventListener("message", (message) => {
      try {
        const tags = JSON.parse(message.data as string) as string[];
        // Should include the auto-prepended connection id plus the custom tags
        expect(tags).toHaveLength(3);
        expect(tags[0]).toBeTypeOf("string"); // connection id
        expect(tags).toContain("role:viewer");
        expect(tags).toContain("room:general");
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        ws.close();
      }
    });

    return promise;
  });
});
