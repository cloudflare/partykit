import WebSocket from "ws";
import * as Y from "yjs";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import YProvider from "../provider/index";
import { WranglerServer } from "./server-harness";

const PORT = 8801;
const HOST = `localhost:${PORT}`;
const server = new WranglerServer(PORT);

// Track providers for cleanup
const providers: YProvider[] = [];

function createProvider(
  room: string,
  options: { party?: string; doc?: Y.Doc } = {}
): YProvider {
  const doc = options.doc ?? new Y.Doc();
  const provider = new YProvider(HOST, room, doc, {
    party: options.party ?? "y-basic",
    connect: true,
    WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
    disableBc: true,
    // Faster reconnection for restart tests
    maxBackoffTime: 1000
  });
  providers.push(provider);
  return provider;
}

function waitForSync(provider: YProvider, timeoutMs = 20000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (provider.synced) {
      resolve();
      return;
    }
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for sync")),
      timeoutMs
    );
    provider.on("synced", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

/**
 * Wait for a provider to go through disconnect → reconnect → sync.
 * Handles the case where the provider is still connected (hasn't
 * detected the server kill yet) or already disconnected.
 */
function waitForReconnectAndSync(
  provider: YProvider,
  timeoutMs = 30000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () =>
        reject(
          new Error("Timed out waiting for reconnect and sync after restart")
        ),
      timeoutMs
    );

    let sawDisconnect = !provider.wsconnected;

    const statusHandler = (event: { status: string }) => {
      if (event.status === "disconnected") {
        sawDisconnect = true;
      }
    };
    provider.on("status", statusHandler);

    const syncHandler = () => {
      if (sawDisconnect) {
        clearTimeout(timeout);
        provider.off("status", statusHandler);
        provider.off("synced", syncHandler);
        resolve();
      }
    };
    provider.on("synced", syncHandler);

    // If already disconnected and re-synced, resolve immediately
    if (sawDisconnect && provider.synced) {
      clearTimeout(timeout);
      provider.off("status", statusHandler);
      provider.off("synced", syncHandler);
      resolve();
    }
  });
}

function destroyProvider(provider: YProvider): void {
  try {
    provider.destroy();
  } catch {
    // ignore
  }
  const idx = providers.indexOf(provider);
  if (idx >= 0) providers.splice(idx, 1);
}

beforeAll(async () => {
  server.cleanup();
  await server.start();
}, 60000);

afterEach(() => {
  for (const p of providers) {
    try {
      p.destroy();
    } catch {
      // ignore
    }
  }
  providers.length = 0;
});

afterAll(async () => {
  await server.stop();
  server.cleanup();
}, 30000);

// ---------------------------------------------------------------------------
// All test DOs in worker.ts use `static options = { hibernate: true }`
// ---------------------------------------------------------------------------

describe("Server restart — non-persistent YServer (hibernate: true)", () => {
  it("connected client re-syncs its local state to server after restart", async () => {
    const room = `restart-basic-${Date.now()}`;

    // Connect and write data
    const doc = new Y.Doc();
    const provider = createProvider(room, { doc });
    await waitForSync(provider);

    doc.getText("shared").insert(0, "survive-restart");
    await new Promise((r) => setTimeout(r, 300));

    // Set up listener BEFORE restart to avoid race condition
    const reconnect = waitForReconnectAndSync(provider);

    // Kill and restart the server — all server-side in-memory state is lost
    await server.restart();

    // Provider auto-reconnects and re-syncs its local state to the new server
    await reconnect;

    // Client still has its local data
    expect(doc.getText("shared").toString()).toBe("survive-restart");

    // A second client connecting should get the re-synced state
    const doc2 = new Y.Doc();
    const provider2 = createProvider(room, { doc: doc2 });
    await waitForSync(provider2);
    await new Promise((r) => setTimeout(r, 500));

    expect(doc2.getText("shared").toString()).toBe("survive-restart");
  });

  it("data is lost if no client is connected to re-sync after restart", async () => {
    const room = `restart-lost-${Date.now()}`;

    // Connect, write data, then disconnect before restart
    const doc = new Y.Doc();
    const provider = createProvider(room, { doc });
    await waitForSync(provider);

    doc.getText("shared").insert(0, "will-be-lost");
    await new Promise((r) => setTimeout(r, 300));

    // Destroy the provider — no client will be around to re-sync
    destroyProvider(provider);

    // Restart server
    await server.restart();

    // New client gets empty doc — no persistence, no re-sync source
    const doc2 = new Y.Doc();
    const provider2 = createProvider(room, { doc: doc2 });
    await waitForSync(provider2);
    await new Promise((r) => setTimeout(r, 500));

    expect(doc2.getText("shared").toString()).toBe("");
  });

  it("two connected clients both survive restart and stay converged", async () => {
    const room = `restart-two-${Date.now()}`;

    const docA = new Y.Doc();
    const providerA = createProvider(room, { doc: docA });
    await waitForSync(providerA);

    const docB = new Y.Doc();
    const providerB = createProvider(room, { doc: docB });
    await waitForSync(providerB);
    await new Promise((r) => setTimeout(r, 300));

    // Both write
    docA.getText("shared").insert(0, "A-data");
    await new Promise((r) => setTimeout(r, 200));
    docB.getText("shared").insert(docB.getText("shared").length, "+B-data");
    await new Promise((r) => setTimeout(r, 500));

    // Verify convergence before restart
    const beforeA = docA.getText("shared").toString();
    const beforeB = docB.getText("shared").toString();
    expect(beforeA).toBe(beforeB);
    expect(beforeA).toContain("A-data");
    expect(beforeA).toContain("B-data");

    // Set up reconnection listeners BEFORE restart to avoid race condition
    const reconnectA = waitForReconnectAndSync(providerA);
    const reconnectB = waitForReconnectAndSync(providerB);

    await server.restart();

    await Promise.all([reconnectA, reconnectB]);
    await new Promise((r) => setTimeout(r, 1000));

    // Both should still have the same content
    expect(docA.getText("shared").toString()).toContain("A-data");
    expect(docA.getText("shared").toString()).toContain("B-data");
    expect(docB.getText("shared").toString()).toContain("A-data");
    expect(docB.getText("shared").toString()).toContain("B-data");
    // And they should still be converged
    expect(docA.getText("shared").toString()).toBe(
      docB.getText("shared").toString()
    );
  });

  it("clients can continue collaborating after restart", async () => {
    const room = `restart-collab-${Date.now()}`;

    const docA = new Y.Doc();
    const providerA = createProvider(room, { doc: docA });
    await waitForSync(providerA);

    const docB = new Y.Doc();
    const providerB = createProvider(room, { doc: docB });
    await waitForSync(providerB);
    await new Promise((r) => setTimeout(r, 300));

    docA.getText("shared").insert(0, "before");
    await new Promise((r) => setTimeout(r, 500));

    // Set up reconnection listeners BEFORE restart
    const reconnectA = waitForReconnectAndSync(providerA);
    const reconnectB = waitForReconnectAndSync(providerB);

    await server.restart();

    await Promise.all([reconnectA, reconnectB]);
    await new Promise((r) => setTimeout(r, 500));

    // Write AFTER restart
    const updateReceived = new Promise<void>((resolve) => {
      docB.on("update", () => {
        if (docB.getText("shared").toString().includes("after")) {
          resolve();
        }
      });
    });
    docA.getText("shared").insert(docA.getText("shared").length, "-and-after");

    await updateReceived;

    expect(docB.getText("shared").toString()).toContain("before");
    expect(docB.getText("shared").toString()).toContain("after");
  });
});

describe("Server restart — persistent YServer (hibernate: true)", () => {
  it("restores state from storage when no client re-syncs", async () => {
    const room = `restart-persist-${Date.now()}`;

    // Connect to persistent server, write data
    const doc = new Y.Doc();
    const provider = createProvider(room, { doc, party: "y-persistent" });
    await waitForSync(provider);

    doc.getText("shared").insert(0, "persisted-across-restart");

    // Wait for debounced onSave
    await new Promise((r) => setTimeout(r, 500));

    // Destroy provider — no client to re-sync
    destroyProvider(provider);

    // Restart server
    await server.restart();

    // New client should get state from persistence (onLoad)
    const doc2 = new Y.Doc();
    const provider2 = createProvider(room, {
      doc: doc2,
      party: "y-persistent"
    });
    await waitForSync(provider2);
    await new Promise((r) => setTimeout(r, 1000));

    expect(doc2.getText("shared").toString()).toBe("persisted-across-restart");
  });

  it("connected client + persistence both work after restart", async () => {
    const room = `restart-persist-conn-${Date.now()}`;

    const doc = new Y.Doc();
    const provider = createProvider(room, { doc, party: "y-persistent" });
    await waitForSync(provider);

    doc.getText("shared").insert(0, "persistent-and-connected");
    await new Promise((r) => setTimeout(r, 500));

    // Set up listener BEFORE restart
    const reconnect = waitForReconnectAndSync(provider);

    // Restart with client still connected
    await server.restart();

    await reconnect;
    await new Promise((r) => setTimeout(r, 500));

    expect(doc.getText("shared").toString()).toBe("persistent-and-connected");

    // Second client also sees the data
    const doc2 = new Y.Doc();
    const provider2 = createProvider(room, {
      doc: doc2,
      party: "y-persistent"
    });
    await waitForSync(provider2);
    await new Promise((r) => setTimeout(r, 1000));

    expect(doc2.getText("shared").toString()).toBe("persistent-and-connected");
  });

  it("survives two consecutive restarts", async () => {
    const room = `restart-persist-twice-${Date.now()}`;

    // Session 1: write data
    const doc1 = new Y.Doc();
    const provider1 = createProvider(room, {
      doc: doc1,
      party: "y-persistent"
    });
    await waitForSync(provider1);

    doc1.getText("shared").insert(0, "round-1");
    await new Promise((r) => setTimeout(r, 500));
    destroyProvider(provider1);

    // First restart
    await server.restart();

    // Session 2: verify + write more
    const doc2 = new Y.Doc();
    const provider2 = createProvider(room, {
      doc: doc2,
      party: "y-persistent"
    });
    await waitForSync(provider2);
    await new Promise((r) => setTimeout(r, 1000));

    expect(doc2.getText("shared").toString()).toBe("round-1");

    doc2.getText("shared").insert(doc2.getText("shared").length, "+round-2");
    await new Promise((r) => setTimeout(r, 500));
    destroyProvider(provider2);

    // Second restart
    await server.restart();

    // Session 3: verify both rounds persisted
    const doc3 = new Y.Doc();
    const provider3 = createProvider(room, {
      doc: doc3,
      party: "y-persistent"
    });
    await waitForSync(provider3);
    await new Promise((r) => setTimeout(r, 1000));

    expect(doc3.getText("shared").toString()).toBe("round-1+round-2");
  });
});

describe("Server restart — awareness (hibernate: true)", () => {
  it("local awareness state survives restart on the provider", async () => {
    const room = `restart-awareness-local-${Date.now()}`;

    const doc = new Y.Doc();
    const provider = createProvider(room, { doc });
    await waitForSync(provider);

    provider.awareness.setLocalState({ user: { name: "Alice" } });
    await new Promise((r) => setTimeout(r, 200));

    const reconnect = waitForReconnectAndSync(provider);
    await server.restart();
    await reconnect;

    // The provider's local awareness state persists across restart
    // (it's stored on the provider, not the server)
    const local = provider.awareness.getLocalState() as {
      user: { name: string };
    };
    expect(local).toBeDefined();
    expect(local.user.name).toBe("Alice");
  });

  it("awareness automatically re-propagates after restart (no explicit re-trigger)", async () => {
    const room = `restart-awareness-auto-${Date.now()}`;

    const docA = new Y.Doc();
    const providerA = createProvider(room, { doc: docA });
    await waitForSync(providerA);

    const docB = new Y.Doc();
    const providerB = createProvider(room, { doc: docB });
    await waitForSync(providerB);
    await new Promise((r) => setTimeout(r, 300));

    // Set awareness before restart
    providerA.awareness.setLocalState({ user: { name: "Alice" } });

    // Wait for B to see it
    await new Promise<void>((resolve) => {
      const check = () => {
        if (providerB.awareness.getStates().get(docA.clientID)) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });

    // Set up reconnection listeners BEFORE restart
    const reconnectA = waitForReconnectAndSync(providerA);
    const reconnectB = waitForReconnectAndSync(providerB);

    await server.restart();

    await Promise.all([reconnectA, reconnectB]);

    // Do NOT explicitly re-set awareness — the provider should automatically
    // re-broadcast with a bumped clock on reconnect, and the receiving
    // provider should accept it because stale meta was cleared on close.
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () =>
          reject(
            new Error(
              "Timed out waiting for automatic awareness re-propagation"
            )
          ),
        10000
      );
      const check = () => {
        const state = providerB.awareness.getStates().get(docA.clientID);
        if (state) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(check, 200);
        }
      };
      check();
    });

    const stateA = providerB.awareness.getStates().get(docA.clientID) as {
      user: { name: string };
    };
    expect(stateA.user.name).toBe("Alice");
  });
});

describe("Server restart — custom messages (hibernate: true)", () => {
  it("custom messages work after restart", async () => {
    const room = `restart-custom-${Date.now()}`;

    const provider = createProvider(room, { party: "y-custom-message" });
    await waitForSync(provider);

    // Verify custom messages work before restart
    const pong1 = new Promise<string>((resolve) => {
      provider.on("custom-message", (msg: string) => resolve(msg));
    });
    provider.sendMessage(JSON.stringify({ action: "ping" }));
    expect(JSON.parse(await pong1)).toEqual({ action: "pong" });

    // Set up listener BEFORE restart
    const reconnect = waitForReconnectAndSync(provider);

    await server.restart();
    await reconnect;

    // Custom messages should still work after restart
    const pong2 = new Promise<string>((resolve) => {
      provider.on("custom-message", (msg: string) => resolve(msg));
    });
    provider.sendMessage(JSON.stringify({ action: "ping" }));
    expect(JSON.parse(await pong2)).toEqual({ action: "pong" });
  });
});

describe("Server restart — seeded documents (hibernate: true)", () => {
  it("onLoad-returned YDoc is re-seeded after restart", async () => {
    const room = `restart-seeded-${Date.now()}`;

    // YOnLoadReturnsDoc seeds "seeded-content" on every onLoad
    const doc = new Y.Doc();
    const provider = createProvider(room, {
      doc,
      party: "y-on-load-returns-doc"
    });
    await waitForSync(provider);
    await new Promise((r) => setTimeout(r, 500));

    expect(doc.getText("shared").toString()).toBe("seeded-content");

    // Destroy the provider
    destroyProvider(provider);

    // Restart
    await server.restart();

    // New client should still get the seeded content (onLoad runs again)
    const doc2 = new Y.Doc();
    const provider2 = createProvider(room, {
      doc: doc2,
      party: "y-on-load-returns-doc"
    });
    await waitForSync(provider2);
    await new Promise((r) => setTimeout(r, 500));

    expect(doc2.getText("shared").toString()).toBe("seeded-content");
  });
});
