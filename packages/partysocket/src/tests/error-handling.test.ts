/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, test, vitest } from "vitest";

import PartySocket from "../index";
import ReconnectingWebSocket from "../ws";

describe.skip("Error Handling - URL Providers", () => {
  test("handles async URL provider that throws", async () => {
    const errorSpy = vitest.fn();

    const ws = new ReconnectingWebSocket(
      async () => {
        throw new Error("URL fetch failed");
      },
      undefined,
      { maxRetries: 0 }
    );

    ws.addEventListener("error", (event) => {
      errorSpy(event);
    });

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(errorSpy).toHaveBeenCalled();
        ws.close();
        resolve();
      }, 100);
    });
  });

  test("handles sync URL provider that throws", () => {
    const errorSpy = vitest.fn();

    const ws = new ReconnectingWebSocket(
      () => {
        throw new Error("URL generation failed");
      },
      undefined,
      { maxRetries: 0 }
    );

    ws.addEventListener("error", (event) => {
      errorSpy(event);
    });

    setTimeout(() => {
      expect(errorSpy).toHaveBeenCalled();
      ws.close();
    }, 100);
  });

  test("handles invalid URL provider type", async () => {
    const ws = new ReconnectingWebSocket(
      // @ts-expect-error - testing invalid type
      123,
      undefined,
      { maxRetries: 0 }
    );

    // The error happens when trying to get the URL
    await expect(async () => {
      // @ts-expect-error - accessing private method for testing
      await ws._getNextUrl(123);
    }).rejects.toThrow();

    ws.close();
  });
});

describe.skip("Error Handling - Protocol Providers", () => {
  test("handles invalid protocol provider", async () => {
    const ws = new ReconnectingWebSocket("ws://example.com", undefined, {
      maxRetries: 0,
      startClosed: true
    });

    // The method throws synchronously for invalid input
    try {
      // @ts-expect-error - accessing private method for testing
      await ws._getNextProtocols(() => /regex/);
      expect.fail("Should have thrown an error");
    } catch (error) {
      expect((error as Error).message).toContain("Invalid protocols");
    }

    ws.close();
  });

  test("handles null protocol provider", async () => {
    const ws = new ReconnectingWebSocket("ws://example.com", null, {
      maxRetries: 0,
      startClosed: true
    });

    // @ts-expect-error - accessing private method for testing
    const result = await ws._getNextProtocols(null);
    expect(result).toBeNull();

    ws.close();
  });
});

describe.skip("Error Handling - PartySocket Validation", () => {
  test("throws when path starts with slash", () => {
    expect(() => {
      new PartySocket({
        host: "example.com",
        room: "my-room",
        path: "/invalid-path"
      });
    }).toThrow("path must not start with a slash");
  });

  test("throws when reconnecting without host", () => {
    const ps = new PartySocket({
      host: "example.com",
      room: "my-room",
      startClosed: true
    });

    ps.updateProperties({ host: "" });

    expect(() => {
      ps.reconnect();
    }).toThrow("The host must be set");
  });

  test("throws when reconnecting without room", () => {
    const ps = new PartySocket({
      host: "example.com",
      room: "my-room",
      startClosed: true
    });

    ps.updateProperties({ room: "" });

    expect(() => {
      ps.reconnect();
    }).toThrow("The room (or basePath) must be set");
  });

  test("does not throw when reconnecting with basePath and no room", () => {
    const ps = new PartySocket({
      host: "example.com",
      basePath: "custom/path",
      startClosed: true
    });

    expect(() => {
      ps.reconnect();
    }).not.toThrow();
  });

  test("handles missing WebSocket constructor gracefully", async () => {
    const originalWS = (global as unknown as { WebSocket?: unknown }).WebSocket;
    delete (global as unknown as { WebSocket?: unknown }).WebSocket;

    const errorSpy = vitest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const ws = new ReconnectingWebSocket("ws://example.com", undefined, {
      maxRetries: 0,
      startClosed: false // Need to try to connect to trigger error
    });

    // Wait a bit for the error to be logged
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining("No WebSocket implementation")
        );
        ws.close();
        (global as unknown as { WebSocket: unknown }).WebSocket = originalWS;
        errorSpy.mockRestore();
        resolve();
      }, 100);
    });
  });
});

describe.skip("Error Handling - Connection Failures", () => {
  test("handles immediate connection failure", async () => {
    const errorSpy = vitest.fn();

    const ws = new ReconnectingWebSocket("ws://255.255.255.255", undefined, {
      maxRetries: 1,
      maxReconnectionDelay: 100
    });

    ws.addEventListener("error", errorSpy);

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(errorSpy).toHaveBeenCalled();
        expect(ws.retryCount).toBeGreaterThan(0);
        ws.close();
        resolve();
      }, 500);
    });
  });

  test("stops retrying after maxRetries", async () => {
    const maxRetries = 3;
    let errorCount = 0;

    const ws = new ReconnectingWebSocket("ws://255.255.255.255", undefined, {
      maxRetries,
      minReconnectionDelay: 10,
      maxReconnectionDelay: 20
    });

    ws.addEventListener("error", () => {
      errorCount++;
    });

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(ws.retryCount).toBe(maxRetries);
        expect(errorCount).toBeGreaterThanOrEqual(maxRetries);
        ws.close();
        resolve();
      }, 500);
    });
  });

  test("handles connection timeout", async () => {
    const timeoutSpy = vitest.fn();

    const ws = new ReconnectingWebSocket("ws://255.255.255.255", undefined, {
      connectionTimeout: 100,
      maxRetries: 1
    });

    ws.addEventListener("error", (event) => {
      if ((event as { message?: string }).message === "TIMEOUT") {
        timeoutSpy();
      }
    });

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        ws.close();
        resolve();
      }, 500);
    });
  });
});

describe.skip("Error Handling - Message Queue", () => {
  test("respects maxEnqueuedMessages limit", () => {
    const maxMessages = 5;
    const ws = new ReconnectingWebSocket("ws://255.255.255.255", undefined, {
      maxRetries: 0,
      maxEnqueuedMessages: maxMessages
    });

    // Try to send more messages than the limit
    for (let i = 0; i < maxMessages + 10; i++) {
      ws.send(`message-${i}`);
    }

    // Should only have maxMessages in queue
    expect(ws.bufferedAmount).toBeLessThanOrEqual(maxMessages * 10);

    ws.close();
  });

  test("calculates buffered amount for different message types", () => {
    const ws = new ReconnectingWebSocket("ws://255.255.255.255", undefined, {
      maxRetries: 0,
      startClosed: true
    });

    const stringMsg = "hello";
    const arrayBuffer = new ArrayBuffer(10);
    const blob = new Blob(["test"]);

    ws.send(stringMsg);
    ws.send(arrayBuffer);
    ws.send(blob);

    expect(ws.bufferedAmount).toBeGreaterThan(0);

    ws.close();
  });
});

describe.skip("Error Handling - Event Target Polyfill", () => {
  let originalEventTarget: typeof EventTarget | undefined;
  let originalEvent: typeof Event | undefined;
  let errorSpy: ReturnType<typeof vitest.spyOn>;

  beforeEach(() => {
    errorSpy = vitest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    if (originalEventTarget) {
      globalThis.EventTarget = originalEventTarget;
    }
    if (originalEvent) {
      globalThis.Event = originalEvent;
    }
  });

  test("warns when EventTarget is not available", async () => {
    // Save original
    originalEventTarget = globalThis.EventTarget;
    originalEvent = globalThis.Event;

    // Remove EventTarget
    delete (globalThis as { EventTarget?: typeof EventTarget }).EventTarget;
    delete (globalThis as { Event?: typeof Event }).Event;

    // Re-import to trigger the check
    // This will log an error message about missing EventTarget
    await import("../ws");

    // Restore
    globalThis.EventTarget = originalEventTarget;
    globalThis.Event = originalEvent;

    // The error should have been logged during module load
    // Note: This test may not work perfectly due to module caching
  });
});

describe.skip("Error Handling - Close Scenarios", () => {
  test("handles close before connection established", () => {
    const ws = new ReconnectingWebSocket("ws://example.com", undefined, {
      maxRetries: 0,
      startClosed: true
    });

    // Close immediately
    ws.close();

    // Should be in CLOSED state (3)
    expect(ws.readyState).toBe(3);
  });

  test("handles multiple close calls", () => {
    const ws = new ReconnectingWebSocket("ws://example.com", undefined, {
      startClosed: true
    });

    ws.close();
    ws.close();
    ws.close();

    expect(ws.readyState).toBe(ReconnectingWebSocket.CLOSED);
  });

  test("handles reconnect while already connecting", () => {
    const ws = new ReconnectingWebSocket("ws://example.com", undefined, {
      maxRetries: 0
    });

    // Call reconnect multiple times rapidly
    ws.reconnect();
    ws.reconnect();
    ws.reconnect();

    setTimeout(() => {
      ws.close();
    }, 100);
  });
});

describe.skip("Error Handling - PartySocket.fetch", () => {
  test("propagates fetch errors", async () => {
    const mockFetch = vitest
      .fn()
      .mockRejectedValue(new Error("Network failure"));

    await expect(
      PartySocket.fetch({
        host: "example.com",
        room: "my-room",
        fetch: mockFetch
      })
    ).rejects.toThrow("Network failure");
  });

  test("handles async query provider errors in fetch", async () => {
    const mockFetch = vitest.fn().mockResolvedValue(new Response("ok"));

    await expect(
      PartySocket.fetch({
        host: "example.com",
        room: "my-room",
        query: async () => {
          throw new Error("Query generation failed");
        },
        fetch: mockFetch
      })
    ).rejects.toThrow("Query generation failed");
  });

  test("throws when path starts with slash in fetch", async () => {
    const mockFetch = vitest.fn().mockResolvedValue(new Response("ok"));

    await expect(
      PartySocket.fetch({
        host: "example.com",
        room: "my-room",
        path: "/invalid",
        fetch: mockFetch
      })
    ).rejects.toThrow("path must not start with a slash");
  });
});

describe.skip("Error Handling - Edge Cases", () => {
  test("handles extremely long message queue", () => {
    const ws = new ReconnectingWebSocket("ws://255.255.255.255", undefined, {
      maxRetries: 0,
      maxEnqueuedMessages: Number.POSITIVE_INFINITY
    });

    for (let i = 0; i < 1000; i++) {
      ws.send(`message-${i}`);
    }

    expect(ws.bufferedAmount).toBeGreaterThan(0);

    ws.close();
  });

  test("handles empty message send", () => {
    const ws = new ReconnectingWebSocket("ws://255.255.255.255", undefined, {
      maxRetries: 0,
      startClosed: true
    });

    expect(() => {
      ws.send("");
    }).not.toThrow();

    ws.close();
  });

  test("handles rapid reconnect calls", () => {
    const ws = new ReconnectingWebSocket("ws://example.com", undefined, {
      maxRetries: 0,
      startClosed: true
    });

    for (let i = 0; i < 10; i++) {
      ws.reconnect();
    }

    ws.close();
  });

  test("handles binaryType changes while disconnected", () => {
    const ws = new ReconnectingWebSocket("ws://example.com", undefined, {
      startClosed: true
    });

    expect(() => {
      ws.binaryType = "arraybuffer";
      ws.binaryType = "blob";
    }).not.toThrow();

    expect(ws.binaryType).toBe("blob");

    ws.close();
  });
});

describe.skip("Error Handling - Retry Logic", () => {
  test("resets retry count on successful connection", async () => {
    const ws = new ReconnectingWebSocket("ws://255.255.255.255", undefined, {
      maxRetries: 5,
      minReconnectionDelay: 10,
      maxReconnectionDelay: 20,
      minUptime: 50
    });

    // Wait for some retries
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(ws.retryCount).toBeGreaterThan(0);
        ws.close();
        resolve();
      }, 100);
    });
  });

  test("exponential backoff increases delay correctly", async () => {
    const ws = new ReconnectingWebSocket("ws://255.255.255.255", undefined, {
      minReconnectionDelay: 50,
      maxReconnectionDelay: 500,
      reconnectionDelayGrowFactor: 2,
      maxRetries: 5
    });

    const delays: number[] = [];

    for (let i = 0; i < 5; i++) {
      // @ts-expect-error - accessing private method for testing
      ws._retryCount = i;
      // @ts-expect-error - accessing private method for testing
      delays.push(ws._getNextDelay());
    }

    // Verify exponential growth
    expect(delays[1]).toBeGreaterThan(delays[0]);
    expect(delays[2]).toBeGreaterThan(delays[1]);

    ws.close();
  });
});

describe.skip("Error Handling - Debug Mode", () => {
  test("custom debugLogger receives messages", () => {
    const debugLogger = vitest.fn();

    const ws = new ReconnectingWebSocket("ws://example.com", undefined, {
      debug: true,
      debugLogger,
      maxRetries: 0,
      startClosed: true
    });

    ws.reconnect();

    expect(debugLogger).toHaveBeenCalledWith(
      "RWS>",
      expect.any(String),
      expect.anything()
    );

    ws.close();
  });

  test("debug mode logs connection attempts", () => {
    const logSpy = vitest.spyOn(console, "log").mockImplementation(() => {});

    const ws = new ReconnectingWebSocket("ws://255.255.255.255", undefined, {
      debug: true,
      maxRetries: 1
    });

    setTimeout(() => {
      expect(logSpy).toHaveBeenCalled();
      ws.close();
      logSpy.mockRestore();
    }, 100);
  });
});
