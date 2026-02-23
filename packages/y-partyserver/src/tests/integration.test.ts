import WebSocket from "ws";
import * as Y from "yjs";
import { afterEach, describe, expect, it } from "vitest";

import YProvider from "../provider/index";

const PORT = 8799;
const HOST = `localhost:${PORT}`;

// Track providers for cleanup
const providers: YProvider[] = [];

function createProvider(
  room: string,
  options: {
    party?: string;
    doc?: Y.Doc;
    connect?: boolean;
  } = {}
): YProvider {
  const doc = options.doc ?? new Y.Doc();
  const provider = new YProvider(HOST, room, doc, {
    party: options.party ?? "y-basic",
    connect: options.connect ?? true,
    // Use ws as the WebSocket polyfill for Node.js
    WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
    disableBc: true
  });
  providers.push(provider);
  return provider;
}

function waitForSync(provider: YProvider): Promise<void> {
  return new Promise((resolve, reject) => {
    if (provider.synced) {
      resolve();
      return;
    }
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for sync")),
      10000
    );
    provider.on("synced", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function waitForConnection(provider: YProvider): Promise<void> {
  return new Promise((resolve, reject) => {
    if (provider.wsconnected) {
      resolve();
      return;
    }
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for connection")),
      10000
    );
    provider.on("status", (event: { status: string }) => {
      if (event.status === "connected") {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
}

function waitForCustomMessage(provider: YProvider): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for custom message")),
      10000
    );
    provider.on("custom-message", (message: string) => {
      clearTimeout(timeout);
      resolve(message);
    });
  });
}

afterEach(() => {
  // Destroy all providers created during the test
  for (const p of providers) {
    try {
      p.destroy();
    } catch {
      // ignore
    }
  }
  providers.length = 0;
});

// ---------------------------------------------------------------------------
// Integration tests — real wrangler dev server
// ---------------------------------------------------------------------------

describe("Integration — YProvider ↔ YServer sync", () => {
  it("connects and syncs a document", async () => {
    const room = `sync-basic-${Date.now()}`;
    const provider = createProvider(room);

    await waitForSync(provider);

    expect(provider.synced).toBe(true);
    expect(provider.wsconnected).toBe(true);
  });

  it("syncs text between two providers", async () => {
    const room = `sync-two-${Date.now()}`;

    // Provider A connects and writes
    const docA = new Y.Doc();
    const providerA = createProvider(room, { doc: docA });
    await waitForSync(providerA);

    docA.getText("shared").insert(0, "hello from A");

    // Give server time to process the update
    await new Promise((r) => setTimeout(r, 300));

    // Provider B connects and should receive A's state
    const docB = new Y.Doc();
    const providerB = createProvider(room, { doc: docB });
    await waitForSync(providerB);

    // Wait a bit for sync step 2 to arrive
    await new Promise((r) => setTimeout(r, 500));

    expect(docB.getText("shared").toString()).toBe("hello from A");
  });

  it("broadcasts live updates between connected providers", async () => {
    const room = `sync-live-${Date.now()}`;

    const docA = new Y.Doc();
    const providerA = createProvider(room, { doc: docA });
    await waitForSync(providerA);

    const docB = new Y.Doc();
    const providerB = createProvider(room, { doc: docB });
    await waitForSync(providerB);

    // Wait for initial sync to settle
    await new Promise((r) => setTimeout(r, 300));

    // A writes, B should receive the update in real-time
    const updateReceived = new Promise<void>((resolve) => {
      docB.on("update", () => {
        if (docB.getText("shared").toString() === "live-update") {
          resolve();
        }
      });
    });

    docA.getText("shared").insert(0, "live-update");

    await updateReceived;
    expect(docB.getText("shared").toString()).toBe("live-update");
  });

  it("handles concurrent edits from multiple providers", async () => {
    const room = `sync-concurrent-${Date.now()}`;

    const docA = new Y.Doc();
    const providerA = createProvider(room, { doc: docA });
    await waitForSync(providerA);

    const docB = new Y.Doc();
    const providerB = createProvider(room, { doc: docB });
    await waitForSync(providerB);

    await new Promise((r) => setTimeout(r, 300));

    // Both insert concurrently
    docA.getText("shared").insert(0, "A");
    docB.getText("shared").insert(0, "B");

    // Wait for convergence
    await new Promise((r) => setTimeout(r, 1000));

    // Both docs should converge to the same content (Yjs CRDT)
    const textA = docA.getText("shared").toString();
    const textB = docB.getText("shared").toString();
    expect(textA).toBe(textB);
    expect(textA).toHaveLength(2);
    expect(textA).toContain("A");
    expect(textA).toContain("B");
  });

  it("syncs Map types", async () => {
    const room = `sync-map-${Date.now()}`;

    const docA = new Y.Doc();
    const providerA = createProvider(room, { doc: docA });
    await waitForSync(providerA);

    docA.getMap("config").set("key1", "value1");
    docA.getMap("config").set("key2", 42);

    await new Promise((r) => setTimeout(r, 300));

    const docB = new Y.Doc();
    const providerB = createProvider(room, { doc: docB });
    await waitForSync(providerB);

    await new Promise((r) => setTimeout(r, 500));

    expect(docB.getMap("config").get("key1")).toBe("value1");
    expect(docB.getMap("config").get("key2")).toBe(42);
  });

  it("syncs Array types", async () => {
    const room = `sync-array-${Date.now()}`;

    const docA = new Y.Doc();
    const providerA = createProvider(room, { doc: docA });
    await waitForSync(providerA);

    docA.getArray("items").push(["item1", "item2", "item3"]);

    await new Promise((r) => setTimeout(r, 300));

    const docB = new Y.Doc();
    const providerB = createProvider(room, { doc: docB });
    await waitForSync(providerB);

    await new Promise((r) => setTimeout(r, 500));

    expect(docB.getArray("items").toJSON()).toEqual([
      "item1",
      "item2",
      "item3"
    ]);
  });
});

describe("Integration — awareness", () => {
  it("shares awareness state between providers", async () => {
    const room = `awareness-${Date.now()}`;

    const docA = new Y.Doc();
    const providerA = createProvider(room, { doc: docA });
    await waitForSync(providerA);

    const docB = new Y.Doc();
    const providerB = createProvider(room, { doc: docB });
    await waitForSync(providerB);

    await new Promise((r) => setTimeout(r, 300));

    // Set awareness on A
    providerA.awareness.setLocalState({
      user: { name: "Alice", color: "#ff0000" }
    });

    // Wait for awareness to propagate
    await new Promise<void>((resolve) => {
      const check = () => {
        const stateA = providerB.awareness.getStates().get(docA.clientID);
        if (stateA) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });

    const stateA = providerB.awareness.getStates().get(docA.clientID) as {
      user: { name: string; color: string };
    };
    expect(stateA.user.name).toBe("Alice");
    expect(stateA.user.color).toBe("#ff0000");
  });

  it("cleans up awareness when a provider disconnects", async () => {
    const room = `awareness-cleanup-${Date.now()}`;

    const docA = new Y.Doc();
    const providerA = createProvider(room, { doc: docA });
    await waitForSync(providerA);

    const docB = new Y.Doc();
    const providerB = createProvider(room, { doc: docB });
    await waitForSync(providerB);

    await new Promise((r) => setTimeout(r, 300));

    providerA.awareness.setLocalState({ user: { name: "Alice" } });
    await new Promise((r) => setTimeout(r, 500));

    // B should see A's awareness
    expect(providerB.awareness.getStates().get(docA.clientID)).toBeDefined();

    // Disconnect A
    providerA.disconnect();
    await new Promise((r) => setTimeout(r, 1000));

    // B should no longer see A's awareness
    expect(providerB.awareness.getStates().get(docA.clientID)).toBeUndefined();
  });
});

describe("Integration — custom messages", () => {
  it("sends and receives custom ping/pong messages", async () => {
    const room = `custom-ping-${Date.now()}`;
    const provider = createProvider(room, { party: "y-custom-message" });
    await waitForSync(provider);

    // Listen for the pong before sending ping
    const pongPromise = waitForCustomMessage(provider);

    // Send ping
    provider.sendMessage(JSON.stringify({ action: "ping" }));

    const pong = await pongPromise;
    expect(JSON.parse(pong)).toEqual({ action: "pong" });
  });

  it("broadcasts custom messages to other providers", async () => {
    const room = `custom-broadcast-${Date.now()}`;

    const providerA = createProvider(room, { party: "y-custom-message" });
    await waitForSync(providerA);

    const providerB = createProvider(room, { party: "y-custom-message" });
    await waitForSync(providerB);

    await new Promise((r) => setTimeout(r, 300));

    // Listen on B for the broadcast
    const broadcastPromise = waitForCustomMessage(providerB);

    // A sends a broadcast request
    providerA.sendMessage(JSON.stringify({ action: "broadcast" }));

    const msg = await broadcastPromise;
    expect(JSON.parse(msg)).toEqual({ action: "broadcasted" });
  });
});

describe("Integration — persistence", () => {
  it("persists document state across sessions", async () => {
    const room = `persist-e2e-${Date.now()}`;

    // Session 1: write data
    {
      const doc = new Y.Doc();
      const provider = createProvider(room, {
        doc,
        party: "y-persistent"
      });
      await waitForSync(provider);

      doc.getText("shared").insert(0, "persisted-data");

      // Wait for debounced onSave to fire
      await new Promise((r) => setTimeout(r, 500));

      provider.destroy();
      // Remove from tracked list since we destroyed it manually
      const idx = providers.indexOf(provider);
      if (idx >= 0) providers.splice(idx, 1);
    }

    await new Promise((r) => setTimeout(r, 500));

    // Session 2: reconnect and verify
    {
      const doc = new Y.Doc();
      const provider = createProvider(room, {
        doc,
        party: "y-persistent"
      });
      await waitForSync(provider);

      // Wait for server to send the persisted state
      await new Promise((r) => setTimeout(r, 1000));

      expect(doc.getText("shared").toString()).toBe("persisted-data");
    }
  });
});

describe("Integration — read-only mode", () => {
  it("prevents writes from read-only connections", async () => {
    const room = `readonly-e2e-${Date.now()}`;

    // Connect a read-only provider and try to write
    const docRO = new Y.Doc();
    const providerRO = createProvider(room, {
      doc: docRO,
      party: "y-read-only"
    });
    await waitForSync(providerRO);

    docRO.getText("shared").insert(0, "should-not-appear");
    await new Promise((r) => setTimeout(r, 500));

    // Connect a second read-only provider and check the server doc is empty
    const docRO2 = new Y.Doc();
    const providerRO2 = createProvider(room, {
      doc: docRO2,
      party: "y-read-only"
    });
    await waitForSync(providerRO2);
    await new Promise((r) => setTimeout(r, 500));

    expect(docRO2.getText("shared").toString()).toBe("");
  });
});

describe("Integration — onLoad returns YDoc", () => {
  it("seeds document from returned YDoc", async () => {
    const room = `onload-doc-e2e-${Date.now()}`;

    const doc = new Y.Doc();
    const provider = createProvider(room, {
      doc,
      party: "y-on-load-returns-doc"
    });
    await waitForSync(provider);

    await new Promise((r) => setTimeout(r, 500));

    expect(doc.getText("shared").toString()).toBe("seeded-content");
  });
});

describe("Integration — reconnection", () => {
  it("reconnects and re-syncs after disconnect", async () => {
    const room = `reconnect-${Date.now()}`;

    const doc = new Y.Doc();
    const provider = createProvider(room, { doc });
    await waitForSync(provider);

    doc.getText("shared").insert(0, "before-disconnect");
    await new Promise((r) => setTimeout(r, 300));

    // Disconnect and wait for the status change
    const disconnected = new Promise<void>((resolve) => {
      provider.on("status", (event: { status: string }) => {
        if (event.status === "disconnected") {
          resolve();
        }
      });
    });
    provider.disconnect();
    await disconnected;
    expect(provider.wsconnected).toBe(false);

    // Reconnect
    provider.connect();
    await waitForConnection(provider);
    await waitForSync(provider);

    // The text should still be there (server-side doc persists in memory)
    await new Promise((r) => setTimeout(r, 500));
    expect(doc.getText("shared").toString()).toBe("before-disconnect");
  });
});

describe("Integration — multiple rooms", () => {
  it("isolates documents across different rooms", async () => {
    const roomA = `multi-room-a-${Date.now()}`;
    const roomB = `multi-room-b-${Date.now()}`;

    const docA = new Y.Doc();
    const providerA = createProvider(roomA, { doc: docA });
    await waitForSync(providerA);

    const docB = new Y.Doc();
    const providerB = createProvider(roomB, { doc: docB });
    await waitForSync(providerB);

    // Write different content to each room
    docA.getText("shared").insert(0, "room-A-content");
    docB.getText("shared").insert(0, "room-B-content");

    await new Promise((r) => setTimeout(r, 500));

    // Verify isolation: each room has its own content
    expect(docA.getText("shared").toString()).toBe("room-A-content");
    expect(docB.getText("shared").toString()).toBe("room-B-content");

    // Connect a new provider to room A — should only see A's content
    const docA2 = new Y.Doc();
    const providerA2 = createProvider(roomA, { doc: docA2 });
    await waitForSync(providerA2);
    await new Promise((r) => setTimeout(r, 500));

    expect(docA2.getText("shared").toString()).toBe("room-A-content");
  });
});

describe("Integration — large documents", () => {
  it("syncs a document with many operations", async () => {
    const room = `large-doc-${Date.now()}`;

    const docA = new Y.Doc();
    const providerA = createProvider(room, { doc: docA });
    await waitForSync(providerA);

    // Perform many operations
    const text = docA.getText("shared");
    for (let i = 0; i < 100; i++) {
      text.insert(text.length, `line-${i}\n`);
    }

    await new Promise((r) => setTimeout(r, 1000));

    // Connect B and verify it gets all the content
    const docB = new Y.Doc();
    const providerB = createProvider(room, { doc: docB });
    await waitForSync(providerB);
    await new Promise((r) => setTimeout(r, 1000));

    const contentB = docB.getText("shared").toString();
    expect(contentB).toContain("line-0");
    expect(contentB).toContain("line-99");
    // All 100 lines should be present
    expect(contentB.split("\n").filter(Boolean)).toHaveLength(100);
  });
});
