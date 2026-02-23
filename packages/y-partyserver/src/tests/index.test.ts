import { createExecutionContext, env } from "cloudflare:test";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as Y from "yjs";
import { describe, expect, it } from "vitest";

import worker from "./worker";

import type { Env } from "./worker";

declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {}
}

// ---------------------------------------------------------------------------
// Yjs protocol constants (must match server)
// ---------------------------------------------------------------------------
const messageSync = 0;
const messageAwareness = 1;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a WebSocket upgrade request for the given DO path */
function wsRequest(path: string): Request {
  return new Request(`http://example.com/parties/${path}`, {
    headers: { Upgrade: "websocket" }
  });
}

/** Create a regular HTTP request for the given DO path */
function httpRequest(path: string): Request {
  return new Request(`http://example.com/parties/${path}`);
}

/** Accept a WebSocket from a fetch response */
function acceptWs(response: Response): WebSocket {
  const ws = response.webSocket!;
  ws.accept();
  return ws;
}

/** Wait for the next binary message on a WebSocket */
function nextBinaryMessage(ws: WebSocket): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for binary message")),
      5000
    );
    const handler = (event: MessageEvent) => {
      if (event.data instanceof ArrayBuffer) {
        clearTimeout(timeout);
        ws.removeEventListener("message", handler);
        resolve(event.data);
      }
      // skip string messages, keep listening
    };
    ws.addEventListener("message", handler);
  });
}

/** Wait for the next string message on a WebSocket */
function nextStringMessage(ws: WebSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for string message")),
      5000
    );
    const handler = (event: MessageEvent) => {
      if (typeof event.data === "string") {
        clearTimeout(timeout);
        ws.removeEventListener("message", handler);
        resolve(event.data);
      }
      // skip binary messages, keep listening
    };
    ws.addEventListener("message", handler);
  });
}

/** Collect all messages for a short period */
function collectMessages(
  ws: WebSocket,
  durationMs: number
): Promise<Array<string | ArrayBuffer>> {
  return new Promise((resolve) => {
    const messages: Array<string | ArrayBuffer> = [];
    const handler = (event: MessageEvent) => {
      messages.push(event.data as string | ArrayBuffer);
    };
    ws.addEventListener("message", handler);
    setTimeout(() => {
      ws.removeEventListener("message", handler);
      resolve(messages);
    }, durationMs);
  });
}

/**
 * Perform the Yjs sync handshake on a WebSocket.
 * Reads the server's sync step 1, responds with sync step 2 + our sync step 1,
 * then reads the server's sync step 2.
 */
async function performSync(ws: WebSocket, doc: Y.Doc): Promise<void> {
  // The server sends sync step 1 on connect — read it
  const msg1 = await nextBinaryMessage(ws);
  const decoder1 = decoding.createDecoder(new Uint8Array(msg1));
  const msgType1 = decoding.readVarUint(decoder1);
  expect(msgType1).toBe(messageSync);

  // Process server's sync step 1 and generate our response
  const encoder1 = encoding.createEncoder();
  encoding.writeVarUint(encoder1, messageSync);
  syncProtocol.readSyncMessage(decoder1, encoder1, doc, null);

  // Send our sync step 2 (response to server's step 1)
  if (encoding.length(encoder1) > 1) {
    ws.send(encoding.toUint8Array(encoder1));
  }

  // Also send our sync step 1
  const encoder2 = encoding.createEncoder();
  encoding.writeVarUint(encoder2, messageSync);
  syncProtocol.writeSyncStep1(encoder2, doc);
  ws.send(encoding.toUint8Array(encoder2));
}

/**
 * Send a Yjs update to the server via the WebSocket
 */
function sendUpdate(ws: WebSocket, update: Uint8Array): void {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeUpdate(encoder, update);
  ws.send(encoding.toUint8Array(encoder));
}

/**
 * Apply any incoming binary Yjs messages to a local doc.
 * Returns the number of messages applied.
 */
function applyIncomingMessages(
  messages: Array<string | ArrayBuffer>,
  doc: Y.Doc
): number {
  let applied = 0;
  for (const msg of messages) {
    if (!(msg instanceof ArrayBuffer)) continue;
    const decoder = decoding.createDecoder(new Uint8Array(msg));
    const msgType = decoding.readVarUint(decoder);
    if (msgType === messageSync) {
      const responseEncoder = encoding.createEncoder();
      encoding.writeVarUint(responseEncoder, messageSync);
      syncProtocol.readSyncMessage(decoder, responseEncoder, doc, null);
      applied++;
    }
  }
  return applied;
}

// ===========================================================================
// Tests
// ===========================================================================

describe("YServer — basic sync", () => {
  it("accepts a WebSocket connection and sends sync step 1", async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(wsRequest("y-basic/room1"), env, ctx);
    expect(response.status).toBe(101);
    const ws = acceptWs(response);

    // Server should send sync step 1 immediately
    const msg = await nextBinaryMessage(ws);
    const decoder = decoding.createDecoder(new Uint8Array(msg));
    const msgType = decoding.readVarUint(decoder);
    expect(msgType).toBe(messageSync);

    // The inner message should be sync step 1
    const syncMsgType = decoding.readVarUint(decoder);
    expect(syncMsgType).toBe(syncProtocol.messageYjsSyncStep1);

    ws.close();
  });

  it("syncs a document between two clients", async () => {
    const ctx = createExecutionContext();
    const roomName = "sync-two-clients";

    // --- Client A connects and inserts text ---
    const resA = await worker.fetch(wsRequest(`y-basic/${roomName}`), env, ctx);
    const wsA = acceptWs(resA);
    const docA = new Y.Doc();

    await performSync(wsA, docA);

    // Insert text on client A
    docA.getText("shared").insert(0, "hello from A");

    // docA will have generated an update — send it to the server
    const updateA = Y.encodeStateAsUpdate(docA);
    sendUpdate(wsA, updateA);

    // Give the server a moment to process
    await new Promise((r) => setTimeout(r, 100));

    // --- Client B connects and should receive A's state ---
    const resB = await worker.fetch(wsRequest(`y-basic/${roomName}`), env, ctx);
    const wsB = acceptWs(resB);
    const docB = new Y.Doc();

    await performSync(wsB, docB);

    // Collect messages for a bit to get sync step 2 from server
    const messagesB = await collectMessages(wsB, 200);
    applyIncomingMessages(messagesB, docB);

    expect(docB.getText("shared").toString()).toBe("hello from A");

    wsA.close();
    wsB.close();
  });

  it("broadcasts updates from one client to another", async () => {
    const ctx = createExecutionContext();
    const roomName = "broadcast-test";

    // Connect client A
    const resA = await worker.fetch(wsRequest(`y-basic/${roomName}`), env, ctx);
    const wsA = acceptWs(resA);
    const docA = new Y.Doc();
    await performSync(wsA, docA);

    // Connect client B
    const resB = await worker.fetch(wsRequest(`y-basic/${roomName}`), env, ctx);
    const wsB = acceptWs(resB);
    const docB = new Y.Doc();
    await performSync(wsB, docB);

    // Drain any initial sync messages on B
    await collectMessages(wsB, 100);

    // Client A inserts text — capture the incremental update
    const updatePromise = new Promise<Uint8Array>((resolve) => {
      docA.on("update", (update: Uint8Array) => {
        resolve(update);
      });
    });
    docA.getText("shared").insert(0, "broadcast!");
    const incrementalUpdate = await updatePromise;

    // Send just the incremental update to the server
    sendUpdate(wsA, incrementalUpdate);

    // Client B should receive the broadcast
    const messagesB = await collectMessages(wsB, 300);
    applyIncomingMessages(messagesB, docB);

    expect(docB.getText("shared").toString()).toBe("broadcast!");

    wsA.close();
    wsB.close();
  });
});

describe("YServer — awareness", () => {
  it("broadcasts awareness updates between clients", async () => {
    const ctx = createExecutionContext();
    const roomName = "awareness-test";

    // Connect client A
    const resA = await worker.fetch(wsRequest(`y-basic/${roomName}`), env, ctx);
    const wsA = acceptWs(resA);
    const docA = new Y.Doc();
    const awarenessA = new awarenessProtocol.Awareness(docA);

    await performSync(wsA, docA);

    // Connect client B
    const resB = await worker.fetch(wsRequest(`y-basic/${roomName}`), env, ctx);
    const wsB = acceptWs(resB);
    const docB = new Y.Doc();
    const awarenessB = new awarenessProtocol.Awareness(docB);

    await performSync(wsB, docB);
    // Drain initial messages
    await collectMessages(wsB, 100);

    // Set awareness state on client A
    awarenessA.setLocalState({ user: { name: "Alice" } });

    // Encode and send awareness update
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, messageAwareness);
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(awarenessA, [docA.clientID])
    );
    wsA.send(encoding.toUint8Array(awarenessEncoder));

    // Client B should receive the awareness update
    const messagesB = await collectMessages(wsB, 300);
    let awarenessReceived = false;
    for (const msg of messagesB) {
      if (!(msg instanceof ArrayBuffer)) continue;
      const decoder = decoding.createDecoder(new Uint8Array(msg));
      const msgType = decoding.readVarUint(decoder);
      if (msgType === messageAwareness) {
        awarenessProtocol.applyAwarenessUpdate(
          awarenessB,
          decoding.readVarUint8Array(decoder),
          null
        );
        awarenessReceived = true;
      }
    }

    expect(awarenessReceived).toBe(true);
    const stateA = awarenessB.getStates().get(docA.clientID);
    expect(stateA).toBeDefined();
    expect((stateA as { user: { name: string } }).user.name).toBe("Alice");

    wsA.close();
    wsB.close();
  });
});

describe("YServer — persistence (onLoad / onSave)", () => {
  it("persists document state via onSave and restores via onLoad", async () => {
    const ctx = createExecutionContext();
    const roomName = "persist-test";

    // --- Session 1: Connect, write data, then disconnect ---
    {
      const res = await worker.fetch(
        wsRequest(`y-persistent/${roomName}`),
        env,
        ctx
      );
      const ws = acceptWs(res);
      const doc = new Y.Doc();
      await performSync(ws, doc);

      // Insert text
      const updatePromise = new Promise<Uint8Array>((resolve) => {
        doc.on("update", (update: Uint8Array) => resolve(update));
      });
      doc.getText("shared").insert(0, "persisted!");
      const update = await updatePromise;
      sendUpdate(ws, update);

      // Wait for debounced onSave to fire (debounceWait: 50, maxWait: 100)
      await new Promise((r) => setTimeout(r, 250));

      ws.close();
    }

    // Small gap between sessions
    await new Promise((r) => setTimeout(r, 100));

    // --- Session 2: Reconnect and verify state was loaded ---
    {
      const res = await worker.fetch(
        wsRequest(`y-persistent/${roomName}`),
        env,
        ctx
      );
      const ws = acceptWs(res);
      const doc = new Y.Doc();
      await performSync(ws, doc);

      // Collect sync step 2 from server which should contain the persisted state
      const messages = await collectMessages(ws, 300);
      applyIncomingMessages(messages, doc);

      expect(doc.getText("shared").toString()).toBe("persisted!");
      ws.close();
    }
  });
});

describe("YServer — read-only mode", () => {
  it("accepts connections but rejects write updates", async () => {
    const ctx = createExecutionContext();
    const roomName = "readonly-test";

    // Connect to the read-only server
    const res = await worker.fetch(
      wsRequest(`y-read-only/${roomName}`),
      env,
      ctx
    );
    const ws = acceptWs(res);
    const doc = new Y.Doc();

    // Should receive the "connected:readonly" string message
    const stringMsg = nextStringMessage(ws);

    await performSync(ws, doc);

    expect(await stringMsg).toBe("connected:readonly");

    // Try to send an update — it should be silently ignored
    const updatePromise = new Promise<Uint8Array>((resolve) => {
      doc.on("update", (update: Uint8Array) => resolve(update));
    });
    doc.getText("shared").insert(0, "should-be-rejected");
    const update = await updatePromise;
    sendUpdate(ws, update);

    // Wait for any potential broadcast
    await new Promise((r) => setTimeout(r, 200));

    // Connect a second client to check the server document is still empty
    const res2 = await worker.fetch(
      wsRequest(`y-read-only/${roomName}`),
      env,
      ctx
    );
    const ws2 = acceptWs(res2);
    const doc2 = new Y.Doc();
    await performSync(ws2, doc2);
    const messages2 = await collectMessages(ws2, 200);
    applyIncomingMessages(messages2, doc2);

    // The server doc should be empty since the write was rejected
    expect(doc2.getText("shared").toString()).toBe("");

    ws.close();
    ws2.close();
  });
});

describe("YServer — custom messages", () => {
  it("handles ping/pong custom messages", async () => {
    const ctx = createExecutionContext();
    const roomName = "custom-msg-test";

    const res = await worker.fetch(
      wsRequest(`y-custom-message/${roomName}`),
      env,
      ctx
    );
    const ws = acceptWs(res);

    // Drain initial sync messages
    await collectMessages(ws, 100);

    // Send a custom ping message using the __YPS: prefix
    ws.send(`__YPS:${JSON.stringify({ action: "ping" })}`);

    // Should receive a pong back
    const pong = await nextStringMessage(ws);
    expect(pong.startsWith("__YPS:")).toBe(true);
    const pongData = JSON.parse(pong.slice(6));
    expect(pongData).toEqual({ action: "pong" });

    ws.close();
  });

  it("broadcasts custom messages to other clients", async () => {
    const ctx = createExecutionContext();
    const roomName = "custom-broadcast-test";

    // Connect client A
    const resA = await worker.fetch(
      wsRequest(`y-custom-message/${roomName}`),
      env,
      ctx
    );
    const wsA = acceptWs(resA);
    await collectMessages(wsA, 100);

    // Connect client B
    const resB = await worker.fetch(
      wsRequest(`y-custom-message/${roomName}`),
      env,
      ctx
    );
    const wsB = acceptWs(resB);
    await collectMessages(wsB, 100);

    // Client A sends a broadcast request
    wsA.send(`__YPS:${JSON.stringify({ action: "broadcast" })}`);

    // Client B should receive the broadcasted message
    const msg = await nextStringMessage(wsB);
    expect(msg.startsWith("__YPS:")).toBe(true);
    const data = JSON.parse(msg.slice(6));
    expect(data).toEqual({ action: "broadcasted" });

    // Client A should NOT receive the broadcast (excluded)
    const msgsA = await collectMessages(wsA, 200);
    const customMsgsA = msgsA.filter(
      (m) => typeof m === "string" && m.includes("broadcasted")
    );
    expect(customMsgsA).toHaveLength(0);

    wsA.close();
    wsB.close();
  });

  it("handles non-prefixed string messages gracefully", async () => {
    const ctx = createExecutionContext();
    const roomName = "custom-nopfx-test";

    const res = await worker.fetch(
      wsRequest(`y-custom-message/${roomName}`),
      env,
      ctx
    );
    const ws = acceptWs(res);
    await collectMessages(ws, 100);

    // Send a string message without __YPS: prefix — should be ignored, not crash
    ws.send("hello without prefix");

    // Give the server time to process; it should log a warning but not crash
    await new Promise((r) => setTimeout(r, 100));

    // Connection should still be alive — verify by sending a valid message
    ws.send(`__YPS:${JSON.stringify({ action: "echo" })}`);
    const echoMsg = await nextStringMessage(ws);
    expect(echoMsg.startsWith("__YPS:")).toBe(true);
    const echoData = JSON.parse(echoMsg.slice(6));
    expect(echoData).toEqual({ action: "echo" });

    ws.close();
  });
});

describe("YServer — onLoad returns a YDoc", () => {
  it("seeds the document from a returned YDoc", async () => {
    const ctx = createExecutionContext();
    const roomName = "onload-return-doc";

    const res = await worker.fetch(
      wsRequest(`y-on-load-returns-doc/${roomName}`),
      env,
      ctx
    );
    const ws = acceptWs(res);
    const doc = new Y.Doc();
    await performSync(ws, doc);

    // Collect messages to get the server's document state
    const messages = await collectMessages(ws, 300);
    applyIncomingMessages(messages, doc);

    // The server should have the seeded content from onLoad
    expect(doc.getText("shared").toString()).toBe("seeded-content");

    ws.close();
  });
});

describe("YServer — onSave callback options", () => {
  it("calls onSave after debounce period", async () => {
    const ctx = createExecutionContext();
    const roomName = "callback-opts-test";

    const res = await worker.fetch(
      wsRequest(`y-callback-options/${roomName}`),
      env,
      ctx
    );
    const ws = acceptWs(res);
    const doc = new Y.Doc();
    await performSync(ws, doc);

    // Send an update to trigger the debounced onSave
    const updatePromise = new Promise<Uint8Array>((resolve) => {
      doc.on("update", (update: Uint8Array) => resolve(update));
    });
    doc.getText("shared").insert(0, "trigger-save");
    const update = await updatePromise;
    sendUpdate(ws, update);

    // Wait for debounce to fire (debounceWait: 50ms, maxWait: 100ms)
    await new Promise((r) => setTimeout(r, 250));

    // Check saveCount via HTTP
    const httpRes = await worker.fetch(
      httpRequest(`y-callback-options/${roomName}`),
      env,
      ctx
    );
    const data = (await httpRes.json()) as { saveCount: number };
    expect(data.saveCount).toBeGreaterThanOrEqual(1);

    ws.close();
  });
});

describe("YServer — connection lifecycle", () => {
  it("cleans up awareness on connection close", async () => {
    const ctx = createExecutionContext();
    const roomName = "cleanup-test";

    // Connect client A
    const resA = await worker.fetch(wsRequest(`y-basic/${roomName}`), env, ctx);
    const wsA = acceptWs(resA);
    const docA = new Y.Doc();
    const awarenessA = new awarenessProtocol.Awareness(docA);
    await performSync(wsA, docA);

    // Set awareness state on client A
    awarenessA.setLocalState({ user: { name: "Alice" } });
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, messageAwareness);
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(awarenessA, [docA.clientID])
    );
    wsA.send(encoding.toUint8Array(awarenessEncoder));
    await new Promise((r) => setTimeout(r, 100));

    // Connect client B
    const resB = await worker.fetch(wsRequest(`y-basic/${roomName}`), env, ctx);
    const wsB = acceptWs(resB);
    const docB = new Y.Doc();
    const awarenessB = new awarenessProtocol.Awareness(docB);
    await performSync(wsB, docB);

    // Client B should receive awareness with Alice
    const msgsB1 = await collectMessages(wsB, 200);
    for (const msg of msgsB1) {
      if (!(msg instanceof ArrayBuffer)) continue;
      const decoder = decoding.createDecoder(new Uint8Array(msg));
      const msgType = decoding.readVarUint(decoder);
      if (msgType === messageAwareness) {
        awarenessProtocol.applyAwarenessUpdate(
          awarenessB,
          decoding.readVarUint8Array(decoder),
          null
        );
      }
    }
    expect(awarenessB.getStates().get(docA.clientID)).toBeDefined();

    // Now close client A
    wsA.close();

    // Client B should receive an awareness removal for A
    const msgsB2 = await collectMessages(wsB, 300);
    for (const msg of msgsB2) {
      if (!(msg instanceof ArrayBuffer)) continue;
      const decoder = decoding.createDecoder(new Uint8Array(msg));
      const msgType = decoding.readVarUint(decoder);
      if (msgType === messageAwareness) {
        awarenessProtocol.applyAwarenessUpdate(
          awarenessB,
          decoding.readVarUint8Array(decoder),
          null
        );
      }
    }

    // A's awareness state should be removed
    expect(awarenessB.getStates().get(docA.clientID)).toBeUndefined();

    wsB.close();
  });

  it("handles multiple concurrent connections to the same room", async () => {
    const ctx = createExecutionContext();
    const roomName = "concurrent-test";

    const clients: Array<{ ws: WebSocket; doc: Y.Doc }> = [];

    // Connect 3 clients
    for (let i = 0; i < 3; i++) {
      const res = await worker.fetch(
        wsRequest(`y-basic/${roomName}`),
        env,
        ctx
      );
      const ws = acceptWs(res);
      const doc = new Y.Doc();
      await performSync(ws, doc);
      clients.push({ ws, doc });
    }

    // Drain initial sync messages
    for (const client of clients) {
      await collectMessages(client.ws, 100);
    }

    // Start collecting on clients 1 and 2 BEFORE sending the update
    // so we don't miss the broadcast
    const collectPromises = [
      collectMessages(clients[1].ws, 500),
      collectMessages(clients[2].ws, 500)
    ];

    // Client 0 inserts text
    const updatePromise = new Promise<Uint8Array>((resolve) => {
      clients[0].doc.on("update", (update: Uint8Array) => resolve(update));
    });
    clients[0].doc.getText("shared").insert(0, "from-client-0");
    const update = await updatePromise;
    sendUpdate(clients[0].ws, update);

    // Wait for collected messages
    const [msgs1, msgs2] = await Promise.all(collectPromises);
    applyIncomingMessages(msgs1, clients[1].doc);
    applyIncomingMessages(msgs2, clients[2].doc);

    expect(clients[1].doc.getText("shared").toString()).toBe("from-client-0");
    expect(clients[2].doc.getText("shared").toString()).toBe("from-client-0");

    for (const client of clients) {
      client.ws.close();
    }
  });
});

describe("YServer — handleMessage binary conversion", () => {
  it("handles ArrayBuffer messages correctly", async () => {
    const ctx = createExecutionContext();
    const roomName = "arraybuffer-test";

    const res = await worker.fetch(wsRequest(`y-basic/${roomName}`), env, ctx);
    const ws = acceptWs(res);
    const doc = new Y.Doc();
    await performSync(ws, doc);

    // Send an update as a raw ArrayBuffer (not Uint8Array)
    doc.getText("shared").insert(0, "arraybuffer-data");
    const update = Y.encodeStateAsUpdate(doc);

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeUpdate(encoder, update);
    const raw = encoding.toUint8Array(encoder);

    // Send as ArrayBuffer
    ws.send(raw.buffer);

    // Give the server time to process
    await new Promise((r) => setTimeout(r, 100));

    // Verify by connecting a second client
    const res2 = await worker.fetch(wsRequest(`y-basic/${roomName}`), env, ctx);
    const ws2 = acceptWs(res2);
    const doc2 = new Y.Doc();
    await performSync(ws2, doc2);
    const msgs = await collectMessages(ws2, 200);
    applyIncomingMessages(msgs, doc2);

    expect(doc2.getText("shared").toString()).toBe("arraybuffer-data");

    ws.close();
    ws2.close();
  });
});

describe("YProvider — URL construction", () => {
  // These are unit tests for the provider's URL logic; they don't need
  // a running server. We import directly and test construction.
  it("strips protocol from host", async () => {
    // We test YProvider construction by importing and checking the url property.
    // We pass connect: false so it doesn't try to actually connect.
    const { default: YProvider } = await import("../provider/index");
    const doc = new Y.Doc();
    const provider = new YProvider("https://example.com", "my-room", doc, {
      connect: false,
      WebSocketPolyfill: null
    });
    expect(provider.url).toContain("wss://example.com");
    expect(provider.url).toContain("my-room");
    expect(provider.url).not.toContain("https://");
    provider.destroy();
  });

  it("strips trailing slash from host (bug fix)", async () => {
    const { default: YProvider } = await import("../provider/index");
    const doc = new Y.Doc();
    const provider = new YProvider("example.com/", "my-room", doc, {
      connect: false,
      WebSocketPolyfill: null
    });
    // Should not have double slashes from un-stripped trailing slash
    expect(provider.url).not.toContain("com//");
    expect(provider.url).toContain("wss://example.com/");
    provider.destroy();
  });

  it("uses ws:// for localhost", async () => {
    const { default: YProvider } = await import("../provider/index");
    const doc = new Y.Doc();
    const provider = new YProvider("localhost:8787", "room", doc, {
      connect: false,
      WebSocketPolyfill: null
    });
    expect(provider.url).toMatch(/^ws:\/\/localhost:8787/);
    provider.destroy();
  });

  it("uses ws:// for 127.0.0.1", async () => {
    const { default: YProvider } = await import("../provider/index");
    const doc = new Y.Doc();
    const provider = new YProvider("127.0.0.1:8787", "room", doc, {
      connect: false,
      WebSocketPolyfill: null
    });
    expect(provider.url).toMatch(/^ws:\/\/127\.0\.0\.1:8787/);
    provider.destroy();
  });

  it("respects explicit protocol option", async () => {
    const { default: YProvider } = await import("../provider/index");
    const doc = new Y.Doc();
    const provider = new YProvider("example.com", "room", doc, {
      connect: false,
      protocol: "ws",
      WebSocketPolyfill: null
    });
    expect(provider.url).toMatch(/^ws:\/\/example\.com/);
    provider.destroy();
  });

  it("uses custom party name in URL path", async () => {
    const { default: YProvider } = await import("../provider/index");
    const doc = new Y.Doc();
    const provider = new YProvider("example.com", "room", doc, {
      connect: false,
      party: "my-party",
      WebSocketPolyfill: null
    });
    expect(provider.url).toContain("/parties/my-party/");
    provider.destroy();
  });

  it("uses custom prefix instead of /parties/:party/", async () => {
    const { default: YProvider } = await import("../provider/index");
    const doc = new Y.Doc();
    const provider = new YProvider("example.com", "room", doc, {
      connect: false,
      prefix: "/custom/path",
      WebSocketPolyfill: null
    });
    expect(provider.url).toContain("/custom/path");
    expect(provider.url).not.toContain("/parties/");
    provider.destroy();
  });
});
