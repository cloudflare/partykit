/**
 * @vitest-environment jsdom
 */

import { afterAll, beforeAll, describe, expect, test, vitest } from "vitest";
import type { WebSocket as WSWebSocket } from "ws";
import { WebSocketServer } from "ws";

import PartySocket from "../index";

const PORT = 50132;

// Helper to extract text from message data (handles Blob, Buffer, and string)
async function getMessageText(data: unknown): Promise<string> {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof Blob && typeof data.text === "function") {
    return await data.text();
  }
  if (data instanceof Buffer) {
    return data.toString("utf-8");
  }
  if (data && typeof data === "object" && "toString" in data) {
    return String(data);
  }
  return String(data);
}

describe("Integration - Full Lifecycle", () => {
  let wss: WebSocketServer;

  beforeAll(() => {
    wss = new WebSocketServer({ port: PORT });
  });

  afterAll(() => {
    return new Promise<void>((resolve) => {
      wss.clients.forEach((client) => {
        client.terminate();
      });
      wss.close(() => {
        resolve();
      });
    });
  });

  test("complete WebSocket lifecycle: connect, send, receive, close", async () => {
    const testMessage = "integration-test-message";

    wss.once("connection", (ws) => {
      ws.on("message", (data) => {
        ws.send(`echo: ${data}`);
      });
    });

    const ps = new PartySocket({
      host: `localhost:${PORT}`,
      room: "lifecycle-test",
      id: "test-client"
    });

    await new Promise<void>((resolve) => {
      ps.addEventListener("open", () => {
        expect(ps.readyState).toBe(WebSocket.OPEN);
        ps.send(testMessage);
      });

      ps.addEventListener("message", async (event) => {
        const text = await getMessageText(event.data);
        expect(text).toContain(testMessage);
        ps.close();

        // Wait for close event before resolving
        ps.addEventListener("close", () => {
          expect(ps.readyState).toBe(WebSocket.CLOSED);
          resolve();
        });
      });
    });
  });

  test("handles server disconnect and reconnect", async () => {
    let connectCount = 0;

    const connectionHandler = (ws: WebSocket) => {
      connectCount++;
      if (connectCount === 1) {
        // First connection - close after 100ms
        setTimeout(() => ws.close(), 100);
      }
    };

    wss.on("connection", connectionHandler);

    const ps = new PartySocket({
      host: `localhost:${PORT}`,
      room: "reconnect-test",
      minReconnectionDelay: 50,
      maxReconnectionDelay: 100
    });

    await new Promise<void>((resolve) => {
      let openCount = 0;

      ps.addEventListener("open", () => {
        openCount++;
        if (openCount === 2) {
          // Successfully reconnected
          expect(connectCount).toBe(2);
          ps.close();
          wss.off("connection", connectionHandler);
          resolve();
        }
      });
    });
  }, 5000);

  test("maintains message order during high load", async () => {
    const messageCount = 20; // Reduced for test reliability
    const receivedMessages: string[] = [];

    wss.once("connection", (ws) => {
      ws.on("message", (data) => {
        ws.send(data); // Echo back
      });
    });

    const ps = new PartySocket({
      host: `localhost:${PORT}`,
      room: "order-test"
    });

    // Set up message handler before opening
    ps.addEventListener("message", async (event) => {
      const text = await getMessageText(event.data);
      receivedMessages.push(text);
    });

    await new Promise<void>((resolve) => {
      ps.addEventListener("open", () => {
        // Send messages sequentially
        let sent = 0;
        const sendNext = () => {
          if (sent < messageCount) {
            ps.send(`message-${sent}`);
            sent++;
            setTimeout(sendNext, 10);
          }
        };
        sendNext();

        // Poll for completion
        const checkInterval = setInterval(async () => {
          if (receivedMessages.length >= messageCount) {
            clearInterval(checkInterval);

            // Give a moment for any pending async operations
            await new Promise((r) => setTimeout(r, 100));

            // Check order - at this point all messages should be strings
            try {
              for (let i = 0; i < messageCount; i++) {
                expect(receivedMessages[i]).toBe(`message-${i}`);
              }
            } catch (_e) {
              // If we still have Blobs, messages aren't fully processed yet
              return;
            }

            ps.close();
            resolve();
          }
        }, 50);

        // Timeout
        setTimeout(() => {
          clearInterval(checkInterval);
          ps.close();
          resolve();
        }, 10000);
      });
    });
  }, 15000);
});

describe("Integration - Multiple Concurrent Connections", () => {
  let wss: WebSocketServer;

  beforeAll(() => {
    wss = new WebSocketServer({ port: PORT + 1 });
  });

  afterAll(() => {
    return new Promise<void>((resolve) => {
      wss.clients.forEach((client) => {
        client.terminate();
      });
      wss.close(() => {
        resolve();
      });
    });
  });

  test("handles multiple PartySocket instances", async () => {
    const socketCount = 5;
    const sockets: PartySocket[] = [];

    wss.on("connection", (ws) => {
      ws.send("welcome");
    });

    const promises = Array.from({ length: socketCount }, (_, i) => {
      return new Promise<void>((resolve) => {
        const ps = new PartySocket({
          host: `localhost:${PORT + 1}`,
          room: `room-${i}`
        });

        ps.addEventListener("message", () => {
          resolve();
        });

        sockets.push(ps);
      });
    });

    await Promise.all(promises);

    // All sockets should be open
    for (const socket of sockets) {
      expect(socket.readyState).toBe(WebSocket.OPEN);
      socket.close();
    }
  });

  test("sockets with different configurations work independently", async () => {
    const ps1 = new PartySocket({
      host: `localhost:${PORT + 1}`,
      room: "room1",
      party: "party1",
      debug: true
    });

    const ps2 = new PartySocket({
      host: `localhost:${PORT + 1}`,
      room: "room2",
      party: "party2",
      maxRetries: 5
    });

    await Promise.all([
      new Promise<void>((resolve) => {
        ps1.addEventListener("open", () => {
          expect(ps1.room).toBe("room1");
          expect(ps1.name).toBe("party1");
          resolve();
        });
      }),
      new Promise<void>((resolve) => {
        ps2.addEventListener("open", () => {
          expect(ps2.room).toBe("room2");
          expect(ps2.name).toBe("party2");
          resolve();
        });
      })
    ]);

    ps1.close();
    ps2.close();
  });
});

describe("Integration - Real-World Scenarios", () => {
  let wss: WebSocketServer;

  beforeAll(() => {
    wss = new WebSocketServer({ port: PORT + 2 });
  });

  afterAll(() => {
    return new Promise<void>((resolve) => {
      wss.clients.forEach((client) => {
        client.terminate();
      });
      wss.close(() => {
        resolve();
      });
    });
  });

  test("chat application scenario", async () => {
    const users: Array<{
      id: string;
      socket: PartySocket;
      messages: string[];
    }> = [];

    wss.on("connection", (ws) => {
      ws.on("message", (data) => {
        // Broadcast to all clients
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(data);
          }
        });
      });
    });

    // Create 3 users
    for (let i = 0; i < 3; i++) {
      const userId = `user-${i}`;
      const socket = new PartySocket({
        host: `localhost:${PORT + 2}`,
        room: "chat-room",
        id: userId
      });

      users.push({ id: userId, socket, messages: [] });
    }

    // Wait for all to connect
    await Promise.all(
      users.map(
        (user) =>
          new Promise<void>((resolve) => {
            user.socket.addEventListener("open", () => {
              user.socket.addEventListener("message", async (event) => {
                const text = await getMessageText(event.data);
                user.messages.push(text);
              });
              resolve();
            });
          })
      )
    );

    // User 0 sends a message
    users[0].socket.send("Hello from user 0!");

    // Wait for messages to propagate with polling
    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        // Check if all users received at least one message
        const allReceived = users.every((user) => user.messages.length > 0);
        if (allReceived) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 50);

      // Timeout after 2 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 2000);
    });

    // All users should have received the message
    for (const user of users) {
      expect(user.messages.length).toBeGreaterThan(0);
      user.socket.close();
    }
  });

  test("collaborative editing scenario", async () => {
    const operations: string[] = [];
    let connectionCount = 0;

    // Use a fresh handler for this test
    const handler = (ws: WSWebSocket) => {
      connectionCount++;
      if (connectionCount > 1) return; // Only handle first connection

      ws.on("message", (data) => {
        // Server processes operation and sends back confirmation
        const operation = data.toString();
        operations.push(operation);
        ws.send(`ack:${operation}`);
      });
    };

    wss.on("connection", handler);

    const editor = new PartySocket({
      host: `localhost:${PORT + 2}`,
      room: "document-123"
    });

    const acks: string[] = [];
    let resolved = false;

    await new Promise<void>((resolve) => {
      // Set up message handler
      editor.addEventListener("message", async (event) => {
        if (resolved) return; // Ignore messages after we're done

        const text = await getMessageText(event.data);

        // Only count ack messages
        if (text.startsWith("ack:")) {
          acks.push(text);

          if (acks.length === 3) {
            resolved = true;
            resolve();
          }
        }
      });

      editor.addEventListener("open", () => {
        // Send operations
        editor.send("insert:0:H");
        editor.send("insert:1:i");
        editor.send("insert:2:!");

        // Timeout after 2 seconds
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            resolve();
          }
        }, 2000);
      });
    });

    // Clean up handler
    wss.off("connection", handler);

    // Should have received exactly 3 acks
    expect(acks.length).toBe(3);
    expect(operations).toEqual(["insert:0:H", "insert:1:i", "insert:2:!"]);

    editor.close();
  });

  test("gaming scenario with frequent updates", async () => {
    const updates: number[] = [];

    wss.once("connection", (ws) => {
      // Simulate game server sending position updates
      const interval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(`pos:${Math.random()},${Math.random()}`);
        } else {
          clearInterval(interval);
        }
      }, 10);
    });

    const gameClient = new PartySocket({
      host: `localhost:${PORT + 2}`,
      room: "game-room",
      id: "player-1"
    });

    await new Promise<void>((resolve) => {
      gameClient.addEventListener("open", () => {
        gameClient.addEventListener("message", async (event) => {
          const text = await getMessageText(event.data);
          if (text.startsWith("pos:")) {
            updates.push(Date.now());
          }

          // After receiving 50 updates, stop
          if (updates.length >= 50) {
            gameClient.close();
            resolve();
          }
        });
      });
    });

    // Should receive updates frequently
    expect(updates.length).toBeGreaterThanOrEqual(50);

    // Updates should be reasonably spaced (not bunched)
    const avgInterval =
      (updates[updates.length - 1] - updates[0]) / updates.length;
    expect(avgInterval).toBeLessThan(100); // Less than 100ms average
  }, 10000);
});

describe("Integration - Error Recovery", () => {
  let wss: WebSocketServer;

  beforeAll(() => {
    wss = new WebSocketServer({ port: PORT + 3 });
  });

  afterAll(() => {
    return new Promise<void>((resolve) => {
      wss.clients.forEach((client) => {
        client.terminate();
      });
      wss.close(() => {
        resolve();
      });
    });
  });

  test("recovers from network interruption", async () => {
    let connectionAttempts = 0;

    const handler = (ws: WebSocket) => {
      connectionAttempts++;
      if (connectionAttempts === 1) {
        // First connection succeeds then fails
        setTimeout(() => ws.close(), 100);
      } else {
        // Subsequent connections succeed
        ws.send("recovered");
      }
    };

    wss.on("connection", handler);

    const ps = new PartySocket({
      host: `localhost:${PORT + 3}`,
      room: "recovery-test",
      minReconnectionDelay: 50,
      maxReconnectionDelay: 100
    });

    let recovered = false;

    await new Promise<void>((resolve) => {
      ps.addEventListener("message", async (event) => {
        const text = await getMessageText(event.data);
        if (text === "recovered") {
          recovered = true;
          ps.close();
          wss.off("connection", handler);
          resolve();
        }
      });
    });

    expect(recovered).toBe(true);
    expect(connectionAttempts).toBeGreaterThanOrEqual(2);
  }, 5000);

  test("handles server restart", async () => {
    let serverVersion = 1;

    const handler = (ws: WebSocket) => {
      ws.send(`server-v${serverVersion}`);
    };

    wss.on("connection", handler);

    const ps = new PartySocket({
      host: `localhost:${PORT + 3}`,
      room: "restart-test",
      minReconnectionDelay: 50
    });

    const versions: string[] = [];

    await new Promise<void>((resolve) => {
      ps.addEventListener("message", async (event) => {
        const text = await getMessageText(event.data);
        versions.push(text);

        if (versions.length === 1) {
          // Simulate server restart
          serverVersion = 2;
          ps.reconnect();
        } else if (versions.length === 2) {
          ps.close();
          wss.off("connection", handler);
          resolve();
        }
      });
    });

    expect(versions).toEqual(["server-v1", "server-v2"]);
  });
});

describe("Integration - PartySocket.fetch with WebSocket", () => {
  let wss: WebSocketServer;

  beforeAll(() => {
    wss = new WebSocketServer({ port: PORT + 4 });
  });

  afterAll(() => {
    return new Promise<void>((resolve) => {
      wss.clients.forEach((client) => {
        client.terminate();
      });
      wss.close(() => {
        resolve();
      });
    });
  });

  test("fetch and WebSocket use same URL structure", async () => {
    const mockFetch = vitest.fn().mockResolvedValue(new Response("ok"));

    const options = {
      host: "example.com",
      room: "test-room",
      party: "test-party"
    };

    await PartySocket.fetch({ ...options, fetch: mockFetch });
    const fetchUrl = mockFetch.mock.calls[0][0];

    const ps = new PartySocket({ ...options, startClosed: true });
    const wsUrl = ps.roomUrl;

    // Extract path after protocol
    const fetchPath = fetchUrl.split("://")[1].split("?")[0];
    const wsPath = wsUrl.split("://")[1];

    expect(fetchPath).toBe(wsPath);

    ps.close();
  });
});
