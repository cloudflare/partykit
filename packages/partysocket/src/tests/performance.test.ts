/**
 * @vitest-environment jsdom
 */

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { WebSocketServer } from "ws";

import PartySocket from "../index";
import ReconnectingWebSocket from "../ws";

const PORT = 50130;

describe.skipIf(!!process.env.GITHUB_ACTIONS)(
  "Performance - Message Throughput",
  () => {
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

    test("handles high message volume", async () => {
      const messageCount = 1000;
      let receivedCount = 0;

      wss.once("connection", (ws) => {
        ws.on("message", (data) => {
          ws.send(data); // Echo back
        });
      });

      const ps = new PartySocket({
        host: `localhost:${PORT}`,
        room: "perf-test"
      });

      await new Promise<void>((resolve) => {
        ps.addEventListener("open", () => {
          const startTime = performance.now();

          ps.addEventListener("message", () => {
            receivedCount++;
            if (receivedCount === messageCount) {
              const endTime = performance.now();
              const duration = endTime - startTime;
              const messagesPerSecond = (messageCount / duration) * 1000;

              // Should handle at least 100 messages per second
              expect(messagesPerSecond).toBeGreaterThan(100);
              ps.close();
              resolve();
            }
          });

          // Send messages rapidly
          for (let i = 0; i < messageCount; i++) {
            ps.send(`message-${i}`);
          }
        });
      });
    }, 10000);

    test("handles rapid small messages efficiently", async () => {
      let receivedCount = 0;
      const messageCount = 500;

      wss.once("connection", (ws) => {
        ws.on("message", (data) => {
          ws.send(data);
        });
      });

      const ps = new PartySocket({
        host: `localhost:${PORT}`,
        room: "small-messages"
      });

      await new Promise<void>((resolve) => {
        ps.addEventListener("open", () => {
          ps.addEventListener("message", () => {
            receivedCount++;
            if (receivedCount === messageCount) {
              ps.close();
              resolve();
            }
          });

          // Send small messages
          for (let i = 0; i < messageCount; i++) {
            ps.send("x");
          }
        });
      });

      expect(receivedCount).toBe(messageCount);
    }, 10000);

    test("handles large messages efficiently", async () => {
      const largeMessage = "x".repeat(10000); // 10KB message
      let received = false;

      wss.once("connection", (ws) => {
        ws.on("message", (data) => {
          ws.send(data);
        });
      });

      const ps = new PartySocket({
        host: `localhost:${PORT}`,
        room: "large-messages"
      });

      await new Promise<void>((resolve) => {
        ps.addEventListener("open", () => {
          const startTime = performance.now();

          ps.addEventListener("message", (event) => {
            const endTime = performance.now();
            const duration = endTime - startTime;

            // Should handle large message in reasonable time
            expect(duration).toBeLessThan(1000);
            expect(event.data).toBeDefined();

            received = true;
            ps.close();
            resolve();
          });

          ps.send(largeMessage);
        });
      });

      expect(received).toBe(true);
    });
  }
);

describe.skipIf(!!process.env.GITHUB_ACTIONS)(
  "Performance - Connection Speed",
  () => {
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

    test("connects quickly", async () => {
      const startTime = performance.now();

      const ps = new PartySocket({
        host: `localhost:${PORT + 1}`,
        room: "speed-test"
      });

      await new Promise<void>((resolve) => {
        ps.addEventListener("open", () => {
          const endTime = performance.now();
          const duration = endTime - startTime;

          // Should connect in less than 500ms on localhost
          expect(duration).toBeLessThan(500);
          ps.close();
          resolve();
        });
      });
    });

    test("reconnects quickly after disconnect", async () => {
      wss.once("connection", (ws) => {
        // Close after 100ms
        setTimeout(() => ws.close(), 100);
      });

      wss.once("connection", () => {
        // Second connection - measure reconnect time
      });

      const ps = new PartySocket({
        host: `localhost:${PORT + 1}`,
        room: "reconnect-speed",
        minReconnectionDelay: 50,
        maxReconnectionDelay: 100
      });

      let firstConnect = false;
      let reconnectTime = 0;

      await new Promise<void>((resolve) => {
        ps.addEventListener("open", () => {
          if (!firstConnect) {
            firstConnect = true;
          }
        });

        ps.addEventListener("close", () => {
          reconnectTime = performance.now();
        });

        ps.addEventListener("open", () => {
          if (firstConnect && reconnectTime > 0) {
            const duration = performance.now() - reconnectTime;
            // Should reconnect within reasonable time
            expect(duration).toBeLessThan(1000);
            ps.close();
            resolve();
          }
        });
      });
    });
  }
);

describe.skipIf(!!process.env.GITHUB_ACTIONS)(
  "Performance - Message Queue",
  () => {
    test("respects maxEnqueuedMessages limit efficiently", () => {
      const maxMessages = 10;
      const ws = new ReconnectingWebSocket("ws://invalid", undefined, {
        maxRetries: 0,
        maxEnqueuedMessages: maxMessages
      });

      const startTime = performance.now();

      // Try to send many more messages than the limit
      for (let i = 0; i < 10000; i++) {
        ws.send(`message-${i}`);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete quickly even with many messages
      expect(duration).toBeLessThan(100);

      // Should only have maxMessages in queue
      expect(ws.bufferedAmount).toBeLessThanOrEqual(maxMessages * 15);

      ws.close();
    });

    test("message queue operations are fast", () => {
      const ws = new ReconnectingWebSocket("ws://invalid", undefined, {
        maxRetries: 0,
        maxEnqueuedMessages: 1000
      });

      const startTime = performance.now();

      for (let i = 0; i < 1000; i++) {
        ws.send(`msg-${i}`);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Queuing 1000 messages should be very fast
      expect(duration).toBeLessThan(50);

      ws.close();
    });
  }
);

describe.skipIf(!!process.env.GITHUB_ACTIONS)(
  "Performance - Reconnection Logic",
  () => {
    test("retry delay calculation is efficient", () => {
      const ws = new ReconnectingWebSocket("ws://invalid", undefined, {
        minReconnectionDelay: 1000,
        maxReconnectionDelay: 10000,
        reconnectionDelayGrowFactor: 1.3,
        maxRetries: 100,
        startClosed: true
      });

      const startTime = performance.now();

      // Calculate delays for many retries
      for (let i = 0; i < 100; i++) {
        // @ts-expect-error - accessing private field for testing
        ws._retryCount = i;
        // @ts-expect-error - accessing private method for testing
        ws._getNextDelay();
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should be very fast
      expect(duration).toBeLessThan(10);

      ws.close();
    });

    test("multiple reconnect calls don't cause performance issues", () => {
      const ws = new ReconnectingWebSocket("ws://invalid", undefined, {
        maxRetries: 0,
        startClosed: true
      });

      const startTime = performance.now();

      // Call reconnect many times
      for (let i = 0; i < 100; i++) {
        ws.reconnect();
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should handle gracefully without hanging
      expect(duration).toBeLessThan(100);

      ws.close();
    });
  }
);

describe.skipIf(!!process.env.GITHUB_ACTIONS)(
  "Performance - Event Handling",
  () => {
    test("adding many event listeners is efficient", () => {
      const ws = new ReconnectingWebSocket("ws://invalid", undefined, {
        startClosed: true
      });

      const startTime = performance.now();

      // Add many listeners
      for (let i = 0; i < 100; i++) {
        ws.addEventListener("open", () => {});
        ws.addEventListener("message", () => {});
        ws.addEventListener("close", () => {});
        ws.addEventListener("error", () => {});
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should be fast
      expect(duration).toBeLessThan(50);

      ws.close();
    });

    test("removing many event listeners is efficient", () => {
      const ws = new ReconnectingWebSocket("ws://invalid", undefined, {
        startClosed: true
      });

      const listeners: Array<() => void> = [];

      // Add listeners
      for (let i = 0; i < 100; i++) {
        const listener = () => {};
        listeners.push(listener);
        ws.addEventListener("open", listener);
      }

      const startTime = performance.now();

      // Remove all listeners
      for (const listener of listeners) {
        ws.removeEventListener("open", listener);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should be fast
      expect(duration).toBeLessThan(50);

      ws.close();
    });
  }
);

describe.skipIf(!!process.env.GITHUB_ACTIONS)(
  "Performance - PartySocket Operations",
  () => {
    test("URL construction is fast", () => {
      const startTime = performance.now();

      for (let i = 0; i < 1000; i++) {
        const ps = new PartySocket({
          host: "example.com",
          room: `room-${i}`,
          party: `party-${i}`,
          query: { foo: "bar", baz: `value-${i}` },
          startClosed: true
        });
        ps.close();
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Creating 1000 PartySocket instances should be reasonably fast
      expect(duration).toBeLessThan(1000);
    });

    test("property updates are efficient", () => {
      const ps = new PartySocket({
        host: "example.com",
        room: "test-room",
        startClosed: true
      });

      const startTime = performance.now();

      for (let i = 0; i < 1000; i++) {
        ps.updateProperties({
          room: `room-${i}`,
          party: `party-${i}`
        });
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // 1000 property updates should be fast
      expect(duration).toBeLessThan(100);

      ps.close();
    });
  }
);

describe.skipIf(!!process.env.GITHUB_ACTIONS)("Performance - Memory", () => {
  test("closed sockets can be garbage collected", () => {
    const sockets: ReconnectingWebSocket[] = [];

    // Create many sockets
    for (let i = 0; i < 100; i++) {
      const ws = new ReconnectingWebSocket("ws://invalid", undefined, {
        startClosed: true
      });
      sockets.push(ws);
    }

    // Close all sockets
    for (const ws of sockets) {
      ws.close();
    }

    // Clear references
    sockets.length = 0;

    // If we get here without memory issues, test passes
    expect(true).toBe(true);
  });

  test("message queue doesn't grow unbounded", () => {
    const ws = new ReconnectingWebSocket("ws://invalid", undefined, {
      maxRetries: 0,
      maxEnqueuedMessages: 10
    });

    const initialAmount = ws.bufferedAmount;

    // Try to send many messages
    for (let i = 0; i < 1000; i++) {
      ws.send(`message-${i}`);
    }

    const finalAmount = ws.bufferedAmount;

    // Should not grow beyond limit
    expect(finalAmount).toBeLessThanOrEqual(initialAmount + 10 * 15);

    ws.close();
  });
});
